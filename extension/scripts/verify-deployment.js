#!/usr/bin/env node

/**
 * TWIST Extension Deployment Verification Script
 * Verifies that extensions are properly deployed and accessible in stores
 */

const fetch = require('node-fetch');
const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const semver = require('semver');

// Chrome Web Store Verification
class ChromeVerification {
  constructor(extensionId, expectedVersion) {
    this.extensionId = extensionId;
    this.expectedVersion = expectedVersion;
    this.storeUrl = `https://chrome.google.com/webstore/detail/${extensionId}`;
  }

  async verify() {
    const spinner = ora('Verifying Chrome Web Store deployment...').start();
    
    try {
      // Fetch extension page
      spinner.text = 'Fetching extension details...';
      const response = await fetch(this.storeUrl);
      
      if (!response.ok) {
        throw new Error(`Extension not found in Chrome Web Store (${response.status})`);
      }

      const html = await response.text();
      
      // Extract version from page
      const versionMatch = html.match(/"version":"([^"]+)"/);
      if (!versionMatch) {
        throw new Error('Could not extract version from store page');
      }

      const storeVersion = versionMatch[1];
      spinner.text = `Found version ${storeVersion} in store`;

      // Compare versions
      if (this.expectedVersion && !semver.eq(storeVersion, this.expectedVersion)) {
        throw new Error(`Version mismatch: expected ${this.expectedVersion}, found ${storeVersion}`);
      }

      // Check if extension is available
      if (html.includes('This item is not available')) {
        throw new Error('Extension is not available in store');
      }

      spinner.succeed(`Chrome Web Store: ✓ Version ${storeVersion} is live`);
      
      return {
        success: true,
        version: storeVersion,
        url: this.storeUrl
      };
    } catch (error) {
      spinner.fail('Chrome verification failed');
      throw error;
    }
  }
}

// Firefox Add-ons Verification
class FirefoxVerification {
  constructor(addonId, expectedVersion) {
    this.addonId = addonId;
    this.expectedVersion = expectedVersion;
    this.apiUrl = `https://addons.mozilla.org/api/v5/addons/addon/${addonId}/`;
  }

  async verify() {
    const spinner = ora('Verifying Firefox Add-ons deployment...').start();
    
    try {
      spinner.text = 'Fetching add-on details...';
      const response = await fetch(this.apiUrl);
      
      if (!response.ok) {
        throw new Error(`Add-on not found in Firefox Add-ons (${response.status})`);
      }

      const data = await response.json();
      const currentVersion = data.current_version;
      
      if (!currentVersion) {
        throw new Error('No version information available');
      }

      spinner.text = `Found version ${currentVersion.version} in store`;

      // Check version
      if (this.expectedVersion && !semver.eq(currentVersion.version, this.expectedVersion)) {
        throw new Error(`Version mismatch: expected ${this.expectedVersion}, found ${currentVersion.version}`);
      }

      // Check if add-on is public
      if (data.status !== 'public') {
        throw new Error(`Add-on status is ${data.status}, not public`);
      }

      spinner.succeed(`Firefox Add-ons: ✓ Version ${currentVersion.version} is live`);
      
      return {
        success: true,
        version: currentVersion.version,
        url: data.url,
        downloads: data.weekly_downloads
      };
    } catch (error) {
      spinner.fail('Firefox verification failed');
      throw error;
    }
  }
}

// Edge Add-ons Verification
class EdgeVerification {
  constructor(productId, expectedVersion) {
    this.productId = productId;
    this.expectedVersion = expectedVersion;
    this.storeUrl = `https://microsoftedge.microsoft.com/addons/detail/${productId}`;
  }

  async verify() {
    const spinner = ora('Verifying Edge Add-ons deployment...').start();
    
    try {
      spinner.text = 'Fetching extension details...';
      const response = await fetch(this.storeUrl);
      
      if (!response.ok) {
        throw new Error(`Extension not found in Edge Add-ons (${response.status})`);
      }

      const html = await response.text();
      
      // Extract version from page
      const versionMatch = html.match(/"version"\s*:\s*"([^"]+)"/);
      if (!versionMatch) {
        throw new Error('Could not extract version from store page');
      }

      const storeVersion = versionMatch[1];
      spinner.text = `Found version ${storeVersion} in store`;

      // Compare versions
      if (this.expectedVersion && !semver.eq(storeVersion, this.expectedVersion)) {
        throw new Error(`Version mismatch: expected ${this.expectedVersion}, found ${storeVersion}`);
      }

      spinner.succeed(`Edge Add-ons: ✓ Version ${storeVersion} is live`);
      
      return {
        success: true,
        version: storeVersion,
        url: this.storeUrl
      };
    } catch (error) {
      spinner.fail('Edge verification failed');
      throw error;
    }
  }
}

// Smoke Tests
class SmokeTests {
  async runAPIHealthCheck() {
    const endpoints = [
      'https://api.twist.io/health',
      'https://vau.twist.io/health',
      'https://wallet.twist.io/health'
    ];

    const spinner = ora('Running API health checks...').start();
    
    try {
      const results = await Promise.allSettled(
        endpoints.map(async (endpoint) => {
          const response = await fetch(endpoint);
          return {
            endpoint,
            status: response.status,
            ok: response.ok
          };
        })
      );

      const failed = results.filter(r => r.status === 'rejected' || !r.value.ok);
      
      if (failed.length > 0) {
        throw new Error(`${failed.length} API endpoints are unhealthy`);
      }

      spinner.succeed('API health checks: ✓ All systems operational');
      return true;
    } catch (error) {
      spinner.fail('API health check failed');
      throw error;
    }
  }

