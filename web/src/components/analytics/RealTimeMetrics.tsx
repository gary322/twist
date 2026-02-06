import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Chip,
  Avatar,
  LinearProgress,
  IconButton,
  Tooltip,
  Badge,
  Zoom,
  Fade,
} from '@mui/material';
import {
  FiberManualRecord,
  TrendingUp,
  People,
  AttachMoney,
  Visibility,
  Refresh,
  Notifications,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { useRealtimeAnalytics, useWebSocket } from '../../hooks/useWebSocket';
import { formatNumber, formatToken } from '../../utils/format';

interface RealTimeMetricsProps {
  metrics?: any;
}

export const RealTimeMetrics: React.FC<RealTimeMetricsProps> = ({ metrics: initialMetrics }) => {
  const { isConnected } = useWebSocket();
  const { metrics: realtimeMetrics } = useRealtimeAnalytics();
  const [activeUsers, setActiveUsers] = useState(0);
  const [recentConversions, setRecentConversions] = useState<any[]>([]);
  const [liveRevenue, setLiveRevenue] = useState(0);
  const [pulseAnimation, setPulseAnimation] = useState(false);

  const metrics = realtimeMetrics || initialMetrics;

  useEffect(() => {
    if (!metrics) return;

    // Animate metrics changes
    const animateValue = (start: number, end: number, setter: (value: number) => void) => {
      const duration = 1000;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = start + (end - start) * progress;
        
        setter(Math.round(value));

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      animate();
    };

    animateValue(activeUsers, metrics.activeUsers || 0, setActiveUsers);
    animateValue(liveRevenue, parseFloat(metrics.liveRevenue || '0'), setLiveRevenue);
    
    if (metrics.recentConversions) {
      setRecentConversions(metrics.recentConversions.slice(0, 5));
      setPulseAnimation(true);
      setTimeout(() => setPulseAnimation(false), 1000);
    }
  }, [metrics]);

  const getActivityIndicator = () => {
    if (!isConnected) {
      return { color: 'error' as const, label: 'Offline' };
    }
    if (activeUsers > 100) {
      return { color: 'success' as const, label: 'High Activity' };
    }
    if (activeUsers > 50) {
      return { color: 'warning' as const, label: 'Moderate Activity' };
    }
    return { color: 'info' as const, label: 'Low Activity' };
  };

  const activity = getActivityIndicator();

  return (
    <Paper
      sx={{
        p: 2,
        mb: 3,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background Animation */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.1,
          background: 'radial-gradient(circle at 20% 50%, white 0%, transparent 50%)',
          animation: 'pulse 4s ease-in-out infinite',
          '@keyframes pulse': {
            '0%': { transform: 'scale(0.8)', opacity: 0.1 },
            '50%': { transform: 'scale(1.2)', opacity: 0.2 },
            '100%': { transform: 'scale(0.8)', opacity: 0.1 },
          },
        }}
      />

      <Grid container spacing={3} sx={{ position: 'relative' }}>
        {/* Connection Status */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="h6">Real-Time Metrics</Typography>
              <Chip
                icon={<FiberManualRecord />}
                label={activity.label}
                color={activity.color}
                size="small"
                sx={{
                  '& .MuiChip-icon': {
                    fontSize: 12,
                    animation: isConnected ? 'blink 2s infinite' : 'none',
                    '@keyframes blink': {
                      '0%': { opacity: 1 },
                      '50%': { opacity: 0.3 },
                      '100%': { opacity: 1 },
                    },
                  },
                }}
              />
            </Box>
            <Tooltip title="Refresh">
              <IconButton size="small" sx={{ color: 'white' }}>
                <Refresh />
              </IconButton>
            </Tooltip>
          </Box>
        </Grid>

        {/* Active Users */}
        <Grid item xs={12} sm={6} md={3}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 2,
              backdropFilter: 'blur(10px)',
            }}
          >
            <Avatar sx={{ bgcolor: 'rgba(255, 255, 255, 0.2)' }}>
              <People />
            </Avatar>
            <Box>
              <Typography variant="h4" component={motion.div} animate={{ scale: pulseAnimation ? 1.1 : 1 }}>
                {formatNumber(activeUsers)}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Active Users
              </Typography>
            </Box>
          </Box>
        </Grid>

        {/* Live Revenue */}
        <Grid item xs={12} sm={6} md={3}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 2,
              backdropFilter: 'blur(10px)',
            }}
          >
            <Avatar sx={{ bgcolor: 'rgba(255, 255, 255, 0.2)' }}>
              <AttachMoney />
            </Avatar>
            <Box>
              <Typography variant="h4">
                {formatToken(liveRevenue.toString())}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Today's Revenue
              </Typography>
            </Box>
          </Box>
        </Grid>

        {/* Recent Conversions */}
        <Grid item xs={12} sm={6} md={3}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 2,
              backdropFilter: 'blur(10px)',
            }}
          >
            <Badge
              badgeContent={recentConversions.length}
              color="success"
              sx={{
                '& .MuiBadge-badge': {
                  animation: pulseAnimation ? 'bounce 0.5s' : 'none',
                  '@keyframes bounce': {
                    '0%': { transform: 'scale(1)' },
                    '50%': { transform: 'scale(1.3)' },
                    '100%': { transform: 'scale(1)' },
                  },
                },
              }}
            >
              <Avatar sx={{ bgcolor: 'rgba(255, 255, 255, 0.2)' }}>
                <TrendingUp />
              </Avatar>
            </Badge>
            <Box>
              <Typography variant="h4">
                {formatNumber(metrics?.recentConversions?.length || 0)}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Recent Conversions
              </Typography>
            </Box>
          </Box>
        </Grid>

        {/* Top Content */}
        <Grid item xs={12} sm={6} md={3}>
          <Box
            sx={{
              p: 2,
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 2,
              backdropFilter: 'blur(10px)',
              height: '100%',
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 1, opacity: 0.8 }}>
              Trending Content
            </Typography>
            <AnimatePresence>
              {metrics?.topContent?.slice(0, 3).map((content: any, index: number) => (
                <Fade in key={content.id} timeout={300 * (index + 1)}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      py: 0.5,
                    }}
                  >
                    <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                      {content.title}
                    </Typography>
                    <Chip
                      icon={<Visibility />}
                      label={formatNumber(content.views)}
                      size="small"
                      sx={{
                        height: 20,
                        bgcolor: 'rgba(255, 255, 255, 0.2)',
                        '& .MuiChip-icon': { fontSize: 14 },
                      }}
                    />
                  </Box>
                </Fade>
              ))}
            </AnimatePresence>
          </Box>
        </Grid>
      </Grid>

      {/* Live Activity Feed */}
      {recentConversions.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, opacity: 0.8 }}>
            Live Activity Feed
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
            <AnimatePresence>
              {recentConversions.map((conversion, index) => (
                <motion.div
                  key={conversion.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Chip
                    avatar={<Avatar sx={{ bgcolor: 'success.main' }}>$</Avatar>}
                    label={`${conversion.product} - ${formatToken(conversion.amount)}`}
                    sx={{
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(10px)',
                    }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </Box>
        </Box>
      )}

      {/* Activity Bar */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            Activity Level
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            {Math.round((activeUsers / 500) * 100)}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min((activeUsers / 500) * 100, 100)}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: 'rgba(255, 255, 255, 0.2)',
            '& .MuiLinearProgress-bar': {
              borderRadius: 3,
              background: 'linear-gradient(90deg, #FFE53B 0%, #FF2525 100%)',
            },
          }}
        />
      </Box>
    </Paper>
  );
};