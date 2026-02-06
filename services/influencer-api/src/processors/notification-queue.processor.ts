import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationService } from '../services/notification.service';

@Processor('notifications')
export class NotificationQueueProcessor {
  private readonly logger = new Logger(NotificationQueueProcessor.name);

  constructor(
    private notificationService: NotificationService,
  ) {}

  @Process('send-notification')
  async handleSendNotification(job: Job<{
    notificationId: string;
    channels: any;
    priority?: string;
  }>) {
    const { notificationId, channels, priority } = job.data;
    
    try {
      this.logger.log(`Processing notification ${notificationId}`);
      
      await this.notificationService.processNotification(notificationId, channels);
      
      this.logger.log(`Notification ${notificationId} processed successfully`);
    } catch (error) {
      this.logger.error(`Failed to process notification ${notificationId}`, error);
      throw error;
    }
  }

  @Process('send-bulk-notifications')
  async handleSendBulkNotifications(job: Job<{
    userIds: string[];
    payload: any;
  }>) {
    const { userIds, payload } = job.data;
    
    try {
      this.logger.log(`Sending bulk notifications to ${userIds.length} users`);
      
      // Process in batches
      const batchSize = 50;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(userId => 
            this.notificationService.sendNotification({
              ...payload,
              userId,
            })
          )
        );
        
        // Progress update
        const progress = Math.round((i + batch.length) / userIds.length * 100);
        await job.progress(progress);
      }
      
      this.logger.log(`Bulk notifications sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send bulk notifications`, error);
      throw error;
    }
  }
}