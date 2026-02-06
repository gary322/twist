import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { PushSubscription } from './push-subscription.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  username?: string;

  @Column({ default: false })
  pushEnabled: boolean;

  @Column({ nullable: true })
  walletAddress?: string;

  @Column({ default: false })
  isInfluencer: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => PushSubscription, subscription => subscription.userId)
  pushSubscriptions: PushSubscription[];
}