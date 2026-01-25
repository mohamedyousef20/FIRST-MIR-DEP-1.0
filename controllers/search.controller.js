import Product from '../models/product.model.js';
import Category from '../models/category.model.js';
import Brand from '../models/brand.model.js';
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import { searchCache } from '../utils/cache.js';
import logger from '../utils/logger.js';

/**
 * ============================================
 * PRODUCT SEARCH SYSTEM
 * ============================================
 * 
 * Features:
 * - MongoDB text search (when index exists)
 * - Regex fallback for Arabic and short queries
 * - Multi-field search (title, description, brand, category)
 * - Relevance scoring
 * - Caching for performance
 * - Support for filters and sorting
 */

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Escape special regex characters
 */
const escapeRegex = (str) => {
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Check if string is Arabic
 */
const isArabic = (text) => {
  return /^[\u0600-\u06FF\s]+$/.test(text);
};

/**
 * Check if MongoDB text index exists
 */
const hasTextIndex = async () => {
  try {
    const indexes = await Product.collection.getIndexes();
    return Object.keys(indexes).some(key =>
      indexes[key].text || indexes[key].weights
    );
  } catch (err) {
    logger.warn('Error checking text index:', err.message);
    return false;
  }
};

/**
 * Build search conditions for regex-based search
 */
const buildRegexSearchConditions = (searchTerm) => {
  const trimmed = searchTerm.trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const escapedWords = words.map(w => escapeRegex(w));
  const wordPattern = escapedWords.join('|');

  const conditions = [];

  // Title search - prioritize exact start matches
  if (words.length === 1) {
    const word = escapedWords[0];
    conditions.push(
      { title: { $regex: `^${word}`, $options: 'i' } },      // Starts with
      { title: { $regex: word, $options: 'i' } }              // Contains
    );
  } else {
    // Multiple words - match all words in title
    conditions.push({ title: { $regex: wordPattern, $options: 'i' } });
  }

  // Description search - match any word
  conditions.push({ description: { $regex: wordPattern, $options: 'i' } });

  return conditions;
};

/**
 * Find brand IDs matching search term
 */
const findMatchingBrands = async (searchTerm) => {
  try {
    const escaped = escapeRegex(searchTerm);
    const brands = await Brand.find({
      status: 'active',
      name: { $regex: escaped, $options: 'i' }
    }).select('_id').lean();

    return brands.map(b => b._id);
  } catch (err) {
    logger.warn('Error searching brands:', err.message);
    return [];
  }
};

/**
 * Find category IDs matching search term
 */
const findMatchingCategories = async (searchTerm) => {
  try {
    const escaped = escapeRegex(searchTerm);
    const categories = await Category.find({
      status: 'active',
      name: { $regex: escaped, $options: 'i' }
    }).select('_id').lean();

    return categories.map(c => c._id);
  } catch (err) {
    logger.warn('Error searching categories:', err.message);
    return [];
  }
};

/**
 * Build complete search query
 */
const buildSearchQuery = async (searchTerm, baseFilter) => {
  const trimmed = searchTerm.trim();
  if (!trimmed) return baseFilter;

  const textIndexExists = await hasTextIndex();
  const isArabicText = isArabic(trimmed);

  // Use MongoDB text search if:
  // 1. Text index exists
  // 2. Query is not pure Arabic (text search works better with English/Latin)
  // 3. Query length > 2 characters
  if (textIndexExists && !isArabicText && trimmed.length > 2) {
    try {
      return {
        ...baseFilter,
        $text: { $search: trimmed }
      };
    } catch (err) {
      logger.warn('Text search failed, falling back to regex:', err.message);
    }
  }

  // Fallback to regex-based search
  const regexConditions = buildRegexSearchConditions(trimmed);

  // Add brand and category search
  const [brandIds, categoryIds] = await Promise.all([
    findMatchingBrands(trimmed),
    findMatchingCategories(trimmed)
  ]);

  // Combine all search conditions
  const allConditions = [...regexConditions];

  if (brandIds.length > 0) {
    allConditions.push({ brand: { $in: brandIds } });
  }

  if (categoryIds.length > 0) {
    allConditions.push({ category: { $in: categoryIds } });
  }

  return {
    ...baseFilter,
    $or: allConditions
  };
};

/**
 * Determine sort order based on search type
 */
const getSortOrder = (mongoQuery, searchTerm) => {
  // If using text search, sort by relevance score
  if (mongoQuery.$text) {
    return { score: { $meta: 'textScore' }, createdAt: -1 };
  }

  // For regex searches, prioritize by:
  // 1. Title matches (exact start)
  // 2. Ratings
  // 3. Creation date
  return {
    ratingsAverage: -1,
    ratingsQuantity: -1,
    createdAt: -1
  };
};

/**
 * Execute search with fallback handling
 */
const executeSearch = async (mongoQuery, sortObj, skip, limit) => {
  try {
    console.log('Search query raw:', mongoQuery);

    const aggResult = await Product.aggregate([
      { $match: mongoQuery },
      {
        $facet: {
          docs: [
            { $sort: sortObj },
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'categories',
                localField: 'category',
                foreignField: '_id',
                as: 'category',
                pipeline: [{ $project: { name: 1 } }]
              }
            },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'brands',
                localField: 'brand',
                foreignField: '_id',
                as: 'brand',
                pipeline: [{ $project: { name: 1 } }]
              }
            },
            { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
            { $project: { title: 1, price: 1, discountedPrice: 1, images: 1, ratingsAverage: 1, ratingsQuantity: 1, createdAt: 1, 'category.name': 1, 'brand.name': 1, sellerTrusted: 1 } }
          ],
          meta: [ { $count: 'total' } ]
        }
      }
    ]);
    const total = aggResult[0]?.meta[0]?.total || 0;
    let products = aggResult[0]?.docs || [];

    return { total, products };

  } catch (err) {
    // If text search fails, fall back to regex
    if (err.message && (err.message.includes('text index') || err.message.includes('$text'))) {
      logger.warn('Text search failed, using regex fallback');

      // Extract search term from error context or use simple regex
      const searchTerm = mongoQuery.$text?.$search || '';
      const escaped = escapeRegex(searchTerm);

      const fallbackQuery = {
        isApproved: true,
        status: 'available',
        isActive: true,
        $or: [
          { title: { $regex: escaped, $options: 'i' } },
          { description: { $regex: escaped, $options: 'i' } }
        ]
      };

      const total = await Product.countDocuments(fallbackQuery);
      const products = await Product.find(fallbackQuery)
        .select('title price discountedPrice images ratingsAverage ratingsQuantity createdAt category brand sellerTrusted')
        .populate('category', 'name')
        .populate('brand', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return { total, products };
    }

    throw err;
  }
};

