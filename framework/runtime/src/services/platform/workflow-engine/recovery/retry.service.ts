/**
 * Retry Service
 *
 * Handles scheduling and execution of retry attempts
 * for failed workflow operations.
 */

import type {
  IRecoveryErrorRepository,
  IRetryService,
  RetryAttempt,
  RetryConfig,
  WorkflowError,
} from "./types.js";

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 300000, // 5 minutes
  backoffMultiplier: 2,
  retryableErrors: [
    "notification_failed",
    "system_error",
  ],
};

/**
 * Retry action handler type
 */
type RetryActionHandler = (
  tenantId: string,
  error: WorkflowError,
  attempt: RetryAttempt
) => Promise<{ success: boolean; error?: string }>;

/**
 * Retry Service Implementation
 */
export class RetryService implements IRetryService {
  private readonly config: RetryConfig;
  private readonly actionHandlers: Map<string, RetryActionHandler>;

  constructor(
    private readonly errorRepository: IRecoveryErrorRepository,
    config?: Partial<RetryConfig>
  ) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.actionHandlers = new Map();
  }

  /**
   * Register a retry action handler
   */
  registerActionHandler(action: string, handler: RetryActionHandler): void {
    this.actionHandlers.set(action, handler);
  }

  /**
   * Schedule a retry for an error
   */
  async scheduleRetry(
    tenantId: string,
    error: WorkflowError
  ): Promise<RetryAttempt> {
    // Check if error is retryable
    if (!this.config.retryableErrors.includes(error.errorType)) {
      throw new Error(`Error type ${error.errorType} is not retryable`);
    }

    // Check retry count
    if (error.retryCount >= this.config.maxRetries) {
      throw new Error(`Maximum retries (${this.config.maxRetries}) exceeded`);
    }

    // Calculate next retry delay with exponential backoff
    const delay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, error.retryCount),
      this.config.maxDelayMs
    );

    const nextRetryAt = new Date(Date.now() + delay);

    // Create retry attempt
    const attempt = await this.errorRepository.createRetryAttempt({
      errorId: error.id,
      instanceId: error.instanceId,
      attemptNumber: error.retryCount + 1,
      action: error.errorType,
      startedAt: new Date(),
      success: false,
      nextRetryAt,
    });

    // Update error with next retry time
    await this.errorRepository.updateError(tenantId, error.id, {
      nextRetryAt,
      status: "acknowledged",
    });

    return attempt;
  }

  /**
   * Execute a scheduled retry
   */
  async executeRetry(
    tenantId: string,
    attemptId: string
  ): Promise<RetryAttempt> {
    const attempts = await this.errorRepository.getRetryAttempts(tenantId, attemptId);
    const attempt = attempts.find((a) => a.id === attemptId);

    if (!attempt) {
      throw new Error("Retry attempt not found");
    }

    const error = await this.errorRepository.getError(tenantId, attempt.errorId);
    if (!error) {
      throw new Error("Error not found for retry attempt");
    }

    // Get handler for this action
    const handler = this.actionHandlers.get(attempt.action);

    let success = false;
    let errorMessage: string | undefined;

    if (handler) {
      try {
        const result = await handler(tenantId, error, attempt);
        success = result.success;
        errorMessage = result.error;
      } catch (err) {
        success = false;
        errorMessage = err instanceof Error ? err.message : String(err);
      }
    } else {
      // Default retry behavior - just mark as attempted
      success = false;
      errorMessage = `No handler registered for action: ${attempt.action}`;
    }

    // Update attempt
    const updatedAttempt = await this.errorRepository.updateRetryAttempt(
      tenantId,
      attemptId,
      {
        completedAt: new Date(),
        success,
        error: errorMessage,
      }
    );

    // Update error
    if (success) {
      await this.errorRepository.updateError(tenantId, error.id, {
        status: "resolved",
        resolvedAt: new Date(),
        resolution: `Resolved by retry attempt ${attempt.attemptNumber}`,
      });
    } else {
      await this.errorRepository.updateError(tenantId, error.id, {
        retryCount: error.retryCount + 1,
        status: error.retryCount + 1 >= this.config.maxRetries ? "detected" : "acknowledged",
      });

      // Schedule next retry if under limit
      if (error.retryCount + 1 < this.config.maxRetries) {
        await this.scheduleRetry(tenantId, {
          ...error,
          retryCount: error.retryCount + 1,
        });
      }
    }

    return updatedAttempt;
  }

  /**
   * Cancel pending retries for an error
   */
  async cancelRetries(tenantId: string, errorId: string): Promise<void> {
    const attempts = await this.errorRepository.getRetryAttempts(tenantId, errorId);

    for (const attempt of attempts) {
      if (!attempt.completedAt) {
        await this.errorRepository.updateRetryAttempt(tenantId, attempt.id, {
          completedAt: new Date(),
          success: false,
          error: "Retry cancelled",
        });
      }
    }

    // Update error to remove next retry time
    await this.errorRepository.updateError(tenantId, errorId, {
      nextRetryAt: undefined,
    });
  }

  /**
   * Get pending retries
   */
  async getPendingRetries(tenantId: string): Promise<RetryAttempt[]> {
    const errors = await this.errorRepository.getActiveErrors(tenantId);
    const pendingAttempts: RetryAttempt[] = [];

    for (const error of errors) {
      const attempts = await this.errorRepository.getRetryAttempts(tenantId, error.id);
      const pending = attempts.filter((a) => !a.completedAt && a.nextRetryAt);
      pendingAttempts.push(...pending);
    }

    return pendingAttempts;
  }

  /**
   * Process due retries
   */
  async processDueRetries(tenantId: string): Promise<RetryAttempt[]> {
    const now = new Date();
    const pending = await this.getPendingRetries(tenantId);
    const due = pending.filter((a) => a.nextRetryAt && new Date(a.nextRetryAt) <= now);
    const results: RetryAttempt[] = [];

    for (const attempt of due) {
      try {
        const result = await this.executeRetry(tenantId, attempt.id);
        results.push(result);
      } catch (err) {
        console.error(`Failed to execute retry ${attempt.id}:`, err);
      }
    }

    return results;
  }
}

/**
 * Factory function to create retry service
 */
export function createRetryService(
  errorRepository: IRecoveryErrorRepository,
  config?: Partial<RetryConfig>
): IRetryService {
  return new RetryService(errorRepository, config);
}
