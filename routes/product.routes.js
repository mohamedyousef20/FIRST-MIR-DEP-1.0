import express from 'express';
import paginate from '../middlewares/pagination.js';
import {
  createProduct,
  getProducts,
  getProductById,
  approveProduct,
  rejectProduct,
  getProductsForAdmin,
  createFilterObj,
  getFeaturedProducts,
  getNewArrivals,
  getSellerProducts,
  deleteProduct,
  updateProduct,
  createSortObj,
  getProductsByCategory,
} from '../controllers/product.controller.js';
import { isAdmin, isSeller, protect } from '../middlewares/auth.middleware.js';

const router = express.Router({ mergeParams: true });


router.get('/', paginate(), createFilterObj, createSortObj, getProducts);

router.get('/featured', getFeaturedProducts);

router.get('/new', getNewArrivals);

router.get('/category/:categoryId', paginate(), createFilterObj, createSortObj, getProductsByCategory);

router.get('/admin-products', protect, isAdmin, paginate(), createFilterObj, getProductsForAdmin);

router.get('/:productId', createFilterObj, getProductById);

// ========== المسارات المحمية ==========
router.use(protect);

// مسارات المسؤول
router.patch('/approve', isAdmin, approveProduct);
router.patch('/reject', isAdmin, rejectProduct);

// مسارات البائع
router.get('/seller/products', isSeller, paginate(), createSortObj, getSellerProducts);
router.delete('/:id', isSeller, deleteProduct);
router.patch('/', isSeller, updateProduct);
router.post('/', isSeller, createProduct);

export default router;