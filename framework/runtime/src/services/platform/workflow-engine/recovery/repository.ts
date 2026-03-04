/**
 * In-Memory Recovery Repository
 *
 * Provides in-memory storage for workflow errors, pauses,
 * retry attempts, and admin override requests.
 */

import type {
  AdminOverrideRequest,
  IRecoveryErrorRepository,
  RetryAttempt,
  WorkflowError,
  WorkflowPause,
} from "./types.js";

/**
 * Generate unique ID
 */
function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * In-Memory Recovery Repository Implementation
 */
export class InMemoryRecoveryRepository implements IRecoveryErrorRepository {
  private errors: Map<string, WorkflowError> = new Map();
  private pauses: Map<string, WorkflowPause> = new Map();
  private retryAttempts: Map<string, RetryAttempt> = new Map();
  private overrideRequests: Map<string, AdminOverrideRequest> = new Map();

  // Error management

  async createError(error: Omit<WorkflowError, "id">): Promise<WorkflowError> {
    const id = generateId("err");
    const newError: WorkflowError = { id, ...error };
    this.errors.set(id, newError);
    return newError;
  }

  async getError(tenantId: string, errorId: string): Promise<WorkflowError | null> {
    return this.errors.get(errorId) || null;
  }

  async getErrorsByInstance(tenantId: string, instanceId: string): Promise<WorkflowError[]> {
    return Array.from(this.errors.values()).filter(
      (e) => e.instanceId === instanceId
    );
  }

  async getActiveErrors(_tenantId: string): Promise<WorkflowError[]> {
    return Array.from(this.errors.values()).filter(
      (e) => e.status !== "resolved" && e.status !== "ignored"
    );
  }

  async updateError(
    tenantId: string,
    errorId: string,
    updates: Partial<WorkflowError>
  ): Promise<WorkflowError> {
    const existing = this.errors.get(errorId);
    if (!existing) {
      throw new Error(`Error not found: ${errorId}`);
    }

    const updated: WorkflowError = { ...existing, ...updates };
    this.errors.set(errorId, updated);
    return updated;
  }

  // Pause management

  async createPause(pause: Omit<WorkflowPause, "id">): Promise<WorkflowPause> {
    const id = generateId("pause");
    const newPause: WorkflowPause = { id, ...pause };
    this.pauses.set(id, newPause);
    return newPause;
  }

  async getPause(tenantId: string, pauseId: string): Promise<WorkflowPause | null> {
    return this.pauses.get(pauseId) || null;
  }

  async getActivePause(tenantId: string, instanceId: string): Promise<WorkflowPause | null> {
    return (
      Array.from(this.pauses.values()).find(
        (p) => p.instanceId === instanceId && !p.resumedAt
      ) || null
    );
  }

  async updatePause(
    tenantId: string,
    pauseId: string,
    updates: Partial<WorkflowPause>
  ): Promise<WorkflowPause> {
    const existing = this.pauses.get(pauseId);
    if (!existing) {
      throw new Error(`Pause not found: ${pauseId}`);
    }

    const updated: WorkflowPause = { ...existing, ...updates };
    this.pauses.set(pauseId, updated);
    return updated;
  }

  // Retry management

  async createRetryAttempt(attempt: Omit<RetryAttempt, "id">): Promise<RetryAttempt> {
    const id = generateId("retry");
    const newAttempt: RetryAttempt = { id, ...attempt };
    this.retryAttempts.set(id, newAttempt);
    return newAttempt;
  }

  async getRetryAttempts(tenantId: string, errorId: string): Promise<RetryAttempt[]> {
    return Array.from(this.retryAttempts.values()).filter(
      (a) => a.errorId === errorId
    );
  }

  async updateRetryAttempt(
    tenantId: string,
    attemptId: string,
    updates: Partial<RetryAttempt>
  ): Promise<RetryAttempt> {
    const existing = this.retryAttempts.get(attemptId);
    if (!existing) {
      throw new Error(`Retry attempt not found: ${attemptId}`);
    }

    const updated: RetryAttempt = { ...existing, ...updates };
    this.retryAttempts.set(attemptId, updated);
    return updated;
  }

  // Admin override management

  async createOverrideRequest(
    request: Omit<AdminOverrideRequest, "id">
  ): Promise<AdminOverrideRequest> {
    const id = generateId("override");
    const newRequest: AdminOverrideRequest = { id, ...request };
    this.overrideRequests.set(id, newRequest);
    return newRequest;
  }

  async getOverrideRequest(
    tenantId: string,
    requestId: string
  ): Promise<AdminOverrideRequest | null> {
    return this.overrideRequests.get(requestId) || null;
  }

  async getOverridesByInstance(
    tenantId: string,
    instanceId: string
  ): Promise<AdminOverrideRequest[]> {
    return Array.from(this.overrideRequests.values()).filter(
      (r) => r.instanceId === instanceId
    );
  }

  async updateOverrideRequest(
    tenantId: string,
    requestId: string,
    updates: Partial<AdminOverrideRequest>
  ): Promise<AdminOverrideRequest> {
    const existing = this.overrideRequests.get(requestId);
    if (!existing) {
      throw new Error(`Override request not found: ${requestId}`);
    }

    const updated: AdminOverrideRequest = { ...existing, ...updates };
    this.overrideRequests.set(requestId, updated);
    return updated;
  }

  // Utility methods

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.errors.clear();
    this.pauses.clear();
    this.retryAttempts.clear();
    this.overrideRequests.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    errors: { total: number; active: number; resolved: number };
    pauses: { total: number; active: number };
    retryAttempts: { total: number; pending: number; completed: number };
    overrideRequests: { total: number; pending: number; executed: number };
  } {
    const errors = Array.from(this.errors.values());
    const pauses = Array.from(this.pauses.values());
    const retries = Array.from(this.retryAttempts.values());
    const overrides = Array.from(this.overrideRequests.values());

    return {
      errors: {
        total: errors.length,
        active: errors.filter((e) => e.status !== "resolved" && e.status !== "ignored").length,
        resolved: errors.filter((e) => e.status === "resolved").length,
      },
      pauses: {
        total: pauses.length,
        active: pauses.filter((p) => !p.resumedAt).length,
      },
      retryAttempts: {
        total: retries.length,
        pending: retries.filter((r) => !r.completedAt).length,
        completed: retries.filter((r) => r.completedAt).length,
      },
      overrideRequests: {
        total: overrides.length,
        pending: overrides.filter((o) => o.status === "pending").length,
        executed: overrides.filter((o) => o.status === "executed").length,
      },
    };
  }
}

/**
 * Factory function to create in-memory recovery repository
 */
export function createInMemoryRecoveryRepository(): IRecoveryErrorRepository {
  return new InMemoryRecoveryRepository();
}
