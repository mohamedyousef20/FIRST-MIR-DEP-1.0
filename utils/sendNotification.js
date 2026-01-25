import Notification from '../models/notification.model.js';

/**
 * Persist a notification and emit it to the receiver via Socket.IO.
 *
 * @param {import('socket.io').Server} io Socket.IO server instance
 * @param {Object} opts
 * @param {string} opts.user Mongo _id of receiver (required)
 * @param {string} opts.role Role of the recipient ('user' | 'seller' | 'admin')
 * @param {string} opts.title Notification title
 * @param {string} opts.message Notification body
 * @param {string} opts.type One of the allowed notification types
 * @param {string} [opts.actor] _id of actor that caused the notification
 * @param {Object} [opts.data] Arbitrary extra payload (orderId, productId, ...)
 * @param {string} [opts.link] Optional URL link for the notification
 */
export const sendNotification = async (io, {
  user,
  role,
  title,
  message,
  type,
  actor = null,
  data = {},
  link = null
}) => {
  if (!user || !role || !title || !message || !type) {
    throw new Error('sendNotification: Missing mandatory fields');
  }

  // 1. Persist in DB
  const doc = await Notification.create({
    user,
    role,
    actor,
    title,
    message,
    type,
    data,
    link,
    is_read: false, // default for new notifications
  });

  // 2. Emit realtime
  try {
    io.to(`user_${user}`).emit('notification', doc);
  } catch (err) {
    console.error('Socket emit failed', err.message);
  }

  return doc;
};
