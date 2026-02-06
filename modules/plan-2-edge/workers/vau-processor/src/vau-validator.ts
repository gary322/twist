/**
 * VAU Validator - Validates VAU data integrity and format
 */

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface VAUSchema {
  userId: { required: boolean; type: string; pattern?: RegExp };
  siteId: { required: boolean; type: string; pattern?: RegExp };
  actionId: { required: boolean; type: string };
  timestamp: { required: boolean; type: string; min?: number; max?: number };
  metadata?: { required: boolean; type: string };
}

export class VAUValidator {
  private schema: VAUSchema = {
    userId: { 
      required: true, 
      type: 'string',
      pattern: /^[a-zA-Z0-9_-]+$/
    },
    siteId: { 
      required: true, 
      type: 'string',
      pattern: /^[a-zA-Z0-9_-]+$/
    },
    actionId: { 
      required: true, 
      type: 'string' 
    },
    timestamp: { 
      required: true, 
      type: 'number',
      min: Date.now() - 86400000, // Max 24 hours old
      max: Date.now() + 60000 // Max 1 minute in future
    },
    metadata: { 
      required: false, 
      type: 'object' 
    }
  };
  
  /**
   * Validate VAU data
   */
  validate(data: any): ValidationResult {
    const errors: string[] = [];
    
    // Check required fields
    for (const [field, rules] of Object.entries(this.schema)) {
      if (rules.required && !(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate userId
    if (data.userId) {
      if (typeof data.userId !== 'string') {
        errors.push('userId must be a string');
      } else if (!this.schema.userId.pattern?.test(data.userId)) {
        errors.push('userId contains invalid characters');
      }
    }
    
    // Validate siteId
    if (data.siteId) {
      if (typeof data.siteId !== 'string') {
        errors.push('siteId must be a string');
      } else if (!this.schema.siteId.pattern?.test(data.siteId)) {
        errors.push('siteId contains invalid characters');
      }
    }
    
    // Validate actionId
    if (data.actionId) {
      if (typeof data.actionId !== 'string') {
        errors.push('actionId must be a string');
      } else if (data.actionId.length === 0) {
        errors.push('actionId cannot be empty');
      }
    }
    
    // Validate timestamp
    if (data.timestamp) {
      if (typeof data.timestamp !== 'number') {
        errors.push('timestamp must be a number');
      } else {
        if (data.timestamp < this.schema.timestamp.min!) {
          errors.push('timestamp is too old (max 24 hours)');
        }
        if (data.timestamp > this.schema.timestamp.max!) {
          errors.push('timestamp is in the future');
        }
      }
    }
    
    // Validate metadata
    if (data.metadata !== undefined) {
      if (typeof data.metadata !== 'object' || data.metadata === null) {
        errors.push('metadata must be an object');
      } else {
        // Validate metadata size
        const metadataSize = JSON.stringify(data.metadata).length;
        if (metadataSize > 10240) { // 10KB limit
          errors.push('metadata exceeds size limit (10KB)');
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  /**
   * Sanitize VAU data
   */
  sanitize(data: any): any {
    const sanitized: any = {};
    
    // Copy only known fields
    if (data.userId) {
      sanitized.userId = String(data.userId).substring(0, 128);
    }
    
    if (data.siteId) {
      sanitized.siteId = String(data.siteId).substring(0, 128);
    }
    
    if (data.actionId) {
      sanitized.actionId = String(data.actionId).substring(0, 256);
    }
    
    if (data.timestamp) {
      sanitized.timestamp = Number(data.timestamp);
    }
    
    if (data.metadata && typeof data.metadata === 'object') {
      sanitized.metadata = this.sanitizeMetadata(data.metadata);
    }
    
    return sanitized;
  }
  
  /**
   * Sanitize metadata object
   */
  private sanitizeMetadata(metadata: any): any {
    const sanitized: any = {};
    const allowedTypes = ['string', 'number', 'boolean'];
    
    for (const [key, value] of Object.entries(metadata)) {
      // Skip if key is too long
      if (key.length > 64) continue;
      
      // Skip if value type is not allowed
      if (!allowedTypes.includes(typeof value)) continue;
      
      // Sanitize based on type
      if (typeof value === 'string') {
        sanitized[key] = String(value).substring(0, 512);
      } else if (typeof value === 'number') {
        sanitized[key] = Number(value);
      } else if (typeof value === 'boolean') {
        sanitized[key] = Boolean(value);
      }
    }
    
    return sanitized;
  }
  
  /**
   * Validate batch of VAUs
   */
  validateBatch(batch: any[]): {
    valid: any[];
    invalid: Array<{ data: any; errors: string[] }>;
  } {
    const valid: any[] = [];
    const invalid: Array<{ data: any; errors: string[] }> = [];
    
    for (const vau of batch) {
      const result = this.validate(vau);
      
      if (result.valid) {
        valid.push(this.sanitize(vau));
      } else {
        invalid.push({
          data: vau,
          errors: result.errors || []
        });
      }
    }
    
    return { valid, invalid };
  }
}