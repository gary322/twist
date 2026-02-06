const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Test data storage
const testUsers = [];
const testInfluencers = [
  { id: 'inf-1', username: 'crypto_master' },
  { id: 'inf-2', username: 'defi_queen' },
  { id: 'inf-3', username: 'nft_artist' },
  { id: 'inf-4', username: 'web3_dev' },
  { id: 'inf-5', username: 'blockchain_educator' },
];

// Helper functions
function generateAuthToken(userId) {
  // In production, this would be a real JWT
  return `mock-jwt-${userId}-${Date.now()}`;
}

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Processor functions for Artillery
module.exports = {
  // Setup test data before the test starts
  setupTestData: function(context, events, done) {
    logger.log('Setting up test data...');
    
    // Generate test users
    for (let i = 0; i < 1000; i++) {
      testUsers.push({
        id: `user-${i}`,
        email: `testuser${i}@example.com`,
        wallet: `0x${crypto.randomBytes(20).toString('hex')}`,
      });
    }
    
    // Create CSV file for payload
    const csvContent = testUsers.map(user => {
      const influencer = randomElement(testInfluencers);
      return `${user.id},${influencer.id},${user.wallet},${user.email},testuser${user.id}`;
    }).join('\n');
    
    fs.writeFileSync(path.join(__dirname, 'test-data.csv'), 
      'userId,influencerId,walletAddress,email,username\n' + csvContent
    );
    
    logger.log(`Generated ${testUsers.length} test users`);
    done();
  },

  // Authenticate user and set token in context
  authenticateUser: function(context, events, done) {
    // Simulate authentication
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];
    context.vars.authToken = generateAuthToken(user.id);
    context.vars.currentUserId = user.id;
    context.vars.currentWallet = user.wallet;
    done();
  },

  // Generate dynamic search query
  generateSearchQuery: function(context, events, done) {
    const queries = ['crypto', 'defi', 'nft', 'web3', 'blockchain', 'yield', 'staking'];
    context.vars.searchQuery = randomElement(queries);
    done();
  },

  // Select random influencer
  selectInfluencer: function(context, events, done) {
    context.vars.selectedInfluencer = randomElement(testInfluencers);
    done();
  },

  // Generate random stake amount
  generateStakeAmount: function(context, events, done) {
    const amounts = [
      1000000000000,    // 1,000 TWIST
      5000000000000,    // 5,000 TWIST
      10000000000000,   // 10,000 TWIST
      25000000000000,   // 25,000 TWIST
      50000000000000,   // 50,000 TWIST
    ];
    context.vars.stakeAmount = randomElement(amounts).toString();
    done();
  },

  // Validate response and capture data
  validateStakingResponse: function(context, events, done) {
    const response = context.vars.response;
    
    if (response && response.body) {
      try {
        const body = JSON.parse(response.body);
        
        if (body.transactionId) {
          context.vars.lastTransactionId = body.transactionId;
          context.vars.stakingSuccess = true;
        } else {
          context.vars.stakingSuccess = false;
          console.error('Staking failed:', body.error);
        }
      } catch (e) {
        console.error('Failed to parse response:', e);
        context.vars.stakingSuccess = false;
      }
    }
    
    done();
  },

  // WebSocket message handler
  handleWebSocketMessage: function(context, events, done) {
    const message = context.vars.wsMessage;
    
    if (message) {
      try {
        const parsed = JSON.parse(message);
        
        switch (parsed.type) {
          case 'staking:update':
            context.vars.lastStakingUpdate = parsed.data;
            break;
          case 'portfolio:update':
            context.vars.portfolioValue = parsed.data.totalValue;
            break;
          case 'error':
            console.error('WebSocket error:', parsed.message);
            break;
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    }
    
    done();
  },

  // Generate load test report
  generateReport: function(context, events, done) {
    const timestamp = new Date().toISOString();
    const report = {
      timestamp,
      testDuration: context.vars.$testDuration,
      totalRequests: context.vars.$requestCount || 0,
      successfulStakes: context.vars.$successfulStakes || 0,
      failedStakes: context.vars.$failedStakes || 0,
      averageResponseTime: context.vars.$avgResponseTime || 0,
      peakConcurrentUsers: context.vars.$peakUsers || 0,
    };
    
    fs.writeFileSync(
      path.join(__dirname, `load-test-report-${timestamp.replace(/:/g, '-')}.json`),
      JSON.stringify(report, null, 2)
    );
    
    logger.log('Load test report generated:', report);
    done();
  },

  // Custom metrics collector
  collectMetrics: function(context, events, done) {
    // Collect custom metrics during the test
    if (!context.vars.metrics) {
      context.vars.metrics = {
        stakingOperations: 0,
        searchOperations: 0,
        claimOperations: 0,
        websocketConnections: 0,
      };
    }
    
    // Update metrics based on current operation
    if (context.vars.lastOperation) {
      context.vars.metrics[context.vars.lastOperation]++;
    }
    
    done();
  },

  // Simulate different user behaviors
  simulateUserBehavior: function(context, events, done) {
    const behaviors = [
      'aggressive_staker',    // Rapid staking/unstaking
      'passive_browser',      // Mostly browsing
      'reward_hunter',        // Focuses on high APY
      'portfolio_manager',    // Frequent portfolio checks
      'content_consumer',     // Browses content
    ];
    
    context.vars.userBehavior = randomElement(behaviors);
    
    // Adjust test parameters based on behavior
    switch (context.vars.userBehavior) {
      case 'aggressive_staker':
        context.vars.thinkTime = 1;
        context.vars.operationWeight = { stake: 70, browse: 20, claim: 10 };
        break;
      case 'passive_browser':
        context.vars.thinkTime = 10;
        context.vars.operationWeight = { stake: 10, browse: 80, claim: 10 };
        break;
      case 'reward_hunter':
        context.vars.thinkTime = 5;
        context.vars.operationWeight = { stake: 30, browse: 50, claim: 20 };
        break;
      case 'portfolio_manager':
        context.vars.thinkTime = 3;
        context.vars.operationWeight = { stake: 40, browse: 40, claim: 20 };
        break;
      case 'content_consumer':
        context.vars.thinkTime = 8;
        context.vars.operationWeight = { stake: 20, browse: 70, claim: 10 };
        break;
    }
    
    done();
  },

  // Error handler
  handleError: function(context, events, done) {
    const error = context.vars.lastError;
    
    if (error) {
      console.error(`Error in scenario ${context.scenario}: ${error.message}`);
      
      // Log error to file for analysis
      const errorLog = {
        timestamp: new Date().toISOString(),
        scenario: context.scenario,
        userId: context.vars.currentUserId,
        operation: context.vars.lastOperation,
        error: {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
        },
      };
      
      fs.appendFileSync(
        path.join(__dirname, 'load-test-errors.log'),
        JSON.stringify(errorLog) + '\n'
      );
    }
    
    done();
  },

  // Cleanup after test
  cleanup: function(context, events, done) {
    // Clean up test data file
    try {
      fs.unlinkSync(path.join(__dirname, 'test-data.csv'));
    } catch (e) {
      // Ignore if file doesn't exist
    }
    
    logger.log('Test cleanup completed');
    done();
  }
};