import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Avatar,
  Grid,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Button,
  Skeleton,
  Link,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Close,
  Twitter,
  Instagram,
  YouTube,
  Language,
  ContentCopy,
  OpenInNew,
  TrendingUp,
  People,
  AttachMoney,
  Timeline,
  Shield,
  Star,
} from '@mui/icons-material';
import { Line, Bar } from 'react-chartjs-2';
import { formatToken, formatNumber, formatDate, shortenAddress } from '../utils/format';
import { api } from '../services/api';

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
      id={`influencer-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

interface InfluencerDetailsModalProps {
  influencerId: string;
  onClose: () => void;
  onStake: () => void;
}

export const InfluencerDetailsModal: React.FC<InfluencerDetailsModalProps> = ({
  influencerId,
  onClose,
  onStake,
}) => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<any>(null);

  useEffect(() => {
    loadInfluencerDetails();
  }, [influencerId]);

  const loadInfluencerDetails = async () => {
    try {
      setLoading(true);
      const data = await api.getInfluencerStakingDetails(influencerId);
      setDetails(data);
    } catch (error) {
      console.error('Failed to load influencer details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'PLATINUM': return '#E5E4E2';
      case 'GOLD': return '#FFD700';
      case 'SILVER': return '#C0C0C0';
      default: return '#CD7F32';
    }
  };

  const getSocialIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'twitter': return <Twitter />;
      case 'instagram': return <Instagram />;
      case 'youtube': return <YouTube />;
      default: return <Language />;
    }
  };

  if (loading) {
    return (
      <Dialog open onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Skeleton variant="text" width={200} />
        </DialogTitle>
        <DialogContent>
          <Box sx={{ py: 4 }}>
            <Skeleton variant="rectangular" height={300} />
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  const { influencer, pool, metrics, topStakers, recentActivity, historicalApy } = details || {};

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              src={influencer?.avatar}
              sx={{ width: 56, height: 56 }}
            />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6">{influencer?.displayName}</Typography>
                {influencer?.verified && (
                  <Shield sx={{ width: 20, height: 20, color: '#1DA1F2' }} />
                )}
                <Chip
                  label={influencer?.tier}
                  size="small"
                  sx={{
                    bgcolor: getTierColor(influencer?.tier),
                    color: 'white',
                    fontWeight: 'bold',
                  }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                @{influencer?.username}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Bio and Social Links */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {influencer?.bio}
          </Typography>
          {influencer?.socialLinks && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {Object.entries(influencer.socialLinks).map(([platform, url]) => (
                <IconButton
                  key={platform}
                  size="small"
                  onClick={() => window.open(url as string, '_blank')}
                >
                  {getSocialIcon(platform)}
                </IconButton>
              ))}
            </Box>
          )}
        </Box>

        {/* Key Metrics */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <TrendingUp sx={{ color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{formatToken(pool?.totalStaked || 0)}</Typography>
              <Typography variant="caption" color="text.secondary">
                Total Staked
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <People sx={{ color: 'info.main', mb: 1 }} />
              <Typography variant="h6">{formatNumber(pool?.stakerCount || 0)}</Typography>
              <Typography variant="caption" color="text.secondary">
                Stakers
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <AttachMoney sx={{ color: 'success.main', mb: 1 }} />
              <Typography variant="h6">{metrics?.apy || 0}%</Typography>
              <Typography variant="caption" color="text.secondary">
                Current APY
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Star sx={{ color: 'warning.main', mb: 1 }} />
              <Typography variant="h6">{pool?.revenueSharePercent || 0}%</Typography>
              <Typography variant="caption" color="text.secondary">
                Revenue Share
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label="Overview" />
            <Tab label="Top Stakers" />
            <Tab label="Activity" />
            <Tab label="Analytics" />
          </Tabs>
        </Box>

        {/* Overview Tab */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Pool Information
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell>Pool Address</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {shortenAddress(pool?.address || '', 6)}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => navigator.clipboard.writeText(pool?.address || '')}
                          >
                            <ContentCopy fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => window.open(`https://solscan.io/account/${pool?.address}`, '_blank')}
                          >
                            <OpenInNew fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Created</TableCell>
                      <TableCell>{formatDate(pool?.createdAt)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Minimum Stake</TableCell>
                      <TableCell>{formatToken(pool?.minStake || 0)} TWIST</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Total Distributed</TableCell>
                      <TableCell>{formatToken(metrics?.totalRewardsDistributed || 0)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Pending Rewards</TableCell>
                      <TableCell>{formatToken(metrics?.pendingRewards || 0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                APY History (30 Days)
              </Typography>
              <Box sx={{ height: 200 }}>
                <Line
                  data={{
                    labels: historicalApy?.map((d: any) => formatDate(d.date)) || [],
                    datasets: [
                      {
                        label: 'APY %',
                        data: historicalApy?.map((d: any) => d.apy) || [],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.1)',
                        tension: 0.4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: { callback: (value) => `${value}%` },
                      },
                    },
                  }}
                />
              </Box>
            </Grid>
          </Grid>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
            <Button variant="contained" size="large" onClick={onStake}>
              Stake on {influencer?.displayName}
            </Button>
          </Box>
        </TabPanel>

        {/* Top Stakers Tab */}
        <TabPanel value={tabValue} index={1}>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Rank</TableCell>
                  <TableCell>Staker</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Share</TableCell>
                  <TableCell>Since</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topStakers?.map((staker: any, index: number) => (
                  <TableRow key={staker.userId}>
                    <TableCell>
                      <Chip
                        label={`#${staker.rank}`}
                        size="small"
                        color={index === 0 ? 'primary' : index === 1 ? 'secondary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 24, height: 24 }}>
                          {staker.userId.substring(0, 2).toUpperCase()}
                        </Avatar>
                        <Typography variant="body2">
                          {shortenAddress(staker.userId)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="medium">
                        {formatToken(staker.amount)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <LinearProgress
                        variant="determinate"
                        value={staker.percentage}
                        sx={{ width: 60, mr: 1, display: 'inline-block' }}
                      />
                      {staker.percentage.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(staker.stakedAt)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Activity Tab */}
        <TabPanel value={tabValue} index={2}>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentActivity?.map((activity: any) => (
                  <TableRow key={activity.id}>
                    <TableCell>
                      <Chip
                        label={activity.type}
                        size="small"
                        color={
                          activity.type === 'stake' ? 'success' :
                          activity.type === 'unstake' ? 'warning' : 'info'
                        }
                      />
                    </TableCell>
                    <TableCell>{shortenAddress(activity.userId)}</TableCell>
                    <TableCell align="right">{formatToken(activity.amount)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(activity.timestamp)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Analytics Tab */}
        <TabPanel value={tabValue} index={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Staking Volume (7 Days)
              </Typography>
              <Box sx={{ height: 200 }}>
                <Bar
                  data={{
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [
                      {
                        label: 'Stakes',
                        data: [12, 19, 3, 5, 2, 3, 15],
                        backgroundColor: 'rgba(75, 192, 192, 0.8)',
                      },
                      {
                        label: 'Unstakes',
                        data: [2, 3, 1, 0, 1, 2, 3],
                        backgroundColor: 'rgba(255, 99, 132, 0.8)',
                      },
                    ],
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
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Revenue Distribution
              </Typography>
              <Box sx={{ py: 2 }}>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Total Revenue (30d)</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {formatToken(metrics?.totalRevenueGenerated || 0)}
                    </Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={100} />
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Stakers Share ({pool?.revenueSharePercent}%)</Typography>
                    <Typography variant="body2" fontWeight="bold" color="success.main">
                      {formatToken(
                        ((metrics?.totalRevenueGenerated || 0) * BigInt(pool?.revenueSharePercent || 0)) / 100n
                      )}
                    </Typography>
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={pool?.revenueSharePercent || 0}
                    color="success"
                  />
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">
                      Influencer Share ({100 - (pool?.revenueSharePercent || 0)}%)
                    </Typography>
                    <Typography variant="body2" fontWeight="bold" color="info.main">
                      {formatToken(
                        ((metrics?.totalRevenueGenerated || 0) * BigInt(100 - (pool?.revenueSharePercent || 0))) / 100n
                      )}
                    </Typography>
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={100 - (pool?.revenueSharePercent || 0)}
                    color="info"
                  />
                </Box>
              </Box>
            </Grid>
          </Grid>
        </TabPanel>
      </DialogContent>
    </Dialog>
  );
};