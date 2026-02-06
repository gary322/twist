import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Grid,
  Paper,
  Card,
  CardContent,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  Alert,
  Skeleton,
  LinearProgress,
  Menu,
  MenuItem,
  Tooltip,
  Badge,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  AccountBalanceWallet,
  TrendingUp,
  TrendingDown,
  AttachMoney,
  Timeline,
  PieChart,
  Settings,
  Download,
  Refresh,
  Add,
  Remove,
  SwapVert,
  Info,
  CheckCircle,
  Warning,
  MoreVert,
  ContentCopy,
  OpenInNew,
} from '@mui/icons-material';
import { Pie, Line, Bar } from 'react-chartjs-2';
import { useWallet } from '@solana/wallet-adapter-react';
import { useNavigate } from 'react-router-dom';
import { formatToken, formatNumber, formatPercent, formatDate, shortenAddress } from '../utils/format';
import { api } from '../services/api';
import { ClaimRewardsModal } from '../components/ClaimRewardsModal';
import { UnstakeModal } from '../components/UnstakeModal';
import { RebalanceModal } from '../components/RebalanceModal';

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
      id={`portfolio-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

interface StakePosition {
  id: string;
  influencer: {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
    tier: string;
    verified: boolean;
  };
  stake: {
    amount: string;
    stakedAt: string;
    pendingRewards: string;
    totalClaimed: string;
    lastClaim: string;
    apy: number;
  };
  pool: {
    poolAddress: string;
    totalStaked: string;
    stakerCount: number;
    revenueSharePercent: number;
  };
  performance: {
    value: string;
    change24h: number;
    change7d: number;
    change30d: number;
  };
}

export const PortfolioManagement: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<StakePosition[]>([]);
  const [portfolioStats, setPortfolioStats] = useState<any>(null);
  const [selectedPosition, setSelectedPosition] = useState<StakePosition | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<null | HTMLElement>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showUnstakeModal, setShowUnstakeModal] = useState(false);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [autoCompound, setAutoCompound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (connected && publicKey) {
      loadPortfolioData();
    }
  }, [connected, publicKey]);

  const loadPortfolioData = async () => {
    if (!publicKey) return;
    
    try {
      setLoading(true);
      const [positionsData, statsData] = await Promise.all([
        api.getUserPortfolio(publicKey.toBase58()),
        api.getPortfolioStats(publicKey.toBase58()),
      ]);
      
      setPositions(positionsData);
      setPortfolioStats(statsData);
    } catch (error) {
      console.error('Failed to load portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPortfolioData();
    setRefreshing(false);
  };

  const handleClaimAll = async () => {
    try {
      const claimablePositions = positions.filter(p => 
        BigInt(p.stake.pendingRewards) > 0n
      );
      
      // Process claims in parallel
      await Promise.all(
        claimablePositions.map(position =>
          api.claimRewards({
            influencerId: position.influencer.id,
            wallet: publicKey!.toBase58(),
          })
        )
      );
      
      await loadPortfolioData();
    } catch (error) {
      console.error('Failed to claim all rewards:', error);
    }
  };

  const handleActionMenuOpen = (event: React.MouseEvent<HTMLElement>, position: StakePosition) => {
    setActionMenuAnchor(event.currentTarget);
    setSelectedPosition(position);
  };

  const handleActionMenuClose = () => {
    setActionMenuAnchor(null);
  };

  const getTotalValue = () => {
    return positions.reduce((sum, p) => sum + BigInt(p.stake.amount), 0n);
  };

  const getTotalPendingRewards = () => {
    return positions.reduce((sum, p) => sum + BigInt(p.stake.pendingRewards), 0n);
  };

  const getAverageAPY = () => {
    if (positions.length === 0) return 0;
    const totalValue = getTotalValue();
    if (totalValue === 0n) return 0;
    
    const weightedAPY = positions.reduce((sum, p) => {
      const weight = Number(BigInt(p.stake.amount) * 10000n / totalValue) / 10000;
      return sum + (p.stake.apy * weight);
    }, 0);
    
    return weightedAPY;
  };

  const getPortfolioChange = () => {
    return portfolioStats?.change24h || 0;
  };

  if (!connected) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>
          Connect your wallet to view your portfolio
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/staking')}
          sx={{ mt: 2 }}
        >
          Go to Staking
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Portfolio Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your staking positions and optimize returns
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <IconButton onClick={handleRefresh} disabled={refreshing}>
            <Refresh />
          </IconButton>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={() => {/* Export portfolio data */}}
          >
            Export
          </Button>
        </Box>
      </Box>

      {/* Portfolio Overview */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <AccountBalanceWallet sx={{ color: 'primary.main', mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Total Value
                </Typography>
              </Box>
              <Typography variant="h4" gutterBottom>
                {formatToken(getTotalValue())}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {getPortfolioChange() >= 0 ? (
                  <TrendingUp sx={{ color: 'success.main', mr: 0.5 }} />
                ) : (
                  <TrendingDown sx={{ color: 'error.main', mr: 0.5 }} />
                )}
                <Typography
                  variant="body2"
                  color={getPortfolioChange() >= 0 ? 'success.main' : 'error.main'}
                >
                  {getPortfolioChange() >= 0 ? '+' : ''}{getPortfolioChange().toFixed(2)}%
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  24h
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <AttachMoney sx={{ color: 'success.main', mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Pending Rewards
                </Typography>
              </Box>
              <Typography variant="h4" gutterBottom>
                {formatToken(getTotalPendingRewards())}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="success"
                onClick={handleClaimAll}
                disabled={getTotalPendingRewards() === 0n}
                fullWidth
              >
                Claim All
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Timeline sx={{ color: 'info.main', mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Average APY
                </Typography>
              </Box>
              <Typography variant="h4" gutterBottom>
                {getAverageAPY().toFixed(2)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Weighted by position size
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PieChart sx={{ color: 'warning.main', mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Positions
                </Typography>
              </Box>
              <Typography variant="h4" gutterBottom>
                {positions.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Active staking positions
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Content */}
      <Paper sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
            <Tab label="Positions" />
            <Tab label="Analytics" />
            <Tab label="History" />
            <Tab label="Settings" />
          </Tabs>
        </Box>

        {/* Positions Tab */}
        <TabPanel value={tabValue} index={0}>
          {loading ? (
            <Box sx={{ p: 3 }}>
              {[1, 2, 3].map(i => (
                <Skeleton key={i} variant="rectangular" height={80} sx={{ mb: 2 }} />
              ))}
            </Box>
          ) : positions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No staking positions yet
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => navigate('/staking')}
                sx={{ mt: 2 }}
              >
                Start Staking
              </Button>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Influencer</TableCell>
                      <TableCell align="right">Amount Staked</TableCell>
                      <TableCell align="right">Current Value</TableCell>
                      <TableCell align="right">Pending Rewards</TableCell>
                      <TableCell align="right">APY</TableCell>
                      <TableCell align="center">Performance</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {positions.map((position) => (
                      <TableRow key={position.id}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Badge
                              overlap="circular"
                              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                              badgeContent={
                                position.influencer.verified ? (
                                  <CheckCircle sx={{ width: 16, height: 16, color: '#1DA1F2' }} />
                                ) : null
                              }
                            >
                              <Avatar src={position.influencer.avatar} />
                            </Badge>
                            <Box>
                              <Typography variant="body2" fontWeight="medium">
                                {position.influencer.displayName}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                  @{position.influencer.username}
                                </Typography>
                                <Chip
                                  label={position.influencer.tier}
                                  size="small"
                                  sx={{ height: 16, fontSize: '0.7rem' }}
                                />
                              </Box>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatToken(position.stake.amount)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Since {formatDate(position.stake.stakedAt)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="medium">
                            {formatToken(position.performance.value)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="success.main">
                            {formatToken(position.stake.pendingRewards)}
                          </Typography>
                          {BigInt(position.stake.pendingRewards) > 0n && (
                            <Button
                              size="small"
                              variant="text"
                              color="success"
                              onClick={() => {
                                setSelectedPosition(position);
                                setShowClaimModal(true);
                              }}
                            >
                              Claim
                            </Button>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="medium">
                            {position.stake.apy.toFixed(2)}%
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Chip
                              label={`${position.performance.change24h >= 0 ? '+' : ''}${position.performance.change24h.toFixed(2)}%`}
                              size="small"
                              color={position.performance.change24h >= 0 ? 'success' : 'error'}
                              variant="outlined"
                            />
                            <Typography variant="caption" color="text.secondary">
                              24h
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={(e) => handleActionMenuOpen(e, position)}
                          >
                            <MoreVert />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Quick Actions */}
              <Box sx={{ p: 2, display: 'flex', gap: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Button
                  variant="outlined"
                  startIcon={<SwapVert />}
                  onClick={() => setShowRebalanceModal(true)}
                >
                  Rebalance Portfolio
                </Button>
                <FormControlLabel
                  control={
                    <Switch
                      checked={autoCompound}
                      onChange={(e) => setAutoCompound(e.target.checked)}
                    />
                  }
                  label="Auto-compound rewards"
                />
              </Box>
            </>
          )}
        </TabPanel>

        {/* Analytics Tab */}
        <TabPanel value={tabValue} index={1}>
          <PortfolioAnalytics positions={positions} stats={portfolioStats} />
        </TabPanel>

        {/* History Tab */}
        <TabPanel value={tabValue} index={2}>
          <StakingHistory />
        </TabPanel>

        {/* Settings Tab */}
        <TabPanel value={tabValue} index={3}>
          <PortfolioSettings />
        </TabPanel>
      </Paper>

      {/* Action Menu */}
      <Menu
        anchorEl={actionMenuAnchor}
        open={Boolean(actionMenuAnchor)}
        onClose={handleActionMenuClose}
      >
        <MenuItem onClick={() => {
          if (selectedPosition) {
            navigate(`/staking/${selectedPosition.influencer.id}`);
          }
          handleActionMenuClose();
        }}>
          <Add sx={{ mr: 1 }} fontSize="small" />
          Add to Position
        </MenuItem>
        <MenuItem onClick={() => {
          setShowUnstakeModal(true);
          handleActionMenuClose();
        }}>
          <Remove sx={{ mr: 1 }} fontSize="small" />
          Unstake
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedPosition) {
            navigator.clipboard.writeText(selectedPosition.pool.poolAddress);
          }
          handleActionMenuClose();
        }}>
          <ContentCopy sx={{ mr: 1 }} fontSize="small" />
          Copy Pool Address
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedPosition) {
            window.open(`https://solscan.io/account/${selectedPosition.pool.poolAddress}`, '_blank');
          }
          handleActionMenuClose();
        }}>
          <OpenInNew sx={{ mr: 1 }} fontSize="small" />
          View on Explorer
        </MenuItem>
      </Menu>

      {/* Modals */}
      {selectedPosition && showClaimModal && (
        <ClaimRewardsModal
          position={selectedPosition}
          onClose={() => setShowClaimModal(false)}
          onSuccess={() => {
            setShowClaimModal(false);
            loadPortfolioData();
          }}
        />
      )}

      {selectedPosition && showUnstakeModal && (
        <UnstakeModal
          position={selectedPosition}
          onClose={() => setShowUnstakeModal(false)}
          onSuccess={() => {
            setShowUnstakeModal(false);
            loadPortfolioData();
          }}
        />
      )}

      {showRebalanceModal && (
        <RebalanceModal
          positions={positions}
          onClose={() => setShowRebalanceModal(false)}
          onSuccess={() => {
            setShowRebalanceModal(false);
            loadPortfolioData();
          }}
        />
      )}
    </Container>
  );
};

