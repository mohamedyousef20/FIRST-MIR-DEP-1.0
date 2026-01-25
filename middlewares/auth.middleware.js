import { verifyAccessToken } from '../utils/jwt.js';
import User from '../models/user.model.js';
import logger from '../utils/logger.js';

export const protect = async (req, res, next) => {
  try {
    if (!process.env.JWT_ACCESS_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Server misconfigured: JWT secret not set'
      });
    }
    let token;

    // 1. Check for token in cookies first (for cookie-based auth)
    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
      logger.info("🔐 Token found in cookies");
    }
    // 2. Fallback to Authorization header (for API clients)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      logger.info("🔐 Token found in Authorization header");
    }

    if (!token) {
      logger.info("❌ No token found in cookies or headers");
      return res.status(401).json({
        success: false,
        message: 'الرجاء تسجيل الدخول - غير مصرح'
      });
    }

    try {
      // Verify token with revocation check
      const decoded = await verifyAccessToken(token);
      logger.info("✅ Token verified for user ID:", decoded.id);

      // Get user from database - FIX: use decoded.id instead of decoded.userId
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        logger.info("❌ User not found for ID:", decoded.id);
        return res.status(401).json({
          success: false,
          message: 'المستخدم غير موجود - غير مصرح'
        });
      }

      if (!user.isActive) {
        logger.info("❌ User account is deactivated:", user.email);
        return res.status(401).json({
          success: false,
          message: 'الحساب معطل - يرجى التواصل مع الدعم'
        });
      }

      // 🚫 Blocked (too many returns or other violations)
      if (user.isBlocked) {
        logger.info("❌ User account is blocked:", user.email);
        return res.status(403).json({
          success: false,
          message: 'تم حظر حسابك بسبب تجاوز سياسات المنصة، يرجى التواصل مع الدعم'
        });
      }

      // Attach user to request
      req.user = user;
      logger.info("✅ User authenticated:", user.email);
      next();
    } catch (error) {
      logger.info("❌ Token verification failed:", error.message);
      logger.info( error.message);

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'انتهت صلاحية الجلسة - يرجى تسجيل الدخول مرة أخرى'
        });
      }

      return res.status(401).json({
        success: false,
        message: 'رمز الدخول غير صحيح - غير مصرح'
      });
    }
  } catch (error) {
    logger.info("❌ Server error in protect middleware:", error.message);
    res.status(500).json({
      success: false,
      message: 'خطأ في الخادم'
    });
  }
};

export const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    logger.info("✅ Admin access granted for:", req.user.email);
    next();
  } else {
    logger.info("❌ Admin access denied for:", req.user?.email);
    res.status(403).json({
      success: false,
      message: 'verifyEmail'
    });
  }
};

export const isSeller = (req, res, next) => {
  if (req.user && (req.user.role === 'seller' || req.user.role === 'admin')) {
    logger.info("✅ Seller access granted for:", req.user.email);
    next();
  } else {
    logger.info("❌ Seller access denied for:", req.user?.email);
    res.status(403).json({
      success: false,
      message: 'مطلوب صلاحيات البائع'
    });
  }
};


export const isDelivery = (req, res, next) => {
  if (req.user && (req.user.role === 'delivery' || req.user.role === 'admin')) {
    logger.info("✅ Delivery access granted for:", req.user.email);
    next();
  } else {
    logger.info("❌ Delivery access denied for:", req.user?.email);
    res.status(403).json({
      success: false,
      message: 'مطلوب صلاحيات موظف التوصيل'
    });
  }
};
export const isUser = (req, res, next) => {
  if (req.user && (req.user.role === 'user' || req.user.role === 'admin' || req.user.role === 'seller')) {
    // Check if email is verified (only for regular users, not for admin/seller)
    if (req.user.role === 'user' && !req.user.isVerified) {
      logger.info("❌ Email not verified for user:", req.user.email);
      return res.status(403).json({
        success: false,
        message: 'يرجى تفعيل البريد الإلكتروني أولاً للوصول إلى هذه الخدمة'
      });
    }

    logger.info("✅ User access granted for:", req.user.email);
    next();
  } else {
    logger.info("❌ User access denied for:", req.user?.email);
    res.status(403).json({
      success: false,
      message: 'مطلوب صلاحيات المستخدم'
    });
  }
};

