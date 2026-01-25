import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import isVerified from '../middlewares/isVerified.js';
import {
  getWishlist,
  // addToWishlist,
  // removeFromWishlist,
  toggleWishlist,
  checkFavorite,
  clearWishlist,
  getWishlistCount
} from '../controllers/wishlist.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   GET /api/wishlist
// @desc    Get user wishlist
// @access  Private
router.get('/', getWishlist);

// @route   GET /api/wishlist/count
// @desc    Get wishlist count
// @access  Private
router.get('/count', getWishlistCount);

// @route   GET /api/wishlist/check/:productId
// @desc    Check if product is in wishlist
// @access  Private
router.get('/check/:productId', checkFavorite);

// @route   POST /api/wishlist/toggle
// @desc    Toggle product in wishlist
// @access  Private
router.post('/toggle', isVerified, toggleWishlist);

// @route   DELETE /api/wishlist
// @desc    Clear wishlist
// @access  Private
router.delete('/', isVerified, clearWishlist);

export default router;
