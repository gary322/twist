import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { InfluencerStakingPool } from './influencer-staking-pool.entity';

@Entity('user_stakes')
@Unique(['userId', 'poolId'])
export class UserStake {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  userId: string;

  @Column({ type: 'uuid' })
  poolId: string;

  @Column({ type: 'bigint' })
  amount: bigint;

  @CreateDateColumn()
  stakedAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastClaim: Date;

  @Column({ type: 'bigint', default: 0 })
  totalClaimed: bigint;

  @Column({ type: 'bigint', default: 0 })
  pendingRewards: bigint;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  unstakeRequestedAt: Date;

  @ManyToOne(() => InfluencerStakingPool, pool => pool.userStakes)
  @JoinColumn({ name: 'pool_id' })
  pool: InfluencerStakingPool;
}