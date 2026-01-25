import { body, param, query, validationResult } from 'express-validator';
import Announcement from '../models/announcement.model.js';

/* ------------------ Common validate middleware ------------------ */
const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map(v => v.run(req)));

  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  return res.status(400).json({
    success: false,
    errors: errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }))
  });
};

/* ------------------ Create Announcement ------------------ */
export const createAnnouncementValidator = validate([
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 5, max: 200 }),

  body('content')
    .optional()
    .trim()
    .isLength({ min: 10 }),

  body('image')
    .optional()
    .isString(),

  body('link')
    .optional()
    .isString(),

  body('isMain')
    .optional()
    .isBoolean(),

  body('status')
    .optional()
    .isIn(['active', 'inactive']),

  body('startDate')
    .notEmpty().withMessage('Start date is required')
    .isISO8601(),

  body('endDate')
    .notEmpty().withMessage('End date is required')
    .isISO8601()
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    })
]);
