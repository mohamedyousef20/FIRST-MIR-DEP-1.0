// middlewares/errorHandler.js
import jwt from 'jsonwebtoken';
import AppError from '../utils/appError.js';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';

/**
 * Error Categories for better error handling
 */
const ErrorCategory = {
  VALIDATION: 'VALIDATION',
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  DATABASE: 'DATABASE',
  NETWORK: 'NETWORK',
  BUSINESS_LOGIC: 'BUSINESS_LOGIC',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Error severity levels
 */
const ErrorSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Error Tracking Manager
 */
class ErrorTracker {
  constructor() {
    this.errorStats = new Map();
    this.errorRateLimit = {
      windowMs: 60 * 1000, // 1 minute
      maxErrors: 100,
      errors: [],
      lastCleanup: Date.now()
    };
  }

  shouldLogError(error) {
    this.cleanupOldErrors();

    const now = Date.now();
    this.errorRateLimit.errors.push(now);

    // Count errors in current window
    const recentErrors = this.errorRateLimit.errors.filter(
      time => now - time < this.errorRateLimit.windowMs
    );

    if (recentErrors.length > this.errorRateLimit.maxErrors) {
      logger.warn('Error rate limit exceeded, throttling error logging');
      return false;
    }

    return true;
  }

  cleanupOldErrors() {
    const now = Date.now();
    if (now - this.errorRateLimit.lastCleanup > this.errorRateLimit.windowMs) {
      this.errorRateLimit.errors = this.errorRateLimit.errors.filter(
        time => now - time < this.errorRateLimit.windowMs * 10
      );
      this.errorRateLimit.lastCleanup = now;
    }
  }

  trackError(error, category = ErrorCategory.UNKNOWN, severity = ErrorSeverity.MEDIUM) {
    const errorKey = `${category}:${error.name || 'UnknownError'}`;

    if (!this.errorStats.has(errorKey)) {
      this.errorStats.set(errorKey, {
        count: 0,
        firstOccurrence: new Date(),
        lastOccurrence: new Date(),
        category,
        severity
      });
    }

    const stats = this.errorStats.get(errorKey);
    stats.count++;
    stats.lastOccurrence = new Date();

    // Log error statistics periodically
    if (stats.count % 100 === 0) {
      logger.warn(`Error "${errorKey}" has occurred ${stats.count} times`);
    }

    return errorKey;
  }

  getErrorStats() {
    return Array.from(this.errorStats.entries()).map(([key, stats]) => ({
      key,
      ...stats
    }));
  }
}

// Initialize error tracker
const errorTracker = new ErrorTracker();

/**
 * Sanitize error for logging (remove sensitive data)
 */
const sanitizeError = (error) => {
  if (!error) {
    return { message: 'Unknown error' };
  }

  const sanitized = {
    name: error.name,
    message: error.message,
    code: error.code,
    statusCode: error.statusCode
  };

  // Remove sensitive data from error message
  if (error.message && config.env === 'production') {
    // Remove MongoDB URIs
    sanitized.message = error.message.replace(
      /mongodb(\+srv)?:\/\/(.*?):(.*?)@/g,
      'mongodb$1://***:***@'
    );

    // Remove Redis URIs
    sanitized.message = sanitized.message.replace(
      /redis(s)?:\/\/(.*?):(.*?)@/g,
      'redis$1://***:***@'
    );

    // Remove JWT tokens
    sanitized.message = sanitized.message.replace(
      /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
      '[JWT_TOKEN]'
    );

    // Remove email addresses
    sanitized.message = sanitized.message.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[EMAIL]'
    );

    // Remove phone numbers
    sanitized.message = sanitized.message.replace(
      /(?:\+?[\d\s\-\(\)]{7,}\d)/g,
      '[PHONE]'
    );
  }

  // Add stack trace only in development
  if (config.env === 'development') {
    sanitized.stack = error.stack;
  }

  return sanitized;
};

/**
 * Error handlers for specific error types
 */
const handleCastErrorDB = (err) => {
  const message = `Invalid value for ${err.path}: ${err.value}`;
  const error = new AppError(message, 400);
  error.category = ErrorCategory.VALIDATION;
  error.severity = ErrorSeverity.LOW;
  return error;
};

