#!/bin/bash
set -e

echo "🚀 MAINNET DEPLOYMENT - TWIST Token"
echo "⚠️  WARNING: This is a PRODUCTION deployment!"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Safety checks
read -p "Are you sure you want to deploy to MAINNET? (type 'DEPLOY TO MAINNET' to confirm): " CONFIRM
if [ "$CONFIRM" != "DEPLOY TO MAINNET" ]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
fi

# Pre-deployment checklist
echo -e "\n${BLUE}📋 Pre-deployment Checklist:${NC}"
echo ""

CHECKLIST=(
    "Security audit completed and passed"
    "All tests passing on devnet"
    "Multi-sig wallet configured"
    "Initial liquidity funds ready (minimum $40k)"
    "Oracle price feeds verified"
    "Emergency response team on standby"
    "Monitoring systems operational"
    "Legal compliance verified"
    "Community announcement prepared"
)

for i in "${!CHECKLIST[@]}"; do
    read -p "$((i+1)). ${CHECKLIST[$i]} [y/N]: " CONFIRMED
    if [ "$CONFIRMED" != "y" ] && [ "$CONFIRMED" != "Y" ]; then
        echo -e "${RED}Please complete all checklist items before deployment${NC}"
        exit 1
    fi
done

echo -e "\n${GREEN}✅ All checklist items confirmed${NC}\n"

# Check cluster
CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')
if [[ ! "$CLUSTER" =~ "mainnet" ]]; then
    echo -e "${RED}Error: Not connected to mainnet${NC}"
    echo "Current cluster: $CLUSTER"
    echo "Please run: solana config set --url https://api.mainnet-beta.solana.com"
    exit 1
fi

# Check wallet
WALLET=$(solana address)
BALANCE=$(solana balance | awk '{print $1}')
echo -e "${YELLOW}Deploying from wallet: $WALLET${NC}"
echo -e "${YELLOW}Balance: $BALANCE SOL${NC}"

if (( $(echo "$BALANCE < 10" | bc -l) )); then
    echo -e "${RED}Error: Insufficient balance. Need at least 10 SOL for deployment${NC}"
    exit 1
fi

# Load multi-sig configuration
if [ ! -f "config/mainnet-multisig.json" ]; then
    echo -e "${RED}Error: Multi-sig configuration not found${NC}"
    echo "Please create config/mainnet-multisig.json with multi-sig members"
    exit 1
fi

# Final confirmation with delay
echo -e "\n${RED}⚠️  FINAL WARNING ⚠️${NC}"
echo "You are about to deploy to MAINNET with real funds."
echo "This action cannot be undone."
echo ""
echo "Deployment will begin in 10 seconds..."
echo "Press Ctrl+C to cancel"

for i in {10..1}; do
    echo -ne "\r${RED}Starting in $i seconds...${NC}"
    sleep 1
done
echo ""

# Create deployment directory
DEPLOYMENT_ID=$(date +%Y%m%d_%H%M%S)
DEPLOYMENT_DIR="deployments/mainnet_${DEPLOYMENT_ID}"
mkdir -p "$DEPLOYMENT_DIR"

echo -e "\n${BLUE}📁 Deployment ID: ${DEPLOYMENT_ID}${NC}"

