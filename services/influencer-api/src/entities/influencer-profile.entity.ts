import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { Influencer } from './influencer.entity';

@Entity('influencer_profiles')
export class InfluencerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  influencerId: string;

  @Column({ nullable: true, length: 100 })
  displayName: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @Column({ nullable: true, length: 500 })
  avatar: string;

  @Column({ nullable: true, length: 500 })
  coverImage: string;

  @Column({ type: 'jsonb', default: {} })
  socialLinks: Record<string, string>;

  @Column('text', { array: true, default: [] })
  categories: string[];

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => Influencer, influencer => influencer.profile)
  @JoinColumn({ name: 'influencer_id' })
  influencer: Influencer;
}