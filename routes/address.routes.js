import express from 'express';
import { addAddress, deleteAddress, getAddress, getAddresses, setDefaultAddress, updateAddress } from '../controllers/address.controller.js'
import paginate from '../middlewares/pagination.js';
import { protect } from '../middlewares/auth.middleware.js';
const router = express.Router();

// All routes are protected and require authentication
router.use(protect);

// Address routes
router.get('/', paginate(), getAddresses);
router.post('/', addAddress);
router.delete('/', deleteAddress);
router.get('/:id', getAddress);
router.patch('/', updateAddress);
router.patch('/set-default', setDefaultAddress);


export default router;
