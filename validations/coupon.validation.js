import { body, query, param, validationResult } from 'express-validator';

// Common validation rules for coupons
export const commonCouponRules = {
  // Code validation
  code: body('code')
    .trim()
    .isUppercase()
    .withMessage('Coupon code must be uppercase')
    .isLength({ min: 3, max: 20 })
    .withMessage('Coupon code must be between 3 and 20 characters')
    .matches(/^[A-Z0-9-_]+$/)
    .withMessage('Coupon code can only contain letters, numbers, hyphens, and underscores'),

  // Discount type validation
  discountType: body('discountType')
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be either "percentage" or "fixed"'),

  // Discount value validation
  discountValue: body('discountValue')
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a positive number')
    .custom((value, { req }) => {
      if (req.body.discountType === 'percentage') {
        if (value > 100) {
          throw new Error('Percentage discount cannot exceed 100%');
        }
      }
      return true;
    }),

  // Minimum purchase amount
  minPurchaseAmount: body('minPurchaseAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum purchase amount must be 0 or higher')
    .toFloat(),

  // Maximum discount amount
  maxDiscountAmount: body('maxDiscountAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum discount amount must be 0 or higher')
    .custom((value, { req }) => {
      if (req.body.discountType === 'fixed') {
        if (value && value < req.body.discountValue) {
          throw new Error('Maximum discount amount cannot be less than discount value for fixed discount');
        }
      }
      return true;
    })
    .toFloat(),

  // Valid from date
  validFrom: body('validFrom')
    .optional()
    .isISO8601()
    .withMessage('Valid from must be a valid date')
    .toDate()
    .custom((value, { req }) => {
      if (req.body.validUntil && value > req.body.validUntil) {
        throw new Error('Valid from date cannot be after valid until date');
      }
      return true;
    }),

  // Valid until date
  validUntil: body('validUntil')
    .isISO8601()
    .withMessage('Valid until must be a valid date')
    .toDate()
    .custom((value) => {
      if (value <= new Date()) {
        throw new Error('Valid until date must be in the future');
      }
      return true;
    })
    .custom((value, { req }) => {
      if (req.body.validFrom && value < req.body.validFrom) {
        throw new Error('Valid until date cannot be before valid from date');
      }
      return true;
    }),

  // Maximum uses
  maxUses: body('maxUses')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Maximum uses must be at least 1')
    .toInt(),

  // Current uses (usually not set by user)
  currentUses: body('currentUses')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Current uses must be 0 or higher')
    .toInt(),

  // Active status
  isActive: body('isActive')
    .optional()
    .isBoolean()
    .withMessage('Active status must be true or false')
    .toBoolean(),
};

// Create coupon validation
export const createCouponValidation = [
  commonCouponRules.code,
  commonCouponRules.discountType,
  commonCouponRules.discountValue,
  commonCouponRules.minPurchaseAmount,
  commonCouponRules.maxDiscountAmount,
  commonCouponRules.validFrom,
  commonCouponRules.validUntil,
  commonCouponRules.maxUses,
  commonCouponRules.isActive,

  // Custom validation for business logic
  body().custom((value, { req }) => {
    // For percentage discounts, require maxDiscountAmount if discountValue is high
    if (req.body.discountType === 'percentage' && req.body.discountValue > 50) {
      if (!req.body.maxDiscountAmount) {
        throw new Error('Maximum discount amount is recommended for discounts over 50%');
      }
    }
    return true;
  }),
];

// Update coupon validation
export const updateCouponValidation = [
  body('code')
    .optional()
    .trim()
    .isUppercase()
    .withMessage('Coupon code must be uppercase')
    .isLength({ min: 3, max: 20 })
    .withMessage('Coupon code must be between 3 and 20 characters')
    .matches(/^[A-Z0-9-_]+$/)
    .withMessage('Coupon code can only contain letters, numbers, hyphens, and underscores'),

  body('discountType')
    .optional()
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be either "percentage" or "fixed"'),

  body('discountValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a positive number')
    .custom((value, { req }) => {
      if (req.body.discountType === 'percentage' && value > 100) {
        throw new Error('Percentage discount cannot exceed 100%');
      }
      return true;
    }),

  body('minPurchaseAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum purchase amount must be 0 or higher')
    .toFloat(),

  body('maxDiscountAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum discount amount must be 0 or higher')
    .toFloat(),

  body('validFrom')
    .optional()
    .isISO8601()
    .withMessage('Valid from must be a valid date')
    .toDate(),

  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until must be a valid date')
    .toDate()
    .custom((value, { req }) => {
      if (req.body.validFrom && value < req.body.validFrom) {
        throw new Error('Valid until date cannot be before valid from date');
      }
      return true;
    }),

  body('maxUses')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Maximum uses must be at least 1')
    .toInt(),

  body('currentUses')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Current uses must be 0 or higher')
    .toInt(),

  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('Active status must be true or false')
    .toBoolean(),

  // Ensure at least one field is being updated
  body().custom((value) => {
    const fields = Object.keys(value);
    if (fields.length === 0) {
      throw new Error('At least one field must be provided for update');
    }
    return true;
  }),
];

// Validate coupon ID in params
export const couponIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid coupon ID format'),
];

// Validate coupon code in params/body for applying
export const applyCouponValidation = [
  body('code')
    .trim()
    .isUppercase()
    .withMessage('Coupon code must be uppercase')
    .isLength({ min: 3, max: 20 })
    .withMessage('Coupon code must be between 3 and 20 characters')
    .matches(/^[A-Z0-9-_]+$/)
    .withMessage('Coupon code can only contain letters, numbers, hyphens, and underscores'),

  body('cartTotal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Cart total must be a positive number')
    .toFloat(),
];

// Validate coupon removal
export const removeCouponValidation = [
  body('code')
    .trim()
    .isUppercase()
    .withMessage('Coupon code must be uppercase')
    .isLength({ min: 3, max: 20 })
    .withMessage('Coupon code must be between 3 and 20 characters')
    .matches(/^[A-Z0-9-_]+$/)
    .withMessage('Coupon code can only contain letters, numbers, hyphens, and underscores'),
];

// Query validation for getting coupons
export const couponQueryValidation = [
  query('code')
    .optional()
    .trim()
    .isUppercase()
    .withMessage('Coupon code must be uppercase'),

  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('Active status must be true or false')
    .toBoolean(),

  query('discountType')
    .optional()
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be either "percentage" or "fixed"'),

  query('valid')
    .optional()
    .isBoolean()
    .withMessage('Valid filter must be true or false')
    .toBoolean(),

  query('minDiscountValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum discount value must be 0 or higher')
    .toFloat(),

  query('maxDiscountValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum discount value must be 0 or higher')
    .toFloat(),

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

  query('sortBy')
    .optional()
    .isIn(['code', 'discountValue', 'validUntil', 'createdAt', 'maxUses'])
    .withMessage('Invalid sort field'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
    .default('asc'),
];

// Validate function for coupons
export const validateRequest = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const errorMessages = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  };
};

// Export all coupon validations
export default {
  createCouponValidation,
  updateCouponValidation,
  couponIdValidation,
  applyCouponValidation,
  removeCouponValidation,
  couponQueryValidation,
  validateRequest,
};