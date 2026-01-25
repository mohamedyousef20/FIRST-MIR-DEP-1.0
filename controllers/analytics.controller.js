import Order from '../models/order.model.js';
import Product from '../models/product.model.js';
import mongoose from 'mongoose';

const last30DaysStart = () => new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

const buildOrderCountPipeline = (match) => ([
  { $match: match },
  {
    $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      count: { $sum: 1 }
    }
  },
  { $sort: { _id: 1 } }
]);

export const getSellerAnalytics = async (req, res) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(req.user._id);
    const startDate = last30DaysStart();

    const ordersPerDay = await Order.aggregate(buildOrderCountPipeline({ 'items.seller': sellerId, createdAt: { $gte: startDate } }));

    const topSellingProducts = await Product.find({ seller: sellerId })
      .select('title sold ratingsAverage')
      .sort({ sold: -1 })
      .limit(5);

    const highestRatedProducts = await Product.find({ seller: sellerId, ratingsQuantity: { $gt: 0 } })
      .select('title ratingsAverage sold')
      .sort({ ratingsAverage: -1 })
      .limit(5);

    const prepStats = await Order.aggregate([
      { $match: { 'items.seller': sellerId, deliveredAt: { $exists: true } } },
      { $project: { diffHours: { $divide: [{ $subtract: ['$deliveredAt', '$createdAt'] }, 1000 * 60 * 60] } } },
      { $group: { _id: null, avgHours: { $avg: '$diffHours' } } }
    ]);
    const avgPreparationTime = prepStats[0]?.avgHours || 0;

    const satAgg = await Product.aggregate([
      { $match: { seller: sellerId, ratingsQuantity: { $gt: 0 } } },
      { $group: { _id: null, totalWeighted: { $sum: { $multiply: ['$ratingsAverage', '$ratingsQuantity'] } }, totalQty: { $sum: '$ratingsQuantity' } } }
    ]);
    const satisfactionScore = satAgg.length ? satAgg[0].totalWeighted / satAgg[0].totalQty : 0;

    res.json({ success: true, data: { ordersPerDay, topSellingProducts, highestRatedProducts, avgPreparationTime, satisfactionScore } });
  } catch (error) {
    console.error('Seller analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
};

export const getAdminAnalytics = async (_req, res) => {
  try {
    const startDate = last30DaysStart();

    const ordersPerDay = await Order.aggregate(buildOrderCountPipeline({ createdAt: { $gte: startDate } }));

    const topSellingProducts = await Product.find()
      .select('title sold ratingsAverage seller')
      .sort({ sold: -1 })
      .limit(5)
      .populate('seller', 'firstName lastName');

    const highestRatedProducts = await Product.find({ ratingsQuantity: { $gt: 0 } })
      .select('title ratingsAverage sold seller')
      .sort({ ratingsAverage: -1 })
      .limit(5)
      .populate('seller', 'firstName lastName');

    const prepStats = await Order.aggregate([
      { $match: { deliveredAt: { $exists: true } } },
      { $project: { diffHours: { $divide: [{ $subtract: ['$deliveredAt', '$createdAt'] }, 1000 * 60 * 60] } } },
      { $group: { _id: null, avgHours: { $avg: '$diffHours' } } }
    ]);
    const avgPreparationTime = prepStats[0]?.avgHours || 0;

    const satAgg = await Product.aggregate([
      { $match: { ratingsQuantity: { $gt: 0 } } },
      { $group: { _id: null, totalWeighted: { $sum: { $multiply: ['$ratingsAverage', '$ratingsQuantity'] } }, totalQty: { $sum: '$ratingsQuantity' } } }
    ]);
    const satisfactionScore = satAgg.length ? satAgg[0].totalWeighted / satAgg[0].totalQty : 0;

    res.json({ success: true, data: { ordersPerDay, topSellingProducts, highestRatedProducts, avgPreparationTime, satisfactionScore } });
  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
};
