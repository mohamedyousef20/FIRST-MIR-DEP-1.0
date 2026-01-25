import jwt from "jsonwebtoken";
import ms from "ms";
import { redis } from "../config/redis-client.js";
import User from "../models/user.model.js";
import {createError} from "./error.js";
import logger from "./logger.js";
import { config } from "../config/config.js";

// إصدار التوكنات (يجب تغييره عند تحديث هيكل التوكن)
const TOKEN_VERSION = "1.0";

// التأكد من وجود مفاتيح JWT
const validateSecrets = () => {
  if (!config.jwt.accessSecret || !config.jwt.refreshSecret) {
    logger.error("JWT secrets are not configured");
    throw createError("Server configuration error", 500);
  }

  // في الإنتاج، تحقق من قوة السكرت
  if (config.isProduction) {
    const minLength = 32;
    if (config.jwt.accessSecret.length < minLength ||
      config.jwt.refreshSecret.length < minLength) {
      logger.error("JWT secrets are too short for production");
      throw createError("Server configuration error", 500);
    }
  }
};

// تحويل مدة انتهاء الصلاحية إلى ثواني
// Convert various expiresIn formats to seconds; treat pure digits as seconds
const expiresInToSeconds = (expiresIn) => {
  try {
    if (/^\d+$/.test(expiresIn)) {
      // Numeric string without unit => seconds
      return parseInt(expiresIn, 10);
    }
    const msValue = ms(expiresIn);
    return Math.floor(msValue / 1000);
  } catch (error) {
    logger.warn(`Invalid expiresIn format: ${expiresIn}, using default`);
    return ms("7d") / 1000; // Default 7 days
  }
};

// Helper to validate user object
const validateUserObject = (user) => {
  if (!user) {
    throw createError("User object is required",401);
  }

  if (!user.id && !user._id && !user.userId) {
    throw createError("User ID is required",401);
  }

  if (!user.email) {
    throw createError("User email is required",401);
  }

  // Check if user is active
  if (user.isActive === false) {
    throw createError("User account is inactive",403);
  }

  return {
    id: user.id || user._id || user.userId,
    email: user.email,
    role: user.role || "user",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    isActive: user.isActive !== false,
    isVerified: user.isVerified !== false
  };
};

// توليد التوكنات
export const generateTokens = async (user) => {
  try {
    validateSecrets();

    const validatedUser = validateUserObject(user);

    const payload = {
      id: validatedUser.id,
      email: validatedUser.email,
      role: validatedUser.role,
      firstName: validatedUser.firstName,
      lastName: validatedUser.lastName,
      isVerified: validatedUser.isVerified,
      version: TOKEN_VERSION,
      iat: Math.floor(Date.now() / 1000)
    };

    const accessToken = jwt.sign(
      payload,
      config.jwt.accessSecret,
      {
        expiresIn: /^\d+$/.test(config.jwt.accessExpiresIn)
          ? Number(config.jwt.accessExpiresIn) // seconds
          : (config.jwt.accessExpiresIn || "15m"),
        algorithm: "HS256"
      }
    );

    const refreshToken = jwt.sign(
      {
        id: validatedUser.id,
        role: validatedUser.role,
        version: TOKEN_VERSION,
        iat: Math.floor(Date.now() / 1000)
      },
      config.jwt.refreshSecret,
      {
        expiresIn: /^\d+$/.test(config.jwt.refreshExpiresIn)
          ? Number(config.jwt.refreshExpiresIn)
          : (config.jwt.refreshExpiresIn || "7d"),
        algorithm: "HS256"
      }
    );

    // Store refresh token with user info
    await storeRefreshToken(validatedUser.id, refreshToken, validatedUser);

    // logger.inf     o("Tokens generated", {
    //   userId: validatedUser.id,
    //   email: validatedUser.email.substring(0, 3) + '...'
    // });

    return {
      accessToken,
      refreshToken,
      user: validatedUser
    };
  } catch (error) {
    logger.error("Token generation failed", {
      error: error.message,
      userId: user?.id || 'unknown'
    });

    if (error.statusCode) {
      throw error;
    }

    throw createError(500, "Token generation failed");
  }
};

