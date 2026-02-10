import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import express from 'express';
import cors from 'cors';
const { Request, Response, NextFunction } = express;
import { redis } from '../config/redis-client.js';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';

// Security headers middleware
export const securityHeaders = [
  // Set security HTTP headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'trusted.cdn.com'],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    referrerPolicy: { policy: 'same-origin' },
  }),
  // Prevent XSS attacks
  // Prevent NoSQL injection
  mongoSanitize(),
  // Prevent HTTP Parameter Pollution
  hpp({
    whitelist: [
      'duration',
      'ratingsQuantity',
      'ratingsAverage',
      'maxGroupSize',
      'difficulty',
      'price',
    ],
  }),
];

// Rate limiting with Redis store
const createRateLimiter = (windowMs, max, message, options = {}) => {
  const { skipOnDev = false, keyGenerator, skip } = options;

  // Get whitelisted IPs
  const getWhitelistedIPs = () => {
    const whitelist = ['127.0.0.1', '::1'];
    if (process.env.RATE_LIMIT_WHITELIST) {
      whitelist.push(...process.env.RATE_LIMIT_WHITELIST.split(','));
    }
    return whitelist;
  };

  const whitelist = getWhitelistedIPs();

  if (skipOnDev && process.env.NODE_ENV === 'development') {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs,
    max,
    message: { success: false, message },
    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: keyGenerator || ((req) => req.ip),

    skip: (req) => {
      if (whitelist.includes(req.ip)) return true;
      if (typeof skip === 'function') return skip(req);
      return false;
    },

    ...(process.env.NODE_ENV === 'production' && redis?.client?.isReady
      ? {
        store: new RedisStore({
          sendCommand: (...args) => redis.sendCommand(...args),
          prefix: 'rate:',
        }),
      }
      : {}),
  });
};

// Modified createRateLimiter function
const createRateLimiterModified = (windowMs, max, message, options = {}) => {
  const { skipOnDev = false, keyGenerator, skip } = options;

  // Get whitelisted IPs
  const getWhitelistedIPs = () => {
    const whitelist = ['127.0.0.1', '::1'];
    if (process.env.RATE_LIMIT_WHITELIST) {
      whitelist.push(...process.env.RATE_LIMIT_WHITELIST.split(','));
    }
    return whitelist;
  };

  const whitelist = getWhitelistedIPs();

  if (skipOnDev && process.env.NODE_ENV === 'development') {
    return (req, res, next) => next();
  }

  let store = {};
  if (process.env.NODE_ENV === 'production' && redis?.client?.isReady) {
    try {
      store = new RedisStore({
        sendCommand: (...args) => redis.sendCommand(...args),
        prefix: 'rate:',
      });
    } catch (e) {
      console.warn('Failed to create RedisStore, falling back to memory:', e.message);
    }
  }

  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: keyGenerator || ((req) => req.ip),

    skip: (req) => {
      if (whitelist.includes(req.ip)) return true;
      if (typeof skip === 'function') return skip(req);
      return false;
    },

    ...(Object.keys(store).length ? { store } : {}),
  });
};

// Generic API rate limiter
export const apiLimiter = createRateLimiterModified(
  15 * 60 * 1000, // 15 minutes
  100, // Limit each IP to 100 requests per window
  'Too many requests from this IP, please try again after 15 minutes',
  { skipOnDev: true }
);

// Authentication rate limiters
export const authLimiter = createRateLimiterModified(
  60 * 60 * 1000, // 1 hour
  5, // Limit each IP to 5 login attempts per hour
  'Too many login attempts, please try again after an hour'
);

export const strictAuthLimiter = createRateLimiterModified(
  15 * 60 * 1000, // 15 minutes
  3, // Limit each IP to 3 attempts per 15 minutes
  'Too many attempts, please try again after 15 minutes'
);

// User-specific rate limiter (for authenticated users)
export const userLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  50, // Limit each user to 50 requests per window
  'Too many requests from this account, please try again after 15 minutes',
  {
    keyGenerator: (req) => req.user ? `user:${req.user.id}` : req.ip
  }
);

// Admin/sensitive endpoints rate limiter
export const adminLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  30, // Limit each IP to 30 requests per window
  'Too many requests to admin endpoints',
  {
    skip: (req) => {
      // Only apply to admin endpoints
      if (!req.path.includes('/admin')) return true;

      // Whitelist admin IPs
      const adminIPs = ['127.0.0.1', '::1'];
      if (process.env.ADMIN_IPS) {
        adminIPs.push(...process.env.ADMIN_IPS.split(','));
      }
      return adminIPs.includes(req.ip);
    }
  }
);

// Public API limiter (for external APIs)
export const publicApiLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  1000, // More generous limit for public APIs
  'API rate limit exceeded, please try again later'
);

// XSS Protection middleware
export const xssProtection = (req, res, next) => {
  // Sanitize request body, query, and params
  const sanitize = (data) => {
    if (!data) return data;

    if (typeof data === 'string') {
      // Strip only characters that can introduce HTML/script while keeping URL-safe symbols
      return data.replace(/[<>\"\'`]/g, '');
    }

    if (Array.isArray(data)) {
      return data.map(sanitize);
    }

    if (typeof data === 'object') {
      const sanitized = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          sanitized[key] = sanitize(data[key]);
        }
      }
      return sanitized;
    }

    return data;
  };

  // Apply sanitization
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
};

