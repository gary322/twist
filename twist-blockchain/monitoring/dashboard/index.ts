import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as prometheus from 'prom-client';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@project-serum/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { AlertManager } from './alerts';
import { MetricsCollector } from './metrics';
import { HealthChecker } from './health';

export class MonitoringDashboard {
  private app: express.Application;
  private server: any;
  private io: Server;
  private connection: Connection;
  private program: Program;
  private alertManager: AlertManager;
  private metricsCollector: MetricsCollector;
  private healthChecker: HealthChecker;
  
  // Prometheus metrics
  private metrics: Map<string, prometheus.Gauge | prometheus.Counter | prometheus.Histogram>;
  
  constructor(config: {
    rpcUrl: string;
    programId: string;
    port: number;
  }) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    // Initialize connection
    this.connection = new Connection(config.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: config.rpcUrl.replace('https', 'wss')
    });
    
    // Initialize components
    this.alertManager = new AlertManager();
    this.metricsCollector = new MetricsCollector(this.connection);
    this.healthChecker = new HealthChecker(this.connection);
    
    this.setupPrometheusMetrics();
    this.setupRoutes();
    this.setupWebSocket();
    this.startMonitoring();
  }
  
  private setupPrometheusMetrics() {
    // Register default metrics
    prometheus.collectDefaultMetrics();
    
    this.metrics = new Map([
      ['twist_price_usd', new prometheus.Gauge({
        name: 'twist_price_usd',
        help: 'Current TWIST price in USD',
        labelNames: ['source']
      })],
      
      ['twist_total_supply', new prometheus.Gauge({
        name: 'twist_total_supply',
        help: 'Total TWIST supply'
      })],
      
      ['twist_circulating_supply', new prometheus.Gauge({
        name: 'twist_circulating_supply',
        help: 'Circulating TWIST supply'
      })],
      
      ['twist_floor_price_usd', new prometheus.Gauge({
        name: 'twist_floor_price_usd',
        help: 'Floor price in USD'
      })],
      
      ['twist_volume_24h_usd', new prometheus.Gauge({
        name: 'twist_volume_24h_usd',
        help: '24 hour trading volume in USD'
      })],
      
      ['twist_total_staked', new prometheus.Gauge({
        name: 'twist_total_staked',
        help: 'Total TWIST staked'
      })],
      
      ['twist_staking_apy', new prometheus.Gauge({
        name: 'twist_staking_apy',
        help: 'Current staking APY',
        labelNames: ['tier']
      })],
      
      ['twist_treasury_value_usd', new prometheus.Gauge({
        name: 'twist_treasury_value_usd',
        help: 'Total treasury value in USD',
        labelNames: ['treasury']
      })],
      
      ['twist_buyback_executed', new prometheus.Counter({
        name: 'twist_buyback_executed_total',
        help: 'Total buybacks executed',
        labelNames: ['status']
      })],
      
      ['twist_transactions_total', new prometheus.Counter({
        name: 'twist_transactions_total',
        help: 'Total transactions',
        labelNames: ['type', 'status']
      })],
      
      ['twist_transaction_latency', new prometheus.Histogram({
        name: 'twist_transaction_latency_seconds',
        help: 'Transaction confirmation latency',
        labelNames: ['type'],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
      })],
      
      ['twist_oracle_price', new prometheus.Gauge({
        name: 'twist_oracle_price_usd',
        help: 'Oracle reported price',
        labelNames: ['oracle']
      })],
      
      ['twist_oracle_divergence', new prometheus.Gauge({
        name: 'twist_oracle_divergence_percent',
        help: 'Oracle price divergence percentage'
      })],
      
      ['twist_circuit_breaker_status', new prometheus.Gauge({
        name: 'twist_circuit_breaker_status',
        help: 'Circuit breaker status (0=inactive, 1=active)'
      })],
      
      ['twist_pid_adjustment', new prometheus.Gauge({
        name: 'twist_pid_adjustment',
        help: 'Latest PID controller adjustment',
        labelNames: ['type']
      })],
      
      ['twist_decay_amount', new prometheus.Gauge({
        name: 'twist_decay_amount',
        help: 'Daily decay amount'
      })],
      
      ['twist_liquidity_depth', new prometheus.Gauge({
        name: 'twist_liquidity_depth_usd',
        help: 'Liquidity depth at various price levels',
        labelNames: ['level']
      })],
      
      ['twist_unique_holders', new prometheus.Gauge({
        name: 'twist_unique_holders',
        help: 'Number of unique token holders'
      })],
      
      ['twist_alerts_triggered', new prometheus.Counter({
        name: 'twist_alerts_triggered_total',
        help: 'Total alerts triggered',
        labelNames: ['severity', 'type']
      })]
    ]);
  }
  
  private setupRoutes() {
    // Middleware
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // Prometheus metrics endpoint
    this.app.get('/metrics', (req, res) => {
      res.set('Content-Type', prometheus.register.contentType);
      res.end(prometheus.register.metrics());
    });
    
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      const health = await this.healthChecker.checkHealth();
      res.status(health.healthy ? 200 : 503).json(health);
    });
    
    // API endpoints
    this.app.get('/api/metrics/current', async (req, res) => {
      try {
        const metrics = await this.metricsCollector.getCurrentMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/api/metrics/historical', async (req, res) => {
      try {
        const { period = '24h' } = req.query;
        const metrics = await this.metricsCollector.getHistoricalMetrics(period as string);
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/api/alerts', async (req, res) => {
      try {
        const alerts = await this.alertManager.getActiveAlerts();
        res.json(alerts);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/api/alerts/acknowledge', async (req, res) => {
      try {
        const { alertId } = req.body;
        await this.alertManager.acknowledgeAlert(alertId);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Dashboard UI
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }
  
  private setupWebSocket() {
    this.io.on('connection', (socket) => {
      logger.log('Client connected:', socket.id);
      
      // Send initial data
      this.sendCurrentMetrics(socket);
      
      // Subscribe to metric updates
      socket.on('subscribe', (metrics: string[]) => {
        socket.join('metrics');
        logger.log(`Client ${socket.id} subscribed to metrics:`, metrics);
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        logger.log('Client disconnected:', socket.id);
      });
    });
  }
  
  private async startMonitoring() {
    // Update metrics every 10 seconds
    setInterval(async () => {
      try {
        await this.updateMetrics();
      } catch (error) {
        console.error('Error updating metrics:', error);
        this.alertManager.triggerAlert({
          severity: 'high',
          type: 'monitoring_error',
          message: `Monitoring update failed: ${error.message}`,
          timestamp: Date.now()
        });
      }
    }, 10000);
    
    // Check alerts every 30 seconds
    setInterval(async () => {
      try {
        await this.checkAlerts();
      } catch (error) {
        console.error('Error checking alerts:', error);
      }
    }, 30000);
    
    // Update historical data every 5 minutes
    setInterval(async () => {
      try {
        await this.metricsCollector.updateHistoricalData();
      } catch (error) {
        console.error('Error updating historical data:', error);
      }
    }, 300000);
  }
  
  private async updateMetrics() {
    const metrics = await this.metricsCollector.getCurrentMetrics();
    
    // Update Prometheus metrics
    this.metrics.get('twist_price_usd').set({ source: 'aggregated' }, metrics.price);
    this.metrics.get('twist_total_supply').set(metrics.totalSupply);
    this.metrics.get('twist_circulating_supply').set(metrics.circulatingSupply);
    this.metrics.get('twist_floor_price_usd').set(metrics.floorPrice);
    this.metrics.get('twist_volume_24h_usd').set(metrics.volume24h);
    this.metrics.get('twist_total_staked').set(metrics.totalStaked);
    
    // Update staking APYs
    Object.entries(metrics.stakingApys).forEach(([tier, apy]) => {
      this.metrics.get('twist_staking_apy').set({ tier }, apy);
    });
    
    // Update treasury values
    this.metrics.get('twist_treasury_value_usd').set(
      { treasury: 'floor' }, 
      metrics.treasuryValues.floor
    );
    this.metrics.get('twist_treasury_value_usd').set(
      { treasury: 'ops' }, 
      metrics.treasuryValues.ops
    );
    
    // Update oracle prices
    metrics.oraclePrices.forEach(oracle => {
      this.metrics.get('twist_oracle_price').set(
        { oracle: oracle.name }, 
        oracle.price
      );
    });
    
    // Calculate and update oracle divergence
    if (metrics.oraclePrices.length > 1) {
      const prices = metrics.oraclePrices.map(o => o.price);
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const divergence = ((maxPrice - minPrice) / minPrice) * 100;
      this.metrics.get('twist_oracle_divergence').set(divergence);
    }
    
    // Update circuit breaker status
    this.metrics.get('twist_circuit_breaker_status').set(
      metrics.circuitBreakerActive ? 1 : 0
    );
    
    // Update decay amount
    this.metrics.get('twist_decay_amount').set(metrics.dailyDecayAmount);
    
    // Update liquidity depth
    Object.entries(metrics.liquidityDepth).forEach(([level, depth]) => {
      this.metrics.get('twist_liquidity_depth').set({ level }, depth);
    });
    
    // Update unique holders
    this.metrics.get('twist_unique_holders').set(metrics.uniqueHolders);
    
    // Emit to WebSocket clients
    this.io.to('metrics').emit('metrics:update', metrics);
  }
  
  private async checkAlerts() {
    const metrics = await this.metricsCollector.getCurrentMetrics();
    
    // Price deviation alert
    if (Math.abs(metrics.price - metrics.floorPrice) / metrics.floorPrice > 0.1) {
      this.alertManager.triggerAlert({
        severity: 'medium',
        type: 'price_deviation',
        message: `Price deviating significantly from floor: $${metrics.price.toFixed(4)}`,
        timestamp: Date.now()
      });
    }
    
    // Volume spike alert
    if (metrics.volume24h > metrics.averageVolume * 5) {
      this.alertManager.triggerAlert({
        severity: 'high',
        type: 'volume_spike',
        message: `Unusual volume detected: $${(metrics.volume24h / 1e6).toFixed(2)}M`,
        timestamp: Date.now()
      });
    }
    
    // Oracle divergence alert
    const oracleDivergence = this.calculateOracleDivergence(metrics.oraclePrices);
    if (oracleDivergence > 5) {
      this.alertManager.triggerAlert({
        severity: 'critical',
        type: 'oracle_divergence',
        message: `Oracle divergence exceeds threshold: ${oracleDivergence.toFixed(2)}%`,
        timestamp: Date.now()
      });
    }
    
    // Circuit breaker alert
    if (metrics.circuitBreakerActive) {
      this.alertManager.triggerAlert({
        severity: 'critical',
        type: 'circuit_breaker',
        message: 'Circuit breaker is active',
        timestamp: Date.now()
      });
    }
    
    // Low liquidity alert
    if (metrics.liquidityDepth['2%'] < 100000) {
      this.alertManager.triggerAlert({
        severity: 'high',
        type: 'low_liquidity',
        message: `Low liquidity depth: $${(metrics.liquidityDepth['2%'] / 1000).toFixed(1)}k at 2%`,
        timestamp: Date.now()
      });
    }
  }
  
  private calculateOracleDivergence(oraclePrices: any[]): number {
    if (oraclePrices.length < 2) return 0;
    
    const prices = oraclePrices.map(o => o.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    
    return ((maxPrice - minPrice) / minPrice) * 100;
  }
  
  private async sendCurrentMetrics(socket: any) {
    try {
      const metrics = await this.metricsCollector.getCurrentMetrics();
      socket.emit('metrics:initial', metrics);
    } catch (error) {
      console.error('Error sending initial metrics:', error);
    }
  }
  
  public start() {
    const port = process.env.PORT || 3000;
    this.server.listen(port, () => {
      logger.log(`Monitoring dashboard running on port ${port}`);
      logger.log(`Metrics available at http://localhost:${port}/metrics`);
      logger.log(`Dashboard available at http://localhost:${port}`);
    });
  }
}