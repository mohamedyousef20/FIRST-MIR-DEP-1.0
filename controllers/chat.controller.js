// import Chat from '../models/chat.model.js';
// import { createError } from '../utils/error.js';

// export const startChat = async (req, res, next) => {
//   try {
//     const { participantId, orderId, productId, initialMessage } = req.body;

//     if (req.user._id.toString() === participantId) {
//       return next(createError('Cannot start chat with yourself', 403));
//     }

//     let chat = await Chat.findOne({
//       participants: { $all: [req.user._id, participantId] },
//       ...(orderId && { order: orderId }),
//       ...(productId && { product: productId })
//     });

//     if (!chat) {
//       chat = new Chat({
//         participants: [req.user._id, participantId],
//         ...(orderId && { order: orderId }),
//         ...(productId && { product: productId }),
//         messages: []
//       });
//     }

//     if (initialMessage) {
//       chat.messages.push({
//         sender: req.user._id,
//         content: initialMessage,
//         timestamp: new Date()
//       });
//       chat.lastMessage = new Date();
//     }

//     await chat.save().catch(err => {
//       console.error('Error saving chat:', err);
//       throw createError('Failed to save chat', 500);
//     });
//     res.status(200).json(chat);
//   } catch (error) {
//     next(error);
//   }
// };

// export const sendMessage = async (req, res, next) => {
//   try {
//     const { chatId, content } = req.body;

//     const chat = await Chat.findById(chatId);
//     if (!chat) {
//       return next(createError('Chat not found', 404));
//     }

//     if (!chat.participants.some(p => p.toString() === req.user._id.toString())) {
//       return next(createError('Not authorized to send message in this chat', 403));
//     }

//     const message = {
//       sender: req.user._id,
//       content,
//       timestamp: new Date()
//     };

//     chat.messages.push(message);
//     chat.lastMessage = new Date();
//     await chat.save().catch(err => {
//       console.error('Error saving chat:', err);
//       throw createError('Failed to save chat', 500);
//     });

//     req.io.to(chatId).emit('newMessage', { chatId, message });

//     res.status(201).json(message);
//   } catch (error) {
//     next(error);
//   }
// };

// export const getChats = async (req, res, next) => {
//   try {
//     const chats = await Chat.find({
//       participants: req.user._id
//     })
//       .populate('participants', 'name email avatar')
//       .populate('product', 'name images')
//       .sort({ lastMessage: -1 })
//       .catch(err => {
//         console.error('Error fetching chats:', err);
//         throw createError('Failed to fetch chats', 500);
//       });

//     res.json(chats);
//   } catch (error) {
//     next(error);
//   }
// };

// export const getChat = async (req, res, next) => {
//   try {
//     const chat = await Chat.findOne({
//       _id: req.params.id,
//       participants: req.user._id
//     })
//       .populate('participants', 'name email avatar')
//       .populate('product', 'name images')
//       .catch(err => {
//         console.error('Error fetching chat:', err);
//         throw createError('Failed to fetch chat', 500);
//       });

//     if (!chat) {
//       return next(createError('Chat not found', 404));
//     }

//     res.json(chat);
//   } catch (error) {
//     next(error);
//   }
// };