const handleDuplicateFieldsDB = (err) => {
  // Use err.keyValue for MongoDB driver v4+
  const duplicateField = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
  const duplicateValue = err.keyValue ? err.keyValue[duplicateField] : 'value';

  const message = `Duplicate value for ${duplicateField}: ${duplicateValue}. Please use another value.`;
  const error = new AppError(message, 409); // 409 Conflict
  error.category = ErrorCategory.VALIDATION;
  error.severity = ErrorSeverity.MEDIUM;
  return error;
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Validation failed: ${errors.join('. ')}`;
  const error = new AppError(message, 422); // 422 Unprocessable Entity
  error.category = ErrorCategory.VALIDATION;
  error.severity = ErrorSeverity.MEDIUM;
  return error;
};

const handleMongoNetworkError = (err) => {
  const message = `Database connection error: ${err.message}`;
  const error = new AppError(message, 503); // 503 Service Unavailable
  error.category = ErrorCategory.NETWORK;
  error.severity = ErrorSeverity.HIGH;
  return error;
};

const handleMongoTimeoutError = (err) => {
  const message = `Database operation timed out: ${err.message}`;
  const error = new AppError(message, 504); // 504 Gateway Timeout
  error.category = ErrorCategory.NETWORK;
  error.severity = ErrorSeverity.MEDIUM;
  return error;
};

const handleJWTError = (err) => {
  const message = 'Invalid authentication token. Please log in again.';
  const error = new AppError(message, 401);
  error.category = ErrorCategory.AUTHENTICATION;
  error.severity = ErrorSeverity.MEDIUM;

  // Log additional details for security monitoring
  logger.warn(`JWT error: ${err.message}`, {
    type: err.name,
    timestamp: new Date().toISOString()
  });

  return error;
};

const handleJWTExpiredError = (err) => {
  const message = 'Your session has expired. Please log in again.';
  const error = new AppError(message, 401);
  error.category = ErrorCategory.AUTHENTICATION;
  error.severity = ErrorSeverity.LOW;
  return error;
};

const handleRateLimitError = (err) => {
  const message = `Too many requests. Please try again later. Retry after: ${err.retryAfter || 'unknown'} seconds`;
  const error = new AppError(message, 429); // 429 Too Many Requests
  error.category = ErrorCategory.BUSINESS_LOGIC;
  error.severity = ErrorSeverity.LOW;
  return error;
};

/**
 * Socket.IO error handler
 */
export const socketErrorHandler = (socket, error) => {
  const sanitizedError = sanitizeError(error);

  // Track socket errors separately
  errorTracker.trackError(error, ErrorCategory.NETWORK, ErrorSeverity.MEDIUM);

  // Determine error message for client
  let clientMessage = 'An error occurred';
  let clientCode = 'INTERNAL_ERROR';

  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    clientMessage = 'Authentication failed';
    clientCode = 'AUTH_ERROR';
  } else if (error.message.includes('rate limit')) {
    clientMessage = 'Rate limit exceeded';
    clientCode = 'RATE_LIMIT';
  }

  // Send error to client
  socket.emit('error', {
    success: false,
    message: clientMessage,
    code: clientCode,
    timestamp: new Date().toISOString()
  });

  // Log the error
  logger.error('Socket error:', {
    socketId: socket.id,
    userId: socket.user?.id,
    error: sanitizedError.message,
    code: sanitizedError.code
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404);
  error.category = ErrorCategory.BUSINESS_LOGIC;
  error.severity = ErrorSeverity.LOW;
  next(error);
};

/**
 * Error response formatter
 */
const formatErrorResponse = (error, includeDetails = false) => {
  const response = {
    success: false,
    message: error.message || 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    requestId: error.requestId || null
  };

  // Add error code if available
  if (error.code) {
    response.code = error.code;
  }

  // Add error category for debugging
  if (error.category && config.env === 'development') {
    response.category = error.category;
  }

  // Add additional details in development
  if (includeDetails && config.env === 'development') {
    response.stack = error.stack;
    response.details = error.details;
  }

  // Add retry information for rate limiting
  if (error.statusCode === 429 && error.retryAfter) {
    response.retryAfter = error.retryAfter;
  }

  return response;
};

/**
 * Development error response
 */
const sendErrorDev = (error, req, res) => {
  // Track the error
  errorTracker.trackError(
    error,
    error.category || ErrorCategory.UNKNOWN,
    error.severity || ErrorSeverity.MEDIUM
  );

  // Log the error
  if (errorTracker.shouldLogError(error)) {
    const sanitizedError = sanitizeError(error);
    logger.error('Error:', {
      method: req.method,
      path: req.path,
      statusCode: error.statusCode,
      error: sanitizedError.message,
      stack: sanitizedError.stack,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  }

  res.status(error.statusCode || 500).json(formatErrorResponse(error, true));
};

/**
 * Production error response
 */
const sendErrorProd = (error, req, res) => {
  // Track the error
  const errorKey = errorTracker.trackError(
    error,
    error.category || ErrorCategory.UNKNOWN,
    error.severity || ErrorSeverity.MEDIUM
  );

  // Log operational errors at info level, others at error level
  const sanitizedError = sanitizeError(error);

  if (error.isOperational) {
    logger.info('Operational error:', {
      method: req.method,
      path: req.path,
      statusCode: error.statusCode,
      error: sanitizedError.message,
      errorKey,
      ip: req.ip
    });
  } else {
    // Critical errors - send alert (in production you'd integrate with monitoring system)
    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.HIGH) {
      logger.alert('CRITICAL ERROR:', {
        method: req.method,
        path: req.path,
        statusCode: error.statusCode,
        error: sanitizedError.message,
        errorKey,
        ip: req.ip
      });
    } else {
      logger.error('Programmatic error:', {
        method: req.method,
        path: req.path,
        statusCode: error.statusCode,
        error: sanitizedError.message,
        errorKey,
        ip: req.ip
      });
    }
  }

  // Send response to client
  if (error.isOperational) {
    // Known operational error
    res.status(error.statusCode || 500).json(formatErrorResponse(error, false));
  } else {
    // Unknown error - don't leak details
    res.status(500).json({
      success: false,
      message: 'An internal server error occurred',
      timestamp: new Date().toISOString(),
      requestId: error.requestId || null
    });
  }
};

/**
 * Main error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Set default values
  err.statusCode = Number(err.statusCode) || 500;
  err.status = err.status || 'error';
  err.message = err.message || 'error';
  err.requestId = req.id || req.headers['x-request-id'];

  // Create a proper copy of the error preserving prototype chain
  let error = Object.create(Object.getPrototypeOf(err));
  Object.assign(error, err);
  error.message = err.message;

  // Handle specific error types
  if (error.name === 'CastError') {
    error = handleCastErrorDB(error);
  }

  if (error.code === 11000) {
    error = handleDuplicateFieldsDB(error);
  }

  if (error.name === 'ValidationError') {
    error = handleValidationErrorDB(error);
  }

  if (error.name === 'JsonWebTokenError') {
    error = handleJWTError(error);
  }

  if (error.name === 'TokenExpiredError') {
    error = handleJWTExpiredError(error);
  }

  if (error.name === 'MongoNetworkError') {
    error = handleMongoNetworkError(error);
  }

  if (error.name === 'MongoTimeoutError') {
    error = handleMongoTimeoutError(error);
  }

  if (error.statusCode === 429) {
    error = handleRateLimitError(error);
  }

  // Determine if error is operational
  error.isOperational = error.isOperational !== undefined
    ? error.isOperational
    : (error.statusCode < 500);

  // Send appropriate response based on environment
  if (config.env === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

/**
 * Global error monitoring endpoint (for admin/stats)
 */
export const errorStatsHandler = (req, res) => {
  if (config.env !== 'development' && req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  const stats = errorTracker.getErrorStats();

  res.status(200).json({
    success: true,
    data: {
      totalErrors: stats.reduce((sum, s) => sum + s.count, 0),
      stats: stats.sort((a, b) => b.count - a.count),
      rateLimit: {
        currentErrors: errorTracker.errorRateLimit.errors.length,
        maxErrors: errorTracker.errorRateLimit.maxErrors,
        windowMs: errorTracker.errorRateLimit.windowMs
      }
    }
  });
};

/**
 * Graceful error handler for async functions
 */
export const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Initialize error monitoring
 */
export const initializeErrorMonitoring = (app) => {
  // Add error stats endpoint
  app.get('/api/admin/errors/stats', errorStatsHandler);

  // Global error handler
  app.use(errorHandler);

  logger.info('Error monitoring system initialized');
};

// Export error tracker for external use
export { errorTracker, ErrorCategory, ErrorSeverity };