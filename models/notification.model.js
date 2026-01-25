import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    // Receiver of the notification
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Actor who triggered the notification (optional)
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    role: { type: String, enum: ['user', 'seller', 'admin'] },

    type: {
      type: String,
      enum: [

        // sending notification
        'ALL_USERS',
        'seller',
        'user',
        'CUSTOM',
        // Order related
        'ORDER_PLACED',
        'ORDER_PAID',
        'ORDER_SHIPPED',
        'ORDER_DELIVERED',
        'ORDER_COMPLETED',
        'ORDER_CANCELLED',
        'ORDER_REFUNDED',
        'ORDER_PREPARED',
        'PAYOUT_COMPLETED',
        // Return related
        'RETURN_REQUESTED',
        'RETURN_APPROVED',
        'RETURN_REJECTED',
        'RETURN_PROCESSING',
        'RETURN_READY_FOR_PICKUP',
        'RETURN_RECEIVED',
        'RETURN_FINISHED',
        'RETURN_STATUS_UPDATED',

        // Product related
        'PRODUCT_CREATED',
        'PRODUCT_APPROVED',
        'PRODUCT_REJECTED',
        'PRODUCT_IMAGE_VIOLATION',
        'PRODUCT_EDIT_REQUIRES_APPROVAL',
        'PRODUCT_UPDATED',
        'PRODUCT_DELETED',
        'PRODUCT_OUT_OF_STOCK',
        'LOW_STOCK',
        'PRODUCT_REVIEW_ADDED',

        // User/Auth related
        'USER_REGISTERED',
        'USER_VERIFIED',
        'USER_PROFILE_UPDATED',
        'PASSWORD_CHANGED',
        'EMAIL_VERIFIED',
        'PHONE_VERIFIED',

        // Seller related
        'SELLER_APPLICATION_SUBMITTED',
        'SELLER_APPLICATION_APPROVED',
        'SELLER_APPLICATION_REJECTED',
        'SELLER_BALANCE_UPDATED',
        'SELLER_PAYOUT_PROCESSED',
        'SELLER_PAYOUT_FAILED',

        // Wallet/Payment related
        'WALLET_BALANCE_ADDED',
        'WALLET_BALANCE_WITHDRAWN',
        'PAYMENT_SUCCESS',
        'PAYMENT_FAILED',
        'PAYMENT_REFUNDED',
        'WITHDRAWAL_REQUESTED',
        'WITHDRAWAL_APPROVED',
        'WITHDRAWAL_REJECTED',

        // Support/Complaint related
        'SUPPORT_TICKET_CREATED',
        'SUPPORT_TICKET_UPDATED',
        'SUPPORT_TICKET_RESOLVED',
        'COMPLAINT_SUBMITTED',
        'COMPLAINT_RESPONDED',

        // Review/Rating related
        'REVIEW_RECEIVED',
        'REVIEW_RESPONDED',
        'RATING_RECEIVED',

        // Wishlist/Cart related
        'WISHLIST_ITEM_BACK_IN_STOCK',
        'CART_ITEM_PRICE_DROPPED',
        'CART_ITEM_OUT_OF_STOCK',

        // Shipping/Delivery related
        'SHIPPING_STATUS_UPDATED',
        'DELIVERY_CONFIRMED',
        'DELIVERY_FAILED',
        'PICKUP_READY',
        'PICKUP_COMPLETED',

        // Promotion/Offer related
        'NEW_OFFER_AVAILABLE',
        'PROMOTION_STARTED',
        'PROMOTION_ENDING_SOON',
        'COUPON_APPLIED',
        'COUPON_EXPIRING',

        // System/Admin related
        'ADMIN_ALERT',
        'SYSTEM_MAINTENANCE',
        'NEW_FEATURE_AVAILABLE',
        'APP_UPDATE',
        'NEWS_ANNOUNCEMENT',

        // Security related
        'LOGIN_ATTEMPT',
        'SUSPICIOUS_ACTIVITY',
        'ACCOUNT_LOCKED',
        'PASSWORD_RESET_REQUESTED',
        'DEVICE_NEW_LOGIN',
      ],
      required: true,
    },

    title: { type: String, required: true },
    message: { type: String, required: true },

    // Flexible payload for any additional references (orderId, productId, etc.)
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    link: { type: String },

    isRead: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
  },

  {
    timestamps: true,
  }
);

// Compound index to speed up unread queries
notificationSchema.index({ userId: 1, isRead: 1 });






export default mongoose.model('Notification', notificationSchema);
