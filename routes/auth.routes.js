import express from 'express';
import {
    changePassword,
    forgetPassword,
    getCurrentUser,
    googleAuth, login, socialSetCookies,
    logout,
    refreshToken,
    register,
    resendVerification,
    resetPassword,
    verifyEmail,
    updateProfile,
    verifyResetCode
} from '../controllers/auth.controller.js';

import { isAdmin, protect } from '../middlewares/auth.middleware.js';
import {
    registerValidation,
    loginValidation,
    updateProfileValidation,
    emailValidation,
    verifyEmailValidation,
    resetCodeValidation,
    resetPasswordValidation,
    changePasswordValidation,
    googleAuthValidation,
    vendorProfileValidation
} from '../validations/auth.validation.js';

import { validate as joiValidate } from '../validations/validation.middleware.js';

const router = express.Router();

// Helper to wrap Joi schema directly as middleware

// Public routes
router.post('/social-set-cookies', socialSetCookies);
router.post('/verify-reset-code', joiValidate(resetCodeValidation), verifyResetCode);
router.post('/reset-password', joiValidate(resetPasswordValidation), resetPassword);
router.post('/forgot-password', joiValidate(emailValidation), forgetPassword);
router.post('/register', joiValidate(registerValidation), register);
router.post('/login', joiValidate(loginValidation), login);
router.post('/verify-email', joiValidate(verifyEmailValidation), verifyEmail);
router.post('/resend-email', joiValidate(emailValidation), resendVerification);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.post('/google', joiValidate(googleAuthValidation), googleAuth);

// Protected routes (require authentication
router.use(protect);

router.get('/me', getCurrentUser);
router.patch('/change-password', joiValidate(changePasswordValidation), changePassword);
router.put('/profile', joiValidate(updateProfileValidation), updateProfile);
// router.put('/vendor-profile', validate(vendorProfileValidation), updateVendorProfile);
// TODO
// Admin routes
// router.get('/:id', isAdmin, getUserById); TODO

export default router;
