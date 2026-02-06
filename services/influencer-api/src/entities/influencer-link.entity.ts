import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Influencer } from './influencer.entity';

@Entity('influencer_links')
export class InfluencerLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  influencerId: string;

  @Column({ length: 100 })
  productId: string;

  @Column({ unique: true, length: 20 })
  linkCode: string;

  @Column({ nullable: true, length: 50 })
  promoCode: string;

  @Column({ nullable: true, length: 200 })
  customUrl: string;

  @Column({ nullable: true, length: 500 })
  qrCodeUrl: string;

  @Column({ default: 0 })
  clicks: number;

  @Column({ default: 0 })
  conversions: number;

  @Column({ type: 'bigint', default: 0 })
  earned: bigint;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastClickedAt?: Date;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  metadata?: Record<string, any>;

  @ManyToOne(() => Influencer, influencer => influencer.links)
  @JoinColumn({ name: 'influencer_id' })
  influencer: Influencer;
}