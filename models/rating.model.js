import mongoose from 'mongoose';

const ratingSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer value'
      }
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Prevent duplicate reviews
ratingSchema.index({ product: 1, user: 1 }, { unique: true });

// Static method to calculate average ratings for a product
ratingSchema.statics.calcAverageRatings = async function (productId) {
  const normalizedProductId =
    typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;

  const stats = await this.aggregate([
    {
      $match: { product: normalizedProductId },
    },
    {
      $group: {
        _id: '$product',
        nRating: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]);

  const summary = {
    ratingsQuantity: stats[0]?.nRating || 0,
    ratingsAverage: stats[0]?.avgRating || 0,
  };

  await this.model('Product').findByIdAndUpdate(productId, {
    ratingsQuantity: summary.ratingsQuantity,
    ratingsAverage: summary.ratingsAverage,
    lastRatingAt: summary.ratingsQuantity ? new Date() : null,
  });

  return summary;
};

const Rating = mongoose.model('Rating', ratingSchema);

export default Rating;
