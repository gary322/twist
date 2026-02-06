import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { StakingService } from '../services/staking.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userType?: 'user' | 'influencer';
}

@WebSocketGateway({
  cors: {
    origin: ['https://twist.to', 'http://${process.env.API_HOST}'],
    credentials: true,
  },
  namespace: '/staking',
})
export class StakingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(StakingGateway.name);
  private userSockets = new Map<string, Set<string>>();

  constructor(
    @InjectRedis() private redis: Redis,
    private jwtService: JwtService,
    private stakingService: StakingService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    // Subscribe to Redis events
    this.subscribeToRedisEvents();
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authenticate the connection
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verify(token);
      client.userId = payload.sub;
      client.userType = payload.type;

      // Track connected users
      this.addUserSocket(client.userId, client.id);

      // Join user-specific room
      client.join(`user:${client.userId}`);

      // Join type-specific room
      client.join(`${client.userType}:updates`);

      this.logger.log(`Client connected: ${client.id} (User: ${client.userId})`);

      // Send initial data
      await this.sendInitialData(client);
    } catch (error) {
      this.logger.error('Connection authentication failed', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.removeUserSocket(client.userId, client.id);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:influencer')
  async handleInfluencerSubscription(
    @MessageBody() data: { influencerId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const room = `influencer:${data.influencerId}`;
    client.join(room);
    
    // Send current pool data
    const poolData = await this.stakingService.getInfluencerStakingDetails(data.influencerId);
    client.emit('influencer:data', poolData);
  }

  @SubscribeMessage('unsubscribe:influencer')
  handleInfluencerUnsubscription(
    @MessageBody() data: { influencerId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const room = `influencer:${data.influencerId}`;
    client.leave(room);
  }

  @SubscribeMessage('subscribe:portfolio')
  async handlePortfolioSubscription(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.userId) return;

    const room = `portfolio:${client.userId}`;
    client.join(room);
    
    // Send current portfolio data
    const portfolio = await this.stakingService.getUserStakes(client.userId);
    client.emit('portfolio:data', portfolio);
  }

  @SubscribeMessage('stake:preview')
  async handleStakePreview(
    @MessageBody() data: { influencerId: string; amount: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      const pool = await this.stakingService.getInfluencerStakingDetails(data.influencerId);
      const estimatedApy = pool.metrics.apy;
      const shareOfPool = (BigInt(data.amount) * 10000n) / (BigInt(pool.pool.totalStaked) + BigInt(data.amount));
      
      client.emit('stake:preview:result', {
        estimatedApy,
        shareOfPool: Number(shareOfPool) / 100,
        minStake: pool.pool.minStake,
        currentTotalStaked: pool.pool.totalStaked,
      });
    } catch (error) {
      client.emit('stake:preview:error', { error: error.message });
    }
  }

  private async sendInitialData(client: AuthenticatedSocket) {
    if (!client.userId) return;

    // Send user's portfolio summary
    if (client.userType === 'user') {
      const portfolio = await this.stakingService.getUserStakes(client.userId);
      if (Array.isArray(portfolio)) {
        client.emit('portfolio:summary', {
          totalStakes: portfolio.length,
          totalStaked: portfolio.reduce((sum: bigint, s: any) => sum + BigInt(s.stake.amount), 0n).toString(),
          totalPendingRewards: portfolio.reduce((sum: bigint, s: any) => sum + BigInt(s.stake.pendingRewards), 0n).toString(),
        });
      }
    }

    // Send influencer's pool summary
    if (client.userType === 'influencer') {
      const pool = await this.redis.get(`pool:summary:${client.userId}`);
      if (pool) {
        client.emit('pool:summary', JSON.parse(pool));
      }
    }
  }

  private async subscribeToRedisEvents() {
    const subscriber = this.redis.duplicate();
    
    await subscriber.psubscribe('staking:*');
    await subscriber.psubscribe('notifications:*');

    subscriber.on('pmessage', (pattern, channel, message) => {
      this.handleRedisMessage(channel, message);
    });
  }

  private handleRedisMessage(channel: string, message: string) {
    try {
      const data = JSON.parse(message);
      
      // Handle staking events
      if (channel.startsWith('staking:')) {
        const [, eventType, entityId] = channel.split(':');
        
        switch (eventType) {
          case 'stake':
            this.broadcastStakeUpdate(entityId, data);
            break;
          case 'unstake':
            this.broadcastUnstakeUpdate(entityId, data);
            break;
          case 'rewards':
            this.broadcastRewardsUpdate(entityId, data);
            break;
          case 'tier':
            this.broadcastTierUpdate(entityId, data);
            break;
        }
      }
      
      // Handle notification events
      if (channel.startsWith('notifications:')) {
        const [, recipientType, recipientId] = channel.split(':');
        this.sendNotificationToUser(recipientId, data);
      }
    } catch (error) {
      this.logger.error('Failed to handle Redis message', error);
    }
  }

  private broadcastStakeUpdate(influencerId: string, data: any) {
    // Notify all subscribers of the influencer
    this.server.to(`influencer:${influencerId}`).emit('stake:update', {
      influencerId,
      newStake: data.newStake,
      totalStaked: data.totalStaked,
      stakerCount: data.stakerCount,
      newTier: data.newTier,
    });

    // Notify the staker
    this.server.to(`user:${data.userId}`).emit('stake:confirmed', {
      influencerId,
      amount: data.amount,
      transactionId: data.transactionId,
    });

    // Update portfolio for the staker
    this.server.to(`portfolio:${data.userId}`).emit('portfolio:update', {
      action: 'stake',
      influencerId,
      amount: data.amount,
    });
  }

  private broadcastUnstakeUpdate(influencerId: string, data: any) {
    // Notify all subscribers of the influencer
    this.server.to(`influencer:${influencerId}`).emit('unstake:update', {
      influencerId,
      totalStaked: data.totalStaked,
      stakerCount: data.stakerCount,
    });

    // Notify the user
    this.server.to(`user:${data.userId}`).emit('unstake:confirmed', {
      influencerId,
      amount: data.amount,
      transactionId: data.transactionId,
    });

    // Update portfolio
    this.server.to(`portfolio:${data.userId}`).emit('portfolio:update', {
      action: 'unstake',
      influencerId,
      amount: data.amount,
    });
  }

  private broadcastRewardsUpdate(poolId: string, data: any) {
    // Notify influencer of new rewards distribution
    this.server.to(`influencer:${data.influencerId}`).emit('rewards:distributed', {
      totalEarned: data.totalEarned,
      stakerShare: data.stakerShare,
      influencerShare: data.influencerShare,
    });

    // Notify all stakers in the pool
    data.stakers?.forEach((staker: any) => {
      this.server.to(`user:${staker.userId}`).emit('rewards:available', {
        influencerId: data.influencerId,
        amount: staker.rewards,
        poolId,
      });
    });
  }

  private broadcastTierUpdate(influencerId: string, data: any) {
    // Notify the influencer
    this.server.to(`user:${influencerId}`).emit('tier:upgraded', {
      oldTier: data.oldTier,
      newTier: data.newTier,
      totalStaked: data.totalStaked,
    });

    // Notify all subscribers
    this.server.to(`influencer:${influencerId}`).emit('influencer:tier:changed', {
      influencerId,
      newTier: data.newTier,
    });
  }

  private sendNotificationToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }

  private addUserSocket(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  private removeUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  // Public method to emit events from services
  public emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  public emitToInfluencer(influencerId: string, event: string, data: any) {
    this.server.to(`influencer:${influencerId}`).emit(event, data);
  }
}