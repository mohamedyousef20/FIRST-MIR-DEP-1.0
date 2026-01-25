// backend/utils/error.js
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Create a function that creates and returns an error
export const createError = (arg1, arg2) => {
  let message, statusCode;
  if (typeof arg1 === "number" && (typeof arg2 === "string" || arg2 instanceof String)) {
    statusCode = arg1;
    message = arg2;
  } else {
    message = arg1;
    statusCode = arg2;
  }
  return new AppError(message, statusCode);
};

// Export error creators
export const NotFoundError = (message = 'Resource not found') => createError(message, 404);
export const BadRequestError = (message = 'Bad request') => createError(message, 400);
export const UnauthorizedError = (message = 'Not authorized') => createError(message, 401);
export const ForbiddenError = (message = 'Forbidden') => createError(message, 403);