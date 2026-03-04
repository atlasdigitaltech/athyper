/**
 * In-Memory Admin Action Repository
 *
 * Provides in-memory storage for admin action requests,
 * logs, reassignments, and deadline modifications.
 */

import type {
  AdminActionLog,
  AdminActionRequest,
  DeadlineModification,
  IAdminActionRepository,
  StepReassignment,
} from "./types.js";

/**
 * Generate unique ID
 */
function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * In-Memory Admin Action Repository Implementation
 */
export class InMemoryAdminActionRepository implements IAdminActionRepository {
  private actionRequests: Map<string, AdminActionRequest> = new Map();
  private actionLogs: Map<string, AdminActionLog> = new Map();
  private reassignments: Map<string, StepReassignment[]> = new Map();
  private deadlineModifications: Map<string, DeadlineModification[]> = new Map();

  // Action requests

  async createActionRequest(
    request: Omit<AdminActionRequest, "id">
  ): Promise<AdminActionRequest> {
    const id = generateId("action");
    const newRequest: AdminActionRequest = { id, ...request };
    this.actionRequests.set(id, newRequest);
    return newRequest;
  }

  async getActionRequest(
    tenantId: string,
    requestId: string
  ): Promise<AdminActionRequest | null> {
    const request = this.actionRequests.get(requestId);
    return request?.tenantId === tenantId ? request : null;
  }

  async getActionRequestsByInstance(
    tenantId: string,
    instanceId: string
  ): Promise<AdminActionRequest[]> {
    return Array.from(this.actionRequests.values()).filter(
      (r) => r.tenantId === tenantId && r.instanceId === instanceId
    );
  }

  async getPendingActionRequests(tenantId: string): Promise<AdminActionRequest[]> {
    return Array.from(this.actionRequests.values()).filter(
      (r) => r.tenantId === tenantId && r.status === "pending"
    );
  }

  async updateActionRequest(
    tenantId: string,
    requestId: string,
    updates: Partial<AdminActionRequest>
  ): Promise<AdminActionRequest> {
    const existing = this.actionRequests.get(requestId);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error(`Action request not found: ${requestId}`);
    }

    const updated: AdminActionRequest = { ...existing, ...updates };
    this.actionRequests.set(requestId, updated);
    return updated;
  }

  // Action logs

  async createActionLog(log: Omit<AdminActionLog, "id">): Promise<AdminActionLog> {
    const id = generateId("log");
    const newLog: AdminActionLog = { id, ...log };
    this.actionLogs.set(id, newLog);
    return newLog;
  }

  async getActionLogs(tenantId: string, instanceId: string): Promise<AdminActionLog[]> {
    return Array.from(this.actionLogs.values())
      .filter((l) => l.tenantId === tenantId && l.instanceId === instanceId)
      .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
  }

  async getActionLogsByUser(
    tenantId: string,
    userId: string,
    since?: Date
  ): Promise<AdminActionLog[]> {
    return Array.from(this.actionLogs.values())
      .filter((l) => {
        if (l.tenantId !== tenantId) return false;
        if (l.performedBy !== userId) return false;
        if (since && new Date(l.performedAt) < since) return false;
        return true;
      })
      .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
  }

  // Reassignments

  async createReassignment(reassignment: StepReassignment): Promise<StepReassignment> {
    const key = reassignment.stepInstanceId;
    const existing = this.reassignments.get(key) || [];
    existing.push(reassignment);
    this.reassignments.set(key, existing);
    return reassignment;
  }

  async getReassignments(
    tenantId: string,
    stepInstanceId: string
  ): Promise<StepReassignment[]> {
    return this.reassignments.get(stepInstanceId) || [];
  }

  // Deadline modifications

  async createDeadlineModification(
    modification: DeadlineModification
  ): Promise<DeadlineModification> {
    const key = modification.stepInstanceId;
    const existing = this.deadlineModifications.get(key) || [];
    existing.push(modification);
    this.deadlineModifications.set(key, existing);
    return modification;
  }

  async getDeadlineModifications(
    tenantId: string,
    stepInstanceId: string
  ): Promise<DeadlineModification[]> {
    return this.deadlineModifications.get(stepInstanceId) || [];
  }

  // Utility methods

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.actionRequests.clear();
    this.actionLogs.clear();
    this.reassignments.clear();
    this.deadlineModifications.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    actionRequests: { total: number; pending: number; executed: number };
    actionLogs: number;
    reassignments: number;
    deadlineModifications: number;
  } {
    const requests = Array.from(this.actionRequests.values());
    const reassignmentCount = Array.from(this.reassignments.values()).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    const modificationCount = Array.from(this.deadlineModifications.values()).reduce(
      (sum, arr) => sum + arr.length,
      0
    );

    return {
      actionRequests: {
        total: requests.length,
        pending: requests.filter((r) => r.status === "pending").length,
        executed: requests.filter((r) => r.status === "executed").length,
      },
      actionLogs: this.actionLogs.size,
      reassignments: reassignmentCount,
      deadlineModifications: modificationCount,
    };
  }
}

/**
 * Factory function to create in-memory admin action repository
 */
export function createInMemoryAdminActionRepository(): IAdminActionRepository {
  return new InMemoryAdminActionRepository();
}