// تدوير توكن التحديث
export const verifyAndRotateTokens = async (refreshToken) => {
  validateSecrets();

  if (!refreshToken) {
    throw createError("Refresh token is required", 400);
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

    // Check token version
    if (decoded.version !== TOKEN_VERSION) {
      throw createError(401, "Invalid token version");
    }
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw createError(401, "Refresh token has expired");
    } else if (err.name === 'JsonWebTokenError') {
      throw createError(401, "Invalid refresh token");
    }
    throw createError(401, "Invalid refresh token");
  }

  const userId = decoded.id;

  // Use Redis lock to prevent concurrent refreshes
  let lockAcquired = false;
  const lockKey = `lock:refresh:${userId}`;

  if (redis) {
    lockAcquired = await redis.set(lockKey, "1", "NX", "PX", 5000);

    if (!lockAcquired) {
      throw createError(429, "Refresh in progress, please retry");
    }
  }

  try {
    // Check if token is blacklisted
    if (redis) {
      const isBlacklisted = await redis.get(`token:blacklist:${refreshToken}`);
      if (isBlacklisted === "1") {
        logger.warn("Blacklisted refresh token used", { userId });
        throw createError(401, "Token has been revoked");
      }
    }

    // Verify user exists and is active
    const user = await User.findById(userId).select(
      "_id email role firstName lastName isActive isVerified"
    );

    if (!user) {
      throw createError(404, "User not found");
    }

    if (user.isActive === false) {
      throw createError(403, "User account is inactive");
    }

    const sanitizedUser = {
      id: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      isVerified: user.isVerified
    };

    // Blacklist the old refresh token
    if (redis) {
      // Grace period to avoid race conditions: allow 30 s before revoking old token
      const GRACE_SECONDS = 30;
      const expiresInSeconds = expiresInToSeconds(config.jwt.refreshExpiresIn || "7d");
      await redis.set(
        `token:blacklist:${refreshToken}`,
        "1",
        "EX",
        Math.max(GRACE_SECONDS, expiresInSeconds)
      );

      // Remove old refresh token from user's active tokens
      await removeRefreshToken(userId, refreshToken);
    }

    // Generate new tokens
    const newTokens = await generateTokens(sanitizedUser);

    logger.info("Tokens rotated successfully", { userId });

    return {
      ...newTokens,
      user: sanitizedUser
    };
  } catch (error) {
    logger.error("Token rotation failed", {
      userId,
      error: error.message
    });
    throw error;
  } finally {
    // Release lock
    if (redis && lockAcquired) {
      await redis.del(lockKey).catch(err => {
        logger.warn("Failed to release refresh lock", { error: err.message });
      });
    }
  }
};

// التحقق من توكن الوصول
export const verifyAccessToken = async (accessToken) => {
  if (!accessToken) {
    throw createError("Access token is required", 400);
  }

  try {
    const decoded = jwt.verify(accessToken, config.jwt.accessSecret);

    // Check token version
    if (decoded.version !== TOKEN_VERSION) {
      throw createError(401, "Invalid token version");
    }

    // Check if token is revoked (only if Redis is available)
    if (redis) {
      const isBlacklisted = await redis.get(`token:blacklist:${accessToken}`);
      if (isBlacklisted === "1") {
        logger.warn("Blacklisted access token used", { userId: decoded.id });
        throw createError(401, "Token has been revoked");
      }
    }

    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw createError(401, "Access token has expired");
    } else if (err.name === 'JsonWebTokenError') {
      throw createError(401, "Invalid access token");
    }
    throw createError("Access token verification failed", 401);
  }
};

// إلغاء جميع توكنات المستخدم
export const revokeAllUserTokens = async (userId) => {
  if (!userId) {
    throw createError("User ID is required", 400);
  }

  if (redis) {
    // Get all user's refresh tokens
    const userTokensKey = `user_refresh_tokens:${userId}`;
    const tokens = await redis.smembers(userTokensKey) || [];

    // Blacklist all tokens
    const pipeline = redis.pipeline();

    // Blacklist access tokens (we need to track these separately)
    const userAccessTokensKey = `user_access_tokens:${userId}`;
    const accessTokens = await redis.smembers(userAccessTokensKey) || [];

    accessTokens.forEach(token => {
      pipeline.set(`token:blacklist:${token}`, "1", "EX", 3600); // 1 hour
    });

    // Blacklist refresh tokens
    tokens.forEach(token => {
      pipeline.set(`token:blacklist:${token}`, "1", "EX", 604800); // 7 days
    });

    // Clear user's token sets
    pipeline.del(userTokensKey);
    pipeline.del(userAccessTokensKey);

    await pipeline.exec();

    logger.info("All tokens revoked for user", { userId });
  }
};

// تخزين توكن التحديث مع معلومات المستخدم
export const storeRefreshToken = async (userId, token, userInfo = null) => {
  if (!userId || !token) {
    throw createError("User ID and token are required", 400);
  }

  if (redis) {
    const expiresInSeconds = expiresInToSeconds(config.jwt.refreshExpiresIn || "7d");

    // Store in user's set of refresh tokens
    await redis.sadd(`user_refresh_tokens:${userId}`, token);
    await redis.expire(`user_refresh_tokens:${userId}`, expiresInSeconds);

    // Store token with user info
    const tokenData = {
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      ...(userInfo && {
        email: userInfo.email,
        role: userInfo.role
      })
    };

    await redis.set(
      `refresh_token:${token}`,
      JSON.stringify(tokenData),
      "EX",
      expiresInSeconds
    );
  }
};

// الحصول على جميع توكنات التحديث للمستخدم
export const getUserRefreshTokens = async (userId) => {
  if (!userId || !redis) {
    return [];
  }

  const tokens = await redis.smembers(`user_refresh_tokens:${userId}`) || [];
  const tokenData = [];

  for (const token of tokens) {
    const data = await redis.get(`refresh_token:${token}`);
    if (data) {
      tokenData.push(JSON.parse(data));
    }
  }

  return tokenData;
};

