import OrderActivityLog from '../models/orderActivityLog.model.js';
import Order from '../models/order.model.js';
import mongoose from 'mongoose';

export const getOrderActivity = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    const order = await Order.findById(orderId).select('items buyer');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Authorization: if seller, ensure they are part of order; admin already allowed
    if (req.user.role === 'seller') {
      const sellerId = req.user._id.toString();
      const hasItem = order.items.some((it) => ((it.seller?._id || it.seller).toString()) === sellerId);
      if (!hasItem) {
        return res.status(403).json({ success: false, message: 'Not authorized for this order' });
      }
    }

    const { skip, limit, page } = res.locals.pagination;

    const [total, logs] = await Promise.all([
      OrderActivityLog.countDocuments({ order: orderId }),
      OrderActivityLog.find({ order: orderId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actor', 'firstName lastName role')
    ]);

    res.json({ success: true, logs, pagination: res.locals.buildLinks(total) });
  } catch (error) {
    console.error('Order activity fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity log' });
  }
};
