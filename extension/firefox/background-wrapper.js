// Firefox Background Script Wrapper for Manifest V2
// This wraps the service worker to work with Firefox's background script model

// Import the service worker code
importScripts('../background/service-worker.js');

// Firefox-specific polyfills and adaptations
(function() {
  'use strict';

  // Polyfill for chrome.action (Firefox uses browserAction)
  if (!chrome.action && chrome.browserAction) {
    chrome.action = {
      setBadgeText: chrome.browserAction.setBadgeText,
      setBadgeBackgroundColor: chrome.browserAction.setBadgeBackgroundColor,
      setIcon: chrome.browserAction.setIcon,
      setTitle: chrome.browserAction.setTitle,
      openPopup: chrome.browserAction.openPopup
    };
  }

  // Polyfill for chrome.scripting (Firefox uses tabs.executeScript)
  if (!chrome.scripting) {
    chrome.scripting = {
      executeScript: function(injection) {
        return new Promise((resolve, reject) => {
          const tabId = injection.target.tabId;
          const files = injection.files;
          
          if (files && files.length > 0) {
            chrome.tabs.executeScript(tabId, {
              file: files[0],
              runAt: 'document_idle'
            }, (results) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(results);
              }
            });
          } else {
            reject(new Error('No files specified'));
          }
        });
      }
    };
  }

  // Handle Firefox-specific events
  if (browser && browser.runtime) {
    // Firefox uses browser namespace
    browser.runtime.onInstalled.addListener((details) => {
      chrome.runtime.onInstalled.dispatch(details);
    });
  }

  // Handle persistent background script lifecycle
  // In Manifest V2, background scripts can be persistent
  // but we'll simulate non-persistent behavior for consistency
  let activeConnections = 0;

  chrome.runtime.onConnect.addListener((port) => {
    activeConnections++;
    
    port.onDisconnect.addListener(() => {
      activeConnections--;
      
      // Simulate event page behavior
      if (activeConnections === 0) {
        // Allow background script to be suspended after 30 seconds
        setTimeout(() => {
          if (activeConnections === 0) {
            // Firefox will handle suspension
          }
        }, 30000);
      }
    });
  });

  // Ensure promises work correctly in Firefox
  if (typeof browser !== 'undefined' && browser.runtime) {
    // Use browser.* APIs which return promises
    const originalStorageGet = chrome.storage.local.get;
    chrome.storage.local.get = function(keys) {
      if (arguments.length === 2 && typeof arguments[1] === 'function') {
        // Callback style
        return originalStorageGet.apply(this, arguments);
      } else {
        // Promise style
        return browser.storage.local.get(keys);
      }
    };

    const originalStorageSet = chrome.storage.local.set;
    chrome.storage.local.set = function(items) {
      if (arguments.length === 2 && typeof arguments[1] === 'function') {
        // Callback style
        return originalStorageSet.apply(this, arguments);
      } else {
        // Promise style
        return browser.storage.local.set(items);
      }
    };
  }

  // Handle Firefox-specific fetch options
  const originalFetch = self.fetch;
  self.fetch = function(url, options = {}) {
    // Firefox may require different headers
    if (options.headers && !options.headers['User-Agent']) {
      options.headers['User-Agent'] = `TWIST-Extension-Firefox/${chrome.runtime.getManifest().version}`;
    }
    
    return originalFetch(url, options);
  };

  logger.log('[TWIST Firefox] Background wrapper initialized');
})();