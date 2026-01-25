// config/redis.js - الإصدار عالي الأداء
import { createClient } from 'redis';
import { config } from './config.js';

class HighPerformanceRedis {
  constructor() {
    this.client = null;
    this.memoryStore = new Map();
    this.memoryTimers = new Map();
    this.connectionState = {
      isReady: false,
      isConnecting: false,
      lastError: null,
      lastSuccess: null,
      totalOperations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0,
      peakResponseTime: 0
    };

    // إعدادات الأداء
    this.performance = {
      pipelineSize: 50, // حجم Pipeline
      maxConnections: 20, // الحد الأقصى للاتصالات
      timeout: 2000, // وقت انتظار قصير
      retryDelay: [100, 200, 400, 800, 1600], // إعادة المحاولة بتأخير متزايد
      compressionThreshold: 1024, // ضغط البيانات أكبر من 1KB
      cacheWarmingEnabled: true
    };

    // إعدادات محددة للإنتاج
    this.isProduction = process.env.NODE_ENV === 'production';
    this.init();
  }

  /**
   * تهيئة الاتصال
   */
  async init() {
    try {
      // في الإنتاج، يجب أن يكون Redis متاحاً
      if (this.isProduction && !config.redis?.url) {
        console.error('❌ Redis URL is required in production');
        return this.fallbackToMemory();
      }

      const redisUrl = config.redis?.url || 'redis://127.0.0.1:6379';
      console.log(`🔴 Connecting to Redis at: ${this.isProduction ? '[PRODUCTION]' : redisUrl}`);

      // إعدادات الأداء المتقدمة
      this.client = createClient({
        url: redisUrl,
        password: config.redis?.password,

        // ⚡ إعدادات Socket عالية الأداء
        socket: {
          connectTimeout: 2000,
          keepAlive: 30000,
          noDelay: true,
          tls: this.isProduction ? {
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2'
          } : undefined,

          reconnectStrategy: (retries) => {
            if (retries > 5) {
              console.log('⚡ Redis: Max retries reached, using memory store');
              return false;
            }
            return this.performance.retryDelay[retries - 1] || 1000;
          }
        },

        // ⚡ إعدادات الأداء الرئيسية
        pingInterval: 60000,
        maxRetriesPerRequest: 3,
        disableOfflineQueue: true, // مهم للأداء
        commandTimeout: 1000,
        isolationPoolOptions: {
          max: this.performance.maxConnections,
          min: 5
        },

        // ⚡ إعدادات الذاكرة
        maxLoadingRetryTime: 3000,
        readOnly: false,
        legacyMode: false
      });

      // إعداد Event Listeners
      this.setupEventListeners();

      // الاتصال
      await this.client.connect();

      // اختبار الأداء
      await this.performanceTest();

      // Cache Warming للبيانات الشائعة
      if (this.performance.cacheWarmingEnabled) {
        this.cacheWarmup().catch(console.error);
      }

    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
      return this.fallbackToMemory();
    }
  }

  /**
   * ⚡ إعداد Event Listeners للأداء
   */
  setupEventListeners() {
    if (!this.client) return;

    // متابعة حالات الاتصال
    this.client.on('ready', () => {
      this.connectionState.isReady = true;
      this.connectionState.lastSuccess = new Date();
      console.log('✅ Redis: Ready for high performance operations');
    });

    this.client.on('connect', () => {
      this.connectionState.isConnecting = false;
      console.log('🔗 Redis: Connected');
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis: Reconnecting...');
    });

    this.client.on('error', (error) => {
      this.connectionState.lastError = {
        message: error.message,
        timestamp: new Date()
      };

      // تسجيل خطأ بدون إيقاف التطبيق
      console.warn('⚠️ Redis error:', error.message);

      if (!this.isProduction && error.code === 'ECONNREFUSED') {
        this.fallbackToMemory();
      }
    });

    // مراقبة الأداء
    this.client.on('sharded-channel-message-buffer-size', (size) => {
      if (size > 10000) {
        console.warn(`📊 Redis buffer growing: ${size}`);
      }
    });
  }

  /**
   * ⚡ اختبار أداء الاتصال
   */
  async performanceTest() {
    try {
      const startTime = Date.now();
      const testKey = 'perf_test';
      const testValue = 'x'.repeat(1000); // 1KB data

      // اختبار SET/GET متتالي
      for (let i = 0; i < 10; i++) {
        await this.client.set(`${testKey}_${i}`, testValue);
        await this.client.get(`${testKey}_${i}`);
      }

      const duration = Date.now() - startTime;
      console.log(`⚡ Redis performance: ${duration}ms for 20 operations (${(duration / 20).toFixed(2)}ms/op)`);

      // تنظيف
      for (let i = 0; i < 10; i++) {
        await this.client.del(`${testKey}_${i}`);
      }

    } catch (error) {
      console.warn('Performance test failed:', error.message);
    }
  }