// Optional: Add a middleware to check if user is authenticated (without role check)
export const isAuthenticated = (req, res, next) => {
  if (req.user) {
    logger.info("✅ User is authenticated:", req.user.email);
    next();
  } else {
    logger.info("❌ User is not authenticated");
    res.status(401).json({
      success: false,
      message: 'يجب تسجيل الدخول أولاً'
    });
  }
};

// Optional: Add a middleware to check email verification status
export const isVerified = (req, res, next) => {
  if (req.user && req.user.isVerified) {
    logger.info("✅ Email verified for:", req.user.email);
    next();
  } else {
    logger.info("❌ Email not verified for:", req.user?.email);
    res.status(403).json({
      success: false,
      message: 'يرجى تفعيل البريد الإلكتروني أولاً'
    });
  }
};





// ////////
// // middlewares/auth.middleware.js
// import jwt from 'jsonwebtoken';
// import { AuthenticationError, AuthorizationError, RateLimitError } from '../utils/error.js';
// import { redis } from '../config/redis.js';
// import logger from '../utils/logger.js';
// import { config } from '../config/config.js';

// /**
//  * Authentication & Authorization System
//  */

// // Rate limiting configuration
// const RATE_LIMIT_CONFIG = {
//   AUTH_FAILURES: {
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     maxAttempts: 5,
//     blockDuration: 30 * 60 * 1000 // 30 minutes
//   },
//   TOKEN_VALIDATION: {
//     windowMs: 60 * 1000, // 1 minute
//     maxRequests: 60
//   }
// };

// /**
//  * Rate Limiting Manager for authentication
//  */
// class AuthRateLimiter {
//   constructor() {
//     this.failedAttempts = new Map();
//     this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000); // Cleanup every 10 minutes
//   }

//   getClientIdentifier(req) {
//     // Use IP address or user ID if available
//     return req.ip || req.headers['x-forwarded-for'] || 'unknown';
//   }

//   async checkRateLimit(identifier, type = 'AUTH_FAILURES') {
//     const config = RATE_LIMIT_CONFIG[type];
//     const key = `rate_limit:${type}:${identifier}`;

//     try {
//       const current = await redis.get(key);
//       const attempts = current ? parseInt(current) : 0;

//       if (attempts >= config.maxAttempts) {
//         // Check if block period is over
//         const blockKey = `rate_limit_block:${type}:${identifier}`;
//         const blockedUntil = await redis.get(blockKey);

//         if (blockedUntil && Date.now() < parseInt(blockedUntil)) {
//           const remainingTime = Math.ceil((parseInt(blockedUntil) - Date.now()) / 1000 / 60);
//           throw new RateLimitError({
//             message: `Too many authentication attempts. Try again in ${remainingTime} minutes`,
//             retryAfter: remainingTime * 60
//           });
//         }

//         // Reset block if time passed
//         await redis.del(blockKey);
//       }

//       return attempts;
//     } catch (error) {
//       logger.warn('Rate limit check failed, proceeding:', error.message);
//       return 0; // Fail open for Redis errors
//     }
//   }

//   async incrementFailedAttempt(identifier) {
//     const key = `rate_limit:AUTH_FAILURES:${identifier}`;

//     try {
//       const current = await redis.incr(key);

//       if (current === 1) {
//         // Set expiration on first attempt
//         await redis.expire(key, RATE_LIMIT_CONFIG.AUTH_FAILURES.windowMs / 1000);
//       }

//       // Block if max attempts reached
//       if (current >= RATE_LIMIT_CONFIG.AUTH_FAILURES.maxAttempts) {
//         const blockKey = `rate_limit_block:AUTH_FAILURES:${identifier}`;
//         const blockUntil = Date.now() + RATE_LIMIT_CONFIG.AUTH_FAILURES.blockDuration;

//         await redis.setex(
//           blockKey,
//           Math.ceil(RATE_LIMIT_CONFIG.AUTH_FAILURES.blockDuration / 1000),
//           blockUntil.toString()
//         );
//       }

//       return current;
//     } catch (error) {
//       logger.warn('Failed to increment rate limit:', error.message);
//     }
//   }

//   cleanup() {
//     // In-memory cleanup for fallback
//     const now = Date.now();
//     for (const [key, data] of this.failedAttempts.entries()) {
//       if (now - data.timestamp > RATE_LIMIT_CONFIG.AUTH_FAILURES.windowMs) {
//         this.failedAttempts.delete(key);
//       }
//     }
//   }
// }

