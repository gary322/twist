import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Box,
  Chip,
} from '@mui/material';
import {
  TrendingUp,
  AttachMoney,
  Link as LinkIcon,
  Person,
  CheckCircle,
  Cancel,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { formatToken } from '../../utils/format';

interface Activity {
  id: string;
  type: 'stake' | 'unstake' | 'conversion' | 'link_created' | 'payout' | 'reward';
  title: string;
  description: string;
  amount?: string;
  timestamp: Date;
  status?: 'success' | 'pending' | 'failed';
  user?: {
    id: string;
    username: string;
    avatar?: string;
  };
}

interface RecentActivityProps {
  activities: Activity[];
  showAll?: boolean;
}

export const RecentActivity: React.FC<RecentActivityProps> = ({ activities, showAll = false }) => {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'stake':
      case 'unstake':
        return <TrendingUp />;
      case 'conversion':
        return <AttachMoney />;
      case 'link_created':
        return <LinkIcon />;
      case 'payout':
        return <AttachMoney />;
      case 'reward':
        return <CheckCircle />;
      default:
        return <Person />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'stake':
        return 'success';
      case 'unstake':
        return 'warning';
      case 'conversion':
        return 'primary';
      case 'payout':
        return 'info';
      default:
        return 'default';
    }
  };

  const displayActivities = showAll ? activities : activities.slice(0, 5);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Recent Activity</Typography>
          {!showAll && activities.length > 5 && (
            <Typography
              variant="body2"
              color="primary"
              sx={{ cursor: 'pointer' }}
              onClick={() => {/* Navigate to full activity page */}}
            >
              View all
            </Typography>
          )}
        </Box>
        {activities.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No recent activity
          </Typography>
        ) : (
          <List sx={{ p: 0 }}>
            {displayActivities.map((activity, index) => (
              <ListItem
                key={activity.id}
                sx={{
                  px: 0,
                  borderBottom: index < displayActivities.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                }}
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: `${getActivityColor(activity.type)}.light` }}>
                    {getActivityIcon(activity.type)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight="medium">
                        {activity.title}
                      </Typography>
                      {activity.status && (
                        <Chip
                          size="small"
                          label={activity.status}
                          color={
                            activity.status === 'success' ? 'success' : 
                            activity.status === 'failed' ? 'error' : 'default'
                          }
                          sx={{ height: 20 }}
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        {activity.description}
                      </Typography>
                      {activity.amount && (
                        <Typography variant="caption" color="primary" sx={{ ml: 1 }}>
                          {formatToken(activity.amount)}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <Typography variant="caption" color="text.secondary">
                  {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                </Typography>
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
};