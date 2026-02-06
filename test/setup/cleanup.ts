// Test Cleanup Configuration
import { cleanupTestEnvironment } from '../config/test-fixes.config';

// Run after each test
afterEach(() => {
  // Clear all pending timers
  if (jest.isMockFunction(setTimeout)) {
    jest.clearAllTimers();
  }
  
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset modules if needed
  if (process.env.RESET_MODULES === 'true') {
    jest.resetModules();
  }
  
  // Clean up DOM
  if (typeof document !== 'undefined') {
    // Remove any test elements
    document.querySelectorAll('[data-testid]').forEach(el => el.remove());
    
    // Clear body
    document.body.innerHTML = '';
    
    // Reset body classes
    document.body.className = '';
  }
  
  // Clear localStorage/sessionStorage
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
    window.sessionStorage.clear();
  }
});

// Run after all tests in a file
afterAll(() => {
  cleanupTestEnvironment();
  
  // Close any open connections
  if (global.__RPC_CONNECTIONS__) {
    global.__RPC_CONNECTIONS__.forEach((conn: any) => {
      if (conn && typeof conn.close === 'function') {
        conn.close();
      }
    });
    global.__RPC_CONNECTIONS__ = [];
  }
  
  // Clear any remaining timeouts
  const highestTimeoutId = setTimeout(() => {}, 0);
  for (let i = 0; i < highestTimeoutId; i++) {
    clearTimeout(i);
  }
});