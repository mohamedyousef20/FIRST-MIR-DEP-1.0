import Joi from "joi";
import Category from "../models/category.model.js";

// Base validation schema
const baseCategorySchema = {
  name: Joi.string()
    .min(2)
    .max(50)
    .required()
    .messages({
      "string.base": "Name must be a string",
      "string.empty": "Name is required",
      "string.min": "Name must be at least 2 characters",
      "string.max": "Name cannot exceed 50 characters",
      "any.required": "Name is required"
    }),

  description: Joi.string()
    .allow('')
    .max(500)
    .messages({
      "string.max": "Description cannot exceed 500 characters"
    }),

  image: Joi.string()
    .uri()
    .allow('', null)
    .messages({
      "string.uri": "Image must be a valid URL"
    }),

  status: Joi.string()
    .valid('active', 'inactive')
    .default('active')
    .messages({
      "any.only": "Status must be either 'active' or 'inactive'"
    }),
};

// Create category validation
export const validateCreateCategory = async (req, res, next) => {
  const schema = Joi.object({
    ...baseCategorySchema,
    // Check if category name already exists
    name: baseCategorySchema.name.external(async (value) => {
      if (value) {
        const category = await Category.findOne({ name: value });
        if (category) {
          throw new Error('Category name already exists');
        }
      }
    }),

  });

  try {
    const validatedData = await schema.validateAsync(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    // Replace request body with validated data
    req.body = validatedData;
    next();
  } catch (error) {
    //console.log('Category validation error:', error);

    if (error.details && Array.isArray(error.details)) {
      const errorMessages = error.details.map(detail => detail.message);
      const fields = error.details.map(detail => detail.path[0]);

      return res.status(400).json({
        success: false,
        message: "Category data is invalid",
        errors: errorMessages,
        errorCount: errorMessages.length,
        fields
      });
    }

    // Handle async validation errors
    return res.status(400).json({
      success: false,
      message: error.message || "Error validating category data",
      error: error.message
    });
  }
};

// Update category validation
export const validateUpdateCategory = async (req, res, next) => {
  const categoryId = req.params.id;

  const schema = Joi.object({
    name: Joi.string()
      .min(2)
      .max(50)
      .external(async (value) => {
        if (value) {
          const category = await Category.findOne({
            name: value,
            _id: { $ne: categoryId }
          });
          if (category) {
            throw new Error('Category name already exists');
          }
        }
      })
      .messages({
        "string.base": "Name must be a string",
        "string.empty": "Name cannot be empty",
        "string.min": "Name must be at least 2 characters",
        "string.max": "Name cannot exceed 50 characters"
      }),

    nameEn: Joi.string()
      .min(2)
      .max(50)
      .external(async (value) => {
        if (value) {
          const category = await Category.findOne({
            nameEn: value,
            _id: { $ne: categoryId }
          });
          if (category) {
            throw new Error('English category name already exists');
          }
        }
      })
      .messages({
        "string.base": "English name must be a string",
        "string.empty": "English name cannot be empty",
        "string.min": "English name must be at least 2 characters",
        "string.max": "English name cannot exceed 50 characters"
      }),

    description: Joi.string()
      .allow('')
      .max(500)
      .messages({
        "string.max": "Description cannot exceed 500 characters"
      }),

    descriptionEn: Joi.string()
      .allow('')
      .max(500)
      .messages({
        "string.max": "English description cannot exceed 500 characters"
      }),

    image: Joi.string()
      .uri()
      .allow('', null)
      .messages({
        "string.uri": "Image must be a valid URL"
      }),

    status: Joi.string()
      .valid('active', 'inactive')
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'"
      }),
  }).min(1); // At least one field must be provided for update

  try {
    const validatedData = await schema.validateAsync(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    // Replace request body with validated data
    req.body = validatedData;
    next();
  } catch (error) {
    //console.log('Category update validation error:', error);

    if (error.details && Array.isArray(error.details)) {
      const errorMessages = error.details.map(detail => detail.message);
      const fields = error.details.map(detail => detail.path[0]);

      return res.status(400).json({
        success: false,
        message: "Category update data is invalid",
        errors: errorMessages,
        errorCount: errorMessages.length,
        fields
      });
    }

    // Handle async validation errors
    return res.status(400).json({
      success: false,
      message: error.message || "Error validating category update data",
      error: error.message
    });
  }
};

// Query validation for category listing
export const validateCategoryQuery = (req, res, next) => {
  const schema = Joi.object({
    status: Joi.string().valid('active', 'inactive'),
    search: Joi.string(),
    sort: Joi.string().valid('name_asc', 'name_desc', 'createdAt_asc', 'createdAt_desc').default('createdAt_desc'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  });

  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    allowUnknown: false
  });

  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    const fields = error.details.map(detail => detail.path[0]);

    return res.status(400).json({
      success: false,
      message: "Query parameters are invalid",
      errors: errorMessages,
      errorCount: errorMessages.length,
      fields
    });
  }

  // Replace query with validated data
  req.query = value;
  next();
};

// Helper function for frontend validation
export const validateCategoryInput = (categoryData) => {
  const errors = {};

  if (!categoryData.name || categoryData.name.length < 2) {
    errors.name = "Name must be at least 2 characters";
  }

  if (categoryData.description && categoryData.description.length > 500) {
    errors.description = "Description cannot exceed 500 characters";
  }

  if (categoryData.image && !/^https?:\/\/.+/i.test(categoryData.image)) {
    errors.image = "Image must be a valid URL";
  }

  if (categoryData.status && !['active', 'inactive'].includes(categoryData.status)) {
    errors.status = "Status must be 'active' or 'inactive'";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};