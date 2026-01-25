import AppError from '../utils/appError.js';
import { createError } from '../utils/error.js';

// Ensure user email is verified before allowing WRITE actions
const isVerified = (req, res, next) => {
    //console.log('im in is verified ')
    if (!req.user?.isVerified && req.user?.role !== 'admin') {
        return next(createError('Please verify your email to continue', 403));
    }
    return next();
};

export default isVerified;