// // Initialize rate limiter
// const authRateLimiter = new AuthRateLimiter();

// /**
//  * Token Manager with revocation support
//  */
// class TokenManager {
//   constructor() {
//     this.tokenBlacklist = new Set();
//   }

//   async isTokenRevoked(token) {
//     try {
//       // Check Redis blacklist
//       const isBlacklisted = await redis.get(`token_blacklist:${token}`);
//       return isBlacklisted !== null;
//     } catch (error) {
//       logger.warn('Token revocation check failed:', error.message);
//       return false; // Fail open
//     }
//   }

//   async revokeToken(token, userId, reason = 'logout') {
//     try {
//       const decoded = jwt.decode(token);
//       if (!decoded?.exp) return false;

//       const ttl = decoded.exp - Math.floor(Date.now() / 1000);

//       if (ttl > 0) {
//         await redis.setex(
//           `token_blacklist:${token}`,
//           ttl,
//           JSON.stringify({
//             userId,
//             reason,
//             revokedAt: new Date().toISOString()
//           })
//         );
//         return true;
//       }

//       return false;
//     } catch (error) {
//       logger.error('Failed to revoke token:', error);
//       return false;
//     }
//   }

//   async revokeAllUserTokens(userId) {
//     try {
//       // Pattern matching to find all user tokens
//       const pattern = `user_tokens:${userId}:*`;
//       const keys = await redis.keys(pattern);

//       if (keys.length > 0) {
//         await redis.del(...keys);
//       }

//       return keys.length;
//     } catch (error) {
//       logger.error('Failed to revoke all user tokens:', error);
//       return 0;
//     }
//   }
// }

// // Initialize token manager
// const tokenManager = new TokenManager();

// /**
//  * RBAC (Role-Based Access Control) System
//  */
// const ROLE_PERMISSIONS = {
//   SUPER_ADMIN: {
//     level: 100,
//     permissions: ['*'], // All permissions
//     inherits: []
//   },
//   ADMIN: {
//     level: 90,
//     permissions: [
//       'manage_users',
//       'manage_products',
//       'manage_orders',
//       'manage_content',
//       'view_analytics'
//     ],
//     inherits: ['MODERATOR', 'SELLER', 'DELIVERY', 'USER']
//   },
//   MODERATOR: {
//     level: 80,
//     permissions: [
//       'moderate_content',
//       'manage_comments',
//       'view_reports'
//     ],
//     inherits: ['USER']
//   },
//   SELLER: {
//     level: 70,
//     permissions: [
//       'manage_own_products',
//       'view_own_sales',
//       'manage_own_orders',
//       'update_own_profile'
//     ],
//     inherits: ['USER']
//   },
//   DELIVERY: {
//     level: 60,
//     permissions: [
//       'view_assigned_orders',
//       'update_order_status',
//       'update_delivery_location'
//     ],
//     inherits: ['USER']
//   },
//   USER: {
//     level: 50,
//     permissions: [
//       'view_own_profile',
//       'update_own_profile',
//       'place_orders',
//       'write_reviews',
//       'view_own_orders'
//     ],
//     inherits: []
//   },
//   GUEST: {
//     level: 0,
//     permissions: [
//       'browse_catalog',
//       'view_public_content'
//     ],
//     inherits: []
//   }
// };

// class RBACManager {
//   constructor() {
//     this.roleCache = new Map();
//   }

//   async hasPermission(user, requiredPermission, options = {}) {
//     const { requireVerifiedEmail = true, requireActiveAccount = true } = options;

//     // Check basic requirements
//     if (requireActiveAccount && !user.isActive) {
//       return false;
//     }

//     if (requireVerifiedEmail && !user.isVerified && user.role !== 'ADMIN') {
//       return false;
//     }

//     // Get role permissions
//     const role = ROLE_PERMISSIONS[user.role?.toUpperCase()] || ROLE_PERMISSIONS.USER;

//     // Check direct permissions
//     if (role.permissions.includes('*') || role.permissions.includes(requiredPermission)) {
//       return true;
//     }

//     // Check inherited roles
//     for (const inheritedRole of role.inherits) {
//       const inheritedPermissions = ROLE_PERMISSIONS[inheritedRole]?.permissions || [];
//       if (inheritedPermissions.includes(requiredPermission)) {
//         return true;
//       }
//     }

