#!/usr/bin/env ts-node

import { MonitoringDashboard } from './dashboard';
import { Connection } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Configuration
const config = {
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  programId: process.env.TWIST_PROGRAM_ID || 'TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  port: parseInt(process.env.MONITORING_PORT || '3000'),
};

// Validate configuration
if (!config.programId || config.programId === 'TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
  console.warn('⚠️  WARNING: Using placeholder program ID. Set TWIST_PROGRAM_ID in .env for production.');
}

// Create and start monitoring dashboard
async function startMonitoring() {
  logger.log('🚀 Starting TWIST Token Monitoring Dashboard...\n');
  logger.log('Configuration:');
  logger.log(`  RPC URL: ${config.rpcUrl}`);
  logger.log(`  Program ID: ${config.programId}`);
  logger.log(`  Port: ${config.port}`);
  logger.log('');
  
  try {
    const dashboard = new MonitoringDashboard(config);
    dashboard.start();
    
    // Setup graceful shutdown
    process.on('SIGINT', () => {
      logger.log('\n\n📊 Shutting down monitoring dashboard...');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      logger.log('\n\n📊 Shutting down monitoring dashboard...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start monitoring dashboard:', error);
    process.exit(1);
  }
}

// Start the monitoring service
startMonitoring().catch(console.error);