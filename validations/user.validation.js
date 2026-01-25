const { baseSchema, Joi, patterns } = require('./base.schema');

// User role enum
const USER_ROLES = ['user', 'admin', 'seller'];

// User status enum
const USER_STATUS = ['active', 'inactive', 'suspended'];

// Base user schema
const userBaseSchema = {
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().pattern(patterns.email).required(),
  phone: Joi.string().pattern(patterns.phone).allow('', null),
  password: Joi.string().pattern(patterns.password).required(),
  role: Joi.string().valid(...USER_ROLES).default('user'),
  status: Joi.string().valid(...USER_STATUS).default('active'),
  avatar: Joi.string().uri().allow('', null),
  address: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    country: Joi.string().required(),
    postalCode: Joi.string().required(),
  }).optional(),
  preferences: Joi.object({
    notifications: Joi.boolean().default(true),
    theme: Joi.string().valid('light', 'dark', 'system').default('system'),
    language: Joi.string().default('en'),
  }).default(),
};

// Create user validation schema
export const createUserSchema = baseSchema.keys({
  ...userBaseSchema,
  confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
  }),
});

// Update user validation schema
 export const updateUserSchema = baseSchema.keys({
  name: Joi.string().min(2).max(100),
  email: Joi.string().pattern(patterns.email),
  phone: Joi.string().pattern(patterns.phone).allow('', null),
  password: Joi.string().pattern(patterns.password),
  currentPassword: Joi.when('password', {
    is: Joi.exist(),
    then: Joi.string().required(),
  }),
  role: Joi.string().valid(...USER_ROLES),
  status: Joi.string().valid(...USER_STATUS),
  avatar: Joi.string().uri().allow('', null),
  address: Joi.object({
    street: Joi.string(),
    city: Joi.string(),
    state: Joi.string(),
    country: Joi.string(),
    postalCode: Joi.string(),
  }).optional(),
  preferences: Joi.object({
    notifications: Joi.boolean(),
    theme: Joi.string().valid('light', 'dark', 'system'),
    language: Joi.string(),
  }),
}).min(1); // At least one field is required for update


// Forgot password schema
export const forgotPasswordSchema = baseSchema.keys({
  email: Joi.string().pattern(patterns.email).required(),
});

// Reset password schema
export const resetPasswordSchema = baseSchema.keys({
  token: Joi.string().required(),
  password: Joi.string().pattern(patterns.password).required(),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
  }),
});

// Change password schema
export const changePasswordSchema = baseSchema.keys({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().pattern(patterns.password).required(),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
    'any.only': 'Passwords do not match',
  }),
});
