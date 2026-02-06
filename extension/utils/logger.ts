/**
 * Logger utility for TWIST browser extension
 * Uses chrome.runtime APIs for production logging
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

interface LogConfig {
  enableDebug: boolean;
  sendToBackend: boolean;
}

class ExtensionLogger {
  private config: LogConfig;
  
  constructor() {
    this.config = {
      enableDebug: process.env.NODE_ENV === 'development',
      sendToBackend: process.env.NODE_ENV === 'production'
    };
  }

  private async log(level: LogLevel, message: string, data?: any): Promise<void> {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      url: window?.location?.href || 'background'
    };

    // In development, use console
    if (this.config.enableDebug || level === LogLevel.ERROR) {
      const consoleMethod = this.getConsoleMethod(level);
      consoleMethod(`[TWIST] ${message}`, data || '');
    }

    // In production, send to backend
    if (this.config.sendToBackend && chrome.runtime?.sendMessage) {
      try {
        await chrome.runtime.sendMessage({
          type: 'LOG_EVENT',
          payload: entry
        });
      } catch (e) {
        // Failed to send log - extension might be reloading
      }
    }
  }

  private getConsoleMethod(level: LogLevel): (...args: any[]) => void {
    switch (level) {
      case LogLevel.ERROR:
        return console.error.bind(console);
      case LogLevel.WARN:
        return console.warn.bind(console);
      case LogLevel.INFO:
        return console.info.bind(console);
      case LogLevel.DEBUG:
      default:
        return //.bind(console);
    }
  }

  debug(message: string, data?: any): void {
    if (this.config.enableDebug) {
      this.log(LogLevel.DEBUG, message, data);
    }
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: any): void {
    this.log(LogLevel.ERROR, message, {
      error: error?.message || error,
      stack: error?.stack
    });
  }
}

// Export singleton logger
export const logger = new ExtensionLogger();

// For content scripts that can't use chrome.runtime.sendMessage
export class ContentScriptLogger {
  private prefix = '[TWIST]';

  private shouldLog(): boolean {
    // Only log in development or for errors
    return process.env.NODE_ENV === 'development';
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog()) {
      logger.log(`${this.prefix} ${message}`, data || '');
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog()) {
      console.info(`${this.prefix} ${message}`, data || '');
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog()) {
      console.warn(`${this.prefix} ${message}`, data || '');
    }
  }

  error(message: string, error?: any): void {
    // Always log errors
    console.error(`${this.prefix} ${message}`, error || '');
  }
}

export const contentLogger = new ContentScriptLogger();