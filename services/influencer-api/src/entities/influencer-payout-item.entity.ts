import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index 
} from 'typeorm';
import { InfluencerPayout } from './influencer-payout.entity';

export enum InfluencerPayoutItemType {
  CONVERSION = 'conversion',
  STAKING_REWARD = 'staking_reward',
  BONUS = 'bonus',
  DEDUCTION = 'deduction',
}

@Entity('influencer_payout_items')
@Index(['payoutId', 'type'])
@Index(['referenceId'])
export class InfluencerPayoutItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  payoutId: string;

  @Column({
    type: 'enum',
    enum: InfluencerPayoutItemType,
  })
  type: InfluencerPayoutItemType;

  @Column({ type: 'bigint' })
  amount: bigint;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  referenceId: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => InfluencerPayout)
  @JoinColumn({ name: 'payout_id' })
  payout: InfluencerPayout;
}