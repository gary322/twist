import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum FraudAlertType {
  STAKE_FRAUD = 'stake_fraud',
  CLICK_FRAUD = 'click_fraud',
  CONVERSION_FRAUD = 'conversion_fraud',
  WALLET_FRAUD = 'wallet_fraud',
}

export enum FraudAlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum FraudAlertStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Entity('fraud_alerts')
@Index(['userId', 'status'])
@Index(['influencerId', 'status'])
@Index(['createdAt', 'severity'])
export class FraudAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: FraudAlertType,
  })
  type: FraudAlertType;

  @Column({
    type: 'enum',
    enum: FraudAlertSeverity,
  })
  severity: FraudAlertSeverity;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  influencerId: string;

  @Column({ type: 'jsonb' })
  indicators: Array<{
    type: string;
    severity: string;
    confidence: number;
    details: Record<string, any>;
  }>;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  riskScore: number;

  @Column({
    type: 'enum',
    enum: FraudAlertStatus,
    default: FraudAlertStatus.OPEN,
  })
  status: FraudAlertStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  resolvedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}