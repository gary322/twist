import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { TwistClient } from '@twist/sdk';
import { Connection } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import * as prometheus from 'prom-client';
import * as dotenv from 'dotenv';
import { BotLogger } from '../../bots/utils/logger';

dotenv.config();

const PORT = process.env.PORT || 3000;
const UPDATE_INTERVAL = 10000; // 10 seconds

const logger = new BotLogger('MonitoringDashboard');

class MonitoringDashboard {
  private app: express.Application;
  private io: Server;
  private client: TwistClient;
  private metrics: Map<string, prometheus.Gauge>;

  constructor() {
    this.app = express();
    const server = createServer(this.app);
    this.io = new Server(server, {
      cors: { origin: "*" }
    });

    // Initialize Solana client
    const connection = new Connection(
      process.env.RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    const wallet = {} as Wallet; // Read-only operations don't need a real wallet

    this.client = new TwistClient({
      connection,
      wallet,
    });

    this.metrics = new Map();
    this.setupMetrics();
    this.setupRoutes();
    this.startMonitoring();

    server.listen(PORT, () => {
      // Dashboard started on port ${PORT}
      logger.info(`Dashboard started on port ${PORT}`);
    });
  }

  private setupMetrics(): void {
    // Register Prometheus metrics
    this.metrics.set('twist_price', new prometheus.Gauge({
      name: 'twist_price_usd',
      help: 'Current TWIST price in USD'
    }));

    this.metrics.set('total_supply', new prometheus.Gauge({
      name: 'twist_total_supply',
      help: 'Total TWIST supply'
    }));

    this.metrics.set('floor_price', new prometheus.Gauge({
      name: 'twist_floor_price_usd',
      help: 'Floor price in USD'
    }));

    this.metrics.set('total_staked', new prometheus.Gauge({
      name: 'twist_total_staked',
      help: 'Total TWIST staked'
    }));

    this.metrics.set('daily_buyback_used', new prometheus.Gauge({
      name: 'twist_daily_buyback_used',
      help: 'Daily buyback amount used'
    }));

    // Register all metrics
    for (const metric of this.metrics.values()) {
      prometheus.register.registerMetric(metric);
    }
  }

  private async startMonitoring(): Promise<void> {
    logger.info('Starting monitoring loop...');

    setInterval(async () => {
      try {
        const programState = await this.client.getProgramState();

        // Update Prometheus metrics
        this.metrics.get('twist_price')?.set(programState.lastOraclePrice);
        this.metrics.get('total_supply')?.set(
          Number(programState.totalStaked) / 1e9
        );
        this.metrics.get('floor_price')?.set(programState.floorPrice);
        this.metrics.get('total_staked')?.set(
          Number(programState.totalStaked) / 1e9
        );
        this.metrics.get('daily_buyback_used')?.set(programState.dailyBuybackUsed);

        // Emit to WebSocket clients
        this.io.emit('metrics', {
          timestamp: Date.now(),
          price: programState.lastOraclePrice,
          floorPrice: programState.floorPrice,
          totalSupply: programState.totalStaked.toString(),
          totalStaked: programState.totalStaked.toString(),
          dailyBuybackUsed: programState.dailyBuybackUsed,
          buybackEnabled: programState.buybackEnabled,
          emergencyPause: programState.emergencyPause,
        });

        logger.debug('Metrics updated');
      } catch (error) {
        logger.error('Error updating metrics:', error);
      }
    }, UPDATE_INTERVAL);
  }

  private setupRoutes(): void {
    // Serve static files
    this.app.use(express.static('public'));

    // Prometheus metrics endpoint
    this.app.get('/metrics', (_req, res) => {
      res.set('Content-Type', prometheus.register.contentType);
      res.end(prometheus.register.metrics());
    });

    // Health check
    this.app.get('/health', async (_req, res) => {
      try {
        await this.client.getProgramState();
        res.json({ status: 'healthy', timestamp: Date.now() });
      } catch (error) {
        res.status(503).json({ 
          status: 'unhealthy', 
          error: (error as Error).message,
          timestamp: Date.now() 
        });
      }
    });

    // API endpoints
    this.app.get('/api/metrics', async (_req, res) => {
      try {
        const programState = await this.client.getProgramState();
        res.json(programState);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // WebSocket connection handler
    this.io.on('connection', (socket) => {
      logger.debug('Client connected', { socketId: socket.id });
      
      socket.on('disconnect', () => {
        logger.debug('Client disconnected', { socketId: socket.id });
      });
    });
  }
}

// Start the dashboard
new MonitoringDashboard();