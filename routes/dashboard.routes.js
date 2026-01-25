import express from 'express';
import { protect, isSeller, isAdmin } from '../middlewares/auth.middleware.js';
import { getSellerCounters, getAdminCounters } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.use(protect);

// Counters
router.get('/seller/counters', isSeller, getSellerCounters);
router.get('/admin/counters', isAdmin, getAdminCounters);

export default router;
