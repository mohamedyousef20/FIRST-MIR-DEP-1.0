import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const chatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    validate: [arrayLimit, 'Participants must be 2 users']
  }],
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  messages: [messageSchema],
  lastMessage: { type: Date },
  status: { 
    type: String, 
    enum: ['active', 'resolved', 'archived'], 
    default: 'active' 
  }
}, { timestamps: true });

function arrayLimit(val) {
  return val.length === 2;
}

chatSchema.index({ participants: 1, lastMessage: -1 });
chatSchema.index({ 'participants._id': 1, status: 1 });


export default mongoose.model('Chat', chatSchema);