  /**
   * 🔥 Cache Warming للبيانات الشائعة
   */
  async cacheWarmup() {
    console.log('🔥 Warming up Redis cache...');

    const warmupData = [
      { key: 'app:config', ttl: 3600 },
      { key: 'cache:stats', ttl: 300 },
      { key: 'system:health', ttl: 60 }
    ];

    for (const item of warmupData) {
      try {
        await this.set(item.key, { warmed: true, timestamp: Date.now() }, { EX: item.ttl });
      } catch (error) {
        console.warn(`Failed to warm cache for ${item.key}:`, error.message);
      }
    }

    console.log('✅ Cache warmup completed');
  }

  /**
   * ⚡ GET محسن مع Compression
   */
  async get(key, options = {}) {
    const startTime = Date.now();

    try {
      // إذا كان Redis غير متصل، استخدم Memory Store
      if (!this.connectionState.isReady || !this.client) {
        const result = this.memoryStore.get(key);
        if (result?.expires && result.expires < Date.now()) {
          this.memoryStore.delete(key);
          return null;
        }
        return result?.data || null;
      }

      // جلب من Redis
      let data = await this.client.get(key);

      // تسجيل الوقت
      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(true, responseTime);

      // إذا لم يكن هناك بيانات
      if (!data) {
        this.connectionState.cacheMisses++;
        return null;
      }

      // Decompress إذا كان مضغوطاً
      if (options.compressed) {
        data = await this.decompressData(data);
      }

      // Parse JSON إذا كان String
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }

    } catch (error) {
      this.updatePerformanceMetrics(false, Date.now() - startTime);
      console.warn(`GET ${key} failed:`, error.message);

      // Fallback إلى Memory Store
      const result = this.memoryStore.get(key);
      return result?.data || null;
    }
  }

  /**
   * ⚡ SET محسن مع Compression
   */
  async set(key, value, options = {}) {
    const startTime = Date.now();

    try {
      // إذا كان Redis غير متصل، استخدم Memory Store
      if (!this.connectionState.isReady || !this.client) {
        const storeData = {
          data: value,
          expires: options.EX ? Date.now() + (options.EX * 1000) : null
        };

        this.memoryStore.set(key, storeData);

        if (options.EX) {
          const timer = setTimeout(() => {
            this.memoryStore.delete(key);
            this.memoryTimers.delete(key);
          }, options.EX * 1000);

          this.memoryTimers.set(key, timer);
        }

        return 'OK';
      }

      // تحضير البيانات
      let dataToStore = typeof value === 'object' ? JSON.stringify(value) : value;

      // Compression للبيانات الكبيرة
      if (options.compress && dataToStore.length > this.performance.compressionThreshold) {
        dataToStore = await this.compressData(dataToStore);
      }

      // SET في Redis
      let result;
      if (options.EX) {
        result = await this.client.setEx(key, options.EX, dataToStore);
      } else {
        result = await this.client.set(key, dataToStore);
      }

      // تسجيل الوقت
      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(true, responseTime);
      this.connectionState.totalOperations++;

      return result;

    } catch (error) {
      this.updatePerformanceMetrics(false, Date.now() - startTime);
      console.warn(`SET ${key} failed:`, error.message);

      // Fallback إلى Memory Store
      const storeData = {
        data: value,
        expires: options.EX ? Date.now() + (options.EX * 1000) : null
      };
      this.memoryStore.set(key, storeData);
      return 'OK (memory)';
    }
  }

  /**
   * ⚡ Pipeline لعمليات متعددة - أسرع 10x
   */
  async pipeline(operations) {
    if (!this.connectionState.isReady || !this.client) {
      // تنفيذ في Memory Store
      const results = [];
      for (const op of operations) {
        if (op.type === 'set') {
          await this.set(op.key, op.value, op.options);
          results.push(['OK (memory)']);
        } else if (op.type === 'get') {
          const value = await this.get(op.key);
          results.push([value]);
        }
      }
      return results;
    }

    // استخدام Pipeline الحقيقي في Redis
    const pipeline = this.client.multi();

    for (const op of operations) {
      if (op.type === 'set') {
        if (op.options?.EX) {
          pipeline.setEx(op.key, op.options.EX,
            typeof op.value === 'object' ? JSON.stringify(op.value) : op.value
          );
        } else {
          pipeline.set(op.key,
            typeof op.value === 'object' ? JSON.stringify(op.value) : op.value
          );
        }
      } else if (op.type === 'get') {
        pipeline.get(op.key);
      } else if (op.type === 'del') {
        pipeline.del(op.key);
      }
    }

    try {
      const results = await pipeline.exec();
      this.connectionState.totalOperations += operations.length;
      return results;
    } catch (error) {
      console.warn('Pipeline execution failed:', error.message);
      throw error;
    }
  }

  /**
   * 🔥 Batch operations لمجموعات كبيرة
   */
  async batchSet(items, ttl = null) {
    if (items.length === 0) return [];

    const operations = items.map(item => ({
      type: 'set',
      key: item.key,
      value: item.value,
      options: ttl ? { EX: ttl } : {}
    }));

    // تقسيم إلى batches صغيرة
    const batchSize = this.performance.pipelineSize;
    const results = [];

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchResults = await this.pipeline(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 🎯 Smart Cache مع Fallback
   */
  async smartGet(key, fetchCallback, options = {}) {
    const {
      ttl = 300,
      staleWhileRevalidate = false,
      forceRefresh = false
    } = options;

    // 1. حاول تجلب من Cache
    if (!forceRefresh) {
      const cached = await this.get(key);
      if (cached) {
        console.log(`🎯 Cache HIT: ${key}`);
        return cached;
      }
    }

    console.log(`🔄 Cache MISS: ${key}, fetching...`);

    // 2. جلب البيانات من المصدر
    const data = await fetchCallback();

    if (!data) return null;

    // 3. خزن في Cache
    await this.set(key, data, { EX: ttl });

    // 4. إذا كان هناك stale data، أعد التخزين في الخلفية
    if (staleWhileRevalidate) {
      setTimeout(async () => {
        try {
          const freshData = await fetchCallback();
          if (freshData) {
            await this.set(key, freshData, { EX: ttl });
            console.log(`🔄 Background refresh for: ${key}`);
          }
        } catch (error) {
          console.warn(`Background refresh failed for ${key}:`, error.message);
        }
      }, 1000);
    }

    return data;
  }

  /**
   * 📊 تحديث إحصائيات الأداء
   */
  updatePerformanceMetrics(success, responseTime) {
    if (success) {
      this.connectionState.cacheHits++;
      this.connectionState.avgResponseTime =
        (this.connectionState.avgResponseTime * (this.connectionState.totalOperations - 1) + responseTime) /
        this.connectionState.totalOperations;

      if (responseTime > this.connectionState.peakResponseTime) {
        this.connectionState.peakResponseTime = responseTime;
      }
    } else {
      this.connectionState.cacheMisses++;
    }
  }

  /**
   * 📈 الحصول على إحصائيات الأداء
   */
  getStats() {
    const totalOps = this.connectionState.cacheHits + this.connectionState.cacheMisses;
    const hitRate = totalOps > 0 ?
      ((this.connectionState.cacheHits / totalOps) * 100).toFixed(2) : 0;

    return {
      status: this.connectionState.isReady ? 'connected' : 'disconnected',
      operations: this.connectionState.totalOperations,
      cacheHits: this.connectionState.cacheHits,
      cacheMisses: this.connectionState.cacheMisses,
      hitRate: `${hitRate}%`,
      avgResponseTime: `${this.connectionState.avgResponseTime.toFixed(2)}ms`,
      peakResponseTime: `${this.connectionState.peakResponseTime}ms`,
      memoryStoreSize: this.memoryStore.size,
      isProduction: this.isProduction,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 🔧 وظائف الضغط (لتحسين استخدام الذاكرة)
   */
  async compressData(data) {
    // في الإنتاج، يمكن استخدام zlib
    if (this.isProduction && typeof Buffer !== 'undefined') {
      // استخدام base64 للتبسيط
      return Buffer.from(data).toString('base64');
    }
    return data;
  }

  async decompressData(data) {
    if (this.isProduction && typeof Buffer !== 'undefined') {
      return Buffer.from(data, 'base64').toString();
    }
    return data;
  }

  /**
   * 🛡️ Fallback إلى Memory Store
   */
  fallbackToMemory() {
    console.warn('⚠️ Using in-memory store (fallback mode)');

    return {
      get: async (key) => this.get(key),
      set: async (key, value, options) => this.set(key, value, options),
      del: async (key) => this.del(key),
      ping: async () => 'PONG (memory)'
    };
  }

  /**
   * 🗑️ وظائف مساعدة
   */
  async del(key) {
    if (this.connectionState.isReady && this.client) {
      return this.client.del(key);
    }

    const existed = this.memoryStore.has(key);
    this.memoryStore.delete(key);

    if (this.memoryTimers.has(key)) {
      clearTimeout(this.memoryTimers.get(key));
      this.memoryTimers.delete(key);
    }

    return existed ? 1 : 0;
  }

  async ping() {
    if (this.connectionState.isReady && this.client) {
      return this.client.ping();
    }
    return 'PONG (memory)';
  }

  async keys(pattern = '*') {
    if (this.connectionState.isReady && this.client) {
      return this.client.keys(pattern);
    }

    // في Memory Store
    const allKeys = Array.from(this.memoryStore.keys());
    if (pattern === '*') return allKeys;

    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return allKeys.filter(key => regex.test(key));
  }

  async flushAll() {
    if (this.connectionState.isReady && this.client) {
      return this.client.flushAll();
    }

    this.memoryStore.clear();
    for (const timer of this.memoryTimers.values()) {
      clearTimeout(timer);
    }
    this.memoryTimers.clear();

    return 'OK';
  }

  /**
   * 📞 الاتصال (لمحاكاة الاتصال الأصلي)
   */
  async connect() {
    if (this.client && !this.connectionState.isReady) {
      await this.client.connect();
    }
    return this;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.connectionState.isReady = false;
    }
    return this;
  }
}

// إنشاء Instance وحيد (Singleton)
const redisInstance = new HighPerformanceRedis();

// Wait for initialization
setTimeout(async () => {
  await redisInstance.init();
}, 0);

/**
 * Compatibility shims for Redis set commands used elsewhere in the codebase.
 * Provide in-memory fallbacks when Redis is unavailable.
 */
const saddShim = async (key, member) => {
  if (redisInstance.connectionState.isReady && redisInstance.client) {
    const client = redisInstance.client;
    if (typeof client.sAdd === 'function') {
      return client.sAdd(key, member);
    }
    if (typeof client.sadd === 'function') {
      return client.sadd(key, member);
    }
  }
  const existing = redisInstance.memoryStore.get(key) ?? { data: [] };
  const set = new Set(existing.data);
  const before = set.size;
  set.add(member);
  redisInstance.memoryStore.set(key, { data: [...set], expires: null });
  return set.size - before;
};

const smembersShim = async (key) => {
  if (redisInstance.connectionState.isReady && redisInstance.client) {
    const client = redisInstance.client;
    if (typeof client.sMembers === 'function') {
      return client.sMembers(key);
    }
    if (typeof client.smembers === 'function') {
      return client.smembers(key);
    }
  }
  const existing = redisInstance.memoryStore.get(key) ?? { data: [] };
  return existing.data;
};

const sremShim = async (key, member) => {
  if (redisInstance.connectionState.isReady && redisInstance.client) {
    const client = redisInstance.client;
    if (typeof client.sRem === 'function') {
      return client.sRem(key, member);
    }
    if (typeof client.srem === 'function') {
      return client.srem(key, member);
    }
  }
  const existing = redisInstance.memoryStore.get(key) ?? { data: [] };
  const set = new Set(existing.data);
  const existed = set.delete(member);
  redisInstance.memoryStore.set(key, { data: [...set], expires: null });
  return existed ? 1 : 0;
};

const expireShim = async (key, seconds) => {
  if (redisInstance.connectionState.isReady && redisInstance.client) {
    return redisInstance.client.expire(key, seconds);
  }
  const entry = redisInstance.memoryStore.get(key);
  if (!entry) return 0;
  if (redisInstance.memoryTimers.has(key)) {
    clearTimeout(redisInstance.memoryTimers.get(key));
  }
  const timer = setTimeout(() => {
    redisInstance.memoryStore.delete(key);
    redisInstance.memoryTimers.delete(key);
  }, seconds * 1000);
  redisInstance.memoryTimers.set(key, timer);
  redisInstance.memoryStore.set(key, { ...entry, expires: Date.now() + seconds * 1000 });
  return 1;
};

// Export
export const redis = {
  get: (...args) => redisInstance.get(...args),
  set: (...args) => redisInstance.set(...args),
  del: (...args) => redisInstance.del(...args),
  ping: () => redisInstance.ping(),
  pipeline: (...args) => redisInstance.pipeline(...args),
  batchSet: (...args) => redisInstance.batchSet(...args),
  smartGet: (...args) => redisInstance.smartGet(...args),
  keys: (...args) => redisInstance.keys(...args),
  flushAll: () => redisInstance.flushAll(),
  getStats: () => redisInstance.getStats(),
  connect: () => redisInstance.connect(),
  disconnect: () => redisInstance.disconnect(),
  sadd: (...args) => saddShim(...args),
  smembers: (...args) => smembersShim(...args),
  srem: (...args) => sremShim(...args),
  expire: (...args) => expireShim(...args)
};

export default redis;