import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Conversion } from './conversion.entity';
import { Influencer } from './influencer.entity';

export enum AttributionModelType {
  LAST_CLICK = 'last_click',
  FIRST_CLICK = 'first_click',
  LINEAR = 'linear',
  TIME_DECAY = 'time_decay',
  POSITION_BASED = 'position_based',
}

@Entity('attribution_models')
@Index(['conversionId', 'influencerId'])
@Index(['influencerId', 'earnedAmount'])
export class AttributionModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversionId: string;

  @Column({ type: 'uuid' })
  influencerId: string;

  @Column({ length: 20 })
  linkCode: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  attributionPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  earnedAmount: number;

  @Column({
    type: 'enum',
    enum: AttributionModelType,
    default: AttributionModelType.LAST_CLICK,
  })
  model: AttributionModelType;

  @Column({ default: 1 })
  touchpointCount: number;

  @Column({ type: 'timestamp', nullable: true })
  firstTouchAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastTouchAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Conversion, conversion => conversion.attributions)
  @JoinColumn({ name: 'conversion_id' })
  conversion: Conversion;

  @ManyToOne(() => Influencer)
  @JoinColumn({ name: 'influencer_id' })
  influencer: Influencer;
}