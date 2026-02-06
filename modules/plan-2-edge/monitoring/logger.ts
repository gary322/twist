/**
 * Logger utility for Edge Monitoring
 */

export class EdgeMonitoringLogger {
  private serviceName = 'EdgeMonitoring';
  
  private log(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      data
    };

    if (process.env.NODE_ENV === 'production') {
      // In production, send to monitoring service
      process.stdout.write(JSON.stringify(logEntry) + '\n');
    } else {
      // In development, use console with formatting
      const prefix = `[${timestamp}] [${level}] [${this.serviceName}]`;
      const method = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
      console[method](prefix, message, data || '');
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
    if (process.env.DEBUG) {
      this.log('DEBUG', message, data);
    }
  }
}

export const logger = new EdgeMonitoringLogger();