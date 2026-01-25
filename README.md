# E-commerce Backend API

A robust and secure e-commerce backend API built with Node.js, Express, and MongoDB.

## Features

- **User Authentication** - JWT-based authentication with refresh tokens
- **Product Management** - CRUD operations for products
- **Shopping Cart** - Manage user shopping carts
- **Order Processing** - Create and manage orders
- **Real-time Chat** - Socket.io for real-time communication
- **File Uploads** - Cloudinary integration for media storage
- **Caching** - Redis for caching and rate limiting
- **Security** - Helmet, rate limiting, CORS, and more
- **Validation** - Request validation with Joi
- **Logging** - Winston for structured logging

## Prerequisites

- Node.js 16+
- MongoDB 5.0+
- Redis 6.0+
- npm or yarn

## Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/ecommerce-backend.git
   cd ecommerce-backend
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add the following variables:
   ```env
   NODE_ENV=development
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/mirvory
   JWT_ACCESS_SECRET=your_JWT_ACCESS_SECRET
   JWT_EXPIRES_IN=90d
   JWT_COOKIE_EXPIRES_IN=90
   EMAIL_HOST=smtp.example.com
   EMAIL_PORT=587
   EMAIL_USERNAME=your_email@example.com
   EMAIL_PASSWORD=your_email_password
   EMAIL_FROM=noreply@example.com
   CLIENT_URL=http://localhost:3000
   REDIS_URL=redis://localhost:6379
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   ```

4. Start the development server
   ```bash
   npm run dev
   ```

## API Documentation

### Authentication

- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login user
- `GET /api/users/me` - Get current user
- `POST /api/users/logout` - Logout user
- `POST /api/users/refresh-token` - Refresh access token
- `POST /api/users/forgot-password` - Request password reset
- `PATCH /api/users/reset-password/:token` - Reset password

### Products

- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create a new product (admin)
- `PATCH /api/products/:id` - Update product (admin)
- `DELETE /api/products/:id` - Delete product (admin)

### Categories

- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category (admin)
- `GET /api/categories/:id` - Get category by ID
- `PATCH /api/categories/:id` - Update category (admin)
- `DELETE /api/categories/:id` - Delete category (admin)

### Cart

- `GET /api/cart` - Get user's cart
- `POST /api/cart` - Add item to cart
- `PATCH /api/cart/:id` - Update cart item quantity
- `DELETE /api/cart/:id` - Remove item from cart

### Orders

- `GET /api/orders` - Get user's orders
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order by ID
- `PATCH /api/orders/:id/cancel` - Cancel order

### Chat

- `GET /api/chats` - Get user's chats
- `POST /api/chats` - Start new chat
- `GET /api/chats/:id` - Get chat by ID
- `POST /api/chats/:id/messages` - Send message in chat
- `GET /api/chats/:id/messages` - Get chat messages

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| NODE_ENV | Environment | development |
| PORT | Port to run the server | 5000 |
| MONGODB_URI | MongoDB connection string | - |
| JWT_ACCESS_SECRET | JWT secret key | - |
| JWT_EXPIRES_IN | JWT expiration time | 90d |
| JWT_COOKIE_EXPIRES_IN | JWT cookie expiration in days | 90 |
| EMAIL_* | Email configuration | - |
| CLIENT_URL | Frontend URL | http://localhost:3000 |
| REDIS_URL | Redis connection URL | - |
| CLOUDINARY_* | Cloudinary configuration | - |

## Development

### Running Locally

1. Start MongoDB and Redis
2. Install dependencies
   ```bash
   npm install
   ```
3. Start the development server
   ```bash
   npm run dev
   ```

### Running Tests

```bash
npm test
```

### Linting

```bash
# Check for linting errors
npm run lint

# Fix linting errors
npm run lint:fix
```

## Production

### Building for Production

```bash
npm run build
```

### Starting Production Server

```bash
NODE_ENV=production node dist/server.js
```

## Deployment

The application can be deployed to any cloud platform that supports Node.js applications, such as:

- AWS Elastic Beanstalk
- Google App Engine
- Heroku
- DigitalOcean
- Vercel
- Railway

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Express](https://expressjs.com/)
- [MongoDB](https://www.mongodb.com/)
- [Mongoose](https://mongoosejs.com/)
- [JWT](https://jwt.io/)
- [Socket.io](https://socket.io/)
- [Winston](https://github.com/winstonjs/winston)
- [Joi](https://joi.dev/)
- [Helmet](https://helmetjs.github.io/)
- [Cloudinary](https://cloudinary.com/)
- [Redis](https://redis.io/)
- [Nodemailer](https://nodemailer.com/)
- [Bcrypt](https://github.com/kelektiv/node.bcrypt.js)
- [Multer](https://github.com/expressjs/multer)
