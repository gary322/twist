import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Grid,
  Paper,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  IconButton,
  Tabs,
  Tab,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Skeleton,
  Tooltip,
} from '@mui/material';
import {
  Download,
  Refresh,
  TrendingUp,
  TrendingDown,
  AttachMoney,
  People,
  Timeline,
  Speed,
  Assessment,
  CalendarToday,
  Info,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut, Radar } from 'react-chartjs-2';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { formatToken, formatNumber, formatPercent, formatDate } from '../utils/format';
import { MetricCard } from '../components/analytics/MetricCard';
import { PerformanceChart } from '../components/analytics/PerformanceChart';
import { ConversionFunnel } from '../components/analytics/ConversionFunnel';
import { GeographicMap } from '../components/analytics/GeographicMap';
import { RealTimeMetrics } from '../components/analytics/RealTimeMetrics';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  ChartTooltip,
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
      id={`analytics-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export const AnalyticsDashboard: React.FC = () => {
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [timeRange, setTimeRange] = useState('7d');
  const [customDateRange, setCustomDateRange] = useState({
    start: subDays(new Date(), 7),
    end: new Date(),
  });
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>('revenue');
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    loadAnalyticsData();
  }, [timeRange, customDateRange]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      
      const dateRange = timeRange === 'custom' 
        ? { start: customDateRange.start, end: customDateRange.end }
        : getDateRangeFromPreset(timeRange);

      const [
        overview,
        performance,
        conversions,
        stakingMetrics,
        geographic,
        realtime,
      ] = await Promise.all([
        api.getAnalyticsOverview(user?.id, dateRange),
        api.getPerformanceMetrics(user?.id, dateRange),
        api.getConversionAnalytics(user?.id, dateRange),
        api.getStakingAnalytics(user?.id, dateRange),
        api.getGeographicAnalytics(user?.id, dateRange),
        api.getRealtimeMetrics(user?.id),
      ]);

      setAnalyticsData({
        overview,
        performance,
        conversions,
        stakingMetrics,
        geographic,
        realtime,
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAnalyticsData();
    setRefreshing(false);
  };

  const handleExport = async () => {
    try {
      const dateRange = timeRange === 'custom' 
        ? { start: customDateRange.start, end: customDateRange.end }
        : getDateRangeFromPreset(timeRange);

      const blob = await api.exportAnalytics({
        influencerId: user?.id,
        startDate: format(dateRange.start, 'yyyy-MM-dd'),
        endDate: format(dateRange.end, 'yyyy-MM-dd'),
        format: 'xlsx',
      });

      // Download file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export analytics:', error);
    }
  };

  const getDateRangeFromPreset = (preset: string) => {
    const end = endOfDay(new Date());
    let start;

    switch (preset) {
      case '24h':
        start = subDays(end, 1);
        break;
      case '7d':
        start = subDays(end, 7);
        break;
      case '30d':
        start = subDays(end, 30);
        break;
      case '90d':
        start = subDays(end, 90);
        break;
      default:
        start = subDays(end, 7);
    }

    return { start: startOfDay(start), end };
  };

  const getMetricChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  const { overview, performance, conversions, stakingMetrics, geographic, realtime } = analyticsData || {};

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h4" gutterBottom>
              Analytics Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Track your performance and optimize your influencer strategy
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(e, value) => value && setViewMode(value)}
              size="small"
            >
              <ToggleButton value="overview">Overview</ToggleButton>
              <ToggleButton value="detailed">Detailed</ToggleButton>
            </ToggleButtonGroup>
            <IconButton onClick={handleRefresh} disabled={refreshing}>
              <Refresh />
            </IconButton>
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={handleExport}
            >
              Export
            </Button>
          </Box>
        </Box>

        {/* Date Range Selector */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={(e, value) => value && setTimeRange(value)}
            size="small"
          >
            <ToggleButton value="24h">24h</ToggleButton>
            <ToggleButton value="7d">7d</ToggleButton>
            <ToggleButton value="30d">30d</ToggleButton>
            <ToggleButton value="90d">90d</ToggleButton>
            <ToggleButton value="custom">Custom</ToggleButton>
          </ToggleButtonGroup>

          {timeRange === 'custom' && (
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Start Date"
                value={customDateRange.start}
                onChange={(date) => date && setCustomDateRange({ ...customDateRange, start: date })}
                renderInput={(params) => <TextField {...params} size="small" />}
              />
              <DatePicker
                label="End Date"
                value={customDateRange.end}
                onChange={(date) => date && setCustomDateRange({ ...customDateRange, end: date })}
                renderInput={(params) => <TextField {...params} size="small" />}
              />
            </LocalizationProvider>
          )}

          <Chip
            icon={<CalendarToday />}
            label={`${format(
              timeRange === 'custom' ? customDateRange.start : getDateRangeFromPreset(timeRange).start,
              'MMM d'
            )} - ${format(
              timeRange === 'custom' ? customDateRange.end : getDateRangeFromPreset(timeRange).end,
              'MMM d, yyyy'
            )}`}
            variant="outlined"
          />
        </Box>
      </Box>

      {/* Real-time Metrics Bar */}
      <RealTimeMetrics metrics={realtime} />

      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Total Revenue"
            value={formatToken(overview?.totalRevenue || 0)}
            change={overview?.revenueChange}
            icon={<AttachMoney />}
            color="primary"
            subtitle="From all sources"
            trend={overview?.revenueTrend}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Active Stakers"
            value={formatNumber(stakingMetrics?.activeStakers || 0)}
            change={stakingMetrics?.stakersChange}
            icon={<People />}
            color="success"
            subtitle={`${formatToken(stakingMetrics?.totalStaked || 0)} staked`}
            trend={stakingMetrics?.stakersTrend}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Conversion Rate"
            value={formatPercent(conversions?.overallRate || 0)}
            change={conversions?.rateChange}
            icon={<TrendingUp />}
            color="info"
            subtitle={`${formatNumber(conversions?.totalConversions || 0)} conversions`}
            trend={conversions?.rateTrend}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Avg. Order Value"
            value={formatToken(conversions?.avgOrderValue || 0)}
            change={conversions?.aovChange}
            icon={<Speed />}
            color="warning"
            subtitle="Per conversion"
            trend={conversions?.aovTrend}
          />
        </Grid>
      </Grid>

      {/* Main Content */}
      <Paper sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
            <Tab label="Performance" icon={<Timeline />} iconPosition="start" />
            <Tab label="Conversions" icon={<TrendingUp />} iconPosition="start" />
            <Tab label="Staking" icon={<People />} iconPosition="start" />
            <Tab label="Geographic" icon={<Assessment />} iconPosition="start" />
            <Tab label="Products" icon={<AttachMoney />} iconPosition="start" />
          </Tabs>
        </Box>

        {/* Performance Tab */}
        <TabPanel value={tabValue} index={0}>
          <PerformanceAnalytics data={performance} viewMode={viewMode} />
        </TabPanel>

        {/* Conversions Tab */}
        <TabPanel value={tabValue} index={1}>
          <ConversionAnalytics data={conversions} />
        </TabPanel>

        {/* Staking Tab */}
        <TabPanel value={tabValue} index={2}>
          <StakingAnalytics data={stakingMetrics} />
        </TabPanel>

        {/* Geographic Tab */}
        <TabPanel value={tabValue} index={3}>
          <GeographicAnalytics data={geographic} />
        </TabPanel>

        {/* Products Tab */}
        <TabPanel value={tabValue} index={4}>
          <ProductAnalytics data={overview?.productPerformance} />
        </TabPanel>
      </Paper>
    </Container>
  );
};

// Performance Analytics Component
const PerformanceAnalytics: React.FC<{ data: any; viewMode: string }> = ({ data, viewMode }) => {
  const [selectedMetrics, setSelectedMetrics] = useState(['revenue', 'conversions']);

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Metrics</InputLabel>
            <Select
              multiple
              value={selectedMetrics}
              onChange={(e) => setSelectedMetrics(e.target.value as string[])}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              <MenuItem value="revenue">Revenue</MenuItem>
              <MenuItem value="conversions">Conversions</MenuItem>
              <MenuItem value="clicks">Clicks</MenuItem>
              <MenuItem value="stakers">Stakers</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <PerformanceChart
          data={data}
          metrics={selectedMetrics}
          height={400}
          showComparison={viewMode === 'detailed'}
        />
      </Grid>

      {viewMode === 'detailed' && (
        <>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Hour of Day Performance
              </Typography>
              <Box sx={{ height: 300 }}>
                <Bar
                  data={{
                    labels: data?.hourlyPerformance?.labels || [],
                    datasets: [{
                      label: 'Conversions',
                      data: data?.hourlyPerformance?.conversions || [],
                      backgroundColor: 'rgba(75, 192, 192, 0.8)',
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { beginAtZero: true },
                    },
                  }}
                />
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Day of Week Performance
              </Typography>
              <Box sx={{ height: 300 }}>
                <Radar
                  data={{
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [{
                      label: 'Revenue',
                      data: data?.weekdayPerformance?.revenue || [],
                      borderColor: 'rgb(255, 99, 132)',
                      backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    }, {
                      label: 'Conversions',
                      data: data?.weekdayPerformance?.conversions || [],
                      borderColor: 'rgb(54, 162, 235)',
                      backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                  }}
                />
              </Box>
            </Paper>
          </Grid>
        </>
      )}
    </Grid>
  );
};

// Conversion Analytics Component
const ConversionAnalytics: React.FC<{ data: any }> = ({ data }) => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={8}>
        <ConversionFunnel data={data?.funnel} />
      </Grid>

      <Grid item xs={12} md={4}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Conversion Sources
          </Typography>
          <Box sx={{ height: 300 }}>
            <Doughnut
              data={{
                labels: data?.sources?.labels || [],
                datasets: [{
                  data: data?.sources?.data || [],
                  backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF',
                  ],
                }],
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
        </Paper>
      </Grid>

      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Top Converting Products
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Clicks</TableCell>
                  <TableCell align="right">Conversions</TableCell>
                  <TableCell align="right">Rate</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                  <TableCell align="center">Trend</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.topProducts?.map((product: any) => (
                  <TableRow key={product.id}>
                    <TableCell>{product.name}</TableCell>
                    <TableCell align="right">{formatNumber(product.clicks)}</TableCell>
                    <TableCell align="right">{formatNumber(product.conversions)}</TableCell>
                    <TableCell align="right">{formatPercent(product.rate)}</TableCell>
                    <TableCell align="right">{formatToken(product.revenue)}</TableCell>
                    <TableCell align="center">
                      {product.trend > 0 ? (
                        <TrendingUp sx={{ color: 'success.main' }} />
                      ) : (
                        <TrendingDown sx={{ color: 'error.main' }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Grid>
    </Grid>
  );
};

// Staking Analytics Component
const StakingAnalytics: React.FC<{ data: any }> = ({ data }) => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Staking Growth
          </Typography>
          <Box sx={{ height: 300 }}>
            <Line
              data={{
                labels: data?.growth?.labels || [],
                datasets: [{
                  label: 'Total Staked',
                  data: data?.growth?.totalStaked || [],
                  borderColor: 'rgb(75, 192, 192)',
                  backgroundColor: 'rgba(75, 192, 192, 0.1)',
                  fill: true,
                  yAxisID: 'y',
                }, {
                  label: 'Staker Count',
                  data: data?.growth?.stakerCount || [],
                  borderColor: 'rgb(255, 99, 132)',
                  backgroundColor: 'rgba(255, 99, 132, 0.1)',
                  yAxisID: 'y1',
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                  mode: 'index' as const,
                  intersect: false,
                },
                scales: {
                  y: {
                    type: 'linear' as const,
                    display: true,
                    position: 'left' as const,
                    ticks: {
                      callback: (value) => formatToken(value as number),
                    },
                  },
                  y1: {
                    type: 'linear' as const,
                    display: true,
                    position: 'right' as const,
                    grid: {
                      drawOnChartArea: false,
                    },
                  },
                },
              }}
            />
          </Box>
        </Paper>
      </Grid>

      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Staker Distribution
          </Typography>
          <Box sx={{ height: 300 }}>
            <Bar
              data={{
                labels: data?.distribution?.labels || [],
                datasets: [{
                  label: 'Number of Stakers',
                  data: data?.distribution?.data || [],
                  backgroundColor: 'rgba(153, 102, 255, 0.8)',
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: { beginAtZero: true },
                },
              }}
            />
          </Box>
        </Paper>
      </Grid>

      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Staking Metrics
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="primary">
                  {formatToken(data?.metrics?.avgStakeSize || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Average Stake Size
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="success.main">
                  {formatPercent(data?.metrics?.retentionRate || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  30-Day Retention
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="info.main">
                  {formatToken(data?.metrics?.totalRewardsDistributed || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Rewards Distributed
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="warning.main">
                  {formatPercent(data?.metrics?.currentAPY || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Current APY
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Grid>
    </Grid>
  );
};

// Geographic Analytics Component
const GeographicAnalytics: React.FC<{ data: any }> = ({ data }) => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={8}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Geographic Distribution
          </Typography>
          <GeographicMap data={data?.map} height={400} />
        </Paper>
      </Grid>

      <Grid item xs={12} md={4}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Top Countries
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Country</TableCell>
                  <TableCell align="right">Users</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.topCountries?.map((country: any) => (
                  <TableRow key={country.code}>
                    <TableCell>{country.name}</TableCell>
                    <TableCell align="right">{formatNumber(country.users)}</TableCell>
                    <TableCell align="right">{formatToken(country.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Grid>

      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            City Performance
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>City</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell align="right">Users</TableCell>
                  <TableCell align="right">Conversions</TableCell>
                  <TableCell align="right">Conversion Rate</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.topCities?.map((city: any) => (
                  <TableRow key={city.id}>
                    <TableCell>{city.name}</TableCell>
                    <TableCell>{city.country}</TableCell>
                    <TableCell align="right">{formatNumber(city.users)}</TableCell>
                    <TableCell align="right">{formatNumber(city.conversions)}</TableCell>
                    <TableCell align="right">{formatPercent(city.conversionRate)}</TableCell>
                    <TableCell align="right">{formatToken(city.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Grid>
    </Grid>
  );
};

// Product Analytics Component
const ProductAnalytics: React.FC<{ data: any }> = ({ data }) => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Product Performance
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Clicks</TableCell>
                  <TableCell align="right">Conversions</TableCell>
                  <TableCell align="right">Conv. Rate</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                  <TableCell align="right">Commission</TableCell>
                  <TableCell align="center">Performance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.map((product: any) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {product.name}
                        {product.isNew && <Chip label="New" size="small" color="primary" />}
                      </Box>
                    </TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell align="right">{formatNumber(product.clicks)}</TableCell>
                    <TableCell align="right">{formatNumber(product.conversions)}</TableCell>
                    <TableCell align="right">{formatPercent(product.conversionRate)}</TableCell>
                    <TableCell align="right">{formatToken(product.revenue)}</TableCell>
                    <TableCell align="right">{formatToken(product.commission)}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ width: 100 }}>
                        <LinearProgress
                          variant="determinate"
                          value={product.performanceScore}
                          color={
                            product.performanceScore > 70 ? 'success' :
                            product.performanceScore > 40 ? 'warning' : 'error'
                          }
                        />
                        <Typography variant="caption" color="text.secondary">
                          {product.performanceScore}%
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Grid>
    </Grid>
  );
};

// Analytics Skeleton
const AnalyticsSkeleton: React.FC = () => {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Skeleton variant="text" width={300} height={40} sx={{ mb: 2 }} />
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Skeleton variant="rectangular" height={120} />
          </Grid>
        ))}
      </Grid>
      <Skeleton variant="rectangular" height={600} />
    </Container>
  );
};