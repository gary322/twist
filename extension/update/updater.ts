// Auto-Update System for TWIST Extension
export interface UpdateInfo {
  version: string;
  available: boolean;
  features?: string;
  bugfixes?: string[];
  updateUrl?: string;
  releaseNotes?: string;
  critical?: boolean;
  minimumVersion?: string;
}

export class ExtensionUpdater {
  private readonly UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  private readonly UPDATE_URL = 'https://api.twist.io/extension/updates';
  private readonly NOTIFICATION_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours
  
  private lastUpdateCheck: number = 0;
  private lastNotification: number = 0;
  private pendingUpdate: UpdateInfo | null = null;
  private updateCheckTimer: number | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    // Check for updates on startup
    await this.checkForUpdates();
    
    // Schedule periodic update checks
    this.scheduleUpdateChecks();
    
    // Listen for manual update checks
    this.setupMessageHandlers();
    
    // Check if there's a pending update from previous session
    this.checkPendingUpdate();
  }

  private scheduleUpdateChecks() {
    // Set up Chrome alarms for update checks
    if (chrome.alarms) {
      chrome.alarms.create('checkUpdates', {
        periodInMinutes: this.UPDATE_CHECK_INTERVAL / 60000
      });

      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'checkUpdates') {
          this.checkForUpdates();
        }
      });
    } else {
      // Fallback to setInterval for testing
      this.updateCheckTimer = window.setInterval(() => {
        this.checkForUpdates();
      }, this.UPDATE_CHECK_INTERVAL);
    }
  }

  private setupMessageHandlers() {
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'CHECK_FOR_UPDATES') {
          this.checkForUpdates(true).then(sendResponse);
          return true; // Keep channel open for async response
        } else if (message.type === 'APPLY_UPDATE') {
          this.applyUpdate().then(sendResponse);
          return true;
        }
      });
    }
  }

  public async checkForUpdates(force: boolean = false): Promise<UpdateInfo> {
    const now = Date.now();
    
    // Rate limit update checks (unless forced)
    if (!force && now - this.lastUpdateCheck < 30 * 60 * 1000) { // 30 minutes
      return { version: this.getCurrentVersion(), available: false };
    }

    this.lastUpdateCheck = now;

    try {
      const manifest = chrome.runtime.getManifest();
      const currentVersion = manifest.version;
      const browser = this.getBrowserInfo();

      const response = await fetch(`${this.UPDATE_URL}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Extension-Version': currentVersion,
          'X-Browser': browser.name,
          'X-Browser-Version': browser.version
        },
        body: JSON.stringify({
          version: currentVersion,
          browser: browser.name,
          platform: navigator.platform,
          language: navigator.language,
          installId: await this.getInstallId()
        })
      });

      if (!response.ok) {
        throw new Error(`Update check failed: ${response.status}`);
      }

      const updateInfo: UpdateInfo = await response.json();

      // Store update info
      if (updateInfo.available) {
        this.pendingUpdate = updateInfo;
        await this.storePendingUpdate(updateInfo);
        
        // Notify user if update is available
        if (this.shouldNotifyUser(updateInfo)) {
          this.notifyUpdate(updateInfo);
        }
      }

      return updateInfo;
    } catch (error) {
      console.error('[TWIST] Update check failed:', error);
      return { 
        version: this.getCurrentVersion(), 
        available: false 
      };
    }
  }

  private async checkPendingUpdate() {
    const stored = await chrome.storage.local.get('pendingUpdate');
    if (stored.pendingUpdate) {
      this.pendingUpdate = stored.pendingUpdate;
      
      // Check if we should notify again
      if (this.pendingUpdate && this.shouldNotifyUser(this.pendingUpdate)) {
        this.notifyUpdate(this.pendingUpdate);
      }
    }
  }

  private async storePendingUpdate(updateInfo: UpdateInfo) {
    await chrome.storage.local.set({ 
      pendingUpdate: updateInfo,
      updateCheckTime: Date.now()
    });
  }

  private shouldNotifyUser(updateInfo: UpdateInfo): boolean {
    const now = Date.now();
    
    // Always notify for critical updates
    if (updateInfo.critical) {
      return true;
    }
    
    // Respect notification cooldown
    if (now - this.lastNotification < this.NOTIFICATION_COOLDOWN) {
      return false;
    }
    
    return true;
  }

  private notifyUpdate(updateInfo: UpdateInfo) {
    this.lastNotification = Date.now();
    
    const notificationOptions = {
      type: 'basic' as const,
      iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
      title: 'TWIST Extension Update Available',
      message: `Version ${updateInfo.version} is available${updateInfo.critical ? ' (Critical Update)' : ''}`,
      priority: updateInfo.critical ? 2 : 1,
      buttons: [
        { title: 'Update Now' },
        { title: 'Later' }
      ],
      requireInteraction: updateInfo.critical || false
    };

    // Add release notes if available
    if (updateInfo.features) {
      notificationOptions.message += `\n\n${updateInfo.features}`;
    }

    chrome.notifications.create('extension-update', notificationOptions, () => {
      // Notification created callback
      if (chrome.runtime.lastError) {
        console.error('[TWIST] Failed to create notification:', chrome.runtime.lastError);
      }
    });

    // Handle notification button clicks
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      if (notificationId === 'extension-update') {
        if (buttonIndex === 0) {
          // Update Now
          this.applyUpdate();
        } else {
          // Later - store reminder
          chrome.storage.local.set({ 
            updateReminder: Date.now() + 24 * 60 * 60 * 1000 // Remind in 24 hours
          });
        }
        chrome.notifications.clear(notificationId);
      }
    });

    // Handle notification click
    chrome.notifications.onClicked.addListener((notificationId) => {
      if (notificationId === 'extension-update') {
        // Open update page with details
        if (updateInfo.updateUrl) {
          chrome.tabs.create({ url: updateInfo.updateUrl });
        }
        chrome.notifications.clear(notificationId);
      }
    });
  }

  private async applyUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!this.pendingUpdate) {
      return { success: false, error: 'No update available' };
    }

    try {
      const browser = this.getBrowserInfo();
      
      switch (browser.name) {
        case 'chrome':
        case 'edge':
          // Chrome and Edge support automatic updates
          if (this.pendingUpdate.updateUrl) {
            chrome.tabs.create({ url: this.pendingUpdate.updateUrl });
            return { success: true };
          }
          break;
          
        case 'firefox':
          // Firefox requires user to update through Add-ons Manager
          chrome.tabs.create({ url: 'about:addons' });
          return { success: true };
          
        case 'safari':
          // Safari updates through App Store
          if (this.pendingUpdate.updateUrl) {
            chrome.tabs.create({ url: this.pendingUpdate.updateUrl });
            return { success: true };
          }
          break;
      }

      // Clear pending update
      await chrome.storage.local.remove(['pendingUpdate', 'updateReminder']);
      this.pendingUpdate = null;

      return { success: true };
    } catch (error: any) {
      console.error('[TWIST] Update failed:', error);
      return { success: false, error: error.message };
    }
  }

  private getCurrentVersion(): string {
    return chrome.runtime.getManifest().version;
  }

  private isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const latestPart = latestParts[i] || 0;
      const currentPart = currentParts[i] || 0;
      
      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }

    return false;
  }

  private getBrowserInfo(): { name: string; version: string } {
    const userAgent = navigator.userAgent;
    let name = 'unknown';
    let version = '0';

    if (userAgent.includes('Firefox')) {
      name = 'firefox';
      const match = userAgent.match(/Firefox\/(\d+)/);
      version = match ? match[1] : '0';
    } else if (userAgent.includes('Edg/')) {
      name = 'edge';
      const match = userAgent.match(/Edg\/(\d+)/);
      version = match ? match[1] : '0';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      name = 'safari';
      const match = userAgent.match(/Version\/(\d+)/);
      version = match ? match[1] : '0';
    } else if (userAgent.includes('Chrome')) {
      name = 'chrome';
      const match = userAgent.match(/Chrome\/(\d+)/);
      version = match ? match[1] : '0';
    }

    return { name, version };
  }

  private async getInstallId(): Promise<string> {
    const stored = await chrome.storage.local.get('installId');
    if (stored.installId) {
      return stored.installId;
    }

    // Generate new install ID
    const installId = this.generateUUID();
    await chrome.storage.local.set({ installId });
    return installId;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Public API
  public async getUpdateStatus(): Promise<{
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion?: string;
    updateInfo?: UpdateInfo;
  }> {
    const current = this.getCurrentVersion();
    
    if (this.pendingUpdate) {
      return {
        hasUpdate: true,
        currentVersion: current,
        latestVersion: this.pendingUpdate.version,
        updateInfo: this.pendingUpdate
      };
    }

    return {
      hasUpdate: false,
      currentVersion: current
    };
  }

  public async forceUpdateCheck(): Promise<UpdateInfo> {
    return this.checkForUpdates(true);
  }

  public cleanup() {
    if (this.updateCheckTimer) {
      clearInterval(this.updateCheckTimer);
    }
  }
}