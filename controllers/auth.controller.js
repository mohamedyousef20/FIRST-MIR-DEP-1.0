import {
  generateTokens,
  verifyAndRotateTokens,
  revokeAllUserTokens,
  storeRefreshToken,
  expiresInToSeconds,
} from '../utils/jwt.js';

import { createError } from '../utils/error.js';
import { redis } from '../config/redis-client.js';
import bcrypt from 'bcryptjs';
import sendEmail from '../middlewares/email.middleware.js';
import { sendNotification } from '../utils/notify.js';
import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';
import User from '../models/user.model.js';

// دالة مساعدة لتحويل وقت انتهاء JWT إلى ميلي ثانية للكوكيز
const getCookieMaxAge = (expiresIn) => {
  return expiresInToSeconds(expiresIn) * 1000;
};

const hashResetCode = (code) =>
  crypto
    .createHmac('sha256', process.env.JWT_ACCESS_SECRET)
    .update(code)
    .digest('hex');

// تسجيل مستخدم جديد
export const register = asyncHandler(async (req, res, next) => {
  const { email, password, firstName, lastName, phone, role } = req.body;

  // التحقق من وجود المستخدم مسبقاً
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(createError('يوجد مستخدم مسجل بهذا البريد الإلكتروني بالفعل', 400));
  }

  // إنشاء مستخدم جديد
  const user = new User({
    firstName,
    lastName,
    email,
    password,
    phone,
    role,
    isVerified: false,
  });

  await user.save();

  // إنشاء الرموز
  const tokens = await generateTokens(user);
  // تخزين رمز التحديث لأمان الجلسة الواحدة
  await storeRefreshToken(user._id || user.id, tokens.refreshToken);

  sendVerificationEmail(user).catch((error) => {
    logger.error('فشل في إرسال بريد التحقق:', error);
  });

  const io = req.app.get('io');
  if (io) {
    try {
      const admins = await User.find({ role: 'admin', isActive: true }).select('_id');

      await Promise.all(
        admins.map((admin) =>
          sendNotification(io, {
            user: admin._id,
            role: 'admin',
            title: 'مستخدم جديد',
            message: `${user.firstName || user.email} قام بالتسجيل للتو`,
            type: 'new_registration',
            actor: user._id,
            data: { userId: user._id },
            is_read: false,
          })
        )
      );
    } catch (err) {
      logger.error('فشل في إشعار المشرفين بالمستخدم الجديد:', err.message);
    }
  }

  // تعيين كوكيز HTTP فقط
  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: getCookieMaxAge(config.jwt.accessExpiresIn || '15m'),
    path: '/',
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: getCookieMaxAge(config.jwt.refreshExpiresIn || '7d'),
    path: '/',
  });

  res.cookie('role', user.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: getCookieMaxAge(config.jwt.refreshExpiresIn || '7d'),
    path: '/',
  });

  res.status(201).json({
    success: true,
    message: 'تم تسجيل المستخدم بنجاح. تم إرسال بريد التحقق.',
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
    },
  });
});

