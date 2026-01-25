// backend/socket.js
import { Server } from 'socket.io';
import { socketAuthMiddleware } from './middlewares/socketAuth.js';
import logger from './utils/logger.js';
import { redis } from './config/redis-client.js';

let io;

// Track connected users
const connectedUsers = new Map(); // userId -> socketId[]

/**
 * Initialize Socket.IO server
 */
export const init = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  });

  // Apply authentication middleware
  io.use(socketAuthMiddleware);

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.user.id;
    const userEmail = socket.user.email;

    // Track user connection
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, []);
    }
    connectedUsers.get(userId).push(socket.id);

    logger.info(`User connected: ${userEmail} (ID: ${userId}, Socket: ${socket.id})`);
    logger.info(`Active users: ${connectedUsers.size}`);

    // Join user to their personal room
    socket.join(`user_${userId}`);

    // Notify user of successful connection
    socket.emit('connection_established', {
      message: 'Connected to server',
      userId,
      timestamp: new Date().toISOString(),
    });

    // Notify others in user's room (for multi-device support)
    socket.to(`user_${userId}`).emit('user_connected', {
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Join chat room
    socket.on('join_chat', (chatId) => {
      if (!chatId) {
        return socket.emit('error', { message: 'Chat ID is required' });
      }

      socket.join(`chat_${chatId}`);
      logger.info(`User ${userEmail} joined chat ${chatId}`);

      socket.emit('chat_joined', { chatId });

      // Notify others in the chat
      socket.to(`chat_${chatId}`).emit('user_joined_chat', {
        userId,
        userEmail,
        chatId,
        timestamp: new Date().toISOString(),
      });
    });

    // Leave chat room
    socket.on('leave_chat', (chatId) => {
      if (!chatId) return;

      socket.leave(`chat_${chatId}`);
      logger.info(`User ${userEmail} left chat ${chatId}`);

      socket.to(`chat_${chatId}`).emit('user_left_chat', {
        userId,
        userEmail,
        chatId,
        timestamp: new Date().toISOString(),
      });
    });

    // Typing indicator
    socket.on('typing', ({ chatId, isTyping }) => {
      if (!chatId) return;

      socket.to(`chat_${chatId}`).emit('user_typing', {
        userId,
        userEmail,
        isTyping,
        timestamp: new Date().toISOString(),
      });
    });

    // Send message
    socket.on('send_message', async (messageData) => {
      const { chatId, content, replyTo } = messageData;

      if (!chatId || !content) {
        return socket.emit('error', { message: 'Chat ID and content are required' });
      }

      try {
        // Save message to database
        const Chat = (await import('./models/Chat.model.js')).default;
        const Message = (await import('./models/Message.model.js')).default;

        const chat = await Chat.findById(chatId);
        if (!chat) {
          return socket.emit('error', { message: 'Chat not found' });
        }

        // Check if user is a participant
        if (!chat.participants.includes(userId)) {
          return socket.emit('error', { message: 'Not a participant in this chat' });
        }

        // Create message
        const message = await Message.create({
          chat: chatId,
          sender: userId,
          content,
          replyTo,
          readBy: [userId],
        });

        // Populate sender info
        await message.populate('sender', 'name email avatar');

        // Update chat's last message
        chat.lastMessage = message._id;
        chat.lastActivity = new Date();
        await chat.save();

        // Emit to all participants in the chat
        io.to(`chat_${chatId}`).emit('new_message', {
          message: message.toObject(),
          chatId,
        });

        // Notify participants (excluding sender)
        chat.participants.forEach(participantId => {
          if (participantId.toString() !== userId && connectedUsers.has(participantId.toString())) {
            io.to(`user_${participantId}`).emit('notification', {
              type: 'new_message',
              message: `New message from ${socket.user.email}`,
              chatId,
              from: userId,
            });
          }
        });

      } catch (error) {
        logger.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Read receipt
    socket.on('mark_as_read', async ({ messageId, chatId }) => {
      try {
        const Message = (await import('./models/Message.model.js')).default;

        await Message.findByIdAndUpdate(messageId, {
          $addToSet: { readBy: userId }
        });

        // Notify sender that message was read
        socket.to(`chat_${chatId}`).emit('message_read', {
          messageId,
          readerId: userId,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        logger.error('Error marking message as read:', error);
      }
    });

    // User status (online/offline)
    socket.on('update_status', (status) => {
      const validStatuses = ['online', 'away', 'busy', 'offline'];
      if (!validStatuses.includes(status)) return;

      // Store status in Redis (optional)
      if (redis) {
        redis.setex(`user_status:${userId}`, 300, status); // 5 minutes TTL
      }

      // Notify user's contacts
      socket.broadcast.emit('user_status_changed', {
        userId,
        status,
        timestamp: new Date().toISOString(),
      });
    });

    // Heartbeat/ping
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Custom error event
    socket.on('error', (error) => {
      logger.error(`Socket error from ${userEmail}:`, error);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      // Remove socket from connected users
      const userSockets = connectedUsers.get(userId);
      if (userSockets) {
        const index = userSockets.indexOf(socket.id);
        if (index > -1) {
          userSockets.splice(index, 1);
        }
        if (userSockets.length === 0) {
          connectedUsers.delete(userId);
        }
      }

      logger.info(`User disconnected: ${userEmail} (Reason: ${reason})`);
      logger.info(`Active users: ${connectedUsers.size}`);

      // Notify others in user's room
      socket.to(`user_${userId}`).emit('user_disconnected', {
        userId,
        reason,
        timestamp: new Date().toISOString(),
      });

      // Update status to offline if no more connections
      if (!connectedUsers.has(userId) && redis) {
        redis.setex(`user_status:${userId}`, 300, 'offline');
      }
    });
  });

  return io;
};

/**
 * Get Socket.IO instance
 */
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call init() first.');
  }
  return io;
};

/**
 * Get connected users
 */
export const getConnectedUsers = () => {
  return Array.from(connectedUsers.keys());
};

/**
 * Check if user is connected
 */
export const isUserConnected = (userId) => {
  return connectedUsers.has(userId);
};

/**
 * Send message to specific user
 */
export const sendToUser = (userId, event, data) => {
  if (!io) return false;

  const userSockets = connectedUsers.get(userId);
  if (!userSockets || userSockets.length === 0) {
    return false;
  }

  userSockets.forEach(socketId => {
    io.to(socketId).emit(event, data);
  });

  return true;
};

/**
 * Send message to all users in a chat
 */
export const sendToChat = (chatId, event, data) => {
  if (!io) return false;

  io.to(`chat_${chatId}`).emit(event, data);
  return true;
};