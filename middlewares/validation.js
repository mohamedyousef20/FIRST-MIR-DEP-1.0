import { body, query, param, validationResult } from 'express-validator';
import xss from 'xss';
import { createError } from '../utils/error.js';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';
import mongoose from 'mongoose';
import mime from 'mime-types';
import { redis } from '../config/redis-client.js';

// Common validation rules
export const commonRules = {
  // Email validation
  email: body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage('Email must be less than 100 characters'),

  // Password validation with security requirements
  password: body('password')
    .isLength({ min: 8, max: 100 })
    .withMessage('Password must be between 8 and 100 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage('Password must contain at least one special character')
    .custom((value, { req }) => {
      // Prevent common passwords
      const commonPasswords = [
        'password', '12345678', 'qwerty123', 'admin123',
        'welcome123', 'password123', 'abc123456'
      ];

      if (commonPasswords.includes(value.toLowerCase())) {
        throw new Error('Password is too common. Please choose a stronger password.');
      }

      return true;
    }),

  // MongoDB ObjectId validation
  mongoId: (field = 'id') =>
    param(field)
      .isMongoId()
      .withMessage('Invalid ID format')
      .customSanitizer(value => {
        try {
          return new mongoose.Types.ObjectId(value);
        } catch (error) {
          return value;
        }
      }),

  // Pagination validation
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt()
      .default(1),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt()
      .default(20),
    query('sort')
      .optional()
      .trim()
      .escape()
      .isIn(['asc', 'desc', '1', '-1'])
      .withMessage('Sort must be either asc or desc')
  ],

  // Phone number validation (Egyptian format)
  phone: body('phone')
    .optional()
    .trim()
    .matches(/^01[0125][0-9]{8}$/)
    .withMessage('Please provide a valid Egyptian phone number'),

  // URL validation
  url: (field) =>
    body(field)
      .optional()
      .trim()
      .isURL({
        protocols: ['http', 'https'],
        require_protocol: true,
        require_valid_protocol: true
      })
      .withMessage('Please provide a valid URL with http or https protocol')
      .isLength({ max: 500 })
      .withMessage('URL must be less than 500 characters'),

  // Text validation with length limits
  text: (field, maxLength = 500) =>
    body(field)
      .optional()
      .trim()
      .isLength({ max: maxLength })
      .withMessage(`${field} must be less than ${maxLength} characters`),

  // Number validation with range
  number: (field, min = 0, max = 1000000) =>
    body(field)
      .optional()
      .isFloat({ min, max })
      .withMessage(`${field} must be between ${min} and ${max}`)
      .toFloat(),

  // Array validation
  array: (field, minItems = 0, maxItems = 100) =>
    body(field)
      .optional()
      .isArray({ min: minItems, max: maxItems })
      .withMessage(`${field} must be an array with ${minItems} to ${maxItems} items`),

  // Boolean validation
  boolean: (field) =>
    body(field)
      .optional()
      .isBoolean()
      .withMessage(`${field} must be a boolean value`)
      .toBoolean(),

  // Date validation
  date: (field) =>
    body(field)
      .optional()
      .isISO8601()
      .withMessage(`${field} must be a valid date in ISO8601 format`)
      .toDate(),

  // File validation for multer
  file: (field, allowedTypes = ['image/jpeg', 'image/png', 'image/gif'], maxSize = 5 * 1024 * 1024) =>
    body(field)
      .custom((value, { req }) => {
        if (!req.file) {
          return true; // Optional file
        }

        // Check file size
        if (req.file.size > maxSize) {
          throw new Error(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
        }

        // Check file type
        const mimeType = mime.lookup(req.file.originalname) || req.file.mimetype;
        if (!allowedTypes.includes(mimeType)) {
          throw new Error(`File type must be one of: ${allowedTypes.join(', ')}`);
        }

        return true;
      })
};

// Advanced sanitization functions
export const sanitize = {
  // HTML sanitization with xss
  html: (field) =>
    body(field)
      .optional()
      .customSanitizer(value => xss(value, {
        whiteList: {}, // Empty whitelist means no HTML is allowed
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'style']
      })),

  // Trim and escape for basic text
  text: (field) =>
    body(field)
      .optional()
      .trim()
      .escape(),

  // Email sanitization
  email: (field) =>
    body(field)
      .optional()
      .trim()
      .toLowerCase()
      .normalizeEmail(),

  // URL sanitization
  url: (field) =>
    body(field)
      .optional()
      .trim()
      .escape(),

  // Phone number sanitization
  phone: (field) =>
    body(field)
      .optional()
      .trim()
      .escape()
};

