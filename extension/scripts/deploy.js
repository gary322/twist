#!/usr/bin/env node

/**
 * TWIST Extension Deployment Script
 * Handles deployment to Chrome Web Store, Firefox Add-ons, and Edge Add-ons
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');

// Chrome Web Store Deployment
class ChromeDeployment {
  constructor(options) {
    this.extensionId = options.extensionId;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.refreshToken = options.refreshToken;
    this.filePath = options.file;
  }

  async getAccessToken() {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Failed to get access token: ${data.error_description}`);
    }
    return data.access_token;
  }

  async upload(accessToken) {
    const form = new FormData();
    form.append('file', fs.createReadStream(this.filePath));

    const response = await fetch(
      `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${this.extensionId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...form.getHeaders()
        },
        body: form
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Upload failed: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async publish(accessToken) {
    const response = await fetch(
      `https://www.googleapis.com/chromewebstore/v1.1/items/${this.extensionId}/publish`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Publish failed: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async deploy() {
    const spinner = ora('Deploying to Chrome Web Store...').start();
    
    try {
      spinner.text = 'Getting access token...';
      const accessToken = await this.getAccessToken();
      
      spinner.text = 'Uploading extension...';
      const uploadResult = await this.upload(accessToken);
      logger.log(chalk.green('✓ Upload successful'), uploadResult);
      
      spinner.text = 'Publishing extension...';
      const publishResult = await this.publish(accessToken);
      
      spinner.succeed('Chrome Web Store deployment complete!');
      return publishResult;
    } catch (error) {
      spinner.fail('Chrome deployment failed');
      throw error;
    }
  }
}

// Firefox Add-ons Deployment
class FirefoxDeployment {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.addonId = options.addonId;
    this.filePath = options.file;
  }

  async signAddon() {
    const jwt = require('jsonwebtoken');
    
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.apiKey,
      jti: Math.random().toString(),
      iat: issuedAt,
      exp: issuedAt + 60
    };

    const token = jwt.sign(payload, this.apiSecret, { algorithm: 'HS256' });
    
    const form = new FormData();
    form.append('upload', fs.createReadStream(this.filePath));
    form.append('channel', 'listed');

    const response = await fetch(
      `https://addons.mozilla.org/api/v5/addons/${this.addonId}/versions/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `JWT ${token}`,
          ...form.getHeaders()
        },
        body: form
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Firefox deployment failed: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async deploy() {
    const spinner = ora('Deploying to Firefox Add-ons...').start();
    
    try {
      spinner.text = 'Signing and uploading add-on...';
      const result = await this.signAddon();
      
      spinner.succeed('Firefox Add-ons deployment complete!');
      return result;
    } catch (error) {
      spinner.fail('Firefox deployment failed');
      throw error;
    }
  }
}

// Edge Add-ons Deployment
class EdgeDeployment {
  constructor(options) {
    this.productId = options.productId;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.accessTokenUrl = options.accessTokenUrl;
    this.filePath = options.file;
  }

  async getAccessToken() {
    const response = await fetch(this.accessTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        scope: 'https://api.addons.microsoftedge.microsoft.com/.default'
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Failed to get Edge access token: ${data.error_description}`);
    }
    return data.access_token;
  }

  async upload(accessToken) {
    const form = new FormData();
    form.append('file', fs.createReadStream(this.filePath));

    const response = await fetch(
      `https://api.addons.microsoftedge.microsoft.com/v1/products/${this.productId}/submissions/draft/package`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...form.getHeaders()
        },
        body: form
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Edge upload failed: ${error}`);
    }
    return response.json();
  }

  async publish(accessToken) {
    const response = await fetch(
      `https://api.addons.microsoftedge.microsoft.com/v1/products/${this.productId}/submissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: 'Automated deployment' })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Edge publish failed: ${error}`);
    }
    return response.json();
  }

  async deploy() {
    const spinner = ora('Deploying to Edge Add-ons...').start();
    
    try {
      spinner.text = 'Getting access token...';
      const accessToken = await this.getAccessToken();
      
      spinner.text = 'Uploading extension...';
      await this.upload(accessToken);
      
      spinner.text = 'Publishing extension...';
      const result = await this.publish(accessToken);
      
      spinner.succeed('Edge Add-ons deployment complete!');
      return result;
    } catch (error) {
      spinner.fail('Edge deployment failed');
      throw error;
    }
  }
}

// Main CLI
program
  .name('deploy-extension')
  .description('Deploy TWIST extension to browser stores')
  .version('1.0.0');

// Chrome deployment command
program
  .command('chrome')
  .description('Deploy to Chrome Web Store')
  .requiredOption('--extension-id <id>', 'Chrome extension ID')
  .requiredOption('--client-id <id>', 'OAuth client ID')
  .requiredOption('--client-secret <secret>', 'OAuth client secret')
  .requiredOption('--refresh-token <token>', 'OAuth refresh token')
  .requiredOption('--file <path>', 'Path to extension ZIP file')
  .action(async (options) => {
    try {
      const deployment = new ChromeDeployment(options);
      await deployment.deploy();
      logger.log(chalk.green('✅ Chrome deployment successful!'));
    } catch (error) {
      console.error(chalk.red('❌ Chrome deployment failed:'), error.message);
      process.exit(1);
    }
  });

// Firefox deployment command
program
  .command('firefox')
  .description('Deploy to Firefox Add-ons')
  .requiredOption('--api-key <key>', 'Firefox API key')
  .requiredOption('--api-secret <secret>', 'Firefox API secret')
  .requiredOption('--addon-id <id>', 'Firefox add-on ID')
  .requiredOption('--file <path>', 'Path to extension ZIP file')
  .action(async (options) => {
    try {
      const deployment = new FirefoxDeployment(options);
      await deployment.deploy();
      logger.log(chalk.green('✅ Firefox deployment successful!'));
    } catch (error) {
      console.error(chalk.red('❌ Firefox deployment failed:'), error.message);
      process.exit(1);
    }
  });

// Edge deployment command
program
  .command('edge')
  .description('Deploy to Edge Add-ons')
  .requiredOption('--product-id <id>', 'Edge product ID')
  .requiredOption('--client-id <id>', 'Azure AD client ID')
  .requiredOption('--client-secret <secret>', 'Azure AD client secret')
  .requiredOption('--access-token-url <url>', 'Azure AD token URL')
  .requiredOption('--file <path>', 'Path to extension ZIP file')
  .action(async (options) => {
    try {
      const deployment = new EdgeDeployment(options);
      await deployment.deploy();
      logger.log(chalk.green('✅ Edge deployment successful!'));
    } catch (error) {
      console.error(chalk.red('❌ Edge deployment failed:'), error.message);
      process.exit(1);
    }
  });

// Deploy all command
program
  .command('all')
  .description('Deploy to all browser stores')
  .requiredOption('--config <path>', 'Path to deployment config file')
  .action(async (options) => {
    try {
      const config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
      
      logger.log(chalk.blue('🚀 Starting multi-store deployment...'));
      
      // Deploy to each store
      const results = await Promise.allSettled([
        config.chrome ? new ChromeDeployment(config.chrome).deploy() : Promise.resolve('Skipped'),
        config.firefox ? new FirefoxDeployment(config.firefox).deploy() : Promise.resolve('Skipped'),
        config.edge ? new EdgeDeployment(config.edge).deploy() : Promise.resolve('Skipped')
      ]);
      
      // Report results
      const stores = ['Chrome', 'Firefox', 'Edge'];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          logger.log(chalk.green(`✅ ${stores[index]}: Success`));
        } else {
          logger.log(chalk.red(`❌ ${stores[index]}: Failed - ${result.reason.message}`));
        }
      });
      
      const allSuccessful = results.every(r => r.status === 'fulfilled');
      if (!allSuccessful) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('❌ Deployment failed:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);