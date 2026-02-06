import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { Influencer } from './influencer.entity';
import { UserStake } from './user-stake.entity';
import { StakingReward } from './staking-reward.entity';

@Entity('influencer_staking_pools')
export class InfluencerStakingPool {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  influencerId: string;

  @Column({ unique: true, length: 44 })
  poolAddress: string;

  @Column({ type: 'bigint', default: 0 })
  totalStaked: bigint;

  @Column({ default: 0 })
  stakerCount: number;

  @Column()
  revenueShareBps: number;

  @Column({ type: 'bigint', default: 1000000000 })
  minStake: bigint;

  @Column({ type: 'bigint', default: 0 })
  totalRewardsDistributed: bigint;

  @Column({ type: 'bigint', default: 0 })
  pendingRewards: bigint;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  currentApy: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => Influencer, influencer => influencer.stakingPool)
  @JoinColumn({ name: 'influencer_id' })
  influencer: Influencer;

  @OneToMany(() => UserStake, stake => stake.pool)
  userStakes: UserStake[];

  @OneToMany(() => StakingReward, reward => reward.pool)
  rewards: StakingReward[];
}