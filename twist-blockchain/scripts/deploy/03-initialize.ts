#!/usr/bin/env ts-node

import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { config } from "dotenv";
import fs from "fs";
import path from "path";

config();

async function initialize() {
  logger.log("🚀 Initializing TWIST Token Program...\n");

  // Load configuration
  const connection = new Connection(
    process.env.RPC_ENDPOINT || "http://localhost:8899",
    { commitment: "confirmed" }
  );

  // Load deployer keypair
  const deployerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.DEPLOYER_KEYPAIR!))
  );
  const wallet = new Wallet(deployerKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  // Load program
  const programId = new PublicKey(process.env.TWIST_PROGRAM_ID!);
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../target/idl/twist_token.json"), "utf8")
  );
  const program = new Program(idl, programId, provider);

  // Derive PDAs
  const [programState] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_state")],
    programId
  );

  const [mint] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint")],
    programId
  );

  const [floorTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("floor_treasury")],
    programId
  );

  const [opsTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("ops_treasury")],
    programId
  );

  // Initialize parameters
  const params = {
    decayRateBps: 50, // 0.5% daily
    treasurySplitBps: 9000, // 90% to floor treasury
    initialFloorPrice: 50000, // $0.05 in microseconds
    maxDailyBuyback: new BN(50000 * 1e6), // $50,000
    pythPriceFeed: new PublicKey(process.env.PYTH_TWIST_PRICE_FEED!),
    switchboardFeed: new PublicKey(process.env.SWITCHBOARD_TWIST_FEED!),
    chainlinkFeed: null, // Optional
  };

  logger.log("📋 Initialization Parameters:");
  logger.log(`- Decay Rate: ${params.decayRateBps / 100}%`);
  logger.log(`- Treasury Split: ${params.treasurySplitBps / 100}%`);
  logger.log(`- Initial Floor Price: $${params.initialFloorPrice / 1e6}`);
  logger.log(`- Max Daily Buyback: $${params.maxDailyBuyback.toString()}`);
  logger.log();

  try {
    // Initialize program
    const tx = await program.methods
      .initialize(params)
      .accounts({
        authority: deployerKeypair.publicKey,
        programState,
        mint,
        floorTreasury,
        opsTreasury,
        pythPriceAccount: params.pythPriceFeed,
        switchboardFeed: params.switchboardFeed,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([deployerKeypair])
      .rpc();

    logger.log("✅ Program initialized successfully!");
    logger.log(`Transaction: ${tx}`);
    logger.log();
    logger.log("📝 Generated Addresses:");
    logger.log(`- Program State: ${programState.toString()}`);
    logger.log(`- Mint: ${mint.toString()}`);
    logger.log(`- Floor Treasury: ${floorTreasury.toString()}`);
    logger.log(`- Ops Treasury: ${opsTreasury.toString()}`);

    // Save addresses to file
    const addresses = {
      programId: programId.toString(),
      programState: programState.toString(),
      mint: mint.toString(),
      floorTreasury: floorTreasury.toString(),
      opsTreasury: opsTreasury.toString(),
      initialized: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(__dirname, "../../deployed-addresses.json"),
      JSON.stringify(addresses, null, 2)
    );

    logger.log("\n✅ Addresses saved to deployed-addresses.json");

  } catch (error) {
    console.error("❌ Initialization failed:", error);
    process.exit(1);
  }
}

// Run initialization
initialize()
  .then(() => {
    logger.log("\n🎉 Initialization complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error during initialization:", error);
    process.exit(1);
  });