// دالة منفصلة لإرسال البريد الإلكتروني
const sendVerificationEmail = async (user) => {
  try {

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // تشفير وحفظ كود التحقق في قاعدة البيانات
    const hashedVerificationCode = await bcrypt.hash(verificationCode, 10);

    user.verificationCode = hashedVerificationCode;
    user.verificationCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 دقائق
    await user.save();

    const emailOptions = {
      email: user.email,
      subject: 'تفعيل البريد الإلكتروني - Mirvory',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: right;">
          <h2 style="color: #1976D2;">تفعيل البريد الإلكتروني</h2>
          <p>مرحباً ${user.firstName}،</p>
          <p>استخدم الكود التالي لتفعيل بريدك الإلكتروني:</p>
          <div style="font-size: 24px; font-weight: bold; background: #F5F5F5; padding: 20px; text-align: center; border-radius: 8px;">
            ${verificationCode}
          </div>
          <p>سيتم إلغاء صلاحية هذا الكود بعد 5 دقائق.</p>
        </div>
      `,
    };

    await sendEmail(emailOptions);
    logger.info(`تم إرسال بريد التحقق إلى ${user.email}`);
  } catch (error) {
    logger.error(`فشل في إرسال بريد التحقق إلى ${user.email}:`, error);
    throw error;
  }
};

// تسجيل دخول المستخدم
export const login = asyncHandler(async (req, res, next) => {

  const { email, password } = req.body;
  logger.info(email);
  logger.info(password);

  // التحقق من وجود المستخدم
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return next(createError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 403));
  }

  // التحقق من حالة الحساب
  if (user.isBlocked) {
    return next(createError('الحساب معطل. يرجى التواصل مع الدعم.', 403));
  }

  // التحقق من كلمة المرور
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return next(createError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 403));
  }

  // إنشاء الرموز
  const tokens = await generateTokens(user);
  // تخزين رمز التحديث لأمان الجلسة الواحدة
  await storeRefreshToken(user._id || user.id, tokens.refreshToken);
  logger.info(process.env.JWT_ACCESS_EXPIRES_IN);

  // تحديث آخر تسجيل دخول
  user.lastLogin = new Date();
  await user.save();

  // تعيين كوكيز HTTP فقط
  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: getCookieMaxAge(config.jwt.accessExpiresIn || '15m'),
    path: '/',
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: getCookieMaxAge(config.jwt.refreshExpiresIn || '7d'),
    path: '/',
  });

  res.cookie('role', user.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: getCookieMaxAge(config.jwt.refreshExpiresIn || '7d'),
    path: '/',
  });

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
    },
  });
});

// تحديث رمز الوصول
export const refreshToken = asyncHandler(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return next(createError('لم يتم تقديم رمز التحديث', 401));
  }

  try {
    const tokens = await verifyAndRotateTokens(refreshToken);

    // تعيين رموز جديدة في كوكيز HTTP فقط
    const accessTokenMaxAge =
      expiresInToSeconds(config.jwt.accessExpiresIn || '15m') * 1000;
    const refreshTokenMaxAge =
      expiresInToSeconds(config.jwt.refreshExpiresIn || '7d') * 1000;

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: accessTokenMaxAge,
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: refreshTokenMaxAge,
      path: '/',
    });
    logger.info(tokens);

    res.json({
      success: true,
      message: 'تم تحديث الرموز بنجاح',
    });
  } catch (error) {
    // مسح رمز التحديث غير الصالح
    res.clearCookie('refreshToken', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });

    res.clearCookie('role', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });

    next(createError(error.message || 'رمز التحديث غير صالح', 401));
  }
});

// تسجيل خروج المستخدم
export const socialSetCookies = asyncHandler(async (req, res, next) => {
  const { accessToken, refreshToken, role } = req.body || {};
  if (!accessToken || !refreshToken) {
    return res.status(400).json({ success: false, message: 'الرموز المطلوبة مفقودة' });
  }

  res
    .cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: getCookieMaxAge(config.jwt.accessExpiresIn || '15m'),
      path: '/',
    })
    .cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: getCookieMaxAge(config.jwt.refreshExpiresIn || '7d'),
      path: '/',
    })
    .cookie('role', role || 'user', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    })
    .json({ success: true, message: 'تم تعيين الكوكيز' });
});

export const logout = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.cookies;

  if (refreshToken) {
    // إضافة الرمز إلى القائمة السوداء
    await redis.set(`token:blacklist:${refreshToken}`, '1', 'EX', 7 * 24 * 60 * 60);
  }

  // مسح الكوكيز
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  };

  res.clearCookie('accessToken', cookieOpts);
  res.clearCookie('refreshToken', cookieOpts);
  res.clearCookie('role', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
});

// الحصول على المستخدم الحالي
export const getCurrentUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  console.log('IM NOT GET CURRENT');
  console.log(req.user._id);
  if (!user) {
    return next(createError('المستخدم غير موجود', 404));
  }
  logger.info(user);
  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
        wallet: user.wallet,
        preferences: user.preferences,
      },
    },
  });
});

// تحديث ملف المستخدم الشخصي
export const updateProfile = asyncHandler(async (req, res, next) => {
  const updates = {};
  const { firstName, lastName, phone } = req.body;

  if (firstName) updates.firstName = firstName;
  if (lastName) updates.lastName = lastName;
  if (phone) updates.phone = phone;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!user) {
    return next(createError('المستخدم غير موجود', 404));
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
    },
    message: 'تم تحديث الملف الشخصي بنجاح',
  });
});

// التحقق من البريد الإلكتروني
export const verifyEmail = asyncHandler(async (req, res, next) => {
  const { email, code } = req.body;
console.log(req.body,'code4')
  const user = await User.findOne({ email }).select('+verificationCode +verificationCodeExpires');
  if (!user) {
    return next(createError('المستخدم غير موجود', 404));
  }
console.log(user,'us')
  // التحقق مما إذا كان المستخدم مفعلاً مسبقاً
  if (user.isVerified) {
    return next(createError('البريد الإلكتروني مفعل بالفعل', 400));
  }

  // التحقق من وجود كود التحقق
  if (!user.verificationCode) {
    return next(createError('لم يتم العثور على كود التحقق. يرجى طلب كود جديد.', 400));
  }

  // التحقق من انتهاء صلاحية كود التحقق
  if (!user.verificationCodeExpires || user.verificationCodeExpires < new Date()) {
    // تنظيف الكود المنتهي
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    return next(createError('انتهت صلاحية كود التحقق. يرجى طلب كود جديد.', 400));
  }

  // التحقق من صحة الكود باستخدام bcrypt.compare
  const isValid = await bcrypt.compare(code, user.verificationCode);
  if (!isValid) {
    return next(createError('كود التحقق غير صالح', 400));
  }

  // تحديث حالة المستخدم كمفعل
  user.isVerified = true;
  user.verificationCode = undefined;
  user.verificationCodeExpires = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'تم التحقق من البريد الإلكتروني بنجاح',
  });
});

// إعادة إرسال التحقق من البريد الإلكتروني
export const resendVerification = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  // البحث عن المستخدم بالبريد الإلكتروني
  let user;
  if (email) {
    user = await User.findOne({ email });
  } else if (req.user?._id) {
    user = await User.findById(req.user._id);
  } else {
    return next(createError('البريد الإلكتروني مطلوب', 400));
  }

  if (!user) {
    return next(createError('المستخدم غير موجود', 404));
  }

  if (user.isVerified) {
    return next(createError('البريد الإلكتروني مفعل بالفعل', 400));
  }

  // إنشاء كود تحقق جديد
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expirationTime = new Date(Date.now() + 5 * 60 * 1000); // 5 دقائق

  // تشفير وحفظ كود التحقق
  const hashedCode = await bcrypt.hash(verificationCode, 10);
  user.verificationCode = hashedCode;
  user.verificationCodeExpires = expirationTime;
  await user.save();

  // إرسال بريد التحقق
  const emailOptions = {
    email: user.email,
    subject: 'تفعيل البريد الإلكتروني - Mirvory',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: right;">
        <h2 style="color: #1976D2;">تفعيل البريد الإلكتروني</h2>
        <p>مرحباً ${user.firstName}،</p>
        <p>استخدم الكود التالي لتفعيل بريدك الإلكتروني:</p>
        <div style="font-size: 24px; font-weight: bold; background: #F5F5F5; padding: 20px; text-align: center; border-radius: 8px;">
          ${verificationCode}
        </div>
        <p>سيتم إلغاء صلاحية هذا الكود بعد 5 دقائق.</p>
      </div>
    `,
  };

  await sendEmail(emailOptions);

  res.status(200).json({
    success: true,
    message: 'تم إرسال كود التحقق بنجاح',
  });
});

