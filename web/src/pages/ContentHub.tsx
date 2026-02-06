import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Grid,
  Paper,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Button,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Fab,
  Menu,
  ListItemIcon,
  ListItemText,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  CircularProgress,
  Skeleton,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  Add,
  Search,
  FilterList,
  Download,
  Share,
  Edit,
  Delete,
  FileCopy,
  Image,
  VideoLibrary,
  Article,
  Link,
  QrCode2,
  Schedule,
  Analytics,
  CloudUpload,
  Folder,
  FolderOpen,
  Star,
  StarBorder,
  MoreVert,
  ViewList,
  ViewModule,
  GetApp,
  Facebook,
  Twitter,
  Instagram,
  YouTube,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { formatDate } from '../utils/format';
import { ContentEditor } from '../components/content/ContentEditor';
import { CampaignBuilder } from '../components/content/CampaignBuilder';
import { TemplateGallery } from '../components/content/TemplateGallery';
import { ContentAnalytics } from '../components/content/ContentAnalytics';
import { QRCodeGenerator } from '../components/content/QRCodeGenerator';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

interface ContentItem {
  id: string;
  type: 'image' | 'video' | 'article' | 'link' | 'qrcode';
  title: string;
  description?: string;
  thumbnail?: string;
  url?: string;
  tags: string[];
  campaign?: string;
  createdAt: string;
  updatedAt: string;
  views: number;
  shares: number;
  conversions: number;
  status: 'draft' | 'published' | 'scheduled';
  scheduledFor?: string;
  platforms: string[];
  isFavorite: boolean;
}

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
  status: 'draft' | 'active' | 'paused' | 'completed';
}

