import ReturnRequest from '../models/returnRequest.model.js';
import Order from '../models/order.model.js';
import Product from '../models/product.model.js';
import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';
import { createError } from '../utils/error.js';
import asyncHandler from 'express-async-handler';

export const createReturnRequest = asyncHandler(async (req, res) => {
  const { orderId, reason, itemId, images = [] } = req.body;

  // Validate required fields
  if (!orderId || !reason || !itemId) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة: orderId, reason, itemId' });
  }

  // Find the order
  const order = await Order.findById(orderId);
  if (!order) {
    return res.status(404).json({ message: 'الطلب غير موجود' });
  }

  // Verify order ownership
  if (order.buyer._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'غير مصرح هذا الطلب غير مملوك لك' });
  }

  // Check if order was delivered more than 14 days ago
  if (order.deliveredAt) {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const deliveredDate = new Date(order.deliveredAt);

    if (deliveredDate < fourteenDaysAgo) {
      return res.status(400).json({
        message: 'لا يمكن إنشاء طلب إرجاع بعد مرور 14 يوم من تاريخ التسليم. يمكنك تقديم شكوى بدلاً من ذلك',
        canCreate: false,
        canComplain: true,
        deliveredAt: order.deliveredAt,
        daysSinceDelivery: Math.floor((Date.now() - deliveredDate.getTime()) / (24 * 60 * 60 * 1000))
      });
    }
  } else {
    // If order doesn't have deliveredAt, check if it was created more than 14 days ago
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const orderCreatedDate = new Date(order.createdAt);

    if (orderCreatedDate < fourteenDaysAgo) {
      return res.status(400).json({
        message: 'لا يمكن إنشاء طلب إرجاع بعد مرور 14 يوم من تاريخ الطلب. يمكنك تقديم شكوى بدلاً من ذلك',
        canCreate: false,
        canComplain: true,
        orderCreatedAt: order.createdAt,
        daysSinceOrder: Math.floor((Date.now() - orderCreatedDate.getTime()) / (24 * 60 * 60 * 1000))
      });
    }
  }

  // Find the specific item in the order
  const orderItem = order.items.find(item => item.product._id.toString() === itemId);
  if (!orderItem) {
    return res.status(404).json({ message: 'العنصر غير موجود في الطلب' });
  }

  // Verify the product exists
  const product = await Product.findById(orderItem.product);
  if (!product) {
    return res.status(404).json({ message: 'المنتج غير موجود' });
  }

  // Check if user already has an active return request for this order item
  const existingReturnRequest = await ReturnRequest.findOne({
    user: req.user._id,
    order: orderId,
    item: itemId,
    status: { $in: ['pending', 'approved', 'processing'] }
  });

  if (existingReturnRequest) {
    return res.status(400).json({
      message: 'لديك بالفعل طلب إرجاع نشط لهذا العنصر',
      canCreate: false,
      existingRequest: {
        id: existingReturnRequest._id,
        status: existingReturnRequest.status,
        createdAt: existingReturnRequest.createdAt
      }
    });
  }

  // Check if there was a recently rejected request (prevent spam)
  const recentlyRejected = await ReturnRequest.findOne({
    user: req.user._id,
    order: orderId,
    item: itemId,
    status: 'rejected',
    createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } // Within last 48 hours
  });

  if (recentlyRejected) {
    return res.status(400).json({
      message: 'تم رفض طلب الإرجاع لهذا العنصر مؤخراً. يرجى المحاولة مرة أخرى بعد 48 ساعة',
      canCreate: false,
      existingRequest: {
        id: recentlyRejected._id,
        status: recentlyRejected.status,
        createdAt: recentlyRejected.createdAt,
        canRetryAfter: new Date(recentlyRejected.createdAt.getTime() + 48 * 60 * 60 * 1000)
      }
    });
  }

  // All checks passed - create the return request
  const returnRequest = new ReturnRequest({
    user: req.user._id,
    username: req.user.firstName + " " + req.user.lastName,
    email: req.user.email,
    phone: req.user.phone,
    order: orderId,
    product: orderItem.product,
    seller: orderItem.seller,
    reason,
    images,
    item: itemId,
    status: 'pending',
    deleteAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
  });

  await returnRequest.save();

  // ======== Blocking rules ========
  // 1) Block buyer if they have made more than 3 return requests within the last 6 months
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
  const buyerReturnCount = await ReturnRequest.countDocuments({
    user: req.user._id,
    createdAt: { $gte: sixMonthsAgo }
  });
  if (buyerReturnCount > 3) {
    await User.findByIdAndUpdate(req.user._id, { isBlocked: true });
  }

  // 2) Block seller if they receive 3 or more return requests within the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sellerReturnCount = await ReturnRequest.countDocuments({
    seller: orderItem.seller,
    createdAt: { $gte: thirtyDaysAgo }
  });
  if (sellerReturnCount >= 3) {
    await User.findByIdAndUpdate(orderItem.seller, { isBlocked: true });
  }
  // =================================

  // Create notifications with error handling
  const notificationPromises = [];

  // Seller notification
  const sellerNotification = new Notification({
    userId: orderItem.seller._id,
    role: 'seller',
    type: 'RETURN_REQUESTED',
    title: 'تم تقديم طلب استرجاع',
    message: 'تم استلام طلب ارجاع بالطلب الخاص بك 💸',
    link: `/returns/${returnRequest._id}`
  });
  notificationPromises.push(sellerNotification.save().catch(error =>
    console.error('Failed to save seller notification:', error)
  ));

  // Buyer notification
  const buyerNotification = new Notification({
    userId: order.buyer._id,
    role: 'user',
    type: 'RETURN_REQUESTED',
    title: 'تم تقديم طلب استرجاع',
    message: 'تم ارسال طلب الارجاع الخاص بك وجارى معالجتة💸',
    link: `/returns`
  });
  notificationPromises.push(buyerNotification.save().catch(error =>
    console.error('Failed to save buyer notification:', error)
  ));

  // Admin notifications
  const adminUsers = await User.find({ role: 'admin' });
  adminUsers.forEach(admin => {
    const adminNotification = new Notification({
      userId: admin._id,
      role: 'admin',
      type: 'RETURN_REQUESTED',
      title: 'تم تقديم طلب استرجاع',
      message: `طلب استرجاع #${order._id} للمستخدم ${order.buyer?.firstName || order.userId}`,
      orderId: order._id,
      link: `/orders/${order._id}`
    });
    notificationPromises.push(adminNotification.save().catch(error =>
      console.error('Failed to save admin notification:', error)
    ));
  });

  // Wait for all notifications to be processed (but don't fail the request if notifications fail)
  await Promise.allSettled(notificationPromises);

  res.status(201).json({
    message: 'تم تقديم طلب الإرجاع بنجاح',
    canCreate: true,
    returnRequest: {
      id: returnRequest._id,
      status: returnRequest.status,
      createdAt: returnRequest.createdAt
    }
  });
});

