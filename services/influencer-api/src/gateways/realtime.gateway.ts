import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { WsAuthGuard } from '../guards/ws-auth.guard';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  influencerId?: string;
  role?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://${process.env.API_HOST}'],
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private userSockets = new Map<string, Set<string>>();

  constructor(
    @InjectRedis() private redis: Redis,
    private jwtService: JwtService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verify(token);
      client.userId = payload.sub;
      client.influencerId = payload.influencerId;
      client.role = payload.role;

      // Add to user sockets map
      if (!this.userSockets.has(client.userId)) {
        this.userSockets.set(client.userId, new Set());
      }
      this.userSockets.get(client.userId)!.add(client.id);

      // Join user-specific room
      client.join(`user:${client.userId}`);
      
      // Join influencer room if applicable
      if (client.influencerId) {
        client.join(`influencer:${client.influencerId}`);
      }

      this.logger.log(`Client connected: ${client.id} (User: ${client.userId})`);

      // Send connection success
      client.emit('connected', {
        userId: client.userId,
        socketId: client.id,
      });

      // Subscribe to Redis channels for real-time updates
      await this.subscribeToUserChannels(client);
    } catch (error) {
      this.logger.error('Connection authentication failed:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userSockets = this.userSockets.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private async subscribeToUserChannels(client: AuthenticatedSocket) {
    // Subscribe to user-specific Redis channels
    const subscriber = this.redis.duplicate();
    
    subscriber.on('message', (channel, message) => {
      const data = JSON.parse(message);
      
      // Route messages based on channel
      if (channel.startsWith('staking:')) {
        this.handleStakingUpdate(client, data);
      } else if (channel.startsWith('content:')) {
        this.handleContentUpdate(client, data);
      } else if (channel.startsWith('analytics:')) {
        this.handleAnalyticsUpdate(client, data);
      } else if (channel.startsWith('notification:')) {
        this.handleNotification(client, data);
      }
    });

    // Subscribe to relevant channels
    if (client.influencerId) {
      await subscriber.subscribe(
        `staking:${client.influencerId}`,
        `content:${client.influencerId}`,
        `analytics:${client.influencerId}`,
        `notification:${client.userId}`,
      );
    } else {
      await subscriber.subscribe(
        `staking:user:${client.userId}`,
        `notification:${client.userId}`,
      );
    }
  }

  // Staking Updates
  @SubscribeMessage('subscribe:staking')
  async handleSubscribeStaking(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { influencerId?: string },
  ) {
    if (data.influencerId) {
      client.join(`staking:${data.influencerId}`);
      
      // Send current staking stats
      const stats = await this.getStakingStats(data.influencerId);
      client.emit('staking:stats', stats);
    }
  }

  @SubscribeMessage('unsubscribe:staking')
  async handleUnsubscribeStaking(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { influencerId?: string },
  ) {
    if (data.influencerId) {
      client.leave(`staking:${data.influencerId}`);
    }
  }

  private handleStakingUpdate(client: AuthenticatedSocket, data: any) {
    // Emit to specific rooms based on update type
    switch (data.type) {
      case 'new_stake':
        this.server.to(`staking:${data.influencerId}`).emit('staking:new_stake', {
          staker: data.staker,
          amount: data.amount,
          timestamp: data.timestamp,
        });
        break;
      
      case 'unstake':
        this.server.to(`staking:${data.influencerId}`).emit('staking:unstake', {
          staker: data.staker,
          amount: data.amount,
          timestamp: data.timestamp,
        });
        break;
      
      case 'rewards_distributed':
        this.server.to(`staking:${data.influencerId}`).emit('staking:rewards', {
          amount: data.amount,
          stakerCount: data.stakerCount,
          timestamp: data.timestamp,
        });
        break;
      
      case 'stats_update':
        this.server.to(`staking:${data.influencerId}`).emit('staking:stats', data.stats);
        break;
    }
  }

  // Content Updates
  @SubscribeMessage('subscribe:content')
  async handleSubscribeContent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { contentId?: string; campaignId?: string },
  ) {
    if (data.contentId) {
      client.join(`content:${data.contentId}`);
    }
    if (data.campaignId) {
      client.join(`campaign:${data.campaignId}`);
    }
  }

  private handleContentUpdate(client: AuthenticatedSocket, data: any) {
    switch (data.type) {
      case 'view':
        this.server.to(`content:${data.contentId}`).emit('content:view', {
          contentId: data.contentId,
          views: data.views,
          viewerLocation: data.location,
        });
        break;
      
      case 'conversion':
        this.server.to(`content:${data.contentId}`).emit('content:conversion', {
          contentId: data.contentId,
          conversions: data.conversions,
          revenue: data.revenue,
        });
        break;
      
      case 'share':
        this.server.to(`content:${data.contentId}`).emit('content:share', {
          contentId: data.contentId,
          platform: data.platform,
          shares: data.shares,
        });
        break;
    }
  }

  // Analytics Updates
  @SubscribeMessage('subscribe:analytics')
  async handleSubscribeAnalytics(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { type: string; id?: string },
  ) {
    if (data.type === 'dashboard' && client.influencerId) {
      client.join(`analytics:dashboard:${client.influencerId}`);
      
      // Send initial dashboard data
      const dashboardData = await this.getDashboardData(client.influencerId);
      client.emit('analytics:dashboard', dashboardData);
    }
  }

  private handleAnalyticsUpdate(client: AuthenticatedSocket, data: any) {
    switch (data.type) {
      case 'realtime_metrics':
        this.server.to(`analytics:dashboard:${data.influencerId}`).emit('analytics:realtime', {
          activeUsers: data.activeUsers,
          recentConversions: data.recentConversions,
          liveRevenue: data.liveRevenue,
          topContent: data.topContent,
        });
        break;
      
      case 'hourly_update':
        this.server.to(`analytics:dashboard:${data.influencerId}`).emit('analytics:hourly', {
          hour: data.hour,
          metrics: data.metrics,
        });
        break;
    }
  }

  // Notifications
  private handleNotification(client: AuthenticatedSocket, data: any) {
    // Send to specific user
    this.server.to(`user:${data.userId}`).emit('notification', {
      id: data.id,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data,
      timestamp: data.timestamp,
    });
  }

  @SubscribeMessage('notification:markRead')
  async handleMarkNotificationRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { notificationId: string },
  ) {
    // Mark notification as read in database
    // ... implementation
    
    client.emit('notification:read', { id: data.notificationId });
  }

  // Broadcast Methods (called from services)
  async broadcastStakingUpdate(influencerId: string, update: any) {
    await this.redis.publish(`staking:${influencerId}`, JSON.stringify(update));
  }

  async broadcastContentUpdate(contentId: string, update: any) {
    await this.redis.publish(`content:${contentId}`, JSON.stringify(update));
  }

  async broadcastAnalyticsUpdate(influencerId: string, update: any) {
    await this.redis.publish(`analytics:${influencerId}`, JSON.stringify(update));
  }

  async sendNotification(userId: string, notification: any) {
    await this.redis.publish(`notification:${userId}`, JSON.stringify(notification));
  }

  // Helper methods
  private async getStakingStats(influencerId: string) {
    // Get from cache or database
    const cached = await this.redis.get(`staking:stats:${influencerId}`);
    if (cached) return JSON.parse(cached);
    
    // Fetch from database if not cached
    // ... implementation
    return {};
  }

  private async getDashboardData(influencerId: string) {
    // Get dashboard data from cache or database
    const cached = await this.redis.get(`analytics:dashboard:${influencerId}`);
    if (cached) return JSON.parse(cached);
    
    // Fetch from database if not cached
    // ... implementation
    return {};
  }

  // Admin broadcast methods
  @UseGuards(WsAuthGuard)
  @SubscribeMessage('admin:broadcast')
  async handleAdminBroadcast(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { type: string; message: any },
  ) {
    if (client.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    switch (data.type) {
      case 'system':
        this.server.emit('system:message', data.message);
        break;
      case 'maintenance':
        this.server.emit('system:maintenance', data.message);
        break;
    }

    return { success: true };
  }
}