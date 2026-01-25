import streamifier from 'streamifier';
import cloudinary from '../config/cloudinary.js';

// 🔒 قيود الأمان للصور
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadImage = async (file) => {
    try {
        console.log('Starting image upload process...');
        console.log('File details:', {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            buffer: file.buffer ? 'exists' : 'missing'
        });

        if (!file.buffer) {
            throw new Error('File buffer is missing');
        }

        // ✅ التحقق من النوع والحجم قبل الرفع
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            throw new Error('تنسيق صورة غير مدعوم. المسموح: JPEG, PNG, GIF, WEBP');
        }
        if (file.size > MAX_FILE_SIZE) {
            throw new Error('حجم الصورة يتجاوز الحد الأقصى (5MB)');
        }

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'mirvory',
                    resource_type: 'auto',
                    transformation: [
                        { width: 800, height: 600, crop: 'limit' }
                    ]
                },
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        reject(new Error('Failed to upload image'));
                    } else {
                        console.log('Image upload successful:', {
                            url: result.secure_url,
                            publicId: result.public_id
                        });
                        resolve({
                            url: result.secure_url,
                            publicId: result.public_id
                        });
                    }
                }
            );

            streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
};

export const removeImage = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        console.log('Image removed successfully:', { publicId, result });
        return result;
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        throw new Error(`Failed to delete image: ${error.message}`);
    }
};

// دالة إضافية لرفع صور متعددة
export const uploadMultipleImages = async (files) => {
    try {
        const uploadPromises = files.map(file => uploadImage(file));
        const results = await Promise.all(uploadPromises);
        return results;
    } catch (error) {
        console.error('Upload multiple images error:', error);
        throw error;
    }
};

// دالة للتحقق من صحة الملف قبل الرفع
export const validateFile = (file) => {
    const errors = [];

    if (!file.buffer) {
        errors.push('File buffer is missing');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        errors.push('تنسيق صورة غير مدعوم. المسموح: JPEG, PNG, GIF, WEBP');
    }

    if (file.size > MAX_FILE_SIZE) {
        errors.push(`حجم الصورة يتجاوز الحد الأقصى (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

// دالة لتحويل الصورة مع خيارات متقدمة
export const uploadImageWithOptions = async (file, options = {}) => {
    try {
        const {
            folder = 'mirvory',
            transformation = [{ width: 800, height: 600, crop: 'limit' }],
            resourceType = 'auto',
            tags = []
        } = options;

        // التحقق من صحة الملف
        const validation = validateFile(file);
        if (!validation.isValid) {
            throw new Error(validation.errors.join(', '));
        }

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    resource_type: resourceType,
                    transformation,
                    tags
                },
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        reject(new Error('Failed to upload image'));
                    } else {
                        console.log('Image upload successful:', {
                            url: result.secure_url,
                            publicId: result.public_id,
                            format: result.format,
                            bytes: result.bytes
                        });
                        resolve({
                            url: result.secure_url,
                            publicId: result.public_id,
                            format: result.format,
                            bytes: result.bytes,
                            width: result.width,
                            height: result.height
                        });
                    }
                }
            );

            streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });
    } catch (error) {
        console.error('Upload with options error:', error);
        throw error;
    }
};