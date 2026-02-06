import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Influencer } from './influencer.entity';

@Entity('influencer_analytics_daily')
@Unique(['influencerId', 'date'])
export class InfluencerAnalyticsDaily {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  influencerId: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ default: 0 })
  clicks: number;

  @Column({ default: 0 })
  conversions: number;

  @Column({ type: 'bigint', default: 0 })
  earned: bigint;

  @Column({ default: 0 })
  newStakers: number;

  @Column({ type: 'bigint', default: 0 })
  totalStakedChange: bigint;

  @ManyToOne(() => Influencer)
  @JoinColumn({ name: 'influencer_id' })
  influencer: Influencer;
}