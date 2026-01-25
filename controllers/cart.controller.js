import Cart from '../models/cart.model.js';
import Product from '../models/product.model.js';
import asyncHandler from 'express-async-handler';
import { createError } from '../utils/error.js';

const CART_PRODUCT_SELECT = 'title titleEn images price seller discountPercentage discountedPrice quantity stock';
const CART_POPULATE_CONFIG = {
  path: 'items.product',
  select: CART_PRODUCT_SELECT
};

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
export const getCart = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user._id })
    .populate(CART_POPULATE_CONFIG);

  if (!cart) {
    return res.json({
      _id: null,
      user: req.user._id,
      items: [],
      appliedCoupon: null,
      total: 0,
      itemCount: 0,
      totalItems: 0,
      createdAt: null,
      updatedAt: null
    });
  }

  res.json(cart);
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
export const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1, sizes = [], colors = [] } = req.body;

  // التحقق من وجود المنتج
  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Normalize inputs
  const parsedQuantity = parseInt(quantity);
  const normalizedSizes = Array.isArray(sizes) ? sizes : (sizes ? [sizes] : []);
  const normalizedColors = Array.isArray(colors) ? colors : (colors ? [colors] : []);

  // التحقق من صحة البيانات
  if (isNaN(parsedQuantity) || parsedQuantity < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid quantity'
    });
  }

  // تحقق من التوافق بين الكمية والاختيارات
  if (normalizedSizes.length && normalizedSizes.length !== parsedQuantity) {
    return res.status(400).json({
      success: false,
      message: 'Sizes count must equal quantity'
    });
  }
  if (normalizedColors.length && normalizedColors.length !== parsedQuantity) {
    return res.status(400).json({
      success: false,
      message: 'Colors count must equal quantity'
    });
  }
  // البحث عن عربة التسوق
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      items: []
    });
  }

  // البحث عن عنصر مطابق
  const existingItemIndex = cart.items.findIndex(item =>
    item.product.toString() === productId &&
    JSON.stringify(item.sizes.sort()) === JSON.stringify(normalizedSizes.sort()) &&
    JSON.stringify(item.colors.sort()) === JSON.stringify(normalizedColors.sort())
  );

  // حساب الكمية الإجمالية
  const currentQty = existingItemIndex !== -1 ? cart.items[existingItemIndex].quantity : 0;
  const newTotalQty = currentQty + parsedQuantity;

  // التحقق من المخزون
  if (newTotalQty > product.quantity) {
    const availableQty = product.quantity - currentQty;
    return res.status(400).json({
      success: false,
      message: `Only ${availableQty} more items available in stock`
    });
  }

  // تحديث أو إضافة العنصر
  if (existingItemIndex !== -1) {
    cart.items[existingItemIndex].quantity = newTotalQty;
  } else {
    cart.items.push({
      product: productId,
      quantity: parsedQuantity,
      price: product.price,
      sizes: normalizedSizes,
      colors: normalizedColors
    });
  }

  await cart.updateCart();

  // إرجاع الاستجابة
  const updatedCart = await Cart.findById(cart._id)
    .populate(CART_POPULATE_CONFIG)
    .populate('user', 'firstName lastName email');

  res.json({
    success: true,
    message: existingItemIndex !== -1
      ? `Cart item quantity updated to ${newTotalQty}`
      : 'Product added to cart successfully',
    cart: updatedCart,
    itemCount: updatedCart.items.reduce((sum, item) => sum + item.quantity, 0)
  });
});

// @desc    Update cart item
// @route   PATCH /api/cart/:itemId
// @access  Private
export const updateCartItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const { itemId } = req.params;

  // Validate quantity
  const parsedQuantity = parseInt(quantity);
  if (isNaN(parsedQuantity) || parsedQuantity < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid quantity. Must be a number greater than 0'
    });
  }

  // Find user's cart
  const cart = await Cart.findOne({ user: req.user._id }).populate(CART_POPULATE_CONFIG);

  if (!cart) {
    return res.status(404).json({
      success: false,
      message: 'Cart not found'
    });
  }

  // Find the item in cart
  const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);

  if (itemIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Item not found in cart'
    });
  }

  const cartItem = cart.items[itemIndex];
  const product = cartItem.product;

  // Check stock availability
  if (parsedQuantity > product.quantity) {
    return res.status(400).json({
      success: false,
      message: `Only ${product.quantity} items available in stock`
    });
  }

  // Update quantity
  cart.items[itemIndex].quantity = parsedQuantity;

  const updatedCart = await cart.updateCart();
  await updatedCart.populate(CART_POPULATE_CONFIG);

  const updatedItem = updatedCart.items.id(itemId);

  res.json({
    success: true,
    message: 'Cart item updated successfully',
    data: updatedCart,
    item: updatedItem,
    itemCount: updatedCart.itemCount
  });
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:itemId
// @access  Private
export const removeItemFromCart = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;

  // Find cart
  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    return next(createError('No cart found', 404))

  }

  // Check if item exists
  const itemExists = cart.items.some(item => item._id.toString() === itemId);
  if (!itemExists) {
    return res.status(404).json({
      success: false,
      message: 'Item not found in cart'
    });
  }

  // Remove item using filter
  cart.items = cart.items.filter(item => item._id.toString() !== itemId);

  // Mark items as modified
  cart.markModified('items');

  // Save the cart
  await cart.save();

  // Get populated cart for response
  const updatedCart = await Cart.findById(cart._id)
    .populate({
      path: 'items.product',
      select: 'title titleEn images price seller discountPercentage discountedPrice'
    });

  res.json({
    success: true,
    message: 'Item removed from cart successfully',
    data: updatedCart,
    itemCount: updatedCart.itemCount,
    totalItems: updatedCart.totalItems // Using virtual
  });
});

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
export const clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate(CART_POPULATE_CONFIG);

  if (!cart) {
    return res.status(404).json({ message: 'Cart not found' });
  }

  cart.items = [];
  cart.appliedCoupon = null;
  const updatedCart = await cart.updateCart();
  await updatedCart.populate(CART_POPULATE_CONFIG);

  res.json({
    success: true,
    message: 'Cart cleared successfully',
    data: updatedCart,
    itemCount: 0
  });
});

// @desc    Get cart items count
// @route   GET /api/cart/count
// @access  Private
export const getCartCount = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  let count = 0;
  if (cart && cart.items) {
    count = cart.items.reduce((total, item) => total + item.quantity, 0);
  }

  res.json({
    success: true,
    count
  });
});