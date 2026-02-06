import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  Tabs,
  Tab,
  InputAdornment,
  Autocomplete,
} from '@mui/material';
import {
  CloudUpload,
  Image as ImageIcon,
  VideoLibrary,
  Article,
  Link,
  QrCode2,
  Delete,
  Add,
  Preview,
  Schedule,
  Facebook,
  Twitter,
  Instagram,
  YouTube,
  LinkedIn,
  TikTok,
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useDropzone } from 'react-dropzone';
import { api } from '../../services/api';
import { RichTextEditor } from './RichTextEditor';
import { ImageEditor } from './ImageEditor';
import { VideoEditor } from './VideoEditor';
import { LinkBuilder } from './LinkBuilder';
import { QRCodeBuilder } from './QRCodeBuilder';

interface ContentEditorProps {
  type: string;
  content?: any;
  onSave: (content: any) => void;
  onCancel: () => void;
}

interface Platform {
  id: string;
  name: string;
  icon: React.ReactNode;
  maxCharacters?: number;
  mediaTypes: string[];
  aspectRatios?: string[];
}

const platforms: Platform[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    icon: <Facebook />,
    maxCharacters: 63206,
    mediaTypes: ['image', 'video'],
    aspectRatios: ['1:1', '16:9', '9:16'],
  },
  {
    id: 'twitter',
    name: 'Twitter',
    icon: <Twitter />,
    maxCharacters: 280,
    mediaTypes: ['image', 'video'],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: <Instagram />,
    maxCharacters: 2200,
    mediaTypes: ['image', 'video'],
    aspectRatios: ['1:1', '4:5', '9:16'],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: <YouTube />,
    maxCharacters: 5000,
    mediaTypes: ['video'],
    aspectRatios: ['16:9'],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: <LinkedIn />,
    maxCharacters: 3000,
    mediaTypes: ['image', 'video', 'article'],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: <TikTok />,
    maxCharacters: 2200,
    mediaTypes: ['video'],
    aspectRatios: ['9:16'],
  },
];

