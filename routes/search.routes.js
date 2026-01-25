import express from 'express';
import { searchProducts } from '../controllers/search.controller.js';
import paginate from '../middlewares/pagination.js';

const router = express.Router();

// GET /api/search?q=term
router.get('/', paginate(), searchProducts);

export default router;

// const router = express.Router();

// // GET /api/search?q=term
// router.get('/', paginate(), searchProducts);

// export default router;
