import express from 'express';
import { protect, isSeller, isAdmin } from '../middlewares/auth.middleware.js';
import { getSellerAnalytics, getAdminAnalytics } from '../controllers/analytics.controller.js';

const router = express.Router();

router.use(protect);

router.get('/seller', isSeller, getSellerAnalytics);
router.get('/admin', isAdmin, getAdminAnalytics);

export default router;
