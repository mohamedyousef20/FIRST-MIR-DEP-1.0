import express from 'express';
import { getUserProfile, getSellerOrders, updateProfile, getSellerBalance, getSellerForAdmin, getUsersForAdmin, searchUsersForAdmin, searchUsers, setSellerTrustedStatus,
     deleteUser, softDeleteUser, restoreUser } from '../controllers/user.controller.js';
import { isAdmin, isSeller, isUser, protect } from '../middlewares/auth.middleware.js';
const router = express.Router();



router.use(protect);


router.get('/profile', getUserProfile);
router.patch('/profile', updateProfile);
router.get('/seller/orders', isSeller, getSellerOrders);
router.get('/seller/balance', isSeller, getSellerBalance);
router.get('/admin/sellers', isAdmin, getSellerForAdmin);
// Toggle trusted status for a seller
router.patch('/admin/seller/:id/trust', isAdmin, setSellerTrustedStatus);
router.get('/admin/users', isAdmin, getUsersForAdmin);
// / Routes الجديدة للبحث
router.get('/search', isAdmin, searchUsers);
router.get('/admin/search', isAdmin, searchUsersForAdmin);

router.use(isAdmin)
router.delete('/', deleteUser);
router.patch('/soft-delete', softDeleteUser);
router.patch('/restore', restoreUser); 
export default router;
