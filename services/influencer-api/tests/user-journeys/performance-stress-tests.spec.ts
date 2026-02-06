import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'perf_hooks';
import { AppModule } from '../../src/app.module';

describe('Performance and Stress Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Search Performance', () => {
    it('should handle 1000 concurrent search requests', async () => {
      const startTime = performance.now();
      
      const searchPromises = Array(1000).fill(null).map((_, index) =>
        request(app.getHttpServer())
          .get('/api/influencers/search')
          .query({
            query: `test${index % 10}`,
            sortBy: ['totalStaked', 'stakerCount', 'apy'][index % 3],
            limit: 20,
            offset: (index % 50) * 20,
          })
      );

      const responses = await Promise.all(searchPromises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // All requests should complete
      expect(responses.every(r => r.status === 200 || r.status === 429)).toBe(true);
      
      // Average response time should be reasonable
      const avgResponseTime = totalTime / 1000;
      expect(avgResponseTime).toBeLessThan(100); // Less than 100ms average

      logger.log(`Search Performance: ${totalTime}ms for 1000 requests (${avgResponseTime}ms avg)`);
    });

    it('should efficiently handle complex filter combinations', async () => {
      const complexFilters = {
        minStaked: 1000,
        minApy: 10,
        tiers: ['SILVER', 'GOLD', 'PLATINUM'],
      };

      const startTime = performance.now();
      
      const response = await request(app.getHttpServer())
        .get('/api/influencers/search')
        .query({
          sortBy: 'apy',
          filters: JSON.stringify(complexFilters),
          limit: 100,
        })
        .expect(200);

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(500); // Should complete within 500ms
      expect(response.body).toBeInstanceOf(Array);
      
      logger.log(`Complex filter search completed in ${responseTime}ms`);
    });
  });

  describe('Staking Performance', () => {
    it('should handle 100 concurrent staking operations', async () => {
      const influencerId = uuidv4();
      const startTime = performance.now();

      const stakePromises = Array(100).fill(null).map((_, index) =>
        request(app.getHttpServer())
          .post('/api/staking/stake')
          .send({
            userId: uuidv4(),
            influencerId,
            amount: (BigInt((index + 1) * 10 ** 9)).toString(),
            wallet: `TestWallet${index.toString().padStart(41, '0')}`,
          })
      );

      const responses = await Promise.all(stakePromises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const successfulStakes = responses.filter(r => r.status === 201);
      const failedStakes = responses.filter(r => r.status !== 201);

      expect(successfulStakes.length).toBeGreaterThan(50); // At least 50% should succeed
      
      logger.log(`Staking Performance: ${totalTime}ms for 100 operations`);
      logger.log(`Success rate: ${successfulStakes.length}/100`);
    });

    it('should efficiently calculate rewards for large staker pools', async () => {
      const poolId = uuidv4();
      const stakers = 10000; // Simulate 10,000 stakers

      const startTime = performance.now();
      
      // This would typically be an internal service method
      const response = await request(app.getHttpServer())
        .post('/api/admin/rewards/calculate')
        .send({
          poolId,
          totalEarnings: (BigInt(10000 * 10 ** 9)).toString(),
          stakerCount: stakers,
        })
        .expect(200);

      const endTime = performance.now();
      const calculationTime = endTime - startTime;

      expect(calculationTime).toBeLessThan(1000); // Should complete within 1 second
      expect(response.body).toHaveProperty('distributions');
      
      logger.log(`Reward calculation for ${stakers} stakers completed in ${calculationTime}ms`);
    });
  });

  describe('Analytics Performance', () => {
    it('should handle high-frequency click tracking', async () => {
      const linkCode = 'PERF-TEST-' + uuidv4().substring(0, 8);
      const clicksPerSecond = 100;
      const durationSeconds = 5;
      const totalClicks = clicksPerSecond * durationSeconds;

      const startTime = performance.now();
      const clickPromises = [];

      // Simulate sustained click traffic
      for (let second = 0; second < durationSeconds; second++) {
        for (let click = 0; click < clicksPerSecond; click++) {
          clickPromises.push(
            request(app.getHttpServer())
              .post('/api/analytics/track/click')
              .send({
                linkCode,
                ipAddress: `192.168.${second}.${click}`,
                userAgent: 'PerformanceTest/1.0',
                referrer: 'https://test.com',
                country: 'US',
                device: 'desktop',
              })
          );
        }
        
        // Add small delay between seconds
        if (second < durationSeconds - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const responses = await Promise.all(clickPromises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const successfulClicks = responses.filter(r => r.status === 201);
      const failureRate = (totalClicks - successfulClicks.length) / totalClicks * 100;

      expect(failureRate).toBeLessThan(5); // Less than 5% failure rate
      
      logger.log(`Click tracking: ${totalClicks} clicks in ${totalTime}ms`);
      logger.log(`Success rate: ${100 - failureRate}%`);
    });

    it('should efficiently aggregate historical data', async () => {
      const influencerId = uuidv4();
      const days = 365; // One year of data

      const startTime = performance.now();
      
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/influencer/${influencerId}/historical`)
        .query({
          days,
          aggregation: 'daily',
        })
        .expect(200);

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(days);
      
      logger.log(`Historical data aggregation (${days} days) completed in ${responseTime}ms`);
    });
  });

  describe('Content Generation Performance', () => {
    it('should handle batch content generation', async () => {
      const templates = 5;
      const variations = 10;
      const totalGenerations = templates * variations;

      const startTime = performance.now();
      
      const generationPromises = [];
      for (let t = 0; t < templates; t++) {
        for (let v = 0; v < variations; v++) {
          generationPromises.push(
            request(app.getHttpServer())
              .post('/api/content/generate')
              .send({
                influencerId: uuidv4(),
                templateId: `template-${t}`,
                customization: {
                  text: {
                    headline: `Variation ${v} of Template ${t}`,
                  },
                },
              })
          );
        }
      }

      const responses = await Promise.all(generationPromises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const successful = responses.filter(r => r.status === 201);
      const avgGenerationTime = totalTime / totalGenerations;

      expect(successful.length).toBeGreaterThan(totalGenerations * 0.9); // 90% success rate
      expect(avgGenerationTime).toBeLessThan(200); // Less than 200ms per generation
      
      logger.log(`Content generation: ${totalGenerations} items in ${totalTime}ms (${avgGenerationTime}ms avg)`);
    });
  });

  describe('Database Query Performance', () => {
    it('should efficiently handle complex JOIN queries', async () => {
      const startTime = performance.now();
      
      const response = await request(app.getHttpServer())
        .get('/api/analytics/comprehensive-report')
        .query({
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          includeStakers: true,
          includeLinks: true,
          includeConversions: true,
          includePayouts: true,
        })
        .expect(200);

      const endTime = performance.now();
      const queryTime = endTime - startTime;

      expect(queryTime).toBeLessThan(3000); // Should complete within 3 seconds
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('details');
      
      logger.log(`Complex report generation completed in ${queryTime}ms`);
    });
  });

  describe('Cache Performance', () => {
    it('should demonstrate cache effectiveness', async () => {
      const searchParams = {
        query: 'cache-test',
        sortBy: 'totalStaked',
        limit: 50,
      };

      // First request (cache miss)
      const startCold = performance.now();
      const coldResponse = await request(app.getHttpServer())
        .get('/api/influencers/search')
        .query(searchParams)
        .expect(200);
      const coldTime = performance.now() - startCold;

      // Second request (cache hit)
      const startWarm = performance.now();
      const warmResponse = await request(app.getHttpServer())
        .get('/api/influencers/search')
        .query(searchParams)
        .expect(200);
      const warmTime = performance.now() - startWarm;

      // Cache should significantly improve performance
      expect(warmTime).toBeLessThan(coldTime * 0.5); // At least 50% faster
      expect(coldResponse.body).toEqual(warmResponse.body);
      
      logger.log(`Cache performance: Cold ${coldTime}ms vs Warm ${warmTime}ms (${Math.round((1 - warmTime/coldTime) * 100)}% improvement)`);
    });
  });

  describe('WebSocket Performance', () => {
    it('should handle 100 concurrent WebSocket connections', async (done) => {
      const io = require('socket.io-client');
      const connections = [];
      const connectionPromises = [];
      let connectedCount = 0;
      let messageCount = 0;
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        const promise = new Promise((resolve) => {
          const socket = io(`http://localhost:${app.getHttpServer().address().port}`, {
            auth: {
              token: `test-token-${i}`,
            },
          });

          socket.on('connect', () => {
            connectedCount++;
            socket.emit('subscribe:influencer', { influencerId: uuidv4() });
            resolve(socket);
          });

          socket.on('pool:update', () => {
            messageCount++;
          });

          connections.push(socket);
        });

        connectionPromises.push(promise);
      }

      await Promise.all(connectionPromises);
      const connectionTime = performance.now() - startTime;

      // Simulate broadcast
      setTimeout(() => {
        const broadcastTime = performance.now();
        
        // Trigger updates (this would normally be done internally)
        connections.forEach(socket => {
          socket.emit('test:broadcast');
        });

        setTimeout(() => {
          const totalBroadcastTime = performance.now() - broadcastTime;
          
          expect(connectedCount).toBe(100);
          expect(connectionTime).toBeLessThan(5000); // All connections within 5 seconds
          
          logger.log(`WebSocket: ${connectedCount} connections in ${connectionTime}ms`);
          logger.log(`Broadcast to ${connections.length} clients took ${totalBroadcastTime}ms`);
          
          // Cleanup
          connections.forEach(socket => socket.disconnect());
          done();
        }, 1000);
      }, 100);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during extended operations', async () => {
      const initialMemory = process.memoryUsage();
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        // Perform memory-intensive operations
        await request(app.getHttpServer())
          .get('/api/influencers/search')
          .query({
            sortBy: 'totalStaked',
            limit: 100,
          });

        await request(app.getHttpServer())
          .post('/api/staking/stake')
          .send({
            userId: uuidv4(),
            influencerId: uuidv4(),
            amount: (BigInt(100 * 10 ** 9)).toString(),
            wallet: 'TestWallet11111111111111111111111111111111',
          });

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = {
        heapUsed: (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024,
        external: (finalMemory.external - initialMemory.external) / 1024 / 1024,
      };

      // Memory growth should be reasonable
      expect(memoryGrowth.heapUsed).toBeLessThan(100); // Less than 100MB growth
      
      logger.log(`Memory usage after ${iterations} iterations:`);
      logger.log(`Heap growth: ${memoryGrowth.heapUsed.toFixed(2)}MB`);
      logger.log(`External growth: ${memoryGrowth.external.toFixed(2)}MB`);
    });
  });
});