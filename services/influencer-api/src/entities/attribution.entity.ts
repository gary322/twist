import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AttributionType {
  IMPRESSION = 'impression',
  CLICK = 'click',
  CONVERSION = 'conversion',
  CARRIED_FORWARD = 'carried_forward',
}

export enum AttributionStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  COMPLETED = 'completed',
  CARRIED_FORWARD = 'carried_forward',
}

@Entity('attributions')
@Index(['influencerId', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['campaignId', 'createdAt'])
export class Attribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  influencerId: string;

  @Column({ type: 'uuid', nullable: true })
  referrerId: string;

  @Column({ length: 64 })
  userId: string;

  @Column({ length: 64, nullable: true })
  campaignId: string;

  @Column({
    type: 'enum',
    enum: AttributionType,
  })
  type: AttributionType;

  @Column({
    type: 'enum',
    enum: AttributionStatus,
    default: AttributionStatus.PENDING,
  })
  status: AttributionStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  earnings: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  referralEarnings: number;

  @Column({ type: 'timestamp', nullable: true })
  payoutDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

