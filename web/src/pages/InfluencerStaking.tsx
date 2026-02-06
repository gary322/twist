import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  InputAdornment,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  Divider,
  Collapse,
  Switch,
  FormControlLabel,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  Search,
  TrendingUp,
  People,
  Star,
  Shield,
  FilterList,
  ExpandMore,
  ExpandLess,
  AccountBalanceWallet,
  Info,
  Refresh,
  CheckCircle,
  ContentCopy,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { formatToken, formatNumber } from '../utils/format';
import { StakingModal } from '../components/StakingModal';
import { InfluencerDetailsModal } from '../components/InfluencerDetailsModal';
import { PortfolioSummary } from '../components/PortfolioSummary';

interface Influencer {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  verified: boolean;
  bio?: string;
  poolAddress: string;
  metrics: {
    totalStaked: string;
    stakerCount: number;
    revenueSharePercent: number;
    apy: number;
    totalRewardsDistributed: string;
    stakingTrend: 'up' | 'down' | 'stable';
  };
  recentStakers: Array<{
    userId: string;
    amount: string;
    stakedAt: string;
  }>;
}

export const InfluencerStaking: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'totalStaked' | 'stakerCount' | 'apy'>('totalStaked');
  const [filters, setFilters] = useState({
    minStaked: 0,
    minApy: 0,
    tiers: [] as string[],
  });
  const [showFilters, setShowFilters] = useState(false);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [userStakes, setUserStakes] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showOnlyStaked, setShowOnlyStaked] = useState(false);

  useEffect(() => {
    searchInfluencers();
    if (connected && publicKey) {
      loadUserStakes();
    }
  }, [searchQuery, sortBy, filters, connected]);

  const searchInfluencers = async () => {
    setLoading(true);
    try {
      const results = await api.searchInfluencers({
        query: searchQuery,
        sortBy,
        filters: {
          minStaked: filters.minStaked,
          minApy: filters.minApy,
          tiers: filters.tiers.length > 0 ? filters.tiers : undefined,
        },
        limit: 20,
      });
      setInfluencers(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserStakes = async () => {
    if (!publicKey) return;
    try {
      const stakes = await api.getUserStakes(publicKey.toBase58());
      setUserStakes(stakes);
    } catch (error) {
      console.error('Failed to load user stakes:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([searchInfluencers(), loadUserStakes()]);
    setRefreshing(false);
  };

  const handleStake = (influencer: Influencer) => {
    if (!connected) {
      // Show connect wallet dialog
      return;
    }
    setSelectedInfluencer(influencer);
  };

  const handleTierFilterToggle = (tier: string) => {
    setFilters(prev => ({
      ...prev,
      tiers: prev.tiers.includes(tier)
        ? prev.tiers.filter(t => t !== tier)
        : [...prev.tiers, tier],
    }));
  };

  const isStaked = (influencerId: string) => {
    return userStakes.some(stake => stake.influencer.id === influencerId);
  };

  const getUserStakeAmount = (influencerId: string) => {
    const stake = userStakes.find(s => s.influencer.id === influencerId);
    return stake ? stake.stake.amount : '0';
  };

  const filteredInfluencers = showOnlyStaked
    ? influencers.filter(inf => isStaked(inf.id))
    : influencers;

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'PLATINUM': return '#E5E4E2';
      case 'GOLD': return '#FFD700';
      case 'SILVER': return '#C0C0C0';
      default: return '#CD7F32';
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'PLATINUM': return '💎';
      case 'GOLD': return '🥇';
      case 'SILVER': return '🥈';
      default: return '🥉';
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Stake on Influencers
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Stake TWIST tokens on your favorite influencers and earn a share of their revenue
        </Typography>
      </Box>

      {/* Portfolio Summary */}
      {connected && userStakes.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <PortfolioSummary stakes={userStakes} />
        </Box>
      )}

      {/* Search and Filters */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              placeholder="Search influencers by name or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  label="Sort By"
                >
                  <MenuItem value="totalStaked">Most Staked</MenuItem>
                  <MenuItem value="stakerCount">Most Stakers</MenuItem>
                  <MenuItem value="apy">Highest APY</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                startIcon={<FilterList />}
                onClick={() => setShowFilters(!showFilters)}
                endIcon={showFilters ? <ExpandLess /> : <ExpandMore />}
              >
                Filters
              </Button>
              {connected && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={showOnlyStaked}
                      onChange={(e) => setShowOnlyStaked(e.target.checked)}
                    />
                  }
                  label="My Stakes"
                />
              )}
              <IconButton onClick={handleRefresh} disabled={refreshing}>
                <Refresh />
              </IconButton>
            </Box>
          </Grid>
        </Grid>

        {/* Advanced Filters */}
        <Collapse in={showFilters}>
          <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Typography gutterBottom>Minimum Staked (TWIST)</Typography>
                <Slider
                  value={filters.minStaked}
                  onChange={(e, value) => setFilters({ ...filters, minStaked: value as number })}
                  min={0}
                  max={100000}
                  step={1000}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) => formatNumber(value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography gutterBottom>Minimum APY (%)</Typography>
                <Slider
                  value={filters.minApy}
                  onChange={(e, value) => setFilters({ ...filters, minApy: value as number })}
                  min={0}
                  max={50}
                  step={1}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) => `${value}%`}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography gutterBottom>Tiers</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'].map(tier => (
                    <Chip
                      key={tier}
                      label={tier}
                      onClick={() => handleTierFilterToggle(tier)}
                      color={filters.tiers.includes(tier) ? 'primary' : 'default'}
                      variant={filters.tiers.includes(tier) ? 'filled' : 'outlined'}
                      icon={<span>{getTierIcon(tier)}</span>}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Collapse>
      </Paper>

      {/* Stats Bar */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Total Value Staked
            </Typography>
            <Typography variant="h6">
              {formatToken(
                filteredInfluencers.reduce((sum, inf) => 
                  sum + BigInt(inf.metrics.totalStaked), 0n
                )
              )}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Active Stakers
            </Typography>
            <Typography variant="h6">
              {formatNumber(
                filteredInfluencers.reduce((sum, inf) => 
                  sum + inf.metrics.stakerCount, 0
                )
              )}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Average APY
            </Typography>
            <Typography variant="h6" color="success.main">
              {filteredInfluencers.length > 0
                ? (filteredInfluencers.reduce((sum, inf) => sum + inf.metrics.apy, 0) / 
                   filteredInfluencers.length).toFixed(1)
                : 0}%
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Your Active Stakes
            </Typography>
            <Typography variant="h6" color="primary">
              {userStakes.length}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Influencer Grid */}
      {loading ? (
        <Grid container spacing={3}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={300} />
            </Grid>
          ))}
        </Grid>
      ) : filteredInfluencers.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No influencers found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Try adjusting your search criteria or filters
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filteredInfluencers.map((influencer) => (
            <Grid item xs={12} sm={6} md={4} key={influencer.id}>
              <InfluencerCard
                influencer={influencer}
                isStaked={isStaked(influencer.id)}
                stakedAmount={getUserStakeAmount(influencer.id)}
                onStake={() => handleStake(influencer)}
                onViewDetails={() => {
                  setSelectedInfluencer(influencer);
                  setShowDetails(true);
                }}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Modals */}
      {selectedInfluencer && !showDetails && (
        <StakingModal
          influencer={selectedInfluencer}
          onClose={() => setSelectedInfluencer(null)}
          onSuccess={() => {
            searchInfluencers();
            loadUserStakes();
            setSelectedInfluencer(null);
          }}
        />
      )}

      {selectedInfluencer && showDetails && (
        <InfluencerDetailsModal
          influencerId={selectedInfluencer.id}
          onClose={() => {
            setShowDetails(false);
            setSelectedInfluencer(null);
          }}
          onStake={() => {
            setShowDetails(false);
          }}
        />
      )}
    </Container>
  );
};

