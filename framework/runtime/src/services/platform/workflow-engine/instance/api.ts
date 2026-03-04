/**
 * Approval Instance API
 *
 * HTTP API endpoints for managing approval instances at runtime.
 */

import { ApprovalInstanceError } from "./service.js";

import type {
  ApprovalActionRecord,
  ApprovalInstance,
  ApprovalInstanceQueryOptions,
  ApprovalInstanceStatus,
  ApprovalStepInstance,
  CreateApprovalInstanceInput,
  EntityLock,
  IApprovalInstanceService,
} from "./types.js";
import type { Request, Response } from "express";

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CreateInstanceRequest {
  entity: {
    type: string;
    id: string;
    version: number;
    referenceCode?: string;
    displayName?: string;
    data?: Record<string, unknown>;
  };
  requester: {
    userId: string;
    displayName?: string;
    email?: string;
    departmentId?: string;
    costCenterId?: string;
    orgId?: string;
    managerId?: string;
    roles?: string[];
  };
  triggerEvent: string;
  triggerContext?: Record<string, unknown>;
  orgId?: string;
  templateCode?: string;
  priority?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateInstanceResponse {
  success: boolean;
  instance?: ApprovalInstance;
  stepInstances?: ApprovalStepInstance[];
  entityLock?: EntityLock;
  warnings?: string[];
  error?: string;
  errorCode?: string;
}

export interface GetInstanceResponse {
  success: boolean;
  instance?: ApprovalInstance;
  error?: string;
}

export interface ListInstancesResponse {
  success: boolean;
  instances: ApprovalInstance[];
  total?: number;
  error?: string;
}

export interface GetStepInstancesResponse {
  success: boolean;
  stepInstances: ApprovalStepInstance[];
  error?: string;
}

export interface GetActionHistoryResponse {
  success: boolean;
  actions: ApprovalActionRecord[];
  error?: string;
}

export interface CancelInstanceRequest {
  reason?: string;
}

export interface CancelInstanceResponse {
  success: boolean;
  instance?: ApprovalInstance;
  error?: string;
}

export interface WithdrawInstanceRequest {
  reason?: string;
}

export interface WithdrawInstanceResponse {
  success: boolean;
  instance?: ApprovalInstance;
  error?: string;
}

export interface HoldInstanceRequest {
  reason?: string;
}

export interface HoldInstanceResponse {
  success: boolean;
  instance?: ApprovalInstance;
  error?: string;
}

export interface ReleaseInstanceResponse {
  success: boolean;
  instance?: ApprovalInstance;
  error?: string;
}

export interface CheckLockResponse {
  success: boolean;
  locked: boolean;
  lock?: EntityLock;
  error?: string;
}

export interface PendingApprovalsResponse {
  success: boolean;
  instances: ApprovalInstance[];
  total: number;
  error?: string;
}

export interface InstanceCountsResponse {
  success: boolean;
  counts: Record<ApprovalInstanceStatus, number>;
  error?: string;
}

// ============================================================================
// API Controller
// ============================================================================

/**
 * API controller for approval instance management
 */
export class ApprovalInstanceApiController {
  constructor(private readonly service: IApprovalInstanceService) {}

  /**
   * Create a new approval instance
   * POST /api/approval/instances
   */
  async createInstance(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const body = req.body as CreateInstanceRequest;

      const result = await this.service.createInstance(tenantId, body as CreateApprovalInstanceInput);

      if (result.success) {
        res.status(201).json({
          success: true,
          instance: result.instance,
          stepInstances: result.stepInstances,
          entityLock: result.entityLock,
          warnings: result.warnings,
        } as CreateInstanceResponse);
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        } as CreateInstanceResponse);
      }
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Get an instance by ID
   * GET /api/approval/instances/:id
   */
  async getInstance(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const instanceId = req.params.id;

      const instance = await this.service.getInstance(tenantId, instanceId);

      if (!instance) {
        res.status(404).json({
          success: false,
          error: "Instance not found",
        } as GetInstanceResponse);
        return;
      }

      res.json({
        success: true,
        instance,
      } as GetInstanceResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * List instances
   * GET /api/approval/instances
   */
  async listInstances(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const query = req.query as Record<string, string>;

      const options: ApprovalInstanceQueryOptions = {
        status: query.status as ApprovalInstanceStatus | undefined,
        entityType: query.entityType,
        entityId: query.entityId,
        requesterId: query.requesterId,
        pendingApproverId: query.pendingApproverId,
        templateCode: query.templateCode,
        createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
        createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
        includeCompleted: query.includeCompleted === "true",
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
        sortBy: query.sortBy as any,
        sortDirection: query.sortDirection as "asc" | "desc" | undefined,
      };

      const instances = await this.service.listInstances(tenantId, options);

      res.json({
        success: true,
        instances,
      } as ListInstancesResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Get instances for an entity
   * GET /api/approval/instances/entity/:entityType/:entityId
   */
  async getInstancesForEntity(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { entityType, entityId } = req.params;

      const instances = await this.service.getInstancesForEntity(tenantId, entityType, entityId);

      res.json({
        success: true,
        instances,
      } as ListInstancesResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Get step instances for an approval
   * GET /api/approval/instances/:id/steps
   */
  async getStepInstances(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const instanceId = req.params.id;

      const stepInstances = await this.service.getStepInstances(tenantId, instanceId);

      res.json({
        success: true,
        stepInstances,
      } as GetStepInstancesResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Get action history for an instance
   * GET /api/approval/instances/:id/history
   */
  async getActionHistory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const instanceId = req.params.id;

      const actions = await this.service.getActionHistory(tenantId, instanceId);

      res.json({
        success: true,
        actions,
      } as GetActionHistoryResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Get pending approvals for current user
   * GET /api/approval/instances/pending
   */
  async getPendingApprovals(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);

      const instances = await this.service.getPendingForUser(tenantId, userId);

      res.json({
        success: true,
        instances,
        total: instances.length,
      } as PendingApprovalsResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Cancel an instance
   * POST /api/approval/instances/:id/cancel
   */
  async cancelInstance(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const instanceId = req.params.id;
      const body = req.body as CancelInstanceRequest;

      const instance = await this.service.cancelInstance(
        tenantId,
        instanceId,
        userId,
        body.reason
      );

      res.json({
        success: true,
        instance,
      } as CancelInstanceResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Withdraw an instance
   * POST /api/approval/instances/:id/withdraw
   */
  async withdrawInstance(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const instanceId = req.params.id;
      const body = req.body as WithdrawInstanceRequest;

      const instance = await this.service.withdrawInstance(
        tenantId,
        instanceId,
        userId,
        body.reason
      );

      res.json({
        success: true,
        instance,
      } as WithdrawInstanceResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Put instance on hold
   * POST /api/approval/instances/:id/hold
   */
  async holdInstance(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const instanceId = req.params.id;
      const body = req.body as HoldInstanceRequest;

      const instance = await this.service.holdInstance(
        tenantId,
        instanceId,
        userId,
        body.reason
      );

      res.json({
        success: true,
        instance,
      } as HoldInstanceResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Release instance from hold
   * POST /api/approval/instances/:id/release
   */
  async releaseInstance(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const instanceId = req.params.id;

      const instance = await this.service.releaseInstance(tenantId, instanceId, userId);

      res.json({
        success: true,
        instance,
      } as ReleaseInstanceResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Check entity lock
   * GET /api/approval/locks/:entityType/:entityId
   */
  async checkEntityLock(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { entityType, entityId } = req.params;

      const lock = await this.service.checkEntityLock(tenantId, entityType, entityId);

      res.json({
        success: true,
        locked: !!lock,
        lock,
      } as CheckLockResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getTenantId(req: Request): string {
    const tenantId =
      (req as any).tenantId || req.headers["x-tenant-id"] || req.query.tenantId;

    if (!tenantId) {
      throw new ApprovalInstanceError("UNAUTHORIZED", "Tenant ID required");
    }

    return String(tenantId);
  }

  private getUserId(req: Request): string {
    const userId =
      (req as any).userId || (req as any).user?.id || req.headers["x-user-id"];

    if (!userId) {
      throw new ApprovalInstanceError("UNAUTHORIZED", "User ID required");
    }

    return String(userId);
  }

  private handleError(error: unknown, res: Response): void {
    if (error instanceof ApprovalInstanceError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        INVALID_STATE: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        CONFLICT: 409,
      };

      const status = statusMap[error.code] || 500;

      res.status(status).json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
      });
    } else if (error instanceof Error) {
      console.error("Approval instance API error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Unknown error",
      });
    }
  }
}

// ============================================================================
// Route Definitions
// ============================================================================

export interface RouteDefinition {
  method: "get" | "post" | "put" | "delete" | "patch";
  path: string;
  handler: string;
  description: string;
}

/**
 * Get route definitions for approval instance API
 */
export function getApprovalInstanceRoutes(): RouteDefinition[] {
  return [
    {
      method: "get",
      path: "/api/approval/instances",
      handler: "listInstances",
      description: "List approval instances",
    },
    {
      method: "post",
      path: "/api/approval/instances",
      handler: "createInstance",
      description: "Create a new approval instance",
    },
    {
      method: "get",
      path: "/api/approval/instances/pending",
      handler: "getPendingApprovals",
      description: "Get pending approvals for current user",
    },
    {
      method: "get",
      path: "/api/approval/instances/:id",
      handler: "getInstance",
      description: "Get an instance by ID",
    },
    {
      method: "get",
      path: "/api/approval/instances/:id/steps",
      handler: "getStepInstances",
      description: "Get step instances for an approval",
    },
    {
      method: "get",
      path: "/api/approval/instances/:id/history",
      handler: "getActionHistory",
      description: "Get action history for an instance",
    },
    {
      method: "post",
      path: "/api/approval/instances/:id/cancel",
      handler: "cancelInstance",
      description: "Cancel an instance",
    },
    {
      method: "post",
      path: "/api/approval/instances/:id/withdraw",
      handler: "withdrawInstance",
      description: "Withdraw an instance",
    },
    {
      method: "post",
      path: "/api/approval/instances/:id/hold",
      handler: "holdInstance",
      description: "Put instance on hold",
    },
    {
      method: "post",
      path: "/api/approval/instances/:id/release",
      handler: "releaseInstance",
      description: "Release instance from hold",
    },
    {
      method: "get",
      path: "/api/approval/instances/entity/:entityType/:entityId",
      handler: "getInstancesForEntity",
      description: "Get instances for an entity",
    },
    {
      method: "get",
      path: "/api/approval/locks/:entityType/:entityId",
      handler: "checkEntityLock",
      description: "Check entity lock status",
    },
  ];
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create approval instance API controller
 */
export function createApprovalInstanceApiController(
  service: IApprovalInstanceService
): ApprovalInstanceApiController {
  return new ApprovalInstanceApiController(service);
}
