// config/cors.js
import logger from '../utils/logger.js';

/**
 * Dynamic CORS Configuration Manager
 * Advanced CORS configuration with security, monitoring, and dynamic updates
 */

class CORSManager {
  constructor() {
    this.allowedOrigins = this.initializeOrigins();
    this.whitelistCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    this.failedOrigins = new Set();
    this.stats = {
      allowedRequests: 0,
      blockedRequests: 0,
      preflightRequests: 0
    };
  }

  initializeOrigins() {
    const origins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
      : [];

    // Add localhost for development
    if (process.env.NODE_ENV === 'development') {
      const localOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001'
      ];

      localOrigins.forEach(origin => {
        if (!origins.includes(origin)) {
          origins.push(origin);
        }
      });
    }

    // Add mobile app origins if specified
    if (process.env.MOBILE_APP_ORIGINS) {
      process.env.MOBILE_APP_ORIGINS.split(',').forEach(origin => {
        const trimmed = origin.trim();
        if (trimmed && !origins.includes(trimmed)) {
          origins.push(trimmed);
        }
      });
    }

    logger.info(`CORS initialized with ${origins.length} allowed origin(s)`);
    if (origins.length > 0 && process.env.NODE_ENV === 'production') {
      logger.debug('Allowed origins:', origins);
    }

    return origins;
  }

  updateOrigins(newOrigins) {
    if (!Array.isArray(newOrigins)) {
      throw new Error('newOrigins must be an array');
    }

    this.allowedOrigins = newOrigins.map(origin => origin.trim()).filter(Boolean);
    this.whitelistCache.clear();
    logger.info(`CORS origins updated to ${this.allowedOrigins.length} entries`);

    return this.allowedOrigins;
  }

  addOrigin(origin) {
    const trimmed = origin.trim();
    if (!this.allowedOrigins.includes(trimmed)) {
      this.allowedOrigins.push(trimmed);
      this.whitelistCache.clear();
      logger.info(`Added new CORS origin: ${trimmed}`);
    }
    return this.allowedOrigins;
  }

  removeOrigin(origin) {
    const trimmed = origin.trim();
    const index = this.allowedOrigins.indexOf(trimmed);
    if (index > -1) {
      this.allowedOrigins.splice(index, 1);
      this.whitelistCache.clear();
      logger.info(`Removed CORS origin: ${trimmed}`);
    }
    return this.allowedOrigins;
  }

  isOriginAllowed(origin) {
    // Cache check
    if (this.whitelistCache.has(origin)) {
      const cached = this.whitelistCache.get(origin);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.allowed;
      }
    }

    // Block previously failed origins (temporarily)
    if (this.failedOrigins.has(origin)) {
      logger.warn(`Blocking previously failed origin: ${origin}`);
      return false;
    }

    let allowed = false;

    // Special cases
    if (!origin) {
      // In production, reject requests without origin (except for same-origin requests)
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Blocking request without origin in production');
        return false;
      }
      // In development, allow for tools like curl, postman
      allowed = process.env.NODE_ENV === 'development';
    } else if (this.allowedOrigins.includes(origin)) {
      allowed = true;
    } else if (process.env.NODE_ENV === 'development') {
      // In development, allow any localhost origin
      allowed = origin.includes('localhost') || origin.includes('127.0.0.1');
    }

    // Cache the result
    this.whitelistCache.set(origin, {
      allowed,
      timestamp: Date.now()
    });

    return allowed;
  }

  getCorsOptions() {
    return {
      origin: (origin, callback) => {
        this.stats.preflightRequests++;

        try {
          if (this.isOriginAllowed(origin)) {
            this.stats.allowedRequests++;
            callback(null, true);
          } else {
            this.stats.blockedRequests++;

            // Track failed origins (for monitoring)
            if (origin && process.env.NODE_ENV === 'production') {
              this.failedOrigins.add(origin);
              setTimeout(() => this.failedOrigins.delete(origin), 15 * 60 * 1000); // Clear after 15 minutes
            }

            logger.warn(`CORS blocked: ${origin || 'No origin'} (${this.allowedOrigins.length} allowed origins)`);
            callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
          }
        } catch (error) {
          logger.error('CORS origin check error:', error);
          this.stats.blockedRequests++;
          callback(new Error('CORS validation error'), false);
        }
      },
      credentials: true,
      methods: this.getAllowedMethods(),
      allowedHeaders: this.getAllowedHeaders(),
      exposedHeaders: this.getExposedHeaders(),
      maxAge: this.getMaxAge(),
      preflightContinue: false,
      optionsSuccessStatus: 200
    };
  }

  getAllowedMethods() {
    const defaultMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

    if (process.env.CORS_ALLOWED_METHODS) {
      return process.env.CORS_ALLOWED_METHODS.split(',').map(m => m.trim().toUpperCase());
    }

    return defaultMethods;
  }

  getAllowedHeaders() {
    const baseHeaders = [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin'
    ];

    const additionalHeaders = process.env.CORS_ALLOWED_HEADERS
      ? process.env.CORS_ALLOWED_HEADERS.split(',').map(h => h.trim())
      : [];

    // Security headers that should always be allowed
    const securityHeaders = [
      'X-CSRF-Token',
      'X-Request-Id',
      'X-Response-Time'
    ];

    return [...new Set([...baseHeaders, ...additionalHeaders, ...securityHeaders])];
  }

  getExposedHeaders() {
    // Minimal exposed headers for security
    const exposedHeaders = [
      'Content-Range',
      'X-Content-Range',
      'X-Total-Count',
      'X-Request-Id'
    ];

    // Only expose additional headers in development
    if (process.env.NODE_ENV === 'development') {
      exposedHeaders.push('X-Response-Time', 'X-Powered-By');
    }

    return exposedHeaders;
  }

  getMaxAge() {
    // Configurable maxAge with fallback
    const envMaxAge = parseInt(process.env.CORS_MAX_AGE, 10);

    if (!isNaN(envMaxAge) && envMaxAge > 0) {
      return envMaxAge;
    }

    return process.env.NODE_ENV === 'production' ? 86400 : 600; // 24h in production, 10min in dev
  }

  getStats() {
    return {
      ...this.stats,
      allowedOriginsCount: this.allowedOrigins.length,
      cacheSize: this.whitelistCache.size,
      failedOriginsCount: this.failedOrigins.size,
      timestamp: new Date().toISOString()
    };
  }

  clearCache() {
    const cleared = this.whitelistCache.size;
    this.whitelistCache.clear();
    logger.info(`Cleared CORS cache (${cleared} entries)`);
    return cleared;
  }
}

// Create singleton instance
const corsManager = new CORSManager();

// Export configuration and middleware
export const corsOptions = corsManager.getCorsOptions();
export const corsPreflight = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    corsManager.stats.preflightRequests++;

    // Validate preflight origin
    const origin = req.headers.origin;
    if (!corsManager.isOriginAllowed(origin) && process.env.NODE_ENV === 'production') {
      logger.warn(`Blocking preflight from unauthorized origin: ${origin}`);
      return res.status(403).json({
        success: false,
        message: 'CORS preflight not allowed'
      });
    }

    res.status(200).end();
    return;
  }
  next();
};

// Export manager for programmatic control
export { corsManager };

export default corsOptions;