// Influencer Card Component
const InfluencerCard: React.FC<{
  influencer: Influencer;
  isStaked: boolean;
  stakedAmount: string;
  onStake: () => void;
  onViewDetails: () => void;
}> = ({ influencer, isStaked, stakedAmount, onStake, onViewDetails }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
    >
      <Card sx={{ height: '100%', position: 'relative', overflow: 'visible' }}>
        {/* Tier Badge */}
        <Box
          sx={{
            position: 'absolute',
            top: -10,
            right: 16,
            bgcolor: getTierColor(influencer.tier),
            color: 'white',
            px: 2,
            py: 0.5,
            borderRadius: 2,
            fontSize: '0.75rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            boxShadow: 2,
          }}
        >
          <span>{getTierIcon(influencer.tier)}</span>
          {influencer.tier}
        </Box>

        <CardContent>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
            <Badge
              overlap="circular"
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              badgeContent={
                influencer.verified ? (
                  <Shield sx={{ width: 20, height: 20, color: '#1DA1F2' }} />
                ) : null
              }
            >
              <Avatar
                src={influencer.avatar}
                sx={{ width: 56, height: 56, mr: 2 }}
              />
            </Badge>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" noWrap>
                {influencer.displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                @{influencer.username}
              </Typography>
              {influencer.metrics.stakingTrend === 'up' && (
                <Chip
                  label="Trending"
                  size="small"
                  color="success"
                  icon={<TrendingUp />}
                  sx={{ mt: 0.5 }}
                />
              )}
            </Box>
          </Box>

          {/* Bio */}
          {influencer.bio && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 2,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {influencer.bio}
            </Typography>
          )}

          {/* Metrics */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Total Staked
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {formatToken(influencer.metrics.totalStaked)}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Stakers
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {formatNumber(influencer.metrics.stakerCount)}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  APY
                </Typography>
                <Typography variant="body1" fontWeight="bold" color="success.main">
                  {influencer.metrics.apy.toFixed(2)}%
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Revenue Share
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {influencer.metrics.revenueSharePercent}%
                </Typography>
              </Box>
            </Grid>
          </Grid>

          {/* Your Stake */}
          {isStaked && (
            <Box
              sx={{
                bgcolor: 'primary.light',
                color: 'primary.contrastText',
                p: 1,
                borderRadius: 1,
                mb: 2,
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption">Your Stake</Typography>
                <CheckCircle sx={{ width: 16, height: 16 }} />
              </Box>
              <Typography variant="body2" fontWeight="bold">
                {formatToken(stakedAmount)} TWIST
              </Typography>
            </Box>
          )}

          {/* Recent Stakers */}
          {influencer.recentStakers.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Recent stakers
              </Typography>
              <Box sx={{ display: 'flex', mt: 0.5 }}>
                {influencer.recentStakers.slice(0, 5).map((staker, i) => (
                  <Avatar
                    key={i}
                    sx={{
                      width: 24,
                      height: 24,
                      bgcolor: 'primary.main',
                      fontSize: '0.75rem',
                      ml: i > 0 ? -0.5 : 0,
                      border: '2px solid white',
                      zIndex: 5 - i,
                    }}
                  >
                    {staker.userId.substring(0, 2).toUpperCase()}
                  </Avatar>
                ))}
                {influencer.metrics.stakerCount > 5 && (
                  <Avatar
                    sx={{
                      width: 24,
                      height: 24,
                      bgcolor: 'grey.300',
                      fontSize: '0.6rem',
                      ml: -0.5,
                      border: '2px solid white',
                    }}
                  >
                    +{influencer.metrics.stakerCount - 5}
                  </Avatar>
                )}
              </Box>
            </Box>
          )}
        </CardContent>

        <Divider />

        <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
          <Button
            size="small"
            startIcon={<Info />}
            onClick={onViewDetails}
          >
            Details
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AccountBalanceWallet />}
            onClick={onStake}
          >
            {isStaked ? 'Manage' : 'Stake'}
          </Button>
        </CardActions>

        {/* Copy Address Button (visible on hover) */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              style={{
                position: 'absolute',
                bottom: -32,
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            >
              <Tooltip title="Copy pool address">
                <IconButton
                  size="small"
                  onClick={() => {
                    navigator.clipboard.writeText(influencer.poolAddress);
                    // Show toast
                  }}
                  sx={{
                    bgcolor: 'background.paper',
                    boxShadow: 2,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <ContentCopy fontSize="small" />
                </IconButton>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
};