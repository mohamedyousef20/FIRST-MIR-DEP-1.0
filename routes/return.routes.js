import express from 'express';
import { createReturnRequest, deleteReturnRequest, getReturnRequestById, getReturnRequests, getReturnRequestsForAdmin, updateReturnStatus, updateReturnRequestByUser } from '../controllers/return.controller.js';
import { isAdmin, isSeller, isUser, protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

// إنشاء طلب استرجاع
router.post('/', createReturnRequest);

// جلب طلبات الاسترجاع
router.get('/', getReturnRequests);

router.get('/admin', isAdmin, getReturnRequestsForAdmin);

router.patch('/', isAdmin, updateReturnStatus);

// تحديث طلب الإرجاع بواسطة المستخدم (يمكنه تعديل السبب أو الصور)
router.patch('/user', isUser, updateReturnRequestByUser);

router.delete('/', isUser, deleteReturnRequest);
router.get('/:id', isUser, getReturnRequestById);

export default router;
