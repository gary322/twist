import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Payout } from './payout.entity';

export enum PayoutItemStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum PayoutRecipientType {
  INFLUENCER = 'influencer',
  STAKER = 'staker',
}

@Entity('payout_items')
@Index(['batchId', 'status'])
@Index(['recipientId', 'recipientType'])
@Index(['processedAt'])
export class PayoutItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  batchId: string;

  @Column()
  recipientId: string;

  @Column({
    type: 'enum',
    enum: PayoutRecipientType,
  })
  recipientType: PayoutRecipientType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'TWIST' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PayoutItemStatus,
    default: PayoutItemStatus.PENDING,
  })
  status: PayoutItemStatus;

  @Column({ nullable: true })
  transactionId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Payout, payout => payout.items)
  @JoinColumn({ name: 'batch_id' })
  batch: Payout;
}