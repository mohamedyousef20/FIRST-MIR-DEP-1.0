import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    quantity: Number,
    price: Number,
    color: String,
    size: String,
    isPrepared: { type: Boolean, default: false }
  }],

  // Recipient Information (can be different from buyer)
  recipientInfo: {
    fullName: {
      type: String,
      required: true
    },
    phoneNumber: {
      type: String,
      required: true
    }
  },

  // Delivery Information
  deliveryAddress: {
    type: String
  },
  pickupPoint: {
    type: mongoose.Schema.Types.Mixed
  },
  deliveryInfo: {
    address: String,
    pickupPoint: mongoose.Schema.Types.Mixed
  },

  paymentMethod: {
    type: String,
    enum: ['cash', 'card','wallet'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  coupon: {
    code: String,
    discountAmount: Number,
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon'
    }
  },
  payoutDate: { type: Date },
  paymentData: mongoose.Schema.Types.Mixed,

  // Order Totals
  subtotal: Number,
  shippingFee: Number,
  total: Number,

  deliveryMethod: {
    type: String,
    enum: ['home', 'pickup'],
    default: 'home'
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },

  deliveredAt: {
    type: Date
  },
  payoutProcessed: {
    type: Boolean,
    default: false
  },
  isPrepared: {
    type: Boolean,
    default: false
  },
  secretCode: {
    type: String,
    unique: true,
    required: true,
  },

  // Order status management
  cancelCount: {
    type: Number,
    default: 0,
    max: 1
  },
  activateCount: {
    type: Number,
    default: 0,
    max: 1
  },
  wasCanceled: {
    type: Boolean,
    default: false
  },
  wasActivated: {
    type: Boolean,
    default: false
  },
  cancelDate: Date,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ Middleware to auto-populate seller and product for all find queries
orderSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'items.seller',
    select: 'firstName lastName email phone wallet'
  }).populate({
    path: 'items.product',
    select: 'title price images'
  }).populate({
    path: 'buyer',
    select: 'firstName lastName email phone'
  }).populate({
    path: 'deliveryInfo.pickupPoint',
    select: 'stationName address phone'
  });
  next();
});

export default mongoose.model('Order', orderSchema);