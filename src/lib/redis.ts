import { Redis } from '@upstash/redis';
import logger from './logger';

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    // Parse the URL to extract token
    const url = new URL(redisUrl);
    const token = url.password;
    
    if (!token) {
      throw new Error('Redis token not found in REDIS_URL');
    }

    redis = new Redis({
      url: redisUrl,
      token: token,
      automaticDeserialization: false, // We'll handle serialization manually for better control
    });

    logger.info('Upstash Redis client initialized');
  }

  return redis;
}

// Upstash Redis doesn't need explicit connection management
export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    redis = null;
    logger.info('Redis client reference cleared');
  }
}