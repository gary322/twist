import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Grid,
  TextField,
  IconButton,
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
  Tooltip,
  Switch,
  FormControlLabel,
  InputAdornment,
  Alert,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Add,
  ContentCopy,
  QrCode2,
  Edit,
  Delete,
  MoreVert,
  Link as LinkIcon,
  Visibility,
  TrendingUp,
} from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { formatNumber, formatToken } from '../../utils/format';
import { api } from '../../services/api';

interface LinkManagementProps {
  influencerId: string;
}

interface LinkData {
  id: string;
  productId: string;
  productName: string;
  linkCode: string;
  customUrl?: string;
  promoCode?: string;
  clicks: number;
  conversions: number;
  earned: string;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string;
}

export const LinkManagement: React.FC<LinkManagementProps> = ({ influencerId }) => {
  const [links, setLinks] = useState<LinkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedLink, setSelectedLink] = useState<LinkData | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [activeMenuLink, setActiveMenuLink] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  // Create link form state
  const [createForm, setCreateForm] = useState({
    productId: '',
    customUrl: '',
    promoCode: '',
    expiresIn: '',
  });

  useEffect(() => {
    loadLinks();
  }, [influencerId]);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const data = await api.getInfluencerLinks(influencerId);
      setLinks(data);
    } catch (error) {
      console.error('Failed to load links:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async () => {
    try {
      const newLink = await api.createInfluencerLink({
        influencerId,
        ...createForm,
      });
      setLinks([newLink, ...links]);
      setShowCreateDialog(false);
      setCreateForm({
        productId: '',
        customUrl: '',
        promoCode: '',
        expiresIn: '',
      });
    } catch (error) {
      console.error('Failed to create link:', error);
    }
  };

  const handleToggleLink = async (linkId: string, isActive: boolean) => {
    try {
      await api.updateInfluencerLink(linkId, { isActive });
      setLinks(links.map(link => 
        link.id === linkId ? { ...link, isActive } : link
      ));
    } catch (error) {
      console.error('Failed to toggle link:', error);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!window.confirm('Are you sure you want to delete this link?')) return;

    try {
      await api.deleteInfluencerLink(linkId);
      setLinks(links.filter(link => link.id !== linkId));
    } catch (error) {
      console.error('Failed to delete link:', error);
    }
  };

  const handleCopyLink = (link: LinkData) => {
    const fullUrl = `https://twist.to/r/${link.linkCode}`;
    navigator.clipboard.writeText(fullUrl);
    // Show toast notification
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, linkId: string) => {
    setAnchorEl(event.currentTarget);
    setActiveMenuLink(linkId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setActiveMenuLink(null);
  };

  const filteredLinks = links.filter(link => {
    const matchesSearch = link.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         link.linkCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActive = !showOnlyActive || link.isActive;
    return matchesSearch && matchesActive;
  });

  return (
    <>
      <Grid container spacing={3}>
        {/* Link Stats */}
        <Grid item xs={12}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Total Links
                  </Typography>
                  <Typography variant="h4">{links.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Total Clicks
                  </Typography>
                  <Typography variant="h4">
                    {formatNumber(links.reduce((sum, link) => sum + link.clicks, 0))}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Total Conversions
                  </Typography>
                  <Typography variant="h4">
                    {formatNumber(links.reduce((sum, link) => sum + link.conversions, 0))}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Total Earned
                  </Typography>
                  <Typography variant="h4">
                    {formatToken(links.reduce((sum, link) => sum + BigInt(link.earned), 0n))}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        {/* Link Management */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6">Your Links</Typography>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setShowCreateDialog(true)}
                >
                  Create Link
                </Button>
              </Box>

              {/* Filters */}
              <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <TextField
                  size="small"
                  placeholder="Search links..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LinkIcon />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ flexGrow: 1 }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={showOnlyActive}
                      onChange={(e) => setShowOnlyActive(e.target.checked)}
                    />
                  }
                  label="Active only"
                />
              </Box>

              {/* Links Table */}
              {filteredLinks.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {searchTerm ? 'No links found matching your search' : 'No links created yet'}
                  </Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell>Link</TableCell>
                        <TableCell align="center">Clicks</TableCell>
                        <TableCell align="center">Conversions</TableCell>
                        <TableCell align="center">Rate</TableCell>
                        <TableCell align="right">Earned</TableCell>
                        <TableCell align="center">Status</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredLinks.map((link) => (
                        <TableRow key={link.id}>
                          <TableCell>
                            <Box>
                              <Typography variant="body2">{link.productName}</Typography>
                              {link.promoCode && (
                                <Chip
                                  label={`Code: ${link.promoCode}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ mt: 0.5 }}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                twist.to/r/{link.linkCode}
                              </Typography>
                              <IconButton size="small" onClick={() => handleCopyLink(link)}>
                                <ContentCopy fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell align="center">{formatNumber(link.clicks)}</TableCell>
                          <TableCell align="center">{formatNumber(link.conversions)}</TableCell>
                          <TableCell align="center">
                            {link.clicks > 0 
                              ? `${((link.conversions / link.clicks) * 100).toFixed(2)}%`
                              : '-'
                            }
                          </TableCell>
                          <TableCell align="right">{formatToken(link.earned)}</TableCell>
                          <TableCell align="center">
                            <Switch
                              checked={link.isActive}
                              onChange={(e) => handleToggleLink(link.id, e.target.checked)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              onClick={(e) => handleMenuClick(e, link.id)}
                            >
                              <MoreVert />
                            </IconButton>
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

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          const link = links.find(l => l.id === activeMenuLink);
          if (link) {
            setSelectedLink(link);
            setShowQRDialog(true);
          }
          handleMenuClose();
        }}>
          <QrCode2 sx={{ mr: 1 }} fontSize="small" />
          Generate QR Code
        </MenuItem>
        <MenuItem onClick={() => {
          const link = links.find(l => l.id === activeMenuLink);
          if (link) {
            window.open(`/analytics/link/${link.id}`, '_blank');
          }
          handleMenuClose();
        }}>
          <Visibility sx={{ mr: 1 }} fontSize="small" />
          View Analytics
        </MenuItem>
        <MenuItem onClick={() => {
          if (activeMenuLink) {
            handleDeleteLink(activeMenuLink);
          }
          handleMenuClose();
        }} sx={{ color: 'error.main' }}>
          <Delete sx={{ mr: 1 }} fontSize="small" />
          Delete
        </MenuItem>
      </Menu>

      {/* Create Link Dialog */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Link</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Product ID"
              value={createForm.productId}
              onChange={(e) => setCreateForm({ ...createForm, productId: e.target.value })}
              sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="Custom URL (optional)"
              value={createForm.customUrl}
              onChange={(e) => setCreateForm({ ...createForm, customUrl: e.target.value })}
              sx={{ mb: 2 }}
              placeholder="my-special-offer"
              helperText="Creates twist.to/r/my-special-offer"
            />
            <TextField
              fullWidth
              label="Promo Code (optional)"
              value={createForm.promoCode}
              onChange={(e) => setCreateForm({ ...createForm, promoCode: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Expires In (days)"
              type="number"
              value={createForm.expiresIn}
              onChange={(e) => setCreateForm({ ...createForm, expiresIn: e.target.value })}
              helperText="Leave empty for no expiration"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateLink}
            disabled={!createForm.productId}
          >
            Create Link
          </Button>
        </DialogActions>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onClose={() => setShowQRDialog(false)}>
        <DialogTitle>QR Code</DialogTitle>
        <DialogContent>
          {selectedLink && (
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <QRCodeSVG
                value={`https://twist.to/r/${selectedLink.linkCode}`}
                size={256}
                level="H"
                includeMargin
              />
              <Typography variant="body2" sx={{ mt: 2 }}>
                {selectedLink.productName}
              </Typography>
              <Button
                variant="outlined"
                startIcon={<Download />}
                sx={{ mt: 2 }}
                onClick={() => {
                  // Download QR code implementation
                }}
              >
                Download QR Code
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowQRDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};