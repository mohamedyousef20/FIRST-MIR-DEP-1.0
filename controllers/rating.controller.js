import Rating from '../models/rating.model.js';
import Product from '../models/product.model.js';
import { createError } from '../utils/error.js';
import asyncHandler from 'express-async-handler';

const RATING_EXISTS_MESSAGE = 'تم تقيم المنتج من قبل .';
const RATING_NOT_FOUND_MESSAGE = 'Rating not found.';

const formatUserName = (userDoc) => {
  if (!userDoc) return 'Unknown User';
  const parts = [userDoc.firstName, userDoc.lastName].filter(Boolean);
  const fullName = parts.join(' ').trim();
  return fullName || 'Unknown User';
};

const formatRatingResponse = (ratingDoc) => {
  const rating = ratingDoc.toObject({ getters: true, virtuals: true });
  return {
    id: rating._id,
    rating: rating.rating,
    comment: rating.comment,
    createdAt: rating.createdAt,
    updatedAt: rating.updatedAt,
    user: rating.user
      ? {
        id: rating.user._id,
        name: formatUserName(rating.user)
      }
      : null
  };
};

const validateRatingValue = (value) => Number.isInteger(value) && value >= 1 && value <= 5;

export const addRating = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;
  //console.log(productId, 'ids')

  const numericRating = Number(rating);
  if (!validateRatingValue(numericRating)) {
    return next(createError('Rating must be an integer between 1 and 5.', 400));
  }

  const product = await Product.findById(productId).select('_id seller');
  if (!product) {
    return next(createError('Product not found.', 404));
  }

  const existingRating = await Rating.findOne({
    product: productId,
    user: req.user._id
  });

  if (existingRating) {
    return next(createError(RATING_EXISTS_MESSAGE, 400));
  }

  const newRating = await Rating.create({
    product: product._id,
    seller: product.seller,
    user: req.user._id,
    rating: numericRating,
    comment: typeof comment === 'string' ? comment.trim() : undefined
  });

  await newRating.populate({ path: 'user', select: 'firstName lastName' });

  const summary = await Rating.calcAverageRatings(product._id);

  return res.status(201).json({
    success: true,
    data: {
      rating: formatRatingResponse(newRating),
      productAverage: summary.ratingsAverage
    }
  });
});

export const getProductRatings = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const product = await Product.findById(productId).select('ratingsAverage');
  if (!product) {
    return next(createError('Product not found.', 404));
  }

  const ratings = await Rating.find({ product: productId })
    .sort({ createdAt: -1 })
    .populate({ path: 'user', select: 'firstName lastName' });

  const formattedRatings = ratings.map(formatRatingResponse);
  //console.log(formattedRatings,'rats')
  return res.status(200).json({
    success: true,
    data: {
      ratings: formattedRatings,
      averageRating: product.ratingsAverage,
      total: formattedRatings.length
    }
  });
});

export const updateRating = asyncHandler(async (req, res, next) => {
  const { productId, ratingId } = req.params;
  const { rating, comment } = req.body;

  const existingRating = await Rating.findById(ratingId);
  if (!existingRating || existingRating.product.toString() !== productId) {
    return next(createError(RATING_NOT_FOUND_MESSAGE, 404));
  }

  if (existingRating.user.toString() !== req.user._id.toString()) {
    return next(createError('You are not allowed to update this rating.', 403));
  }

  const updates = {};

  if (rating !== undefined) {
    const numericRating = Number(rating);
    if (!validateRatingValue(numericRating)) {
      return next(createError('Rating must be an integer between 1 and 5.', 400));
    }
    updates.rating = numericRating;
  }

  if (comment !== undefined) {
    if (comment !== null && typeof comment !== 'string') {
      return next(createError('Comment must be a string.', 400));
    }
    updates.comment = typeof comment === 'string' ? comment.trim() : undefined;
  }

  if (!Object.keys(updates).length) {
    return next(createError('Nothing to update.', 400));
  }

  Object.assign(existingRating, updates);
  await existingRating.save();
  await existingRating.populate({ path: 'user', select: 'firstName lastName' });

  const summary = await Rating.calcAverageRatings(productId);

  return res.status(200).json({
    success: true,
    data: {
      rating: formatRatingResponse(existingRating),
      productAverage: summary.ratingsAverage
    }
  });
});

export const deleteRating = asyncHandler(async (req, res, next) => {
  const { productId, ratingId } = req.params;

  const ratingDoc = await Rating.findById(ratingId);
  if (!ratingDoc || ratingDoc.product.toString() !== productId) {
    return next(createError(RATING_NOT_FOUND_MESSAGE, 404));
  }

  if (ratingDoc.user.toString() !== req.user._id.toString()) {
    return next(createError('You are not allowed to delete this rating.', 403));
  }

  await ratingDoc.populate({ path: 'user', select: 'firstName lastName' });
  const formatted = formatRatingResponse(ratingDoc);

  await ratingDoc.deleteOne();
  const summary = await Rating.calcAverageRatings(productId);

  return res.status(200).json({
    success: true,
    data: {
      rating: formatted,
      productAverage: summary.ratingsAverage
    }
  });
});