// إزالة توكن تحديث معين
export const removeRefreshToken = async (userId, token) => {
  if (!userId || !token) {
    throw createError("User ID and token are required", 400);
  }

  if (redis) {
    // Remove from user's set
    await redis.srem(`user_refresh_tokens:${userId}`, token);

    // Remove token data
    await redis.del(`refresh_token:${token}`);

    // Add to blacklist
    await redis.set(`token:blacklist:${token}`, "1", "EX", 604800); // 7 days
  }
};

// فك تشفير التوكن بدون التحقق من الصحة
export const decodeToken = (token) => {
  if (!token) {
    throw createError("Token is required", 400);
  }

  try {
    return jwt.decode(token);
  } catch (error) {
    logger.error("Token decode failed", { error: error.message });
    throw createError(400, "Failed to decode token");
  }
};

// التحقق مما إذا كان التوكن على وشك الانتهاء
export const isTokenExpiringSoon = (token, thresholdMinutes = 5) => {
  if (!token) {
    return false;
  }

  try {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) return false;

    const now = Math.floor(Date.now() / 1000);
    return decoded.exp - now <= thresholdMinutes * 60;
  } catch (error) {
    return false;
  }
};

// التحقق من أن التوكن في القائمة السوداء
export const isTokenBlacklisted = async (token) => {
  if (!token || !redis) {
    return false;
  }

  const isBlacklisted = await redis.get(`token:blacklist:${token}`);
  return isBlacklisted === "1";
};

// إلغاء توكن معين
export const revokeToken = async (userId, token) => {
  if (!userId || !token) {
    throw createError("User ID and token are required", 400);
  }

  if (redis) {
    const expiresInSeconds = expiresInToSeconds(config.jwt.refreshExpiresIn || "7d");

    await redis.set(
      `token:blacklist:${token}`,
      "1",
      "EX",
      expiresInSeconds
    );

    // Remove from user's tokens
    await removeRefreshToken(userId, token);

    logger.info("Token revoked", { userId });
  }
};

// الحصول على معلومات المستخدم من التوكن
export const getUserFromToken = async (token) => {
  if (!token) {
    throw createError("Token is required", 400);
  }

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    const user = await User.findById(decoded.id).select(
      "_id email role firstName lastName isActive isVerified"
    );

    if (!user) {
      throw createError(404, "User not found");
    }

    return {
      id: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      isVerified: user.isVerified
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw createError(401, "Access token has expired");
    } else if (error.name === 'JsonWebTokenError') {
      throw createError(401, "Invalid access token");
    }

    logger.error("Get user from token failed", { error: error.message });
    throw createError(401, "Failed to get user from token");
  }
};

// Middleware لتجديد التوكن تلقائياً إذا كان على وشك الانتهاء
export const autoRefreshMiddleware = async (req, res, next) => {
  const accessToken = req.cookies.accessToken ||
    req.headers.authorization?.replace('Bearer ', '');

  const refreshToken = req.cookies.refreshToken;

  if (!accessToken || !refreshToken) {
    return next();
  }

  try {
    // Check if access token is expiring soon
    if (isTokenExpiringSoon(accessToken, 10)) { // 10 minutes
      const newTokens = await verifyAndRotateTokens(refreshToken);

      // Set new tokens in cookies
      const accessTokenDuration = expiresInToSeconds(config.jwt.accessExpiresIn || "15m");
      const refreshTokenDuration = expiresInToSeconds(config.jwt.refreshExpiresIn || "7d");

      const cookieOptions = {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: config.isProduction ? 'strict' : 'lax',
        path: '/',
      };

      res.cookie('accessToken', newTokens.accessToken, {
        ...cookieOptions,
        maxAge: accessTokenDuration * 1000,
      });

      res.cookie('refreshToken', newTokens.refreshToken, {
        ...cookieOptions,
        maxAge: refreshTokenDuration * 1000,
      });

      logger.debug("Token auto-refreshed", {
        userId: newTokens.user.id,
        email: newTokens.user.email.substring(0, 3) + '...'
      });
    }
  } catch (error) {
    // Don't fail the request if auto-refresh fails
    logger.debug("Auto-refresh failed", {
      error: error.message,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken
    });
  }

  next();
};

// الحصول على إحصائيات التوكنات
export const getTokenStats = async (userId) => {
  if (!redis) {
    return { available: false };
  }

  try {
    const refreshTokens = await getUserRefreshTokens(userId);
    const activeTokens = refreshTokens.filter(token =>
      new Date(token.expiresAt) > new Date()
    );

    return {
      available: true,
      totalTokens: refreshTokens.length,
      activeTokens: activeTokens.length,
      tokens: activeTokens.map(token => ({
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        device: token.device || 'unknown'
      }))
    };
  } catch (error) {
    logger.error(`Get token stats failed`);
    return { available: false, error: error.message };
  }
};

// Export expiresInToSeconds for use in controllers
export { expiresInToSeconds };

// Export for testing
export const __testExports = {
  validateSecrets,
  expiresInToSeconds,
  TOKEN_VERSION
};