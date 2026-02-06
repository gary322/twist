import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationService } from '../services/notification.service';

@Processor('notifications')
@Injectable()
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private notificationService: NotificationService,
  ) {}

  @Process('send-notification')
  async handleSendNotification(job: Job<{
    notificationId: string;
    channels: any;
  }>) {
    const { notificationId, channels } = job.data;

    try {
      this.logger.log(`Processing notification ${notificationId}`);

      await this.notificationService.processNotification(notificationId, channels);

      this.logger.log(`Successfully processed notification ${notificationId}`);
    } catch (error) {
      this.logger.error(`Failed to process notification ${notificationId}`, error);
      throw error;
    }
  }

  @Process('batch-notifications')
  async handleBatchNotifications(job: Job<{
    recipientIds: string[];
    type: string;
    data: any;
  }>) {
    const { recipientIds, type, data } = job.data;

    try {
      this.logger.log(`Processing batch notifications for ${recipientIds.length} recipients`);

      // Process in parallel with concurrency limit
      const BATCH_SIZE = 10;
      for (let i = 0; i < recipientIds.length; i += BATCH_SIZE) {
        const batch = recipientIds.slice(i, i + BATCH_SIZE);
        
        await Promise.all(
          batch.map(recipientId => 
            this.notificationService.sendUserNotification({
              userId: recipientId,
              type: type as any,
              data,
            }).catch(error => {
              this.logger.error(`Failed to send notification to ${recipientId}`, error);
            })
          )
        );

        // Add small delay between batches
        if (i + BATCH_SIZE < recipientIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      this.logger.log(`Completed batch notifications for ${recipientIds.length} recipients`);
    } catch (error) {
      this.logger.error('Failed to process batch notifications', error);
      throw error;
    }
  }
}