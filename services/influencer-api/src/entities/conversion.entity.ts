import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { AttributionModel } from './attribution-model.entity';

export enum ConversionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('conversions')
@Index(['userId', 'productId'])
@Index(['orderId'])
@Index(['convertedAt'])
export class Conversion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string;

  @Column({ length: 64 })
  userId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ length: 100 })
  productId: string;

  @Column({
    type: 'enum',
    enum: ConversionStatus,
    default: ConversionStatus.PENDING,
  })
  status: ConversionStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  convertedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => AttributionModel, attribution => attribution.conversion)
  attributions: AttributionModel[];
}