import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { 
  Notification,
  NotificationPreference,
  Influencer,
  UserDevice,
  UserNotificationPreference,
} from '../entities';
import { NotificationService } from '../services/notification.service';
import { NotificationQueueProcessor } from '../processors/notification-queue.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationPreference,
      Influencer,
      UserDevice,
      UserNotificationPreference,
    ]),
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  providers: [
    NotificationService,
    NotificationQueueProcessor,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}