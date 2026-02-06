export interface TouchPoint {
  id: string;
  influencerId: string;
  linkCode: string;
  clickedAt: Date;
  position: number;
  device: string;
  referrer: string;
  isFirstTouch: boolean;
  isLastTouch: boolean;
  sessionId: string;
  timeSinceFirst: number;
}