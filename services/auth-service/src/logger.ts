import winston from 'winston';

export function createLogger(level: string): winston.Logger {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports: [new winston.transports.Console()],
  });
}

