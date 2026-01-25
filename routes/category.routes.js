import express from 'express'
import paginate from '../middlewares/pagination.js';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/category.controller.js';

import { protect, isAdmin } from '../middlewares/auth.middleware.js';
import { getProductsByCategory } from '../controllers/product.controller.js';
import {
  validateCreateCategory,
  validateUpdateCategory,
  validateCategoryQuery
} from '../validations/category.validation.js'; 

const router = express.Router();

// @route   GET /api/categories/:categoryId/products
// @desc    Get products in category
// @access  Public
router.get('/:categoryId/products', getProductsByCategory);

// @route   GET /api/categories
// @desc    Get all categories
// @access  Public
router.get('/', paginate(), validateCategoryQuery, getCategories);

// @route   GET /api/categories/:id
// @desc    Get single category
// @access  Public
router.get('/:id', getCategoryById);

// Apply protect and isAdmin middleware to all routes below
router.use(protect, isAdmin);

// @route   POST /api/categories
// @desc    Create category
// @access  Private/Admin
router.post('/', validateCreateCategory, createCategory);

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private/Admin
router.put('/:id', validateUpdateCategory, updateCategory);

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private/Admin
router.delete('/:id', deleteCategory);

export default router;