// Optional: Keep the standalone check function if needed elsewhere
export const canCreateReturnRequest = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;

  const existingReturnRequest = await ReturnRequest.findOne({
    user: req.user._id,
    order: orderId,
    item: itemId,
    status: { $in: ['pending', 'approved', 'processing'] }
  });

  const recentlyRejected = await ReturnRequest.findOne({
    user: req.user._id,
    order: orderId,
    item: itemId,
    status: 'rejected',
    createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
  });

  const canCreate = !existingReturnRequest && !recentlyRejected;

  res.json({
    canCreate,
    existingRequest: existingReturnRequest ? {
      id: existingReturnRequest._id,
      status: existingReturnRequest.status,
      createdAt: existingReturnRequest.createdAt
    } : null,
    recentlyRejected: recentlyRejected ? {
      id: recentlyRejected._id,
      status: recentlyRejected.status,
      createdAt: recentlyRejected.createdAt,
      canRetryAfter: new Date(recentlyRejected.createdAt.getTime() + 48 * 60 * 60 * 1000)
    } : null
  });
});

export const getReturnRequests = asyncHandler(async (req, res) => {
  // جلب طلبات الاسترجاع الخاصة بالبائع أو المستخدم
  const returnRequests = await ReturnRequest.find({
    $or: [
      { user: req.user._id },
      { seller: req.user._id }
    ]
  })
    .populate('order')
    .populate('product')
    .sort({ createdAt: -1 });

  res.json(returnRequests);
});

