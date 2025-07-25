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
      
      // Use pipeline for batch operations
      const pipeline = redis.pipeline();
      const redisKeys: string[] = [];
      
      this.keys.forEach((key) => {
        const keySuffix = key.slice(-4);
        const redisKey = `req:${keySuffix}:${currentMinute}`;
        redisKeys.push(redisKey);
        pipeline.get(redisKey);
      });
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Pipeline execution failed');
      }
      
      const requestCounts = this.keys.map((key, index) => {
        const [error, count] = results[index];
        if (error) {
          logger.error({ error, key: `...${key.slice(-4)}` }, 'Failed to get key usage from Redis');
          return { key, requestCount: 0 };
        }
        return { key, requestCount: parseInt(count as string || '0', 10) };
      });
      
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
    const maxRetries = 2;
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        const redis = getRedisClient();
        const currentMinute = Math.floor(Date.now() / 60000);
        const keySuffix = key.slice(-4);
        const redisKey = `req:${keySuffix}:${currentMinute}`;
        
        // Use pipeline for atomic operations with timeout
        const pipeline = redis.pipeline();
        pipeline.incr(redisKey);
        pipeline.expire(redisKey, 120); // Expire after 2 minutes
        
        const results = await Promise.race([
          pipeline.exec(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Redis operation timeout')), 3000)
          )
        ]);
        
        // Check if pipeline execution was successful
        if (Array.isArray(results)) {
          const hasError = results.some(([error]) => error !== null);
          if (hasError) {
            throw new Error('Pipeline execution had errors');
          }
        }
        
        logger.debug({ 
          key: `...${keySuffix}`, 
          minute: currentMinute,
          retryCount 
        }, 'Incremented key usage in Redis');
        
        return; // Success, exit the retry loop
        
      } catch (error) {
        retryCount++;
        const isLastRetry = retryCount > maxRetries;
        
        logger.error({ 
          error, 
          key: `...${key.slice(-4)}`,
          retryCount,
          isLastRetry
        }, `Failed to increment key usage in Redis (attempt ${retryCount})`);
        
        if (isLastRetry) {
          // Don't throw error, let the request continue
          return;
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
      }
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
    
    // If only one working key, return it directly
    if (workingKeysCounts.length === 1) {
      return workingKeysCounts[0].key;
    }
    
    // Calculate weighted scores (lower is better)
    // Consider both request count and failure history
    const keyScores = workingKeysCounts.map(item => {
      const failureCount = this.failureCounts.get(item.key) || 0;
      const failurePenalty = failureCount * 0.1; // Small penalty for recent failures
      const score = item.requestCount + failurePenalty;
      
      return {
        key: item.key,
        requestCount: item.requestCount,
        failureCount,
        score
      };
    });
    
    // Sort by score (ascending - lower is better)
    keyScores.sort((a, b) => a.score - b.score);
    
    // Find minimum score
    const minScore = keyScores[0].score;
    
    // Get keys with minimum score (within a small tolerance)
    const tolerance = 0.5;
    const bestKeys = keyScores
      .filter(item => item.score <= minScore + tolerance)
      .map(item => item.key);
    
    // Randomly select from best keys
    const randomIndex = Math.floor(Math.random() * bestKeys.length);
    const selectedKey = bestKeys[randomIndex];
    
    logger.debug({
      selectedKey: `...${selectedKey.slice(-4)}`,
      totalKeys: workingKeys.length,
      candidateKeys: bestKeys.length,
      keyScores: keyScores.map(k => ({
        key: `...${k.key.slice(-4)}`,
        requests: k.requestCount,
        failures: k.failureCount,
        score: k.score
      }))
    }, 'Key selection completed');
    
    return selectedKey;
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
