#!/bin/bash
set -e

echo "🚀 Deploying TWIST Token to Devnet..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if on devnet
CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')
if [[ ! "$CLUSTER" =~ "devnet" ]]; then
    echo -e "${RED}Error: Not connected to devnet${NC}"
    echo "Current cluster: $CLUSTER"
    echo "Please run: solana config set --url https://api.devnet.solana.com"
    exit 1
fi

# Check wallet balance
WALLET=$(solana address)
BALANCE=$(solana balance | awk '{print $1}')
echo -e "${YELLOW}Deploying from wallet: $WALLET${NC}"
echo -e "${YELLOW}Balance: $BALANCE SOL${NC}"

if (( $(echo "$BALANCE < 5" | bc -l) )); then
    echo -e "${RED}Error: Insufficient balance. Need at least 5 SOL${NC}"
    echo "Run: solana airdrop 5"
    exit 1
fi

# Deploy programs
echo "📦 Deploying programs..."

# Function to deploy a program
deploy_program() {
    local PROGRAM_NAME=$1
    local PROGRAM_SO="target/deploy/${PROGRAM_NAME}.so"
    local PROGRAM_KEYPAIR="keys/${PROGRAM_NAME}-keypair.json"
    
    echo -e "${YELLOW}Deploying ${PROGRAM_NAME}...${NC}"
    
    # Check if program exists
    if [ ! -f "$PROGRAM_SO" ]; then
        echo -e "${RED}Error: ${PROGRAM_SO} not found. Run build script first.${NC}"
        exit 1
    fi
    
    # Deploy with retries
    MAX_RETRIES=3
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if solana program deploy "$PROGRAM_SO" --program-id "$PROGRAM_KEYPAIR" \
            --upgrade-authority "$WALLET" \
            --max-len $((2 * 1024 * 1024)); then
            echo -e "${GREEN}✓ ${PROGRAM_NAME} deployed successfully${NC}"
            
            # Get and display program ID
            PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
            echo "  Program ID: $PROGRAM_ID"
            break
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
                echo -e "${RED}Failed to deploy ${PROGRAM_NAME} after $MAX_RETRIES attempts${NC}"
                exit 1
            fi
            echo -e "${YELLOW}Retrying deployment... (${RETRY_COUNT}/${MAX_RETRIES})${NC}"
            sleep 5
        fi
    done
}

# Deploy all programs
deploy_program "twist-token"
deploy_program "twist-staking"
deploy_program "twist-treasury"
deploy_program "twist-vesting"
deploy_program "twist-bridge"

# Save deployed program IDs
echo "💾 Saving deployment info..."
cat > deployments/devnet.json << EOF
{
  "cluster": "devnet",
  "deployment_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "deployer": "$WALLET",
  "programs": {
    "twist_token": "$(solana-keygen pubkey keys/twist-token-keypair.json)",
    "twist_staking": "$(solana-keygen pubkey keys/twist-staking-keypair.json)",
    "twist_treasury": "$(solana-keygen pubkey keys/twist-treasury-keypair.json)",
    "twist_vesting": "$(solana-keygen pubkey keys/twist-vesting-keypair.json)",
    "twist_bridge": "$(solana-keygen pubkey keys/twist-bridge-keypair.json)"
  }
}
EOF

echo -e "${GREEN}✅ Devnet deployment completed!${NC}"
echo ""
echo "Program IDs:"
echo "  twist-token:    $(solana-keygen pubkey keys/twist-token-keypair.json)"
echo "  twist-staking:  $(solana-keygen pubkey keys/twist-staking-keypair.json)"
echo "  twist-treasury: $(solana-keygen pubkey keys/twist-treasury-keypair.json)"
echo "  twist-vesting:  $(solana-keygen pubkey keys/twist-vesting-keypair.json)"
echo "  twist-bridge:   $(solana-keygen pubkey keys/twist-bridge-keypair.json)"
echo ""
echo "Next steps:"
echo "  1. Run ./scripts/deploy/03-initialize.ts to initialize the programs"
echo "  2. Run ./scripts/deploy/04-create-liquidity.ts to create liquidity pools"
echo "  3. Run tests with: anchor test --provider.cluster devnet"