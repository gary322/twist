// Unit tests for Queue Processor
import { QueueProcessor } from '../../workers/vau-processor/src/services/queue';
import { VAUMessage, Message, MessageBatch } from '../../shared/types';

describe('QueueProcessor', () => {
  let queueProcessor: QueueProcessor;
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      DEVICE_REGISTRY: {
        get: jest.fn().mockResolvedValue(JSON.stringify({
          userId: 'user-123',
          trustScore: 80,
          registeredAt: Date.now()
        }))
      },
      KV: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined)
      },
      REWARD_QUEUE: {
        send: jest.fn().mockResolvedValue(undefined)
      },
      ANALYTICS_DATA: {
        put: jest.fn().mockResolvedValue(undefined)
      }
    };

    queueProcessor = new QueueProcessor(mockEnv);
  });

  describe('Message Validation', () => {
    test('should validate messages correctly', async () => {
      const validVAU: VAUMessage = {
        id: 'vau-123',
        userId: 'user-123',
        deviceId: 'device-123',
        siteId: 'site-001',
        timestamp: Date.now() - 60000, // 1 minute ago
        signature: 'mock-signature',
        payload: JSON.stringify({ duration: 45000 }),
        trustScore: 80
      };

      const result = await queueProcessor['validateMessage'](validVAU);
      expect(result.valid).toBe(true);
    });

    test('should reject messages with missing fields', async () => {
      const invalidVAU: VAUMessage = {
        id: 'vau-123',
        userId: '',
        deviceId: 'device-123',
        siteId: 'site-001',
        timestamp: Date.now(),
        signature: 'mock-signature',
        payload: '{}'
      };

      const result = await queueProcessor['validateMessage'](invalidVAU);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing required fields');
    });

    test('should reject old messages', async () => {
      const oldVAU: VAUMessage = {
        id: 'vau-123',
        userId: 'user-123',
        deviceId: 'device-123',
        siteId: 'site-001',
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
        signature: 'mock-signature',
        payload: '{}'
      };

      const result = await queueProcessor['validateMessage'](oldVAU);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Message too old');
    });

    test('should reject duplicate VAUs', async () => {
      const vau: VAUMessage = {
        id: 'vau-duplicate',
        userId: 'user-123',
        deviceId: 'device-123',
        siteId: 'site-001',
        timestamp: Date.now(),
        signature: 'mock-signature',
        payload: '{}'
      };

      // Mock existing VAU
      mockEnv.KV.get.mockResolvedValueOnce('1');

      const result = await queueProcessor['validateMessage'](vau);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Duplicate VAU');
    });

    test('should reject low trust devices', async () => {
      mockEnv.DEVICE_REGISTRY.get.mockResolvedValueOnce(JSON.stringify({
        userId: 'user-123',
        trustScore: 15, // Below threshold
        registeredAt: Date.now()
      }));

      const vau: VAUMessage = {
        id: 'vau-123',
        userId: 'user-123',
        deviceId: 'device-123',
        siteId: 'site-001',
        timestamp: Date.now(),
        signature: 'mock-signature',
        payload: '{}'
      };

      const result = await queueProcessor['validateMessage'](vau);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Device trust too low');
    });
  });

  describe('Batch Processing', () => {
    test('should group messages by user', () => {
      const messages: Message<VAUMessage>[] = [
        createMessage(createVAU('vau-1', 'user-1')),
        createMessage(createVAU('vau-2', 'user-2')),
        createMessage(createVAU('vau-3', 'user-1'))
      ];

      const batches = queueProcessor['groupIntoBatches'](messages);
      
      expect(batches.length).toBeGreaterThan(0);
      
      // Check that user-1 messages are together
      const user1Messages = batches.flat().filter(m => m.body.userId === 'user-1');
      expect(user1Messages.length).toBe(2);
    });

    test('should respect batch size limits', () => {
      const messages: Message<VAUMessage>[] = [];
      
      // Create 250 messages
      for (let i = 0; i < 250; i++) {
        messages.push(createMessage(createVAU(`vau-${i}`, `user-${i % 10}`)));
      }

      const batches = queueProcessor['groupIntoBatches'](messages);
      
      // Should have multiple batches
      expect(batches.length).toBeGreaterThan(1);
      
      // Each batch should not exceed BATCH_SIZE
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(100);
      }
    });

    test('should process valid messages and reject invalid ones', async () => {
      const messages: Message<VAUMessage>[] = [
        createMessage(createVAU('vau-valid', 'user-1')),
        createMessage({
          ...createVAU('vau-invalid', 'user-2'),
          timestamp: Date.now() - 10 * 60 * 1000 // Old message
        })
      ];

      await queueProcessor['processBatch'](messages);

      // Valid message should be acked
      expect(messages[0].ack).toHaveBeenCalled();
      
      // Invalid message should also be acked (no retry)
      expect(messages[1].ack).toHaveBeenCalled();
      
      // Rewards should be queued for valid messages
      expect(mockEnv.REWARD_QUEUE.send).toHaveBeenCalled();
    });

    test('should retry all messages on processing error', async () => {
      // Force an error
      mockEnv.REWARD_QUEUE.send.mockRejectedValueOnce(new Error('Queue error'));

      const messages: Message<VAUMessage>[] = [
        createMessage(createVAU('vau-1', 'user-1')),
        createMessage(createVAU('vau-2', 'user-2'))
      ];

      await queueProcessor['processBatch'](messages);

      // All messages should be retried
      expect(messages[0].retry).toHaveBeenCalled();
      expect(messages[1].retry).toHaveBeenCalled();
      
      // No messages should be acked
      expect(messages[0].ack).not.toHaveBeenCalled();
      expect(messages[1].ack).not.toHaveBeenCalled();
    });
  });

  describe('Reward Calculation', () => {
    test('should calculate base rewards correctly', async () => {
      const vaus: VAUMessage[] = [
        {
          ...createVAU('vau-1', 'user-1'),
          payload: JSON.stringify({
            duration: 60000, // 1 minute
            scrollDepth: 0.9,
            interactions: 10
          }),
          trustScore: 80
        }
      ];

      const rewards = await queueProcessor['calculateRewards'](vaus);
      
      expect(rewards.rewards.length).toBe(1);
      expect(rewards.rewards[0].amount).toBeGreaterThan(100); // Base reward with multipliers
      expect(rewards.totalAmount).toBe(rewards.rewards[0].amount);
    });

    test('should apply site multipliers', () => {
      const premiumReward = queueProcessor['calculateBaseReward'](
        { ...createVAU('vau-1', 'user-1'), siteId: 'site-gaming-001' },
        0.0001
      );

      const regularReward = queueProcessor['calculateBaseReward'](
        { ...createVAU('vau-2', 'user-2'), siteId: 'site-regular' },
        0.0001
      );

      const unverifiedReward = queueProcessor['calculateBaseReward'](
        { ...createVAU('vau-3', 'user-3'), siteId: 'unverified-site' },
        0.0001
      );

      expect(premiumReward).toBeGreaterThan(regularReward);
      expect(regularReward).toBeGreaterThan(unverifiedReward);
    });

    test('should apply user multipliers', async () => {
      // Mock user with high stake and reputation
      mockEnv.KV.get.mockImplementation((key: string) => {
        if (key.startsWith('user:user-premium')) {
          return Promise.resolve(JSON.stringify({
            stakedAmount: 50000,
            reputation: 90,
            dailyStreak: 14
          }));
        }
        return Promise.resolve(null);
      });

      const multipliers = await queueProcessor['getMultipliers'](['user-premium', 'user-regular']);
      
      expect(multipliers.get('user-premium')).toBeGreaterThan(1.0);
      expect(multipliers.get('user-regular')).toBe(1.0);
    });

    test('should respect token price in reward calculation', () => {
      const highPriceReward = queueProcessor['calculateBaseReward'](
        createVAU('vau-1', 'user-1'),
        0.001 // $0.001 per token
      );

      const lowPriceReward = queueProcessor['calculateBaseReward'](
        createVAU('vau-2', 'user-2'),
        0.0001 // $0.0001 per token
      );

      // Lower token price should result in more tokens
      expect(lowPriceReward).toBeGreaterThan(highPriceReward);
    });
  });

  describe('Analytics Storage', () => {
    test('should store analytics data correctly', async () => {
      const vaus: VAUMessage[] = [
        createVAU('vau-1', 'user-1', 'site-001'),
        createVAU('vau-2', 'user-2', 'site-001'),
        createVAU('vau-3', 'user-1', 'site-002')
      ];

      await queueProcessor['storeAnalytics'](vaus);

      expect(mockEnv.ANALYTICS_DATA.put).toHaveBeenCalled();
      
      const call = mockEnv.ANALYTICS_DATA.put.mock.calls[0];
      const key = call[0];
      const data = JSON.parse(call[1]);
      
      expect(key).toContain('vau-data/');
      expect(data.vaus.length).toBe(3);
      expect(data.aggregates.total).toBe(3);
      expect(data.aggregates.uniqueUsers).toBe(2);
      expect(data.aggregates.uniqueSites).toBe(2);
    });

    test('should update daily aggregates', async () => {
      const vaus: VAUMessage[] = [
        createVAU('vau-1', 'user-1'),
        createVAU('vau-2', 'user-2')
      ];

      await queueProcessor['storeAnalytics'](vaus);

      // Check that KV was updated with aggregates
      const kvCalls = mockEnv.KV.put.mock.calls.filter(
        (call: any[]) => call[0].startsWith('aggregates:')
      );
      
      expect(kvCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Queue Integration', () => {
    test('should process message batch from queue', async () => {
      const batch: MessageBatch<VAUMessage> = {
        queue: 'vau-queue',
        messages: [
          createMessage(createVAU('vau-1', 'user-1')),
          createMessage(createVAU('vau-2', 'user-2'))
        ]
      };

      await queueProcessor.processVAUQueue(batch);

      // Messages should be processed
      expect(batch.messages[0].ack).toHaveBeenCalled();
      expect(batch.messages[1].ack).toHaveBeenCalled();
      
      // Rewards should be queued
      expect(mockEnv.REWARD_QUEUE.send).toHaveBeenCalled();
    });
  });
});

// Helper function to create test VAU messages
function createVAU(id: string, userId: string, siteId: string = 'site-001'): VAUMessage {
  return {
    id,
    userId,
    deviceId: `device-${userId}`,
    siteId,
    timestamp: Date.now() - 30000, // 30 seconds ago
    signature: 'mock-signature',
    payload: JSON.stringify({
      action: 'page_view',
      duration: 30000,
      scrollDepth: 0.5
    }),
    trustScore: 75
  };
}

// Helper function to create test messages
function createMessage<T>(body: T): Message<T> {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    body,
    ack: jest.fn(),
    retry: jest.fn()
  };
}