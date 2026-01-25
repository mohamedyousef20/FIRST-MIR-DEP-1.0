import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

export const clientErrorlogger = async (req, res) => {
  try {
    const { message, stack, componentStack, url, userAgent, timestamp } = req.body || {};

    const logEntry = {
      message,
      stack,
      componentStack,
      url,
      userAgent,
      timestamp: timestamp || new Date().toISOString(),
      ip: req.ip,
      requestId: req.requestId,
    };

    // Write to central logger (console/file)
    logger.error('[CLIENT_ERROR]', logEntry);

    // Persist to file in production (append JSON line)
    if (process.env.NODE_ENV === 'production') {
      const filePath = path.join(logsDir, `client-errors-${new Date().toISOString().slice(0, 10)}.log`);
      fs.appendFileSync(filePath, JSON.stringify(logEntry) + '\n');
    }

    return res.status(204).end();
  } catch (err) {
    logger.error('Failed to log client error', err);
    return res.status(500).json({ success: false, message: 'Failed to log error' });
  }
};
