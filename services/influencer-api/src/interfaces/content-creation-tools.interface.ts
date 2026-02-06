/**
 * Content Creation Tools Interface
 * Provides comprehensive tools for influencer content creation and automation
 */

export interface BannerTemplate {
  id: string;
  name: string;
  dimensions: {
    width: number;
    height: number;
  };
  layers: Layer[];
  customizableFields: string[];
}

export interface VideoTemplate {
  id: string;
  name: string;
  duration: number;
  format: 'mp4' | 'mov' | 'webm';
  resolution: {
    width: number;
    height: number;
  };
  scenes: Scene[];
}

export interface SocialPostTemplate {
  id: string;
  name: string;
  platform: 'instagram' | 'twitter' | 'tiktok' | 'youtube' | 'facebook';
  type: 'post' | 'story' | 'reel' | 'short';
  contentBlocks: ContentBlock[];
}

export interface Layer {
  id: string;
  type: 'text' | 'image' | 'shape' | 'qrcode';
  properties: Record<string, any>;
  customizable: boolean;
}

export interface Scene {
  id: string;
  duration: number;
  transitions: Transition[];
  elements: SceneElement[];
}

export interface ContentBlock {
  id: string;
  type: 'text' | 'image' | 'video' | 'carousel';
  content: any;
  metadata?: Record<string, any>;
}

export interface Transition {
  type: 'fade' | 'slide' | 'zoom' | 'wipe';
  duration: number;
  easing?: string;
}

export interface SceneElement {
  type: 'text' | 'image' | 'video' | 'animation';
  position: { x: number; y: number };
  size: { width: number; height: number };
  properties: Record<string, any>;
}

export interface Brand {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  logo: string;
  guidelines?: string;
}

export interface Content {
  id: string;
  templateId: string;
  brandId: string;
  customizations: Record<string, any>;
  generatedAt: Date;
  assets: GeneratedAsset[];
}

export interface GeneratedAsset {
  type: 'image' | 'video' | 'document';
  url: string;
  format: string;
  size: number;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface Preview {
  url: string;
  type: 'image' | 'video' | 'interactive';
  validUntil: Date;
}

export interface Platform {
  id: string;
  name: string;
  requirements: {
    imageFormats?: string[];
    videoFormats?: string[];
    maxFileSize?: number;
    dimensions?: Record<string, { width: number; height: number }>;
  };
}

export interface Trigger {
  type: 'schedule' | 'event' | 'manual';
  config: {
    schedule?: string; // cron expression
    event?: string;
    conditions?: Record<string, any>;
  };
}

export interface Template {
  id: string;
  type: 'banner' | 'video' | 'social';
  template: BannerTemplate | VideoTemplate | SocialPostTemplate;
}

export interface ContentCreationTools {
  templates: {
    banners: BannerTemplate[];
    videos: VideoTemplate[];
    social: SocialPostTemplate[];
  };

  editor: {
    customize(template: Template, brand: Brand): Content;
    preview(content: Content): Preview;
  };

  automation: {
    schedule(content: Content, platforms: Platform[]): void;
    autoPost(trigger: Trigger): void;
  };
}

// Export the interface as default