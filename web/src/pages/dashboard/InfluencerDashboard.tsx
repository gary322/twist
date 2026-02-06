import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Button,
  Tab,
  Tabs,
  IconButton,
  Skeleton,
  Alert,
  Chip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  TrendingUp,
  People,
  AttachMoney,
  Link as LinkIcon,
  Analytics,
  Settings,
  Notifications,
  ContentCopy,
  QrCode2,
  Download,
  Refresh,
} from '@mui/icons-material';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { formatToken, formatNumber, formatCurrency } from '../../utils/format';
import { api } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { StatsCard } from '../../components/dashboard/StatsCard';
import { RecentActivity } from '../../components/dashboard/RecentActivity';
import { PayoutWidget } from '../../components/dashboard/PayoutWidget';
import { LinkManagement } from '../../components/dashboard/LinkManagement';
import { StakersWidget } from '../../components/dashboard/StakersWidget';
import { NotificationCenter } from '../../components/dashboard/NotificationCenter';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`dashboard-tabpanel-${index}`}
      aria-labelledby={`dashboard-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export const InfluencerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [timeRange, setTimeRange] = useState('7d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [stats, analytics, stakingPool, recentActivity] = await Promise.all([
        api.getInfluencerStats(user?.id, timeRange),
        api.getInfluencerAnalytics(user?.id, timeRange),
        api.getInfluencerStakingPool(user?.id),
        api.getRecentActivity(user?.id, { limit: 10 }),
      ]);

      setDashboardData({
        stats,
        analytics,
        stakingPool,
        recentActivity,
      });
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={loadDashboardData}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  const { stats, analytics, stakingPool, recentActivity } = dashboardData || {};

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Welcome back, {user?.displayName || user?.username}!
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip
              label={user?.tier || 'BRONZE'}
              color={getTierColor(user?.tier)}
              size="small"
            />
            {user?.verified && (
              <Chip label="Verified" color="primary" size="small" variant="outlined" />
            )}
            <Typography variant="body2" color="text.secondary">
              Member since {new Date(user?.createdAt).toLocaleDateString()}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <IconButton onClick={handleRefresh} disabled={refreshing}>
            <Refresh />
          </IconButton>
          <IconButton onClick={() => navigate('/settings')}>
            <Settings />
          </IconButton>
          <NotificationCenter />
        </Box>
      </Box>

      {/* Stats Overview */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Earned"
            value={formatToken(stats?.totalEarned || 0)}
            change={stats?.earnedChange}
            icon={<AttachMoney />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Staked"
            value={formatToken(stakingPool?.totalStaked || 0)}
            change={stakingPool?.stakedChange}
            icon={<TrendingUp />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Active Stakers"
            value={formatNumber(stakingPool?.stakerCount || 0)}
            change={stakingPool?.stakerChange}
            icon={<People />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Conversion Rate"
            value={`${(stats?.conversionRate || 0).toFixed(2)}%`}
            change={stats?.conversionChange}
            icon={<Analytics />}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* Main Content Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="dashboard tabs">
            <Tab label="Overview" icon={<DashboardIcon />} iconPosition="start" />
            <Tab label="Analytics" icon={<Analytics />} iconPosition="start" />
            <Tab label="Links" icon={<LinkIcon />} iconPosition="start" />
            <Tab label="Staking" icon={<TrendingUp />} iconPosition="start" />
            <Tab label="Payouts" icon={<AttachMoney />} iconPosition="start" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            {/* Earnings Chart */}
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Earnings Overview
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <Line
                      data={{
                        labels: analytics?.earnings?.labels || [],
                        datasets: [
                          {
                            label: 'Conversions',
                            data: analytics?.earnings?.conversions || [],
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.1)',
                            tension: 0.4,
                          },
                          {
                            label: 'Staking Rewards',
                            data: analytics?.earnings?.stakingRewards || [],
                            borderColor: 'rgb(153, 102, 255)',
                            backgroundColor: 'rgba(153, 102, 255, 0.1)',
                            tension: 0.4,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'top' as const,
                          },
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                          },
                        },
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Traffic Sources */}
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Traffic Sources
                  </Typography>
                  <Box sx={{ height: 250 }}>
                    <Doughnut
                      data={{
                        labels: analytics?.trafficSources?.labels || [],
                        datasets: [
                          {
                            data: analytics?.trafficSources?.data || [],
                            backgroundColor: [
                              'rgba(255, 99, 132, 0.8)',
                              'rgba(54, 162, 235, 0.8)',
                              'rgba(255, 206, 86, 0.8)',
                              'rgba(75, 192, 192, 0.8)',
                              'rgba(153, 102, 255, 0.8)',
                            ],
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom' as const,
                          },
                        },
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Recent Activity */}
            <Grid item xs={12} md={6}>
              <RecentActivity activities={recentActivity} />
            </Grid>

            {/* Quick Actions */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Quick Actions
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<LinkIcon />}
                        onClick={() => setTabValue(2)}
                      >
                        Create Link
                      </Button>
                    </Grid>
                    <Grid item xs={6}>
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<QrCode2 />}
                        onClick={() => navigate('/links/qr')}
                      >
                        Generate QR
                      </Button>
                    </Grid>
                    <Grid item xs={6}>
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<Download />}
                        onClick={() => navigate('/analytics/export')}
                      >
                        Export Data
                      </Button>
                    </Grid>
                    <Grid item xs={6}>
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<ContentCopy />}
                        onClick={() => copyStakingAddress()}
                      >
                        Copy Address
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <AnalyticsTab analytics={analytics} timeRange={timeRange} onTimeRangeChange={setTimeRange} />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <LinkManagement influencerId={user?.id} />
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <StakingTab stakingPool={stakingPool} />
        </TabPanel>

        <TabPanel value={tabValue} index={4}>
          <PayoutWidget influencerId={user?.id} />
        </TabPanel>
      </Paper>
    </Box>
  );
};

// Analytics Tab Component
const AnalyticsTab: React.FC<{
  analytics: any;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
}> = ({ analytics, timeRange, onTimeRangeChange }) => {
  return (
    <Grid container spacing={3}>
      {/* Time Range Selector */}
      <Grid item xs={12}>
        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          {['24h', '7d', '30d', '90d'].map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'contained' : 'outlined'}
              size="small"
              onClick={() => onTimeRangeChange(range)}
            >
              {range}
            </Button>
          ))}
        </Box>
      </Grid>

      {/* Click Performance */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Click Performance
            </Typography>
            <Box sx={{ height: 300 }}>
              <Bar
                data={{
                  labels: analytics?.clicks?.labels || [],
                  datasets: [
                    {
                      label: 'Clicks',
                      data: analytics?.clicks?.data || [],
                      backgroundColor: 'rgba(75, 192, 192, 0.8)',
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                    },
                  },
                }}
              />
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Conversion Funnel */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Conversion Funnel
            </Typography>
            <Box sx={{ py: 2 }}>
              {analytics?.funnel?.map((step: any, index: number) => (
                <Box key={index} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">{step.name}</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {formatNumber(step.value)} ({step.rate}%)
                    </Typography>
                  </Box>
                  <Box sx={{ width: '100%', bgcolor: 'grey.200', borderRadius: 1 }}>
                    <Box
                      sx={{
                        width: `${step.rate}%`,
                        bgcolor: 'primary.main',
                        height: 24,
                        borderRadius: 1,
                      }}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Top Products */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Top Performing Products
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px' }}>Product</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>Clicks</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>Conversions</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>Rate</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics?.topProducts?.map((product: any) => (
                    <tr key={product.id}>
                      <td style={{ padding: '8px' }}>{product.name}</td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>
                        {formatNumber(product.clicks)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>
                        {formatNumber(product.conversions)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>
                        {product.conversionRate.toFixed(2)}%
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>
                        {formatToken(product.earned)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

// Staking Tab Component
const StakingTab: React.FC<{ stakingPool: any }> = ({ stakingPool }) => {
  return (
    <Grid container spacing={3}>
      {/* Pool Overview */}
      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Your Staking Pool
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Total Staked
                </Typography>
                <Typography variant="h5">
                  {formatToken(stakingPool?.totalStaked || 0)}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Stakers
                </Typography>
                <Typography variant="h5">
                  {formatNumber(stakingPool?.stakerCount || 0)}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Revenue Share
                </Typography>
                <Typography variant="h5">
                  {stakingPool?.revenueSharePercent || 0}%
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Current APY
                </Typography>
                <Typography variant="h5" color="success.main">
                  {stakingPool?.apy || 0}%
                </Typography>
              </Grid>
            </Grid>

            {/* Staking History Chart */}
            <Box sx={{ mt: 3, height: 300 }}>
              <Line
                data={{
                  labels: stakingPool?.history?.labels || [],
                  datasets: [
                    {
                      label: 'Total Staked',
                      data: stakingPool?.history?.data || [],
                      borderColor: 'rgb(75, 192, 192)',
                      backgroundColor: 'rgba(75, 192, 192, 0.1)',
                      fill: true,
                      tension: 0.4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false,
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                    },
                  },
                }}
              />
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Top Stakers */}
      <Grid item xs={12} md={4}>
        <StakersWidget poolId={stakingPool?.id} />
      </Grid>

      {/* Pool Settings */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Pool Settings
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Minimum Stake Amount
                </Typography>
                <Typography variant="body1">
                  {formatToken(stakingPool?.minStake || 0)} TWIST
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Pool Address
                </Typography>
                <Typography variant="body1" sx={{ wordBreak: 'break-all' }}>
                  {stakingPool?.poolAddress || 'Not created'}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={() => window.location.href = '/settings/staking'}
                >
                  Manage Pool Settings
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

// Skeleton Component
const DashboardSkeleton: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Skeleton variant="text" width={300} height={40} sx={{ mb: 2 }} />
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Skeleton variant="rectangular" height={120} />
          </Grid>
        ))}
      </Grid>
      <Skeleton variant="rectangular" height={400} />
    </Box>
  );
};

// Utility functions
const getTierColor = (tier?: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (tier) {
    case 'PLATINUM': return 'secondary';
    case 'GOLD': return 'warning';
    case 'SILVER': return 'default';
    default: return 'primary';
  }
};

const copyStakingAddress = () => {
  // Implementation for copying staking address
  navigator.clipboard.writeText(stakingPool?.poolAddress || '');
};