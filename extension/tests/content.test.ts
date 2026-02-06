import { chrome } from 'jest-chrome';

describe('Content Script', () => {
  let contentScript: any;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <main>
        <h1>Test Page</h1>
        <article>
          <p>This is test content with some words to count.</p>
        </article>
      </main>
    `;

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'https:',
        href: 'https://example.com/test',
        hostname: 'example.com'
      },
      writable: true
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should not initialize on non-http protocols', () => {
      window.location.protocol = 'chrome-extension:';
      
      // Import content script
      require('../content/inject');

      // Should not set up any listeners
      expect(document.addEventListener).not.toHaveBeenCalled();
    });

    it('should initialize on http/https pages', () => {
      window.location.protocol = 'https:';
      
      // Import content script
      require('../content/inject');

      // Should set up activity listeners
      expect(document.addEventListener).toHaveBeenCalled();
    });
  });

  describe('Activity Tracking', () => {
    beforeEach(() => {
      // Import content script
      require('../content/inject');
    });

    it('should track click events', () => {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true
      });

      document.body.dispatchEvent(clickEvent);

      // Activity should be tracked
    });

    it('should track scroll events', () => {
      const scrollEvent = new Event('scroll', {
        bubbles: true,
        cancelable: true
      });

      document.dispatchEvent(scrollEvent);

      // Activity should be tracked
    });

    it('should send activity updates periodically', async () => {
      jest.useFakeTimers();

      // Wait for activity update interval (30 seconds)
      jest.advanceTimersByTime(30000);

      // Should send message to background
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'USER_ACTIVITY',
          payload: expect.objectContaining({
            activities: expect.any(Array),
            pageTime: expect.any(Number),
            isVisible: expect.any(Boolean)
          })
        })
      );

      jest.useRealTimers();
    });
  });

  describe('Message Handling', () => {
    let messageHandler: any;

    beforeEach(() => {
      require('../content/inject');
      const listeners = chrome.runtime.onMessage.addListener.mock.calls;
      messageHandler = listeners[listeners.length - 1][0];
    });

    it('should handle CHECK_ACTIVITY message', () => {
      const sendResponse = jest.fn();
      
      messageHandler(
        { type: 'CHECK_ACTIVITY' },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        isActive: expect.any(Boolean),
        lastActivity: expect.any(Number)
      });
    });

    it('should handle GET_PAGE_INFO message', () => {
      // Add meta tags for testing
      document.head.innerHTML = `
        <meta name="description" content="Test description">
        <meta name="author" content="Test Author">
      `;

      const sendResponse = jest.fn();
      
      messageHandler(
        { type: 'GET_PAGE_INFO' },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        title: expect.any(String),
        description: 'Test description',
        author: 'Test Author',
        wordCount: expect.any(Number),
        hasVideo: false,
        hasPaywall: false,
        canonical: undefined,
        publishedTime: undefined,
        modifiedTime: undefined
      });
    });
  });

  describe('Viewport Tracking', () => {
    it('should track viewport time with IntersectionObserver', () => {
      const mockObserve = jest.fn();
      const mockIntersectionObserver = jest.fn(() => ({
        observe: mockObserve,
        unobserve: jest.fn(),
        disconnect: jest.fn()
      }));

      global.IntersectionObserver = mockIntersectionObserver as any;

      require('../content/inject');

      // Should observe main content elements
      setTimeout(() => {
        const mainElement = document.querySelector('main');
        const articleElement = document.querySelector('article');
        
        expect(mockObserve).toHaveBeenCalledWith(mainElement);
        expect(mockObserve).toHaveBeenCalledWith(articleElement);
      }, 1100);
    });
  });

  describe('Page Info Extraction', () => {
    beforeEach(() => {
      require('../content/inject');
    });

    it('should count words correctly', () => {
      document.body.innerHTML = `
        <p>This is a test paragraph with exactly ten words here.</p>
      `;

      const listeners = chrome.runtime.onMessage.addListener.mock.calls;
      const messageHandler = listeners[listeners.length - 1][0];
      const sendResponse = jest.fn();
      
      messageHandler(
        { type: 'GET_PAGE_INFO' },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          wordCount: 10
        })
      );
    });

    it('should detect paywalls', () => {
      document.body.className = 'article-paywall';

      const listeners = chrome.runtime.onMessage.addListener.mock.calls;
      const messageHandler = listeners[listeners.length - 1][0];
      const sendResponse = jest.fn();
      
      messageHandler(
        { type: 'GET_PAGE_INFO' },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          hasPaywall: true
        })
      );
    });

    it('should detect videos', () => {
      document.body.innerHTML = `
        <video src="test.mp4"></video>
      `;

      const listeners = chrome.runtime.onMessage.addListener.mock.calls;
      const messageHandler = listeners[listeners.length - 1][0];
      const sendResponse = jest.fn();
      
      messageHandler(
        { type: 'GET_PAGE_INFO' },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          hasVideo: true
        })
      );
    });
  });

  describe('VAU Detector Injection', () => {
    it('should inject VAU detector script', () => {
      const mockAppendChild = jest.spyOn(document.head, 'appendChild');
      
      require('../content/inject');

      expect(mockAppendChild).toHaveBeenCalledWith(
        expect.objectContaining({
          src: expect.stringContaining('inject/vau-detector.js')
        })
      );
    });
  });

  describe('Wallet Interface', () => {
    beforeEach(() => {
      require('../content/inject');
    });

    it('should inject wallet interface when requested', () => {
      const mockAppendChild = jest.spyOn(document.head, 'appendChild');
      
      const listeners = chrome.runtime.onMessage.addListener.mock.calls;
      const messageHandler = listeners[listeners.length - 1][0];
      
      messageHandler(
        { type: 'INJECT_WALLET' },
        {},
        jest.fn()
      );

      expect(mockAppendChild).toHaveBeenCalledWith(
        expect.objectContaining({
          textContent: expect.stringContaining('window.TWIST')
        })
      );
    });
  });
});