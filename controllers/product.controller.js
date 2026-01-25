import Product from '../models/product.model.js';
import mongoose from 'mongoose';
import Notification from '../models/notification.model.js';
import asyncHandler from 'express-async-handler';
import User from '../models/user.model.js';
import { createError } from '../utils/error.js';
import { searchCache } from '../utils/cache.js';

const defaultDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatProductResponse = (productDoc) => {
  if (!productDoc) return productDoc;
  const product = productDoc.toObject ? productDoc.toObject({ virtuals: true }) : productDoc;
  const distribution = product.ratingsDistribution || {};

  return {
    ...product,
    ratings: {
      average: product.ratingsAverage ?? 0,
      count: product.ratingsQuantity ?? 0,
      distribution: {
        1: distribution[1] ?? defaultDistribution[1],
        2: distribution[2] ?? defaultDistribution[2],
        3: distribution[3] ?? defaultDistribution[3],
        4: distribution[4] ?? defaultDistribution[4],
        5: distribution[5] ?? defaultDistribution[5]
      }
    }
  };
};

const formatProductsArray = (products = []) => products.map(formatProductResponse);

// Middleware functions 
export const createFilterObj = (req, res, next) => {
  let filterObj = {};

  const {
    minPrice,
    maxPrice,
    isApproved,
    status,
    search,
    category,
    isFeatured,
    discountPercentage,
  } = req.query;

  if (minPrice || maxPrice) {
    filterObj.price = {};
    if (minPrice) {
      filterObj.price.$gte = parseFloat(minPrice);
    }
    if (maxPrice) {
      filterObj.price.$lte = parseFloat(maxPrice);
    }
  }

  if (isApproved !== undefined) {
    filterObj.isApproved = isApproved === 'true';
  }

  if (status) {
    filterObj.status = status;
  }

  if (isFeatured !== undefined) {
    filterObj.isFeatured = isFeatured === 'true';
  }

  if (discountPercentage) {
    filterObj.discountPercentage = { $gte: parseFloat(discountPercentage) };
  }

  if (req.params.categoryId) {
    //console.log('Filtering by category from params:', req.params.categoryId);
    filterObj.category = req.params.categoryId;
  }
  else if (category) {
    const categoryIds = String(category).split(',').map(id => id.trim()).filter(Boolean);
    if (categoryIds.length > 1) {
      filterObj.category = { $in: categoryIds.map(id => new mongoose.Types.ObjectId(id)) };
    } else if (categoryIds.length === 1) {
      filterObj.category = new mongoose.Types.ObjectId(categoryIds[0]);
    }
  }

  if (search && search.trim()) {
    const trimmed = search.trim();
    if (!/^[\u0600-\u06FF\s]+$/.test(trimmed) && trimmed.length > 2) {
      filterObj.$text = { $search: trimmed };
    } else {
      const escaped = escapeRegex(trimmed);
      filterObj.$or = [
        { title: { $regex: `^${escaped}`, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } }
      ];
    }
  }

  req.filterObj = filterObj;
  next();
};

export const createSortObj = (req, res, next) => {
  let sortObj = {};

  if (req.query.sort) {
    const sortFields = req.query.sort.split(',');

    sortFields.forEach(field => {
      const sortOrder = field.startsWith('-') ? -1 : 1;
      const fieldName = field.replace(/^-/, '');
      sortObj[fieldName] = sortOrder;
    });
  } else {
    sortObj.createdAt = -1;
  }

  req.sortObj = sortObj;
  next();
};

