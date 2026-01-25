import Order from '../models/order.model.js';
import ReturnRequest from '../models/returnRequest.model.js';
import Rating from '../models/rating.model.js';
import mongoose from 'mongoose';
import Product from '../models/product.model.js';

// Helper to count docs with query
const quickCount = (Model, query) => Model.countDocuments(query);

// Seller counters
export const getSellerCounters = async (req, res) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(req.user._id);

    const [newOrders, ongoingOrders, returnsCount, reviewsCount] = await Promise.all([
      quickCount(Order, {
        'items.seller': sellerId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      quickCount(Order, {
        'items.seller': sellerId,
        deliveryStatus: { $nin: ['delivered', 'cancelled'] }
      }),
      quickCount(ReturnRequest, { seller: sellerId }),
      quickCount(Rating, { seller: sellerId })
    ]);

    res.json({
      success: true,
      data: {
        newOrders,
        ongoingOrders,
        returns: returnsCount,
        reviews: reviewsCount
      }
    });
  } catch (error) {
    console.error('Seller counters error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counters' });
  }
};

// Admin counters (platform level)
export const getAdminCounters = async (_req, res) => {
  try {
    const [newOrders, ongoingOrders, returnsCount, reviewsCount] = await Promise.all([
      quickCount(Order, { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      quickCount(Order, { deliveryStatus: { $nin: ['delivered', 'cancelled'] } }),
      quickCount(ReturnRequest, {}),
      quickCount(Rating, {})
    ]);

    res.json({
      success: true,
      data: {
        newOrders,
        ongoingOrders,
        returns: returnsCount,
        reviews: reviewsCount
      }
    });
  } catch (error) {
    console.error('Admin counters error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counters' });
  }
};
