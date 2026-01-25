import express from 'express';
import paginate from '../middlewares/pagination.js';
import {
  getBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
} from '../controllers/brand.controller.js';
import { protect, isAdmin } from '../middlewares/auth.middleware.js';
import { validateCreateBrand, validateUpdateBrand } from '../validations/brand.validation.js';
import { getProductsByBrand } from '../controllers/product.controller.js';

const router = express.Router();

// Nested route: /api/brands/:brandId/products
router.get('/:brandId/products', getProductsByBrand);

// Public routes
// Paginated list of brands
router.get('/', paginate(), getBrands);
router.get('/:id', getBrandById);

// Admin-protected routes
router.use(protect, isAdmin);
router.post('/', validateCreateBrand, createBrand);
router.put('/:id', validateUpdateBrand, updateBrand);
router.delete('/:id', deleteBrand);

export default router;
