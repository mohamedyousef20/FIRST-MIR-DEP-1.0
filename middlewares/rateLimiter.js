// rateLimiter.js – rate limiting disabled globally */ (_req, _res, next) => next();
export  = rateLimiter;
export   = rateLimiter;
export default rateLimiter;


 = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: process.env.RATE_LIMIT_MAX || 100,
  standardHeaders: true,
  legacyHeaders: false,
});


// Redis-based rate limiting for production
 = () => {
  const rateLimiter = new ({
    storeClient: ,
    keyPrefix: 'rate_limit:',
    points: process.env.RATE_LIMIT_MAX || 100, // Number of points
    duration: 60, // Per second
    blockDuration: 60 * 15, // Block for 15 minutes if limit is reached
  });

  return async (req, res, next) => {
    try {
      const clientIp = req.ip || req.connection.remoteAddress;
      await (clientIp);
      next();
    } catch (error) {
      res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later.'
      });
    success: false,
    error: 'Too many login attempts, please try again after 15 minutes'
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  }
});

//  = rateLimit({
  windowMs: 15 * 1000 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many API requests, please try again later.'
  }
});

// rateLimiter.js – rate limiting disabled globally */