export const ContentEditor: React.FC<ContentEditorProps> = ({
  type,
  content,
  onSave,
  onCancel,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [title, setTitle] = useState(content?.title || '');
  const [description, setDescription] = useState(content?.description || '');
  const [tags, setTags] = useState<string[]>(content?.tags || []);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    content?.platforms || []
  );
  const [campaign, setCampaign] = useState(content?.campaign || '');
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [contentData, setContentData] = useState<any>({});
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  React.useEffect(() => {
    loadCampaigns();
    loadProducts();
  }, []);

  const loadCampaigns = async () => {
    try {
      const data = await api.getInfluencerCampaigns();
      setCampaigns(data);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setMediaFiles([...mediaFiles, ...acceptedFiles]);
  }, [mediaFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: type === 'image' ? {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    } : type === 'video' ? {
      'video/*': ['.mp4', '.mov', '.avi', '.webm']
    } : undefined,
  });

  const handleRemoveFile = (index: number) => {
    setMediaFiles(mediaFiles.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!title) {
      setError('Title is required');
      return;
    }

    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Upload media files if any
      let uploadedMedia = [];
      if (mediaFiles.length > 0) {
        uploadedMedia = await uploadMediaFiles();
      }

      const contentPayload = {
        type,
        title,
        description,
        tags,
        platforms: selectedPlatforms,
        campaign,
        products: selectedProducts,
        status: publishMode === 'now' ? 'published' : 'scheduled',
        scheduledFor: scheduledDate,
        media: uploadedMedia,
        ...contentData,
      };

      const savedContent = await api.createContent(contentPayload);
      onSave(savedContent);
    } catch (error: any) {
      setError(error.message || 'Failed to save content');
    } finally {
      setUploading(false);
    }
  };

  const uploadMediaFiles = async () => {
    const uploaded = [];
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      const formData = new FormData();
      formData.append('file', file);

      const result = await api.uploadContentMedia(formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            ((i + progressEvent.loaded / progressEvent.total) / mediaFiles.length) * 100
          );
          setUploadProgress(progress);
        },
      });

      uploaded.push(result);
    }
    return uploaded;
  };

  const getAvailablePlatforms = () => {
    return platforms.filter(platform => {
      if (!platform.mediaTypes.includes(type)) return false;
      return true;
    });
  };

  const getContentEditor = () => {
    switch (type) {
      case 'image':
        return (
          <ImageEditor
            files={mediaFiles}
            onChange={setContentData}
            platforms={selectedPlatforms}
          />
        );
      case 'video':
        return (
          <VideoEditor
            files={mediaFiles}
            onChange={setContentData}
            platforms={selectedPlatforms}
          />
        );
      case 'article':
        return (
          <RichTextEditor
            value={contentData.content || ''}
            onChange={(content) => setContentData({ ...contentData, content })}
          />
        );
      case 'link':
        return (
          <LinkBuilder
            products={products}
            onChange={setContentData}
          />
        );
      case 'qrcode':
        return (
          <QRCodeBuilder
            products={products}
            onChange={setContentData}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Box>
      <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label="Content" />
        <Tab label="Platforms" />
        <Tab label="Publishing" />
      </Tabs>

      {/* Content Tab */}
      {activeTab === 0 && (
        <Box>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                helperText="Give your content a descriptive title"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline
                rows={3}
                helperText="Add a brief description (optional)"
              />
            </Grid>

            <Grid item xs={12}>
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={tags}
                onChange={(e, value) => setTags(value)}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      variant="outlined"
                      label={option}
                      {...getTagProps({ index })}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Tags"
                    placeholder="Add tags"
                    helperText="Press Enter to add tags"
                  />
                )}
              />
            </Grid>

            {(type === 'image' || type === 'video') && (
              <Grid item xs={12}>
                <Paper
                  {...getRootProps()}
                  sx={{
                    p: 4,
                    border: '2px dashed',
                    borderColor: isDragActive ? 'primary.main' : 'divider',
                    backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <input {...getInputProps()} />
                  <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    or click to select files
                  </Typography>
                </Paper>

                {mediaFiles.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Uploaded Files ({mediaFiles.length})
                    </Typography>
                    <Grid container spacing={2}>
                      {mediaFiles.map((file, index) => (
                        <Grid item xs={6} sm={4} md={3} key={index}>
                          <Paper sx={{ p: 1, position: 'relative' }}>
                            {file.type.startsWith('image/') ? (
                              <img
                                src={URL.createObjectURL(file)}
                                alt=""
                                style={{ width: '100%', height: 100, objectFit: 'cover' }}
                              />
                            ) : (
                              <Box
                                sx={{
                                  height: 100,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: 'action.hover',
                                }}
                              >
                                <VideoLibrary sx={{ fontSize: 40, color: 'text.secondary' }} />
                              </Box>
                            )}
                            <Typography variant="caption" noWrap sx={{ display: 'block', mt: 1 }}>
                              {file.name}
                            </Typography>
                            <IconButton
                              size="small"
                              sx={{ position: 'absolute', top: 4, right: 4 }}
                              onClick={() => handleRemoveFile(index)}
                            >
                              <Delete />
                            </IconButton>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}
              </Grid>
            )}

            <Grid item xs={12}>
              {getContentEditor()}
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Platforms Tab */}
      {activeTab === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Select Platforms
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Choose where you want to publish this content
          </Typography>

          <Grid container spacing={2}>
            {getAvailablePlatforms().map((platform) => (
              <Grid item xs={12} sm={6} md={4} key={platform.id}>
                <Paper
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    border: 2,
                    borderColor: selectedPlatforms.includes(platform.id)
                      ? 'primary.main'
                      : 'divider',
                    backgroundColor: selectedPlatforms.includes(platform.id)
                      ? 'action.selected'
                      : 'background.paper',
                  }}
                  onClick={() => {
                    if (selectedPlatforms.includes(platform.id)) {
                      setSelectedPlatforms(
                        selectedPlatforms.filter((p) => p !== platform.id)
                      );
                    } else {
                      setSelectedPlatforms([...selectedPlatforms, platform.id]);
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {platform.icon}
                    <Typography variant="subtitle1">{platform.name}</Typography>
                  </Box>
                  {platform.maxCharacters && (
                    <Typography variant="caption" color="text.secondary">
                      Max {platform.maxCharacters} characters
                    </Typography>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>

          {selectedPlatforms.length > 0 && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Platform-Specific Settings
              </Typography>
              {selectedPlatforms.map((platformId) => {
                const platform = platforms.find((p) => p.id === platformId);
                if (!platform) return null;

                return (
                  <Paper key={platformId} sx={{ p: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      {platform.icon}
                      <Typography variant="subtitle2">{platform.name}</Typography>
                    </Box>
                    {platform.aspectRatios && (
                      <FormControl size="small" fullWidth>
                        <InputLabel>Aspect Ratio</InputLabel>
                        <Select defaultValue={platform.aspectRatios[0]}>
                          {platform.aspectRatios.map((ratio) => (
                            <MenuItem key={ratio} value={ratio}>
                              {ratio}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Paper>
                );
              })}
            </Box>
          )}
        </Box>
      )}

      {/* Publishing Tab */}
      {activeTab === 2 && (
        <Box>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Campaign</InputLabel>
                <Select
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                >
                  <MenuItem value="">No Campaign</MenuItem>
                  {campaigns.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Autocomplete
                multiple
                options={products}
                getOptionLabel={(option) => option.name}
                value={products.filter((p) => selectedProducts.includes(p.id))}
                onChange={(e, value) => setSelectedProducts(value.map((v) => v.id))}
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
                    label="Products"
                    placeholder="Select products to promote"
                  />
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Publishing Options
              </Typography>
              <RadioGroup
                value={publishMode}
                onChange={(e) => setPublishMode(e.target.value as 'now' | 'schedule')}
              >
                <FormControlLabel
                  value="now"
                  control={<Radio />}
                  label="Publish immediately"
                />
                <FormControlLabel
                  value="schedule"
                  control={<Radio />}
                  label="Schedule for later"
                />
              </RadioGroup>
            </Grid>

            {publishMode === 'schedule' && (
              <Grid item xs={12}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DateTimePicker
                    label="Scheduled Date & Time"
                    value={scheduledDate}
                    onChange={setScheduledDate}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                    minDateTime={new Date()}
                  />
                </LocalizationProvider>
              </Grid>
            )}
          </Grid>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {uploading && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" gutterBottom>
            Uploading content...
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress} />
        </Box>
      )}

      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={uploading}
          startIcon={publishMode === 'schedule' ? <Schedule /> : null}
        >
          {publishMode === 'schedule' ? 'Schedule' : 'Publish'}
        </Button>
      </Box>
    </Box>
  );
};