# Deploy programs with enhanced logging
deploy_program_mainnet() {
    local PROGRAM_NAME=$1
    local PROGRAM_SO="target/deploy/${PROGRAM_NAME}.so"
    local PROGRAM_KEYPAIR="keys/${PROGRAM_NAME}-keypair.json"
    
    echo -e "\n${YELLOW}Deploying ${PROGRAM_NAME} to MAINNET...${NC}"
    
    # Verify program
    if [ ! -f "$PROGRAM_SO" ]; then
        echo -e "${RED}Error: ${PROGRAM_SO} not found${NC}"
        exit 1
    fi
    
    # Log deployment attempt
    echo "$(date): Deploying ${PROGRAM_NAME}" >> "$DEPLOYMENT_DIR/deployment.log"
    
    # Deploy with buffer account for safety
    echo "Creating buffer account..."
    BUFFER=$(solana program write-buffer "$PROGRAM_SO" --output json | jq -r '.buffer')
    echo "Buffer account: $BUFFER"
    
    # Set buffer authority to multi-sig
    MULTISIG_ADDRESS=$(jq -r '.address' config/mainnet-multisig.json)
    solana program set-buffer-authority "$BUFFER" --new-buffer-authority "$MULTISIG_ADDRESS"
    
    # Deploy program
    if solana program deploy \
        --buffer "$BUFFER" \
        --program-id "$PROGRAM_KEYPAIR" \
        --upgrade-authority "$MULTISIG_ADDRESS"; then
        
        PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
        echo -e "${GREEN}✓ ${PROGRAM_NAME} deployed: ${PROGRAM_ID}${NC}"
        echo "$(date): ${PROGRAM_NAME} deployed: ${PROGRAM_ID}" >> "$DEPLOYMENT_DIR/deployment.log"
        
        # Verify deployment
        solana program show "$PROGRAM_ID" > "$DEPLOYMENT_DIR/${PROGRAM_NAME}_info.txt"
    else
        echo -e "${RED}Failed to deploy ${PROGRAM_NAME}${NC}"
        echo "$(date): FAILED - ${PROGRAM_NAME}" >> "$DEPLOYMENT_DIR/deployment.log"
        exit 1
    fi
}

# Deploy all programs
echo -e "\n${BLUE}🚀 Starting mainnet deployment...${NC}"

deploy_program_mainnet "twist-token"
deploy_program_mainnet "twist-staking"
deploy_program_mainnet "twist-treasury"
deploy_program_mainnet "twist-vesting"
deploy_program_mainnet "twist-bridge"

# Save deployment manifest
cat > "$DEPLOYMENT_DIR/manifest.json" << EOF
{
  "deployment_id": "$DEPLOYMENT_ID",
  "network": "mainnet-beta",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "deployer": "$WALLET",
  "multisig": "$MULTISIG_ADDRESS",
  "programs": {
    "twist_token": "$(solana-keygen pubkey keys/twist-token-keypair.json)",
    "twist_staking": "$(solana-keygen pubkey keys/twist-staking-keypair.json)",
    "twist_treasury": "$(solana-keygen pubkey keys/twist-treasury-keypair.json)",
    "twist_vesting": "$(solana-keygen pubkey keys/twist-vesting-keypair.json)",
    "twist_bridge": "$(solana-keygen pubkey keys/twist-bridge-keypair.json)"
  },
  "verification": {
    "git_commit": "$(git rev-parse HEAD)",
    "build_hash": "$(sha256sum target/deploy/*.so | sha256sum | cut -d' ' -f1)"
  }
}
EOF

# Create initialization script
cat > "$DEPLOYMENT_DIR/initialize.sh" << 'EOF'
#!/bin/bash
# MAINNET Initialization Script
# Run this after all multi-sig members have verified the deployment

echo "🔧 Initializing TWIST Token on Mainnet..."

# Load deployment manifest
MANIFEST=$(cat manifest.json)
PROGRAM_ID=$(echo $MANIFEST | jq -r '.programs.twist_token')

# Initialize with multi-sig
echo "Please coordinate with multi-sig members to execute initialization..."
echo "Program ID: $PROGRAM_ID"
echo ""
echo "Initialization parameters:"
echo "  - Decay Rate: 0.5% daily (50 bps)"
echo "  - Treasury Split: 90% floor, 10% operations"
echo "  - Initial Floor Price: $0.01"
echo "  - Max Daily Buyback: $50,000"
echo ""
echo "Multi-sig members must execute the initialization transaction."

EOF

chmod +x "$DEPLOYMENT_DIR/initialize.sh"

