import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  sizes: [{
    type: String,
    required: true
  }],
  colors: [{
    type: String,
    required: true
  }]
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for item subtotal
cartItemSchema.virtual('itemTotal').get(function () {
  return this.price * this.quantity;
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  appliedCoupon: {
    code: String,
    discountAmount: Number,
    discountedTotal: Number,
    originalTotal: Number,
    couponId: {  
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon'
    },
    appliedAt: Date
  },
  items: [cartItemSchema],
  total: {
    type: Number,
    default: 0
  },
  itemCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total items count
cartSchema.virtual('totalItems').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

/**
 * Helper method to calculate totals
 */
cartSchema.methods.calculateTotals = function () {
  // Calculate subtotal from items
  let subtotal = this.items.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);

  // Calculate total items count
  this.itemCount = this.items.reduce((sum, item) => sum + item.quantity, 0);

  // Apply coupon discount if exists
  if (this.appliedCoupon && this.appliedCoupon.discountAmount) {
    this.appliedCoupon.originalTotal = subtotal;
    this.appliedCoupon.discountedTotal = Math.max(0, subtotal - this.appliedCoupon.discountAmount);
    this.total = this.appliedCoupon.discountedTotal;
  } else {
    this.total = subtotal;
  }

  return this;
};

/**
 * Middleware to calculate totals before saving
 */
cartSchema.pre('save', function (next) {
  // Skip calculation if it's a new cart with no items
  if (this.isNew && (!this.items || this.items.length === 0)) {
    this.total = 0;
    this.itemCount = 0;
    return next();
  }

  // Calculate totals only when items or coupon are modified
  if (this.isModified('items') || this.isModified('appliedCoupon')) {
    this.calculateTotals();
  }

  // Update timestamp manually if not already done
  if (!this.isModified('updatedAt')) {
    this.updatedAt = Date.now();
  }

  next();
});

/**
 * Static method to get cart with populated products
 */
cartSchema.statics.getUserCart = async function (userId) {
  const cart = await this.findOne({ user: userId })
    .populate({
      path: 'items.product',
      select: 'title titleEn images price seller discountPercentage discountedPrice quantity stock',
      model: 'Product'
    });

  return cart;
};

/**
 * Static method to get cart item count
 */
cartSchema.statics.getCartItemCount = async function (userId) {
  const cart = await this.findOne({ user: userId });

  if (!cart || !cart.items) {
    return 0;
  }

  return cart.items.reduce((total, item) => total + item.quantity, 0);
};

/**
 * Method to update cart and save (for addToCart operations)
 */
cartSchema.methods.updateCart = async function () {
  this.calculateTotals();
  await this.save();
  return this;
};

export default mongoose.model('Cart', cartSchema);