// Core types for the Edge Computing & Security Layer

export interface VAUSubmission {
  userId: string;
  deviceId: string;
  siteId: string;
  timestamp: number;
  signature: string;
  payload: string;
  attestation?: WebAuthnAttestation;
}

export interface VAUBatch {
  vaus: VAUSubmission[];
  batchId: string;
  submittedAt: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  trustScore?: number;
}

export interface VAUResult {
  vauId: string;
  earned: number;
  trustScore: number;
  timestamp: number;
}

export interface DeviceTrust {
  deviceId: string;
  score: number;
  lastSeen: number;
  attestations: AttestationRecord[];
}

export interface AttestationRecord {
  type: string;
  timestamp: number;
  trustScore: number;
  metadata?: any;
}

export interface WebAuthnAttestation {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle?: string;
}

export interface AttestationResult {
  valid: boolean;
  error?: string;
  trustScore: number;
  attestationType?: string;
  aaguid?: string;
}

export interface SecurityEvent {
  type: string;
  timestamp?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  ruleId?: string;
  country?: string;
  request?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    cf?: any;
  };
}

export interface SecurityCheckResult {
  allowed: boolean;
  action: 'allow' | 'block' | 'challenge' | 'rate_limit' | 'geo_block';
  reason?: string;
  rules?: RuleResult[];
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  action: string;
  severity: string;
  timestamp: number;
}

export interface TargetingCriteria {
  cohorts: string[];
  excludeCohorts?: string[];
  minTrustScore?: number;
}

export interface VAUMessage {
  id: string;
  userId: string;
  deviceId: string;
  siteId: string;
  timestamp: number;
  signature: string;
  payload: string;
  trustScore?: number;
  cohortFilterId?: string;
}

export interface Message<T> {
  id: string;
  timestamp: Date;
  body: T;
  ack: () => void;
  retry: () => void;
}

export interface MessageBatch<T> {
  messages: Message<T>[];
  queue: string;
}

export interface Reward {
  userId: string;
  amount: number;
  vauId: string;
  multiplier: number;
  timestamp: number;
}

export interface RewardBatch {
  rewards: Reward[];
  totalAmount: number;
  tokenPrice: number;
  timestamp: number;
}

export interface CacheRule {
  browserTTL: number;
  edgeTTL: number;
  bypassCache: boolean;
  revalidate?: boolean;
}