//     return false;
//   }

//   canAccessRoute(user, routePermissions) {
//     if (!Array.isArray(routePermissions)) {
//       routePermissions = [routePermissions];
//     }

//     for (const permission of routePermissions) {
//       if (this.hasPermission(user, permission)) {
//         return true;
//       }
//     }

//     return false;
//   }
// }

// // Initialize RBAC manager
// const rbacManager = new RBACManager();

// /**
//  * User Caching System
//  */
// class UserCacheManager {
//   constructor() {
//     this.cacheTTL = 5 * 60; // 5 minutes
//   }

//   async getUser(userId, forceRefresh = false) {
//     const cacheKey = `user:${userId}`;

//     try {
//       // Check cache first
//       if (!forceRefresh) {
//         const cachedUser = await redis.get(cacheKey);
//         if (cachedUser) {
//           return JSON.parse(cachedUser);
//         }
//       }

//       // Fetch from database
//       const User = (await import('../models/user.model.js')).default;
//       const user = await User.findById(userId)
//         .select('-password -refreshToken -twoFactorSecret')
//         .lean();

//       if (user) {
//         // Cache the user
//         await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(user));
//       }

//       return user;
//     } catch (error) {
//       logger.error('User cache error:', error);
//       return null;
//     }
//   }

//   async invalidateUserCache(userId) {
//     try {
//       await redis.del(`user:${userId}`);
//     } catch (error) {
//       logger.warn('Failed to invalidate user cache:', error);
//     }
//   }
// }

// // Initialize user cache manager
// const userCacheManager = new UserCacheManager();

// /**
//  * Main Authentication Middleware
//  */
// export const authenticate = async (req, res, next) => {
//   try {
//     // Check JWT configuration
//     if (!config.jwt?.accessSecret) {
//       throw new AuthenticationError({
//         message: 'Server authentication configuration error',
//         code: 'SERVER_CONFIG_ERROR',
//         statusCode: 500
//       });
//     }

//     // Rate limiting check
//     const clientIdentifier = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
//     const attempts = await authRateLimiter.checkRateLimit(clientIdentifier, 'AUTH_FAILURES');

//     if (attempts >= RATE_LIMIT_CONFIG.AUTH_FAILURES.maxAttempts) {
//       const blockKey = `rate_limit_block:AUTH_FAILURES:${clientIdentifier}`;
//       const blockedUntil = await redis.get(blockKey);

//       if (blockedUntil) {
//         const remainingMinutes = Math.ceil((parseInt(blockedUntil) - Date.now()) / 1000 / 60);
//         throw new RateLimitError({
//           message: `Too many authentication attempts. Please try again in ${remainingMinutes} minutes`,
//           retryAfter: remainingMinutes * 60,
//           metadata: {
//             clientIdentifier,
//             attempts
//           }
//         });
//       }
//     }

//     // Extract token from multiple sources
//     let token = this.extractToken(req);

//     if (!token) {
//       await authRateLimiter.incrementFailedAttempt(clientIdentifier);

//       throw new AuthenticationError({
//         message: 'Authentication required. Please log in.',
//         code: 'NO_TOKEN',
//         metadata: {
//           clientIdentifier,
//           userAgent: req.headers['user-agent']
//         }
//       });
//     }

//     // Check token revocation
//     const isRevoked = await tokenManager.isTokenRevoked(token);
//     if (isRevoked) {
//       throw new AuthenticationError({
//         message: 'Session has been terminated. Please log in again.',
//         code: 'TOKEN_REVOKED'
//       });
//     }

//     // Verify JWT token
//     let decoded;
//     try {
//       decoded = jwt.verify(token, config.jwt.accessSecret, {
//         algorithms: ['HS256'],
//         clockTolerance: 30, // Allow 30 seconds clock skew
//         ignoreExpiration: false
//       });

//       // Validate token structure
//       if (!decoded.id || !decoded.role) {
//         throw new AuthenticationError({
//           message: 'Invalid token structure',
//           code: 'INVALID_TOKEN_STRUCTURE'
//         });
//       }

//     } catch (jwtError) {
//       await authRateLimiter.incrementFailedAttempt(clientIdentifier);