export const createProduct = asyncHandler(async (req, res) => {
  const productData = req.body.data || req.body;

  //console.log('Product Data:', productData);

  if (!productData.title || !productData.description || !productData.price || !productData.category) {
    res.status(400);
    throw new Error('Missing required fields: title, description, price, and category are required');
  }

  if (!productData.images || !Array.isArray(productData.images) || productData.images.length === 0) {
    res.status(400);
    throw new Error('At least one image is required');
  }

  let sizes = [];
  if (productData.sizes) {
    if (typeof productData.sizes === 'string') {
      try {
        sizes = JSON.parse(productData.sizes);
      } catch (error) {
        //console.log('Failed to parse sizes as JSON, using as array');
        sizes = Array.isArray(productData.sizes) ? productData.sizes : [productData.sizes];
      }
    } else if (Array.isArray(productData.sizes)) {
      sizes = productData.sizes;
    }
  }

  let colors = [];
  if (productData.colors) {
    if (typeof productData.colors === 'string') {
      try {
        colors = JSON.parse(productData.colors);
      } catch (error) {
        //console.log('Failed to parse colors as JSON, using as array');
        colors = Array.isArray(productData.colors) ? productData.colors : [productData.colors];
      }
    } else if (Array.isArray(productData.colors)) {
      colors = productData.colors;
    }

    if (colors.length > 0) {
      const isValidColors = colors.every(color =>
        color &&
        typeof color === 'object' &&
        color.name &&
        color.value
      );

      if (!isValidColors) {
        res.status(400);
        throw new Error('Invalid colors format. Each color must have name and value properties');
      }

      colors = colors.map(color => ({
        name: color.name,
        value: color.value,
        available: color.available !== undefined ? color.available : true
      }));
    }
  }

  const price = parseFloat(productData.price);
  const discountPercentage = parseFloat(productData.discountPercentage) || 0;
  const discountAmount = price * (discountPercentage / 100);
  const discountedPrice = price - discountAmount;

  const product = await Product.create({
    seller: req.user._id,
    title: productData.title,
    description: productData.description,
    images: productData.images,
    sizes: sizes,
    colors: colors,
    price: price,
    discountPercentage: discountPercentage,
    discountedPrice: discountedPrice,
    category: productData.category,
    status: productData.status || 'pending',
    sellerPercentage: discountedPrice * 0.88,
    isFeatured: productData.isFeatured === 'true' || productData.isFeatured === true,
    quantity: parseInt(productData.quantity) || 0
  });

  await product.populate('category', 'name nameEn');
  await product.populate('seller', 'firstName lastName email');

  const seller = req.user;
  const notificationPromises = [];

  // Admin notifications
  const adminUsers = await User.find({ role: 'admin' });
  adminUsers.forEach(admin => {
    const adminNotification = new Notification({
      userId: admin._id,
      role: 'admin',
      type: 'PRODUCT_CREATED',
      title: 'منتج جديد مقدم للاعتماد',
      message: `البائع ${seller.firstName} ${seller.lastName} قام بتقديم منتج جديد #`,
      link: `/admin/dashboard`,
    });
    notificationPromises.push(adminNotification.save().catch(error =>
      console.error('Failed to save admin notification:', error)
    ));
  });

  // Wait for all notifications to be processed (but don't fail the request if notifications fail)
  await Promise.allSettled(notificationPromises);

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    product: product
  });
});

export const getProductsForAdmin = asyncHandler(async (req, res) => {
  //console.log('1122');

  const { skip, limit, page } = res.locals.pagination; // from pagination middleware || 1;
  // limit from middleware || 10;
  // skip calculated by middleware

  const filter = { ...(req.filterObj || {}) };
  //console.log('Final Admin Filter:', filter);

  const total = await Product.countDocuments(filter);

  const products = await Product.find(filter)
    .populate('seller', 'firstName lastName email')
    .populate('category', 'name nameEn')
    .sort(req.sortObj || { createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    products,
    pagination: res.locals.buildLinks(total)
  });
});


export const getProducts = asyncHandler(async (req, res) => {
  //console.log('Getting products with filter...');

  const { skip, limit, page } = res.locals.pagination; // from pagination middleware || 1;
  // limit from middleware || 12;
  // skip calculated by middleware

  // بناء كائن الفلتر الأساسي
  const filter = {
    isApproved: true,
    isActive: true,
    status: 'available',
    ...(req.filterObj || {})
  };

  // معالجة معلمة exclude لاستبعاد منتج واحد
  if (req.query.exclude) {
    const excludeId = req.query.exclude.toString().trim();

    // التحقق من صحة معرف المنتج
    if (mongoose.Types.ObjectId.isValid(excludeId)) {
      filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }
  }

  //console.log('Final filter object:', filter);

  
  const total = await Product.countDocuments(filter);
  console.log(total, 'total')
  console.log(skip, 'skip')
  console.log(page, 'page')
  const products = await Product.find(filter)
    .populate('category', 'name nameEn')
    .sort(req.sortObj || { approvedAt: -1 })
    .skip(skip)
    .limit(limit);

  const formattedProducts = formatProductsArray(products);

  res.json({
    success: true,
    products: formattedProducts,
    pagination: res.locals.buildLinks(total)
  });
});