// Portfolio Analytics Component
const PortfolioAnalytics: React.FC<{ positions: StakePosition[]; stats: any }> = ({ positions, stats }) => {
  const getDistributionData = () => {
    const totalValue = positions.reduce((sum, p) => sum + BigInt(p.stake.amount), 0n);
    
    return {
      labels: positions.map(p => p.influencer.displayName),
      datasets: [{
        data: positions.map(p => Number(BigInt(p.stake.amount) * 10000n / totalValue) / 100),
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
        ],
      }],
    };
  };

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Portfolio Distribution
          </Typography>
          <Box sx={{ height: 300 }}>
            <Pie
              data={getDistributionData()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom' as const,
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => {
                        return `${context.label}: ${context.parsed}%`;
                      },
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
            Portfolio Value (30 Days)
          </Typography>
          <Box sx={{ height: 300 }}>
            <Line
              data={{
                labels: stats?.valueHistory?.labels || [],
                datasets: [{
                  label: 'Portfolio Value',
                  data: stats?.valueHistory?.data || [],
                  borderColor: 'rgb(75, 192, 192)',
                  backgroundColor: 'rgba(75, 192, 192, 0.1)',
                  fill: true,
                  tension: 0.4,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                },
                scales: {
                  y: {
                    beginAtZero: false,
                    ticks: {
                      callback: (value) => formatToken(value as number),
                    },
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
            Rewards History
          </Typography>
          <Box sx={{ height: 300 }}>
            <Bar
              data={{
                labels: stats?.rewardsHistory?.labels || [],
                datasets: [{
                  label: 'Rewards Claimed',
                  data: stats?.rewardsHistory?.claimed || [],
                  backgroundColor: 'rgba(75, 192, 192, 0.8)',
                }, {
                  label: 'Rewards Pending',
                  data: stats?.rewardsHistory?.pending || [],
                  backgroundColor: 'rgba(255, 206, 86, 0.8)',
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: {
                    beginAtZero: true,
                    stacked: true,
                    ticks: {
                      callback: (value) => formatToken(value as number),
                    },
                  },
                  x: {
                    stacked: true,
                  },
                },
              }}
            />
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
};

// Staking History Component
const StakingHistory: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await api.getStakingHistory();
      setHistory(data);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Skeleton variant="rectangular" height={400} />;
  }

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Influencer</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell>Transaction</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {history.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{formatDate(item.createdAt)}</TableCell>
              <TableCell>
                <Chip
                  label={item.action}
                  size="small"
                  color={
                    item.action === 'stake' ? 'success' :
                    item.action === 'unstake' ? 'warning' :
                    'info'
                  }
                />
              </TableCell>
              <TableCell>{item.influencer.displayName}</TableCell>
              <TableCell align="right">{formatToken(item.amount)}</TableCell>
              <TableCell>
                <Link
                  href={`https://solscan.io/tx/${item.transactionId}`}
                  target="_blank"
                  rel="noopener"
                >
                  {shortenAddress(item.transactionId)}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

// Portfolio Settings Component
const PortfolioSettings: React.FC = () => {
  const [settings, setSettings] = useState({
    autoCompound: false,
    rebalanceThreshold: 10,
    notifications: {
      rewards: true,
      priceChanges: true,
      tierChanges: true,
    },
  });

  const handleSave = async () => {
    try {
      await api.updatePortfolioSettings(settings);
      // Show success message
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  return (
    <Box sx={{ maxWidth: 600 }}>
      <Typography variant="h6" gutterBottom>
        Portfolio Settings
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Automation
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={settings.autoCompound}
              onChange={(e) => setSettings({ ...settings, autoCompound: e.target.checked })}
            />
          }
          label="Auto-compound rewards"
        />
        <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4 }}>
          Automatically reinvest claimed rewards into your positions
        </Typography>

        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" gutterBottom>
            Rebalance Threshold
          </Typography>
          <TextField
            type="number"
            value={settings.rebalanceThreshold}
            onChange={(e) => setSettings({ ...settings, rebalanceThreshold: Number(e.target.value) })}
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
            helperText="Alert when any position deviates from target allocation by this percentage"
            fullWidth
          />
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Notifications
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={settings.notifications.rewards}
              onChange={(e) => setSettings({
                ...settings,
                notifications: { ...settings.notifications, rewards: e.target.checked }
              })}
            />
          }
          label="Rewards available to claim"
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.notifications.priceChanges}
              onChange={(e) => setSettings({
                ...settings,
                notifications: { ...settings.notifications, priceChanges: e.target.checked }
              })}
            />
          }
          label="Significant price changes"
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.notifications.tierChanges}
              onChange={(e) => setSettings({
                ...settings,
                notifications: { ...settings.notifications, tierChanges: e.target.checked }
              })}
            />
          }
          label="Influencer tier changes"
        />
      </Paper>

      <Button variant="contained" onClick={handleSave}>
        Save Settings
      </Button>
    </Box>
  );
};