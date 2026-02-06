import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('user_devices')
@Index(['userId', 'deviceId'], { unique: true })
export class UserDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  deviceId: string;

  @Column()
  token: string;

  @Column({
    type: 'enum',
    enum: ['ios', 'android', 'web'],
  })
  platform: 'ios' | 'android' | 'web';

  @Column({ nullable: true })
  deviceName?: string;

  @Column({ nullable: true })
  deviceModel?: string;

  @Column({ nullable: true })
  osVersion?: string;

  @Column({ nullable: true })
  appVersion?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastActiveAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}