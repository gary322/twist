import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  InputAdornment,
  Chip,
  LinearProgress,
  CircularProgress,
  IconButton,
  Collapse,
} from '@mui/material';
import {
  SwapVert,
  Info,
  Add,
  Remove,
  CheckCircle,
  ExpandMore,
  ExpandLess,
  Calculate,
} from '@mui/icons-material';
import { useWallet } from '@solana/wallet-adapter-react';
import { formatToken, formatPercent, parseToken } from '../utils/format';
import { api } from '../services/api';

interface Position {
  id: string;
  influencer: {
    id: string;
    displayName: string;
    tier: string;
  };
  stake: {
    amount: string;
    apy: number;
  };
}

interface RebalanceModalProps {
  positions: Position[];
  onClose: () => void;
  onSuccess: () => void;
}

interface RebalanceAction {
  influencerId: string;
  influencerName: string;
  action: 'stake' | 'unstake';
  amount: bigint;
}

export const RebalanceModal: React.FC<RebalanceModalProps> = ({
  positions,
  onClose,
  onSuccess,
}) => {
  const { publicKey } = useWallet();
  const [activeStep, setActiveStep] = useState(0);
  const [targetAllocations, setTargetAllocations] = useState<Record<string, number>>({});
  const [rebalanceActions, setRebalanceActions] = useState<RebalanceAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [rebalanceStrategy, setRebalanceStrategy] = useState<'equal' | 'apy' | 'custom'>('equal');

  const steps = ['Set Target Allocations', 'Review Changes', 'Execute Rebalance'];

  const totalValue = positions.reduce((sum, p) => sum + BigInt(p.stake.amount), 0n);

  useEffect(() => {
    // Initialize target allocations based on strategy
    initializeAllocations();
  }, [rebalanceStrategy]);

  const initializeAllocations = () => {
    const allocations: Record<string, number> = {};
    
    if (rebalanceStrategy === 'equal') {
      // Equal weight strategy
      const equalWeight = 100 / positions.length;
      positions.forEach(p => {
        allocations[p.influencer.id] = equalWeight;
      });
    } else if (rebalanceStrategy === 'apy') {
      // APY-weighted strategy
      const totalAPY = positions.reduce((sum, p) => sum + p.stake.apy, 0);
      positions.forEach(p => {
        allocations[p.influencer.id] = (p.stake.apy / totalAPY) * 100;
      });
    } else {
      // Custom - start with current allocations
      positions.forEach(p => {
        const currentPercent = Number((BigInt(p.stake.amount) * 100n) / totalValue);
        allocations[p.influencer.id] = currentPercent;
      });
    }
    
    setTargetAllocations(allocations);
  };

  const calculateRebalanceActions = () => {
    const actions: RebalanceAction[] = [];
    
    positions.forEach(position => {
      const currentAmount = BigInt(position.stake.amount);
      const targetPercent = targetAllocations[position.influencer.id] || 0;
      const targetAmount = (totalValue * BigInt(Math.floor(targetPercent * 100))) / 10000n;
      const difference = targetAmount - currentAmount;
      
      if (difference !== 0n) {
        actions.push({
          influencerId: position.influencer.id,
          influencerName: position.influencer.displayName,
          action: difference > 0n ? 'stake' : 'unstake',
          amount: difference > 0n ? difference : -difference,
        });
      }
    });
    
    setRebalanceActions(actions);
  };

  const handleNext = () => {
    if (activeStep === 0) {
      // Validate allocations sum to 100%
      const sum = Object.values(targetAllocations).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        setError('Allocations must sum to 100%');
        return;
      }
      calculateRebalanceActions();
      setError(null);
    } else if (activeStep === 1) {
      executeRebalance();
      return;
    }
    
    setActiveStep(activeStep + 1);
  };

  const handleBack = () => {
    setActiveStep(activeStep - 1);
    setError(null);
  };

  const executeRebalance = async () => {
    if (!publicKey) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Execute all rebalance actions
      await Promise.all(
        rebalanceActions.map(action => {
          if (action.action === 'stake') {
            return api.stakeOnInfluencer({
              influencerId: action.influencerId,
              amount: action.amount.toString(),
              wallet: publicKey.toBase58(),
            });
          } else {
            return api.unstake({
              influencerId: action.influencerId,
              amount: action.amount.toString(),
              wallet: publicKey.toBase58(),
            });
          }
        })
      );
      
      setActiveStep(2);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Rebalancing failed');
    } finally {
      setLoading(false);
    }
  };

  const updateAllocation = (influencerId: string, value: number) => {
    setTargetAllocations({
      ...targetAllocations,
      [influencerId]: Math.min(100, Math.max(0, value)),
    });
  };

  const getAllocationSum = () => {
    return Object.values(targetAllocations).reduce((a, b) => a + b, 0);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <SwapVert />
          <Typography variant="h6">Rebalance Portfolio</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
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
            <Alert severity="info" sx={{ mb: 3 }}>
              Set your target allocation for each position. The total must equal 100%.
            </Alert>

            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Rebalancing Strategy
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip
                  label="Equal Weight"
                  onClick={() => setRebalanceStrategy('equal')}
                  color={rebalanceStrategy === 'equal' ? 'primary' : 'default'}
                />
                <Chip
                  label="APY Weighted"
                  onClick={() => setRebalanceStrategy('apy')}
                  color={rebalanceStrategy === 'apy' ? 'primary' : 'default'}
                />
                <Chip
                  label="Custom"
                  onClick={() => setRebalanceStrategy('custom')}
                  color={rebalanceStrategy === 'custom' ? 'primary' : 'default'}
                />
              </Box>
            </Box>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Influencer</TableCell>
                    <TableCell align="right">Current</TableCell>
                    <TableCell align="right">Target %</TableCell>
                    <TableCell align="right">Target Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {positions.map((position) => {
                    const currentPercent = Number((BigInt(position.stake.amount) * 100n) / totalValue);
                    const targetPercent = targetAllocations[position.influencer.id] || 0;
                    const targetAmount = (totalValue * BigInt(Math.floor(targetPercent * 100))) / 10000n;
                    
                    return (
                      <TableRow key={position.id}>
                        <TableCell>
                          <Box>
                            <Typography variant="body2">
                              {position.influencer.displayName}
                            </Typography>
                            <Chip
                              label={position.influencer.tier}
                              size="small"
                              sx={{ height: 16, fontSize: '0.7rem' }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatToken(position.stake.amount)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {currentPercent.toFixed(1)}%
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            type="number"
                            value={targetPercent.toFixed(1)}
                            onChange={(e) => updateAllocation(
                              position.influencer.id,
                              parseFloat(e.target.value)
                            )}
                            disabled={rebalanceStrategy !== 'custom'}
                            InputProps={{
                              endAdornment: <InputAdornment position="end">%</InputAdornment>,
                            }}
                            sx={{ width: 100 }}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatToken(targetAmount)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Typography variant="subtitle2">Total</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="subtitle2"
                        color={Math.abs(getAllocationSum() - 100) > 0.01 ? 'error' : 'success.main'}
                      >
                        {getAllocationSum().toFixed(1)}%
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="subtitle2">
                        {formatToken(totalValue)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {activeStep === 1 && (
          <Box>
            <Alert severity="warning" sx={{ mb: 3 }}>
              Review the changes below. Rebalancing will execute multiple transactions to adjust your positions.
            </Alert>

            <Paper sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Rebalance Summary
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {rebalanceActions.filter(a => a.action === 'stake').length} stake transactions
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {rebalanceActions.filter(a => a.action === 'unstake').length} unstake transactions
              </Typography>
            </Paper>

            <Box sx={{ mb: 2 }}>
              <Button
                size="small"
                startIcon={showDetails ? <ExpandLess /> : <ExpandMore />}
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? 'Hide' : 'Show'} Transaction Details
              </Button>
            </Box>

            <Collapse in={showDetails}>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Action</TableCell>
                      <TableCell>Influencer</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rebalanceActions.map((action, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Chip
                            label={action.action}
                            size="small"
                            color={action.action === 'stake' ? 'success' : 'warning'}
                            icon={action.action === 'stake' ? <Add /> : <Remove />}
                          />
                        </TableCell>
                        <TableCell>{action.influencerName}</TableCell>
                        <TableCell align="right">{formatToken(action.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>
          </Box>
        )}

        {activeStep === 2 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            {loading ? (
              <>
                <CircularProgress size={60} sx={{ mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Rebalancing Portfolio...
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  This may take a few moments
                </Typography>
                <LinearProgress sx={{ mt: 2 }} />
              </>
            ) : (
              <>
                <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Rebalancing Complete!
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Your portfolio has been successfully rebalanced
                </Typography>
              </>
            )}
          </Box>
        )}
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
              disabled={
                loading ||
                (activeStep === 0 && Math.abs(getAllocationSum() - 100) > 0.01) ||
                (activeStep === 1 && rebalanceActions.length === 0)
              }
              startIcon={activeStep === 1 && loading && <CircularProgress size={20} />}
            >
              {activeStep === 0 ? 'Continue' : 'Execute Rebalance'}
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