export const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId)
    .populate('category', '_id name nameEn description descriptionEn');

  //console.log(product, 'prod***************');

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  res.json({
    success: true,
    product: formatProductResponse(product)
  });
});

export const getFeaturedProducts = asyncHandler(async (req, res) => {
  //console.log('in featured ');

  const products = await Product.find({
    isApproved: true,
    isFeatured: true,
    isActive: true,
    status: 'available'
  })
    .populate('seller', 'firstName lastName')
    .populate('category', 'name nameEn')
    .sort({ createdAt: -1 })
    .limit(8);

  res.json({
    success: true,
    products: formatProductsArray(products)
  });
});

export const getNewArrivals = asyncHandler(async (req, res) => {
  const products = await Product.find({
    isApproved: true,
    isActive: true,
    status: 'available'
  })
    .populate('category', 'name')
    .sort({ approvedAt: -1 })
    .limit(8);

  res.json({
    success: true,
    products: formatProductsArray(products)
  });
});

export const getProductsByCategory = asyncHandler(async (req, res) => {
  //console.log('category');

  const { categoryId } = req.params;
  const { skip, limit, page } = res.locals.pagination; // from pagination middleware || 1;
  // limit from middleware || 12;
  // skip calculated by middleware

  const filter = {
    isApproved: true,
    isActive: true,
    status: 'available',
    category: categoryId,
    ...(req.filterObj || {})
  };

  const total = await Product.countDocuments(filter);

  const products = await Product.find(filter)
    .sort(req.sortObj || { createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    products: formatProductsArray(products),
    pagination: res.locals.buildLinks(total)
  });
});

// Get products by brand (nested route)
export const getProductsByBrand = asyncHandler(async (req, res) => {
  const { brandId } = req.params;
  const { skip, limit, page } = res.locals.pagination; // from pagination middleware || 1;
  // limit from middleware || 12;
  // skip calculated by middleware

  const filter = {
    isApproved: true,
    isActive: true,
    status: 'available',
    brand: brandId,
    ...(req.filterObj || {})
  };

  const total = await Product.countDocuments(filter);

  const products = await Product.find(filter)
    .sort(req.sortObj || { createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    products: formatProductsArray(products),
    pagination: res.locals.buildLinks(total)
  });
});

export const approveProduct = asyncHandler(async (req, res) => {
  const { id } = req.body;

  const product = await Product.findByIdAndUpdate(
    id,
    {
      isApproved: true,
      approvedAt: Date.now()
    },
    { new: true }
  ).populate('category', 'name nameEn')
    .populate('seller', 'firstName lastName');

  if (!product) {
    return next(createError('المنتج غير موجود', 404));
  }

  try {
    await Notification.create({
      userId: product.seller,
      role: 'seller',
      type: 'PRODUCT_APPROVED',
      title: '✅ تم اعتماد المنتج',
      message: `تمت موافقة الإدارة على منتجك "${product.title}" ويمكن الآن عرضه للمستخدمين`,
      data: { productId: product._id },
      link: `/products/${product._id}`
    });
  } catch (notifErr) {
    console.error('Failed to notify seller of approval', notifErr);
  }

  res.json({
    success: true,
    message: 'تم الموافقة على المنتج',
    product
  });
});

// ===================== Reject product =====================
export const rejectProduct = asyncHandler(async (req, res, next) => {
  const { id, reason } = req.body;
  if (!id || !reason) {
    res.status(400);
    throw new Error('Product id and rejection reason are required');
  }

  // Update product approval fields
  const product = await Product.findByIdAndUpdate(
    id,
    {
      isApproved: false,
      rejectionReason: reason,
      rejectionAt: Date.now(),
    },
    { new: true }
  ).populate('seller', 'firstName lastName');

  if (!product) {
    return next(createError('المنتج غير موجود', 404));
  }

  // Notify seller
  try {
    await Notification.create({
      userId: product.seller,
      role: 'seller',
      type: 'CUSTOM',
      title: '🛑 تم رفض المنتج',
      message: `تم رفض منتجك "${product.title}". السبب: ${reason}`,
      data: { productId: product._id },
      link: `/products/${product._id}`
    });
  } catch (notifErr) {
    console.error('Failed to notify seller of rejection', notifErr);
  }

  res.json({
    success: true,
    message: 'تم رفض المنتج',
    product
  });
});

