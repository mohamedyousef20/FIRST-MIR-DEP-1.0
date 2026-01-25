import Order from '../models/order.model.js';
import Product from '../models/product.model.js';
import logOrderActivity from '../services/orderActivity.service.js';
import User from '../models/user.model.js';
import SecretCode from '../models/secretCode.model.js';
import Notification from '../models/notification.model.js';
import Cart from '../models/cart.model.js';
import Address from '../models/address.model.js';
import mongoose from 'mongoose';
import PlatformEarningsModel from '../models/PlatformEarnings.model.js';
import FinancialTransaction from '../models/financialTransaction.model.js';
import Coupon from '../models/coupon.model.js';
import asyncHandler from 'express-async-handler';

// calc platform percentage 
function getPlatformFeeByPrice(price) {
  if (price < 300) return 0.18;
  if (price >= 300 && price <= 799) return 0.15;
  if (price >= 800 && price <= 1999) return 0.12;
  return 0.10; // more than 2000
}

const formatAddressString = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address.trim();

  const source = address.toObject ? address.toObject() : address;
  const {
    address: line,
    street,
    district,
    city,
    state,
    governorate,
    region,
  } = source;

  return [line, street, district, city, state || region]
    .filter(Boolean)
    .join(', ')
    .trim();
};

export const createOrderFilterObj = (req, res, next) => {
  let filterObj = {};

  // Handle query parameters from the request
  const {
    buyer,
    seller,
    product,
    minTotal,
    maxTotal,
    paymentMethod,
    paymentStatus,
    deliveryMethod,
    deliveryStatus,
    payoutProcessed,
    isPrepared,
    secretCode,
    startDate,
    endDate,
    search
  } = req.query;

  // Buyer filter
  if (buyer) {
    filterObj.buyer = new mongoose.Types.ObjectId(buyer);
  }

  // Seller filter (through items array)
  if (seller) {
    filterObj['items.seller'] = new mongoose.Types.ObjectId(seller);
  }

  // Product filter (through items array)
  if (product) {
    filterObj['items.product'] = new mongoose.Types.ObjectId(product);
  }

  // Total price range filtering
  if (minTotal || maxTotal) {
    filterObj.total = {};
    if (minTotal) {
      filterObj.total.$gte = parseFloat(minTotal);
    }
    if (maxTotal) {
      filterObj.total.$lte = parseFloat(maxTotal);
    }
  }

  // Payment method filter
  if (paymentMethod) {
    filterObj.paymentMethod = paymentMethod;
  }

  // Payment status filter
  if (paymentStatus) {
    filterObj.paymentStatus = paymentStatus;
  }

  // Delivery method filter
  if (deliveryMethod) {
    filterObj.deliveryMethod = deliveryMethod;
  }

  // Delivery status filter
  if (deliveryStatus) {
    filterObj.deliveryStatus = deliveryStatus;
  }

  // Boolean filters
  if (payoutProcessed !== undefined) {
    filterObj.payoutProcessed = payoutProcessed === 'true';
  }

  if (isPrepared !== undefined) {
    filterObj.isPrepared = isPrepared === 'true';
  }

  // Secret code filter
  if (secretCode) {
    filterObj.secretCode = secretCode;
  }

  // Date range filtering
  if (startDate || endDate) {
    filterObj.createdAt = {};
    if (startDate) {
      filterObj.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filterObj.createdAt.$lte = new Date(endDate);
    }
  }

  // Search functionality (if you want to search by delivery info)
  if (search) {
    filterObj.$or = [
      { 'deliveryInfo.fullName': { $regex: search, $options: 'i' } },
      { 'deliveryInfo.phoneNumber': { $regex: search, $options: 'i' } },
      { 'deliveryInfo.address': { $regex: search, $options: 'i' } },
      { secretCode: { $regex: search, $options: 'i' } }
    ];
  }

  req.filterObj = filterObj;
  next();
};

// Helper function to generate secret code
const generateUniqueSecretCode = async (buyerId) => {
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits of current time
  const randomDigits = Math.floor(100 + Math.random() * 900); // 3 random digits (100-999)
  const buyerSuffix = buyerId.toString().slice(-3); // Last 3 digits of buyer ID

  const code = `${timestamp}${randomDigits}${buyerSuffix}`;
  // Double-check uniqueness (rarely needed, but ensures safety)
  const existingOrder = await Order.findOne({ secretCode: code });
  if (existingOrder) {
    // If by some miracle it's not unique, retry recursively
    return generateUniqueSecretCode(buyerId);
  }

  return code;
};

export const updatePayment = asyncHandler(async (req, res) => {
  const { orderId, paymentMethod, totalAmount } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    return res.status(404).json({ message: 'Order not found' });
  }

  // Update payment details
  order.paymentMethod = paymentMethod;
  order.total = totalAmount;
  order.paymentStatus = 'completed';

  await order.save();

  res.status(200).json({ message: 'Payment updated successfully' });
});

