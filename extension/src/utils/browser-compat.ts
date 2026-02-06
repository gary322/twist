// Browser Compatibility Layer
// Provides a unified API across Chrome, Firefox, Edge, and Safari

export interface BrowserAPI {
  name: 'chrome' | 'firefox' | 'edge' | 'safari' | 'unknown';
  isManifestV3: boolean;
  storage: typeof chrome.storage;
  runtime: typeof chrome.runtime;
  tabs: typeof chrome.tabs;
  action: any; // chrome.action or browser.browserAction
  notifications: typeof chrome.notifications;
  alarms: typeof chrome.alarms;
  scripting: any;
}

class BrowserCompatibility {
  private static instance: BrowserCompatibility;
  public browser: BrowserAPI;

  private constructor() {
    this.browser = this.detectBrowser();
    this.setupPolyfills();
  }

  static getInstance(): BrowserCompatibility {
    if (!BrowserCompatibility.instance) {
      BrowserCompatibility.instance = new BrowserCompatibility();
    }
    return BrowserCompatibility.instance;
  }

  private detectBrowser(): BrowserAPI {
    const userAgent = navigator.userAgent.toLowerCase();
    let browserName: BrowserAPI['name'] = 'unknown';
    
    // Detect browser type
    if (userAgent.includes('firefox')) {
      browserName = 'firefox';
    } else if (userAgent.includes('edg/')) {
      browserName = 'edge';
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      browserName = 'safari';
    } else if (userAgent.includes('chrome')) {
      browserName = 'chrome';
    }

    // Check manifest version
    const manifest = chrome.runtime.getManifest();
    const isManifestV3 = manifest.manifest_version === 3;

    // Get the appropriate APIs
    const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

    return {
      name: browserName,
      isManifestV3,
      storage: api.storage,
      runtime: api.runtime,
      tabs: api.tabs,
      action: api.action || api.browserAction,
      notifications: api.notifications,
      alarms: api.alarms,
      scripting: api.scripting || this.createScriptingPolyfill(api)
    };
  }

  private setupPolyfills() {
    // Polyfill for action API in Manifest V2
    if (!this.browser.isManifestV3 && !chrome.action && chrome.browserAction) {
      chrome.action = {
        setBadgeText: chrome.browserAction.setBadgeText.bind(chrome.browserAction),
        setBadgeBackgroundColor: chrome.browserAction.setBadgeBackgroundColor.bind(chrome.browserAction),
        setIcon: chrome.browserAction.setIcon.bind(chrome.browserAction),
        setTitle: chrome.browserAction.setTitle.bind(chrome.browserAction),
        openPopup: chrome.browserAction.openPopup?.bind(chrome.browserAction)
      };
    }

    // Polyfill for Promise-based APIs in Firefox
    if (this.browser.name === 'firefox' && typeof browser !== 'undefined') {
      this.promisifyChrome();
    }
  }

  private createScriptingPolyfill(api: any) {
    return {
      executeScript: async (injection: any) => {
        const { target, files, func, args } = injection;
        
        if (api.tabs.executeScript) {
          // Manifest V2 style
          return new Promise((resolve, reject) => {
            const options: any = {};
            
            if (files) {
              options.file = files[0];
            } else if (func) {
              options.code = `(${func.toString()})(${JSON.stringify(args || [])})`;
            }
            
            api.tabs.executeScript(target.tabId, options, (results: any) => {
              if (api.runtime.lastError) {
                reject(api.runtime.lastError);
              } else {
                resolve(results);
              }
            });
          });
        }
        
        throw new Error('executeScript not supported');
      }
    };
  }

  private promisifyChrome() {
    // Convert callback-based Chrome APIs to Promise-based for Firefox
    const promisify = (fn: Function, context: any) => {
      return (...args: any[]) => {
        return new Promise((resolve, reject) => {
          fn.call(context, ...args, (...results: any[]) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(results.length === 1 ? results[0] : results);
            }
          });
        });
      };
    };

    // Promisify commonly used APIs
    if (chrome.storage && chrome.storage.local) {
      const originalGet = chrome.storage.local.get;
      const originalSet = chrome.storage.local.set;
      
      chrome.storage.local.get = function(keys: any) {
        if (arguments.length === 2 && typeof arguments[1] === 'function') {
          return originalGet.apply(this, arguments);
        }
        return promisify(originalGet, this)(keys);
      };
      
      chrome.storage.local.set = function(items: any) {
        if (arguments.length === 2 && typeof arguments[1] === 'function') {
          return originalSet.apply(this, arguments);
        }
        return promisify(originalSet, this)(items);
      };
    }
  }

  // Utility methods for cross-browser compatibility
  async executeScript(tabId: number, files: string[]): Promise<any> {
    if (this.browser.scripting) {
      return this.browser.scripting.executeScript({
        target: { tabId },
        files
      });
    }
    
    throw new Error('Script execution not supported');
  }

  setBadgeText(text: string): void {
    if (this.browser.action?.setBadgeText) {
      this.browser.action.setBadgeText({ text });
    }
  }

  setBadgeBackgroundColor(color: string): void {
    if (this.browser.action?.setBadgeBackgroundColor) {
      this.browser.action.setBadgeBackgroundColor({ color });
    }
  }

  async createNotification(options: chrome.notifications.NotificationOptions): Promise<string> {
    return new Promise((resolve) => {
      const id = `notification-${Date.now()}`;
      this.browser.notifications.create(id, options, (notificationId) => {
        resolve(notificationId || id);
      });
    });
  }

  async getTab(tabId: number): Promise<chrome.tabs.Tab> {
    return new Promise((resolve, reject) => {
      this.browser.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tab);
        }
      });
    });
  }

  async queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    return new Promise((resolve, reject) => {
      this.browser.tabs.query(queryInfo, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tabs);
        }
      });
    });
  }

  async createTab(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
    return new Promise((resolve, reject) => {
      this.browser.tabs.create(createProperties, (tab) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tab);
        }
      });
    });
  }

  getManifest(): chrome.runtime.Manifest {
    return this.browser.runtime.getManifest();
  }

  getURL(path: string): string {
    return this.browser.runtime.getURL(path);
  }

  // Storage helpers with consistent API
  async getStorage(keys: string | string[] | null): Promise<any> {
    if (this.browser.name === 'firefox' && typeof browser !== 'undefined') {
      return browser.storage.local.get(keys);
    }
    
    return new Promise((resolve) => {
      this.browser.storage.local.get(keys, resolve);
    });
  }

  async setStorage(items: object): Promise<void> {
    if (this.browser.name === 'firefox' && typeof browser !== 'undefined') {
      return browser.storage.local.set(items);
    }
    
    return new Promise((resolve) => {
      this.browser.storage.local.set(items, resolve);
    });
  }

  async removeStorage(keys: string | string[]): Promise<void> {
    if (this.browser.name === 'firefox' && typeof browser !== 'undefined') {
      return browser.storage.local.remove(keys);
    }
    
    return new Promise((resolve) => {
      this.browser.storage.local.remove(keys, resolve);
    });
  }
}

// Export singleton instance
export const browserCompat = BrowserCompatibility.getInstance();

// Export commonly used methods
export const {
  executeScript,
  setBadgeText,
  setBadgeBackgroundColor,
  createNotification,
  getTab,
  queryTabs,
  createTab,
  getManifest,
  getURL,
  getStorage,
  setStorage,
  removeStorage
} = browserCompat;