// وظيفة إعادة تعيين كلمة المرور مع كود مشفر
export const forgetPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return next(createError('البريد الإلكتروني مطلوب', 400));
  }

  // البحث عن المستخدم بالبريد الإلكتروني
  const user = await User.findOne({ email });
  if (!user) {
    return next(createError('لا يوجد حساب مرتبط بهذا البريد الإلكتروني', 404));
  }

  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedResetCode = hashResetCode(verificationCode);

  const expirationTime = new Date(Date.now() + 5 * 60 * 1000); // 5 دقائق

  user.passwordResetCode = hashedResetCode;
  user.passwordResetExpires = expirationTime;
  user.passwordResetVerified = false;
  await user.save();

  const emailOptions = {
    email,
    subject: 'طلب إعادة تعيين كلمة المرور - Mirvory',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: right;">
        <h2 style="color: #1976D2;">طلب إعادة تعيين كلمة المرور</h2>
        <p>مرحباً ${user.firstName}،</p>
        <p>لقد طلبت إعادة تعيين كلمة المرور. استخدم الكود التالي لإعادة تعيين كلمة المرور:</p>
        <div style="font-size: 24px; font-weight: bold; background: #F5F5F5; padding: 20px; text-align: center; border-radius: 8px;">
          ${verificationCode}
        </div>
        <p>سيتم إلغاء صلاحية هذا الكود بعد 5 دقائق.</p>
        <p>إذا لم تقم بطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد.</p>
      </div>
    `,
  };

  const emailResult = await sendEmail(emailOptions);

  if (!emailResult?.success) {
    return next(
      createError(
        'تعذر إرسال بريد إعادة التعيين في الوقت الحالي، حاول مرة أخرى لاحقاً',
        500
      )
    );
  }

  res.status(200).json({
    success: true,
    message: 'إذا كان هناك حساب مرتبط بهذا البريد الإلكتروني، تم إرسال كود إعادة التعيين',
  });
});

// التحقق من كود إعادة التعيين مع المقارنة المشفرة
export const verifyResetCode = asyncHandler(async (req, res, next) => {
  const { code } = req.body;

  const hashedResetCode = hashResetCode(code);

  const user = await User.findOne({
    passwordResetCode: hashedResetCode,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    return next(
      createError('كود إعادة التعيين غير صالح أو منتهي الصلاحية. يرجى طلب كود جديد.', 400)
    );
  }

  // وضع علامة على كود إعادة التعيين كمتحقق منه
  user.passwordResetVerified = true;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'تم التحقق من كود إعادة التعيين بنجاح',
  });
});

// إعادة تعيين كلمة المرور بعد التحقق من الكود
export const resetPassword = asyncHandler(async (req, res, next) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return next(createError('البريد الإلكتروني وكلمة المرور الجديدة مطلوبان', 400));
  }

  // البحث عن المستخدم بالبريد الإلكتروني
  const user = await User.findOne({ email })
    .select('+passwordResetVerified +passwordResetExpires +passwordResetCode');
  if (!user) {
    return next(createError('المستخدم غير موجود', 404));
  }
  console.log(user,'reset102')

  // التحقق من أن كود إعادة التعيين تم التحقق منه
  if (!user.passwordResetVerified) {
    return next(
      createError('كود إعادة التعيين لم يتم التحقق منه. يرجى التحقق من الكود أولاً.', 400)
    );
  }

  // التحقق من انتهاء صلاحية كود إعادة التعيين
  if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
    // تنظيف الكود المنتهي
    user.passwordResetCode = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetVerified = undefined;
    await user.save();

    return next(createError('انتهت صلاحية كود إعادة التعيين. يرجى طلب كود جديد.', 400));
  }

  // تحديث كلمة مرور المستخدم
  user.password = newPassword;

  // مسح الحقول المتعلقة بإعادة التعيين
  user.passwordResetCode = undefined;
  user.passwordResetExpires = undefined;
  user.passwordResetVerified = false;

  await user.save();

  res.status(200).json({
    success: true,
    message: 'تم إعادة تعيين كلمة المرور بنجاح',
  });
});

// معالج OAuth من Google
export const googleAuth = asyncHandler(async (req, res, next) => {
  const { email, firstName, lastName, googleId, avatar } = req.body;

  if (!email || !googleId) {
    return next(createError('معلومات حساب Google مفقودة', 400));
  }

  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (!user) {
    const randomPassword = crypto.randomBytes(32).toString('hex');
    user = new User({
      firstName: firstName || 'Google',
      lastName: lastName || 'User',
      email,
      password: randomPassword,
      provider: 'google',
      googleId,
      avatar,
      isVerified: true,
    });
  } else {
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    if (avatar) user.avatar = avatar;
    user.provider = 'google';
    user.googleId = user.googleId || googleId;
    user.isVerified = true;
  }

  await user.save();

  const tokens = await generateTokens(user);
  // تخزين رمز التحديث لأمان الجلسة الواحدة
  await storeRefreshToken(user._id || user.id, tokens.refreshToken);
  logger.info(process.env.JWT_ACCESS_EXPIRES_IN);
  logger.info('///////////////////////////////////////');

  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: getCookieMaxAge(config.jwt.accessExpiresIn || '15m'),
    path: '/',
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: getCookieMaxAge(config.jwt.refreshExpiresIn || '7d'),
    path: '/',
  });
  logger.info(process.env.NODE_ENV);

  res.cookie('role', user.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: getCookieMaxAge(config.jwt.accessExpiresIn || '15m'),
    path: '/',
  });

  return res.json({
    success: true,
    message: 'تم تسجيل الدخول باستخدام Google بنجاح',
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        avatar: user.avatar,
      },
    },
    tokens,
  });
});

// تغيير كلمة مرور المستخدم (مستخدم مصادق)
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.user._id;

  // التحقق من تطابق كلمات المرور الجديدة
  if (newPassword !== confirmPassword) {
    return next(createError('كلمات المرور الجديدة غير متطابقة', 400));
  }

  // التحقق من اختلاف كلمة المرور الجديدة عن الحالية
  if (currentPassword === newPassword) {
    return next(createError('كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية', 400));
  }

  // البحث عن المستخدم
  const user = await User.findById(userId).select('+password');
  if (!user) {
    return next(createError('المستخدم غير موجود', 404));
  }

  // التحقق من صحة كلمة المرور الحالية
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return next(createError('كلمة المرور الحالية غير صحيحة', 403));
  }

  // تحديث كلمة المرور
  user.password = newPassword;

  // زيادة عداد تغيير كلمة المرور وتحديث الطابع الزمني
  user.passwordChangeAt = new Date();

  // حفظ المستخدم بكلمة المرور الجديدة
  await user.save();

  // إلغاء جميع رموز التحديث الحالية (أفضل ممارسة أمنية)
  // هذا يسجل خروج المستخدم من جميع الأجهزة
  await revokeAllUserTokens(userId);

  // إضافة رمز التحديث الحالي إلى القائمة السوداء إذا كان موجوداً في الكوكيز
  const { refreshToken } = req.cookies;
  if (refreshToken) {
    await redis.set(`token:blacklist:${refreshToken}`, '1', 'EX', 7 * 24 * 60 * 60);
  }

  // مسح جميع كوكيز المصادقة
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  };

  res.clearCookie('accessToken', cookieOpts);
  res.clearCookie('refreshToken', cookieOpts);
  res.clearCookie('role', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  // إرسال إشعار بالبريد الإلكتروني عن تغيير كلمة المرور
  try {
    const emailOptions = {
      email: user.email,
      subject: 'تم تغيير كلمة المرور - Mirvory',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: right;">
          <h2 style="color: #1976D2;">تم تغيير كلمة المرور بنجاح</h2>
          <p>مرحباً ${user.firstName}،</p>
          <p>تم تغيير كلمة مرور حسابك بنجاح في ${new Date().toLocaleString()}.</p>
          <div style="background: #F5F5F5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>ملاحظة:</strong> تم تسجيل خروجك من جميع الأجهزة لأسباب أمنية.</p>
          </div>
          <p>إذا لم تقم بتغيير كلمة المرور، يرجى الاتصال بالدعم فوراً.</p>
        </div>
      `,
    };

    await sendEmail(emailOptions);
  } catch (emailError) {
    logger.error('فشل في إرسال بريد تغيير كلمة المرور:', emailError);
    // عدم فشل الطلب إذا فشل البريد الإلكتروني
  }

  res.status(200).json({
    success: true,
    message: 'تم تغيير كلمة المرور بنجاح. يرجى تسجيل الدخول مرة أخرى.',
  });
});