export const ContentHub: React.FC = () => {
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [contentType, setContentType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createType, setCreateType] = useState<string>('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);

  useEffect(() => {
    loadContent();
    loadCampaigns();
  }, []);

  const loadContent = async () => {
    try {
      setLoading(true);
      const data = await api.getInfluencerContent(user?.id);
      setContentItems(data);
    } catch (error) {
      console.error('Failed to load content:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCampaigns = async () => {
    try {
      const data = await api.getInfluencerCampaigns(user?.id);
      setCampaigns(data);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    }
  };

  const handleCreateContent = (type: string) => {
    setCreateType(type);
    setShowCreateDialog(true);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, item: ContentItem) => {
    setAnchorEl(event.currentTarget);
    setSelectedItem(item);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleToggleFavorite = async (item: ContentItem) => {
    try {
      await api.toggleContentFavorite(item.id);
      setContentItems(contentItems.map(c => 
        c.id === item.id ? { ...c, isFavorite: !c.isFavorite } : c
      ));
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleDeleteContent = async (item: ContentItem) => {
    if (window.confirm('Are you sure you want to delete this content?')) {
      try {
        await api.deleteContent(item.id);
        setContentItems(contentItems.filter(c => c.id !== item.id));
      } catch (error) {
        console.error('Failed to delete content:', error);
      }
    }
    handleMenuClose();
  };

  const handleDuplicateContent = async (item: ContentItem) => {
    try {
      const newContent = await api.duplicateContent(item.id);
      setContentItems([newContent, ...contentItems]);
    } catch (error) {
      console.error('Failed to duplicate content:', error);
    }
    handleMenuClose();
  };

  const filteredContent = contentItems
    .filter(item => {
      if (selectedCampaign !== 'all' && item.campaign !== selectedCampaign) return false;
      if (contentType !== 'all' && item.type !== contentType) return false;
      if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'popular':
          return b.views - a.views;
        case 'conversions':
          return b.conversions - a.conversions;
        default:
          return 0;
      }
    });

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <Image />;
      case 'video':
        return <VideoLibrary />;
      case 'article':
        return <Article />;
      case 'link':
        return <Link />;
      case 'qrcode':
        return <QrCode2 />;
      default:
        return <Article />;
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'facebook':
        return <Facebook />;
      case 'twitter':
        return <Twitter />;
      case 'instagram':
        return <Instagram />;
      case 'youtube':
        return <YouTube />;
      default:
        return null;
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Content Hub
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Create, manage, and track your promotional content
        </Typography>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          <Tab label="All Content" />
          <Tab label="Campaigns" />
          <Tab label="Templates" />
          <Tab label="Analytics" />
        </Tabs>
      </Paper>

      {/* All Content Tab */}
      <TabPanel value={tabValue} index={0}>
        {/* Toolbar */}
        <Box sx={{ mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs>
              <TextField
                fullWidth
                placeholder="Search content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
                size="small"
              />
            </Grid>
            <Grid item>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  label="Type"
                >
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value="image">Images</MenuItem>
                  <MenuItem value="video">Videos</MenuItem>
                  <MenuItem value="article">Articles</MenuItem>
                  <MenuItem value="link">Links</MenuItem>
                  <MenuItem value="qrcode">QR Codes</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Campaign</InputLabel>
                <Select
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  label="Campaign"
                >
                  <MenuItem value="all">All Campaigns</MenuItem>
                  {campaigns.map(campaign => (
                    <MenuItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  label="Sort By"
                >
                  <MenuItem value="recent">Most Recent</MenuItem>
                  <MenuItem value="popular">Most Viewed</MenuItem>
                  <MenuItem value="conversions">Best Converting</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item>
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(e, value) => value && setViewMode(value)}
                size="small"
              >
                <ToggleButton value="grid">
                  <ViewModule />
                </ToggleButton>
                <ToggleButton value="list">
                  <ViewList />
                </ToggleButton>
              </ToggleButtonGroup>
            </Grid>
          </Grid>
        </Box>

        {/* Content Grid/List */}
        {loading ? (
          <Grid container spacing={3}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rectangular" height={200} />
              </Grid>
            ))}
          </Grid>
        ) : filteredContent.length === 0 ? (
          <Paper sx={{ p: 8, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No content found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create your first content to get started
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleCreateContent('image')}
            >
              Create Content
            </Button>
          </Paper>
        ) : viewMode === 'grid' ? (
          <Grid container spacing={3}>
            {filteredContent.map((item) => (
              <Grid item xs={12} sm={6} md={4} key={item.id}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ position: 'relative' }}>
                    <CardMedia
                      component="img"
                      height="200"
                      image={item.thumbnail || '/placeholder-content.jpg'}
                      alt={item.title}
                    />
                    <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                      <Chip
                        icon={getContentIcon(item.type)}
                        label={item.type}
                        size="small"
                        sx={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
                      />
                    </Box>
                    <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                      <IconButton
                        size="small"
                        onClick={() => handleToggleFavorite(item)}
                        sx={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
                      >
                        {item.isFavorite ? <Star color="warning" /> : <StarBorder />}
                      </IconButton>
                    </Box>
                    {item.status === 'scheduled' && (
                      <Box sx={{ position: 'absolute', bottom: 8, left: 8 }}>
                        <Chip
                          icon={<Schedule />}
                          label={formatDate(item.scheduledFor!)}
                          size="small"
                          color="info"
                          sx={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
                        />
                      </Box>
                    )}
                  </Box>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" gutterBottom noWrap>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {item.description}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
                      {item.platforms.map(platform => (
                        <Tooltip key={platform} title={platform}>
                          <Box>{getPlatformIcon(platform)}</Box>
                        </Tooltip>
                      ))}
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">
                        {item.views} views
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.conversions} conversions
                      </Typography>
                    </Box>
                  </CardContent>
                  <CardActions>
                    <Button size="small" startIcon={<Edit />}>
                      Edit
                    </Button>
                    <Button size="small" startIcon={<Share />}>
                      Share
                    </Button>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, item)}
                      sx={{ ml: 'auto' }}
                    >
                      <MoreVert />
                    </IconButton>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Paper>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Content</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Campaign</TableCell>
                  <TableCell>Platforms</TableCell>
                  <TableCell align="right">Views</TableCell>
                  <TableCell align="right">Conversions</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredContent.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <img
                          src={item.thumbnail || '/placeholder-content.jpg'}
                          alt=""
                          style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }}
                        />
                        <Box>
                          <Typography variant="body2">{item.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(item.createdAt)}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={getContentIcon(item.type)}
                        label={item.type}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {campaigns.find(c => c.id === item.campaign)?.name || '-'}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {item.platforms.map(platform => (
                          <Tooltip key={platform} title={platform}>
                            <Box>{getPlatformIcon(platform)}</Box>
                          </Tooltip>
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{item.views}</TableCell>
                    <TableCell align="right">{item.conversions}</TableCell>
                    <TableCell>
                      <Chip
                        label={item.status}
                        size="small"
                        color={
                          item.status === 'published' ? 'success' :
                          item.status === 'scheduled' ? 'info' : 'default'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <IconButton size="small">
                          <Edit />
                        </IconButton>
                        <IconButton size="small">
                          <Share />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, item)}
                        >
                          <MoreVert />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </TabPanel>

      {/* Campaigns Tab */}
      <TabPanel value={tabValue} index={1}>
        <CampaignBuilder
          campaigns={campaigns}
          onRefresh={loadCampaigns}
        />
      </TabPanel>

      {/* Templates Tab */}
      <TabPanel value={tabValue} index={2}>
        <TemplateGallery />
      </TabPanel>

      {/* Analytics Tab */}
      <TabPanel value={tabValue} index={3}>
        <ContentAnalytics
          contentItems={contentItems}
          campaigns={campaigns}
        />
      </TabPanel>

      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 24, right: 24 }}
        onClick={() => handleCreateContent('image')}
      >
        <Add />
      </Fab>

      {/* Content Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => selectedItem && handleDuplicateContent(selectedItem)}>
          <ListItemIcon>
            <FileCopy fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => selectedItem && handleDeleteContent(selectedItem)}>
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
        <MenuItem>
          <ListItemIcon>
            <Download fontSize="small" />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
        <MenuItem>
          <ListItemIcon>
            <Analytics fontSize="small" />
          </ListItemIcon>
          <ListItemText>View Analytics</ListItemText>
        </MenuItem>
      </Menu>

      {/* Create Content Dialog */}
      <Dialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Create New Content</DialogTitle>
        <DialogContent>
          {createType && (
            <ContentEditor
              type={createType}
              onSave={(content) => {
                setContentItems([content, ...contentItems]);
                setShowCreateDialog(false);
              }}
              onCancel={() => setShowCreateDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
};