export const updatePaymentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowedStatuses = ['pending', 'paid', 'failed'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid payment status' });
  }

  const order = await Order.findById(id);
  if (!order) {
    return res.status(404).json({ message: 'Order not found' });
  }

  order.paymentStatus = status;
  await order.save();

  res.json({ message: 'success' });
});

export const createOrder = asyncHandler(async (req, res, next) => {
  // Get the user's cart
  const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
  if (!cart || cart.items.length === 0) {
    return res.status(404).json({ message: 'No cart found or cart is empty' });
  }

  const requestedAddressId = req.body.addressId;
  let deliveryAddress = formatAddressString(req.body.deliveryAddress || req.body.deliveryInfo?.address);
  let pickupPoint = req.body.pickupPoint || req.body.deliveryInfo?.pickupPoint;

  // Validate delivery info based on method
  if (req.body.deliveryMethod === 'home') {
    if (!deliveryAddress && requestedAddressId && mongoose.Types.ObjectId.isValid(requestedAddressId)) {
      const savedAddress = await Address.findOne({ _id: requestedAddressId, user: req.user._id });
      if (savedAddress) {
        deliveryAddress = formatAddressString(savedAddress);
      }
    }

    if (!deliveryAddress) {
      const defaultAddress = await Address.findOne({
        user: req.user._id,
        isDefault: true
      });

      if (defaultAddress) {
        deliveryAddress = formatAddressString(defaultAddress);
      }
    }

    if (!deliveryAddress) {
      return res.status(400).json({
        message: 'Delivery address is required for home delivery'
      });
    }
  }

  if (req.body.deliveryMethod === 'pickup') {
    if (!pickupPoint) {
      return res.status(400).json({
        message: 'Pickup point is required for pickup delivery'
      });
    }
  }

  // Calculate order totals - use cart's appliedCoupon if exists
  let subtotal = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  let discount = 0;
  let couponData = null;

  // ✅ Check if coupon is applied in cart
  if (cart.appliedCoupon) {
    couponData = {
      code: cart.appliedCoupon.code,
      discountAmount: cart.appliedCoupon.discountAmount,
      couponId: cart.appliedCoupon.couponId
    };

    // ✅ IMPORTANT: Increment coupon usage only when order is created
    await Coupon.findByIdAndUpdate(
      cart.appliedCoupon.couponId,
      { $inc: { currentUses: 1 } }
    );

    // Clear coupon from cart
    cart.appliedCoupon = undefined;
    await cart.save();
  }

  // Use frontend values if provided, otherwise calculate
  const shippingFee = subtotal > 500 ? 0 : 30;
  const total = req.body.total || (subtotal - discount + shippingFee);

  const deliveryInfoData = {
    address: req.body.deliveryMethod === 'home' ? deliveryAddress : undefined,
    pickupPoint: req.body.deliveryMethod === 'pickup' ? pickupPoint : undefined
  };

  // Create order
  const order = await Order.create({
    buyer: req.user._id,
    items: cart.items.map(item => ({
      product: item.product._id,
      seller: item.product.seller,
      quantity: item.quantity,
      price: item.product.price,
      color: item.colors?.length > 0 ? item.colors[0] : undefined,
      size: item.sizes?.length > 0 ? item.sizes[0] : undefined
    })),

    // Recipient information (can be different from buyer)
    recipientInfo: {
      fullName: req.body.recipientInfo.fullName,
      phoneNumber: req.body.recipientInfo.phoneNumber
    },

    // Order info
    paymentMethod: req.body.paymentMethod,
    deliveryMethod: req.body.deliveryMethod,

    // Use the determined delivery address (either from request or default)
    deliveryAddress: req.body.deliveryMethod === 'home' ? deliveryAddress : undefined,
    pickupPoint: req.body.deliveryMethod === 'pickup' ? pickupPoint : undefined,

    // Delivery info structure
    deliveryInfo: deliveryInfoData,

    // ✅ Add coupon data to order
    coupon: couponData,

    // Totals
    subtotal,
    discount,
    shippingFee,
    total,

    // Default statuses
    paymentStatus: 'pending',
    deliveryStatus: 'pending',

    // Secret code
    secretCode: await generateUniqueSecretCode(req.user._id)
  });

  // //console.log('Order created:', order)

  // Notify each seller about items to prepare in this order
  try {
    const sellerItemsMap = {};
    order.items.forEach((it) => {
      const sellerId = it.seller.toString();
      if (!sellerItemsMap[sellerId]) sellerItemsMap[sellerId] = [];
      sellerItemsMap[sellerId].push(it);
    });

    const notifications = Object.keys(sellerItemsMap).map((sellerId) => ({
      userId: sellerId,
      role: 'seller',
      type: 'ORDER_PLACED',
      title: 'طلب جديد 🔔',
      message: `طلب جديد يحتوي على ${sellerItemsMap[sellerId].length} منتج - الرقم ${order._id.toString().slice(-6)}`,
      orderId: order._id,
      link: `/vendor/dashboard`
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (nErr) {
    console.error('Failed to create seller notifications for order:', nErr);
  }

  // Update product quantities and sold counts
  const bulkOps = cart.items.map(item => ({
    updateOne: {
      filter: { _id: item.product._id },
      update: {
        $inc: {
          quantity: -item.quantity,
          sold: item.quantity
        }
      }
    }
  }));

  const result = await Product.bulkWrite(bulkOps, { ordered: false });


if (result.modifiedCount !== cart.items.length) {
  throw new Error(`Failed to update all products. Expected ${cart.items.length} updates, but got ${result.modifiedCount}`);
}

// Clear the user's cart
await Cart.findOneAndDelete({ user: req.user._id });

res.status(201).json({
  status: 'success',
  data: order
});
});

// get all orders 
export const getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json(orders);
});

export const getUserOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ buyer: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
});

