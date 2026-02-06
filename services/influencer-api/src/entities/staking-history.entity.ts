import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { InfluencerStakingPool } from './influencer-staking-pool.entity';

export enum StakingAction {
  STAKE = 'stake',
  UNSTAKE = 'unstake',
  CLAIM = 'claim',
}

@Entity('staking_history')
export class StakingHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  userId: string;

  @Column({ type: 'uuid' })
  poolId: string;

  @Column({
    type: 'enum',
    enum: StakingAction,
  })
  action: StakingAction;

  @Column({ type: 'bigint' })
  amount: bigint;

  @Column({ nullable: true, length: 88 })
  transactionId: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => InfluencerStakingPool)
  @JoinColumn({ name: 'pool_id' })
  pool: InfluencerStakingPool;
}