//       if (jwtError.name === 'TokenExpiredError') {
//         throw new AuthenticationError({
//           message: 'Session expired. Please log in again.',
//           code: 'TOKEN_EXPIRED',
//           originalError: jwtError
//         });
//       }

//       throw new AuthenticationError({
//         message: 'Invalid authentication token',
//         code: 'INVALID_TOKEN',
//         originalError: jwtError
//       });
//     }

//     // Get user from cache or database
//     const user = await userCacheManager.getUser(decoded.id);

//     if (!user) {
//       throw new AuthenticationError({
//         message: 'User account not found or has been removed',
//         code: 'USER_NOT_FOUND',
//         metadata: { userId: decoded.id }
//       });
//     }

//     // Check account status
//     if (!user.isActive) {
//       throw new AuthenticationError({
//         message: 'Account is deactivated. Please contact support.',
//         code: 'ACCOUNT_DEACTIVATED',
//         metadata: { userId: user._id, email: user.email }
//       });
//     }

//     // Attach user to request
//     req.user = user;
//     req.userId = user._id;
//     req.authToken = token;
//     req.authContext = {
//       tokenIssuedAt: new Date(decoded.iat * 1000),
//       tokenExpiresAt: new Date(decoded.exp * 1000),
//       tokenId: decoded.jti,
//       clientIdentifier
//     };

//     // Reset rate limit on successful authentication
//     await redis.del(`rate_limit:AUTH_FAILURES:${clientIdentifier}`);

//     logger.info('User authenticated', {
//       userId: user._id,
//       email: user.email,
//       role: user.role,
//       clientIdentifier,
//       path: req.path
//     });

//     next();
//   } catch (error) {
//     // Log authentication failures
//     if (error.code === 'NO_TOKEN' || error.code === 'INVALID_TOKEN') {
//       logger.warn('Authentication failed', {
//         error: error.code,
//         clientIdentifier: req.ip,
//         path: req.path,
//         userAgent: req.headers['user-agent']
//       });
//     }

//     next(error);
//   }
// };

// /**
//  * Extract token from request
//  */
// authenticate.extractToken = (req) => {
//   // 1. Check Authorization header
//   if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
//     return req.headers.authorization.split(' ')[1];
//   }

//   // 2. Check cookies (for web clients)
//   if (req.cookies?.accessToken) {
//     return req.cookies.accessToken;
//   }

//   // 3. Check query parameter (for WebSocket connections)
//   if (req.query?.token) {
//     return req.query.token;
//   }

//   // 4. Check x-access-token header
//   if (req.headers['x-access-token']) {
//     return req.headers['x-access-token'];
//   }

//   return null;
// };

// /**
//  * Role-based Authorization Middleware
//  */
// export const authorize = (requiredPermissions, options = {}) => {
//   return async (req, res, next) => {
//     try {
//       if (!req.user) {
//         throw new AuthenticationError({
//           message: 'Authentication required',
//           code: 'UNAUTHENTICATED'
//         });
//       }

//       // Check if permissions is a single string or array
//       const permissions = Array.isArray(requiredPermissions)
//         ? requiredPermissions
//         : [requiredPermissions];

//       // Check each permission
//       let hasPermission = false;

//       for (const permission of permissions) {
//         if (await rbacManager.hasPermission(req.user, permission, options)) {
//           hasPermission = true;
//           break;
//         }
//       }

//       if (!hasPermission) {
//         throw new AuthorizationError({
//           message: 'Insufficient permissions to access this resource',
//           code: 'INSUFFICIENT_PERMISSIONS',
//           metadata: {
//             userId: req.user._id,
//             userRole: req.user.role,
//             requiredPermissions: permissions,
//             path: req.path,
//             method: req.method
//           }
//         });
//       }

//       logger.debug('Authorization granted', {
//         userId: req.user._id,
//         permissions,
//         path: req.path
//       });

//       next();
//     } catch (error) {
//       next(error);
//     }
//   };
// };

// /**
//  * Pre-defined role checkers (for backward compatibility)
//  */
// export const requireAdmin = authorize(['*'], { requireVerifiedEmail: false });
// export const requireSeller = authorize(['manage_own_products', 'view_own_sales']);
// export const requireDelivery = authorize(['view_assigned_orders', 'update_order_status']);
// export const requireUser = authorize(['view_own_profile', 'place_orders'], { requireVerifiedEmail: true });

