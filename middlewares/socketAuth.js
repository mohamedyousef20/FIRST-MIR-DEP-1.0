// backend/middlewares/socketAuth.js
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { redis } from '../config/redis-client.js';
import logger from '../utils/logger.js';

// Store active refresh tokens for quick lookup (optional caching)
const activeRefreshTokens = new Set();

/**
 * Verify access token
 */
const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('ACCESS_TOKEN_EXPIRED');
        }
        if (error.name === 'JsonWebTokenError') {
            throw new Error('INVALID_ACCESS_TOKEN');
        }
        throw error;
    }
};

/**
 * Verify refresh token (with optional Redis check for revocation)
 */
const verifyRefreshToken = async (token) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

        // Check if token is revoked (optional - for logout functionality)
        if (redis) {
            const isRevoked = await redis.get(`refresh_token:revoked:${decoded.id}:${decoded.jti}`);
            if (isRevoked) {
                throw new Error('REFRESH_TOKEN_REVOKED');
            }
        }

        return decoded;
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('REFRESH_TOKEN_EXPIRED');
        }
        if (error.name === 'JsonWebTokenError') {
            throw new Error('INVALID_REFRESH_TOKEN');
        }
        throw error;
    }
};

/**
 * Generate new tokens
 */
const generateNewTokens = (user) => {
    const accessToken = jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
        },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
    );

    const jti = require('crypto').randomBytes(16).toString('hex');
    const refreshToken = jwt.sign(
        {
            id: user.id,
            jti,
        },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    return { accessToken, refreshToken, jti };
};

/**
 * Store refresh token in Redis (optional)
 */
const storeRefreshToken = async (userId, jti, refreshToken) => {
    if (!redis) return;

    const key = `refresh_token:${userId}:${jti}`;
    await redis.setex(
        key,
        parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800'), // 7 days in seconds
        refreshToken
    );

    // Add to active tokens cache
    activeRefreshTokens.add(`${userId}:${jti}`);
};

/**
 * Socket.IO authentication middleware with token refresh
 */
export const socketAuthMiddleware = async (socket, next) => {
    try {
        let accessToken = null;
        let refreshToken = null;

        // 1. Try to get token from handshake auth/query
        accessToken = socket.handshake.auth?.token || socket.handshake.query?.token;

        // 2. Try to get refresh token from auth
        refreshToken = socket.handshake.auth?.refreshToken;

        // 3. Fallback to cookies
        if (!accessToken && socket.handshake.headers.cookie) {
            const cookies = cookie.parse(socket.handshake.headers.cookie);
            accessToken = cookies.accessToken;
            refreshToken = cookies.refreshToken;
        }

        if (!accessToken && !refreshToken) {
            return next(new Error('MISSING_TOKENS'));
        }

        let user = null;
        let newAccessToken = null;
        let newRefreshToken = null;

        // Try to verify access token first
        if (accessToken) {
            try {
                user = verifyAccessToken(accessToken);
            } catch (accessError) {
                // If access token expired and we have refresh token, try to refresh
                if (accessError.message === 'ACCESS_TOKEN_EXPIRED' && refreshToken) {
                    try {
                        const refreshDecoded = await verifyRefreshToken(refreshToken);

                        // Fetch user from database
                        const User = (await import('../models/User.model.js')).default;
                        const dbUser = await User.findById(refreshDecoded.id).select('-password');

                        if (!dbUser) {
                            return next(new Error('USER_NOT_FOUND'));
                        }

                        // Generate new tokens
                        const tokens = generateNewTokens(dbUser.toObject());
                        newAccessToken = tokens.accessToken;
                        newRefreshToken = tokens.refreshToken;

                        // Store new refresh token
                        await storeRefreshToken(dbUser.id, tokens.jti, newRefreshToken);

                        user = {
                            id: dbUser.id,
                            email: dbUser.email,
                            role: dbUser.role,
                            // Add other user fields as needed
                        };

                        // Send new tokens to client via socket event
                        socket.emit('token_refreshed', {
                            accessToken: newAccessToken,
                            refreshToken: newRefreshToken,
                        });

                    } catch (refreshError) {
                        logger.error('Token refresh failed:', refreshError.message);
                        return next(new Error('REFRESH_FAILED'));
                    }
                } else {
                    return next(accessError);
                }
            }
        } else if (refreshToken) {
            // Only refresh token provided
            try {
                const refreshDecoded = await verifyRefreshToken(refreshToken);

                const User = (await import('../models/User.model.js')).default;
                const dbUser = await User.findById(refreshDecoded.id).select('-password');

                if (!dbUser) {
                    return next(new Error('USER_NOT_FOUND'));
                }

                const tokens = generateNewTokens(dbUser.toObject());
                newAccessToken = tokens.accessToken;
                newRefreshToken = tokens.refreshToken;

                await storeRefreshToken(dbUser.id, tokens.jti, newRefreshToken);

                user = {
                    id: dbUser.id,
                    email: dbUser.email,
                    role: dbUser.role,
                };

                socket.emit('token_refreshed', {
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                });

            } catch (refreshError) {
                return next(new Error('INVALID_REFRESH_TOKEN'));
            }
        }

        if (!user) {
            return next(new Error('AUTHENTICATION_FAILED'));
        }

        // Attach user and tokens to socket
        socket.user = user;
        socket.accessToken = newAccessToken || accessToken;
        socket.refreshToken = newRefreshToken || refreshToken;

        // Join user's personal room
        socket.join(`user_${user.id}`);

        logger.info(`User authenticated via socket: ${user.email} (ID: ${user.id})`);
        next();

    } catch (error) {
        logger.error('Socket authentication error:', error.message, error.stack);

        // Map error messages to client-friendly messages
        let clientMessage = 'Authentication failed';
        switch (error.message) {
            case 'ACCESS_TOKEN_EXPIRED':
                clientMessage = 'Access token expired';
                break;
            case 'REFRESH_TOKEN_EXPIRED':
                clientMessage = 'Session expired, please login again';
                break;
            case 'INVALID_ACCESS_TOKEN':
            case 'INVALID_REFRESH_TOKEN':
                clientMessage = 'Invalid token';
                break;
            case 'REFRESH_TOKEN_REVOKED':
                clientMessage = 'Session revoked';
                break;
            case 'USER_NOT_FOUND':
                clientMessage = 'User not found';
                break;
        }

        next(new Error(clientMessage));
    }
};

/**
 * Logout handler - revoke refresh token
 */
export const revokeRefreshToken = async (userId, jti) => {
    if (!redis) return;

    const key = `refresh_token:revoked:${userId}:${jti}`;
    await redis.setex(
        key,
        parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800'),
        'revoked'
    );

    // Remove from active tokens cache
    activeRefreshTokens.delete(`${userId}:${jti}`);
};

/**
 * Get all active sessions for a user (optional)
 */
export const getUserActiveSessions = async (userId) => {
    if (!redis) return [];

    const pattern = `refresh_token:${userId}:*`;
    const keys = await redis.keys(pattern);

    const sessions = [];
    for (const key of keys) {
        const token = await redis.get(key);
        if (token) {
            const jti = key.split(':')[2];
            sessions.push({ jti, active: true });
        }
    }

    return sessions;
};