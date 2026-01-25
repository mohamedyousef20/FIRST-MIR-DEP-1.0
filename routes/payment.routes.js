import express from 'express';
import { createPaymobPayment, paymobWebhook } from '../controllers/payment.controller.js';
import { protect, isUser } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Protected: any authenticated user can create checkout session (adjust middleware as needed)
router.post('/create-session', createPaymobPayment); // mak
router.post('/webhook', paymobWebhook); // click on the visa id and edit call back

// Public: Get available payment methods
export default router;
