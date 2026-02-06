/**
 * Logger utility for TWIST blockchain bots
 * In production, this should send logs to a monitoring service
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  bot: string;
  message: string;
  data?: any;
}

export class BotLogger {
  constructor(private botName: string) {}

  private log(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      bot: this.botName,
      message,
      data
    };

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Send to monitoring service via structured logging
      this.sendToMonitoring(entry);
    } else {
      // In development, use console
      const prefix = `[${entry.timestamp.toISOString()}] [${entry.level}] [${entry.bot}]`;
      
      switch (level) {
        case LogLevel.ERROR:
          console.error(prefix, message, data || '');
          break;
        case LogLevel.WARN:
          console.warn(prefix, message, data || '');
          break;
        case LogLevel.INFO:
          console.info(prefix, message, data || '');
          break;
        case LogLevel.DEBUG:
          if (process.env.DEBUG) {
            logger.log(prefix, message, data || '');
          }
          break;
      }
    }
  }

  private sendToMonitoring(entry: LogEntry): void {
    // Monitoring service integration
    // In production, this would send to CloudWatch, Datadog, etc.
    // For now, we'll just use a placeholder
    
    // Example: Send to CloudWatch
    // await cloudwatch.putLogEvents({
    //   logGroupName: '/aws/lambda/twist-bots',
    //   logStreamName: entry.bot,
    //   logEvents: [{
    //     timestamp: entry.timestamp.getTime(),
    //     message: JSON.stringify(entry)
    //   }]
    // });
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
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

// Export singleton loggers for each bot
export const buybackLogger = new BotLogger('BuybackBot');
export const marketMakerLogger = new BotLogger('MarketMakerBot');
export const volumeTrackerLogger = new BotLogger('VolumeTracker');
export const arbitrageMonitorLogger = new BotLogger('ArbitrageMonitor');