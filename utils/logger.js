import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const devFormat = winston.format.printf(
  ({ timestamp, level, message, ...meta }) => {
    let extra = '';

    // case: logger.info("msg", "value")
    if (meta[0]) {
      extra = String(meta[0]);
    }

    // case: logger.info("msg", { key: value })
    else if (Object.keys(meta).length) {
      extra = JSON.stringify(meta);
    }

    return `${timestamp} ${level}: ${message}${extra ? ' ' + extra : ''}`;
  }
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format:
    process.env.NODE_ENV === 'production'
      ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
      : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.splat(),
        devFormat
      ),
  transports: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === 'production'
      ? [
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          level: 'error',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '30d'
        }),
        new DailyRotateFile({
          filename: 'logs/combined-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '14d'
        })
      ]
      : [])
  ]
});

export default logger;
