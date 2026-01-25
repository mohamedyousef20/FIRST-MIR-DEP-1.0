import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  images: [{ type: String }],
  sizes: [{ type: String }],
  colors: [{
    name: { type: String, required: true },
    value: { type: String, required: true },
    available: { type: Boolean, default: true }
  }],
  price: { type: Number, required: true },
  discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
  discountedPrice: { type: Number, default: function () { return this.price; } },
  status: { type: String, enum: ['available', 'pending'], default: 'available' },
  sellerPercentage: { type: Number, default: 0 },
  quantity: { type: Number, default: 0, min: 0 },
  sold: { type: Number, default: 0 },
  isApproved: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  approvedAt: { type: Date },            
  rejectionReason: { type: String },      // نص سبب الرفض
  rejectionAt: { type: Date },            // تاريخ الرفض لحساب الحذف بعد يومين
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  isFeatured: { type: Boolean, default: false },
  // Indicates product belongs to a trusted seller
  sellerTrusted: { type: Boolean, default: false },

  // Rating statistics - automatically updated from Rating model
  ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
  ratingsQuantity: { type: Number, default: 0 },
  ratingsDistribution: {
    1: { type: Number, default: 0 },
    2: { type: Number, default: 0 },
    3: { type: Number, default: 0 },
    4: { type: Number, default: 0 },
    5: { type: Number, default: 0 }
  },

  // Detailed rating averages from Rating model
  detailedRatings: {
    productQuality: { type: Number, default: 0 },
    valueForMoney: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    shippingSpeed: { type: Number, default: 0 },
    packaging: { type: Number, default: 0 },
    sellerCommunication: { type: Number, default: 0 },
    sizeAccuracy: { type: Number, default: 0 },
    colorAccuracy: { type: Number, default: 0 }
  },

  // Additional metrics
  recommendationRate: { type: Number, default: 0 },
  verifiedReviewsCount: { type: Number, default: 0 },
  reviewsWithImagesCount: { type: Number, default: 0 },
  lastRatingAt: Date,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== VIRTUAL POPULATES =====

// All reviews for this product
productSchema.virtual('reviews', {
  ref: 'Rating',
  localField: '_id',
  foreignField: 'product'
});

// Approved reviews only
productSchema.virtual('approvedReviews', {
  ref: 'Rating',
  localField: '_id',
  foreignField: 'product',
  match: { status: 'approved' }
});

// Featured reviews
productSchema.virtual('featuredReviews', {
  ref: 'Rating',
  localField: '_id',
  foreignField: 'product',
  match: { isFeatured: true, status: 'approved' }
});

// Verified purchase reviews
productSchema.virtual('verifiedReviews', {
  ref: 'Rating',
  localField: '_id',
  foreignField: 'product',
  match: { verifiedPurchase: true, status: 'approved' }
});

// Reviews with images
productSchema.virtual('reviewsWithImages', {
  ref: 'Rating',
  localField: '_id',
  foreignField: 'product',
  match: {
    status: 'approved',
    'images.0': { $exists: true } // At least one image
  }
});

// Recent reviews (last 30 days)
productSchema.virtual('recentReviews', {
  ref: 'Rating',
  localField: '_id',
  foreignField: 'product',
  match: {
    status: 'approved',
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  }
});

// ===== VIRTUAL PROPERTIES =====

// Overall rating as stars (for display)
productSchema.virtual('ratingStars').get(function () {
  return {
    average: this.ratingsAverage,
    rounded: Math.round(this.ratingsAverage * 2) / 2, // Round to nearest 0.5
    fullStars: Math.floor(this.ratingsAverage),
    hasHalfStar: this.ratingsAverage % 1 >= 0.5,
    emptyStars: 5 - Math.ceil(this.ratingsAverage)
  };
});