// Custom validation functions
export const customValidators = {
  // Check if field value is unique in database
  unique: (model, field, message = 'This value already exists') =>
    body(field)
      .custom(async (value) => {
        const Model = (await import(`../models/${model}.model.js`)).default;
        const exists = await Model.exists({ [field]: value });
        if (exists) {
          throw new Error(message);
        }
        return true;
      }),

  // Check if referenced document exists
  exists: (model, field, message = 'Referenced document does not exist') =>
    body(field)
      .custom(async (value) => {
        if (!value) return true;

        const Model = (await import(`../models/${model}.model.js`)).default;
        const exists = await Model.exists({ _id: value });
        if (!exists) {
          throw new Error(message);
        }
        return true;
      }),

  // Compare two fields (e.g., password confirmation)
  equals: (field, compareField, message = 'Fields do not match') =>
    body(field)
      .custom((value, { req }) => {
        if (value !== req.body[compareField]) {
          throw new Error(message);
        }
        return true;
      }),

  // Validate array of ObjectIds
  objectIdArray: (field, message = 'Invalid IDs in array') =>
    body(field)
      .optional()
      .isArray()
      .withMessage(`${field} must be an array`)
      .custom((value) => {
        return value.every(id => mongoose.Types.ObjectId.isValid(id));
      })
      .withMessage(message),

  // Validate enum values
  enum: (field, values, message = `Must be one of: ${values.join(', ')}`) =>
    body(field)
      .optional()
      .isIn(values)
      .withMessage(message),

  // Validate nested objects
  nested: (field, schema) =>
    body(field)
      .optional()
      .custom((value) => {
        const { error } = schema.validate(value, { abortEarly: false });
        if (error) {
          throw new Error(error.details.map(detail => detail.message).join(', '));
        }
        return true;
      })
};

// Rate limiting for failed validation attempts
const failedValidationLimiter = async (req, ip) => {
  if (!redis || config.isDevelopment) {
    return false;
  }

  const key = `validation_failed:${ip}`;
  const attempts = await redis.incr(key);

  if (attempts === 1) {
    await redis.expire(key, 900); // 15 minutes
  }

  if (attempts > 10) {
    logger.warn('Excessive validation failures detected', {
      ip,
      path: req.path,
      attempts
    });
    return true;
  }

  return false;
};

// Main validation middleware
export const validate = (validations, options = {}) => {
  const {
    sanitizeInput = true,
    rateLimit = true,
    stripUnknown = true
  } = options;

  return async (req, res, next) => {
    try {
      // Add sanitization if enabled
      const allValidations = [...validations];

      if (sanitizeInput) {
        // Automatically sanitize all string fields in body
        Object.keys(req.body).forEach(field => {
          if (typeof req.body[field] === 'string') {
            req.body[field] = xss(req.body[field].trim(), {
              whiteList: {},
              stripIgnoreTag: true
            });
          }
        });
      }

      // Run all validations
      await Promise.all(allValidations.map(validation => validation.run(req)));

      // Check for validation errors
      const errors = validationResult(req);

      if (errors.isEmpty()) {
        // Reset failed validation counter on success
        if (redis && rateLimit) {
          await redis.del(`validation_failed:${req.ip}`);
        }

        // Strip unknown fields if enabled
        if (stripUnknown && req.body) {
          const allowedFields = new Set();
          validations.forEach(validation => {
            const field = validation.builder.fields[0];
            if (field) {
              allowedFields.add(field);
            }
          });

          const filteredBody = {};
          Object.keys(req.body).forEach(key => {
            if (allowedFields.has(key)) {
              filteredBody[key] = req.body[key];
            }
          });

          req.body = filteredBody;
        }

        return next();
      }

      // Apply rate limiting for failed validations
      if (rateLimit && redis) {
        const shouldBlock = await failedValidationLimiter(req, req.ip);
        if (shouldBlock) {
          return next(createError(429, 'Too many failed validation attempts. Please try again later.'));
        }
      }

      // Format errors (hide sensitive data in production)
      const formattedErrors = errors.array().map(error => {
        const formattedError = {
          field: error.param,
          message: error.msg,
          location: error.location
        };

        // Only include value in development
        if (config.isDevelopment) {
          formattedError.value = error.value;
        } else if (['password', 'token', 'secret', 'creditCard'].some(sensitive =>
          error.param.toLowerCase().includes(sensitive))) {
          formattedError.value = '[REDACTED]';
        }

        return formattedError;
      });

      // Log validation failure (without sensitive data)
      logger.warn('Validation failed', {
        path: req.path,
        ip: req.ip,
        method: req.method,
        errorCount: formattedErrors.length,
        fields: formattedErrors.map(e => e.field)
      });

      next(createError(400, 'Validation failed', {
        errors: formattedErrors,
        message: 'Please check your input and try again.'
      }));

    } catch (error) {
      logger.error('Validation middleware error', {
        error: error.message,
        path: req.path,
        ip: req.ip
      });

      next(createError(500, 'Validation error occurred'));
    }
  };
};

