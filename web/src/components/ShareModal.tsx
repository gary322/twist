import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  Grid,
  Paper,
  Snackbar,
  Alert,
  CircularProgress,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Close,
  ContentCopy,
  Twitter,
  Facebook,
  WhatsApp,
  Telegram,
  Email,
  Link as LinkIcon,
  QrCode2,
  Share,
  Check,
} from '@mui/icons-material';
import { useDeeplink } from '../services/deeplink';
import { deeplinkService } from '../services/deeplink';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  type: 'stake' | 'content' | 'referral' | 'custom';
  data: {
    id: string;
    title: string;
    description?: string;
    image?: string;
    customUrl?: string;
  };
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export const ShareModal: React.FC<ShareModalProps> = ({
  open,
  onClose,
  type,
  data,
}) => {
  const { generateShareLink, share } = useDeeplink();
  const [tabValue, setTabValue] = useState(0);
  const [shareLink, setShareLink] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });

  useEffect(() => {
    if (open && data) {
      generateShareableLink();
    }
  }, [open, data, type]);

  const generateShareableLink = () => {
    let link = '';
    
    if (type === 'custom' && data.customUrl) {
      link = data.customUrl;
    } else {
      const params = {
        utm_source: 'share',
        utm_medium: 'social',
        utm_campaign: data.id,
      };
      
      link = generateShareLink(type, data.id, params);
    }
    
    setShareLink(link);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      showSnackbar('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      showSnackbar('Failed to copy link');
    }
  };

  const handleShare = (platform: 'twitter' | 'facebook' | 'whatsapp' | 'telegram' | 'email') => {
    if (platform === 'email') {
      const subject = encodeURIComponent(data.title);
      const body = encodeURIComponent(
        `${data.description || ''}\n\nCheck it out here: ${shareLink}`
      );
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    } else {
      share(shareLink, platform, {
        title: data.title,
        description: data.description,
      });
    }
  };

  const generateQRCode = async () => {
    setLoading(true);
    try {
      const qrUrl = await deeplinkService.generateQRCode(shareLink, {
        size: 512,
        logo: true,
        color: '#805ad5',
      });
      setQrCodeUrl(qrUrl);
    } catch (error) {
      showSnackbar('Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  const downloadQRCode = () => {
    if (!qrCodeUrl) return;
    
    const a = document.createElement('a');
    a.href = qrCodeUrl;
    a.download = `twist-qr-${data.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const showSnackbar = (message: string) => {
    setSnackbar({ open: true, message });
  };

  const getShareMessage = () => {
    switch (type) {
      case 'stake':
        return `Stake on ${data.title} and earn rewards!`;
      case 'content':
        return `Check out "${data.title}" on Twist`;
      case 'referral':
        return `Join Twist using my referral link and get bonus rewards!`;
      default:
        return data.title;
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">Share {data.title}</Typography>
            <IconButton onClick={onClose} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 2 }}>
            <Tab label="Share Link" />
            <Tab label="QR Code" />
          </Tabs>

          {/* Share Link Tab */}
          <TabPanel value={tabValue} index={0}>
            {/* Link Input */}
            <TextField
              fullWidth
              value={shareLink}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={copied ? 'Copied!' : 'Copy link'}>
                      <IconButton onClick={handleCopyLink} edge="end">
                        {copied ? <Check color="success" /> : <ContentCopy />}
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 3 }}
            />

            {/* Social Share Buttons */}
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Share on social media
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Paper
                  sx={{
                    p: 2,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: 2,
                    },
                  }}
                  onClick={() => handleShare('twitter')}
                >
                  <Twitter sx={{ fontSize: 32, color: '#1DA1F2' }} />
                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                    Twitter
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper
                  sx={{
                    p: 2,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: 2,
                    },
                  }}
                  onClick={() => handleShare('facebook')}
                >
                  <Facebook sx={{ fontSize: 32, color: '#1877F2' }} />
                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                    Facebook
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper
                  sx={{
                    p: 2,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: 2,
                    },
                  }}
                  onClick={() => handleShare('whatsapp')}
                >
                  <WhatsApp sx={{ fontSize: 32, color: '#25D366' }} />
                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                    WhatsApp
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper
                  sx={{
                    p: 2,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: 2,
                    },
                  }}
                  onClick={() => handleShare('telegram')}
                >
                  <Telegram sx={{ fontSize: 32, color: '#0088CC' }} />
                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                    Telegram
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Email Share */}
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Email />}
              onClick={() => handleShare('email')}
              sx={{ mt: 3 }}
            >
              Share via Email
            </Button>

            {/* Preview */}
            {data.description && (
              <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Preview
                </Typography>
                <Typography variant="body2">
                  {getShareMessage()}
                </Typography>
              </Box>
            )}
          </TabPanel>

          {/* QR Code Tab */}
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ textAlign: 'center' }}>
              {!qrCodeUrl ? (
                <Box>
                  <Paper
                    sx={{
                      p: 8,
                      bgcolor: 'background.default',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <QrCode2 sx={{ fontSize: 64, color: 'text.secondary' }} />
                    <Typography variant="body1" color="text.secondary">
                      Generate a QR code for easy sharing
                    </Typography>
                    <Button
                      variant="contained"
                      onClick={generateQRCode}
                      disabled={loading}
                      startIcon={loading ? <CircularProgress size={20} /> : <QrCode2 />}
                    >
                      {loading ? 'Generating...' : 'Generate QR Code'}
                    </Button>
                  </Paper>
                </Box>
              ) : (
                <Box>
                  <img
                    src={qrCodeUrl}
                    alt="QR Code"
                    style={{ width: '100%', maxWidth: 300, height: 'auto' }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 3 }}>
                    Scan this QR code to share
                  </Typography>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={downloadQRCode}
                    startIcon={<ContentCopy />}
                  >
                    Download QR Code
                  </Button>
                </Box>
              )}
            </Box>
          </TabPanel>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};