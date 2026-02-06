/**
 * Logger utility for VAU Processor Worker
 */

export class WorkerLogger {
  private serviceName = 'VAUProcessor';
  
  private log(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      data
    };

    // In production, send to monitoring service
    // For Cloudflare Workers, we can use structured logging
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      logger.log(`[${timestamp}] [${level}] ${message}`, data || '');
    } else {
      // In production, emit structured logs
      // Cloudflare Workers will capture these
      logger.log(JSON.stringify(logEntry));
    }
  }

  info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  error(message: string, error?: any): void {
    this.log('ERROR', message, {
      error: error?.message || error,
      stack: error?.stack
    });
  }

  debug(message: string, data?: any): void {
    if (typeof process !== 'undefined' && process.env?.DEBUG) {
      this.log('DEBUG', message, data);
    }
  }
}

export const logger = new WorkerLogger();