import express from 'express';
import {
    getPlatformEarningsById,
    getSellerPlatformEarnings,
    createPlatformEarnings,
    updatePlatformEarnings,
    deletePlatformEarnings,
    getSellerEarningsSummary,
    getPlatformEarningsSummary
} from '../controllers/platformEarnings.controller.js';

import { isAdmin, protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Seller routes (authenticated users can access their own earnings)
router.use(protect)
router.get('/seller/:sellerId', getSellerPlatformEarnings);
router.get('/seller-summary/:sellerId', getSellerEarningsSummary);
router.get('/:id', getPlatformEarningsById);

// Admin routes (only admins can create, update, delete)
router.use(isAdmin)
router.get('/admin/summary', getPlatformEarningsSummary);
router.post('/', createPlatformEarnings);
router.put('/:id', updatePlatformEarnings);
router.delete('/:id', deletePlatformEarnings);

export default router;