// /**
//  * Email verification middleware
//  */
// export const requireVerifiedEmail = (req, res, next) => {
//   if (!req.user) {
//     throw new AuthenticationError({
//       message: 'Authentication required',
//       code: 'UNAUTHENTICATED'
//     });
//   }

//   if (!req.user.isVerified && req.user.role !== 'ADMIN') {
//     throw new AuthorizationError({
//       message: 'Email verification required',
//       code: 'EMAIL_NOT_VERIFIED',
//       metadata: {
//         userId: req.user._id,
//         email: req.user.email
//       }
//     });
//   }

//   next();
// };

// /**
//  * Active account check middleware
//  */
// export const requireActiveAccount = (req, res, next) => {
//   if (!req.user) {
//     throw new AuthenticationError({
//       message: 'Authentication required',
//       code: 'UNAUTHENTICATED'
//     });
//   }

//   if (!req.user.isActive) {
//     throw new AuthorizationError({
//       message: 'Account is deactivated',
//       code: 'ACCOUNT_DEACTIVATED',
//       metadata: {
//         userId: req.user._id,
//         email: req.user.email
//       }
//     });
//   }

//   next();
// };

// /**
//  * CSRF Protection Middleware
//  */
// export const csrfProtection = (req, res, next) => {
//   // Skip for GET, HEAD, OPTIONS requests
//   if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
//     return next();
//   }

//   // Skip for API tokens (not web forms)
//   if (req.headers.authorization?.startsWith('Bearer ')) {
//     return next();
//   }

//   // Check CSRF token for web forms
//   const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
//   const sessionCsrfToken = req.session?.csrfToken;

//   if (!csrfToken || csrfToken !== sessionCsrfToken) {
//     throw new AuthorizationError({
//       message: 'Invalid CSRF token',
//       code: 'INVALID_CSRF_TOKEN',
//       statusCode: 403
//     });
//   }

//   next();
// };

// /**
//  * Two-Factor Authentication Middleware
//  */
// export const require2FA = (req, res, next) => {
//   if (!req.user) {
//     throw new AuthenticationError({
//       message: 'Authentication required',
//       code: 'UNAUTHENTICATED'
//     });
//   }

//   // Check if 2FA is enabled for the user
//   if (req.user.twoFactorEnabled && !req.session?.twoFactorVerified) {
//     throw new AuthenticationError({
//       message: 'Two-factor authentication required',
//       code: '2FA_REQUIRED',
//       statusCode: 403
//     });
//   }

//   next();
// };

// /**
//  * Audit Logging Middleware
//  */
// export const auditLog = (action, resourceType, resourceId = null) => {
//   return async (req, res, next) => {
//     const originalSend = res.send;

//     res.send = function (data) {
//       // Log after response is sent
//       setTimeout(async () => {
//         try {
//           const auditLog = {
//             userId: req.user?._id,
//             action,
//             resourceType,
//             resourceId: resourceId || req.params.id,
//             ipAddress: req.ip,
//             userAgent: req.headers['user-agent'],
//             timestamp: new Date(),
//             statusCode: res.statusCode,
//             method: req.method,
//             path: req.path,
//             metadata: {
//               query: req.query,
//               params: req.params,
//               bodySize: JSON.stringify(req.body).length
//             }
//           };

//           // Store audit log (could be in database or logging system)
//           await redis.lpush('audit_logs', JSON.stringify(auditLog));
//           await redis.ltrim('audit_logs', 0, 9999); // Keep last 10000 logs

//           logger.info('Audit log recorded', {
//             userId: req.user?._id,
//             action,
//             resourceType,
//             statusCode: res.statusCode
//           });
//         } catch (error) {
//           logger.error('Failed to record audit log:', error);
//         }
//       }, 0);

//       return originalSend.call(this, data);
//     };

//     next();
//   };
// };

// /**
//  * Export utilities for external use
//  */
// export {
//   authRateLimiter,
//   tokenManager,
//   rbacManager,
//   userCacheManager,
//   ROLE_PERMISSIONS,
//   RATE_LIMIT_CONFIG
// };

// export default {
//   authenticate,
//   authorize,
//   requireAdmin,
//   requireSeller,
//   requireDelivery,
//   requireUser,
//   requireVerifiedEmail,
//   requireActiveAccount,
//   csrfProtection,
//   require2FA,
//   auditLog,
//   authRateLimiter,
//   tokenManager,
//   rbacManager
// };