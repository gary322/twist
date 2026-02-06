import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Paper,
  Divider,
  Button,
  Alert,
  CircularProgress,
  FormGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
} from '@mui/material';
import {
  Notifications,
  NotificationsOff,
  NotificationsActive,
  Schedule,
  Vibration,
  VolumeUp,
  DoNotDisturb,
  Info,
  CheckCircle,
  Warning,
  ExpandMore,
  ExpandLess,
  TestTube,
} from '@mui/icons-material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { api } from '../services/api';
import { format, parse } from 'date-fns';

interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  enabledTypes: {
    staking: boolean;
    rewards: boolean;
    content: boolean;
    system: boolean;
    marketing: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  frequencyLimit: {
    enabled: boolean;
    max: number;
    window: number;
  };
  channels: {
    browser: boolean;
    mobile: boolean;
    email: boolean;
    sms: boolean;
  };
}

export const NotificationSettings: React.FC = () => {
  const {
    isSupported,
    permission,
    isSubscribed,
    loading: pushLoading,
    subscribe,
    unsubscribe,
    requestPermission,
    testNotification,
    error: pushError,
  } = usePushNotifications();

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    pushEnabled: false,
    emailEnabled: true,
    smsEnabled: false,
    enabledTypes: {
      staking: true,
      rewards: true,
      content: true,
      system: true,
      marketing: false,
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00',
    },
    frequencyLimit: {
      enabled: false,
      max: 10,
      window: 3600,
    },
    channels: {
      browser: true,
      mobile: true,
      email: true,
      sms: false,
    },
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const data = await api.getNotificationPreferences();
      setPreferences(data);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      await api.updateNotificationPreferences(preferences);
      showSnackbar('Notification preferences updated successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to update preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePush = async () => {
    if (!isSupported) {
      showSnackbar('Push notifications are not supported in your browser', 'error');
      return;
    }

    if (!isSubscribed) {
      if (permission === 'denied') {
        showSnackbar('Please enable notifications in your browser settings', 'error');
        return;
      }

      const success = await subscribe();
      if (success) {
        setPreferences(prev => ({ ...prev, pushEnabled: true }));
        await handleSavePreferences();
      }
    } else {
      const success = await unsubscribe();
      if (success) {
        setPreferences(prev => ({ ...prev, pushEnabled: false }));
        await handleSavePreferences();
      }
    }
  };

  const handleTestNotification = async (type: string) => {
    try {
      await api.sendTestNotification(type);
      showSnackbar('Test notification sent!', 'success');
      setShowTestDialog(false);
    } catch (error) {
      showSnackbar('Failed to send test notification', 'error');
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Notification Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage how and when you receive notifications from Twist
      </Typography>

      {/* Push Notifications */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Notifications color="primary" />
            <Box>
              <Typography variant="h6">Push Notifications</Typography>
              <Typography variant="body2" color="text.secondary">
                Get instant updates in your browser
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {isSupported && permission === 'granted' && (
              <Chip
                icon={<CheckCircle />}
                label="Enabled"
                color="success"
                size="small"
              />
            )}
            <Switch
              checked={isSubscribed}
              onChange={handleTogglePush}
              disabled={!isSupported || pushLoading}
            />
          </Box>
        </Box>

        {!isSupported && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Push notifications are not supported in your browser
          </Alert>
        )}

        {permission === 'denied' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Notifications are blocked. Please enable them in your browser settings.
          </Alert>
        )}

        {isSubscribed && (
          <Button
            variant="outlined"
            startIcon={<TestTube />}
            onClick={() => setShowTestDialog(true)}
            sx={{ mt: 2 }}
          >
            Send Test Notification
          </Button>
        )}
      </Paper>

      {/* Notification Types */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Notification Types
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose which types of notifications you want to receive
        </Typography>

        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={preferences.enabledTypes.staking}
                onChange={(e) => setPreferences({
                  ...preferences,
                  enabledTypes: { ...preferences.enabledTypes, staking: e.target.checked }
                })}
              />
            }
            label={
              <Box>
                <Typography>Staking Updates</Typography>
                <Typography variant="caption" color="text.secondary">
                  New stakes, unstakes, and tier changes
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                checked={preferences.enabledTypes.rewards}
                onChange={(e) => setPreferences({
                  ...preferences,
                  enabledTypes: { ...preferences.enabledTypes, rewards: e.target.checked }
                })}
              />
            }
            label={
              <Box>
                <Typography>Rewards & Earnings</Typography>
                <Typography variant="caption" color="text.secondary">
                  Reward distributions and earning milestones
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                checked={preferences.enabledTypes.content}
                onChange={(e) => setPreferences({
                  ...preferences,
                  enabledTypes: { ...preferences.enabledTypes, content: e.target.checked }
                })}
              />
            }
            label={
              <Box>
                <Typography>Content Updates</Typography>
                <Typography variant="caption" color="text.secondary">
                  New content from influencers you stake on
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                checked={preferences.enabledTypes.system}
                onChange={(e) => setPreferences({
                  ...preferences,
                  enabledTypes: { ...preferences.enabledTypes, system: e.target.checked }
                })}
              />
            }
            label={
              <Box>
                <Typography>System Announcements</Typography>
                <Typography variant="caption" color="text.secondary">
                  Important platform updates and maintenance
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                checked={preferences.enabledTypes.marketing}
                onChange={(e) => setPreferences({
                  ...preferences,
                  enabledTypes: { ...preferences.enabledTypes, marketing: e.target.checked }
                })}
              />
            }
            label={
              <Box>
                <Typography>Marketing & Promotions</Typography>
                <Typography variant="caption" color="text.secondary">
                  Special offers and platform news
                </Typography>
              </Box>
            }
          />
        </FormGroup>
      </Paper>

      {/* Delivery Channels */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Delivery Channels
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose how you want to receive notifications
        </Typography>

        <List>
          <ListItem>
            <ListItemText
              primary="Email Notifications"
              secondary="Receive notifications via email"
            />
            <ListItemSecondaryAction>
              <Switch
                checked={preferences.emailEnabled}
                onChange={(e) => setPreferences({ ...preferences, emailEnabled: e.target.checked })}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <ListItem>
            <ListItemText
              primary="SMS Notifications"
              secondary="Receive text messages for important updates"
            />
            <ListItemSecondaryAction>
              <Switch
                checked={preferences.smsEnabled}
                onChange={(e) => setPreferences({ ...preferences, smsEnabled: e.target.checked })}
              />
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Paper>

      {/* Advanced Settings */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Typography variant="h6">Advanced Settings</Typography>
          <IconButton size="small">
            {showAdvanced ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>

        <Collapse in={showAdvanced}>
          <Box sx={{ mt: 3 }}>
            {/* Quiet Hours */}
            <Box sx={{ mb: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={preferences.quietHours.enabled}
                    onChange={(e) => setPreferences({
                      ...preferences,
                      quietHours: { ...preferences.quietHours, enabled: e.target.checked }
                    })}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DoNotDisturb />
                    <Typography>Quiet Hours</Typography>
                  </Box>
                }
              />
              {preferences.quietHours.enabled && (
                <Box sx={{ mt: 2, ml: 4, display: 'flex', gap: 2 }}>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <TimePicker
                      label="Start Time"
                      value={parse(preferences.quietHours.start, 'HH:mm', new Date())}
                      onChange={(time) => time && setPreferences({
                        ...preferences,
                        quietHours: {
                          ...preferences.quietHours,
                          start: format(time, 'HH:mm')
                        }
                      })}
                      renderInput={(params) => <TextField {...params} size="small" />}
                    />
                    <TimePicker
                      label="End Time"
                      value={parse(preferences.quietHours.end, 'HH:mm', new Date())}
                      onChange={(time) => time && setPreferences({
                        ...preferences,
                        quietHours: {
                          ...preferences.quietHours,
                          end: format(time, 'HH:mm')
                        }
                      })}
                      renderInput={(params) => <TextField {...params} size="small" />}
                    />
                  </LocalizationProvider>
                </Box>
              )}
            </Box>

            {/* Frequency Limit */}
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={preferences.frequencyLimit.enabled}
                    onChange={(e) => setPreferences({
                      ...preferences,
                      frequencyLimit: { ...preferences.frequencyLimit, enabled: e.target.checked }
                    })}
                  />
                }
                label="Limit notification frequency"
              />
              {preferences.frequencyLimit.enabled && (
                <Box sx={{ mt: 2, ml: 4, display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField
                    type="number"
                    label="Max notifications"
                    value={preferences.frequencyLimit.max}
                    onChange={(e) => setPreferences({
                      ...preferences,
                      frequencyLimit: {
                        ...preferences.frequencyLimit,
                        max: parseInt(e.target.value) || 0
                      }
                    })}
                    size="small"
                    sx={{ width: 150 }}
                  />
                  <Typography>per</Typography>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <Select
                      value={preferences.frequencyLimit.window}
                      onChange={(e) => setPreferences({
                        ...preferences,
                        frequencyLimit: {
                          ...preferences.frequencyLimit,
                          window: e.target.value as number
                        }
                      })}
                    >
                      <MenuItem value={3600}>Hour</MenuItem>
                      <MenuItem value={86400}>Day</MenuItem>
                      <MenuItem value={604800}>Week</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              )}
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {/* Save Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          onClick={handleSavePreferences}
          disabled={saving}
          startIcon={saving && <CircularProgress size={20} />}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </Box>

      {/* Test Notification Dialog */}
      <Dialog open={showTestDialog} onClose={() => setShowTestDialog(false)}>
        <DialogTitle>Send Test Notification</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Choose a notification type to test:
          </Typography>
          <List>
            <ListItem button onClick={() => handleTestNotification('staking')}>
              <ListItemText
                primary="Staking Update"
                secondary="Test a new stake notification"
              />
            </ListItem>
            <ListItem button onClick={() => handleTestNotification('rewards')}>
              <ListItemText
                primary="Rewards Distributed"
                secondary="Test a rewards notification"
              />
            </ListItem>
            <ListItem button onClick={() => handleTestNotification('system')}>
              <ListItemText
                primary="System Message"
                secondary="Test a system announcement"
              />
            </ListItem>
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowTestDialog(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Box>
  );
};