export const getVendorOrders = asyncHandler(async (req, res) => {
  const filter = { ...(req.filterObj || {}) };
  const sellerId = req.user._id.toString();
  // Ensure we only fetch orders that have items for this seller
  const orders = await Order.find({ ...filter, 'items.seller': req.user._id })
    .populate('buyer', 'firstName lastName')
    .populate({
      path: 'items.product',
      select: 'title titleEn images'
    });

  // Only return the items that belong to this seller in each order
  const shaped = orders.map((ord) => {
    const obj = ord.toObject();
    obj.items = obj.items.filter((it) => {
      const sid = (it.seller?._id || it.seller).toString();
      return sid === sellerId;
    });
    return obj;
  });
  res.json(shaped);
});

export const getVendorEarnings = asyncHandler(async (req, res) => {
  const { vendorId } = req.params;
  const orders = await Order.find({ seller: vendorId });

  const earnings = orders.reduce((sum, order) => {
    const vendorAmount = order.productPrice * ((100 - order.sitePercentage - order.discountPercentage) / 100);
    return sum + vendorAmount;
  }, 0);

  res.json({ earnings });
});



// get user orders 
export const getUserOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const filter = { _id: id };

  // لو مش admin اربط الطلب بالمستخدم
  if (req.user.role !== 'admin') {
    filter.buyer = req.user._id;
  }
  // Find order and ensure it belongs to the logged-in user
  const order = await Order.findOne(filter)

  // //console.log(order, 'od')
  if (!order) {
    return res.status(404).json({
      message: 'Order not found or you do not have permission to view this order'
    });
  }

  res.json(order);
});

export const confirmPreparation = asyncHandler(async (req, res) => {
  const { id } = req.body;
  // //console.log(req.body, 'bds');

  if (!id) {
    return res.status(400).json({ message: 'Order ID is required' });
  }

  const order = await Order.findById(id);

  if (!order) {
    return res.status(404).json({ message: 'Order not found' });
  }

  const sellerId = req.user._id.toString();

  const sellerHasItems = order.items.some(
    (it) => ((it.seller?._id || it.seller).toString()) === sellerId
  );

  if (!sellerHasItems) {
    return res.status(403).json({ message: 'This order has no items for the current seller' });
  }

  let anyUpdated = false;

  order.items.forEach((it) => {
    const sid = (it.seller?._id || it.seller).toString();
    if (sid === sellerId && !it.isPrepared) {
      it.isPrepared = true;
      anyUpdated = true;
    }
  });

  order.isPrepared = order.items.every((it) => it.isPrepared === true);
  await order.save();

  // Log order preparation activity
  await logOrderActivity({
    orderId: order._id,
    actorId: req.user._id,
    actorRole: 'seller',
    action: 'order_prepared',
    description: 'Seller confirmed preparation of items',
    metadata: { itemsPrepared: anyUpdated }
  });

  // ----------------------------
  // Notify buyer if fully prepared
  // ----------------------------
  if (order.isPrepared) {
    try {
      // Buyer notification
      await Notification.create({
        userId: order.buyer,
        role: 'user',
        type: 'ORDER_PREPARED',
        title: '🚚 تم تجهيز الطلب',
        message: 'طلبك جاهز الآن للشحن 🚀',
        orderId: order._id,
        link: `/orders/${order._id}`
      });
    } catch (notifyErr) {
      console.error('Failed to notify buyer:', notifyErr);
    }

    // ----------------------------
    // Notify all admins
    // Optimized: insertMany (Fast)
    // ----------------------------
    const admins = await User.find({ role: 'admin' }).select('_id');

    if (admins.length > 0) {
      const notifications = admins.map((admin) => ({
        userId: admin._id,
        role: 'admin',
        type: 'ORDER_PREPARED',
        title: '🚚 تم تجهيز الطلب',
        message: `تم تجهيز الطلب رقم #${order._id} بالكامل.`,
        orderId: order._id,
        link: `/orders/${order._id}`
      }));

      await Notification.insertMany(notifications);
    }
  }

  return res.status(200).json({ msg: "Order prepared successfully" });
});

// shaped
// export const orderComplete = asyncHandler(async (req, res) => {
//   const { id, code } = req.body;

