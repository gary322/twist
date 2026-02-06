import React from 'react';
import {
  Paper,
  Box,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  Button,
} from '@mui/material';
import {
  AccountBalanceWallet,
  TrendingUp,
  AttachMoney,
  Timeline,
} from '@mui/icons-material';
import { formatToken, formatNumber } from '../utils/format';
import { useNavigate } from 'react-router-dom';

interface PortfolioSummaryProps {
  stakes: Array<{
    influencer: {
      id: string;
      username: string;
      displayName: string;
      tier: string;
    };
    stake: {
      amount: string;
      pendingRewards: string;
      apy: number;
    };
    pool: {
      totalStaked: string;
      stakerCount: number;
    };
  }>;
}

export const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({ stakes }) => {
  const navigate = useNavigate();

  const totalStaked = stakes.reduce((sum, s) => sum + BigInt(s.stake.amount), 0n);
  const totalPendingRewards = stakes.reduce((sum, s) => sum + BigInt(s.stake.pendingRewards), 0n);
  const averageApy = stakes.length > 0
    ? stakes.reduce((sum, s) => sum + s.stake.apy, 0) / stakes.length
    : 0;

  const topStake = stakes.reduce((top, current) => 
    BigInt(current.stake.amount) > BigInt(top.stake.amount) ? current : top
  , stakes[0]);

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AccountBalanceWallet sx={{ color: 'primary.main' }} />
          <Typography variant="h6">Your Staking Portfolio</Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Timeline />}
          onClick={() => navigate('/portfolio')}
        >
          View Details
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TrendingUp sx={{ color: 'text.secondary', fontSize: 20 }} />
              <Typography variant="body2" color="text.secondary">
                Total Staked
              </Typography>
            </Box>
            <Typography variant="h5" fontWeight="bold">
              {formatToken(totalStaked)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Across {stakes.length} influencers
            </Typography>
          </Box>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AttachMoney sx={{ color: 'text.secondary', fontSize: 20 }} />
              <Typography variant="body2" color="text.secondary">
                Pending Rewards
              </Typography>
            </Box>
            <Typography variant="h5" fontWeight="bold" color="success.main">
              {formatToken(totalPendingRewards)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Ready to claim
            </Typography>
          </Box>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Timeline sx={{ color: 'text.secondary', fontSize: 20 }} />
              <Typography variant="body2" color="text.secondary">
                Average APY
              </Typography>
            </Box>
            <Typography variant="h5" fontWeight="bold">
              {averageApy.toFixed(1)}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Portfolio average
            </Typography>
          </Box>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Top Position
              </Typography>
            </Box>
            <Typography variant="body1" fontWeight="medium" noWrap>
              {topStake?.influencer.displayName}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {formatToken(topStake?.stake.amount || 0)}
              </Typography>
              <Chip
                label={topStake?.influencer.tier}
                size="small"
                sx={{ height: 16, fontSize: '0.7rem' }}
              />
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Portfolio Distribution */}
      <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" gutterBottom>
          Portfolio Distribution
        </Typography>
        <Box sx={{ mt: 2 }}>
          {stakes.slice(0, 3).map((stake) => {
            const percentage = Number((BigInt(stake.stake.amount) * 100n) / totalStaked);
            return (
              <Box key={stake.influencer.id} sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" noWrap sx={{ maxWidth: '60%' }}>
                    {stake.influencer.displayName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {percentage.toFixed(1)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={percentage}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            );
          })}
          {stakes.length > 3 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              +{stakes.length - 3} more positions
            </Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
};