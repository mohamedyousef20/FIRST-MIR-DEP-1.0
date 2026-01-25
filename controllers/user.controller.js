import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import Order from '../models/order.model.js';
import crypto from 'crypto';
import sendEmail from '../middlewares/email.middleware.js';
import { createError } from '../utils/error.js';
import Notification from '../models/notification.model.js';
import Product from '../models/product.model.js';
import asyncHandler from 'express-async-handler';
import { revokeAllUserTokens } from '../utils/jwt.js';
import { redis } from '../config/redis-client.js';
export const searchUsers = asyncHandler(async (req, res) => {
  let { q = "", role, page = 1, limit = 10 } = req.query;

  // تنظيف الإدخالات
  q = q.trim();
  page = parseInt(page);
  limit = parseInt(limit);

  // تحقق من وجود كلمة البحث
  if (!q) {
    return res.status(400).json({
      success: false,
      message: "كلمة البحث مطلوبة",
    });
  }

  // بناء فلتر البحث الذكي
  const searchFilter = {
    $and: [
      {
        $or: [
          { firstName: { $regex: q, $options: "i" } },
          { lastName: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { phone: { $regex: q, $options: "i" } },
        ],
      },
    ],
  };

  // إضافة فلتر الدور (user/seller) إن وُجد
  if (role && ["user", "seller"].includes(role)) {
    searchFilter.$and.push({ role });
  }

  // حساب العدد الكلي (لـ pagination)
  const total = await User.countDocuments(searchFilter);

  // البحث بالصفحات مع تحديد البيانات المطلوبة فقط
  const users = await User.find(searchFilter)
    .select("_id firstName lastName email phone role isActive createdAt")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.status(200).json({
    success: true,
    data: users,
    count: users.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    message: "تم العثور على النتائج بنجاح",
  });
});

// دالة بديلة للبحث مع فلتر إضافي
export const searchUsersForAdmin = asyncHandler(async (req, res) => {
  const { q, role, isActive } = req.query;

  const searchFilter = {};

  // فلتر البحث
  if (q && q.trim() !== "") {
    searchFilter.$or = [
      { firstName: { $regex: q, $options: 'i' } },
      { lastName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } }
    ];
  }

  // فلتر الدور
  if (role && ['user', 'seller'].includes(role)) {
    searchFilter.role = role;
  }

  // فلتر الحالة النشطة
  if (isActive !== undefined) {
    searchFilter.isActive = isActive === 'true';
  }

  const users = await User.find(searchFilter)
    .select('_id firstName lastName email phone role isActive createdAt')
    .limit(100)
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: users,
    count: users.length
  });
});

export const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json(user);
});

export const getSellerOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ seller: req.user._id })
    .populate('product')
    .populate('buyer');
  res.json(orders);
});

export const getSellerForAdmin = asyncHandler(async (req, res) => {
  const seller = await User.find({ role: 'seller' });
  //console.log('/////////////////////////////////////////////////////////////////');
  //console.log(seller, 'the seller >>>>>>>>>>>>>>>>>>>>>');
  //console.log('/////////////////////////////////////////////////////////////////');

  res.json(seller);
});

export const getUsersForAdmin = asyncHandler(async (req, res) => {
  const user = await User.find({ role: 'user' });
  res.json(user);
});

export const updateProfile = asyncHandler(async (req, res) => {
  //console.log(req.body, 'updateProfile');
  const { firstName, lastName, phone } = req.body;
  const userId = req.user._id;

  // Find user by ID
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }

  // Update user fields
  user.firstName = firstName || user.firstName;
  user.lastName = lastName || user.lastName;
  user.phone = phone || user.phone;

  // Save updated user
  const updatedUser = await user.save();

  // Return updated user data (excluding sensitive fields)
  const userData = {
    _id: updatedUser._id,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    email: updatedUser.email,
    phone: updatedUser.phone,
    role: updatedUser.role,
    isVerified: updatedUser.isVerified,
    createdAt: updatedUser.createdAt
  };

  res.status(200).json({
    message: 'تم تحديث الملف الشخصي بنجاح',
    user: userData
  });
});

// Add this to your user controller file
export const getSellerBalance = asyncHandler(async (req, res) => {
  // Get the authenticated user's ID from the request
  const userId = req.user._id;

  // Find the user and explicitly select wallet fields
  const user = await User.findById(userId)
    .select('+wallet +role')
    .lean();
  //console.log(user, 'the use from get seller balance');

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (user.role !== 'seller') {
    return res.status(403).json({
      message: 'Only vendors can access balance information'
    });
  }

  // Ensure wallet exists (initialize if missing)
  const wallet = user.wallet || {};

  // Return the wallet information
  res.status(200).json({
    success: true,
    data: {
      wallet,
      vendorProfile: user.vendorProfile
    }
  });
});

