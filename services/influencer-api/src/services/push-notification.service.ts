import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
const webpush = require('web-push');
import * as admin from 'firebase-admin';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { User, PushSubscription, NotificationPreference } from '../entities';

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: any;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
  sound?: string;
}

interface NotificationTarget {
  userId?: string;
  influencerId?: string;
  topic?: string;
  segment?: 'all' | 'stakers' | 'influencers' | 'active';
  tokens?: string[];
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private firebaseApp: admin.app.App;

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(PushSubscription)
    private subscriptionRepo: Repository<PushSubscription>,
    @InjectRepository(NotificationPreference)
    private preferenceRepo: Repository<NotificationPreference>,
    @InjectQueue('notifications') private notificationQueue: Queue,
    @InjectRedis() private redis: Redis,
  ) {
    this.initializeServices();
  }

  private initializeServices() {
    // Initialize Web Push
    webpush.setVapidDetails(
      this.configService.get('VAPID_SUBJECT') || 'mailto:support@twist.to',
      this.configService.get('VAPID_PUBLIC_KEY')!,
      this.configService.get('VAPID_PRIVATE_KEY')!,
    );

    // Initialize Firebase Admin SDK for mobile push
    if (!admin.apps.length) {
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.configService.get('FIREBASE_PROJECT_ID'),
          clientEmail: this.configService.get('FIREBASE_CLIENT_EMAIL'),
          privateKey: this.configService.get('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      this.firebaseApp = admin.app();
    }
  }

  async sendNotification(
    target: NotificationTarget,
    payload: NotificationPayload,
    options: {
      priority?: 'high' | 'normal';
      ttl?: number;
      scheduled?: Date;
      trackDelivery?: boolean;
    } = {},
  ) {
    try {
      // Get target subscriptions
      const subscriptions = await this.getTargetSubscriptions(target);
      
      if (subscriptions.length === 0) {
        this.logger.warn('No subscriptions found for target', target);
        return { sent: 0, failed: 0 };
      }

      // Check user preferences
      const filteredSubscriptions = await this.filterByPreferences(
        subscriptions,
        payload,
      );

      if (options.scheduled) {
        // Schedule notification for later
        await this.scheduleNotification(
          filteredSubscriptions,
          payload,
          options,
        );
        return { scheduled: filteredSubscriptions.length };
      }

      // Send notifications
      const results = await this.sendToSubscriptions(
        filteredSubscriptions,
        payload,
        options,
      );

      // Track analytics
      if (options.trackDelivery) {
        await this.trackNotificationAnalytics(results, payload);
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to send notification', error);
      throw error;
    }
  }

  private async getTargetSubscriptions(
    target: NotificationTarget,
  ): Promise<PushSubscription[]> {
    const qb = this.subscriptionRepo
      .createQueryBuilder('subscription')
      .where('subscription.isActive = :active', { active: true });

    if (target.userId) {
      qb.andWhere('subscription.userId = :userId', { userId: target.userId });
    }

    if (target.influencerId) {
      qb.innerJoin('subscription.user', 'user')
        .innerJoin('user_stakes', 'stake', 'stake.userId = user.id')
        .innerJoin('influencer_staking_pools', 'pool', 'pool.id = stake.poolId')
        .andWhere('pool.influencerId = :influencerId', {
          influencerId: target.influencerId,
        });
    }

    if (target.topic) {
      qb.innerJoin('subscription.topics', 'topic')
        .andWhere('topic.name = :topicName', { topicName: target.topic });
    }

    if (target.segment) {
      switch (target.segment) {
        case 'stakers':
          qb.innerJoin('subscription.user', 'user')
            .innerJoin('user_stakes', 'stake', 'stake.userId = user.id')
            .andWhere('stake.isActive = true');
          break;
        case 'influencers':
          qb.innerJoin('subscription.user', 'user')
            .innerJoin('influencers', 'influencer', 'influencer.userId = user.id');
          break;
        case 'active':
          qb.andWhere('subscription.lastActive > :date', {
            date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          });
          break;
      }
    }

    return qb.getMany();
  }

  private async filterByPreferences(
    subscriptions: PushSubscription[],
    payload: NotificationPayload,
  ): Promise<PushSubscription[]> {
    const filtered: PushSubscription[] = [];

    for (const subscription of subscriptions) {
      const preferences = await this.preferenceRepo.findOne({
        where: { userId: subscription.userId },
      });

      if (!preferences || !(preferences as any).pushEnabled) continue;

      // Check notification type preferences
      const notificationType = payload.data?.type || 'general';
      const typeEnabled = (preferences as any).enabledTypes?.[notificationType] ?? true;

      if (!typeEnabled) continue;

      // Check quiet hours
      if ((preferences as any).quietHours?.enabled) {
        const now = new Date();
        const currentHour = now.getHours();
        const { start, end } = (preferences as any).quietHours;

        if (start <= end) {
          if (currentHour >= start && currentHour < end) continue;
        } else {
          if (currentHour >= start || currentHour < end) continue;
        }
      }

      // Check frequency limits
      const recentCount = await this.getRecentNotificationCount(
        subscription.userId,
        (preferences as any).frequencyLimit?.window || 3600,
      );

      if (
        (preferences as any).frequencyLimit?.max &&
        recentCount >= (preferences as any).frequencyLimit.max
      ) {
        continue;
      }

      filtered.push(subscription);
    }

    return filtered;
  }

  private async sendToSubscriptions(
    subscriptions: PushSubscription[],
    payload: NotificationPayload,
    options: any,
  ) {
    const results = {
      sent: 0,
      failed: 0,
      errors: [] as any[],
    };

    // Group by platform
    const webSubscriptions = subscriptions.filter(s => s.platform === 'web');
    const mobileSubscriptions = subscriptions.filter(s => s.platform !== 'web');

    // Send web push notifications
    for (const subscription of webSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            ...payload,
            timestamp: Date.now(),
            id: this.generateNotificationId(),
          }),
          {
            TTL: options.ttl || 86400,
            urgency: options.priority || 'normal',
            topic: payload.tag,
          },
        );

        results.sent++;
        await this.updateSubscriptionActivity(subscription.id);
      } catch (error: any) {
        results.failed++;
        results.errors.push({ subscriptionId: subscription.id, error: error.message });

        // Handle invalid subscriptions
        if (error.statusCode === 410) {
          await this.subscriptionRepo.update(subscription.id, { isActive: false });
        }
      }
    }

    // Send mobile push notifications
    if (mobileSubscriptions.length > 0) {
      const mobileResults = await this.sendMobilePushNotifications(
        mobileSubscriptions,
        payload,
        options,
      );
      results.sent += mobileResults.sent;
      results.failed += mobileResults.failed;
      results.errors.push(...mobileResults.errors);
    }

    return results;
  }

  private async sendMobilePushNotifications(
    subscriptions: PushSubscription[],
    payload: NotificationPayload,
    options: any,
  ) {
    const results = { sent: 0, failed: 0, errors: [] as any[] };

    // Group by platform
    const iosTokens = subscriptions
      .filter(s => s.platform === 'ios')
      .map(s => s.token!);
    const androidTokens = subscriptions
      .filter(s => s.platform === 'android')
      .map(s => s.token!);

    // Prepare FCM message
    const message: admin.messaging.MulticastMessage = {
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.image,
      },
      data: {
        ...payload.data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        id: this.generateNotificationId(),
        timestamp: Date.now().toString(),
      },
      android: {
        priority: options.priority === 'high' ? 'high' : 'normal',
        ttl: (options.ttl || 86400) * 1000,
        notification: {
          icon: payload.icon || 'notification_icon',
          color: '#805ad5',
          sound: payload.sound || 'default',
          tag: payload.tag,
          channelId: payload.data?.channelId || 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            badge: payload.data?.badge,
            sound: payload.sound || 'default',
            category: payload.data?.category,
            threadId: payload.tag,
            mutableContent: true,
          },
        },
        headers: {
          'apns-priority': options.priority === 'high' ? '10' : '5',
          'apns-expiration': Math.floor(
            Date.now() / 1000 + (options.ttl || 86400),
          ).toString(),
        },
      },
      tokens: [...iosTokens, ...androidTokens],
    };

    if (message.tokens!.length > 0) {
      try {
        const response = await this.firebaseApp.messaging().sendEachForMulticast(message);
        
        results.sent += response.successCount;
        results.failed += response.failureCount;

        // Handle failures
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            results.errors.push({
              token: message.tokens![idx],
              error: resp.error?.message,
            });

            // Remove invalid tokens
            if (
              resp.error?.code === 'messaging/invalid-registration-token' ||
              resp.error?.code === 'messaging/registration-token-not-registered'
            ) {
              this.subscriptionRepo.update(
                { token: message.tokens![idx] },
                { isActive: false },
              );
            }
          }
        });
      } catch (error: any) {
        this.logger.error('FCM send failed', error);
        results.failed += message.tokens!.length;
        results.errors.push({ error: error.message });
      }
    }

    return results;
  }

  async subscribeUser(
    userId: string,
    subscription: {
      endpoint?: string;
      keys?: {
        p256dh: string;
        auth: string;
      };
      token?: string;
      platform: 'web' | 'ios' | 'android';
      deviceInfo?: any;
      deviceId?: string;
    },
  ) {
    try {
      // Check if subscription already exists
      const existing = await this.subscriptionRepo.findOne({
        where: subscription.endpoint
          ? { endpoint: subscription.endpoint }
          : { token: subscription.token },
      });

      if (existing) {
        // Update existing subscription
        await this.subscriptionRepo.update(existing.id, {
          userId,
          isActive: true,
          lastActive: new Date(),
          deviceId: subscription.deviceId,
        });
        return existing;
      }

      // Create new subscription
      const newSubscription = this.subscriptionRepo.create({
        userId,
        platform: subscription.platform,
        endpoint: subscription.endpoint,
        keys: subscription.keys ? {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        } : undefined,
        token: subscription.token,
        deviceId: subscription.deviceId,
        isActive: true,
        lastActive: new Date(),
      });

      await this.subscriptionRepo.save(newSubscription);

      // Send welcome notification
      await this.sendWelcomeNotification(userId, subscription.platform);

      return newSubscription;
    } catch (error) {
      this.logger.error('Failed to subscribe user', error);
      throw error;
    }
  }

  async unsubscribeUser(
    userId: string,
    subscriptionId?: string,
    endpoint?: string,
    token?: string,
  ) {
    const criteria: any = { userId };
    
    if (subscriptionId) criteria.id = subscriptionId;
    else if (endpoint) criteria.endpoint = endpoint;
    else if (token) criteria.token = token;

    await this.subscriptionRepo.update(criteria, { isActive: false });
  }

  async updateUserPreferences(
    userId: string,
    preferences: Partial<NotificationPreference>,
  ) {
    const existing = await this.preferenceRepo.findOne({ where: { userId } });

    if (existing) {
      await this.preferenceRepo.update(existing.id, preferences);
    } else {
      await this.preferenceRepo.save(
        this.preferenceRepo.create({
          userId,
          ...preferences,
        }),
      );
    }
  }

  async sendStakingNotifications(
    influencerId: string,
    type: 'new_stake' | 'rewards_distributed' | 'milestone_reached',
    data: any,
  ) {
    const payload: NotificationPayload = {
      title: '',
      body: '',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: `staking-${influencerId}`,
      data: {
        type: `staking_${type}`,
        influencerId,
        ...data,
      },
    };

    switch (type) {
      case 'new_stake':
        payload.title = 'New Stake on Your Pool!';
        payload.body = `${data.stakerName} staked ${data.amount} TWIST`;
        payload.actions = [
          { action: 'view', title: 'View Details' },
          { action: 'thank', title: 'Send Thanks' },
        ];
        break;

      case 'rewards_distributed':
        payload.title = 'Rewards Distributed!';
        payload.body = `${data.amount} TWIST distributed to ${data.stakerCount} stakers`;
        break;

      case 'milestone_reached':
        payload.title = '🎉 Milestone Reached!';
        payload.body = `Your staking pool reached ${data.milestone}!`;
        payload.requireInteraction = true;
        break;
    }

    await this.sendNotification(
      { influencerId },
      payload,
      { priority: 'high', trackDelivery: true },
    );
  }

  async sendContentNotifications(
    contentId: string,
    type: 'published' | 'milestone' | 'trending',
    data: any,
  ) {
    // Implementation for content notifications
  }

  async sendSystemNotification(
    message: string,
    options: {
      segment?: NotificationTarget['segment'];
      priority?: 'high' | 'normal';
      action?: { text: string; url: string };
    } = {},
  ) {
    const payload: NotificationPayload = {
      title: 'Twist Platform Update',
      body: message,
      icon: '/icon-192x192.png',
      data: {
        type: 'system',
        url: options.action?.url,
      },
      actions: options.action
        ? [{ action: 'open', title: options.action.text }]
        : undefined,
    };

    await this.sendNotification(
      { segment: options.segment || 'all' },
      payload,
      { priority: options.priority || 'normal' },
    );
  }

  private async sendWelcomeNotification(userId: string, platform: string) {
    const payload: NotificationPayload = {
      title: 'Welcome to Twist! 🎉',
      body: 'Thanks for enabling notifications. You\'ll now receive updates about your stakes and rewards.',
      icon: '/icon-192x192.png',
      data: {
        type: 'welcome',
        url: '/dashboard',
      },
      actions: [
        { action: 'explore', title: 'Explore Platform' },
      ],
    };

    await this.sendNotification({ userId }, payload, { priority: 'normal' });
  }

  private async scheduleNotification(
    subscriptions: PushSubscription[],
    payload: NotificationPayload,
    options: any,
  ) {
    const jobData = {
      subscriptions: subscriptions.map(s => s.id),
      payload,
      options,
    };

    await this.notificationQueue.add('scheduled-notification', jobData, {
      delay: options.scheduled.getTime() - Date.now(),
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  private async trackNotificationAnalytics(results: any, payload: NotificationPayload) {
    const analytics = {
      type: payload.data?.type || 'general',
      sent: results.sent,
      failed: results.failed,
      timestamp: new Date(),
      title: payload.title,
    };

    await this.redis.hincrby('notification:stats:sent', analytics.type, results.sent);
    await this.redis.hincrby('notification:stats:failed', analytics.type, results.failed);
    
    // Store recent notifications for monitoring
    await this.redis.lpush(
      'notification:recent',
      JSON.stringify(analytics),
    );
    await this.redis.ltrim('notification:recent', 0, 99);
  }

  private async getRecentNotificationCount(
    userId: string,
    windowSeconds: number,
  ): Promise<number> {
    const key = `notification:user:${userId}:count`;
    const count = await this.redis.get(key);
    return parseInt(count || '0', 10);
  }

  private async updateSubscriptionActivity(subscriptionId: string) {
    await this.subscriptionRepo.update(subscriptionId, {
      lastActive: new Date(),
    });
  }

  private generateNotificationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}