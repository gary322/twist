// VAU Detector - Injected into verified TWIST sites
(function() {
  'use strict';

  // Check if already injected
  if (window.TWIST_VAU_DETECTOR) {
    return;
  }

  window.TWIST_VAU_DETECTOR = true;

  class VAUDetector {
    constructor() {
      this.startTime = Date.now();
      this.isActive = true;
      this.lastActivity = Date.now();
      this.activityBuffer = [];
      this.totalActiveTime = 0;
      this.lastCheck = Date.now();

      this.init();
    }

    init() {
      // Set up activity listeners
      this.setupActivityListeners();

      // Set up visibility detection
      this.setupVisibilityDetection();

      // Set up periodic reporting
      this.setupPeriodicReporting();

      // Notify extension that VAU detector is active
      this.sendMessage({
        type: 'VAU_DETECTOR_ACTIVE',
        data: {
          url: window.location.href,
          domain: window.location.hostname
        }
      });
    }

    setupActivityListeners() {
      const events = ['click', 'scroll', 'keypress', 'mousemove', 'touchstart'];
      
      events.forEach(event => {
        document.addEventListener(event, this.throttle(() => {
          this.recordActivity(event);
        }, 1000), { passive: true });
      });

      // Track media playback
      document.addEventListener('play', (e) => {
        if (e.target instanceof HTMLMediaElement) {
          this.recordActivity('media_play');
        }
      }, true);

      // Track form interactions
      document.addEventListener('focus', (e) => {
        if (e.target instanceof HTMLInputElement || 
            e.target instanceof HTMLTextAreaElement) {
          this.recordActivity('form_interaction');
        }
      }, true);
    }

    setupVisibilityDetection() {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          // Page is hidden, pause tracking
          this.updateActiveTime();
          this.isActive = false;
        } else {
          // Page is visible again
          this.isActive = true;
          this.lastCheck = Date.now();
        }
      });

      // Track window focus
      window.addEventListener('focus', () => {
        this.isActive = true;
        this.lastCheck = Date.now();
      });

      window.addEventListener('blur', () => {
        this.updateActiveTime();
        this.isActive = false;
      });
    }

    setupPeriodicReporting() {
      // Report activity every 30 seconds
      setInterval(() => {
        if (this.activityBuffer.length > 0 || this.isActive) {
          this.reportActivity();
        }
      }, 30000);

      // Update active time every 5 seconds
      setInterval(() => {
        if (this.isActive) {
          this.updateActiveTime();
        }
      }, 5000);
    }

    recordActivity(type) {
      const now = Date.now();
      this.lastActivity = now;

      // Buffer activity data
      this.activityBuffer.push({
        type,
        timestamp: now,
        x: event?.clientX || 0,
        y: event?.clientY || 0
      });

      // Limit buffer size
      if (this.activityBuffer.length > 100) {
        this.activityBuffer = this.activityBuffer.slice(-50);
      }

      // Update active time
      if (this.isActive) {
        this.updateActiveTime();
      }
    }

    updateActiveTime() {
      const now = Date.now();
      if (this.isActive && this.lastCheck) {
        this.totalActiveTime += now - this.lastCheck;
      }
      this.lastCheck = now;
    }

    reportActivity() {
      this.updateActiveTime();

      const report = {
        type: 'VAU_ACTIVITY_REPORT',
        data: {
          url: window.location.href,
          domain: window.location.hostname,
          totalTime: Date.now() - this.startTime,
          activeTime: this.totalActiveTime,
          lastActivity: this.lastActivity,
          activityCount: this.activityBuffer.length,
          activities: this.activityBuffer.slice(-20), // Send last 20 activities
          isActive: this.isActive,
          pageMetrics: this.getPageMetrics()
        }
      };

      this.sendMessage(report);

      // Clear activity buffer after reporting
      this.activityBuffer = [];
    }

    getPageMetrics() {
      return {
        scrollDepth: this.calculateScrollDepth(),
        timeOnPage: Date.now() - this.startTime,
        wordCount: this.getWordCount(),
        hasVideo: document.querySelectorAll('video').length > 0,
        hasAudio: document.querySelectorAll('audio').length > 0,
        linkClicks: this.activityBuffer.filter(a => a.type === 'click').length,
        formInteractions: this.activityBuffer.filter(a => a.type === 'form_interaction').length
      };
    }

    calculateScrollDepth() {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollPercentage = ((scrollTop + windowHeight) / documentHeight) * 100;
      return Math.min(100, Math.round(scrollPercentage));
    }

    getWordCount() {
      const text = document.body.innerText || '';
      return text.trim().split(/\s+/).length;
    }

    throttle(func, limit) {
      let inThrottle;
      return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }

    sendMessage(message) {
      window.postMessage({
        source: 'TWIST_VAU_DETECTOR',
        ...message
      }, '*');
    }

    // Clean up method
    destroy() {
      // Report final activity
      this.reportActivity();
      
      // Remove all listeners
      // Note: In production, we'd need to store references to remove them
    }
  }

  // Initialize VAU Detector
  const vauDetector = new VAUDetector();

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    vauDetector.destroy();
  });

  // Expose API for the page if needed
  window.TWIST = window.TWIST || {};
  window.TWIST.vauDetector = {
    isActive: () => vauDetector.isActive,
    getMetrics: () => vauDetector.getPageMetrics(),
    getTotalActiveTime: () => vauDetector.totalActiveTime
  };

})();