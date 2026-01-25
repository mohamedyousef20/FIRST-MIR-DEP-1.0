import express from 'express';
import paginate from '../middlewares/pagination.js';
import {
  getAllCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCouponCode,
  removeCouponFromCart,
  getPublicCoupons
} from '../controllers/coupon.controller.js';
import { protect, isAdmin } from '../middlewares/auth.middleware.js';
import couponValidations, { couponIdValidation, couponQueryValidation, createCouponValidation, updateCouponValidation, validateRequest } from '../validations/coupon.validation.js'; 

const router = express.Router();

// Public coupons for offers page
router.get('/public', paginate(), getPublicCoupons);

// Protected routes
router.use(protect);

// Validate coupon code
router.post('/validate',
  validateCouponCode
);

// Remove coupon from cart
router.delete('/remove', removeCouponFromCart);

// Admin routes with validation
router.use(isAdmin)
// Get all coupons with query filters
router.get('/',
  paginate(),
  couponQueryValidation,
  getAllCoupons
);

// Get single coupon by ID
router.get('/:id',
  couponIdValidation,
  getCouponById
);

// Create new coupon
router.post('/',
createCouponValidation,
  createCoupon
);

// Update coupon
router.put('/:id',
  updateCouponValidation,
  updateCoupon
);

// Delete coupon
router.delete('/:id',
  couponIdValidation,
  deleteCoupon
);

export default router;