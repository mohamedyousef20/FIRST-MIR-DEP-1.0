import express from 'express';
import {
    createPickupPoint,
    getPickupPoints,
    updatePickupPoint,
    deletePickupPoint
} from '../controllers/pickup.controller.js';
import { protect, isAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

// Get all pickup points
router.get('/', getPickupPoints);

router.use(isAdmin)
// Create pickup point
router.post('/', createPickupPoint);


// Update pickup point
router.put('/:id', updatePickupPoint);

// Delete pickup point
router.delete('/:id', deletePickupPoint);

export default router;