// Specific validation chains for common use cases
export const validateAuth = {
  register: [
    commonRules.email,
    commonRules.password,
    body('firstName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z\u0600-\u06FF\s]+$/)
      .withMessage('First name can only contain letters and spaces'),
    body('lastName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z\u0600-\u06FF\s]+$/)
      .withMessage('Last name can only contain letters and spaces'),
    commonRules.phone,
    body('role')
      .optional()
      .isIn(['user', 'seller'])
      .withMessage('Role must be either user or seller')
      .default('user')
  ],

  login: [
    commonRules.email,
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],

  forgotPassword: [
    commonRules.email
  ],

  resetPassword: [
    commonRules.password,
    body('confirmPassword')
      .notEmpty()
      .withMessage('Confirm password is required')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Passwords do not match');
        }
        return true;
      })
  ]
};

export const validateProduct = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Product name must be between 3 and 200 characters'),
    body('description')
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Description must be between 10 and 2000 characters'),
    body('price')
      .isFloat({ min: 0.01, max: 1000000 })
      .withMessage('Price must be between 0.01 and 1,000,000')
      .toFloat(),
    body('stock')
      .isInt({ min: 0 })
      .withMessage('Stock must be a non-negative integer')
      .toInt(),
    body('category')
      .isMongoId()
      .withMessage('Invalid category ID'),
    body('images')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Maximum 10 images allowed'),
    body('tags')
      .optional()
      .isArray({ max: 20 })
      .withMessage('Maximum 20 tags allowed')
  ],

  update: [
    param('id').isMongoId().withMessage('Invalid product ID'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Product name must be between 3 and 200 characters'),
    body('price')
      .optional()
      .isFloat({ min: 0.01, max: 1000000 })
      .withMessage('Price must be between 0.01 and 1,000,000')
      .toFloat()
  ]
};

export const validateOrder = {
  create: [
    body('items')
      .isArray({ min: 1 })
      .withMessage('At least one item is required'),
    body('items.*.product')
      .isMongoId()
      .withMessage('Invalid product ID'),
    body('items.*.quantity')
      .isInt({ min: 1, max: 100 })
      .withMessage('Quantity must be between 1 and 100')
      .toInt(),
    body('shippingAddress')
      .isMongoId()
      .withMessage('Invalid shipping address ID'),
    body('paymentMethod')
      .isIn(['cash', 'card', 'wallet'])
      .withMessage('Payment method must be cash, card, or wallet')
  ]
};

// File upload validation middleware
export const validateFileUpload = (options = {}) => {
  const {
    fieldName = 'file',
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    maxSize = 10 * 1024 * 1024, // 10MB
    maxFiles = 1
  } = options;

  return (req, res, next) => {
    try {
      if (!req.file && !req.files) {
        return next(createError(400, 'No file uploaded'));
      }

      const files = req.files || [req.file];

      // Check number of files
      if (files.length > maxFiles) {
        return next(createError(400, `Maximum ${maxFiles} files allowed`));
      }

      // Validate each file
      for (const file of files) {
        // Check file size
        if (file.size > maxSize) {
          return next(createError(400, `File size must be less than ${maxSize / (1024 * 1024)}MB`));
        }

        // Check file type
        const mimeType = mime.lookup(file.originalname) || file.mimetype;
        if (!allowedTypes.includes(mimeType)) {
          return next(createError(400, `File type must be one of: ${allowedTypes.join(', ')}`));
        }

        // Check file extension
        const extension = mime.extension(mimeType);
        const allowedExtensions = allowedTypes.map(t => mime.extension(t)).filter(Boolean);

        if (!allowedExtensions.includes(extension)) {
          return next(createError(400, `File extension must be one of: ${allowedExtensions.join(', ')}`));
        }
      }

      next();
    } catch (error) {
      logger.error('File validation error', { error: error.message });
      next(createError(400, 'File validation failed'));
    }
  };
};

// Export convenience functions
export const validateQueryParams = (schema) => validate([query().custom(() => {
  const { error } = schema.validate(req.query, { abortEarly: false });
  if (error) throw new Error(error.details.map(d => d.message).join(', '));
  return true;
})]);

export const validateRequestBody = (schema) => validate([body().custom(() => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) throw new Error(error.details.map(d => d.message).join(', '));
  return true;
})]);

// Export all validators
export default {
  validate,
  commonRules,
  sanitize,
  customValidators,
  validateAuth,
  validateProduct,
  validateOrder,
  validateFileUpload,
  validateQueryParams,
  validateRequestBody
};