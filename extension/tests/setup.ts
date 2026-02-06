// Jest setup file for Chrome extension testing
import { chrome } from 'jest-chrome';

// Mock Chrome APIs
Object.assign(global, {
  chrome: chrome
});

// Mock crypto.randomUUID
global.crypto = {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
  getRandomValues: (arr: any) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }
} as any;

// Mock fetch
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn()
};

// Setup Chrome storage mock
chrome.storage.local.get.mockImplementation((keys, callback) => {
  const result: any = {};
  if (callback) {
    callback(result);
  }
  return Promise.resolve(result);
});

chrome.storage.local.set.mockImplementation((items, callback) => {
  if (callback) {
    callback();
  }
  return Promise.resolve();
});

// Setup Chrome tabs mock
chrome.tabs.query.mockResolvedValue([]);
chrome.tabs.get.mockResolvedValue({
  id: 1,
  url: 'https://example.com',
  active: true
} as any);

// Setup Chrome runtime mock
chrome.runtime.getManifest.mockReturnValue({
  version: '1.0.0',
  manifest_version: 3,
  name: 'TWIST Extension'
} as any);

chrome.runtime.getURL.mockImplementation((path: string) => {
  return `chrome-extension://test-extension-id/${path}`;
});

// Setup Chrome alarms mock
chrome.alarms.create.mockImplementation(() => {});

// Setup Chrome notifications mock
chrome.notifications.create.mockImplementation((idOrOptions: any, optionsOrCallback?: any, callback?: any) => {
  // Handle both overloads
  let notificationId: string;
  let cb: any;
  
  if (typeof idOrOptions === 'string') {
    notificationId = idOrOptions;
    cb = callback;
  } else {
    notificationId = 'test-notification';
    cb = optionsOrCallback;
  }
  
  if (cb) {
    cb(notificationId);
  }
  return Promise.resolve(notificationId);
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});