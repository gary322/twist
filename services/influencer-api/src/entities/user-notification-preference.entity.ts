import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('user_notification_preferences')
export class UserNotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  userId: string;

  // Channel preferences
  @Column({ default: true })
  emailEnabled: boolean;

  @Column({ default: true })
  pushEnabled: boolean;

  @Column({ default: true })
  inAppEnabled: boolean;

  // Notification type preferences
  @Column({ default: true })
  stakingNotifications: boolean;

  @Column({ default: true })
  tierNotifications: boolean;

  @Column({ default: true })
  linkNotifications: boolean;

  @Column({ default: true })
  payoutNotifications: boolean;

  @Column({ default: false })
  marketingNotifications: boolean;

  @Column({ default: true })
  securityNotifications: boolean;

  @Column({ default: true })
  systemNotifications: boolean;

  // Frequency settings
  @Column({ default: 'instant' })
  emailFrequency: 'instant' | 'daily' | 'weekly' | 'never';

  @Column({ type: 'jsonb', nullable: true })
  quietHours?: {
    enabled: boolean;
    startTime: string; // HH:MM format
    endTime: string; // HH:MM format
    timezone: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}