export const searchProducts = asyncHandler(async (req, res) => {
  // Validate search query
console.log('search787')
  const qRaw = (req.query.q || '').toString().trim();
  if (!qRaw) {
    res.status(400);
    throw new Error('Search query parameter "q" is required');
  }
  console.log('Search query raw:', qRaw);

  // Pagination variables from middleware
  const { skip, limit, page } = res.locals.pagination;

  // Build base filter
  const baseFilter = {
    isApproved: true,
    status: 'available',
    isActive: true
  };

  // Add optional filters
  if (req.query.category && mongoose.isValidObjectId(req.query.category)) {
    baseFilter.category = new mongoose.Types.ObjectId(req.query.category);
  }

  if (req.query.brand && mongoose.isValidObjectId(req.query.brand)) {
    baseFilter.brand = new mongoose.Types.ObjectId(req.query.brand);
  }

  if (req.query.minPrice || req.query.maxPrice) {
    baseFilter.price = {};
    if (req.query.minPrice) {
      baseFilter.price.$gte = parseFloat(req.query.minPrice);
    }
    if (req.query.maxPrice) {
      baseFilter.price.$lte = parseFloat(req.query.maxPrice);
    }
  }

  // Build search query
  const mongoQuery = await buildSearchQuery(qRaw, baseFilter);

  // Determine sort order
  let sortObj = getSortOrder(mongoQuery, qRaw);

  // Handle custom sort parameter
  if (req.query.sort) {
    switch (req.query.sort) {
      case 'newest':
        sortObj = { createdAt: -1 };
        break;
      case 'priceAsc':
        sortObj = { price: 1, createdAt: -1 };
        break;
      case 'priceDesc':
        sortObj = { price: -1, createdAt: -1 };
        break;
      case 'rating':
        sortObj = { ratingsAverage: -1, ratingsQuantity: -1, createdAt: -1 };
        break;
      default:
        // Keep default sort
        break;
    }
  }

  // Check cache
  const cacheKey = `search:v5:${JSON.stringify({
    query: qRaw,
    page,
    limit,
    filters: baseFilter,
    sort: req.query.sort
  })}`;

  const cached = await searchCache.get(cacheKey);
  if (cached) {
    logger.debug('Search cache hit', { query: qRaw, page });
    return res.json({
      success: true,
      ...cached,
      cached: true
    });
  }

  // Execute search
  const { total, products } = await executeSearch(mongoQuery, sortObj, skip, limit);

  // Format response
  const result = {
    success: true,
    products,
    query: qRaw,
    pagination: res.locals.buildLinks(total)
  };

  // Cache result for 5 minutes
  await searchCache.set(cacheKey, result, 300);

  logger.info('Search completed', {
    query: qRaw,
    results: products.length,
    total
  });

  res.json(result);
});