export const getSellerProducts = asyncHandler(async (req, res) => {
  const { skip, limit, page } = res.locals.pagination; // from pagination middleware || 1;
  // limit from middleware || 10;
  // skip calculated by middleware

  const filter = {
    seller: req.user._id,
    ...(req.filterObj || {})
  };

  //console.log('Filter for seller products:', filter);

  const total = await Product.countDocuments(filter);

  const products = await Product.find(filter)
    .populate('category', 'name nameEn')
    .sort(req.sortObj || { createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    products,
    pagination: res.locals.buildLinks(total)
  });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('المنتج غير موجود');
  }

  if (product.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('غير مصرح لك بحذف هذا المنتج');
  }

  await Product.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'تم حذف المنتج بنجاح'
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const productId = req.params.id;
  const updates = req.body;

  const product = await Product.findById(productId);

  if (!product) {
    res.status(404);
    throw new Error('المنتج غير موجود');
  }

  if (product.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('غير مصرح لك بتحديث هذا المنتج');
  }

  if (updates.images && Array.isArray(updates.images)) {
    product.images = updates.images;
  }

  if (updates.sizes !== undefined) {
    let sizes = [];
    if (typeof updates.sizes === 'string') {
      try {
        sizes = JSON.parse(updates.sizes);
      } catch (error) {
        sizes = Array.isArray(updates.sizes) ? updates.sizes : [updates.sizes];
      }
    } else if (Array.isArray(updates.sizes)) {
      sizes = updates.sizes;
    }
    product.sizes = sizes;
  }

  if (updates.price !== undefined || updates.discountPercentage !== undefined) {
    const price = updates.price !== undefined ? parseFloat(updates.price) : product.price;
    const discountPercentage = updates.discountPercentage !== undefined ? parseFloat(updates.discountPercentage) : product.discountPercentage;

    const discountAmount = price * (discountPercentage / 100);
    const discountedPrice = price - discountAmount;

    product.price = price;
    product.discountPercentage = discountPercentage;
    product.discountedPrice = discountedPrice;
  }

  const allowedUpdates = [
    'title', 'description', 'status', 'quantity',
    'category', 'isFeatured', 'sellerPercentage'
  ];

  allowedUpdates.forEach(key => {
    if (updates[key] !== undefined) {
      if (key === 'quantity' || key === 'sellerPercentage') {
        product[key] = parseFloat(updates[key]);
      } else if (key === 'isFeatured') {
        product[key] = updates[key] === 'true' || updates[key] === true;
      } else {
        product[key] = updates[key];
      }
    }
  });

  if (req.user.role !== 'admin') {
    product.isApproved = false;
    product.status = 'pending';
  }

  const updatedProduct = await product.save();

  if (req.user.role !== 'admin') {
    try {
      const admins = await User.find({ role: 'admin' }).select('_id');
      if (admins.length) {
        const adminNotification = admins.map((ad) => ({
          userId: ad._id,
          role: 'admin',
          type: 'PRODUCT_EDIT_REQUIRES_APPROVAL',
          title: 'مراجعة منتج معدَّل',
          message: `المنتج "${updatedProduct.title}" بحاجة إلى موافقتك بعد التعديل`,
          data: { productId: updatedProduct._id },
          link: `/ admin / products / ${updatedProduct._id}`
        }));
        await Notification.insertMany(adminNotification);
      }

      await Notification.create({
        userId: req.user._id,
        role: 'seller',
        type: 'PRODUCT_EDIT_REQUIRES_APPROVAL',
        title: 'بانتظار موافقة الإدارة',
        message: `تم إرسال تعديلات المنتج "${updatedProduct.title}" للمراجعة.سيتم إشعارك عند الموافقة أو الرفض`,
        data: { productId: updatedProduct._id },
        link: `/seller/products / ${updatedProduct._id}`
      });
    } catch (notifErr) {
      console.error('Failed to create product edit notifications', notifErr);
    }
  }

  await updatedProduct.populate('category', 'name nameEn');
  await updatedProduct.populate('seller', 'firstName lastName email');

  res.json({
    success: true,
    message: 'تم تحديث المنتج بنجاح',
    product: updatedProduct
  });
});