  async checkErrorRates(sentryProject, authToken) {
    const spinner = ora('Checking error rates...').start();
    
    try {
      const response = await fetch(
        `https://sentry.io/api/0/projects/twist/${sentryProject}/issues/`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch error data from Sentry');
      }

      const issues = await response.json();
      const criticalIssues = issues.filter(i => i.level === 'error' || i.level === 'fatal');
      
      if (criticalIssues.length > 0) {
        throw new Error(`Found ${criticalIssues.length} critical issues in production`);
      }

      spinner.succeed('Error monitoring: ✓ No critical issues detected');
      return true;
    } catch (error) {
      spinner.fail('Error monitoring check failed');
      throw error;
    }
  }
}

// Main CLI
program
  .name('verify-deployment')
  .description('Verify TWIST extension deployments')
  .version('1.0.0');

// Chrome verification command
program
  .command('chrome')
  .description('Verify Chrome Web Store deployment')
  .requiredOption('--extension-id <id>', 'Chrome extension ID')
  .option('--expected-version <version>', 'Expected version number')
  .action(async (options) => {
    try {
      const verifier = new ChromeVerification(options.extensionId, options.expectedVersion);
      const result = await verifier.verify();
      logger.log(chalk.green('✅ Chrome deployment verified successfully'));
      logger.log(chalk.gray(`   URL: ${result.url}`));
    } catch (error) {
      console.error(chalk.red('❌ Chrome verification failed:'), error.message);
      process.exit(1);
    }
  });

// Firefox verification command
program
  .command('firefox')
  .description('Verify Firefox Add-ons deployment')
  .requiredOption('--addon-id <id>', 'Firefox add-on ID')
  .option('--expected-version <version>', 'Expected version number')
  .action(async (options) => {
    try {
      const verifier = new FirefoxVerification(options.addonId, options.expectedVersion);
      const result = await verifier.verify();
      logger.log(chalk.green('✅ Firefox deployment verified successfully'));
      logger.log(chalk.gray(`   URL: ${result.url}`));
      logger.log(chalk.gray(`   Weekly downloads: ${result.downloads}`));
    } catch (error) {
      console.error(chalk.red('❌ Firefox verification failed:'), error.message);
      process.exit(1);
    }
  });

// Edge verification command
program
  .command('edge')
  .description('Verify Edge Add-ons deployment')
  .requiredOption('--product-id <id>', 'Edge product ID')
  .option('--expected-version <version>', 'Expected version number')
  .action(async (options) => {
    try {
      const verifier = new EdgeVerification(options.productId, options.expectedVersion);
      const result = await verifier.verify();
      logger.log(chalk.green('✅ Edge deployment verified successfully'));
      logger.log(chalk.gray(`   URL: ${result.url}`));
    } catch (error) {
      console.error(chalk.red('❌ Edge verification failed:'), error.message);
      process.exit(1);
    }
  });

// Smoke test command
program
  .command('smoke')
  .description('Run smoke tests after deployment')
  .option('--sentry-project <project>', 'Sentry project slug')
  .option('--sentry-token <token>', 'Sentry auth token')
  .action(async (options) => {
    try {
      const tester = new SmokeTests();
      
      logger.log(chalk.blue('🔥 Running smoke tests...'));
      
      // Run API health checks
      await tester.runAPIHealthCheck();
      
      // Check error rates if Sentry is configured
      if (options.sentryProject && options.sentryToken) {
        await tester.checkErrorRates(options.sentryProject, options.sentryToken);
      }
      
      logger.log(chalk.green('✅ All smoke tests passed!'));
    } catch (error) {
      console.error(chalk.red('❌ Smoke tests failed:'), error.message);
      process.exit(1);
    }
  });

// Verify all command
program
  .command('all')
  .description('Verify all store deployments')
  .requiredOption('--chrome-id <id>', 'Chrome extension ID')
  .requiredOption('--firefox-id <id>', 'Firefox add-on ID')
  .requiredOption('--edge-id <id>', 'Edge product ID')
  .option('--expected-version <version>', 'Expected version for all stores')
  .action(async (options) => {
    try {
      logger.log(chalk.blue('🔍 Verifying all store deployments...'));
      
      const results = await Promise.allSettled([
        new ChromeVerification(options.chromeId, options.expectedVersion).verify(),
        new FirefoxVerification(options.firefoxId, options.expectedVersion).verify(),
        new EdgeVerification(options.edgeId, options.expectedVersion).verify()
      ]);
      
      let allSuccess = true;
      
      results.forEach((result, index) => {
        const stores = ['Chrome', 'Firefox', 'Edge'];
        if (result.status === 'rejected') {
          logger.log(chalk.red(`❌ ${stores[index]}: ${result.reason.message}`));
          allSuccess = false;
        }
      });
      
      if (allSuccess) {
        logger.log(chalk.green('\n✅ All deployments verified successfully!'));
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('❌ Verification failed:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);