// Rating percentage breakdown
productSchema.virtual('ratingPercentages').get(function () {
  const total = this.ratingsQuantity;
  if (total === 0) return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  return {
    1: Math.round((this.ratingsDistribution[1] / total) * 100),
    2: Math.round((this.ratingsDistribution[2] / total) * 100),
    3: Math.round((this.ratingsDistribution[3] / total) * 100),
    4: Math.round((this.ratingsDistribution[4] / total) * 100),
    5: Math.round((this.ratingsDistribution[5] / total) * 100)
  };
});

// Trust score based on review metrics
productSchema.virtual('trustScore').get(function () {
  let score = 0;

  // Base score from rating average
  score += this.ratingsAverage * 10;

  // Bonus for quantity of reviews
  if (this.ratingsQuantity >= 10) score += 10;
  if (this.ratingsQuantity >= 50) score += 10;
  if (this.ratingsQuantity >= 100) score += 10;

  // Bonus for verified purchases
  if (this.verifiedReviewsCount > 0) {
    const verifiedRatio = this.verifiedReviewsCount / this.ratingsQuantity;
    score += verifiedRatio * 20;
  }

  // Bonus for reviews with images
  if (this.reviewsWithImagesCount > 0) {
    const imagesRatio = this.reviewsWithImagesCount / this.ratingsQuantity;
    score += imagesRatio * 10;
  }

  return Math.min(100, Math.round(score));
});

// ===== STATIC METHODS =====

// Get products with populated reviews
productSchema.statics.findWithReviews = function (query = {}, options = {}) {
  const {
    limit = 10,
    skip = 0,
    sort = '-createdAt',
    includeReviews = false,
    reviewLimit = 5
  } = options;

  let pipeline = [
    { $match: query },
    { $sort: typeof sort === 'string' ? { [sort.replace('-', '')]: sort.startsWith('-') ? -1 : 1 } : sort },
    { $skip: skip },
    { $limit: limit }
  ];

  if (includeReviews) {
    pipeline.push(
      {
        $lookup: {
          from: 'ratings',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$product', '$$productId'] },
                status: 'approved'
              }
            },
            { $sort: { createdAt: -1 } },
            { $limit: reviewLimit },
            {
              $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'user'
              }
            },
            { $unwind: '$user' },
            {
              $project: {
                'user.password': 0,
                'user.__v': 0
              }
            }
          ],
          as: 'reviews'
        }
      }
    );
  }

  return this.aggregate(pipeline);
};

// Get products by rating range
productSchema.statics.findByRating = function (minRating = 0, maxRating = 5, options = {}) {
  return this.find({
    ratingsAverage: { $gte: minRating, $lte: maxRating },
    ratingsQuantity: { $gt: 0 }, // Only products with reviews
    ...options.query
  })
    .sort(options.sort || '-ratingsAverage')
    .limit(options.limit || 10)
    .skip(options.skip || 0);
};

// Get best rated products
productSchema.statics.findBestRated = function (limit = 10) {
  return this.find({
    ratingsQuantity: { $gte: 5 }, // Minimum 5 reviews
    ratingsAverage: { $gte: 4.0 } // At least 4 stars
  })
    .sort({ ratingsAverage: -1, ratingsQuantity: -1 })
    .limit(limit);
};

// ===== INSTANCE METHODS =====

// Get related products based on ratings
productSchema.methods.getRelatedByRating = function (limit = 5) {
  const Product = this.constructor;
  return Product.find({
    _id: { $ne: this._id },
    category: this.category,
    ratingsAverage: {
      $gte: Math.max(0, this.ratingsAverage - 1),
      $lte: Math.min(5, this.ratingsAverage + 1)
    },
    ratingsQuantity: { $gt: 0 }
  })
    .sort({ ratingsAverage: -1 })
    .limit(limit);
};

