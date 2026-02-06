import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { makeCounterProvider, makeGaugeProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';
import { Module } from '@nestjs/common';

// Define metrics
export const stakingMetrics = {
  // Gauges
  totalStakedByPool: makeGaugeProvider({
    name: 'influencer_total_staked',
    help: 'Total TWIST staked per influencer pool',
    labelNames: ['pool_address', 'influencer_id', 'tier'],
  }),

  stakerCount: makeGaugeProvider({
    name: 'influencer_staker_count',
    help: 'Number of active stakers per pool',
    labelNames: ['pool_address', 'influencer_id'],
  }),

  poolApy: makeGaugeProvider({
    name: 'influencer_pool_apy',
    help: 'Current APY for staking pool',
    labelNames: ['pool_address', 'influencer_id'],
  }),

  pendingRewards: makeGaugeProvider({
    name: 'influencer_pending_rewards',
    help: 'Total pending rewards in pool',
    labelNames: ['pool_address', 'influencer_id'],
  }),

  activeUsers: makeGaugeProvider({
    name: 'platform_active_users',
    help: 'Number of active users on platform',
  }),

  // Counters
  stakingTransactions: makeCounterProvider({
    name: 'influencer_staking_transactions_total',
    help: 'Total staking transactions',
    labelNames: ['type', 'pool_address', 'status'],
  }),

  rewardsDistributed: makeCounterProvider({
    name: 'influencer_rewards_distributed_total',
    help: 'Total rewards distributed to stakers',
    labelNames: ['pool_address', 'influencer_id'],
  }),

  apiRequests: makeCounterProvider({
    name: 'api_requests_total',
    help: 'Total API requests',
    labelNames: ['method', 'endpoint', 'status_code'],
  }),

  fraudAlertsGenerated: makeCounterProvider({
    name: 'fraud_alerts_total',
    help: 'Total fraud alerts generated',
    labelNames: ['type', 'severity', 'action'],
  }),

  notificationsSent: makeCounterProvider({
    name: 'notifications_sent_total',
    help: 'Total notifications sent',
    labelNames: ['type', 'channel', 'status'],
  }),

  // Histograms
  stakingAmount: makeHistogramProvider({
    name: 'influencer_staking_amount',
    help: 'Distribution of staking amounts',
    labelNames: ['pool_address'],
    buckets: [10, 100, 1000, 10000, 100000], // In TWIST
  }),

  searchLatency: makeHistogramProvider({
    name: 'influencer_search_latency_seconds',
    help: 'Latency of influencer search queries',
    labelNames: ['sort_by'],
    buckets: [0.1, 0.5, 1, 2, 5],
  }),

  transactionProcessingTime: makeHistogramProvider({
    name: 'transaction_processing_time_seconds',
    help: 'Time to process blockchain transactions',
    labelNames: ['type'],
    buckets: [1, 5, 10, 30, 60],
  }),

  apiResponseTime: makeHistogramProvider({
    name: 'api_response_time_seconds',
    help: 'API response time',
    labelNames: ['method', 'endpoint'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  }),

  payoutProcessingTime: makeHistogramProvider({
    name: 'payout_processing_time_seconds',
    help: 'Time to process payouts',
    labelNames: ['type'],
    buckets: [10, 60, 300, 600, 1800],
  }),
};

// Business metrics
export const businessMetrics = {
  totalValueLocked: makeGaugeProvider({
    name: 'platform_total_value_locked',
    help: 'Total value locked in all staking pools (USD)',
  }),

  dailyActiveUsers: makeGaugeProvider({
    name: 'platform_daily_active_users',
    help: 'Number of daily active users',
  }),

  monthlyActiveUsers: makeGaugeProvider({
    name: 'platform_monthly_active_users',
    help: 'Number of monthly active users',
  }),

  conversionRate: makeGaugeProvider({
    name: 'platform_conversion_rate',
    help: 'Overall platform conversion rate',
    labelNames: ['attribution_model'],
  }),

  revenueGenerated: makeCounterProvider({
    name: 'platform_revenue_generated_total',
    help: 'Total revenue generated',
    labelNames: ['currency', 'source'],
  }),

  newUserRegistrations: makeCounterProvider({
    name: 'platform_new_users_total',
    help: 'Total new user registrations',
    labelNames: ['source', 'referrer_type'],
  }),
};

// System metrics
export const systemMetrics = {
  redisConnections: makeGaugeProvider({
    name: 'redis_connections_active',
    help: 'Active Redis connections',
  }),

  postgresConnections: makeGaugeProvider({
    name: 'postgres_connections_active',
    help: 'Active PostgreSQL connections',
  }),

  queueJobsActive: makeGaugeProvider({
    name: 'queue_jobs_active',
    help: 'Active queue jobs',
    labelNames: ['queue_name'],
  }),

  queueJobsCompleted: makeCounterProvider({
    name: 'queue_jobs_completed_total',
    help: 'Total completed queue jobs',
    labelNames: ['queue_name', 'status'],
  }),

  websocketConnections: makeGaugeProvider({
    name: 'websocket_connections_active',
    help: 'Active WebSocket connections',
    labelNames: ['namespace'],
  }),
};

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: {
          prefix: 'twist_influencer_',
        },
      },
      defaultLabels: {
        app: 'influencer-api',
        env: process.env.NODE_ENV || 'development',
      },
    }),
  ],
  providers: [
    // Staking metrics
    ...Object.values(stakingMetrics),
    // Business metrics
    ...Object.values(businessMetrics),
    // System metrics
    ...Object.values(systemMetrics),
  ],
  exports: [
    ...Object.values(stakingMetrics),
    ...Object.values(businessMetrics),
    ...Object.values(systemMetrics),
  ],
})
export class MetricsModule {}

