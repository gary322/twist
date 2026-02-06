import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
} from '@mui/material';
import { Person, TrendingUp, Close } from '@mui/icons-material';
import { formatToken, formatDate, formatNumber } from '../../utils/format';
import { api } from '../../services/api';

interface StakersWidgetProps {
  poolId: string;
}

interface Staker {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  amount: string;
  stakedAt: string;
  pendingRewards: string;
  rank: number;
  percentage: number;
}

export const StakersWidget: React.FC<StakersWidgetProps> = ({ poolId }) => {
  const [topStakers, setTopStakers] = useState<Staker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllDialog, setShowAllDialog] = useState(false);
  const [allStakers, setAllStakers] = useState<Staker[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  useEffect(() => {
    if (poolId) {
      loadTopStakers();
    }
  }, [poolId]);

  const loadTopStakers = async () => {
    try {
      setLoading(true);
      const data = await api.getTopStakers(poolId, { limit: 5 });
      setTopStakers(data);
    } catch (error) {
      console.error('Failed to load top stakers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllStakers = async () => {
    try {
      setLoadingAll(true);
      const data = await api.getTopStakers(poolId, { limit: 100 });
      setAllStakers(data);
    } catch (error) {
      console.error('Failed to load all stakers:', error);
    } finally {
      setLoadingAll(false);
    }
  };

  const handleShowAll = () => {
    setShowAllDialog(true);
    if (allStakers.length === 0) {
      loadAllStakers();
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return '🥇';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      default:
        return null;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'warning.main';
      case 2:
        return 'grey.500';
      case 3:
        return 'warning.dark';
      default:
        return 'text.primary';
    }
  };

  return (
    <>
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Top Stakers</Typography>
            {topStakers.length > 0 && (
              <Button size="small" onClick={handleShowAll}>
                View All
              </Button>
            )}
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : topStakers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No stakers yet
            </Typography>
          ) : (
            <List sx={{ p: 0 }}>
              {topStakers.map((staker, index) => (
                <ListItem
                  key={staker.id}
                  sx={{
                    px: 0,
                    py: 1.5,
                    borderBottom: index < topStakers.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 30 }}>
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        color={getRankColor(staker.rank)}
                      >
                        {getRankIcon(staker.rank) || `#${staker.rank}`}
                      </Typography>
                    </Box>
                    <ListItemAvatar sx={{ minWidth: 40 }}>
                      <Avatar
                        src={staker.avatar}
                        sx={{ width: 32, height: 32 }}
                      >
                        <Person fontSize="small" />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography variant="body2" noWrap>
                          {staker.username}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {staker.percentage.toFixed(1)}% of pool
                        </Typography>
                      }
                      sx={{ minWidth: 0 }}
                    />
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="body2" fontWeight="medium">
                        {formatToken(staker.amount)}
                      </Typography>
                      {parseFloat(staker.pendingRewards) > 0 && (
                        <Chip
                          label={`+${formatToken(staker.pendingRewards)}`}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                  </Box>
                </ListItem>
              ))}
            </List>
          )}

          {topStakers.length > 0 && (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Total Stakers
                </Typography>
                <Typography variant="caption" fontWeight="medium">
                  {formatNumber(topStakers[0]?.totalStakers || 0)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">
                  Avg. Stake
                </Typography>
                <Typography variant="caption" fontWeight="medium">
                  {formatToken(
                    topStakers[0]?.totalStaked && topStakers[0]?.totalStakers
                      ? BigInt(topStakers[0].totalStaked) / BigInt(topStakers[0].totalStakers)
                      : 0n
                  )}
                </Typography>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* All Stakers Dialog */}
      <Dialog
        open={showAllDialog}
        onClose={() => setShowAllDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">All Stakers</Typography>
            <IconButton onClick={() => setShowAllDialog(false)} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingAll ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Rank</TableCell>
                    <TableCell>Staker</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Share</TableCell>
                    <TableCell align="right">Pending Rewards</TableCell>
                    <TableCell>Staked Since</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allStakers.map((staker) => (
                    <TableRow key={staker.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography
                            variant="body2"
                            fontWeight="bold"
                            color={getRankColor(staker.rank)}
                          >
                            {getRankIcon(staker.rank) || staker.rank}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar
                            src={staker.avatar}
                            sx={{ width: 24, height: 24 }}
                          >
                            <Person fontSize="small" />
                          </Avatar>
                          <Typography variant="body2">
                            {staker.username}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="medium">
                          {formatToken(staker.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${staker.percentage.toFixed(2)}%`}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {parseFloat(staker.pendingRewards) > 0 ? (
                          <Typography variant="body2" color="success.main">
                            {formatToken(staker.pendingRewards)}
                          </Typography>
                        ) : (
                          '-'
                        )}
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
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};