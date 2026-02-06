#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

logger.log('🧪 Testing TWIST Extension Cross-Browser Compatibility...\n');

const browsers = ['chrome', 'firefox'];
const results = {};

browsers.forEach(browser => {
  logger.log(`\n📦 Testing ${browser.toUpperCase()} Build:`);
  logger.log('='.repeat(50));
  
  const buildDir = path.join(__dirname, `build/${browser}`);
  
  if (!fs.existsSync(buildDir)) {
    console.error(`❌ Build directory not found for ${browser}`);
    results[browser] = false;
    return;
  }
  
  // Check manifest
  const manifestPath = path.join(buildDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ manifest.json not found for ${browser}`);
    results[browser] = false;
    return;
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  logger.log(`✅ Manifest found - Version ${manifest.manifest_version}`);
  
  // Browser-specific checks
  if (browser === 'chrome') {
    // Chrome/Edge uses Manifest V3
    if (manifest.manifest_version !== 3) {
      console.error('❌ Chrome should use Manifest V3');
      results[browser] = false;
      return;
    }
    
    // Check for service worker
    if (!manifest.background || !manifest.background.service_worker) {
      console.error('❌ Chrome manifest missing service worker');
      results[browser] = false;
      return;
    }
    logger.log('✅ Service worker configured');
    
    // Check for action API
    if (!manifest.action) {
      console.error('❌ Chrome manifest missing action API');
      results[browser] = false;
      return;
    }
    logger.log('✅ Action API configured');
    
  } else if (browser === 'firefox') {
    // Firefox uses Manifest V2
    if (manifest.manifest_version !== 2) {
      console.error('❌ Firefox should use Manifest V2');
      results[browser] = false;
      return;
    }
    
    // Check for background scripts
    if (!manifest.background || !manifest.background.scripts) {
      console.error('❌ Firefox manifest missing background scripts');
      results[browser] = false;
      return;
    }
    logger.log('✅ Background scripts configured');
    
    // Check for browser_action API
    if (!manifest.browser_action) {
      console.error('❌ Firefox manifest missing browser_action API');
      results[browser] = false;
      return;
    }
    logger.log('✅ Browser action configured');
    
    // Check for browser_specific_settings
    if (!manifest.browser_specific_settings || !manifest.browser_specific_settings.gecko) {
      console.error('❌ Firefox manifest missing gecko settings');
      results[browser] = false;
      return;
    }
    logger.log('✅ Gecko settings configured');
    
    // Check for background wrapper
    const wrapperPath = path.join(buildDir, 'background-wrapper.js');
    if (!fs.existsSync(wrapperPath)) {
      console.error('❌ Firefox background wrapper missing');
      results[browser] = false;
      return;
    }
    logger.log('✅ Background wrapper present');
  }
  
  // Check common files
  const requiredFiles = [
    'content/inject.js',
    'popup/index.html',
    'popup/popup.js',
    'options/index.html',
    'options/options.js',
    'inject/vau-detector.js'
  ];
  
  let allFilesExist = true;
  logger.log('\n📁 Checking required files:');
  requiredFiles.forEach(file => {
    const filePath = path.join(buildDir, file);
    if (fs.existsSync(filePath)) {
      logger.log(`   ✅ ${file}`);
    } else {
      logger.log(`   ❌ ${file} - NOT FOUND`);
      allFilesExist = false;
    }
  });
  
  results[browser] = allFilesExist;
  
  if (results[browser]) {
    logger.log(`\n✅ ${browser.toUpperCase()} build is valid!`);
  } else {
    logger.log(`\n❌ ${browser.toUpperCase()} build has issues!`);
  }
});

// Summary
logger.log('\n\n📊 Cross-Browser Compatibility Summary:');
logger.log('='.repeat(50));

Object.entries(results).forEach(([browser, success]) => {
  logger.log(`${browser.toUpperCase()}: ${success ? '✅ PASS' : '❌ FAIL'}`);
});

// Test browser compatibility layer
logger.log('\n\n🔧 Testing Browser Compatibility Layer:');
logger.log('='.repeat(50));

const compatPath = path.join(__dirname, 'src/utils/browser-compat.ts');
if (fs.existsSync(compatPath)) {
  logger.log('✅ Browser compatibility layer exists');
  
  const compatContent = fs.readFileSync(compatPath, 'utf8');
  
  // Check for key browser APIs
  const apis = [
    'chrome.action',
    'chrome.browserAction',
    'chrome.scripting',
    'chrome.storage',
    'browser.runtime'
  ];
  
  apis.forEach(api => {
    if (compatContent.includes(api)) {
      logger.log(`   ✅ Handles ${api}`);
    }
  });
  
  // Check for browser detection
  if (compatContent.includes('detectBrowser')) {
    logger.log('   ✅ Browser detection implemented');
  }
  
  // Check for polyfills
  if (compatContent.includes('Polyfill') || compatContent.includes('polyfill')) {
    logger.log('   ✅ Polyfills implemented');
  }
} else {
  logger.log('❌ Browser compatibility layer not found');
}

// Installation instructions
logger.log('\n\n📦 Installation Instructions:');
logger.log('='.repeat(50));

logger.log('\nChrome/Edge:');
logger.log('1. Go to chrome://extensions');
logger.log('2. Enable Developer mode');
logger.log('3. Click "Load unpacked"');
logger.log('4. Select build/chrome directory');

logger.log('\nFirefox:');
logger.log('1. Go to about:debugging');
logger.log('2. Click "This Firefox"');
logger.log('3. Click "Load Temporary Add-on"');
logger.log('4. Select build/firefox/manifest.json');

logger.log('\n✨ Cross-browser testing complete!');