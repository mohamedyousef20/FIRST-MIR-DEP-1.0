import express from 'express';
import {
  startChat,
  sendMessage,
  getChats,
  getChat
} from '../controllers/chat.controller.js';
import { protect } from '../middlewaress/auth.middleware.js';

// Import validations
import {
  startChatValidation,
  sendMessageValidation,
  getChatsValidation
} from '../validations/chat.validations.js';

const router = express.Router();

// Protect all routes with authentication
router.use(protect);

// Start a new chat
router.post('/', startChatValidation, startChat);

// Send a message
router.post('/:id/messages', sendMessageValidation, sendMessage);

// Get all chats for current user
router.get('/', getChatsValidation, getChats);

// Get specific chat
router.get('/:id', getChat);

export default router;
