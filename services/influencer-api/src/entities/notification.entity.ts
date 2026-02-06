import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum NotificationType {
  NEW_STAKE = 'new_stake',
  STAKE_WITHDRAWN = 'stake_withdrawn',
  REWARDS_CLAIMED = 'rewards_claimed',
  NEW_CONVERSION = 'new_conversion',
  PAYOUT_CALCULATED = 'payout_calculated',
  STAKING_REWARDS = 'staking_rewards',
  TIER_UPGRADE = 'tier_upgrade',
  MILESTONE_REACHED = 'milestone_reached',
  FRAUD_ALERT = 'fraud_alert',
  SYSTEM = 'system',
}

export enum RecipientType {
  USER = 'user',
  INFLUENCER = 'influencer',
  ADMIN = 'admin',
}

@Entity('notifications')
@Index(['recipientId', 'recipientType', 'read'])
@Index(['createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  recipientId: string;

  @Column({
    type: 'enum',
    enum: RecipientType,
  })
  recipientType: RecipientType;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>;

  @Column({ default: false })
  read: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'simple-array', nullable: true })
  deliveryChannels: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}