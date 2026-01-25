import express from 'express';
import { isUser, isAdmin, protect } from '../middlewares/auth.middleware.js';
import paginate from '../middlewares/pagination.js';
import {
  createComplaint,
  getComplaints,
  getComplaint,
  deleteComplaint,
  getComplaintsForAdmin,
  updateComplaintStatus,
  updateComplaint,
} from '../controllers/complaint.controller.js';

const router = express.Router();

router.use(protect);

// Create a new complaint (users only)
router.post('/', isUser, createComplaint);

// Get complaints (separate endpoints for user/admin)
router.get('/user', isUser, paginate(), getComplaints);
router.get('/admin', isAdmin, paginate(), getComplaintsForAdmin);

// Get single complaint (both user and admin)
router.get('/:id', protect, getComplaint);

// Update complaint (admin updates status, users update content)
router.put('/:id', protect, updateComplaint);

// Update status only (admin only - more specific endpoint)
router.patch('/status', isAdmin, updateComplaintStatus);

// Delete complaint (both user and admin with different permissions)
router.delete('/', isAdmin, deleteComplaint);

export default router;