// VAU Processor specific types
import { Env as BaseEnv } from '../../../shared/types/env';

export interface Env extends BaseEnv {}

export type { 
  VAUSubmission, 
  VAUBatch, 
  ValidationResult,
  VAUResult,
  DeviceTrust,
  AttestationRecord,
  WebAuthnAttestation,
  AttestationResult,
  SecurityEvent,
  SecurityCheckResult,
  RuleResult,
  TargetingCriteria,
  VAUMessage,
  Message,
  MessageBatch,
  Reward,
  RewardBatch,
  CacheRule
} from '../../../shared/types';

// Additional VAU-specific types
export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  details?: any;
}

export interface MetricsData {
  timestamp: number;
  metrics: {
    [key: string]: number | string;
  };
}