export const getReturnRequestById = asyncHandler(async (req, res, next) => {
  const returnRequest = await ReturnRequest.findById(req.params.id);

  if (!returnRequest) {
    return next(createError('لا يوجد طلب ارجاع', 404))
  }

  res.status(200).json(returnRequest);
});

export const getReturnRequestsForAdmin = asyncHandler(async (req, res) => {
  //console.log('x1x')
  const returnRequests = await ReturnRequest.find({})
    .populate('order')
    .populate('product')
    .sort({ createdAt: -1 });

  res.json(returnRequests);
});

export const updateReturnStatus = asyncHandler(async (req, res) => {
  const { status, returnId } = req.body;

  const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'finished'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'حالة الإرجاع غير صحيحة' });
  }

  // ابحث عن الطلب
  const returnRequest = await ReturnRequest.findById(returnId);
  //console.log(returnRequest, 'returnRequest')
  if (!returnRequest) {
    return res.status(404).json({ message: 'طلب الإرجاع غير موجود' });
  }

  // حدّث الحالة والملاحظات إن وُجدت
  returnRequest.status = status;
  // if (adminNote) returnRequest.adminNote = adminNote;

  await returnRequest.save();

  // إرسال إشعارات للمستخدمين المعنيين حسب الحالة
  const notifications = [];

  // للمستخدم (المشتري)
  let buyerMessage = '';
  switch (status) {
    case 'approved':
      buyerMessage = '✅ تم الموافقة على طلب الإرجاع الخاص بك، وسيتم التنسيق معك قريباً.';
      break;
    case 'rejected':
      buyerMessage = '❌ تم رفض طلب الإرجاع الخاص بك.';
      break;
    case 'processing':
      buyerMessage = '🔄 طلب الإرجاع الخاص بك قيد المعالجة.';
      break;
    case 'finished':
      buyerMessage = '💸 تم استرجاع المبلغ بنجاح وإغلاق الطلب.';
      break;
    default:
      buyerMessage = 'تم تحديث حالة طلب الإرجاع الخاص بك.';
  }

  notifications.push(
    new Notification({
      userId: returnRequest.user,
      role: 'user',
      type: 'RETURN_STATUS_UPDATED',
      title: 'تحديث حالة طلب الإرجاع',
      message: buyerMessage,
      link: `/returns/${returnRequest._id}`,
    })
  );

  // للبائع
  let sellerMessage = '';
  switch (status) {
    case 'approved':
      sellerMessage = '🔔 تمت الموافقة على طلب إرجاع منتج من طلباتك.';
      break;
    case 'rejected':
      sellerMessage = '🚫 تم رفض طلب الإرجاع الخاص بمنتج من متجرك.';
      break;
    case 'processing':
      sellerMessage = '🔄 طلب الإرجاع قيد المعالجة.';
      break;
    case 'finished':
      sellerMessage = '💸 تم إكمال عملية الإرجاع لهذا الطلب.';
      break;
    default:
      sellerMessage = 'تم تحديث حالة طلب الإرجاع الخاص بمنتج من متجرك.';
  }

  notifications.push(
    new Notification({
      userId: returnRequest.seller,
      role: 'seller',
      type: 'RETURN_STATUS_UPDATED',
      title: 'تحديث حالة طلب الإرجاع',
      message: sellerMessage,
      link: `/seller/returns/${returnRequest._id}`,
    })
  );

  // حفظ كل الإشعارات
  await Notification.insertMany(notifications);

  res.json({
    message: 'تم تحديث حالة طلب الإرجاع بنجاح',
    returnRequest,
  });
});