// Alert rules configuration
export const alertRules = `
groups:
  - name: influencer_staking_alerts
    interval: 30s
    rules:
      # High fraud risk score
      - alert: HighFraudRiskScore
        expr: rate(fraud_alerts_total{severity="critical"}[5m]) > 5
        for: 2m
        labels:
          severity: critical
          team: security
        annotations:
          summary: "High rate of critical fraud alerts"
          description: "{{ $value }} critical fraud alerts per minute"

      # Staking pool APY anomaly
      - alert: StakingPoolAPYAnomaly
        expr: abs(delta(influencer_pool_apy[1h])) > 10
        for: 5m
        labels:
          severity: warning
          team: product
        annotations:
          summary: "Large APY change detected"
          description: "Pool {{ $labels.pool_address }} APY changed by {{ $value }}%"

      # Transaction processing delays
      - alert: TransactionProcessingDelay
        expr: histogram_quantile(0.95, rate(transaction_processing_time_seconds_bucket[5m])) > 30
        for: 5m
        labels:
          severity: critical
          team: engineering
        annotations:
          summary: "Transaction processing is slow"
          description: "95th percentile transaction time is {{ $value }}s"

      # API response time
      - alert: APIHighResponseTime
        expr: histogram_quantile(0.95, rate(api_response_time_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
          team: engineering
        annotations:
          summary: "API response time is high"
          description: "95th percentile response time is {{ $value }}s for {{ $labels.endpoint }}"

      # Low conversion rate
      - alert: LowConversionRate
        expr: platform_conversion_rate < 0.5
        for: 30m
        labels:
          severity: warning
          team: product
        annotations:
          summary: "Platform conversion rate is low"
          description: "Conversion rate is {{ $value }}% ({{ $labels.attribution_model }})"

      # Queue job failures
      - alert: QueueJobFailures
        expr: rate(queue_jobs_completed_total{status="failed"}[5m]) > 10
        for: 5m
        labels:
          severity: critical
          team: engineering
        annotations:
          summary: "High rate of queue job failures"
          description: "{{ $value }} failures per minute in {{ $labels.queue_name }}"

      # Database connection pool exhaustion
      - alert: DatabaseConnectionPoolExhaustion
        expr: postgres_connections_active / 100 > 0.9
        for: 5m
        labels:
          severity: critical
          team: engineering
        annotations:
          summary: "Database connection pool near exhaustion"
          description: "{{ $value | humanizePercentage }} of connections in use"

      # WebSocket connection spike
      - alert: WebSocketConnectionSpike
        expr: rate(websocket_connections_active[5m]) > 100
        for: 2m
        labels:
          severity: warning
          team: engineering
        annotations:
          summary: "Rapid increase in WebSocket connections"
          description: "{{ $value }} new connections per minute"

      # Payout processing delays
      - alert: PayoutProcessingDelay
        expr: histogram_quantile(0.95, rate(payout_processing_time_seconds_bucket[1h])) > 600
        for: 10m
        labels:
          severity: critical
          team: finance
        annotations:
          summary: "Payout processing is delayed"
          description: "95th percentile payout time is {{ $value }}s"

      # Total value locked drop
      - alert: TVLSignificantDrop
        expr: (platform_total_value_locked - platform_total_value_locked offset 1h) / platform_total_value_locked offset 1h < -0.1
        for: 10m
        labels:
          severity: critical
          team: executive
        annotations:
          summary: "Significant drop in Total Value Locked"
          description: "TVL dropped by {{ $value | humanizePercentage }} in the last hour"
`;

// Grafana dashboard configuration
export const grafanaDashboard = {
  title: 'TWIST Influencer Staking Dashboard',
  panels: [
    {
      title: 'Total Value Locked',
      type: 'graph',
      targets: [
        {
          expr: 'platform_total_value_locked',
          legendFormat: 'TVL (USD)',
        },
      ],
    },
    {
      title: 'Active Users',
      type: 'graph',
      targets: [
        {
          expr: 'platform_daily_active_users',
          legendFormat: 'DAU',
        },
        {
          expr: 'platform_monthly_active_users',
          legendFormat: 'MAU',
        },
      ],
    },
    {
      title: 'Staking Transactions',
      type: 'graph',
      targets: [
        {
          expr: 'rate(influencer_staking_transactions_total[5m])',
          legendFormat: '{{ type }} - {{ status }}',
        },
      ],
    },
    {
      title: 'API Performance',
      type: 'heatmap',
      targets: [
        {
          expr: 'histogram_quantile(0.95, rate(api_response_time_seconds_bucket[5m]))',
          legendFormat: 'p95 - {{ endpoint }}',
        },
      ],
    },
    {
      title: 'Fraud Detection',
      type: 'graph',
      targets: [
        {
          expr: 'rate(fraud_alerts_total[5m])',
          legendFormat: '{{ severity }} - {{ type }}',
        },
      ],
    },
    {
      title: 'Top Staking Pools',
      type: 'table',
      targets: [
        {
          expr: 'topk(10, influencer_total_staked)',
          format: 'table',
        },
      ],
    },
  ],
};