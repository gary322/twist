import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Grid,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import { AccountBalanceWallet, History, Settings } from '@mui/icons-material';
import { formatToken, formatDate } from '../../utils/format';
import { api } from '../../services/api';

interface PayoutWidgetProps {
  influencerId: string;
}

export const PayoutWidget: React.FC<PayoutWidgetProps> = ({ influencerId }) => {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<bigint>(0n);
  const [pendingPayout, setPendingPayout] = useState<any>(null);
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('crypto');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadPayoutData();
  }, [influencerId]);

  const loadPayoutData = async () => {
    try {
      setLoading(true);
      const [balanceData, historyData] = await Promise.all([
        api.getPayoutBalance(influencerId),
        api.getPayoutHistory(influencerId, { limit: 5 }),
      ]);

      setBalance(BigInt(balanceData.balance));
      setPendingPayout(balanceData.pendingPayout);
      setPayoutHistory(historyData.payouts);
    } catch (error) {
      console.error('Failed to load payout data:', error);
      setError('Failed to load payout information');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!requestAmount || parseFloat(requestAmount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const amount = BigInt(Math.floor(parseFloat(requestAmount) * 10 ** 9));
      
      await api.requestPayout({
        influencerId,
        amount: amount.toString(),
        method: payoutMethod,
      });

      setSuccess('Payout request submitted successfully');
      setShowRequestDialog(false);
      setRequestAmount('');
      await loadPayoutData();
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to request payout');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'processing':
        return 'info';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Grid container spacing={3}>
        {/* Balance Overview */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Payout Balance
              </Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Available Balance
                    </Typography>
                    <Typography variant="h4" color="primary">
                      {formatToken(balance)}
                    </Typography>
                  </Box>
                </Grid>
                
                {pendingPayout && (
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Pending Payout
                      </Typography>
                      <Typography variant="h4" color="warning.main">
                        {formatToken(pendingPayout.amount)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Requested {formatDate(pendingPayout.requestedAt)}
                      </Typography>
                    </Box>
                  </Grid>
                )}
              </Grid>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
                  {success}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  startIcon={<AccountBalanceWallet />}
                  onClick={() => setShowRequestDialog(true)}
                  disabled={balance < 10_000_000_000n || !!pendingPayout}
                >
                  Request Payout
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Settings />}
                  onClick={() => window.location.href = '/settings/payouts'}
                >
                  Payout Settings
                </Button>
              </Box>

              {balance < 10_000_000_000n && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Minimum payout amount: 10 TWIST
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Stats */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Payout Stats
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Total Paid Out
                </Typography>
                <Typography variant="h5">
                  {formatToken(
                    payoutHistory
                      .filter(p => p.status === 'completed')
                      .reduce((sum, p) => sum + BigInt(p.amount), 0n)
                  )}
                </Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Total Payouts
                </Typography>
                <Typography variant="h5">
                  {payoutHistory.filter(p => p.status === 'completed').length}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Last Payout
                </Typography>
                <Typography variant="body1">
                  {payoutHistory.find(p => p.status === 'completed')
                    ? formatDate(payoutHistory.find(p => p.status === 'completed').processedAt)
                    : 'No payouts yet'
                  }
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Payout History */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Payout History</Typography>
                <Button
                  size="small"
                  startIcon={<History />}
                  onClick={() => window.location.href = '/payouts/history'}
                >
                  View All
                </Button>
              </Box>

              {payoutHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No payout history
                </Typography>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Amount</TableCell>
                        <TableCell>Method</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Transaction</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {payoutHistory.map((payout) => (
                        <TableRow key={payout.id}>
                          <TableCell>{formatDate(payout.requestedAt)}</TableCell>
                          <TableCell>{formatToken(payout.amount)}</TableCell>
                          <TableCell>
                            <Chip
                              label={payout.method.toUpperCase()}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={payout.status}
                              size="small"
                              color={getStatusColor(payout.status)}
                            />
                          </TableCell>
                          <TableCell>
                            {payout.transactionId ? (
                              <Typography
                                variant="caption"
                                sx={{
                                  cursor: 'pointer',
                                  color: 'primary.main',
                                  '&:hover': { textDecoration: 'underline' },
                                }}
                                onClick={() => {
                                  if (payout.method === 'crypto') {
                                    window.open(`https://solscan.io/tx/${payout.transactionId}`, '_blank');
                                  }
                                }}
                              >
                                {payout.transactionId.substring(0, 8)}...
                              </Typography>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Request Payout Dialog */}
      <Dialog open={showRequestDialog} onClose={() => setShowRequestDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Payout</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Amount (TWIST)"
              type="number"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              helperText={`Available: ${formatToken(balance)}`}
              sx={{ mb: 3 }}
              inputProps={{
                min: 10,
                max: Number(balance / 10n ** 9n),
                step: 0.1,
              }}
            />

            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Payout Method</InputLabel>
              <Select
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value)}
                label="Payout Method"
              >
                <MenuItem value="crypto">Crypto (TWIST)</MenuItem>
                <MenuItem value="bank">Bank Transfer</MenuItem>
                <MenuItem value="paypal">PayPal</MenuItem>
              </Select>
            </FormControl>

            {payoutMethod === 'crypto' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Funds will be sent to your registered wallet address
              </Alert>
            )}

            {payoutMethod === 'bank' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Please ensure your bank details are up to date in settings
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRequestDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRequestPayout}
            disabled={processing || !requestAmount || parseFloat(requestAmount) < 10}
          >
            {processing ? <CircularProgress size={24} /> : 'Request Payout'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};