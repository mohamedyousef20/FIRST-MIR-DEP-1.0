import FinancialTransaction from '../models/financialTransaction.model.js';
import mongoose from 'mongoose';

// Helper to build filter from query params
const buildFilter = (query, sellerId = null) => {
  const filter = {};

  if (sellerId) {
    filter.seller = new mongoose.Types.ObjectId(sellerId);
  }

  if (query.type && ['credit', 'debit'].includes(query.type)) {
    filter.type = query.type;
  }

  // Date range filter
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }

  return filter;
};

// @desc    Get seller transactions (authenticated seller)
// @route   GET /api/transactions/seller
// @access  Seller
export const getSellerTransactions = async (req, res) => {
  try {
    const { skip, limit, page } = res.locals.pagination;

    const filter = buildFilter(req.query, req.user._id);

    const [total, transactions] = await Promise.all([
      FinancialTransaction.countDocuments(filter),
      FinancialTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      success: true,
      transactions,
      pagination: res.locals.buildLinks(total)
    });
  } catch (error) {
    console.error('Error fetching seller transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

// @desc    Get transactions for admin (all or by seller)
// @route   GET /api/transactions/admin
// @access  Admin
export const getAdminTransactions = async (req, res) => {
  try {
    const { skip, limit, page } = res.locals.pagination;

    const sellerId = req.query.sellerId;
    const filter = buildFilter(req.query, sellerId);

    const [total, transactions] = await Promise.all([
      FinancialTransaction.countDocuments(filter),
      FinancialTransaction.find(filter)
        .populate('seller', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      success: true,
      transactions,
      pagination: res.locals.buildLinks(total)
    });
  } catch (error) {
    console.error('Error fetching admin transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};
