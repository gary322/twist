import { chrome } from 'jest-chrome';
import '../background/service-worker';
import { MessageType } from '../types';

describe('Background Service Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  describe('Installation', () => {
    it('should initialize on install', async () => {
      const details = { reason: 'install' as chrome.runtime.OnInstalledReason };
      
      // Trigger install event
      const listeners = chrome.runtime.onInstalled.addListener.mock.calls;
      const installHandler = listeners[listeners.length - 1][0];
      await installHandler(details);

      // Should create alarms
      expect(chrome.alarms.create).toHaveBeenCalledWith('vauSubmission', { periodInMinutes: 5 });
      expect(chrome.alarms.create).toHaveBeenCalledWith('dailyReset', expect.any(Object));

      // Should create context menu
      expect(chrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'twist-verify-site',
        title: 'Verify this site with TWIST',
        contexts: ['page']
      });

      // Should open onboarding page
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('onboarding/index.html')
      });
    });

    it('should load saved state on install', async () => {
      const savedState = {
        session: { email: 'test@example.com', isAuthenticated: true },
        totalEarnings: 100,
        dailyEarnings: 10
      };

      chrome.storage.local.get.mockResolvedValue(savedState);

      const details = { reason: 'update' as chrome.runtime.OnInstalledReason };
      const listeners = chrome.runtime.onInstalled.addListener.mock.calls;
      const installHandler = listeners[listeners.length - 1][0];
      await installHandler(details);

      // Should not open onboarding for updates
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    let messageHandler: any;

    beforeEach(() => {
      const listeners = chrome.runtime.onMessage.addListener.mock.calls;
      messageHandler = listeners[listeners.length - 1][0];
    });

    it('should handle AUTHENTICATE message', async () => {
      const authPayload = { email: 'test@example.com', password: 'password123' };
      const mockResponse = {
        email: 'test@example.com',
        trustScore: 100,
        token: 'test-token'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const sendResponse = jest.fn();
      await messageHandler(
        { type: MessageType.AUTHENTICATE, payload: authPayload },
        {},
        sendResponse
      );

      // Should call API
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.twist.io/api/v1/auth/extension-login',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('test@example.com')
        })
      );

      // Should save session
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({
            email: 'test@example.com',
            isAuthenticated: true
          })
        })
      );
    });

    it('should handle GET_STATE message', async () => {
      const sendResponse = jest.fn();
      
      await messageHandler(
        { type: MessageType.GET_STATE },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.any(Object),
          earnings: expect.objectContaining({
            total: expect.any(Number),
            daily: expect.any(Number)
          })
        })
      );
    });

    it('should handle LOGOUT message', async () => {
      const sendResponse = jest.fn();
      
      await messageHandler(
        { type: MessageType.LOGOUT },
        {},
        sendResponse
      );

      // Should clear storage
      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'session',
        'totalEarnings',
        'dailyEarnings'
      ]);

      // Should clear badge
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('Tab Monitoring', () => {
    it('should track tab activation', async () => {
      const tab = {
        id: 1,
        url: 'https://example.com',
        active: true
      };

      chrome.tabs.get.mockResolvedValue(tab as any);

      const listeners = chrome.tabs.onActivated.addListener.mock.calls;
      const activatedHandler = listeners[listeners.length - 1][0];
      
      await activatedHandler({ tabId: 1, windowId: 1 });

      expect(chrome.tabs.get).toHaveBeenCalledWith(1);
    });

    it('should track tab updates', () => {
      const tab = {
        id: 1,
        url: 'https://example.com',
        active: true
      };

      const listeners = chrome.tabs.onUpdated.addListener.mock.calls;
      const updateHandler = listeners[listeners.length - 1][0];
      
      updateHandler(1, { status: 'complete' }, tab as any);

      // Tab state should be updated internally
    });

    it('should submit VAU on tab removal', async () => {
      const listeners = chrome.tabs.onRemoved.addListener.mock.calls;
      const removeHandler = listeners[listeners.length - 1][0];
      
      removeHandler(1, { windowId: 1, isWindowClosing: false });

      // Should attempt VAU submission
    });
  });

  describe('VAU Submission', () => {
    it('should submit VAU for authenticated users', async () => {
      // Set up authenticated state
      chrome.storage.local.get.mockResolvedValue({
        session: {
          email: 'test@example.com',
          isAuthenticated: true,
          deviceId: 'test-device',
          trustScore: 100
        }
      });

      const mockVAUResponse = {
        id: 'vau-123',
        earned: 5,
        timestamp: Date.now()
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockVAUResponse
      });

      // Simulate message for VAU submission
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      
      await messageHandler(
        { type: MessageType.SUBMIT_VAU },
        { tab: { id: 1 } },
        sendResponse
      );

      // Should show notification for earnings
      expect(chrome.notifications.create).toHaveBeenCalled();
    });

    it('should not submit VAU for unauthenticated users', async () => {
      chrome.storage.local.get.mockResolvedValue({
        session: { isAuthenticated: false }
      });

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      
      await messageHandler(
        { type: MessageType.SUBMIT_VAU },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Alarm Handlers', () => {
    it('should handle vauSubmission alarm', () => {
      const listeners = chrome.alarms.onAlarm.addListener.mock.calls;
      const alarmHandler = listeners[listeners.length - 1][0];
      
      alarmHandler({ name: 'vauSubmission', scheduledTime: Date.now() });

      // Should trigger pending VAU submissions
    });

    it('should handle dailyReset alarm', () => {
      const listeners = chrome.alarms.onAlarm.addListener.mock.calls;
      const alarmHandler = listeners[listeners.length - 1][0];
      
      alarmHandler({ name: 'dailyReset', scheduledTime: Date.now() });

      // Should reset daily stats
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          dailyEarnings: 0,
          lastResetDate: expect.any(String)
        })
      );

      // Should clear badge
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });
  });

  describe('Wallet Connection', () => {
    it('should connect wallet successfully', async () => {
      chrome.storage.local.get.mockResolvedValue({
        session: {
          email: 'test@example.com',
          isAuthenticated: true
        }
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      
      await messageHandler(
        {
          type: MessageType.CONNECT_WALLET,
          payload: {
            address: '0x1234567890',
            signature: 'test-signature'
          }
        },
        {},
        sendResponse
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.twist.io/api/v1/wallet/connect',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('0x1234567890')
        })
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('Badge Updates', () => {
    it('should update badge with daily earnings', () => {
      // Simulate earning update
      chrome.storage.local.get.mockResolvedValue({
        dailyEarnings: 25
      });

      // Should be called during various operations
      expect(chrome.action.setBadgeText).toHaveBeenCalled();
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalled();
    });
  });
});