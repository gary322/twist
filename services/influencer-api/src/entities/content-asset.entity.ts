import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('content_assets')
export class ContentAsset {
  @PrimaryColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  type: string;

  @Column('varchar', { length: 500 })
  url: string;

  @Column('varchar', { length: 20 })
  format: string;

  @Column('bigint')
  size: number;

  @Column('jsonb', { nullable: true })
  dimensions: {
    width: number;
    height: number;
  };

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}