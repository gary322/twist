import Joi from 'joi';
import { Campaign, Platform } from '../types/core';

export const CreateCampaignSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  objective: Joi.string().valid('awareness', 'traffic', 'engagement', 'conversions', 'app_installs'),
  type: Joi.string().valid('standard', 'auto').default('standard'),
  description: Joi.string().max(500).optional(),
  budgetUsdc: Joi.number().min(50).required(),
  targeting: Joi.object({
    audiences: Joi.array().items(Joi.string()).optional(),
    geoTargets: Joi.array().items(Joi.string().length(2)).optional(),
    deviceTypes: Joi.array().items(
      Joi.string().valid(...Object.values(Platform))
    ).optional(),
    customAudiences: Joi.array().items(Joi.string()).optional()
  }).required(),
  attribution: Joi.object({
    windowSeconds: Joi.number().min(1).max(7776000).default(1800),
    model: Joi.string().valid('last_click', 'multi_touch', 'time_decay').default('last_click'),
    influencerSplit: Joi.number().min(0).max(1).default(0.2)
  }).required(),
  schedule: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).optional(),
    dayparting: Joi.object().pattern(
      Joi.number().min(0).max(6),
      Joi.array().items(Joi.number().min(0).max(23))
    ).optional()
  }).optional(),
  brandSafety: Joi.object({
    blockLists: Joi.object({
      domains: Joi.array().items(Joi.string().domain()).optional(),
      keywords: Joi.array().items(Joi.string()).optional(),
      categories: Joi.array().items(Joi.string()).optional()
    }).optional(),
    contentVerification: Joi.object({
      preApproval: Joi.boolean().optional(),
      thirdPartyVerification: Joi.string().valid('IAS', 'DoubleVerify', 'MOAT').optional()
    }).optional()
  }).optional(),
  advertiserDomain: Joi.string().domain().optional()
});

export const UpdateCampaignSchema = Joi.object({
  name: Joi.string().min(3).max(100).optional(),
  description: Joi.string().max(500).optional(),
  budgetUsdc: Joi.number().min(50).optional(),
  targeting: Joi.object({
    audiences: Joi.array().items(Joi.string()).optional(),
    geoTargets: Joi.array().items(Joi.string().length(2)).optional(),
    deviceTypes: Joi.array().items(
      Joi.string().valid(...Object.values(Platform))
    ).optional(),
    customAudiences: Joi.array().items(Joi.string()).optional()
  }).optional(),
  schedule: Joi.object({
    endDate: Joi.date().iso().optional(),
    dayparting: Joi.object().pattern(
      Joi.number().min(0).max(6),
      Joi.array().items(Joi.number().min(0).max(23))
    ).optional()
  }).optional(),
  brandSafety: Joi.object({
    blockLists: Joi.object({
      domains: Joi.array().items(Joi.string().domain()).optional(),
      keywords: Joi.array().items(Joi.string()).optional(),
      categories: Joi.array().items(Joi.string()).optional()
    }).optional(),
    contentVerification: Joi.object({
      preApproval: Joi.boolean().optional(),
      thirdPartyVerification: Joi.string().valid('IAS', 'DoubleVerify', 'MOAT').optional()
    }).optional()
  }).optional()
});

export function validate<T>(schema: Joi.Schema, data: any): T {
  const { error, value } = schema.validate(data, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map((detail: Joi.ValidationErrorItem) => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    throw new ValidationError('Validation failed', errors);
  }
  
  return value as T;
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public errors: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}