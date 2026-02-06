import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Slider,
  Chip,
  Grid,
  Paper,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import {
  Remove,
  Warning,
  AccountBalanceWallet,
  CheckCircle,
} from '@mui/icons-material';
import { useWallet } from '@solana/wallet-adapter-react';
import { formatToken, parseToken } from '../utils/format';
import { api } from '../services/api';

interface UnstakeModalProps {
  position: {
    id: string;
    influencer: {
      id: string;
      displayName: string;
      username: string;
    };
    stake: {
      amount: string;
      pendingRewards: string;
    };
  };
  onClose: () => void;
  onSuccess: () => void;
}

export const UnstakeModal: React.FC<UnstakeModalProps> = ({
  position,
  onClose,
  onSuccess,
}) => {
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const totalStaked = BigInt(position.stake.amount);
  const pendingRewards = BigInt(position.stake.pendingRewards);

  const handleAmountChange = (value: string) => {
    setAmount(value);
    if (value && totalStaked > 0n) {
      const amountBigInt = parseToken(value);
      const percent = Number((amountBigInt * 100n) / totalStaked);
      setPercentage(Math.min(100, Math.max(0, percent)));
    } else {
      setPercentage(0);
    }
  };

  const handlePercentageChange = (value: number) => {
    setPercentage(value);
    const amountBigInt = (totalStaked * BigInt(value)) / 100n;
    setAmount(formatToken(amountBigInt));
  };

  const handleUnstake = async () => {
    if (!publicKey || !amount || confirmText !== 'UNSTAKE') return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.unstake({
        influencerId: position.influencer.id,
        amount: parseToken(amount).toString(),
        wallet: publicKey.toBase58(),
      });

      setTxHash(result.transactionId);
      setSuccess(true);

      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to unstake');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Remove />
          <Box>
            <Typography variant="h6">Unstake from {position.influencer.displayName}</Typography>
            <Typography variant="caption" color="text.secondary">
              @{position.influencer.username}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {!success ? (
          <Box>
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Important:</strong> Unstaking will:
              </Typography>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li>Return your staked tokens to your wallet</li>
                <li>Stop earning rewards from this position</li>
                <li>Reduce your share in the staking pool</li>
              </ul>
              {pendingRewards > 0n && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  You have <strong>{formatToken(pendingRewards)} TWIST</strong> in pending rewards.
                  Consider claiming them first.
                </Typography>
              )}
            </Alert>

            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Currently Staked: {formatToken(totalStaked)} TWIST
              </Typography>
            </Paper>

            <TextField
              fullWidth
              label="Unstake Amount"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              type="number"
              InputProps={{
                endAdornment: <InputAdornment position="end">TWIST</InputAdornment>,
              }}
              sx={{ mb: 3 }}
            />

            <Typography variant="body2" color="text.secondary" gutterBottom>
              Percentage to Unstake
            </Typography>
            <Box sx={{ px: 1, mb: 3 }}>
              <Slider
                value={percentage}
                onChange={(e, value) => handlePercentageChange(value as number)}
                marks={[
                  { value: 0, label: '0%' },
                  { value: 25, label: '25%' },
                  { value: 50, label: '50%' },
                  { value: 75, label: '75%' },
                  { value: 100, label: '100%' },
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value}%`}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
              <Chip
                label="25%"
                onClick={() => handlePercentageChange(25)}
                variant={percentage === 25 ? 'filled' : 'outlined'}
                size="small"
              />
              <Chip
                label="50%"
                onClick={() => handlePercentageChange(50)}
                variant={percentage === 50 ? 'filled' : 'outlined'}
                size="small"
              />
              <Chip
                label="75%"
                onClick={() => handlePercentageChange(75)}
                variant={percentage === 75 ? 'filled' : 'outlined'}
                size="small"
              />
              <Chip
                label="100%"
                onClick={() => handlePercentageChange(100)}
                variant={percentage === 100 ? 'filled' : 'outlined'}
                size="small"
              />
            </Box>

            <Alert severity="error" icon={<Warning />} sx={{ mb: 3 }}>
              To confirm unstaking, type <strong>UNSTAKE</strong> below
            </Alert>

            <TextField
              fullWidth
              label="Type UNSTAKE to confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="UNSTAKE"
            />

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Unstake Successful!
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {amount} TWIST has been returned to your wallet
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
              color="error"
              onClick={handleUnstake}
              disabled={
                loading || 
                !amount || 
                parseToken(amount) === 0n || 
                parseToken(amount) > totalStaked ||
                confirmText !== 'UNSTAKE'
              }
              startIcon={loading ? <CircularProgress size={20} /> : <Remove />}
            >
              {loading ? 'Processing...' : 'Unstake'}
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