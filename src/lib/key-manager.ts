import { prisma } from "./db";
import logger from "./logger";
import { getSettings } from "./settings";
import { getRedisClient } from "./redis";

interface KeyRequestCount {
  key: string;
  requestCount: number;
}

/**
 * Manages a pool of API keys, providing round-robin selection,
 * failure tracking, and automatic recovery.
 */
export class KeyManager {
  private keys: readonly string[];
  private failureCounts: Map<string, number>;
  private lastFailureTimes: Map<string, Date>;
  private readonly maxFailures: number;

  constructor(keys: string[], maxFailures: number = 3) {
    const initialKeys = keys || [];
    if (initialKeys.length === 0) {
      logger.warn(
        "KeyManager initialized with zero keys. Waiting for user to add keys via UI."
      );
    }
    this.keys = Object.freeze([...initialKeys]);
    this.failureCounts = new Map(this.keys.map((key) => [key, 0]));
    this.lastFailureTimes = new Map();
    this.maxFailures = maxFailures;
    logger.info(
      `KeyManager initialized with ${this.keys.length} keys from database.`
    );
  }

  public isKeyValid(key: string): boolean {
    const failures = this.failureCounts.get(key);
    return failures !== undefined && failures < this.maxFailures;
  }

  public async getKeyRequestCounts(): Promise<KeyRequestCount[]> {
    try {
      const redis = getRedisClient();
      const currentMinute = Math.floor(Date.now() / 60000);
      
      const requestCounts = await Promise.all(
        this.keys.map(async (key) => {
          const keySuffix = key.slice(-4);
          const redisKey = `req:${keySuffix}:${currentMinute}`;
          
          try {
            const count = await redis.get(redisKey);
            const countValue = count ? parseInt(count.toString(), 10) : 0;
            return { key, requestCount: countValue };
          } catch (error) {
            logger.error({ error, key: `...${keySuffix}` }, 'Failed to get key usage from Redis');
            return { key, requestCount: 0 };
          }
        })
      );
      
      return requestCounts;
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Redis, falling back to database');
      // Fallback to database
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      
      const requestCounts = await Promise.all(
        this.keys.map(async (key) => {
          const count = await prisma.requestLog.count({
            where: {
              apiKey: key.slice(-4),
              createdAt: {
                gte: oneMinuteAgo
              }
            }
          });
          return { key, requestCount: count };
        })
      );
      
      return requestCounts;
    }
  }

  public async incrementKeyUsage(key: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const currentMinute = Math.floor(Date.now() / 60000);
      const keySuffix = key.slice(-4);
      const redisKey = `req:${keySuffix}:${currentMinute}`;
      
      // Upstash Redis doesn't have pipeline, use individual commands
      await redis.incr(redisKey);
      await redis.expire(redisKey, 120); // Expire after 2 minutes
      
      logger.debug({ key: `...${keySuffix}`, minute: currentMinute }, 'Incremented key usage in Redis');
    } catch (error) {
      logger.error({ error, key: `...${key.slice(-4)}` }, 'Failed to increment key usage in Redis');
      // Don't throw error, let the request continue
    }
  }

  public async getNextWorkingKey(): Promise<string> {
    if (this.keys.length === 0) {
      throw new Error("No API keys available in the key manager.");
    }
    
    // Get working keys
    const workingKeys = this.keys.filter(key => this.isKeyValid(key));
    if (workingKeys.length === 0) {
      throw new Error(
        "All API keys are currently failing. Please check their validity or reset failure counts."
      );
    }
    
    // Get request counts for working keys
    const requestCounts = await this.getKeyRequestCounts();
    const workingKeysCounts = requestCounts.filter(item => 
      workingKeys.includes(item.key)
    );
    
    // Find minimum request count
    const minRequestCount = Math.min(...workingKeysCounts.map(item => item.requestCount));
    
    // Get keys with minimum request count
    const keysWithMinRequests = workingKeysCounts
      .filter(item => item.requestCount === minRequestCount)
      .map(item => item.key);
    
    // Randomly select from keys with minimum request count
    const randomIndex = Math.floor(Math.random() * keysWithMinRequests.length);
    return keysWithMinRequests[randomIndex];
  }

  public handleApiFailure(key: string): void {
    if (this.failureCounts.has(key)) {
      const currentFailures = this.failureCounts.get(key)!;
      this.failureCounts.set(key, currentFailures + 1);
      this.lastFailureTimes.set(key, new Date());
      logger.warn(
        { key: `...${key.slice(-4)}`, failures: currentFailures + 1 },
        `Failure recorded for key.`
      );
    }
  }

  public resetKeyFailureCount(key: string): void {
    if (this.failureCounts.has(key)) {
      this.failureCounts.set(key, 0);
      this.lastFailureTimes.delete(key);
      logger.info(
        { key: `...${key.slice(-4)}` },
        `Failure count reset for key.`
      );
    }
  }

  public getAllKeys(): {
    key: string;
    failCount: number;
    isWorking: boolean;
    lastFailedAt: Date | null;
  }[] {
    return this.keys.map((key) => {
      const failCount = this.failureCounts.get(key)!;
      return {
        key,
        failCount,
        isWorking: this.isKeyValid(key),
        lastFailedAt: this.lastFailureTimes.get(key) || null,
      };
    });
  }

  public async verifyKey(key: string): Promise<boolean> {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const settings = await getSettings();
      const healthCheckModel = settings.HEALTH_CHECK_MODEL;
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: healthCheckModel });
      await model.generateContent("hi");
      this.resetKeyFailureCount(key);
      logger.info(
        { key: `...${key.slice(-4)}` },
        "Key is now active after successful health check."
      );
      return true;
    } catch {
      logger.warn(
        { key: `...${key.slice(-4)}` },
        "Key remains inactive after failed health check."
      );
      return false;
    }
  }

  public async checkAndReactivateKeys(): Promise<void> {
    logger.info("Starting hourly check for inactive API keys...");
    const inactiveKeys = this.keys.filter((key) => !this.isKeyValid(key));

    if (inactiveKeys.length === 0) {
      logger.info("No inactive keys to check.");
      return;
    }

    logger.info(`Found ${inactiveKeys.length} inactive keys to check.`);

    for (const key of inactiveKeys) {
      await this.verifyKey(key);
    }
  }
}

// --- Singleton Instance ---

// A more robust singleton pattern that works across hot-reloads in development.
const globalWithKeyManager = global as typeof global & {
  keyManagerPromise: Promise<KeyManager> | null;
};

export function resetKeyManager() {
  if (globalWithKeyManager.keyManagerPromise) {
    globalWithKeyManager.keyManagerPromise = null;
    logger.info("KeyManager instance reset.");
  }
}

async function createKeyManager(): Promise<KeyManager> {
  // 1. Load keys exclusively from the database
  const keysFromDb = (await prisma.apiKey.findMany()).map((k) => k.key);

  // 2. Load settings using the settings service
  const settings = await getSettings();
  const maxFailures = settings.MAX_FAILURES;

  // 3. Initialize KeyManager with the keys from the database
  return new KeyManager(keysFromDb, maxFailures);
}

/**
 * Returns the singleton instance of the KeyManager.
 */
export function getKeyManager(): Promise<KeyManager> {
  if (!globalWithKeyManager.keyManagerPromise) {
    logger.info("No existing KeyManager instance found, creating a new one.");
    globalWithKeyManager.keyManagerPromise = createKeyManager();
  } else {
    logger.info("Returning existing KeyManager instance.");
  }
  return globalWithKeyManager.keyManagerPromise;
}
