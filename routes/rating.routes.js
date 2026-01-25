import express from 'express';
import { addRating, deleteRating, getProductRatings, updateRating } from '../controllers/rating.controller.js';
import { protect, isUser } from '../middlewares/auth.middleware.js';

const router = express.Router({ mergeParams: true });
router.use(protect)
// router.use(isUser)
router.post('/', addRating)
router.get('/', getProductRatings)

router.patch('/:ratingId',updateRating)
router.delete('/:ratingId',deleteRating)
  
export default router;