//   // Find order by ID + secret code
//   const order = await Order.findOne({ _id: id, secretCode: code }).populate("items.seller");
//   if (!order) {
//     return res.status(404).json({ message: 'Order not found or code invalid' });
//   }
//   console.log(order,'orderss454')

//   // Update order status
//   order.deliveryStatus = 'delivered';
//   order.paymentStatus = 'paid';
//   order.deliveredAt = Date.now();
//   await order.save();

//   // Log order completion
//   await logOrderActivity({
//     orderId: order._id,
//     actorId: req.user._id,
//     actorRole: 'delivery',
//     action: 'order_delivered',
//     description: 'Order marked as delivered & paid',
//     metadata: { secretCodeVerified: true }
//   });

//   // Process payouts only once
//   if (!order.payoutProcessed) {
//     const sellerEarningsMap = {};
//     let totalCouponDiscount = order.coupon?.discountAmount || 0;
//     let totalPlatformEarnings = 0;
//     let totalSellerEarnings = 0;

//     // 💰 Calculate seller earnings and platform fees
//     order.items.forEach((item) => {
//       const sellerId = item.seller._id.toString();
//       const itemTotal = item.price * item.quantity;

//       // Get dynamic platform fee based on product price
//       const platformFeePercentage = getPlatformFeeByPrice(item.price);

//       const sellerEarnings = itemTotal * (1 - platformFeePercentage);
//       const platformCommission = itemTotal * platformFeePercentage;

//       if (!sellerEarningsMap[sellerId]) {
//         sellerEarningsMap[sellerId] = {
//           seller: item.seller,
//           earnings: 0,
//           platformCommission: 0,          // after coupon deductions
//           originalPlatformCommission: 0,  // before coupon deductions
//           itemTotal: 0
//         };
//       }

//       sellerEarningsMap[sellerId].earnings += sellerEarnings;
//       // Track both original and mutable platform commission
//       sellerEarningsMap[sellerId].platformCommission += platformCommission;
//       sellerEarningsMap[sellerId].originalPlatformCommission += platformCommission;
//       sellerEarningsMap[sellerId].itemTotal += itemTotal;

//       totalPlatformEarnings += platformCommission;
//       totalSellerEarnings += sellerEarnings;
//     });

//     // Calculate the total order value (excluding shipping)
//     const totalOrderValue = totalPlatformEarnings + totalSellerEarnings;

//     // 💰 DISTRIBUTE COUPON DISCOUNT between platform and sellers proportionally
//     if (totalCouponDiscount > 0 && totalOrderValue > 0) {
//       // Calculate what percentage of the discount should be borne by platform vs sellers
//       const platformDiscountShare = (totalPlatformEarnings / totalOrderValue) * totalCouponDiscount;
//       // const sellerDiscountShare = totalCouponDiscount - platformDiscountShare;

//       // Distribute platform discount across sellers proportionally to their platform commission
//       let remainingPlatformDiscount = platformDiscountShare;
//       // let remainingSellerDiscount = sellerDiscountShare;

//       // First pass: distribute platform discount
//       for (const sellerId in sellerEarningsMap) {
//         const seller = sellerEarningsMap[sellerId];
//         const platformShare = seller.platformCommission / totalPlatformEarnings;
//         const platformDiscount = platformDiscountShare * platformShare;

//         // Deduct from platform commission
//         seller.platformCommission = Math.max(0, seller.platformCommission - platformDiscount);
//         remainingPlatformDiscount -= platformDiscount;
//       }

//       // Second pass: distribute seller discount (if any remaining)
//       if (remainingSellerDiscount > 0) {
//         for (const sellerId in sellerEarningsMap) {
//           const seller = sellerEarningsMap[sellerId];
//           const sellerShare = seller.itemTotal / totalOrderValue;
//           // const sellerDiscount = sellerDiscountShare * sellerShare;

//           // Deduct from seller earnings
//           seller.earnings = Math.max(0, seller.earnings - sellerDiscount);
//           remainingSellerDiscount -= sellerDiscount;
//         }
//       }

//       // Handle any rounding discrepancies
//       if (Math.abs(remainingPlatformDiscount) > 0.01) {
//         // Apply rounding adjustment to first seller
//         const firstSellerId = Object.keys(sellerEarningsMap)[0];
//         if (firstSellerId) {
//           sellerEarningsMap[firstSellerId].platformCommission =
//             Math.max(0, sellerEarningsMap[firstSellerId].platformCommission - remainingPlatformDiscount);
//         }
//       }
//     }

//     // Add shipping fee to platform earnings
//     totalPlatformEarnings += order.shippingFee || 0;

//     // Update sellers and create platform earnings records
//     for (const sellerId in sellerEarningsMap) {
//       const { seller, earnings, platformCommission } = sellerEarningsMap[sellerId];

