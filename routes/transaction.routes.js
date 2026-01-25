import express from 'express';
import { protect, isSeller, isAdmin } from '../middlewares/auth.middleware.js';
import paginate from '../middlewares/pagination.js';
import { getSellerTransactions, getAdminTransactions } from '../controllers/financialTransaction.controller.js';

const router = express.Router();

router.use(protect);

// Seller route
router.get('/seller', isSeller, paginate(), getSellerTransactions);

// Admin route
router.get('/admin', isAdmin, paginate(), getAdminTransactions);

export default router;
