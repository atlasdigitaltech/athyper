/**
 * Approval Workflow API
 *
 * HTTP API endpoints for managing approval workflow templates.
 */

import { ApprovalWorkflowError } from "./workflow-definition.service.js";

import type {
  ApprovalEntityType,
  ApprovalTriggerEvent,
  ApprovalWorkflowQueryOptions,
  ApproverResolutionContext,
  CreateApprovalWorkflowInput,
  IApprovalWorkflowService,
  StoredApprovalWorkflowTemplate,
  TemplateValidationResult,
  UpdateApprovalWorkflowInput,
} from "./types.js";
import type { Request, Response } from "express";

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CreateTemplateRequest {
  name: string;
  code: string;
  description?: string;
  entityType: ApprovalEntityType;
  customEntityType?: string;
  enabled: boolean;
  priority: number;
  triggers: any[];
  steps: any[];
  globalSla?: any;
  allowedActions: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateTemplateResponse {
  success: boolean;
  template?: StoredApprovalWorkflowTemplate;
  error?: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  triggers?: any[];
  steps?: any[];
  globalSla?: any;
  allowedActions?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTemplateResponse {
  success: boolean;
  template?: StoredApprovalWorkflowTemplate;
  error?: string;
}

export interface ListTemplatesRequest {
  entityType?: ApprovalEntityType;
  enabled?: boolean;
  activeOnly?: boolean;
  code?: string;
  searchName?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

export interface ListTemplatesResponse {
  success: boolean;
  templates: StoredApprovalWorkflowTemplate[];
  total?: number;
  error?: string;
}

export interface GetTemplateResponse {
  success: boolean;
  template?: StoredApprovalWorkflowTemplate;
  error?: string;
}

export interface PublishTemplateResponse {
  success: boolean;
  template?: StoredApprovalWorkflowTemplate;
  error?: string;
}

export interface CloneTemplateRequest {
  newCode: string;
  newName: string;
}

export interface CloneTemplateResponse {
  success: boolean;
  template?: StoredApprovalWorkflowTemplate;
  error?: string;
}

export interface ValidateTemplateRequest {
  template: CreateApprovalWorkflowInput;
}

export interface ValidateTemplateResponse {
  success: boolean;
  validation: TemplateValidationResult;
}

export interface ResolveApproversRequest {
  stepId: string;
  entity: Record<string, unknown>;
  requester: {
    userId: string;
    roles?: string[];
    orgId?: string;
    departmentId?: string;
    costCenterId?: string;
    managerId?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface ResolveApproversResponse {
  success: boolean;
  approvers?: Array<{
    userId: string;
    displayName?: string;
    email?: string;
    resolvedBy: string;
    strategy: string;
    isFallback: boolean;
  }>;
  error?: string;
}

export interface FindTemplatesRequest {
  entityType: ApprovalEntityType;
  triggerEvent: ApprovalTriggerEvent;
  entityData?: Record<string, unknown>;
}

export interface FindTemplatesResponse {
  success: boolean;
  templates: StoredApprovalWorkflowTemplate[];
  error?: string;
}

// ============================================================================
// API Controller
// ============================================================================

/**
 * API controller for approval workflow management
 */
export class ApprovalWorkflowApiController {
  constructor(private readonly service: IApprovalWorkflowService) {}

  /**
   * Create a new approval workflow template
   * POST /api/approval/templates
   */
  async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const body = req.body as CreateTemplateRequest;

      const template = await this.service.createTemplate(
        tenantId,
        body as CreateApprovalWorkflowInput,
        userId
      );

      res.status(201).json({
        success: true,
        template,
      } as CreateTemplateResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Update an approval workflow template
   * PUT /api/approval/templates/:id
   */
  async updateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const templateId = req.params.id;
      const body = req.body as UpdateTemplateRequest;

      const template = await this.service.updateTemplate(
        tenantId,
        templateId,
        body as UpdateApprovalWorkflowInput,
        userId
      );

      res.json({
        success: true,
        template,
      } as UpdateTemplateResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Get a template by ID
   * GET /api/approval/templates/:id
   */
  async getTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const templateId = req.params.id;

      const template = await this.service.getTemplate(tenantId, templateId);

      if (!template) {
        res.status(404).json({
          success: false,
          error: "Template not found",
        } as GetTemplateResponse);
        return;
      }

      res.json({
        success: true,
        template,
      } as GetTemplateResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Get active template by code
   * GET /api/approval/templates/code/:code
   */
  async getActiveTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const code = req.params.code;

      const template = await this.service.getActiveTemplate(tenantId, code);

      if (!template) {
        res.status(404).json({
          success: false,
          error: "Template not found",
        } as GetTemplateResponse);
        return;
      }

      res.json({
        success: true,
        template,
      } as GetTemplateResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * List templates
   * GET /api/approval/templates
   */
  async listTemplates(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const query = req.query as Record<string, string>;

      const options: ApprovalWorkflowQueryOptions = {
        entityType: query.entityType as ApprovalEntityType | undefined,
        enabled: query.enabled ? query.enabled === "true" : undefined,
        activeOnly: query.activeOnly === "true",
        code: query.code,
        searchName: query.searchName,
        includeInactive: query.includeInactive === "true",
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
        sortBy: query.sortBy as any,
        sortDirection: query.sortDirection as "asc" | "desc" | undefined,
      };

      const templates = await this.service.listTemplates(tenantId, options);

      res.json({
        success: true,
        templates,
      } as ListTemplatesResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Delete a template
   * DELETE /api/approval/templates/:id
   */
  async deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const templateId = req.params.id;

      await this.service.deleteTemplate(tenantId, templateId);

      res.json({ success: true });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Publish a template
   * POST /api/approval/templates/:id/publish
   */
  async publishTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const templateId = req.params.id;

      const template = await this.service.publishTemplate(tenantId, templateId, userId);

      res.json({
        success: true,
        template,
      } as PublishTemplateResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Clone a template
   * POST /api/approval/templates/:id/clone
   */
  async cloneTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const templateId = req.params.id;
      const body = req.body as CloneTemplateRequest;

      const template = await this.service.cloneTemplate(
        tenantId,
        templateId,
        body.newCode,
        body.newName,
        userId
      );

      res.status(201).json({
        success: true,
        template,
      } as CloneTemplateResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Validate a template without saving
   * POST /api/approval/templates/validate
   */
  async validateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as ValidateTemplateRequest;

      const validation = this.service.validate(body.template);

      res.json({
        success: true,
        validation,
      } as ValidateTemplateResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Get version history for a template
   * GET /api/approval/templates/code/:code/versions
   */
  async getVersionHistory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const code = req.params.code;

      // This would need to be added to the service interface
      // For now, use list with code filter
      const templates = await this.service.listTemplates(tenantId, {
        code,
        includeInactive: true,
        sortBy: "createdAt",
        sortDirection: "desc",
      });

      res.json({
        success: true,
        templates,
      } as ListTemplatesResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Resolve approvers for a step
   * POST /api/approval/templates/:id/resolve-approvers
   */
  async resolveApprovers(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const templateId = req.params.id;
      const body = req.body as ResolveApproversRequest;

      // Get template
      const template = await this.service.getTemplate(tenantId, templateId);
      if (!template) {
        res.status(404).json({
          success: false,
          error: "Template not found",
        } as ResolveApproversResponse);
        return;
      }

      // Find step
      const step = template.steps.find((s) => s.id === body.stepId);
      if (!step) {
        res.status(404).json({
          success: false,
          error: "Step not found",
        } as ResolveApproversResponse);
        return;
      }

      // Resolve approvers
      const context: ApproverResolutionContext = {
        entity: body.entity,
        requester: body.requester,
        stepId: body.stepId,
        metadata: body.metadata,
      };

      const approvers = await this.service.resolveApprovers(tenantId, step, context);

      res.json({
        success: true,
        approvers,
      } as ResolveApproversResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Find templates for an entity
   * POST /api/approval/templates/find
   */
  async findTemplates(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const body = req.body as FindTemplatesRequest;

      const templates = await this.service.findTemplatesForEntity(
        tenantId,
        body.entityType,
        body.triggerEvent,
        body.entityData
      );

      res.json({
        success: true,
        templates,
      } as FindTemplatesResponse);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getTenantId(req: Request): string {
    // Extract tenant ID from request context
    // This would typically come from auth middleware
    const tenantId = (req as any).tenantId ||
                     req.headers["x-tenant-id"] ||
                     req.query.tenantId;

    if (!tenantId) {
      throw new ApprovalWorkflowError("UNAUTHORIZED", "Tenant ID required");
    }

    return String(tenantId);
  }

  private getUserId(req: Request): string {
    // Extract user ID from request context
    // This would typically come from auth middleware
    const userId = (req as any).userId ||
                   (req as any).user?.id ||
                   req.headers["x-user-id"];

    if (!userId) {
      throw new ApprovalWorkflowError("UNAUTHORIZED", "User ID required");
    }

    return String(userId);
  }

  private handleError(error: unknown, res: Response): void {
    if (error instanceof ApprovalWorkflowError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        VALIDATION_ERROR: 400,
        DUPLICATE_CODE: 409,
        INVALID_UPDATE: 400,
        INVALID_STATE: 400,
        UNAUTHORIZED: 401,
      };

      const status = statusMap[error.code] || 500;

      res.status(status).json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
      });
    } else if (error instanceof Error) {
      console.error("Approval workflow API error:", error);
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
 * Get route definitions for approval workflow API
 */
export function getApprovalWorkflowRoutes(): RouteDefinition[] {
  return [
    {
      method: "get",
      path: "/api/approval/templates",
      handler: "listTemplates",
      description: "List approval workflow templates",
    },
    {
      method: "post",
      path: "/api/approval/templates",
      handler: "createTemplate",
      description: "Create a new approval workflow template",
    },
    {
      method: "post",
      path: "/api/approval/templates/validate",
      handler: "validateTemplate",
      description: "Validate a template without saving",
    },
    {
      method: "post",
      path: "/api/approval/templates/find",
      handler: "findTemplates",
      description: "Find templates matching entity and trigger",
    },
    {
      method: "get",
      path: "/api/approval/templates/:id",
      handler: "getTemplate",
      description: "Get a template by ID",
    },
    {
      method: "put",
      path: "/api/approval/templates/:id",
      handler: "updateTemplate",
      description: "Update a template",
    },
    {
      method: "delete",
      path: "/api/approval/templates/:id",
      handler: "deleteTemplate",
      description: "Delete a template",
    },
    {
      method: "post",
      path: "/api/approval/templates/:id/publish",
      handler: "publishTemplate",
      description: "Publish a template",
    },
    {
      method: "post",
      path: "/api/approval/templates/:id/clone",
      handler: "cloneTemplate",
      description: "Clone a template",
    },
    {
      method: "post",
      path: "/api/approval/templates/:id/resolve-approvers",
      handler: "resolveApprovers",
      description: "Resolve approvers for a step",
    },
    {
      method: "get",
      path: "/api/approval/templates/code/:code",
      handler: "getActiveTemplate",
      description: "Get active template by code",
    },
    {
      method: "get",
      path: "/api/approval/templates/code/:code/versions",
      handler: "getVersionHistory",
      description: "Get version history for a template",
    },
  ];
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create approval workflow API controller
 */
export function createApprovalWorkflowApiController(
  service: IApprovalWorkflowService
): ApprovalWorkflowApiController {
  return new ApprovalWorkflowApiController(service);
}