//       // Calculate numeric discount applied on this seller's platform commission
//       const originalCommission = sellerEarningsMap[sellerId].originalPlatformCommission;
//       const discountAmount = originalCommission - platformCommission;
//       // Commission (after discount) + shipping revenue
//       const actualPlatformEarnings = platformCommission + (order.shippingFee || 0);
//       // Add platform earnings record with coupon adjustment details
//       await PlatformEarningsModel.create({
//         orderId: order._id,
//         sellerId: seller._id,
//         commission: originalCommission,
//         discountAmount,
//         amount: actualPlatformEarnings,
//         shippingRevenue: order.shippingFee,
//         discountDetails: discountAmount > 0 ? {
//           couponCode: order.coupon?.code,
//           totalCouponDiscount,
//           platformShare: discountAmount,
//         } : undefined,
//       });

//       // Update seller wallet
//       if (!seller.wallet) {
//         seller.wallet = {
//           balance: 0,
//           pendingBalance: 0,
//           availableBalance: 0,
//           pendingTransactions: [],
//           lastTransaction: null,
//         };
//       }

//       const releaseDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

//       seller.wallet.pendingBalance = (seller.wallet.pendingBalance || 0) + earnings;
//       seller.wallet.pendingTransactions = seller.wallet.pendingTransactions || [];
//       seller.wallet.pendingTransactions.push({
//         orderId: order._id,
//         amount: earnings,
//         releaseDate,
//         status: 'pending'
//       });

//       seller.wallet.lastTransaction = {
//         amount: earnings,
//         type: 'sale',
//         date: new Date(),
//         orderId: order._id,
//         couponDeduction: totalCouponDiscount > 0 ? {
//           amount: (earnings / totalSellerEarnings) * totalCouponDiscount || 0,
//           couponCode: order.coupon?.code
//         } : null
//       };

//       // Create financial transaction record
//       await FinancialTransaction.create({
//         seller: seller._id,
//         order: order._id,
//         amount: earnings,
//         type: 'credit',
//         balanceAfter: (seller.wallet.balance || 0) + (seller.wallet.pendingBalance || 0),
//         source: 'order_payout',
//         status: 'pending',
//         note: totalCouponDiscount > 0
//           ? `Pending earnings (coupon "${order.coupon?.code}" applied: -${((earnings / totalSellerEarnings) * totalCouponDiscount || 0).toFixed(2)} EGP)`
//           : 'Pending earnings – will be released after 3 days'
//       });

//       await seller.save();

//       // Notification for seller
//       const sellerNotification = new Notification({
//         userId: seller._id,
//         role: 'seller',
//         type: 'PAYOUT_COMPLETED',
//         title: '💵 تم تحويل الأرباح',
//         message: totalCouponDiscount > 0
//           ? `تم تحويل مبلغ ${earnings.toFixed(2)} جنيه كأرباح من الطلب رقم #${order._id} (تم خصم ${((earnings / totalSellerEarnings) * totalCouponDiscount || 0).toFixed(2)} جنيه بسبب الكوبون "${order.coupon?.code}")`
//           : `تم تحويل مبلغ ${earnings.toFixed(2)} جنيه كأرباح من الطلب رقم #${order._id}`,
//         orderId: order._id,
//         link: `/seller/orders/${order._id}`
//       });

//       await sellerNotification.save();
//     }

//     // Mark order as processed
//     order.payoutProcessed = true;
//     order.payoutDate = new Date();
//     await order.save();
//   }

//   // Notification for buyer
//   const buyerNotification = new Notification({
//     userId: order.buyer,
//     role: 'user',
//     type: 'ORDER_COMPLETED',
//     title: '✅ تم تسليم الطلب',
//     message: `تم تسليم طلبك رقم #${order._id} بنجاح 🎉`,
//     orderId: order._id,
//     link: `/orders/${order._id}`
//   });
//   await buyerNotification.save();

//   // Notification for admins
//   const adminUsers = await User.find({ role: 'admin' });
//   const adminNotifications = [];

//   for (const admin of adminUsers) {
//     const adminNotification = new Notification({
//       userId: admin._id,
//       role: 'admin',
//       type: 'ORDER_COMPLETED',
//       title: '📦 طلب تم تسليمه',
//       message: `تم تسليم الطلب رقم #${order._id} للمستخدم ${order.buyer}` +
//         (order.coupon ? ` (كوبون: ${order.coupon.code}، خصم: ${order.coupon.discountAmount} EGP)` : ''),
//       orderId: order._id,
//       link: `/admin/orders/${order._id}`
//     });
//     adminNotifications.push(adminNotification);
//   }

//   if (adminNotifications.length > 0) {
//     await Notification.insertMany(adminNotifications);
//   }

