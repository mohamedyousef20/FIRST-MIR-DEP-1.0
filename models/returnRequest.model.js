import mongoose from 'mongoose';

const returnRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
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
  reason: {
    type: String,
    required: true
  },
  images: {
    type: [String],
    default: []
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'processing', 'ready_for_pickup', 'received', 'rejected', 'finished'],
    default: 'pending'
  },
  deleteAt: {
    type: Date,
    default: null
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-populate multiple fields for all find queries
returnRequestSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'seller',
    select: 'firstName lastName email phone'
  })
  next();
});

// تحديث updatedAt عند كل حفظ
returnRequestSchema.pre('save', function (next) {
  this.updatedAt = new Date();

  // إذا تغيرت الحالة إلى finished، ضع تاريخ الحذف بعد 90 يوم
  if (this.isModified('status') && this.status === 'finished') {
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
    this.deleteAt = ninetyDaysFromNow;
  }

  // إذا تغيرت الحالة من finished، أزل تاريخ الحذف
  if (this.isModified('status') && this.status !== 'finished' && this.deleteAt) {
    this.deleteAt = null;
  }

  next();
});

// إنشاء index لتسريع عملية البحث عن الطلبات المنتهية الصلاحية
returnRequestSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('ReturnRequest', returnRequestSchema);