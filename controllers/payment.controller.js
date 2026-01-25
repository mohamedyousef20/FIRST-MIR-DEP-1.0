import axios from 'axios';
import crypto from 'crypto';
import Order from '../models/order.model.js';

/* ================== ENV ================== */
const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const PAYMOB_FRAME_ID = process.env.PAYMOB_FRAME_ID;
const PAYMOB_HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;

const PAYMOB_CARD_INTEGRATION_ID = Number(process.env.PAYMOB_CARD_INTEGRATION_ID);
const PAYMOB_WALLET_INTEGRATION_ID = Number(process.env.PAYMOB_WALLET_INTEGRATION_ID);

/* ================== HELPERS ================== */
const formatPhoneNumber = (phone) => {
  if (!phone) throw new Error('Phone number is required');
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return '20' + cleaned.slice(1);
  if (cleaned.startsWith('20')) return cleaned;
  return '20' + cleaned;
};

const getIntegrationId = (method) => {
  if (method === 'card') return PAYMOB_CARD_INTEGRATION_ID;
  if (method === 'wallet') return PAYMOB_WALLET_INTEGRATION_ID;
  throw new Error('Unsupported payment method');
};

/* ================== CREATE PAYMENT ================== */
export const createPaymobPayment = async (req, res) => {
  try {
    const { orderId, paymentMethod } = req.body;

    if (!['card', 'wallet'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    const order = await Order.findById(orderId)
      .populate('buyer', 'firstName lastName email phone');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    /* 1️⃣ Auth */
    const { data: auth } = await axios.post(
      'https://accept.paymob.com/api/auth/tokens',
      { api_key: PAYMOB_API_KEY }
    );

    /* 2️⃣ Create Paymob Order */
    const { data: paymobOrder } = await axios.post(
      'https://accept.paymob.com/api/ecommerce/orders',
      {
        auth_token: auth.token,
        delivery_needed: false,
        amount_cents: Math.round(order.total * 100),
        currency: 'EGP',
        items: [],
      }
    );

    /* 3️⃣ Payment Key */
    const integrationId = getIntegrationId(paymentMethod);

    const { data: keyData } = await axios.post(
      'https://accept.paymob.com/api/acceptance/payment_keys',
      {
        auth_token: auth.token,
        amount_cents: Math.round(order.total * 100),
        expiration: 3600,
        order_id: paymobOrder.id,
        currency: 'EGP',
        integration_id: integrationId,
        billing_data: {
          first_name: order.buyer.firstName,
          last_name: order.buyer.lastName,
          email: order.buyer.email,
          phone_number: formatPhoneNumber(order.buyer.phone),
          street: 'NA',
          building: '1',
          floor: '1',
          apartment: '1',
          city: 'Cairo',
          country: 'EG',
          postal_code: '00000',
        },
      }
    );

    /* 4️⃣ Save Order */
    await Order.findByIdAndUpdate(orderId, {
      paymentMethod,
      paymentStatus: 'pending',
      paymentData: {
        paymobOrderId: paymobOrder.id,
        integrationId,
      },
    });

    /* 5️⃣ WALLET FLOW */
    if (paymentMethod === 'wallet') {
      const { data } = await axios.post(
        'https://accept.paymob.com/api/acceptance/payments/pay',
        {
          source: {
            identifier: formatPhoneNumber(order.buyer.phone),
            subtype: 'WALLET',
          },
          payment_token: keyData.token,
        }
      );

      return res.json({
        success: true,
        redirectUrl: data.redirect_url,
      });
    }

    /* 6️⃣ CARD FLOW */
    return res.json({
      success: true,
      iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_FRAME_ID}?payment_token=${keyData.token}`,
    });

  } catch (error) {
    console.error('Paymob Error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Payment failed' });
  }
};

/* ================== PAYMOB WEBHOOK ================== */

// ترتيب الحقول مهم جدًا
const hmacFields = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
];

const buildHmacString = (obj) =>
  hmacFields
    .map((field) => {
      const keys = field.split('.');
      let value = obj;
      for (const key of keys) value = value?.[key];
      return value !== undefined ? String(value) : '';
    })
    .join('');

export const paymobWebhook = async (req, res) => {
  try {
    const receivedHmac = req.query.hmac;
    const data = req.body?.obj;

    if (!receivedHmac || !data) {
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    const calculatedHmac = crypto
      .createHmac('sha512', PAYMOB_HMAC_SECRET)
      .update(buildHmacString(data))
      .digest('hex');

    if (calculatedHmac !== receivedHmac) {
      return res.status(401).json({ message: 'Invalid HMAC' });
    }

    if (data.success === true && data.order?.id) {
      const order = await Order.findOne({
        'paymentData.paymobOrderId': data.order.id,
      });

      if (order) {
        order.paymentStatus = 'completed';
        order.transactionId = data.id;
        await order.save();
      }
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};
