import { prisma } from "./db";
import logger from "./logger";

interface RequestLogData {
  apiKey: string;
  model: string;
  statusCode: number;
  isSuccess: boolean;
  latency: number;
}

interface ErrorLogData {
  apiKey: string;
  errorType: string;
  errorMessage: string;
  errorDetails?: string;
}

class LogService {
  private static instance: LogService;
  private logQueue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  /**
   * Log request with retry mechanism
   */
  async logRequest(data: RequestLogData): Promise<void> {
    const logOperation = async () => {
      try {
        await prisma.requestLog.create({
          data: {
            apiKey: data.apiKey.slice(-4), // Always store only last 4 characters
            model: data.model,
            statusCode: data.statusCode,
            isSuccess: data.isSuccess,
            latency: data.latency,
          },
        });
        logger.debug({ apiKey: data.apiKey.slice(-4), model: data.model }, "Request logged successfully");
      } catch (error) {
        logger.error({ error, data }, "Failed to log request");
        throw error;
      }
    };

    return this.enqueueLog(logOperation);
  }

  /**
   * Log error with retry mechanism
   */
  async logError(data: ErrorLogData): Promise<void> {
    const logOperation = async () => {
      try {
        await prisma.errorLog.create({
          data: {
            apiKey: data.apiKey.slice(-4), // Always store only last 4 characters
            errorType: data.errorType,
            errorMessage: data.errorMessage,
            errorDetails: data.errorDetails,
          },
        });
        logger.debug({ apiKey: data.apiKey.slice(-4), errorType: data.errorType }, "Error logged successfully");
      } catch (error) {
        logger.error({ error, data }, "Failed to log error");
        throw error;
      }
    };

    return this.enqueueLog(logOperation);
  }

  /**
   * Fire-and-forget logging for streaming responses
   */
  logRequestAsync(data: RequestLogData): void {
    this.logRequest(data).catch(error => {
      logger.error({ error, data }, "Async request logging failed");
    });
  }

  /**
   * Fire-and-forget error logging
   */
  logErrorAsync(data: ErrorLogData): void {
    this.logError(data).catch(error => {
      logger.error({ error, data }, "Async error logging failed");
    });
  }

  /**
   * Enqueue log operation with simple queue processing
   */
  private async enqueueLog(operation: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logQueue.push(async () => {
        try {
          await operation();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * Process log queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.logQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.logQueue.length > 0) {
      const operation = this.logQueue.shift();
      if (operation) {
        try {
          await operation();
        } catch (error) {
          logger.error({ error }, "Log operation failed in queue");
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Flush all pending logs (useful for graceful shutdown)
   */
  async flush(): Promise<void> {
    while (this.logQueue.length > 0) {
      await this.processQueue();
      // Small delay to prevent busy waiting
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

export const logService = LogService.getInstance();