import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToOne, OneToMany } from 'typeorm';
import { InfluencerProfile } from './influencer-profile.entity';
import { InfluencerStakingPool } from './influencer-staking-pool.entity';
import { InfluencerLink } from './influencer-link.entity';
import { PayoutMethod } from './influencer-payout.entity';

export enum InfluencerTier {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

@Entity('influencers')
export class Influencer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  username: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ length: 64 })
  emailHash: string;

  @Column({ nullable: true, length: 44 })
  walletAddress: string;

  @Column({
    type: 'enum',
    enum: InfluencerTier,
    default: InfluencerTier.BRONZE,
  })
  tier: InfluencerTier;

  @Column({ default: false })
  verified: boolean;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt: Date;

  @Column({ default: 0 })
  totalConversions: number;

  @Column({ type: 'bigint', default: 0 })
  totalEarned: bigint;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => InfluencerProfile, profile => profile.influencer)
  profile: InfluencerProfile;

  @OneToOne(() => InfluencerStakingPool, pool => pool.influencer)
  stakingPool: InfluencerStakingPool;

  @OneToMany(() => InfluencerLink, link => link.influencer)
  links: InfluencerLink[];

  @Column({ default: false })
  autoPayoutEnabled: boolean;

  @Column({ 
    type: 'enum',
    enum: PayoutMethod,
    nullable: true,
  })
  defaultPayoutMethod: PayoutMethod;
}