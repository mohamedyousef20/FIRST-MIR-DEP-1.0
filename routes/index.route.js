import userRoutes from './user.routes.js';
import productRoutes from './product.routes.js';
import orderRoutes from './order.routes.js';
import notificationRoutes from './notification.routes.js';
import returnRoutes from './return.routes.js';
import complaintRoutes from './complaint.routes.js';
import pickupRoutes from './pickup.routes.js';
import cartRoutes from './cart.routes.js';
import categoryRoutes from './category.routes.js';
import brandRoutes from './brand.routes.js';
import announcementRoutes from './announcement.routes.js';
import wishlistRoutes from './wishlist.routes.js';
import couponRoutes from './coupon.routes.js';
import addressesRoutes from './address.routes.js';
import authRoutes from './auth.routes.js';
import ratingRoutes from './rating.routes.js';
import searchRoutes from './search.routes.js';
import analyticsRoutes from './analytics.routes.js';
import transactionRoutes from './transaction.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import platformEarningRoutes from './platformEarnings.routes.js';
import logsRoutes from './logs.routes.js';
import paymentRoutes from './payment.routes.js';

const mountRoutes = (app) => {
    // Product ratings
    app.use('/api/products/:productId/ratings', ratingRoutes);

    // Admin rating management
    // app.use('/api/admin/ratings', adminRatingRoutes);

    // Seller rating management
    // app.use('/api/sellers/ratings', sellerRatingRoutes);

    // Other routes
    app.use('/api/auth', authRoutes);
    app.use('/api/products', productRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/carts', cartRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/returns', returnRoutes);
    app.use('/api/pickup', pickupRoutes);
    app.use('/api/categories', categoryRoutes);
    app.use('/api/brands', brandRoutes);
    app.use('/api/announcements', announcementRoutes);
    app.use('/api/complaints', complaintRoutes);
    app.use('/api/wishlist', wishlistRoutes);
    app.use('/api/coupons', couponRoutes);
    app.use('/api/addresses', addressesRoutes);
    app.use('/api/transactions', transactionRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use('/api/platform-earnings', platformEarningRoutes);
    app.use('/api/payments', paymentRoutes);
    app.use('/api/logs', logsRoutes);

    // Search route
    app.use('/api/search', searchRoutes);
}

export default mountRoutes