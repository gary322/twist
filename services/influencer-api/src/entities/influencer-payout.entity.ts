import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn, 
  ManyToOne,
  JoinColumn,
  Index 
} from 'typeorm';
import { Influencer } from './influencer.entity';

export enum PayoutMethod {
  CRYPTO = 'crypto',
  BANK = 'bank',
  PAYPAL = 'paypal',
}

export enum InfluencerPayoutStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('influencer_payouts')
@Index(['influencerId', 'status'])
@Index(['requestedAt'])
@Index(['processedAt'])
export class InfluencerPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  influencerId: string;

  @Column({ type: 'bigint' })
  amount: bigint;

  @Column({ length: 10, default: 'TWIST' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PayoutMethod,
  })
  method: PayoutMethod;

  @Column({
    type: 'enum',
    enum: InfluencerPayoutStatus,
    default: InfluencerPayoutStatus.PENDING,
  })
  status: InfluencerPayoutStatus;

  @Column({ length: 44, nullable: true })
  walletAddress: string;

  @Column({ type: 'jsonb', nullable: true })
  bankDetails: Record<string, string>;

  @Column({ length: 100, nullable: true })
  transactionId: string;

  @Column({ type: 'text', nullable: true })
  failureReason: string;

  @Column({ type: 'timestamp' })
  requestedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Influencer)
  @JoinColumn({ name: 'influencer_id' })
  influencer: Influencer;
}