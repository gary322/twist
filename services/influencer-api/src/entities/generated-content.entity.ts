import { Entity, Column, PrimaryColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Influencer } from './influencer.entity';

@Entity('generated_content')
export class GeneratedContent {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  influencerId: string;

  @ManyToOne(() => Influencer)
  @JoinColumn({ name: 'influencerId' })
  influencer: Influencer;

  @Column('uuid')
  templateId: string;

  @Column('varchar', { length: 50 })
  type: string;

  @Column('jsonb')
  urls: Record<string, string>;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}