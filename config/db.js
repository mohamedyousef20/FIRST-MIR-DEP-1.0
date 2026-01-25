// config/db.js - النسخة النهائية مع التصحيح
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

class MongoDBConnectionManager {
  constructor() {
    this.connection = null;
    this.connectionState = {
      isConnected: false,
      isConnecting: false,
      lastConnectionAttempt: null,
      connectionAttempts: 0,
      lastError: null,
      lastSuccess: null,
      totalDisconnections: 0,
      totalReconnections: 0
    };

    this.reconnectInterval = null;
    this.healthCheckInterval = null;
    this.maxReconnectAttempts = process.env.NODE_ENV === 'production' ? 10 : 5;
    this.reconnectBaseDelay = 1000;

    this.setupEventListeners();
  }

  /**
   * Setup mongoose event listeners
   */
  setupEventListeners() {
    mongoose.connection.on('connected', () => {
      this.connectionState.isConnected = true;
      this.connectionState.lastSuccess = new Date();
      this.connectionState.connectionAttempts = 0;
      this.connectionState.lastError = null;
      console.log("MongoDB-----------------------------------------")
      logger.info('MongoDB connection established');
      this.startHealthChecks();
      this.clearReconnectInterval();
    });

    mongoose.connection.on('disconnected', () => {
      this.connectionState.isConnected = false;
      this.connectionState.totalDisconnections++;

      logger.warn('MongoDB connection lost');
      this.handleDisconnection();
    });

    mongoose.connection.on('reconnected', () => {
      this.connectionState.isConnected = true;
      this.connectionState.totalReconnections++;

      logger.info('MongoDB reconnected successfully');
      this.clearReconnectInterval();
    });

    mongoose.connection.on('error', (error) => {
      this.connectionState.lastError = {
        message: error?.message || 'Unknown error',
        code: error?.code || 'UNKNOWN',
        timestamp: new Date()
      };

      logger.error('MongoDB connection error:', error?.message || 'Unknown error');
    });
  }

  /**
   * Handle disconnection with exponential backoff
   */
  handleDisconnection() {
    if (this.connectionState.isConnecting || this.reconnectInterval) {
      return;
    }

    if (this.connectionState.connectionAttempts >= this.maxReconnectAttempts) {
      logger.error(`Max MongoDB reconnection attempts (${this.maxReconnectAttempts}) reached`);

      if (process.env.NODE_ENV === 'production') {
        logger.fatal('Critical: MongoDB connection permanently lost. Application may become unstable.');
        if (process.env.MONGODB_REQUIRED === 'true') {
          process.exit(1);
        }
      }
      return;
    }

    this.connectionState.isConnecting = true;
    this.connectionState.connectionAttempts++;
    this.connectionState.lastConnectionAttempt = new Date();

    const delay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.connectionState.connectionAttempts - 1),
      30000
    );

    logger.info(`Attempting MongoDB reconnection in ${delay}ms (attempt ${this.connectionState.connectionAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectInterval = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.connectionState.isConnecting = false;
        this.handleDisconnection();
      }
    }, delay);
  }

  /**
   * Clear reconnect interval
   */
  clearReconnectInterval() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    this.connectionState.isConnecting = false;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await mongoose.connection.db.admin().ping();
        this.connectionState.isConnected = true;
      } catch (error) {
        this.connectionState.isConnected = false;
        logger.warn('MongoDB health check failed:', error?.message || 'Unknown error');
      }
    }, 30000);
  }

  /**
   * Main connection method
   */
  async connect() {
    if (this.connectionState.isConnected) {
      logger.debug('MongoDB already connected');
      return mongoose.connection;
    }

    if (this.connectionState.isConnecting) {
      logger.debug('MongoDB connection already in progress');
      return new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (this.connectionState.isConnected) {
            resolve(mongoose.connection);
          } else if (!this.connectionState.isConnecting) {
            reject(new Error('Connection attempt failed'));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    try {
      this.connectionState.isConnecting = true;
      this.connectionState.lastConnectionAttempt = new Date();

      // Get MongoDB URI from environment
      const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mirvory';

      if (!mongoURI) {
        throw new Error('MONGODB_URI is not configured in environment variables');
      }

      // Log sanitized URI for debugging
      const sanitizedUri = mongoURI.replace(/\/\/(.*?):(.*?)@/, '//***:***@');
      logger.info(`Connecting to MongoDB: ${sanitizedUri}`);

      // Connection options
      const options = {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        maxPoolSize: process.env.NODE_ENV === 'production' ? 50 : 20,
        minPoolSize: 5,
        maxIdleTimeMS: 10000,
        retryWrites: true,
        writeConcern: {
          w: 'majority',
          wtimeout: 10000,
          j: process.env.NODE_ENV === 'production'
        }
      };

      // Establish connection
      await mongoose.connect(mongoURI, options);

      this.connectionState.isConnected = true;
      this.connectionState.isConnecting = false;
      this.connectionState.lastSuccess = new Date();
      this.connectionState.connectionAttempts = 0;

      logger.info('MongoDB connected successfully');

      return mongoose.connection;
    } catch (error) {
      this.connectionState.isConnecting = false;
      this.connectionState.lastError = {
        message: error?.message || 'Unknown connection error',
        code: error?.code || 'UNKNOWN',
        timestamp: new Date()
      };

      // Log full error for debugging
      console.error('MongoDB Connection Error Details:', {
        message: error?.message,
        name: error?.name,
        code: error?.code,
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      });

      logger.error('MongoDB connection failed:', error?.message || 'Unknown error');

      // In production, we might want to retry
      if (process.env.NODE_ENV === 'production') {
        this.handleDisconnection();
      }

      throw error;
    }
  }

  /**
   * Graceful disconnection
   */
  async disconnect() {
    try {
      this.clearReconnectInterval();

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        this.connectionState.isConnected = false;
        logger.info('MongoDB connection closed gracefully');
      }
    } catch (error) {
      logger.error('Error closing MongoDB connection:', error?.message || 'Unknown error');
      throw error;
    }
  }

  /**
   * Check connection health
   */
  async healthCheck() {
    const health = {
      status: 'unknown',
      message: '',
      details: {},
      timestamp: new Date().toISOString()
    };

    try {
      if (!this.connectionState.isConnected) {
        health.status = 'down';
        health.message = 'Not connected to MongoDB';
        return health;
      }

      // Ping the database
      await mongoose.connection.db.admin().ping();

      health.status = 'up';
      health.message = 'MongoDB connection healthy';
      health.details = {
        readyState: mongoose.connection.readyState,
        connectionAttempts: this.connectionState.connectionAttempts,
        totalReconnections: this.connectionState.totalReconnections,
        lastSuccess: this.connectionState.lastSuccess
      };
    } catch (error) {
      health.status = 'down';
      health.message = `MongoDB health check failed: ${error?.message || 'Unknown error'}`;
      health.details = { error: error?.message || 'Unknown error' };
    }

    return health;
  }
}

// Create singleton instance
const mongoDBManager = new MongoDBConnectionManager();

// Export connect function for backward compatibility
const connectDB = async () => {
  return mongoDBManager.connect();
};

// Export the manager for advanced usage
export { mongoDBManager, connectDB };

export default connectDB;

// upfix