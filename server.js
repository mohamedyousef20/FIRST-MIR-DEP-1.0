// server.js - النسخة المصححة
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import morgan from 'morgan';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import { redis } from './config/redis-client.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { applySecurityMiddleware, corsOptions } from './middlewares/security.js';
// Pagination middleware will be applied per-route instead of globally
// import paginate from './middlewares/pagination.js';
import { init as initSocket } from './socket.js';
import logger from './utils/logger.js';
import { config } from './config/config.js';
import mountRoutes from './routes/index.route.js';
import jwt from 'jsonwebtoken';
import './utils/cron.js';
import cookie from 'cookie';
import { startPendingPayoutProcessor } from './jobs/pendingPayoutProcessor.js';

// Initialize Express app
const app = express();
const server = createServer(app);

// Log requests
if (config.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: logger.stream
  }));
}

// Enable compression
app.use(compression());

// Parse JSON bodies
app.use(express.json({ limit: '10kb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Parse cookies
app.use(cookieParser());

app.use(cors(corsOptions));

applySecurityMiddleware(app);

// Pagination is now applied at route level where needed

// Initialize Socket.IO with CORS
const io = initSocket(server);

// Make io accessible in routes
app.set('io', io);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  try {
    // Try auth.token first (mobile / explicit)
    let token = socket.handshake.auth?.token || socket.handshake.query?.token;

    // Fallback to HTTP cookies in the handshake headers
    if (!token && socket.handshake.headers.cookie) {
      const cookies = cookie.parse(socket.handshake.headers.cookie);
      token = cookies.accessToken;
    }

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    socket.user = decoded; // make user accessible later
    socket.join(`user_${decoded.id}`);
    return next();
  } catch (err) {
    logger.error('Socket authentication error:', err.message);
    return next(new Error('Authentication failed'));
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  logger.info('User connected:', socket.user?.email || 'Unknown');

  // Handle chat room joining
  socket.on('joinChat', (chatId) => {
    socket.join(`chat_${chatId}`);
    logger.info(`User ${socket.user?.email} joined chat ${chatId}`);
  });

  // Handle typing indicator
  socket.on('typing', ({ chatId, isTyping }) => {
    socket.to(`chat_${chatId}`).emit('userTyping', {
      userId: socket.user.id,
      isTyping
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.info('User disconnected:', socket.user?.email || 'Unknown');
  });
});

// Import routes
mountRoutes(app);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    console.log('🚀 Starting server...');
    console.log('='.repeat(50));

    await connectDB();
    logger.info('Connected to MongoDB');

    // تحقق من اتصال Redis
    try {
      await redis.ping();
      logger.info('✅ Redis connected successfully');
    } catch (redisError) {
      logger.warn('⚠️ Redis not available, using in-memory cache');
      logger.debug('Redis error:', redisError.message);
    }

    server.listen(config.port, () => {
      console.log('='.repeat(50));
      console.log(`✅ Server running on port ${config.port}`);
      console.log(`🌐 http://localhost:${config.port}`);
      console.log(`📊 Health check: http://localhost:${config.port}/api/health`);
      console.log(`⚡ Environment: ${config.env}`);
      console.log('='.repeat(50));

      logger.info(`Server running on port ${config.port} in ${config.env} mode`);

      if (config.env === 'production') {
        logger.info('Server started successfully');
      }

      startPendingPayoutProcessor();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
  logger.error(err.name, err.message);
  logger.info(err, 'err');

  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  logger.error(err.name);
  logger.error(err.message);

  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Start the server
startServer();