export const deleteUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.body;

  // التحقق من وجود المستخدم
  const user = await User.findById(userId);
  if (!user) {
    return next(createError('المستخدم غير موجود', 404));
  }

  // منع حذف المستخدم إذا كان لديه طلبات نشطة
  const activeOrders = await Order.findOne({
    $or: [
      { buyer: userId, status: { $in: ['pending', 'confirmed', 'shipped'] } },
      { seller: userId, status: { $in: ['pending', 'confirmed', 'shipped'] } }
    ]
  });

  if (activeOrders) {
    return next(createError('لا يمكن حذف المستخدم لديه طلبات نشطة', 400));
  }

  // بدء عملية الحذف في transaction للتأكد من تكامل البيانات
  const session = await User.startSession();
  session.startTransaction();

  try {
    // 1. حذف جميع منتجات البائع (إذا كان seller)
    if (user.role === 'seller') {
      await Product.deleteMany({ seller: userId }).session(session);
      //console.log(`✅ تم حذف جميع منتجات البائع: ${userId}`);
    }

    // 2. تحديث الطلبات المرتبطة بالمستخدم
    // - إزالة reference للمستخدم من الطلبات
    await Order.updateMany(
      { buyer: userId },
      {
        $set: {
          buyer: null,
          buyerInfo: {
            name: 'مستخدم محذوف',
            email: 'deleted@user.com',
            phone: '0000000000'
          }
        }
      }
    ).session(session);

    // 3. حذف الإشعارات المرتبطة بالمستخدم
    await Notification.deleteMany({
      $or: [
        { user: userId },
        { actor: userId }
      ]
    }).session(session);

    // 4. حذف المستخدم نفسه
    await User.findByIdAndDelete(userId).session(session);

    // تأكيد العملية
    await session.commitTransaction();
    session.endSession();

    // إرسال إشعار للمسؤولين
    (async () => {
      try {
        const adminUsers = await User.find({ role: 'admin' });

        const notifications = adminUsers.map((admin) => {
          return Notification.create({
            userId: admin._id,
            role: 'admin',
            type: 'USER_DELETED',
            title: '🗑️ تم حذف مستخدم',
            message: `تم حذف المستخدم ${user.firstName} ${user.lastName} (${user.email})`,
            data: {
              deletedUserId: userId,
              deletedUserEmail: user.email,
              deletedAt: new Date()
            }
          });
        });

        await Promise.allSettled(notifications);
      } catch (err) {
        console.error("Error sending deletion notification:", err);
      }
    })();

    res.status(200).json({
      success: true,
      message: 'تم حذف المستخدم وجميع بياناته بنجاح',
      data: {
        deletedUser: {
          id: user._id,
          email: user.email,
          role: user.role
        },
        deletedProducts: user.role === 'seller' ? 'all' : 'none'
      }
    });

  } catch (transactionError) {
    // في حالة خطأ، نرجع عن العملية
    await session.abortTransaction();
    session.endSession();
    throw transactionError;
  }
});

// دالة بديلة للحذف الناعم (Soft Delete)
export const softDeleteUser = asyncHandler(async (req, res, next) => {
  //console.log('softDeleteUser');
  const { userId } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return next(createError('المستخدم غير موجود', 404));
  }

  // تحديث حالة المستخدم إلى محذوف (بدون حذف فعلي)
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      isActive: false,
    },
    { new: true }
  );

  // تعطيل منتجات البائع
  if (user.role === 'seller') {
    await Product.updateMany(
      { seller: userId },
      {
        isActive: false,
        status: 'unavailable'
      }
    );
  }

  res.status(200).json({
    success: true,
    message: 'تم تعطيل المستخدم بنجاح',
    data: {
      user: {
        id: updatedUser._id,
        isActive: updatedUser.isActive,
      }
    }
  });
});

// دالة لاستعادة المستخدم المحذوف
export const setSellerTrustedStatus = asyncHandler(async (req, res) => {
  const { id: sellerId } = req.params;
  const { trusted = true } = req.body; // default true if not provided

  // Validate seller ID
  if (!sellerId) {
    return res.status(400).json({ success: false, message: 'sellerId param is required' });
  }

  const seller = await User.findById(sellerId);

  if (!seller || seller.role !== 'seller') {
    return res.status(404).json({ success: false, message: 'Seller not found' });
  }

  // Update trust status only if changed
  if (seller.isTrustedSeller !== trusted) {
    seller.isTrustedSeller = trusted;
    await seller.save();

    // Update all products of this seller
    await Product.updateMany({ seller: sellerId }, { sellerTrusted: trusted });
  }

  res.status(200).json({
    success: true,
    message: `Seller trust status set to ${trusted}`,
    data: {
      sellerId: seller._id,
      isTrustedSeller: seller.isTrustedSeller
    }
  });
});

export const restoreUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return next(createError('المستخدم غير موجود', 404));
  }

  // استعادة المستخدم
  const restoredUser = await User.findByIdAndUpdate(
    userId,
    {
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      email: user.email.replace(/^deleted_\d+_/, ''), // إعادة البريد الأصلي
      phone: user.phone.replace(/^deleted_/, ''),
      firstName: user.firstName,
      lastName: user.lastName
    },
    { new: true }
  );

  // استعادة منتجات البائع
  if (user.role === 'seller') {
    await Product.updateMany(
      { seller: userId },
      {
        isActive: true,
        status: 'available'
      }
    );
  }

  res.status(200).json({
    success: true,
    message: 'تم استعادة المستخدم بنجاح',
    data: restoredUser
  });
});