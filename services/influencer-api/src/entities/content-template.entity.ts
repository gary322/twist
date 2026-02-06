import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Influencer } from './influencer.entity';

@Entity('content_templates')
export class ContentTemplate {
  @PrimaryColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: ['banner', 'social_post', 'video_thumbnail', 'qr_code', 'story'],
  })
  type: 'banner' | 'social_post' | 'video_thumbnail' | 'qr_code' | 'story';

  @Column('varchar', { length: 100 })
  category: string;

  @Column('text')
  svgTemplate: string;

  @Column('text', { nullable: true })
  textTemplate: string;

  @Column('boolean', { default: false })
  includesImage: boolean;

  @Column('boolean', { default: false })
  supportsAnimation: boolean;

  @Column('jsonb')
  variables: any[];

  @Column('jsonb')
  dimensions: {
    width: number;
    height: number;
  };

  @Column('simple-array')
  formats: string[];

  @Column('varchar', { length: 20, nullable: true })
  tier: string;

  @Column('uuid', { nullable: true })
  influencerId: string;

  @ManyToOne(() => Influencer, { nullable: true })
  @JoinColumn({ name: 'influencerId' })
  influencer: Influencer;

  @Column('boolean', { default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}