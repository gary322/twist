import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('notification_preferences')
@Index(['userId'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column({ type: 'jsonb', default: {} })
  preferences: {
    email?: boolean;
    push?: boolean;
    inApp?: boolean;
    stakingAlerts?: boolean;
    conversionAlerts?: boolean;
    payoutAlerts?: boolean;
    milestoneAlerts?: boolean;
    fraudAlerts?: boolean;
    systemAlerts?: boolean;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}