//   res.json({
//     message: 'Order completed successfully',
//     payoutProcessed: order.payoutProcessed,
//     couponApplied: !!order.coupon,
//     couponDiscount: order.coupon?.discountAmount || 0
//   });
// });
// complete order and update seller balance 
// platform only 
export const orderComplete = asyncHandler(async (req, res) => {
  const { id, code } = req.body;

  // Find order by ID + secret code
  const order = await Order.findOne({ _id: id, secretCode: code }).populate("items.seller");
  if (!order) {
    return res.status(404).json({ message: 'Order not found or code invalid' });
  }

  // Update order status
  order.deliveryStatus = 'delivered';
  order.paymentStatus = 'paid';
  order.deliveredAt = Date.now();
  await order.save();

  // Log order completion
  await logOrderActivity({
    orderId: order._id,
    actorId: req.user._id,
    actorRole: 'delivery',
    action: 'order_delivered',
    description: 'Order marked as delivered & paid',
    metadata: { secretCodeVerified: true }
  });

  // Process payouts only once
  if (!order.payoutProcessed) {
    const sellerEarningsMap = {};
    let totalCouponDiscount = order.coupon?.discountAmount || 0;
    let totalPlatformEarnings = 0;
    let totalSellerEarnings = 0;

    // 💰 Calculate seller earnings and platform fees
    order.items.forEach((item) => {
      const sellerId = item.seller._id.toString();
      const itemTotal = item.price * item.quantity;

      // Get dynamic platform fee based on product price
      const platformFeePercentage = getPlatformFeeByPrice(item.price);

      const sellerEarnings = itemTotal * (1 - platformFeePercentage);
      const platformCommission = itemTotal * platformFeePercentage;

      if (!sellerEarningsMap[sellerId]) {
        sellerEarningsMap[sellerId] = {
          seller: item.seller,
          earnings: 0,
          platformCommission: 0,          // after coupon deductions (if any)
          originalPlatformCommission: 0,  // before coupon deductions
          itemTotal: 0
        };
      }

      // 🔥 SELLERS GET FULL EARNINGS - NO DISCOUNT DEDUCTIONS
      sellerEarningsMap[sellerId].earnings += sellerEarnings;

      // Platform commission (before discount adjustments)
      sellerEarningsMap[sellerId].platformCommission += platformCommission;
      sellerEarningsMap[sellerId].originalPlatformCommission += platformCommission;
      sellerEarningsMap[sellerId].itemTotal += itemTotal;

      totalPlatformEarnings += platformCommission;
      totalSellerEarnings += sellerEarnings;
    });

    // Add shipping fee to platform earnings
    totalPlatformEarnings += order.shippingFee || 0;

    // 🔥 ALL DISCOUNTS ARE DEDUCTED FROM PLATFORM EARNINGS ONLY
    // Distribute the ENTIRE coupon discount across platform commissions
    let remainingDiscount = totalCouponDiscount;

    // First pass: distribute discount proportionally to platform commission share
    if (remainingDiscount > 0) {
      const totalPlatformCommissionBeforeShipping = totalPlatformEarnings - (order.shippingFee || 0);

      // Check if platform commission is enough to cover the discount
      if (totalPlatformCommissionBeforeShipping >= remainingDiscount) {
        // Deduct discount proportionally from each seller's platform commission
        for (const sellerId in sellerEarningsMap) {
          const seller = sellerEarningsMap[sellerId];
          const platformShare = seller.platformCommission / totalPlatformCommissionBeforeShipping;
          const platformDiscount = remainingDiscount * platformShare;

          // Deduct from platform commission only
          seller.platformCommission = Math.max(0, seller.platformCommission - platformDiscount);
        }
      } else {
        // If platform commission is less than discount, use all commission and shipping
        // This is an edge case - platform will have negative earnings for this order
        const totalAvailable = totalPlatformEarnings;
        if (totalAvailable >= remainingDiscount) {
          // Use platform commission first
          for (const sellerId in sellerEarningsMap) {
            const seller = sellerEarningsMap[sellerId];
            const platformShare = seller.platformCommission / totalPlatformCommissionBeforeShipping;
            const platformDiscount = Math.min(seller.platformCommission, remainingDiscount * platformShare);

            seller.platformCommission = Math.max(0, seller.platformCommission - platformDiscount);
            remainingDiscount -= platformDiscount;
          }

          // If still discount remaining, deduct from shipping fee
          // In this case, we'll reduce the shippingRevenue recorded
        }
      }
    }

    // Update sellers and create platform earnings records
    for (const sellerId in sellerEarningsMap) {
      const { seller, earnings, platformCommission, originalPlatformCommission } = sellerEarningsMap[sellerId];

      // Calculate the discount applied to this seller's platform commission
      const discountAmount = originalPlatformCommission - platformCommission;

      // Platform earnings for this seller (after discount)
      const platformEarningsAfterDiscount = platformCommission;

      // Shipping revenue is full shipping fee (if any)
      const shippingRevenue = order.shippingFee ?
        (originalPlatformCommission / (totalPlatformEarnings - (order.shippingFee || 0))) * order.shippingFee :
        0;

      // Add platform earnings record
      await PlatformEarningsModel.create({
        orderId: order._id,
        sellerId: seller._id,
        commission: originalPlatformCommission, // Original commission before discount
        discountAmount: discountAmount, // Amount deducted from platform (not seller)
        amount: platformEarningsAfterDiscount + shippingRevenue, // Platform's actual earnings
        shippingRevenue: shippingRevenue,
        discountDetails: totalCouponDiscount > 0 ? {
          couponCode: order.coupon?.code,
          totalCouponDiscount,
          platformDiscountShare: discountAmount,
          note: "Entire discount borne by platform"
        } : undefined,
      });

      // 🔥 UPDATE SELLER WALLET WITH FULL EARNINGS (NO DISCOUNT DEDUCTIONS)
      if (!seller.wallet) {
        seller.wallet = {
          balance: 0,
          pendingBalance: 0,
          availableBalance: 0,
          pendingTransactions: [],
          lastTransaction: null,
        };
      }

      const releaseDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      seller.wallet.pendingBalance = (seller.wallet.pendingBalance || 0) + earnings;
      seller.wallet.pendingTransactions = seller.wallet.pendingTransactions || [];
      seller.wallet.pendingTransactions.push({
        orderId: order._id,
        amount: earnings,
        releaseDate,
        status: 'pending'
      });

      seller.wallet.lastTransaction = {
        amount: earnings,
        type: 'sale',
        date: new Date(),
        orderId: order._id,
        // No coupon deduction for sellers
        couponDeduction: null
      };

      // Create financial transaction record
      await FinancialTransaction.create({
        seller: seller._id,
        order: order._id,
        amount: earnings,
        type: 'credit',
        balanceAfter: (seller.wallet.balance || 0) + (seller.wallet.pendingBalance || 0),
        source: 'order_payout',
        status: 'pending',
        note: 'Full earnings - All discounts borne by platform'
      });

      await seller.save();

      // Notification for seller
      const sellerNotification = new Notification({
        userId: seller._id,
        role: 'seller',
        type: 'PAYOUT_COMPLETED',
        title: '💵 تم تحويل الأرباح',
        message: `تم تحويل مبلغ ${earnings.toFixed(2)} جنيه كأرباح كاملة من الطلب رقم #${order._id}`,
        orderId: order._id,
        link: `/seller/orders/${order._id}`
      });

      await sellerNotification.save();
    }

    // Mark order as processed
    order.payoutProcessed = true;
    order.payoutDate = new Date();
    await order.save();

    // Create a platform summary record for this order
    const platformSummary = await PlatformEarningsModel.aggregate([
      { $match: { orderId: order._id } },
      {
        $group: {
          _id: '$orderId',
          totalPlatformCommission: { $sum: '$commission' },
          totalDiscounts: { $sum: '$discounts' },
          totalShippingRevenue: { $sum: '$shippingRevenue' },
          netPlatformEarnings: { $sum: '$amount' },
          sellerCount: { $sum: 1 }
        }
      }
    ]);

    // Platform admin notification about discount impact
    const adminUsers = await User.find({ role: 'admin' });
    const adminNotifications = [];

    for (const admin of adminUsers) {
      const adminNotification = new Notification({
        userId: admin._id,
        role: 'admin',
        type: 'ORDER_COMPLETED',
        title: '💰 ملخص أرباح الطلب',
        message: `تم تسليم الطلب #${order._id} - إجمالي خصم الكوبون: ${totalCouponDiscount.toFixed(2)} جنيه (مخصوم من أرباح المنصة)`,
        orderId: order._id,
        link: `/admin/orders/${order._id}`,
        metadata: {
          totalCouponDiscount,
          platformImpact: totalCouponDiscount > 0 ? "Discount fully borne by platform" : "No discount applied"
        }
      });
      adminNotifications.push(adminNotification);
    }

    if (adminNotifications.length > 0) {
      await Notification.insertMany(adminNotifications);
    }
  }

  // Notification for buyer
  const buyerNotification = new Notification({
    userId: order.buyer,
    role: 'user',
    type: 'ORDER_COMPLETED',
    title: '✅ تم تسليم الطلب',
    message: `تم تسليم طلبك رقم #${order._id} بنجاح 🎉 ${order.coupon ? `(تم تطبيق خصم بقيمة ${order.coupon.discountAmount} جنيه)` : ''}`,
    orderId: order._id,
    link: `/orders/${order._id}`
  });
  await buyerNotification.save();

  res.json({
    message: 'Order completed successfully',
    payoutProcessed: order.payoutProcessed,
    couponApplied: !!order.coupon,
    couponDiscount: order.coupon?.discountAmount || 0,
    platformDiscountImpact: order.coupon ? 'Discount fully deducted from platform earnings' : 'No discount applied'
  });
});
export const updateDeliveryStatus = asyncHandler(async (req, res) => {
  // //console.log('im in the updateDeliveryStatus');
  // Find the order by id
  const { id, deliveryStatus } = req.body;
  const order = await Order.findById(id)

  if (!order) {
    return res.status(404).json({ message: 'Order not found   ' });
  }

  order.deliveryStatus = deliveryStatus;
  await order.save();
  // //create notification for buyer
  const buyerNotification = new Notification({
    userId: req.user._id,
    role: 'user',
    type: 'ORDER_PLACED',
    title: 'تم تحديث حالة طلبك بنجاح ✅',
    message: `📦 تم ${deliveryStatus} الطلب`,
    orderId: order._id,
    link: `/orders/${order._id}`
  });
  await buyerNotification.save();

  res.json({
    message: 'success',
  });
});

