import express from 'express';
import {
    createAnnouncement,
    getAnnouncements,
    // getAnnouncementById,
    updateAnnouncement,
    deleteAnnouncement,
    getMainAnnouncement,
    getAnnouncementsForAdmin,
} from '../controllers/announcement.controller.js';
import { protect, isAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();


// Get active announcement (public)
router.get('/', getAnnouncements);
// Get main announcement (public)
router.get('/main', getMainAnnouncement);


// Protect all routes below this middleware

router.use(protect); 
router.use(isAdmin); // isAdmin

// Get all announcements (admin)
router.get('/all', getAnnouncementsForAdmin);
// Create announcement (admin only)
router.post('/', createAnnouncement);
// Update announcement (admin only)
router.patch('/:id', updateAnnouncement);
// Delete announcement (admin only)
router.delete('/:id', deleteAnnouncement);

// // Get single announcement (authenticated users)
// router.get('/:id', getAnnouncementById);

export default router;