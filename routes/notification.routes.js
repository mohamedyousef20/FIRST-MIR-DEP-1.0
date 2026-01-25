import express from 'express';
import {
    getNotifications,
    markAsRead,
    sendNotification,
    getUnreadCount,
    markAllAsRead,
    searchUsers,
} from '../controllers/notification.controller.js';
import { isAdmin, protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Apply protection to all routes
router.use(protect);

// User routes
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', markAsRead);
router.patch('/read-all', markAllAsRead);
router.get("/search", searchUsers);

// Admin-only routes
router.post('/', isAdmin, sendNotification);

export default router;
