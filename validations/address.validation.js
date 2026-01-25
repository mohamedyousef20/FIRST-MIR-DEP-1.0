import Joi from 'joi';
import { baseSchema } from './base.schema.js';

// Address labels (matches mongoose enum)
export const ADDRESS_LABELS = ['home', 'work', 'other'];

/**
 * Create Address Schema
 * matches mongoose Address model exactly
 */
export const createAddressSchema = baseSchema.keys({
  state: Joi.string().trim().required(),
  city: Joi.string().trim().required(),
  district: Joi.string().trim().required(),
  street: Joi.string().trim().required(),

  buildingNumber: Joi.string().trim().allow('', null),
  apartmentNumber: Joi.string().trim().allow('', null),
  landmark: Joi.string().trim().allow('', null),

  label: Joi.string()
    .valid(...ADDRESS_LABELS)
    .default('home'),

  isDefault: Joi.boolean().default(false),
});