// delete 
// Allow a user to update their own return request (reason and images) as long as it is still pending or approved
export const updateReturnRequestByUser = asyncHandler(async (req, res) => {
  const { returnId, reason, images } = req.body;

  if (!returnId) {
    return res.status(400).json({ message: 'returnId is required' });
  }

  // Find the request
  const returnRequest = await ReturnRequest.findById(returnId);
  if (!returnRequest) {
    return res.status(404).json({ message: 'طلب الإرجاع غير موجود' });
  }

  // Ensure the requester is the owner
  if (returnRequest.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'غير مصرح لك بتعديل هذا الطلب' });
  }

  // Only allow update when status is pending or approved (not yet processed)
  if (!['pending', 'approved'].includes(returnRequest.status)) {
    return res.status(400).json({ message: 'لا يمكن تعديل الطلب بعد بدء معالجته' });
  }

  if (reason) returnRequest.reason = reason;
  if (Array.isArray(images)) returnRequest.images = images;

  await returnRequest.save();

  return res.json({ message: 'تم تحديث طلب الإرجاع بنجاح', returnRequest });
});

export const deleteReturnRequest = asyncHandler(async (req, res, next) => {
  const { id } = req.body;
  const userId = req.user._id;

  if (!id) {
    return next(createError('معرف طلب الإرجاع مطلوب', 400));
  }

  // User can only delete their own return requests
  const result = await ReturnRequest.findOneAndDelete({
    _id: id,
    user: userId
  });

  if (!result) {
    return next(createError('طلب الإرجاع غير موجود أو لا يمكنك حذفه', 404));
  }

  res.json({
    success: true,
    message: 'تم حذف طلب الإرجاع بنجاح'
  });
});
// update 
export const updateReturnRequest = asyncHandler(async (req, res) => {
  const { status, } = req.body;


  // ابحث عن الطلب
  const returnRequest = await ReturnRequest.findById(returnId);
  //console.log(returnRequest, 'returnRequest')
  if (!returnRequest) {
    return res.status(404).json({ message: 'طلب الإرجاع غير موجود' });
  }

  // حدّث الحالة والملاحظات إن وُجدت
  returnRequest.status = status;
  // if (adminNote) returnRequest.adminNote = adminNote;

  await returnRequest.save();

  // إرسال إشعارات للمستخدمين المعنيين حسب الحالة
  const notifications = [];

  // للمستخدم (المشتري)
  let buyerMessage = '';
  switch (status) {
    case 'approved':
      buyerMessage = '✅ تم الموافقة على طلب الإرجاع الخاص بك، وسيتم التنسيق معك قريباً.';
      break;
    case 'rejected':
      buyerMessage = '❌ تم رفض طلب الإرجاع الخاص بك.';
      break;
    case 'processing':
      buyerMessage = '🔄 طلب الإرجاع الخاص بك قيد المعالجة.';
      break;
    case 'finished':
      buyerMessage = '💸 تم استرجاع المبلغ بنجاح وإغلاق الطلب.';
      break;
    default:
      buyerMessage = 'تم تحديث حالة طلب الإرجاع الخاص بك.';
  }

  notifications.push(
    new Notification({
      userId: returnRequest.user,
      role: 'user',
      type: 'RETURN_STATUS_UPDATED',
      title: 'تحديث حالة طلب الإرجاع',
      message: buyerMessage,
      link: `/returns/${returnRequest._id}`,
    })
  );

  // للبائع
  let sellerMessage = '';
  switch (status) {
    case 'approved':
      sellerMessage = '🔔 تمت الموافقة على طلب إرجاع منتج من طلباتك.';
      break;
    case 'rejected':
      sellerMessage = '🚫 تم رفض طلب الإرجاع الخاص بمنتج من متجرك.';
      break;
    case 'processing':
      sellerMessage = '🔄 طلب الإرجاع قيد المعالجة.';
      break;
    case 'finished':
      sellerMessage = '💸 تم إكمال عملية الإرجاع لهذا الطلب.';
      break;
    default:
      sellerMessage = 'تم تحديث حالة طلب الإرجاع الخاص بمنتج من متجرك.';
  }

  notifications.push(
    new Notification({
      userId: returnRequest.seller,
      role: 'seller',
      type: 'RETURN_STATUS_UPDATED',
      title: 'تحديث حالة طلب الإرجاع',
      message: sellerMessage,
      link: `/seller/returns/${returnRequest._id}`,
    })
  );

  // حفظ كل الإشعارات
  await Notification.insertMany(notifications);

  res.json({
    message: 'تم تحديث حالة طلب الإرجاع بنجاح',
    returnRequest,
  });
});
