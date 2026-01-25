class ApiResponse {
  constructor(statusCode, data, message = 'Success') {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}

const sendResponse = (res, statusCode, data, message) => {
  const response = new ApiResponse(statusCode, data, message);
  return res.status(statusCode).json(response);
};

const success = (res, data, message = 'Operation successful') => {
  return sendResponse(res, 200, data, message);
};

const created = (res, data, message = 'Resource created successfully') => {
  return sendResponse(res, 201, data, message);
};

const noContent = (res) => {
  return res.status(204).send();
};

const badRequest = (res, message = 'Bad Request') => {
  return sendResponse(res, 400, null, message);
};

const unauthorized = (res, message = 'Unauthorized') => {
  return sendResponse(res, 401, null, message);
};

const forbidden = (res, message = 'Forbidden') => {
  return sendResponse(res, 403, null, message);
};

const notFound = (res, message = 'Resource not found') => {
  return sendResponse(res, 404, null, message);
};

const conflict = (res, message = 'Resource already exists') => {
  return sendResponse(res, 409, null, message);
};

const unprocessableEntity = (res, message = 'Unprocessable Entity') => {
  return sendResponse(res, 422, null, message);
};

const tooManyRequests = (res, message = 'Too Many Requests') => {
  return sendResponse(res, 429, null, message);
};

const error = (res, statusCode, message = 'An error occurred') => {
  return sendResponse(res, statusCode, null, message);
};

module.exports = {
  success,
  created,
  noContent,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessableEntity,
  tooManyRequests,
  error,
};
