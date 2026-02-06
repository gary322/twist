import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Paper,
  Chip,
} from '@mui/material';
import {
  AttachMoney,
  CheckCircle,
  AccountBalanceWallet,
  TrendingUp,
} from '@mui/icons-material';
import { useWallet } from '@solana/wallet-adapter-react';
import { formatToken, formatDate } from '../utils/format';
import { api } from '../services/api';

interface ClaimRewardsModalProps {
  position: {
    influencer: {
      id: string;
      displayName: string;
      username: string;
    };
    stake: {
      pendingRewards: string;
      totalClaimed: string;
      lastClaim: string;
    };
  };
  onClose: () => void;
  onSuccess: () => void;
}

export const ClaimRewardsModal: React.FC<ClaimRewardsModalProps> = ({
  position,
  onClose,
  onSuccess,
}) => {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleClaim = async () => {
    if (!publicKey) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.claimRewards({
        influencerId: position.influencer.id,
        wallet: publicKey.toBase58(),
      });

      setTxHash(result.transactionId);
      setSuccess(true);

      // Wait a bit before closing
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to claim rewards');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AttachMoney />
          <Box>
            <Typography variant="h6">Claim Rewards</Typography>
            <Typography variant="caption" color="text.secondary">
              {position.influencer.displayName} (@{position.influencer.username})
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {!success ? (
          <Box>
            <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Available to Claim
                    </Typography>
                    <Typography variant="h3" color="success.main" gutterBottom>
                      {formatToken(position.stake.pendingRewards)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      TWIST tokens
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Total Claimed
                  </Typography>
                  <Typography variant="body1">
                    {formatToken(position.stake.totalClaimed)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Last Claim
                  </Typography>
                  <Typography variant="body1">
                    {position.stake.lastClaim 
                      ? formatDate(position.stake.lastClaim)
                      : 'Never'
                    }
                  </Typography>
                </Grid>
              </Grid>
            </Paper>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Alert severity="info" icon={<AccountBalanceWallet />}>
              Rewards will be sent to your connected wallet address
            </Alert>
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Rewards Claimed Successfully!
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {formatToken(position.stake.pendingRewards)} TWIST has been sent to your wallet
            </Typography>
            {txHash && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Transaction ID:
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                  onClick={() => window.open(`https://solscan.io/tx/${txHash}`, '_blank')}
                >
                  {txHash.substring(0, 8)}...{txHash.substring(txHash.length - 8)}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {!success ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleClaim}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <AttachMoney />}
            >
              {loading ? 'Claiming...' : 'Claim Rewards'}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};