# Post-deployment verification
echo -e "\n${BLUE}🔍 Verifying deployment...${NC}"

FAILED=0
for program in twist-token twist-staking twist-treasury twist-vesting twist-bridge; do
    PROGRAM_ID=$(solana-keygen pubkey "keys/${program}-keypair.json")
    if solana program show "$PROGRAM_ID" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ ${program} verified${NC}"
    else
        echo -e "${RED}✗ ${program} verification failed${NC}"
        FAILED=1
    fi
done

if [ $FAILED -eq 1 ]; then
    echo -e "\n${RED}⚠️  Deployment verification failed!${NC}"
    echo "Please check the deployment logs in $DEPLOYMENT_DIR"
    exit 1
fi

# Generate deployment report
cat > "$DEPLOYMENT_DIR/deployment_report.md" << EOF
# TWIST Token Mainnet Deployment Report

**Deployment ID**: ${DEPLOYMENT_ID}  
**Date**: $(date)  
**Network**: Mainnet-Beta  
**Deployer**: ${WALLET}  

## Deployed Programs

| Program | Address | Verified |
|---------|---------|----------|
| twist-token | $(solana-keygen pubkey keys/twist-token-keypair.json) | ✅ |
| twist-staking | $(solana-keygen pubkey keys/twist-staking-keypair.json) | ✅ |
| twist-treasury | $(solana-keygen pubkey keys/twist-treasury-keypair.json) | ✅ |
| twist-vesting | $(solana-keygen pubkey keys/twist-vesting-keypair.json) | ✅ |
| twist-bridge | $(solana-keygen pubkey keys/twist-bridge-keypair.json) | ✅ |

## Next Steps

1. **Multi-sig Verification** (IMMEDIATE)
   - All multi-sig members must verify the deployment
   - Check program bytecode matches audit
   
2. **Initialize Programs** (Within 1 hour)
   - Execute initialization via multi-sig
   - Set all parameters as specified
   
3. **Create Liquidity** (Within 2 hours)
   - Deploy initial liquidity as planned
   - Enable trading on Orca
   
4. **Enable Monitoring** (Within 30 minutes)
   - Start all monitoring services
   - Verify alerts are working
   
5. **Community Announcement** (After liquidity)
   - Publish contract addresses
   - Share deployment verification

## Security Checklist

- [ ] All programs deployed with multi-sig authority
- [ ] Upgrade authority set to multi-sig
- [ ] No single point of failure
- [ ] Emergency procedures documented
- [ ] Monitoring active

## Contacts

- Technical Lead: [REDACTED]
- Security Lead: [REDACTED]
- On-call Engineer: [REDACTED]

---
*This report was automatically generated. Please verify all information.*
EOF

# Final summary
echo -e "\n${GREEN}✅ MAINNET DEPLOYMENT COMPLETED!${NC}"
echo ""
echo "📁 Deployment artifacts saved to: $DEPLOYMENT_DIR"
echo ""
echo -e "${YELLOW}⚠️  CRITICAL NEXT STEPS:${NC}"
echo "1. Share deployment manifest with all multi-sig members"
echo "2. Each member must verify the deployment independently"
echo "3. Initialize programs via multi-sig within 1 hour"
echo "4. Deploy liquidity within 2 hours"
echo "5. Enable all monitoring systems immediately"
echo ""
echo -e "${BLUE}Program IDs:${NC}"
echo "  twist-token:    $(solana-keygen pubkey keys/twist-token-keypair.json)"
echo "  twist-staking:  $(solana-keygen pubkey keys/twist-staking-keypair.json)"
echo "  twist-treasury: $(solana-keygen pubkey keys/twist-treasury-keypair.json)"
echo "  twist-vesting:  $(solana-keygen pubkey keys/twist-vesting-keypair.json)"
echo "  twist-bridge:   $(solana-keygen pubkey keys/twist-bridge-keypair.json)"
echo ""
echo -e "${GREEN}Good luck! 🚀${NC}"