// export const searchProducts = asyncHandler(async (req, res) => {
//   const { q } = req.query;
//   if (!q || q.trim() === '') {
//     res.status(400);
//     throw new Error('Search query is required');
//   }

//   const { skip, limit, page } = res.locals.pagination;
//   const searchTerm = q.trim();
  
//   // Escape regex special characters
//   const escaped = escapeRegex(searchTerm);
  
//   // Split into words for better matching
//   const words = searchTerm.split(/\s+/).filter(w => w.length > 0);
//   const isArabic = /^[\u0600-\u06FF\s]+$/.test(searchTerm);

//   // Build search conditions
//   const searchConditions = [];

//   // Title search - prioritize exact start matches, then anywhere matches
//   if (words.length === 1) {
//     searchConditions.push(
//       { title: { $regex: `^${escaped}`, $options: 'i' } },
//       { title: { $regex: escaped, $options: 'i' } }
//     );
//   } else {
//     // For multiple words, match any word in title
//     const wordPatterns = words.map(w => escapeRegex(w)).join('|');
//     searchConditions.push({ title: { $regex: wordPatterns, $options: 'i' } });
//   }

//   // Description search - match any of the words
//   const descPattern = words.map(w => escapeRegex(w)).join('|');
//   searchConditions.push({ description: { $regex: descPattern, $options: 'i' } });

//   // Try text search for non-Arabic queries if index exists
//   let searchFilter;
//   let sortObj = req.sortObj || { createdAt: -1 };

//   if (!isArabic && searchTerm.length > 2) {
//     try {
//       // Test if text index exists
//       await Product.findOne({ $text: { $search: 'test' } }).limit(1);
//       searchFilter = {
//         isApproved: true,
//         status: 'available',
//         isActive: true,
//         $text: { $search: searchTerm },
//         ...(req.filterObj ? (() => { const { $or, ...rest } = req.filterObj; return rest; })() : {})
//       };
//       sortObj = { score: { $meta: 'textScore' }, ...sortObj };
//     } catch (err) {
//       // Text index doesn't exist, use regex
//       searchFilter = {
//         isApproved: true,
//         status: 'available',
//         isActive: true,
//         $or: searchConditions,
//         ...(req.filterObj ? (() => { const { $or, ...rest } = req.filterObj; return rest; })() : {})
//       };
//     }
//   } else {
//     // Use regex for Arabic or short queries
//     searchFilter = {
//       isApproved: true,
//       status: 'available',
//       isActive: true,
//       $or: searchConditions,
//       ...(req.filterObj ? (() => { const { $or, ...rest } = req.filterObj; return rest; })() : {})
//     };
//   }

//   const cacheKey = `search:product:${JSON.stringify({ query: searchTerm, page, limit, sort: sortObj })}`;
//   const cached = await searchCache.get(cacheKey);
//   if (cached) return res.json({ success: true, ...cached, cached: true });

//   let total, products;
  
//   try {
//     total = await Product.countDocuments(searchFilter);
//     products = await Product.find(searchFilter)
//       .select('title price discountedPrice images ratingsAverage ratingsQuantity createdAt category brand')
//       .populate('category', 'name nameEn')
//       .populate('brand', 'name nameEn')
//       .sort(sortObj)
//       .skip(skip)
//       .limit(limit)
//       .lean();
//   } catch (err) {
//     // Fallback if text search fails
//     if (err.message && err.message.includes('text index')) {
//       searchFilter = {
//         isApproved: true,
//         status: 'available',
//         isActive: true,
//         $or: searchConditions,
//         ...(req.filterObj ? (() => { const { $or, ...rest } = req.filterObj; return rest; })() : {})
//       };
//       total = await Product.countDocuments(searchFilter);
//       products = await Product.find(searchFilter)
//         .select('title price discountedPrice images ratingsAverage ratingsQuantity createdAt category brand')
//         .populate('category', 'name nameEn')
//         .populate('brand', 'name nameEn')
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .lean();
//     } else {
//       throw err;
//     }
//   }

//   const result = {
//     success: true,
//     products,
//     query: searchTerm,
//     pagination: res.locals.buildLinks(total)
//   };

//   await searchCache.set(cacheKey, result, 300);
//   res.json(result);
// });