// Update rating statistics from Rating model
productSchema.methods.updateRatingStats = async function () {
  const Rating = mongoose.model('Rating');
  const stats = await Rating.calcAverageRatings(this._id);

  if (stats) {
    this.ratingsQuantity = stats.ratingsQuantity;
    this.ratingsAverage = stats.ratingsAverage;
    this.ratingsDistribution = stats.ratingsDistribution;
    this.detailedRatings = {
      productQuality: stats.avgProductQuality || 0,
      valueForMoney: stats.avgValueForMoney || 0,
      accuracy: stats.avgAccuracy || 0,
      shippingSpeed: stats.avgShippingSpeed || 0,
      packaging: stats.avgPackaging || 0,
      sellerCommunication: stats.avgSellerCommunication || 0,
      sizeAccuracy: stats.avgSizeAccuracy || 0,
      colorAccuracy: stats.avgColorAccuracy || 0
    };
    this.recommendationRate = stats.recommendationRate || 0;
    this.verifiedReviewsCount = stats.verifiedPurchaseCount || 0;
    this.reviewsWithImagesCount = stats.withImagesCount || 0;
    this.lastRatingAt = stats.ratingsQuantity > 0 ? new Date() : this.lastRatingAt;

    await this.save();
  }

  return this;
};

// Check if user has reviewed this product
productSchema.methods.hasUserReviewed = async function (userId) {
  const Rating = mongoose.model('Rating');
  const review = await Rating.findOne({
    product: this._id,
    user: userId
  });

  return review ? {
    exists: true,
    review: review,
    canEdit: review.status === 'pending' || review.status === 'approved'
  } : { exists: false };
};

// Get review summary for display
productSchema.methods.getReviewSummary = function () {
  return {
    totalReviews: this.ratingsQuantity,
    averageRating: this.ratingsAverage,
    ratingBreakdown: this.ratingPercentages,
    trustScore: this.trustScore,
    recommendationRate: this.recommendationRate,
    verifiedReviews: this.verifiedReviewsCount,
    reviewsWithImages: this.reviewsWithImagesCount,
    lastReviewDate: this.lastRatingAt
  };
};

// ===== MIDDLEWARE =====

// Set sellerTrusted flag based on seller's trust status before save
productSchema.pre('save', async function (next) {
  if (this.isModified('seller') || this.isNew) {
    try {
      const User = mongoose.model('User');
      const seller = await User.findById(this.seller).select('isTrustedSeller');
      this.sellerTrusted = seller?.isTrustedSeller || false;
    } catch (err) {
      // In case of any error, default to false but do not block save
      this.sellerTrusted = false;
    }
  }
  next();
});

// Update discounted price before save
productSchema.pre('save', function (next) {
  if (this.isModified('price') || this.isModified('discountPercentage')) {
    const discountAmount = this.price * (this.discountPercentage / 100);
    this.discountedPrice = Math.round((this.price - discountAmount) * 100) / 100;
  }
  next();
});

// Update timestamp before save
productSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Update rating stats when product is loaded (optional)
productSchema.post('find', async function (docs) {
  // You can choose to auto-update rating stats here if needed
  // This might be performance intensive for large queries
});

// ===== INDEXES =====
// Full-text index for efficient search
productSchema.index(
  { title: 'text', description: 'text' },
  {
    name: 'product_fulltext',
    default_language: 'arabic',
    weights: { title: 10, description: 3 }
  }
);

// Covered index for frequent filters (approved + status + category + price)
productSchema.index({ isApproved: 1, status: 1, category: 1, price: 1 }, { name: 'filter_cover_idx' });

productSchema.index({ seller: 1, createdAt: -1 });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ isFeatured: 1, status: 1 });
productSchema.index({ ratingsAverage: -1, ratingsQuantity: -1 });
productSchema.index({ 'colors.value': 1 });
productSchema.index({ 'detailedRatings.productQuality': -1 });
productSchema.index({ trustScore: -1 }); // Virtual, but useful if materialized
productSchema.index({ lastRatingAt: -1 });

export default mongoose.model('Product', productSchema);