// Simple one-time cancellation/activation
export const toggleOrderStatus = asyncHandler(async (req, res, next) => {
  const { id, action } = req.body;

  const order = await Order.findById(id);
  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  if (action === 'cancel') {
    // CANCEL LOGIC
    if (order.OrderStatus === 'canceled') {
      return res.status(400).json({
        success: false,
        message: 'Already canceled'
      });
    }

    // Check if already canceled before
    if (order.cancelCount >= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel more than once'
      });
    }

    // 2-day limit
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    if (Date.now() - order.createdAt.getTime() > twoDaysInMs) {
      return res.status(400).json({
        success: false,
        message: '2-day cancellation period expired'
      });
    }

    order.OrderStatus = "canceled";
    order.cancelDate = new Date();
    order.cancelCount = (order.cancelCount || 0) + 1;

  } else if (action === 'activate') {
    // ACTIVATE LOGIC
    if (order.OrderStatus !== 'canceled') {
      return res.status(400).json({
        success: false,
        message: 'Order is not canceled'
      });
    }

    // Check if already activated after cancellation
    if (order.activateCount >= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot activate more than once'
      });
    }

    // 1-day limit after cancellation
    const oneDayInMs = 24 * 60 * 60 * 1000;
    if (Date.now() - order.cancelDate.getTime() > oneDayInMs) {
      return res.status(400).json({
        success: false,
        message: '1-day activation period expired'
      });
    }

    order.OrderStatus = "active";
    order.activateCount = (order.activateCount || 0) + 1;
  }

  await order.save();

  res.status(200).json({
    success: true,
    message: `Order ${action}ed successfully`
  });
});

