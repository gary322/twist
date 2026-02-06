import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Paper,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  Autocomplete,
} from '@mui/material';
import {
  Add,
  Campaign,
  Edit,
  Delete,
  MoreVert,
  PlayArrow,
  Pause,
  Stop,
  TrendingUp,
  AttachMoney,
  People,
  Visibility,
  CalendarToday,
  Assessment,
  Settings,
  ContentCopy,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { api } from '../../services/api';
import { formatNumber, formatToken, formatDate } from '../../utils/format';

interface Campaign {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  products: string[];
  contentCount: number;
  totalViews: number;
  totalConversions: number;
  totalRevenue: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  budget?: string;
  goals?: {
    views?: number;
    conversions?: number;
    revenue?: string;
  };
}

interface CampaignBuilderProps {
  campaigns: Campaign[];
  onRefresh: () => void;
}

export const CampaignBuilder: React.FC<CampaignBuilderProps> = ({
  campaigns,
  onRefresh,
}) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [products, setProducts] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: new Date(),
    endDate: new Date(),
    products: [] as string[],
    budget: '',
    goals: {
      views: '',
      conversions: '',
      revenue: '',
    },
  });

  React.useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const steps = ['Basic Info', 'Products & Goals', 'Review & Launch'];

  const handleCreateCampaign = () => {
    setFormData({
      name: '',
      description: '',
      startDate: new Date(),
      endDate: new Date(),
      products: [],
      budget: '',
      goals: {
        views: '',
        conversions: '',
        revenue: '',
      },
    });
    setActiveStep(0);
    setShowCreateDialog(true);
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setFormData({
      name: campaign.name,
      description: campaign.description,
      startDate: new Date(campaign.startDate),
      endDate: new Date(campaign.endDate),
      products: campaign.products,
      budget: campaign.budget || '',
      goals: {
        views: campaign.goals?.views?.toString() || '',
        conversions: campaign.goals?.conversions?.toString() || '',
        revenue: campaign.goals?.revenue || '',
      },
    });
    setSelectedCampaign(campaign);
    setActiveStep(0);
    setShowCreateDialog(true);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, campaign: Campaign) => {
    setAnchorEl(event.currentTarget);
    setSelectedCampaign(campaign);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleStatusChange = async (campaign: Campaign, newStatus: string) => {
    try {
      await api.updateCampaignStatus(campaign.id, newStatus);
      onRefresh();
    } catch (error) {
      console.error('Failed to update campaign status:', error);
    }
    handleMenuClose();
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    if (window.confirm('Are you sure you want to delete this campaign?')) {
      try {
        await api.deleteCampaign(campaign.id);
        onRefresh();
      } catch (error) {
        console.error('Failed to delete campaign:', error);
      }
    }
    handleMenuClose();
  };

  const handleDuplicateCampaign = async (campaign: Campaign) => {
    try {
      await api.duplicateCampaign(campaign.id);
      onRefresh();
    } catch (error) {
      console.error('Failed to duplicate campaign:', error);
    }
    handleMenuClose();
  };

  const handleNext = () => {
    if (activeStep === 0) {
      if (!formData.name || !formData.description) {
        setError('Please fill in all required fields');
        return;
      }
    } else if (activeStep === 1) {
      if (formData.products.length === 0) {
        setError('Please select at least one product');
        return;
      }
    }

    setError(null);
    setActiveStep(activeStep + 1);
  };

  const handleBack = () => {
    setActiveStep(activeStep - 1);
  };

  const handleSaveCampaign = async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        goals: {
          views: formData.goals.views ? parseInt(formData.goals.views) : undefined,
          conversions: formData.goals.conversions ? parseInt(formData.goals.conversions) : undefined,
          revenue: formData.goals.revenue || undefined,
        },
      };

      if (selectedCampaign) {
        await api.updateCampaign(selectedCampaign.id, payload);
      } else {
        await api.createCampaign(payload);
      }

      setShowCreateDialog(false);
      onRefresh();
    } catch (error: any) {
      setError(error.message || 'Failed to save campaign');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'paused':
        return 'warning';
      case 'completed':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <PlayArrow />;
      case 'paused':
        return <Pause />;
      case 'completed':
        return <Stop />;
      default:
        return null;
    }
  };

  const filteredCampaigns = campaigns.filter(campaign => {
    if (statusFilter === 'all') return true;
    return campaign.status === statusFilter;
  });

  const getProgressPercentage = (campaign: Campaign) => {
    if (!campaign.goals) return 0;
    
    const metrics = [
      {
        actual: campaign.totalViews,
        goal: campaign.goals.views || 0,
      },
      {
        actual: campaign.totalConversions,
        goal: campaign.goals.conversions || 0,
      },
      {
        actual: parseFloat(campaign.totalRevenue),
        goal: parseFloat(campaign.goals.revenue || '0'),
      },
    ].filter(m => m.goal > 0);

    if (metrics.length === 0) return 0;

    const avgProgress = metrics.reduce((sum, m) => sum + (m.actual / m.goal) * 100, 0) / metrics.length;
    return Math.min(100, Math.round(avgProgress));
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" gutterBottom>
            Campaigns
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create and manage marketing campaigns
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleCreateCampaign}
        >
          New Campaign
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ mb: 3 }}>
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          onChange={(e, value) => value && setStatusFilter(value)}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="active">Active</ToggleButton>
          <ToggleButton value="paused">Paused</ToggleButton>
          <ToggleButton value="completed">Completed</ToggleButton>
          <ToggleButton value="draft">Draft</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Campaign Grid */}
      {filteredCampaigns.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center' }}>
          <Campaign sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No campaigns found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create your first campaign to start organizing your content
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleCreateCampaign}
          >
            Create Campaign
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filteredCampaigns.map((campaign) => (
            <Grid item xs={12} md={6} lg={4} key={campaign.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Chip
                      icon={getStatusIcon(campaign.status)}
                      label={campaign.status}
                      size="small"
                      color={getStatusColor(campaign.status)}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, campaign)}
                    >
                      <MoreVert />
                    </IconButton>
                  </Box>

                  <Typography variant="h6" gutterBottom>
                    {campaign.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {campaign.description}
                  </Typography>

                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {campaign.products.length > 0 && (
                        <Chip
                          label={`${campaign.products.length} products`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      <Chip
                        label={`${campaign.contentCount} content`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  </Box>

                  {/* Progress */}
                  {campaign.goals && (
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption">Campaign Progress</Typography>
                        <Typography variant="caption">{getProgressPercentage(campaign)}%</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={getProgressPercentage(campaign)}
                        color={getProgressPercentage(campaign) >= 100 ? 'success' : 'primary'}
                      />
                    </Box>
                  )}

                  {/* Metrics */}
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Visibility sx={{ fontSize: 20, color: 'text.secondary' }} />
                        <Typography variant="h6">{formatNumber(campaign.totalViews)}</Typography>
                        <Typography variant="caption" color="text.secondary">Views</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <TrendingUp sx={{ fontSize: 20, color: 'text.secondary' }} />
                        <Typography variant="h6">{formatNumber(campaign.totalConversions)}</Typography>
                        <Typography variant="caption" color="text.secondary">Conversions</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <AttachMoney sx={{ fontSize: 20, color: 'text.secondary' }} />
                        <Typography variant="h6">{formatToken(campaign.totalRevenue)}</Typography>
                        <Typography variant="caption" color="text.secondary">Revenue</Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
                <CardActions>
                  <Button size="small" startIcon={<Assessment />}>
                    View Analytics
                  </Button>
                  <Button size="small" startIcon={<Edit />} onClick={() => handleEditCampaign(campaign)}>
                    Edit
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Campaign Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {selectedCampaign?.status === 'active' && (
          <MenuItem onClick={() => selectedCampaign && handleStatusChange(selectedCampaign, 'paused')}>
            <ListItemIcon>
              <Pause fontSize="small" />
            </ListItemIcon>
            <ListItemText>Pause Campaign</ListItemText>
          </MenuItem>
        )}
        {selectedCampaign?.status === 'paused' && (
          <MenuItem onClick={() => selectedCampaign && handleStatusChange(selectedCampaign, 'active')}>
            <ListItemIcon>
              <PlayArrow fontSize="small" />
            </ListItemIcon>
            <ListItemText>Resume Campaign</ListItemText>
          </MenuItem>
        )}
        {selectedCampaign?.status !== 'completed' && (
          <MenuItem onClick={() => selectedCampaign && handleStatusChange(selectedCampaign, 'completed')}>
            <ListItemIcon>
              <Stop fontSize="small" />
            </ListItemIcon>
            <ListItemText>End Campaign</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => selectedCampaign && handleDuplicateCampaign(selectedCampaign)}>
          <ListItemIcon>
            <ContentCopy fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => selectedCampaign && handleDeleteCampaign(selectedCampaign)}>
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Create/Edit Campaign Dialog */}
      <Dialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedCampaign ? 'Edit Campaign' : 'Create New Campaign'}
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

            {/* Step 1: Basic Info */}
            {activeStep === 0 && (
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Campaign Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    multiline
                    rows={3}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                      label="Start Date"
                      value={formData.startDate}
                      onChange={(date) => date && setFormData({ ...formData, startDate: date })}
                      renderInput={(params) => <TextField {...params} fullWidth required />}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                      label="End Date"
                      value={formData.endDate}
                      onChange={(date) => date && setFormData({ ...formData, endDate: date })}
                      renderInput={(params) => <TextField {...params} fullWidth required />}
                      minDate={formData.startDate}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Budget (Optional)"
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                  />
                </Grid>
              </Grid>
            )}

            {/* Step 2: Products & Goals */}
            {activeStep === 1 && (
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Autocomplete
                    multiple
                    options={products}
                    getOptionLabel={(option) => option.name}
                    value={products.filter((p) => formData.products.includes(p.id))}
                    onChange={(e, value) => setFormData({ ...formData, products: value.map((v) => v.id) })}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => (
                        <Chip
                          variant="outlined"
                          label={option.name}
                          {...getTagProps({ index })}
                        />
                      ))
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Products to Promote"
                        placeholder="Select products"
                        required
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>
                    Campaign Goals (Optional)
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Set targets to track your campaign performance
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Target Views"
                    type="number"
                    value={formData.goals.views}
                    onChange={(e) => setFormData({
                      ...formData,
                      goals: { ...formData.goals, views: e.target.value }
                    })}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><Visibility /></InputAdornment>,
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Target Conversions"
                    type="number"
                    value={formData.goals.conversions}
                    onChange={(e) => setFormData({
                      ...formData,
                      goals: { ...formData.goals, conversions: e.target.value }
                    })}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><TrendingUp /></InputAdornment>,
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Target Revenue"
                    value={formData.goals.revenue}
                    onChange={(e) => setFormData({
                      ...formData,
                      goals: { ...formData.goals, revenue: e.target.value }
                    })}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                  />
                </Grid>
              </Grid>
            )}

            {/* Step 3: Review & Launch */}
            {activeStep === 2 && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  Review Campaign Details
                </Typography>
                <TableContainer component={Paper} sx={{ mb: 3 }}>
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>{formData.name}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Duration</TableCell>
                        <TableCell>
                          {formatDate(formData.startDate)} - {formatDate(formData.endDate)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Products</TableCell>
                        <TableCell>{formData.products.length} selected</TableCell>
                      </TableRow>
                      {formData.budget && (
                        <TableRow>
                          <TableCell>Budget</TableCell>
                          <TableCell>${formData.budget}</TableCell>
                        </TableRow>
                      )}
                      {(formData.goals.views || formData.goals.conversions || formData.goals.revenue) && (
                        <TableRow>
                          <TableCell>Goals</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                              {formData.goals.views && (
                                <Chip label={`${formData.goals.views} views`} size="small" />
                              )}
                              {formData.goals.conversions && (
                                <Chip label={`${formData.goals.conversions} conversions`} size="small" />
                              )}
                              {formData.goals.revenue && (
                                <Chip label={`$${formData.goals.revenue} revenue`} size="small" />
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Alert severity="info">
                  Once launched, you can start adding content to this campaign and track its performance.
                </Alert>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
          {activeStep > 0 && (
            <Button onClick={handleBack}>Back</Button>
          )}
          {activeStep < steps.length - 1 ? (
            <Button variant="contained" onClick={handleNext}>
              Next
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleSaveCampaign}
              disabled={loading}
              startIcon={loading && <CircularProgress size={20} />}
            >
              {selectedCampaign ? 'Update Campaign' : 'Launch Campaign'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};