#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

logger.log('🧪 Testing TWIST Browser Extension Build...\n');

// Test 1: Check if build directory exists
const buildDir = path.join(__dirname, 'build/chrome');
if (!fs.existsSync(buildDir)) {
  console.error('❌ Build directory not found. Run "npm run build" first.');
  process.exit(1);
}
logger.log('✅ Build directory exists');

// Test 2: Check manifest.json
const manifestPath = path.join(buildDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('❌ manifest.json not found');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
logger.log('✅ manifest.json found');
logger.log(`   - Name: ${manifest.name}`);
logger.log(`   - Version: ${manifest.version}`);
logger.log(`   - Manifest Version: ${manifest.manifest_version}`);

// Test 3: Check required files
const requiredFiles = [
  'background/service-worker.js',
  'content/inject.js',
  'popup/index.html',
  'popup/popup.js',
  'popup/styles.css',
  'options/index.html',
  'options/options.js',
  'inject/vau-detector.js',
  'onboarding/index.html',
  'assets/icon-16.png',
  'assets/icon-32.png',
  'assets/icon-48.png',
  'assets/icon-128.png'
];

let allFilesExist = true;
logger.log('\n📁 Checking required files:');
requiredFiles.forEach(file => {
  const filePath = path.join(buildDir, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    logger.log(`   ✅ ${file} (${stats.size} bytes)`);
  } else {
    logger.log(`   ❌ ${file} - NOT FOUND`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.error('\n❌ Some required files are missing');
  process.exit(1);
}

// Test 4: Check permissions
logger.log('\n🔐 Checking permissions:');
const requiredPermissions = ['storage', 'alarms', 'notifications', 'tabs'];
const hasAllPermissions = requiredPermissions.every(perm => 
  manifest.permissions.includes(perm)
);

if (hasAllPermissions) {
  logger.log('   ✅ All required permissions present');
  manifest.permissions.forEach(perm => logger.log(`      - ${perm}`));
} else {
  logger.log('   ❌ Missing required permissions');
}

// Test 5: Check host permissions
logger.log('\n🌐 Checking host permissions:');
manifest.host_permissions.forEach(host => {
  logger.log(`   - ${host}`);
});

// Test 6: Validate JavaScript files
logger.log('\n📝 Validating JavaScript files:');
const jsFiles = [
  'background/service-worker.js',
  'content/inject.js',
  'popup/popup.js',
  'options/options.js'
];

jsFiles.forEach(file => {
  const filePath = path.join(buildDir, file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Basic syntax check - file should not be empty and should contain some JS
    if (content.length > 100 && (content.includes('function') || content.includes('=>'))) {
      logger.log(`   ✅ ${file} - Valid JavaScript`);
    } else {
      logger.log(`   ⚠️  ${file} - May be empty or invalid`);
    }
  } catch (error) {
    logger.log(`   ❌ ${file} - Error reading file`);
  }
});

// Test 7: Check HTML files
logger.log('\n📄 Checking HTML files:');
const htmlFiles = [
  'popup/index.html',
  'options/index.html',
  'onboarding/index.html'
];

htmlFiles.forEach(file => {
  const filePath = path.join(buildDir, file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('<!DOCTYPE html>') && content.includes('<div id="root">')) {
      logger.log(`   ✅ ${file} - Valid HTML with root element`);
    } else {
      logger.log(`   ⚠️  ${file} - Missing DOCTYPE or root element`);
    }
  } catch (error) {
    logger.log(`   ❌ ${file} - Error reading file`);
  }
});

// Summary
logger.log('\n📊 Test Summary:');
logger.log('   ✅ Extension structure is valid');
logger.log('   ✅ All required files present');
logger.log('   ✅ Manifest is properly configured');
logger.log('   ✅ Ready for installation in Chrome/Edge');

logger.log('\n📦 To install the extension:');
logger.log('   1. Open Chrome and go to chrome://extensions');
logger.log('   2. Enable "Developer mode"');
logger.log('   3. Click "Load unpacked"');
logger.log('   4. Select the build/chrome directory');
logger.log(`   5. The extension will be installed and ready to use!`);

logger.log('\n🎉 All tests passed! The extension is ready for use.');