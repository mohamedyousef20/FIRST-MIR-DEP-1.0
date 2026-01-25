import OrderActivityLog from '../models/orderActivityLog.model.js';

export const logOrderActivity = async ({
  orderId,
  actorId = null,
  actorRole = 'system',
  action,
  description,
  metadata = {}
}) => {
  if (!orderId || !action) {
    return;
  }

  try {
    await OrderActivityLog.create({
      order: orderId,
      actor: actorId,
      actorRole,
      action,
      description,
      metadata
    });
  } catch (error) {
    console.error('Failed to log order activity:', error.message);
  }
};

export default logOrderActivity;
