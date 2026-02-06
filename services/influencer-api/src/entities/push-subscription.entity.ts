import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, Index } from 'typeorm';

@Entity('push_subscriptions')
@Index(['userId', 'platform'])
@Index(['deviceId'])
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  endpoint?: string;

  @Column({ nullable: true })
  token?: string;

  @Column('jsonb', { nullable: true })
  keys?: {
    p256dh: string;
    auth: string;
  };

  @Column({ type: 'enum', enum: ['web', 'ios', 'android'] })
  platform: 'web' | 'ios' | 'android';

  @Column({ nullable: true })
  deviceId?: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastUsed: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastActive?: Date;

  // Web push specific
  get p256dh(): string | undefined {
    return this.keys?.p256dh;
  }

  get auth(): string | undefined {
    return this.keys?.auth;
  }
}