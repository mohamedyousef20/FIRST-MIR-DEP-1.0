import Notification from '../models/notification.model.js';

/**
 * Persist a notification and emit it to the receiver via Socket.IO.
 *
 * @param {import('socket.io').Server} io Socket.IO server instance
 * @param {Object} opts
 * @param {string} opts.userId Mongo _id of receiver (required)
 * @param {string} opts.title Notification title
 * @param {string} opts.message Notification body
 * @param {string} opts.type One of the allowed notification types
 * @param {string} [opts.actor] _id of actor that caused the notification
 * @param {Object} [opts.data] Arbitrary extra payload (orderId, productId, ...)
 */
export const sendNotification = async (
  io,
  {
    userId,
    role = null,
    title,
    message,
    type,
    actor = null,
    data = {},
  }
) => {
  if (!userId || !title || !message || !type) {
    throw new Error('sendNotification: Missing mandatory fields');
  }

  const payload = {
    userId,
    actor,
    title,
    message,
    type,
    data,
  };

  if (role) {
    payload.role = role;
  }

  // 1. Persist in DB
  const doc = await Notification.create(payload);

  // 2. Emit realtime
  try {
    io.to(`user_${userId}`).emit('notification', doc);
  } catch (err) {
    console.error('Socket emit failed', err.message);
  }

  return doc;
};
