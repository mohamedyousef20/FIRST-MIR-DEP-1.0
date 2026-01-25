import { validationResult } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

// Simple English→Arabic phrase mapper for validation messages
const translate = (msg) => {
  const dict = {
    'is required': 'مطلوب',
    'must be a valid email': 'بريد إلكتروني غير صالح',
    'must be a string': 'يجب أن يكون نصًا',
    'must be a number': 'يجب أن يكون رقمًا',
    'must be at least': 'يجب أن يكون على الأقل',
    'cannot exceed': 'لا يمكن أن يتجاوز',
    'must be between': 'يجب أن يكون بين',
    'must be greater than': 'يجب أن يكون أكبر من',
    'fails to match the required pattern': 'صيغة غير صالحة',
    'must be a boolean': 'يجب أن يكون قيمة منطقية',
    'must contain at least one uppercase letter, one lowercase letter, one number, and one special character': 'يجب أن تحتوي كلمة المرور على حرف كبير وحرف صغير ورقم وحرف خاص على الأقل',
    'is not allowed': 'غير مسموح',
  };
  let translated = msg;
  Object.entries(dict).forEach(([en, ar]) => {
    if (translated.includes(en)) translated = translated.replace(en, ar);
  });
  return translated;
};

/**
 * Middleware to validate request data against a Joi schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - Where to get the data from (body, query, params)
 */
export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: translate(detail.message),
        type: detail.type,
      }));

      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
        success: false,
        message: 'فشل التحقق من صحة البيانات',
        errors,
      });
    }

    // Replace the request data with the validated data
    req[source] = value;
    next();
  };
};

// Middleware to handle validation errors from express-validator
export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
      success: false,
      message: 'فشل التحقق من صحة البيانات',
      errors: errors.array().map(err => ({
        field: err.param,
        message: translate(err.msg),
        type: err.type || 'validation_error',
      })),
    });
  }
  next();
};

