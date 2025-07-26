import Redis from 'ioredis';
import logger from './logger';

let redis: Redis | null = null;
let isConnecting = false;
let connectionPromise: Promise<void> | null = null;

export async function getRedisClient(): Promise<Redis> {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4, // Use IPv4
      keepAlive: 30000,
      enableReadyCheck: true,
    });

    redis.on('connect', () => {
      logger.info('Connected to Redis');
    });

    redis.on('ready', () => {
      logger.info('Redis client ready');
    });

    redis.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redis.on('reconnecting', (delay: number) => {
      logger.info({ delay }, 'Redis reconnecting');
    });

    redis.on('end', () => {
      logger.warn('Redis connection ended');
    });
  }

  // Ensure connection is established
  if (!isConnecting && redis.status !== 'ready') {
    isConnecting = true;
    connectionPromise = redis.connect().then(() => {
      isConnecting = false;
      logger.info('Redis connection established');
    }).catch((error) => {
      isConnecting = false;
      logger.error({ error }, 'Failed to establish Redis connection');
      throw error;
    });
  }

  if (connectionPromise) {
    await connectionPromise;
  }

  return redis;
}

export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis connection closed');
  }
}

export async function isRedisHealthy(): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error({ error }, 'Redis health check failed');
    return false;
  }
}

export async function getRedisInfo(): Promise<{ connected: boolean; status: string }> {
  try {
    const redis = await getRedisClient();
    const isHealthy = await isRedisHealthy();
    return {
      connected: isHealthy,
      status: redis.status
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get Redis info');
    return { connected: false, status: 'error' };
  }
}