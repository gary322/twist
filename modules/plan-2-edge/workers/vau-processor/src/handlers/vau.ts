// VAU processing handler
import { Env, VAUSubmission, VAUResult } from '../types';
import { ValidationError } from '../utils/errors';
import { sha256 } from '../utils/crypto';

export async function handleVAU(
  submission: VAUSubmission,
  env: Env,
  ctx: ExecutionContext
): Promise<VAUResult> {
  // Generate unique VAU ID
  const vauId = await generateVAUId(submission);

  // Check for duplicate submission
  const existing = await env.DEVICE_REGISTRY.get(`vau:${vauId}`);
  if (existing) {
    throw new ValidationError('Duplicate VAU submission');
  }

  // Get device trust score
  const deviceTrust = await getDeviceTrust(submission.deviceId, env);
  
  // Calculate base reward (simplified for now)
  const baseReward = calculateBaseReward(submission, deviceTrust.score);

  // Store VAU record
  await env.DEVICE_REGISTRY.put(
    `vau:${vauId}`,
    JSON.stringify({
      ...submission,
      vauId,
      processed: Date.now(),
      earned: baseReward,
      trustScore: deviceTrust.score
    }),
    { expirationTtl: 86400 } // 24 hours
  );

  // Update device last seen
  ctx.waitUntil(updateDeviceLastSeen(submission.deviceId, env));

  // Queue for reward processing
  ctx.waitUntil(
    env.REWARD_QUEUE.send({
      type: 'vau_reward',
      data: {
        vauId,
        userId: submission.userId,
        amount: baseReward,
        timestamp: Date.now()
      }
    })
  );

  return {
    vauId,
    earned: baseReward,
    trustScore: deviceTrust.score,
    timestamp: Date.now()
  };
}

async function generateVAUId(submission: VAUSubmission): Promise<string> {
  const data = [
    submission.userId,
    submission.deviceId,
    submission.siteId,
    submission.timestamp
  ].join(':');
  
  const hash = await sha256(data);
  return hash.substring(0, 16); // Use first 16 chars
}

export async function getDeviceTrust(deviceId: string, env: Env): Promise<{ score: number }> {
  // Check device registry
  const deviceData = await env.DEVICE_REGISTRY.get(`device:${deviceId}`);
  
  if (!deviceData) {
    // New device, start with base score
    return { score: 50 };
  }

  const device = JSON.parse(deviceData);
  
  // Calculate trust score based on history
  let score = 50; // Base score
  
  // Add points for attestations
  if (device.attestations && device.attestations.length > 0) {
    score += Math.min(30, device.attestations.length * 10);
  }
  
  // Add points for consistent usage
  if (device.lastSeen) {
    const daysSinceLastSeen = (Date.now() - device.lastSeen) / (1000 * 60 * 60 * 24);
    if (daysSinceLastSeen < 1) {
      score += 10;
    } else if (daysSinceLastSeen < 7) {
      score += 5;
    }
  }
  
  // Add points for VAU count
  if (device.vauCount) {
    score += Math.min(10, Math.floor(device.vauCount / 10));
  }
  
  return { score: Math.min(100, score) };
}

function calculateBaseReward(submission: VAUSubmission, trustScore: number): number {
  // Base reward calculation (simplified)
  const baseAmount = 10; // Base TWIST tokens
  
  // Apply trust score multiplier
  const trustMultiplier = trustScore / 100;
  
  // Apply site-specific multiplier (could be fetched from config)
  const siteMultiplier = 1.0;
  
  return Math.floor(baseAmount * trustMultiplier * siteMultiplier);
}

async function updateDeviceLastSeen(deviceId: string, env: Env): Promise<void> {
  const key = `device:${deviceId}`;
  const existing = await env.DEVICE_REGISTRY.get(key);
  
  const device = existing ? JSON.parse(existing) : {
    deviceId,
    firstSeen: Date.now(),
    vauCount: 0
  };
  
  device.lastSeen = Date.now();
  device.vauCount = (device.vauCount || 0) + 1;
  
  await env.DEVICE_REGISTRY.put(key, JSON.stringify(device));
}