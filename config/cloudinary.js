import { v2 as cloudinary } from 'cloudinary';
import logger from '../utils/logger.js';

// Get Cloudinary credentials from environment variables
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

logger.info('Cloudinary configuration attempt:', {
    cloud_name: CLOUDINARY_CLOUD_NAME ? 'set' : 'NOT SET',
    api_key: CLOUDINARY_API_KEY ? 'set' : 'NOT SET',
    api_secret: CLOUDINARY_API_SECRET ? 'set' : 'NOT SET'
});

// Validate required environment variables
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    const missing = [];
    if (!CLOUDINARY_CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
    if (!CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
    if (!CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');

    const error = new Error(`Missing required Cloudinary environment variables: ${missing.join(', ')}`);
    logger.error('Cloudinary configuration error:', error.message);

    if (process.env.NODE_ENV === 'production') {
        throw error;
    } else {
        logger.warn('Cloudinary not configured. Image uploads will fail.');
    }
}

try {
    if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
        cloudinary.config({
            cloud_name: CLOUDINARY_CLOUD_NAME,
            api_key: CLOUDINARY_API_KEY,
            api_secret: CLOUDINARY_API_SECRET,
            secure: true
        });
        logger.info('Cloudinary configuration successful');
    }
} catch (error) {
    logger.error('Cloudinary configuration error:', error);
    if (process.env.NODE_ENV === 'production') {
        throw error;
    }
}

export default cloudinary;