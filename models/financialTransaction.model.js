import mongoose from 'mongoose';

const financialTransactionSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true
    },
    balanceAfter: {
      type: Number,
      required: true
    },
    source: {
      type: String,
      enum: [
        'order_payout',
        'manual_adjustment',
        'withdrawal',
        'refund',
        'fee',
        'stock_purchase'
      ],
      default: 'order_payout'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed'
    },
    note: {
      type: String
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

financialTransactionSchema.index({ seller: 1, createdAt: -1 });
financialTransactionSchema.index({ order: 1 });

export default mongoose.model('FinancialTransaction', financialTransactionSchema);
