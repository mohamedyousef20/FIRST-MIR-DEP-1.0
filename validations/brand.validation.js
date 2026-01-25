import Joi from 'joi';
import { baseSchema } from './base.schema.js';
import Brand from '../models/brand.model.js';

// Common fields
const baseBrandFields = {
  name: Joi.string().min(2).max(50).required().messages({
    'string.base': 'Name must be a string',
    'string.empty': 'Name is required',
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name cannot exceed 50 characters',
  }),
  description: Joi.string().allow('').max(500).messages({
    'string.max': 'Description cannot exceed 500 characters',
  }),
  image: Joi.string().uri().allow('', null).messages({
    'string.uri': 'Image must be a valid URL',
  }),
  status: Joi.string().valid('active', 'inactive').default('active').messages({
    'any.only': "Status must be either 'active' or 'inactive'",
  }),
};

// Validate create brand
export const validateCreateBrand = async (req, res, next) => {
  const schema = Joi.object({
    ...baseBrandFields,
    name: baseBrandFields.name.external(async (value) => {
      if (await Brand.exists({ name: value })) {
        throw new Error('Brand name already exists');
      }
    }),
  });

  try {
    req.body = await schema.validateAsync(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    next();
  } catch (err) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: err.details?.map(d=>d.message) || err.message });
  }
};

// Validate update brand
export const validateUpdateBrand = async (req, res, next) => {
  const brandId = req.params.id;
  const schema = Joi.object({
    ...baseBrandFields,
    name: baseBrandFields.name.external(async (value) => {
      if (value && await Brand.exists({ name: value, _id: { $ne: brandId } })) {
        throw new Error('Brand name already exists');
      }
    }),
  }).min(1);

  try {
    req.body = await schema.validateAsync(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    next();
  } catch (err) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: err.details?.map(d=>d.message) || err.message });
  }
};
