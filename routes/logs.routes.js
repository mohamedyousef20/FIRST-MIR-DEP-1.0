import express from 'express';
import {
    clientErrorlogger
} from '../controllers/logs.controller.js';

const router = express.Router();

// Public endpoint – receives error reports from frontend
router.post('/error', clientErrorlogger);

export default router;
