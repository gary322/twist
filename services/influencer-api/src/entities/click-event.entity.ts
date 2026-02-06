import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { InfluencerLink } from './influencer-link.entity';

@Entity('click_events')
@Index(['clickId'], { unique: true })
@Index(['linkId', 'createdAt'])
@Index(['fingerprint', 'createdAt'])
@Index(['sessionId'])
export class ClickEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  linkId: string;

  @Column({ length: 16, unique: true })
  clickId: string;

  @Column({ length: 45, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @Column({ length: 500, nullable: true })
  referrer: string;

  @Column({ length: 50, nullable: true })
  device: string;

  @Column({ length: 100, nullable: true })
  browser: string;

  @Column({ length: 50, nullable: true })
  os: string;

  @Column({ length: 2, nullable: true })
  country: string;

  @Column({ length: 100, nullable: true })
  region: string;

  @Column({ length: 100, nullable: true })
  city: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  deviceType: string;

  @Column({ nullable: true })
  sessionId: string;

  @Column({ nullable: true })
  fingerprint: string;

  @Column({ default: false })
  isBot: boolean;

  @Column({ default: false })
  isFraudulent: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => InfluencerLink)
  @JoinColumn({ name: 'link_id' })
  link: InfluencerLink;
}