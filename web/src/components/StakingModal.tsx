import React, { useState, useEffect } from 'react';
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
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
  Grid,
  InputAdornment,
  Slider,
  Chip,
  Divider,
  Paper,
} from '@mui/material';
import {
  AccountBalanceWallet,
  TrendingUp,
  Calculate,
  CheckCircle,
  Warning,
} from '@mui/icons-material';
import { useWallet } from '@solana/wallet-adapter-react';
import { formatToken, parseToken } from '../utils/format';
import { api } from '../services/api';

interface StakingModalProps {
  influencer: {
    id: string;
    username: string;
    displayName: string;
    poolAddress: string;
    metrics: {
      totalStaked: string;
      stakerCount: number;
      revenueSharePercent: number;
      apy: number;
    };
  };
  onClose: () => void;
  onSuccess: () => void;
}

export const StakingModal: React.FC<StakingModalProps> = ({
  influencer,
  onClose,
  onSuccess,
}) => {
  const { publicKey, signTransaction } = useWallet();
  const [activeStep, setActiveStep] = useState(0);
  const [amount, setAmount] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const steps = ['Enter Amount', 'Confirm Details', 'Complete Staking'];

  useEffect(() => {
    if (publicKey) {
      loadBalance();
    }
  }, [publicKey]);

  const loadBalance = async () => {
    try {
      // In production, fetch actual TWIST balance
      setBalance(BigInt(100000) * BigInt(10 ** 9)); // Mock 100K TWIST
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    if (value && balance > 0n) {
      const amountBigInt = parseToken(value);
      const percent = Number((amountBigInt * 100n) / balance);
      setPercentage(Math.min(100, Math.max(0, percent)));
    } else {
      setPercentage(0);
    }
  };

  const handlePercentageChange = (value: number) => {
    setPercentage(value);
    const amountBigInt = (balance * BigInt(value)) / 100n;
    setAmount(formatToken(amountBigInt));
  };

  const calculateProjectedRewards = () => {
    if (!amount) return { daily: 0n, monthly: 0n, yearly: 0n };
    
    const stakedAmount = parseToken(amount);
    const apyDecimal = influencer.metrics.apy / 100;
    
    // Calculate daily, monthly, yearly rewards
    const yearlyRewards = (stakedAmount * BigInt(Math.floor(apyDecimal * 10000))) / 10000n;
    const dailyRewards = yearlyRewards / 365n;
    const monthlyRewards = yearlyRewards / 12n;
    
    return { daily: dailyRewards, monthly: monthlyRewards, yearly: yearlyRewards };
  };

  const handleStake = async () => {
    if (!publicKey || !amount) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.stakeOnInfluencer({
        influencerId: influencer.id,
        amount: parseToken(amount).toString(),
        wallet: publicKey.toBase58(),
      });

      setTxHash(result.transactionId);
      setActiveStep(2);
      
      // Wait a bit for transaction to confirm
      setTimeout(() => {
        onSuccess();
      }, 3000);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Staking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (activeStep === 0) {
      if (!amount || parseToken(amount) === 0n) {
        setError('Please enter a valid amount');
        return;
      }
      if (parseToken(amount) > balance) {
        setError('Insufficient balance');
        return;
      }
      setError(null);
      setActiveStep(1);
    } else if (activeStep === 1) {
      handleStake();
    }
  };

  const handleBack = () => {
    setActiveStep(activeStep - 1);
    setError(null);
  };

  const rewards = calculateProjectedRewards();

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AccountBalanceWallet />
          <Box>
            <Typography variant="h6">Stake on {influencer.displayName}</Typography>
            <Typography variant="caption" color="text.secondary">
              @{influencer.username}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {activeStep === 0 && (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Available Balance: {formatToken(balance)} TWIST
              </Typography>

              <TextField
                fullWidth
                label="Stake Amount"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                type="number"
                InputProps={{
                  endAdornment: <InputAdornment position="end">TWIST</InputAdornment>,
                }}
                helperText="Minimum stake: 1 TWIST"
                sx={{ mb: 3 }}
              />

              <Typography variant="body2" color="text.secondary" gutterBottom>
                Percentage of Balance
              </Typography>
              <Box sx={{ px: 1, mb: 2 }}>
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
                {[10, 100, 1000, 10000].map((preset) => (
                  <Chip
                    key={preset}
                    label={`${preset} TWIST`}
                    onClick={() => handleAmountChange(preset.toString())}
                    variant={amount === preset.toString() ? 'filled' : 'outlined'}
                    size="small"
                  />
                ))}
              </Box>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Projected Rewards ({influencer.metrics.apy}% APY)
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="text.secondary">
                      Daily
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {formatToken(rewards.daily)}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="text.secondary">
                      Monthly
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {formatToken(rewards.monthly)}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="text.secondary">
                      Yearly
                    </Typography>
                    <Typography variant="body2" fontWeight="medium" color="success.main">
                      {formatToken(rewards.yearly)}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Box>
          )}

          {activeStep === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Confirm Staking Details
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Stake Amount
                    </Typography>
                    <Typography variant="h5">
                      {amount} TWIST
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Revenue Share
                    </Typography>
                    <Typography variant="h5">
                      {influencer.metrics.revenueSharePercent}%
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Pool Information
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Total Staked
                    </Typography>
                    <Typography variant="body2">
                      {formatToken(influencer.metrics.totalStaked)}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Active Stakers
                    </Typography>
                    <Typography variant="body2">
                      {influencer.metrics.stakerCount}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Current APY
                    </Typography>
                    <Typography variant="body2" color="success.main">
                      {influencer.metrics.apy}%
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Your Share
                    </Typography>
                    <Typography variant="body2">
                      {amount && influencer.metrics.totalStaked
                        ? (
                            (Number(parseToken(amount)) /
                              (Number(influencer.metrics.totalStaked) + Number(parseToken(amount)))) *
                            100
                          ).toFixed(2)
                        : 0}
                      %
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              <Alert severity="info" icon={<Warning />}>
                By staking, you agree to lock your tokens in the influencer's pool. You can unstake
                at any time, but rewards are distributed based on staking duration.
              </Alert>
            </Box>
          )}

          {activeStep === 2 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              {loading ? (
                <>
                  <CircularProgress size={60} sx={{ mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Processing Transaction...
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Please confirm in your wallet
                  </Typography>
                </>
              ) : (
                <>
                  <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Staking Successful!
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    You have successfully staked {amount} TWIST on {influencer.displayName}
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
                </>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        {activeStep < 2 && (
          <>
            <Button onClick={onClose}>Cancel</Button>
            {activeStep > 0 && (
              <Button onClick={handleBack}>Back</Button>
            )}
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={loading || (activeStep === 0 && (!amount || parseToken(amount) === 0n))}
            >
              {activeStep === 0 ? 'Continue' : 'Confirm Stake'}
            </Button>
          </>
        )}
        {activeStep === 2 && !loading && (
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};