export const releasePendingEarnings = asyncHandler(async () => {
  // //console.log('Starting pending earnings release process...');

  const now = new Date();
  const releasedTransactions = [];

  // Find all sellers with pending transactions that are due
  const sellers = await User.find({
    role: 'seller',
    'wallet.pendingTransactions': {
      $elemMatch: {
        releaseDate: { $lte: now },
        status: 'pending'
      }
    }
  });

  // //console.log(`Found ${sellers.length} sellers with pending transactions due`);

  for (const seller of sellers) {
    if (!seller.wallet || !seller.wallet.pendingTransactions) continue;

    const pendingTransactions = seller.wallet.pendingTransactions.filter(
      t => t.status === 'pending' && new Date(t.releaseDate) <= now
    );

    if (pendingTransactions.length === 0) continue;

    let totalReleased = 0;

    for (const transaction of pendingTransactions) {
      // Move from pending to available balance
      seller.wallet.pendingBalance = (seller.wallet.pendingBalance || 0) - transaction.amount;
      seller.wallet.availableBalance = (seller.wallet.availableBalance || 0) + transaction.amount;
      seller.wallet.balance = (seller.wallet.balance || 0) + transaction.amount;

      // Update transaction status
      transaction.status = 'released';
      transaction.releasedAt = now;

      // Mark related financial transaction as completed
      await FinancialTransaction.findOneAndUpdate(
        { seller: seller._id, order: transaction.orderId, type: 'credit', status: 'pending' },
        {
          status: 'completed',
          balanceAfter: seller.wallet.balance,
          note: 'Earnings released',
          updatedAt: now
        }
      );

      totalReleased += transaction.amount;

      // Update platform earnings record
      await PlatformEarningsModel.findOneAndUpdate(
        { orderId: transaction.orderId, sellerId: seller._id },
        {
          status: 'released',
          releasedAt: now
        }
      );

      releasedTransactions.push({
        sellerId: seller._id,
        orderId: transaction.orderId,
        amount: transaction.amount
      });
    }

    // Update seller's last transaction
    seller.wallet.lastTransaction = {
      amount: totalReleased,
      type: 'deposit',
      date: now,
      note: 'Release of pending earnings'
    };

    await seller.save();

    // Create notification for seller about released earnings
    try {
      await Notification.create({
        userId: seller._id,
        type: 'PAYOUT_RELEASED',
        title: '💰 تم تحويل الأرباح',
        message: `تم تحويل ${totalReleased.toFixed(2)} جنيه من أرباحك المعلقة إلى رصيدك المتاح`,
        data: {
          amount: totalReleased,
          transactionsCount: pendingTransactions.length,
          releasedAt: now
        }
      });
    } catch (notificationError) {
      console.error('Failed to create release notification:', notificationError);
    }

    // //console.log(`Released ${totalReleased} EGP for seller ${seller._id}`);
  }

  // //console.log(`Released earnings for ${releasedTransactions.length} transactions`);
  return {
    success: true,
    releasedCount: releasedTransactions.length,
    transactions: releasedTransactions
  };
});