#!/bin/bash
set -euo pipefail

echo "🚀 Building TWIST Browser Extension for all browsers"
echo "===================================================="

# Get version from manifest
VERSION=$(cat manifest.json | grep '"version"' | cut -d '"' -f 4)
echo "Version: $VERSION"

# Clean previous builds
echo -e "\n🧹 Cleaning previous builds..."
rm -rf dist/
mkdir -p dist

# Build for each browser
echo -e "\n📦 Building for Chrome/Edge..."
npm run build:chrome
if [ $? -eq 0 ]; then
  echo "✅ Chrome build successful"
  cd build/chrome && zip -r ../../dist/twist-chrome-${VERSION}.zip * && cd ../..
  echo "📦 Created dist/twist-chrome-${VERSION}.zip"
else
  echo "❌ Chrome build failed"
  exit 1
fi

echo -e "\n📦 Building for Firefox..."
npm run build:firefox
if [ $? -eq 0 ]; then
  echo "✅ Firefox build successful"
  cd build/firefox && zip -r ../../dist/twist-firefox-${VERSION}.zip * && cd ../..
  echo "📦 Created dist/twist-firefox-${VERSION}.zip"
else
  echo "❌ Firefox build failed"
  exit 1
fi

# Safari requires Xcode and is macOS only
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo -e "\n📦 Building for Safari..."
  npm run build:safari
  if [ $? -eq 0 ]; then
    echo "✅ Safari build successful"
    cd build/safari && zip -r ../../dist/twist-safari-${VERSION}.zip * && cd ../..
    echo "📦 Created dist/twist-safari-${VERSION}.zip"
    
    # Note about Safari
    echo -e "\n⚠️  Safari Note:"
    echo "Safari extensions require Xcode to build the final .app package."
    echo "Use the Safari web extension converter tool in Xcode with the build/safari directory."
  else
    echo "❌ Safari build failed"
  fi
else
  echo -e "\n⏭️  Skipping Safari build (macOS required)"
fi

# Create source code archive for store submissions
echo -e "\n📦 Creating source code archive..."
zip -r dist/twist-source-${VERSION}.zip . \
  -x "node_modules/*" \
  -x "build/*" \
  -x "dist/*" \
  -x ".git/*" \
  -x "*.log" \
  -x ".DS_Store"
echo "📦 Created dist/twist-source-${VERSION}.zip"

# Generate checksums
echo -e "\n🔐 Generating checksums..."
cd dist
shasum -a 256 *.zip > checksums.txt
cd ..

# Summary
echo -e "\n✅ Build complete!"
echo "===================================================="
echo "Distribution packages created in dist/"
ls -la dist/

echo -e "\n📋 Next steps:"
echo "1. Test each extension package"
echo "2. Submit to respective browser stores:"
echo "   - Chrome Web Store: https://chrome.google.com/webstore/developer/dashboard"
echo "   - Firefox Add-ons: https://addons.mozilla.org/developers/"
echo "   - Edge Add-ons: https://partner.microsoft.com/dashboard/microsoftedge/overview"
echo "   - Safari: Use Xcode to convert and submit to App Store Connect"