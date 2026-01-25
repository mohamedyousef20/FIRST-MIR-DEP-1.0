// routes/cart.js
import express from 'express'
import { protect } from '../middlewares/auth.middleware.js';
import isVerified from '../middlewares/isVerified.js';
import {
  validateCartItem,
  validateUpdateCartItem,
  validateObjectId
} from '../validations/cart.validation.js';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeItemFromCart,
  clearCart,
  getCartCount,

} from '../controllers/cart.controller.js';

const router = express.Router();

router.use(protect)

// @route   GET /api/cart
// @desc    Get user cart
// @access  Private
router.get('/', getCart);

// @route   POST /api/cart
// @desc    Add item to cart
// @access  Private
router.post('/', isVerified, addToCart);

// @route   PATCH /api/carts/:itemId
// @desc    Update cart item quantity
// @access  Private
router.patch('/:itemId', isVerified, updateCartItem);


// @route   DELETE /api/cart
// @desc    Clear cart
// @access  Private
router.delete('/', isVerified, clearCart);
// @route   DELETE /api/cart/:itemId
// @desc    Remove item from cart
// @access  Private
router.delete('/:itemId', isVerified, removeItemFromCart);

// @route   GET /api/cart/count
// @desc    Get cart items count
// @access  Private
router.get('/count', getCartCount);



export default router;