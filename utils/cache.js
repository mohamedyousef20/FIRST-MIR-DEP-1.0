import { redis } from '../config/redis-client.js';

const useRedis = !!process.env.REDIS_URL; // true when a real Redis URL is provided
let redisReady = false;

async function ensureRedis() {
    if (!useRedis || redisReady) return;
    try {
        if (typeof redis.connect === 'function') {
            await redis.connect();
        }
        redisReady = true;
    } catch (err) {
        console.error('Redis connection failed – falling back to in-memory cache', err);
    }
}

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.maxSize = 1000;
        this.ttl = 5 * 60 * 1000; // 5 دقائق
    }

    async set(key, value) {
        if (useRedis) {
            await ensureRedis();
            try {
                await redis.set(key, JSON.stringify(value), { EX: Math.floor(this.ttl / 1000) });
                return;
            } catch (err) {
                console.error('Redis SET failed', err);
            }
        }
        // fallback in-memory
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, { data: value, timestamp: Date.now() });
    }

    async get(key) {
        if (useRedis) {
            await ensureRedis();
            try {
                const val = await redis.get(key);
                if (val !== null) return JSON.parse(val);
            } catch (err) {
                console.error('Redis GET failed', err);
            }
        }
        const cached = this.cache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }

    delete(key) {
        if (useRedis) {
            redis.del(key);
        }
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }
}

export const searchCache = new CacheManager();
export const productCache = new CacheManager();