// CORS configuration - تصدير فقط الإعدادات، بدون middleware
export const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : [];

    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Allow all origins in development
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // Allow specific origins in production
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Log CORS violations
    logger.warn(`CORS violation: ${origin} not allowed`);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'x-access-token',
    'x-refresh-token',
    'x-api-key',
  ],
  exposedHeaders: [
    'Content-Range',
    'X-Content-Range',
    'X-Total-Count',
    'X-Request-Id',
    'X-Response-Time',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Dynamic CORS for specific routes
export const dynamicCors = (options = {}) => {
  return (req, res, next) => {
    const routeSpecificOptions = {
      ...corsOptions,
      ...options,
    };

    // Apply CORS middleware dynamically
    cors(routeSpecificOptions)(req, res, next);
  };
};

// Request validation middleware
export const validateRequest = (req, res, next) => {
  // Check for common attack patterns
  const attackPatterns = [
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /eval\(/gi,
    /union\s+select/gi,
    /drop\s+table/gi,
    /insert\s+into/gi,
    /select\s+from/gi,
    /delete\s+from/gi,
  ];

  const checkData = (data, path = '') => {
    if (typeof data === 'string') {
      for (const pattern of attackPatterns) {
        if (pattern.test(data)) {
          throw new Error(`Potential attack detected in ${path}`);
        }
      }
    } else if (Array.isArray(data)) {
      data.forEach((item, index) => checkData(item, `${path}[${index}]`));
    } else if (typeof data === 'object' && data !== null) {
      Object.keys(data).forEach(key => {
        checkData(data[key], `${path}.${key}`);
      });
    }
  };

  try {
    if (req.body) checkData(req.body, 'body');
    if (req.query) checkData(req.query, 'query');
    if (req.params) checkData(req.params, 'params');
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid request data',
      message: error.message,
    });
  }
};

// Request ID middleware for tracing
export const requestId = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  res.setHeader('X-Request-Id', req.requestId);
  next();
};

// Security response headers
export const securityResponseHeaders = (req, res, next) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Cache control for sensitive data
  if (req.path.includes('/auth') || req.path.includes('/admin')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};

// Apply all security middleware (بدون CORS)
export const applySecurityMiddleware = (app) => {
  // Request ID for tracing
  app.use(requestId);

  // Security headers (لا تحتوي على CORS)
  app.use(securityHeaders);

  // Security response headers
  app.use(securityResponseHeaders);

  // Apply rate limiting
  // Global API limiter for all routes under /api
  app.use('/api', apiLimiter);

  // Public API routes
  app.use('/api/v1/public', publicApiLimiter);

  // Authentication endpoints
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
  app.use('/api/v1/auth/forgot-password', strictAuthLimiter);
  app.use('/api/v1/auth/reset-password', strictAuthLimiter);
  app.use('/api/v1/auth/verify-email', strictAuthLimiter);

  // User-specific endpoints
  app.use('/api/v1/users/:id/*', userLimiter);

  // Admin endpoints
  app.use('/api/v1/admin', adminLimiter);

  // Body parsing with limits
  app.use(express.json({
    limit: config.maxRequestSize || '1mb',
    verify: (req, res, buf, encoding) => {
      // Check for JSON parsing errors
      try {
        JSON.parse(buf);
      } catch (e) {
        throw new Error('Invalid JSON');
      }
    }
  }));

  app.use(express.urlencoded({
    extended: true,
    limit: config.maxRequestSize || '1mb',
    parameterLimit: 50 // Limit number of parameters
  }));

  // Request validation
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return validateRequest(req, res, next);
    }
    next();
  });



  // Data sanitization
  app.use(xssProtection);

  // Prevent parameter pollution
  app.use(hpp());

  // Add request time and additional metadata
  app.use((req, res, next) => {
    req.requestTime = new Date().toISOString();
    req.userAgent = req.headers['user-agent'] || 'Unknown';
    req.clientIp = req.ip || req.connection.remoteAddress;

    // Log security-related info in production
    if (process.env.NODE_ENV === 'production') {
      logger.info(`[Security] ${req.requestTime} - ${req.method} ${req.path} - IP: ${req.clientIp} - UA: ${req.userAgent.substring(0, 100)}`);
    }

    next();
  });
};

// Export security utilities
export const securityUtils = {
  // Check if IP is whitelisted
  isWhitelisted: (ip) => {
    const whitelist = ['127.0.0.1', '::1'];
    if (process.env.RATE_LIMIT_WHITELIST) {
      whitelist.push(...process.env.RATE_LIMIT_WHITELIST.split(','));
    }
    return whitelist.includes(ip);
  },

  // Generate secure random token
  generateSecureToken: (length = 32) => {
    return require('crypto').randomBytes(length).toString('hex');
  },

  // Validate secure token
  validateToken: (token, minLength = 32) => {
    if (!token || token.length < minLength) return false;
    // Check for common insecure patterns
    const insecurePatterns = [
      /^[0-9]+$/, // Only numbers
      /^[a-z]+$/i, // Only letters
      /admin/i,
      /password/i,
      /123456/,
      /qwerty/,
    ];

    return !insecurePatterns.some(pattern => pattern.test(token));
  },
};

// Default export
export default {
  securityHeaders,
  apiLimiter,
  authLimiter,
  strictAuthLimiter,
  userLimiter,
  adminLimiter,
  publicApiLimiter,
  xssProtection,
  corsOptions,
  dynamicCors,
  validateRequest,
  requestId,
  securityResponseHeaders,
  applySecurityMiddleware,
  securityUtils,
};
