import mongoose from "mongoose";

const platformEarningsSchema = new mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true
    },
    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    commission: {
        type: Number,
        required: true
    },
    discountAmount: {        
        type: Number,
        default: 0
    },

    discountDetails: {    
        couponCode: String,
        totalCouponDiscount: Number,
        platformShare: Number,
        sellerShare: Number
    },
    amount: {
        type: Number, 
        required: true
    },
    shippingRevenue: {
        type: Number, // commission - discounts
        required: true
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model("PlatformEarnings", platformEarningsSchema);
