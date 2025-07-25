import Redis from 'ioredis';
import logger from './logger';

let redis: Redis | null = null;

export function getRedisClient(): Redis {
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
    if (!redis) {
      return false;
    }
    
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error({ error }, 'Redis health check failed');
    return false;
  }
}

export async function getRedisInfo(): Promise<{ connected: boolean; status: string }> {
  try {
    if (!redis) {
      return { connected: false, status: 'not_initialized' };
    }
    
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