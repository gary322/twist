// Security Worker Types

export interface SecurityRule {
  id: string;
  name: string;
  condition: (request: Request) => boolean | Promise<boolean>;
  action: 'block' | 'challenge' | 'log';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  action: 'block' | 'challenge' | 'log';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
}

export interface SecurityCheckResult {
  allowed: boolean;
  action: 'allow' | 'block' | 'challenge' | 'rate_limit' | 'geo_block';
  reason?: string;
  rules: RuleResult[];
}

export interface SecurityEvent {
  type: string;
  ruleId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  country?: string;
  request: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    cf?: any;
  };
  timestamp?: number;
}