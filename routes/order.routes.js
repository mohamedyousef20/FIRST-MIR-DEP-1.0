import express from 'express';
import {
    getAllOrders,
    getVendorOrders,
    orderComplete,
    updatePayment,
    createOrder,
    confirmPreparation,
    createOrderFilterObj,
    updateDeliveryStatus,
    updatePaymentStatus,
    getUserOrderById,
    getUserOrders,
    toggleOrderStatus
} from '../controllers/order.controller.js';
import { getOrderActivity } from '../controllers/orderActivity.controller.js';
import { isAdmin, isDelivery, isSeller, protect } from '../middlewares/auth.middleware.js';
import isVerified from '../middlewares/isVerified.js';

const router = express.Router();

router.use(protect);

router.post('/complete', isDelivery, orderComplete);


// User orders
router.get('/users', getUserOrders);

router.post("/", isVerified, createOrder);
router.patch("/toggleActivation", isVerified, toggleOrderStatus);


// Admin: all orders
router.get('/admin', isAdmin, getAllOrders);
router.get('/vendor', isSeller, createOrderFilterObj, getVendorOrders);
// Order activity log (seller & admin)
router.get('/:id/activity', isSeller, getOrderActivity);
router.get('/admin/:id/activity', isAdmin, getOrderActivity);

router.get('/:id', getUserOrderById);
// router.get('/vendor/:vendorId/earnings', isSeller, getVendorEarnings);
router.patch('/prepared', isSeller, confirmPreparation);
router.patch('/updateDelivery', isAdmin, updateDeliveryStatus);
router.patch('/:id/payment-status', isAdmin, updatePaymentStatus);
router.post('/update-payment', updatePayment);
// payment
// router.get("/check-out-session/:cartId", verifyToken, checkOutSession);


// router.patch("/pay/method", verifyToken, updatedOrderPaymentMethod);
export default router;
