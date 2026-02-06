#!/bin/bash
set -e

echo "🔨 Building TWIST Token programs..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Anchor is installed
if ! command -v anchor &> /dev/null; then
    echo -e "${RED}Error: Anchor is not installed${NC}"
    echo "Please install Anchor: https://www.anchor-lang.com/docs/installation"
    exit 1
fi

# Check Anchor version
ANCHOR_VERSION=$(anchor --version | cut -d ' ' -f 2)
echo -e "${YELLOW}Using Anchor version: $ANCHOR_VERSION${NC}"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf target/deploy
rm -rf target/idl
rm -rf target/types

# Build all programs
echo "🏗️  Building programs..."

# Main token program
echo "  - Building twist-token..."
cd programs/twist-token
cargo build-sbf --release
cd ../..

# Staking program
echo "  - Building twist-staking..."
cd programs/staking
cargo build-sbf --release
cd ../..

# Treasury program
echo "  - Building twist-treasury..."
cd programs/treasury
cargo build-sbf --release
cd ../..

# Vesting program
echo "  - Building twist-vesting..."
cd programs/vesting
cargo build-sbf --release
cd ../..

# Bridge program
echo "  - Building twist-bridge..."
cd programs/bridge
cargo build-sbf --release
cd ../..

# Generate IDLs
echo "📄 Generating IDLs..."
anchor build --skip-build

# Verify builds
echo "✅ Verifying builds..."
for program in twist-token twist-staking twist-treasury twist-vesting twist-bridge; do
    if [ ! -f "target/deploy/${program}.so" ]; then
        echo -e "${RED}Error: ${program}.so not found${NC}"
        exit 1
    fi
    
    # Check program size
    SIZE=$(stat -f%z "target/deploy/${program}.so" 2>/dev/null || stat -c%s "target/deploy/${program}.so")
    MAX_SIZE=$((2 * 1024 * 1024)) # 2MB limit
    
    if [ $SIZE -gt $MAX_SIZE ]; then
        echo -e "${RED}Error: ${program}.so exceeds size limit (${SIZE} bytes)${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ ${program}: ${SIZE} bytes${NC}"
done

# Generate program keypairs if they don't exist
echo "🔑 Generating program keypairs..."
mkdir -p keys
for program in twist-token twist-staking twist-treasury twist-vesting twist-bridge; do
    if [ ! -f "keys/${program}-keypair.json" ]; then
        solana-keygen new -o "keys/${program}-keypair.json" --no-bip39-passphrase --force
        echo -e "${GREEN}✓ Generated keypair for ${program}${NC}"
    else
        echo -e "${YELLOW}  Keypair for ${program} already exists${NC}"
    fi
done

# Create deployment summary
echo "📊 Creating deployment summary..."
cat > target/deploy/deployment-summary.json << EOF
{
  "build_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "anchor_version": "$ANCHOR_VERSION",
  "programs": {
    "twist_token": {
      "file": "target/deploy/twist-token.so",
      "size": $(stat -f%z "target/deploy/twist-token.so" 2>/dev/null || stat -c%s "target/deploy/twist-token.so"),
      "keypair": "keys/twist-token-keypair.json"
    },
    "twist_staking": {
      "file": "target/deploy/twist-staking.so",
      "size": $(stat -f%z "target/deploy/twist-staking.so" 2>/dev/null || stat -c%s "target/deploy/twist-staking.so"),
      "keypair": "keys/twist-staking-keypair.json"
    },
    "twist_treasury": {
      "file": "target/deploy/twist-treasury.so",
      "size": $(stat -f%z "target/deploy/twist-treasury.so" 2>/dev/null || stat -c%s "target/deploy/twist-treasury.so"),
      "keypair": "keys/twist-treasury-keypair.json"
    },
    "twist_vesting": {
      "file": "target/deploy/twist-vesting.so",
      "size": $(stat -f%z "target/deploy/twist-vesting.so" 2>/dev/null || stat -c%s "target/deploy/twist-vesting.so"),
      "keypair": "keys/twist-vesting-keypair.json"
    },
    "twist_bridge": {
      "file": "target/deploy/twist-bridge.so",
      "size": $(stat -f%z "target/deploy/twist-bridge.so" 2>/dev/null || stat -c%s "target/deploy/twist-bridge.so"),
      "keypair": "keys/twist-bridge-keypair.json"
    }
  }
}
EOF

echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review the deployment summary in target/deploy/deployment-summary.json"
echo "  2. Run ./scripts/deploy/02-deploy-devnet.sh for devnet deployment"
echo "  3. Run ./scripts/deploy/06-deploy-mainnet.sh for mainnet deployment"