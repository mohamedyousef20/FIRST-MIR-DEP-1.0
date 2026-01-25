const express = require('express');
const rating.controller = require('../../controllers/rating.controller');
const authController = require('../../controllers/authController');

const router = express.Router({ mergeParams: true });

// Protect all routes after this middleware
router.use(authController.protect);
router.use(authController.restrictTo('seller'));

// Get all ratings for seller's products
router.get('/', rating.controller.getSellerRatings);

// Get stats for seller's ratings
router.get('/stats', rating.controller.getSellerRatings);

module.exports = router;
