import asyncHandler from 'express-async-handler';
import Coupon from '../models/coupon.model.js';
import Cart from '../models/cart.model.js';
import Order from '../models/order.model.js';

// 🧾 Get all coupons
export const getAllCoupons = asyncHandler(async (req, res) => {
    const coupons = await Coupon.find().sort('-createdAt');
    res.send(coupons);
});

// 🌐 Get public active coupons
export const getPublicCoupons = asyncHandler(async (_req, res) => {
    const now = new Date();
    const coupons = await Coupon.find({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
        $expr: { $lt: ['$currentUses', '$maxUses'] } // hide used-up coupons
    })
        .sort({ validUntil: 1 })
        .select('-currentUses -maxUses -updatedAt');

    res.json({
        success: true,
        coupons
    });
});

// 🔍 Get a single coupon
export const getCouponById = asyncHandler(async (req, res) => {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).send('Coupon not found');
    res.send(coupon);
});

//  Create a new coupon
export const createCoupon = asyncHandler(async (req, res) => {

    let coupon = await Coupon.findOne({ code: req.body.code.toUpperCase() });
    if (coupon) return res.status(400).send('Coupon code already exists');

    coupon = new Coupon({
        ...req.body,
        code: req.body.code.toUpperCase(),
    });

    await coupon.save();
    res.status(201).send(coupon);
});

// ✏️ Update a coupon
export const updateCoupon = asyncHandler(async (req, res) => {
    let coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).send('Coupon not found');

    if (req.body.code && req.body.code.toUpperCase() !== coupon.code) {
        const existingCoupon = await Coupon.findOne({ code: req.body.code.toUpperCase() });
        if (existingCoupon) return res.status(400).send('Coupon code already exists');
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
        req.params.id,
        {
            ...req.body,
            code: req.body.code ? req.body.code.toUpperCase() : coupon.code,
            updatedAt: new Date(),
        },
        { new: true }
    );

    res.send(updatedCoupon);
});

//  Delete a coupon
export const deleteCoupon = asyncHandler(async (req, res) => {
    const coupon = await Coupon.findByIdAndRemove(req.params.id);
    if (!coupon) return res.status(404).send('Coupon not found');
    res.send(coupon);
});

//  Remove coupon from cart and restore original total
export const removeCouponFromCart = asyncHandler(async (req, res) => {

    // Find user's cart
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');

    if (!cart) {
        return res.status(404).json({
            success: false,
            message: 'Cart not found'
        });
    }

    // Check if coupon is applied
    if (!cart.appliedCoupon) {
        return res.status(400).json({
            success: false,
            message: 'No coupon applied to cart'
        });
    }

    // Store removed coupon data for response
    const removedCoupon = {
        code: cart.appliedCoupon.code,
        discountAmount: cart.appliedCoupon.discountAmount,
        originalTotal: cart.appliedCoupon.originalTotal
    };

    // Calculate original subtotal from cart items
    const originalSubtotal = cart.items.reduce((total, item) => {
        return total + (item.product.price * item.quantity);
    }, 0);

    // Remove coupon from cart
    cart.appliedCoupon = undefined;

    // Restore original total
    cart.total = originalSubtotal;

    // Save updated cart
    await cart.save();

    // Send success response
    res.status(200).json({
        success: true,
        message: 'Coupon removed successfully',
        data: {
            cart: {
                _id: cart._id,
                items: cart.items,
                subtotal: originalSubtotal,
                total: originalSubtotal,
                appliedCoupon: null
            },
            removedCoupon,
            originalTotal: originalSubtotal,
            message: 'Coupon removed and cart total restored'
        }
    });
});

// Validate coupon code and apply to cart
export const validateCouponCode = asyncHandler(async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).send('Coupon code is required');
    }

    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');

    if (!cart) {
        return res.status(400).send('Cart not found');
    }

    if (!cart.items || cart.items.length === 0) {
        return res.status(400).send('Cart is empty');
    }

    // Calculate cart total
    const cartTotal = cart.items.reduce((total, item) => {
        return total + (item.product.price * item.quantity);
    }, 0);

    if (cartTotal <= 0) {
        return res.status(400).send('Invalid cart total');
    }

    // Find valid coupon
    const coupon = await Coupon.findOne({
        code: code.toUpperCase(), // Convert to uppercase
        isActive: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() },
        $expr: { $lt: ['$currentUses', '$maxUses'] } // currentUses < maxUses
    });
    //console.log(coupon, 'cde')
    if (!coupon) {
        return res.status(400).send('Invalid or expired coupon code');
    }

    // Validate minimum purchase amount
    if (cartTotal < coupon.minPurchaseAmount) {
        return res.status(400).send(`Minimum purchase amount of $${coupon.minPurchaseAmount} required`);
    }

    // ✅ IMPORTANT: Check if user has already used this coupon in a completed order
    const existingOrder = await Order.findOne({
        buyer: req.user._id,
        'coupon.code': coupon.code,
        paymentStatus: { $in: ['paid', 'pending', 'confirmed', 'processing', 'completed'] },
        wasCanceled: false
    });

    if (existingOrder) {
        return res.status(400).send('You have already used this coupon in a previous order');
    }

    // Calculate discount
    let discountAmount = 0;

    if (coupon.discountType === 'percentage') {
        discountAmount = (cartTotal * coupon.discountValue) / 100;

        // Apply max discount limit
        if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
            discountAmount = coupon.maxDiscountAmount;
        }
    } else if (coupon.discountType === 'fixed') {
        discountAmount = coupon.discountValue;
    }

    // Ensure discount doesn't exceed cart total
    discountAmount = Math.min(discountAmount, cartTotal);
    const discountedTotal = Math.max(0, cartTotal - discountAmount);

    // ✅ Update the cart total with the discounted amount
    cart.total = discountedTotal;

    // Store coupon in cart for later use during checkout
    // Note: We store couponId but DON'T increment currentUses yet
    cart.appliedCoupon = {
        code: coupon.code,
        discountAmount: discountAmount,
        discountedTotal: discountedTotal,
        originalTotal: cartTotal,
        couponId: coupon._id,
    };

    await cart.save();

    // Calculate savings percentage
    const savingsPercentage = cartTotal > 0 ? (discountAmount / cartTotal) * 100 : 0;

    // Prepare response
    const response = {
        valid: true,
        coupon: {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            minPurchaseAmount: coupon.minPurchaseAmount,
            maxDiscountAmount: coupon.maxDiscountAmount,
            remainingUses: coupon.maxUses - coupon.currentUses
        },
        cart: {
            originalTotal: parseFloat(cartTotal.toFixed(2)),
            discountedTotal: parseFloat(discountedTotal.toFixed(2)),
            discountAmount: parseFloat(discountAmount.toFixed(2)),
            savingsPercentage: parseFloat(savingsPercentage.toFixed(1))
        },
        message: `Coupon applied successfully! You saved $${discountAmount.toFixed(2)} (${savingsPercentage.toFixed(1)}% off)`
    };

    res.send(response);
});