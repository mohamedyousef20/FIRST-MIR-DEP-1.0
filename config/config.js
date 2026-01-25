// config/config.js
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

/* -------------------- ENV SCHEMA -------------------- */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/, 'PORT must be numeric').default('5000'),
  MONGODB_URI: z.string()
    .min(1, 'MONGODB_URI is required')
    .default('mongodb://localhost:27017/mirvory')
    .refine((uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'), {
      message: 'MONGODB_URI must start with mongodb:// or mongodb+srv://'
    }),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET too short').default('dev_default_access_secret_32chars_________'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET too short').default('dev_default_refresh_secret_32chars_______'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  REDIS_URL: z.string().optional(),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().optional(),

  // Email configuration
  EMAIL_ENABLED: z.string().optional().default('false'),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().regex(/^\d+$/, 'EMAIL_PORT must be numeric').optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

/* -------------------- VALIDATION -------------------- */
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // استخدم console بدل logger هنا لمنع circular dependency
  console.error('❌ Environment validation failed:');
  
  const errors = parsed.error.format();
  Object.keys(errors).forEach(key => {
    if (key !== '_errors') {
      console.error(`  ${key}: ${errors[key]?._errors?.join(', ') || 'Invalid'}`);
    }
  });
  
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️ Using fallback defaults for development');
  }
}

const env = parsed.success ? parsed.data : {};

/* -------------------- FINAL CONFIG -------------------- */
export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 5000),
  isDevelopment: (env.NODE_ENV || 'development') === 'development',
  isProduction: (env.NODE_ENV || 'development') === 'production',
  isTest: (env.NODE_ENV || 'development') === 'test',

  mongo: {
    uri: env.MONGODB_URI || 'mongodb://localhost:27017/mirvory',
  },

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET || 'dev_default_access_secret_32chars_________',
    refreshSecret: env.JWT_REFRESH_SECRET || 'dev_default_refresh_secret_32chars_______',
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  redis: {
    url: env.REDIS_URL,
    enabled: Boolean(env.REDIS_URL),
  },

  email: {
    enabled: env.EMAIL_ENABLED === 'true',
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT ? Number(env.EMAIL_PORT) : undefined,
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASSWORD,
    from: env.EMAIL_FROM,
  },

  clientUrl: env.CLIENT_URL || 'http://localhost:3000',

  maxRequestSize: '10mb',

  allowedOrigins: env.ALLOWED_ORIGINS 
    ? env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:3000'],
};

export default config;