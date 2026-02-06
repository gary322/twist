import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { InfluencerStakingPool } from './influencer-staking-pool.entity';

@Entity('staking_rewards')
export class StakingReward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  poolId: string;

  @Column({ type: 'bigint' })
  earningAmount: bigint;

  @Column({ type: 'bigint' })
  stakerShare: bigint;

  @Column({ type: 'bigint' })
  influencerShare: bigint;

  @CreateDateColumn()
  distributedAt: Date;

  @Column({ nullable: true, length: 88 })
  transactionId: string;

  @ManyToOne(() => InfluencerStakingPool, pool => pool.rewards)
  @JoinColumn({ name: 'pool_id' })
  pool: InfluencerStakingPool;
}