import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as sgMail from '@sendgrid/mail';
import * as admin from 'firebase-admin';
import { Notification, NotificationType, RecipientType, NotificationPreference, Influencer } from '../entities';
import { SECRETS } from '../mocks/config.mock';
import { v4 as uuidv4 } from 'uuid';

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: 'high' | 'normal';
}

export interface NotificationData {
  type: NotificationType;
  data: Record<string, any>;
}

export interface EmailTemplate {
  subject: string;
  htmlContent: string;
  textContent?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private firebaseApp: admin.app.App;

  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private preferenceRepo: Repository<NotificationPreference>,
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    @InjectRedis() private redis: Redis,
    @InjectQueue('notifications') private notificationQueue: Queue,
  ) {
    // Initialize SendGrid
    sgMail.setApiKey(SECRETS.SENDGRID.API_KEY);

    // Initialize Firebase Admin
    this.firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: SECRETS.FIREBASE.PROJECT_ID,
        clientEmail: SECRETS.FIREBASE.CLIENT_EMAIL,
        privateKey: SECRETS.FIREBASE.PRIVATE_KEY,
      }),
    });
  }

  async sendInfluencerNotification(params: {
    influencerId: string;
    type: NotificationData['type'];
    data: Record<string, any>;
  }): Promise<void> {
    const { influencerId, type, data } = params;

    // Check preferences
    const preferences = await this.getNotificationPreferences(influencerId);
    if (!this.shouldSendNotification(type, preferences)) {
      return;
    }

    // Create notification record
    const notification = this.notificationRepo.create({
      recipientId: influencerId,
      recipientType: RecipientType.INFLUENCER,
      type,
      title: this.getNotificationTitle(type),
      message: this.getNotificationMessage(type, data),
      data,
      read: false,
    });

    await this.notificationRepo.save(notification);

    // Queue for delivery
    await this.notificationQueue.add('send-notification', {
      notificationId: notification.id,
      channels: preferences,
    });
  }

  async sendUserNotification(params: {
    userId: string;
    type: NotificationData['type'];
    data: Record<string, any>;
  }): Promise<void> {
    const { userId, type, data } = params;

    // Get user preferences from Redis
    const preferencesKey = `user:${userId}:notification_preferences`;
    const preferences = await this.redis.get(preferencesKey);
    const parsedPreferences = preferences ? JSON.parse(preferences) : this.getDefaultPreferences();

    if (!this.shouldSendNotification(type, parsedPreferences)) {
      return;
    }

    // Create notification record
    const notification = this.notificationRepo.create({
      recipientId: userId,
      recipientType: RecipientType.USER,
      type,
      title: this.getNotificationTitle(type),
      message: this.getNotificationMessage(type, data),
      data,
      read: false,
    });

    await this.notificationRepo.save(notification);

    // Queue for delivery
    await this.notificationQueue.add('send-notification', {
      notificationId: notification.id,
      channels: parsedPreferences,
    });
  }

  async processNotification(notificationId: string, channels: any): Promise<void> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    const deliveryResults = [];

    // Send via enabled channels
    if (channels.email) {
      const emailResult = await this.sendEmail(notification);
      deliveryResults.push({ channel: 'email', ...emailResult });
    }

    if (channels.push) {
      const pushResult = await this.sendPushNotification(notification);
      deliveryResults.push({ channel: 'push', ...pushResult });
    }

    if (channels.inApp) {
      // In-app notifications are already created in the database
      await this.sendRealtimeNotification(notification);
      deliveryResults.push({ channel: 'inApp', success: true });
    }

    // Update delivery status
    notification.deliveredAt = new Date();
    notification.deliveryChannels = deliveryResults
      .filter(r => r.success)
      .map(r => r.channel);
    
    await this.notificationRepo.save(notification);
  }

  private async sendEmail(notification: Notification): Promise<{ success: boolean; error?: string }> {
    try {
      let recipientEmail: string;
      
      if (notification.recipientType === 'influencer') {
        const influencer = await this.influencerRepo.findOne({
          where: { id: notification.recipientId },
        });
        recipientEmail = influencer?.email;
      } else {
        // Get user email from Redis or user service
        recipientEmail = await this.redis.get(`user:${notification.recipientId}:email`);
      }

      if (!recipientEmail) {
        return { success: false, error: 'Recipient email not found' };
      }

      const template = this.getEmailTemplate(notification.type, notification.data);

      await sgMail.send({
        to: recipientEmail,
        from: SECRETS.SENDGRID.FROM_EMAIL,
        subject: template.subject,
        html: template.htmlContent,
        text: template.textContent,
        trackingSettings: {
          clickTracking: { enable: true },
          openTracking: { enable: true },
        },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send email for notification ${notification.id}`, error);
      return { success: false, error: error.message };
    }
  }

  private async sendPushNotification(notification: Notification): Promise<{ success: boolean; error?: string }> {
    try {
      // Get push tokens
      const tokens = await this.getPushTokens(notification.recipientId, notification.recipientType);
      
      if (tokens.length === 0) {
        return { success: false, error: 'No push tokens found' };
      }

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: notification.title,
          body: notification.message,
        },
        data: {
          notificationId: notification.id,
          type: notification.type,
          ...this.serializeData(notification.data),
        },
        android: {
          priority: 'high',
          notification: {
            clickAction: this.getClickAction(notification.type),
            color: '#8B5CF6',
          },
        },
        apns: {
          payload: {
            aps: {
              badge: await this.getUnreadCount(notification.recipientId),
              sound: 'default',
            },
          },
        },
      };

      const response = await this.firebaseApp.messaging().sendEachForMulticast(message);
      
      return { 
        success: response.successCount > 0,
        error: response.failureCount > 0 ? 'Some tokens failed' : undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to send push notification ${notification.id}`, error);
      return { success: false, error: error.message };
    }
  }

  private async sendRealtimeNotification(notification: Notification): Promise<void> {
    // Publish to Redis for WebSocket delivery
    const channel = `notifications:${notification.recipientType}:${notification.recipientId}`;
    
    await this.redis.publish(channel, JSON.stringify({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      createdAt: notification.createdAt,
    }));
  }

  private getNotificationTitle(type: NotificationType): string {
    const titles: Record<NotificationType, string> = {
      [NotificationType.NEW_STAKE]: '🎉 New Stake!',
      [NotificationType.STAKE_WITHDRAWN]: '📤 Stake Withdrawn',
      [NotificationType.REWARDS_CLAIMED]: '💰 Rewards Claimed',
      [NotificationType.NEW_CONVERSION]: '🛒 New Conversion!',
      [NotificationType.PAYOUT_CALCULATED]: '💸 Payout Ready',
      [NotificationType.STAKING_REWARDS]: '🌟 Staking Rewards',
      [NotificationType.TIER_UPGRADE]: '🚀 Tier Upgrade!',
      [NotificationType.MILESTONE_REACHED]: '🏆 Milestone Reached!',
      [NotificationType.FRAUD_ALERT]: '⚠️ Fraud Alert',
      [NotificationType.SYSTEM]: '📢 System Notification',
    };
    
    return titles[type] || 'TWIST Notification';
  }

  private getNotificationMessage(type: NotificationType, data: Record<string, any>): string {
    switch (type) {
      case NotificationType.NEW_STAKE:
        return `${data.stakerName} just staked ${data.amount} TWIST on you!`;
      
      case NotificationType.STAKE_WITHDRAWN:
        return `${data.stakerName} withdrew ${data.amount} TWIST from your pool`;
      
      case NotificationType.REWARDS_CLAIMED:
        return `You claimed ${data.amount} TWIST in rewards`;
      
      case NotificationType.NEW_CONVERSION:
        return `You earned ${data.earnedAmount} TWIST from a new conversion (${data.attribution}% attribution)`;
      
      case NotificationType.PAYOUT_CALCULATED:
        return `Your weekly payout of ${data.earnings.grossEarnings} TWIST is ready! ${data.stakerCount} stakers will receive their share.`;
      
      case NotificationType.STAKING_REWARDS:
        return `You earned ${data.earned} TWIST from staking on ${data.influencerName}`;
      
      case NotificationType.TIER_UPGRADE:
        return `Congratulations! You've been upgraded to ${data.newTier} tier!`;
      
      case NotificationType.MILESTONE_REACHED:
        return `Amazing! You've reached ${data.milestone}!`;
      
      case NotificationType.FRAUD_ALERT:
        return `Security alert: ${data.message}`;
        
      case NotificationType.SYSTEM:
        return data.message || 'System notification';
      
      default:
        return 'You have a new notification';
    }
  }

  private getEmailTemplate(type: NotificationType, data: Record<string, any>): EmailTemplate {
    // Base template
    const baseHtml = (content: string) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #8B5CF6; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #8B5CF6; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          ${content}
          <div class="footer">
            <p>© 2024 TWIST. All rights reserved.</p>
            <p><a href="https://twist.to/settings/notifications">Manage notification preferences</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    switch (type) {
      case NotificationType.PAYOUT_CALCULATED:
        return {
          subject: `💸 Your TWIST payout is ready!`,
          htmlContent: baseHtml(`
            <div class="header">
              <h1>Payout Ready!</h1>
            </div>
            <div class="content">
              <h2>Great news! Your weekly earnings are ready.</h2>
              <p>Here's your payout summary for ${new Date(data.period.start).toLocaleDateString()} - ${new Date(data.period.end).toLocaleDateString()}:</p>
              <ul>
                <li><strong>Total Conversions:</strong> ${data.earnings.conversions}</li>
                <li><strong>Gross Earnings:</strong> ${data.earnings.grossEarnings} TWIST</li>
                <li><strong>Your Share:</strong> ${data.earnings.influencerShare} TWIST</li>
                <li><strong>Staker Rewards:</strong> ${data.earnings.stakerShare} TWIST (${data.stakerCount} stakers)</li>
              </ul>
              <a href="https://twist.to/payouts" class="button">View Payout Details</a>
            </div>
          `),
        };

      case NotificationType.TIER_UPGRADE:
        return {
          subject: `🚀 You've been upgraded to ${data.newTier} tier!`,
          htmlContent: baseHtml(`
            <div class="header">
              <h1>Tier Upgrade!</h1>
            </div>
            <div class="content">
              <h2>Congratulations! You're now a ${data.newTier} influencer!</h2>
              <p>Your growing community of stakers has unlocked new benefits:</p>
              <ul>
                <li>Higher visibility in search results</li>
                <li>Premium badge on your profile</li>
                <li>Priority support</li>
                ${data.newTier === 'PLATINUM' ? '<li>Custom revenue share options</li>' : ''}
              </ul>
              <a href="https://twist.to/profile" class="button">View Your Profile</a>
            </div>
          `),
        };

      default:
        return {
          subject: this.getNotificationTitle(type),
          htmlContent: baseHtml(`
            <div class="header">
              <h1>${this.getNotificationTitle(type)}</h1>
            </div>
            <div class="content">
              <p>${this.getNotificationMessage(type, data)}</p>
              <a href="https://twist.to/notifications" class="button">View Details</a>
            </div>
          `),
        };
    }
  }

  private async getNotificationPreferences(recipientId: string): Promise<any> {
    const preference = await this.preferenceRepo.findOne({
      where: { userId: recipientId },
    });

    return preference?.preferences || this.getDefaultPreferences();
  }

  private getDefaultPreferences() {
    return {
      email: true,
      push: true,
      inApp: true,
      stakingAlerts: true,
      conversionAlerts: true,
      payoutAlerts: true,
      milestoneAlerts: true,
    };
  }

  private shouldSendNotification(type: NotificationType, preferences: any): boolean {
    const typeMapping: Partial<Record<NotificationType, string>> = {
      [NotificationType.NEW_STAKE]: 'stakingAlerts',
      [NotificationType.STAKE_WITHDRAWN]: 'stakingAlerts',
      [NotificationType.REWARDS_CLAIMED]: 'stakingAlerts',
      [NotificationType.NEW_CONVERSION]: 'conversionAlerts',
      [NotificationType.PAYOUT_CALCULATED]: 'payoutAlerts',
      [NotificationType.STAKING_REWARDS]: 'payoutAlerts',
      [NotificationType.TIER_UPGRADE]: 'milestoneAlerts',
      [NotificationType.MILESTONE_REACHED]: 'milestoneAlerts',
      [NotificationType.FRAUD_ALERT]: 'fraudAlerts',
      [NotificationType.SYSTEM]: 'systemAlerts',
    };

    const preferenceKey = typeMapping[type];
    return preferenceKey ? preferences[preferenceKey] !== false : true;
  }

  private async getPushTokens(recipientId: string, recipientType: string): Promise<string[]> {
    const key = `${recipientType}:${recipientId}:push_tokens`;
    const tokens = await this.redis.smembers(key);
    return tokens;
  }

  private async getUnreadCount(recipientId: string): Promise<number> {
    const count = await this.notificationRepo.count({
      where: {
        recipientId,
        read: false,
      },
    });
    return count;
  }

  private getClickAction(type: NotificationType): string {
    const actions: Partial<Record<NotificationType, string>> = {
      [NotificationType.NEW_STAKE]: 'OPEN_STAKING_POOL',
      [NotificationType.STAKE_WITHDRAWN]: 'OPEN_STAKING_POOL',
      [NotificationType.REWARDS_CLAIMED]: 'OPEN_PORTFOLIO',
      [NotificationType.NEW_CONVERSION]: 'OPEN_ANALYTICS',
      [NotificationType.PAYOUT_CALCULATED]: 'OPEN_PAYOUTS',
      [NotificationType.STAKING_REWARDS]: 'OPEN_PORTFOLIO',
      [NotificationType.TIER_UPGRADE]: 'OPEN_PROFILE',
      [NotificationType.MILESTONE_REACHED]: 'OPEN_ACHIEVEMENTS',
      [NotificationType.FRAUD_ALERT]: 'OPEN_SECURITY',
      [NotificationType.SYSTEM]: 'OPEN_APP',
    };
    
    return actions[type] || 'OPEN_APP';
  }

  private serializeData(data: Record<string, any>): Record<string, string> {
    const serialized: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        serialized[key] = value;
      } else {
        serialized[key] = JSON.stringify(value);
      }
    }
    
    return serialized;
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.notificationRepo.update(
      { id: notificationId },
      { read: true, readAt: new Date() }
    );
  }

  async markAllAsRead(recipientId: string): Promise<void> {
    await this.notificationRepo.update(
      { recipientId, read: false },
      { read: true, readAt: new Date() }
    );
  }

  async getNotifications(params: {
    recipientId: string;
    recipientType: 'user' | 'influencer';
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }) {
    const query = this.notificationRepo.createQueryBuilder('notification')
      .where('notification.recipientId = :recipientId', { recipientId: params.recipientId })
      .andWhere('notification.recipientType = :recipientType', { recipientType: params.recipientType });

    if (params.unreadOnly) {
      query.andWhere('notification.read = :read', { read: false });
    }

    query.orderBy('notification.createdAt', 'DESC')
      .limit(params.limit || 20)
      .offset(params.offset || 0);

    const [notifications, total] = await query.getManyAndCount();

    return {
      notifications,
      total,
      unreadCount: params.unreadOnly ? total : await this.getUnreadCount(params.recipientId),
    };
  }

  async sendAdminNotification(params: {
    type: string;
    priority: string;
    data: Record<string, any>;
  }): Promise<void> {
    // Get all admin user IDs from configuration
    const adminIds = await this.redis.smembers('admin:users');
    
    // Send notification to each admin
    for (const adminId of adminIds) {
      const notification = this.notificationRepo.create({
        recipientId: adminId,
        recipientType: RecipientType.ADMIN,
        type: NotificationType.FRAUD_ALERT,
        title: `${params.priority.toUpperCase()} Alert: ${params.type}`,
        message: `A ${params.priority} severity ${params.type} has been detected`,
        data: params.data,
        read: false,
      });

      await this.notificationRepo.save(notification);

      // Queue for immediate delivery to admins
      await this.notificationQueue.add('send-notification', {
        notificationId: notification.id,
        channels: { email: true, push: true, inApp: true },
        priority: params.priority === 'critical' ? 'high' : 'normal',
      });
    }
  }

  // Simplified method for InfluencerQueueProcessor
  async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      // Determine recipient type based on the notification type
      const isInfluencerNotification = payload.type.includes('STAKING_POOL') || 
                                      payload.type.includes('TIER_') ||
                                      payload.type.includes('PAYOUT');
      
      const recipientType = isInfluencerNotification ? RecipientType.INFLUENCER : RecipientType.USER;

      // Map custom notification types to existing NotificationType enum
      let notificationType: NotificationType;
      switch (payload.type) {
        case 'STAKING_POOL_CREATED':
        case 'STAKING_POOL_FAILED':
          notificationType = NotificationType.SYSTEM;
          break;
        case 'TIER_UPGRADED':
          notificationType = NotificationType.TIER_UPGRADE;
          break;
        default:
          notificationType = NotificationType.SYSTEM;
      }

      // Create notification
      const notification = this.notificationRepo.create({
        recipientId: payload.userId,
        recipientType,
        type: notificationType,
        title: payload.title,
        message: payload.message,
        data: payload.data || {},
        read: false,
      });

      await this.notificationRepo.save(notification);

      // Get user preferences
      const preferences = await this.getNotificationPreferences(payload.userId);

      // Queue for delivery
      await this.notificationQueue.add('send-notification', {
        notificationId: notification.id,
        channels: preferences,
        priority: payload.priority || 'normal',
      });

      this.logger.log(`Notification queued for ${payload.userId}: ${payload.type}`);
    } catch (error) {
      this.logger.error('Failed to send notification', error);
      throw error;
    }
  }
}