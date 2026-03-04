/**
 * Approval Governance API
 *
 * HTTP API endpoints for audit, recovery, admin actions,
 * and version control functionality.
 */

import type { IAdminActionsService, RestartOptions } from "./admin/types.js";
import type { IAuditTrailService, IComplianceReportingService } from "./audit/types.js";
import type { IErrorDetectionService, IRecoveryService } from "./recovery/types.js";
import type { IVersionControlService } from "./version/types.js";
import type { Request, Response } from "express";

// ============================================================================
// Request/Response Types - Audit
// ============================================================================

export interface GetAuditTrailRequest {
  instanceId: string;
}

export interface GetAuditTrailResponse {
  success: boolean;
  auditTrail?: any;
  error?: string;
}

export interface ExportAuditTrailRequest {
  instanceId: string;
  format?: "json" | "csv" | "text";
}

export interface ExportAuditTrailResponse {
  success: boolean;
  data?: string;
  contentType?: string;
  error?: string;
}

export interface GetComplianceReportRequest {
  reportType: "cycle_duration" | "sla_breach" | "escalation" | "approver_workload" | "summary";
  startDate?: string;
  endDate?: string;
  templateId?: string;
}

export interface GetComplianceReportResponse {
  success: boolean;
  report?: any;
  error?: string;
}

// ============================================================================
// Request/Response Types - Recovery
// ============================================================================

export interface GetWorkflowHealthRequest {
  instanceId: string;
}

export interface GetWorkflowHealthResponse {
  success: boolean;
  health?: any;
  error?: string;
}

export interface GetActiveErrorsResponse {
  success: boolean;
  errors?: any[];
  error?: string;
}

export interface ExecuteRecoveryActionRequest {
  errorId: string;
  action: {
    type: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ExecuteRecoveryActionResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface PauseWorkflowRequest {
  instanceId: string;
  reason: string;
  message: string;
}

export interface PauseWorkflowResponse {
  success: boolean;
  pause?: any;
  error?: string;
}

export interface ResumeWorkflowRequest {
  instanceId: string;
}

export interface ResumeWorkflowResponse {
  success: boolean;
  instance?: any;
  error?: string;
}

// ============================================================================
// Request/Response Types - Admin Actions
// ============================================================================

export interface ForceApproveRequest {
  instanceId: string;
  stepInstanceId: string;
  reason: string;
}

export interface ForceApproveResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface ForceRejectRequest {
  instanceId: string;
  stepInstanceId: string;
  reason: string;
}

export interface ForceRejectResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface ReassignApproversRequest {
  instanceId: string;
  stepInstanceId: string;
  newApprovers: Array<{ userId: string; name: string; email: string }>;
  reason: string;
}

export interface ReassignApproversResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface SkipStepRequest {
  instanceId: string;
  stepInstanceId: string;
  reason: string;
}

export interface SkipStepResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface CancelWorkflowRequest {
  instanceId: string;
  reason: string;
}

export interface CancelWorkflowResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface RestartFromStepRequest {
  instanceId: string;
  fromStepId: string;
  resetCompletedSteps?: boolean;
  preserveComments?: boolean;
  preserveAttachments?: boolean;
  notifyApprovers?: boolean;
  reason: string;
}

export interface RestartFromStepResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface ModifyDeadlineRequest {
  instanceId: string;
  stepInstanceId: string;
  newDeadline: string;
  reason: string;
}

export interface ModifyDeadlineResponse {
  success: boolean;
  result?: any;
  error?: string;
}

// ============================================================================
// Request/Response Types - Version Control
// ============================================================================

export interface CreateVersionRequest {
  templateId: string;
  definition: any;
  metadata: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
  };
  changeDescription?: string;
}

export interface CreateVersionResponse {
  success: boolean;
  version?: any;
  error?: string;
}

export interface PublishVersionRequest {
  versionId: string;
}

export interface PublishVersionResponse {
  success: boolean;
  version?: any;
  error?: string;
}

export interface DeprecateVersionRequest {
  versionId: string;
  reason: string;
}

export interface DeprecateVersionResponse {
  success: boolean;
  version?: any;
  error?: string;
}

export interface GetVersionHistoryRequest {
  templateId: string;
}

export interface GetVersionHistoryResponse {
  success: boolean;
  versions?: any[];
  error?: string;
}

export interface CompareVersionsRequest {
  fromVersionId: string;
  toVersionId: string;
}

export interface CompareVersionsResponse {
  success: boolean;
  comparison?: any;
  error?: string;
}

export interface AnalyzeImpactRequest {
  versionId: string;
}

export interface AnalyzeImpactResponse {
  success: boolean;
  analysis?: any;
  error?: string;
}

// ============================================================================
// Route Definition
// ============================================================================

export interface RouteDefinition {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  handler: string;
  description: string;
}

// ============================================================================
// Controller
// ============================================================================

/**
 * Governance API Controller
 */
export class GovernanceApiController {
  constructor(
    private readonly auditService: IAuditTrailService,
    private readonly complianceService: IComplianceReportingService,
    private readonly errorDetectionService: IErrorDetectionService,
    private readonly recoveryService: IRecoveryService,
    private readonly adminService: IAdminActionsService,
    private readonly versionService: IVersionControlService,
    private readonly getTenantId: (req: Request) => string,
    private readonly getUserId: (req: Request) => string
  ) {}

  // --------------------------------------------------------------------------
  // Audit Endpoints
  // --------------------------------------------------------------------------

  async getAuditTrail(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { instanceId } = req.params;

      const auditTrail = await this.auditService.getAuditTrail(tenantId, instanceId);

      res.json({ success: true, auditTrail } as GetAuditTrailResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as GetAuditTrailResponse);
    }
  }

  async exportAuditTrail(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { instanceId } = req.params;
      const format = (req.query.format as "json" | "csv" | "pdf") || "json";

      const data = await this.auditService.exportAuditTrail(tenantId, instanceId, format);

      const contentTypes = {
        json: "application/json",
        csv: "text/csv",
        pdf: "application/pdf",
      };

      res.setHeader("Content-Type", contentTypes[format]);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-trail-${instanceId}.${format}"`
      );
      res.send(data);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as ExportAuditTrailResponse);
    }
  }

  async getComplianceReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { reportType } = req.params;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();
      const templateId = req.query.templateId as string | undefined;

      let report: any;

      const period = { startDate, endDate };

      switch (reportType) {
        case "cycle_duration":
          report = await this.complianceService.generateCycleDurationReport({
            tenantId,
            period,
            templateCodes: templateId ? [templateId] : undefined,
          });
          break;
        case "sla_breach":
          report = await this.complianceService.generateSlaBreachReport({
            tenantId,
            period,
            templateCodes: templateId ? [templateId] : undefined,
          });
          break;
        case "escalation":
          report = await this.complianceService.generateEscalationReport({
            tenantId,
            period,
            templateCodes: templateId ? [templateId] : undefined,
          });
          break;
        case "approver_workload":
          report = await this.complianceService.generateApproverWorkloadReport({
            tenantId,
            period,
          });
          break;
        case "summary":
          report = await this.complianceService.generateComplianceSummary({
            tenantId,
            period,
          });
          break;
        default:
          res.status(400).json({
            success: false,
            error: `Unknown report type: ${reportType}`,
          } as GetComplianceReportResponse);
          return;
      }

      res.json({ success: true, report } as GetComplianceReportResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as GetComplianceReportResponse);
    }
  }

  // --------------------------------------------------------------------------
  // Recovery Endpoints
  // --------------------------------------------------------------------------

  async getWorkflowHealth(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { instanceId } = req.params;

      const health = await this.errorDetectionService.checkInstanceHealth(tenantId, instanceId);

      res.json({ success: true, health } as GetWorkflowHealthResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as GetWorkflowHealthResponse);
    }
  }

  async executeRecoveryAction(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { errorId, action } = req.body as ExecuteRecoveryActionRequest;

      const result = await this.recoveryService.executeRecoveryAction(
        tenantId,
        errorId,
        {
          type: action.type as any,
          description: "",
          parameters: action.parameters,
          requiresConfirmation: false,
        },
        userId
      );

      res.json({ success: result.success, result } as ExecuteRecoveryActionResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as ExecuteRecoveryActionResponse);
    }
  }

  async pauseWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { instanceId, reason: _reason, message } = req.body as PauseWorkflowRequest;

      const pause = await this.recoveryService.pauseWorkflow(
        tenantId,
        instanceId,
        "admin_request",
        message,
        userId
      );

      res.json({ success: true, pause } as PauseWorkflowResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as PauseWorkflowResponse);
    }
  }

  async resumeWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { instanceId } = req.body as ResumeWorkflowRequest;

      const instance = await this.recoveryService.resumeWorkflow(tenantId, instanceId, userId);

      res.json({ success: true, instance } as ResumeWorkflowResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as ResumeWorkflowResponse);
    }
  }

  // --------------------------------------------------------------------------
  // Admin Action Endpoints
  // --------------------------------------------------------------------------

  async forceApprove(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { instanceId, stepInstanceId, reason } = req.body as ForceApproveRequest;

      const result = await this.adminService.forceApprove(
        tenantId,
        instanceId,
        stepInstanceId,
        userId,
        reason
      );

      res.json({ success: result.success, result } as ForceApproveResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as ForceApproveResponse);
    }
  }

  async forceReject(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { instanceId, stepInstanceId, reason } = req.body as ForceRejectRequest;

      const result = await this.adminService.forceReject(
        tenantId,
        instanceId,
        stepInstanceId,
        userId,
        reason
      );

      res.json({ success: result.success, result } as ForceRejectResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as ForceRejectResponse);
    }
  }

  async reassignApprovers(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { instanceId, stepInstanceId, newApprovers, reason } =
        req.body as ReassignApproversRequest;

      const result = await this.adminService.reassignApprovers(
        tenantId,
        instanceId,
        stepInstanceId,
        newApprovers,
        userId,
        reason
      );

      res.json({ success: result.success, result } as ReassignApproversResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as ReassignApproversResponse);
    }
  }

  async skipStep(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { instanceId, stepInstanceId, reason } = req.body as SkipStepRequest;

      const result = await this.adminService.skipStep(
        tenantId,
        instanceId,
        stepInstanceId,
        userId,
        reason
      );

      res.json({ success: result.success, result } as SkipStepResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as SkipStepResponse);
    }
  }

  async cancelWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { instanceId, reason } = req.body as CancelWorkflowRequest;

      const result = await this.adminService.cancelWorkflow(
        tenantId,
        instanceId,
        userId,
        reason
      );

      res.json({ success: result.success, result } as CancelWorkflowResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as CancelWorkflowResponse);
    }
  }

  async restartFromStep(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const body = req.body as RestartFromStepRequest;

      const options: RestartOptions = {
        fromStepId: body.fromStepId,
        resetCompletedSteps: body.resetCompletedSteps ?? true,
        preserveComments: body.preserveComments ?? true,
        preserveAttachments: body.preserveAttachments ?? true,
        notifyApprovers: body.notifyApprovers ?? true,
        reason: body.reason,
      };

      const result = await this.adminService.restartFromStep(
        tenantId,
        body.instanceId,
        options,
        userId
      );

      res.json({ success: result.success, result } as RestartFromStepResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as RestartFromStepResponse);
    }
  }

  async modifyDeadline(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { instanceId, stepInstanceId, newDeadline, reason } =
        req.body as ModifyDeadlineRequest;

      const result = await this.adminService.modifyDeadline(
        tenantId,
        instanceId,
        stepInstanceId,
        new Date(newDeadline),
        userId,
        reason
      );

      res.json({ success: result.success, result } as ModifyDeadlineResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as ModifyDeadlineResponse);
    }
  }

  async getAdminActionHistory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { instanceId } = req.params;

      const history = await this.adminService.getActionHistory(tenantId, instanceId);

      res.json({ success: true, history });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // --------------------------------------------------------------------------
  // Version Control Endpoints
  // --------------------------------------------------------------------------

  async createVersion(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { templateId, definition, metadata, changeDescription } =
        req.body as CreateVersionRequest;

      const version = await this.versionService.createVersion(
        tenantId,
        templateId,
        definition,
        metadata,
        userId,
        changeDescription
      );

      res.json({ success: true, version } as CreateVersionResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as CreateVersionResponse);
    }
  }

  async publishVersion(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { versionId } = req.body as PublishVersionRequest;

      const version = await this.versionService.publishVersion(tenantId, versionId, userId);

      res.json({ success: true, version } as PublishVersionResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as PublishVersionResponse);
    }
  }

  async deprecateVersion(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { versionId, reason } = req.body as DeprecateVersionRequest;

      const version = await this.versionService.deprecateVersion(
        tenantId,
        versionId,
        userId,
        reason
      );

      res.json({ success: true, version } as DeprecateVersionResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as DeprecateVersionResponse);
    }
  }

  async getVersionHistory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { templateId } = req.params;

      const versions = await this.versionService.getVersionHistory(tenantId, templateId);

      res.json({ success: true, versions } as GetVersionHistoryResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as GetVersionHistoryResponse);
    }
  }

  async compareVersions(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { fromVersionId, toVersionId } = req.query as unknown as CompareVersionsRequest;

      const comparison = await this.versionService.compareVersions(
        tenantId,
        fromVersionId,
        toVersionId
      );

      res.json({ success: true, comparison } as CompareVersionsResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as CompareVersionsResponse);
    }
  }

  async analyzeImpact(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { versionId } = req.params;

      const analysis = await this.versionService.analyzeImpact(tenantId, versionId);

      res.json({ success: true, analysis } as AnalyzeImpactResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as AnalyzeImpactResponse);
    }
  }

  async getActiveVersion(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { templateId } = req.params;

      const version = await this.versionService.getActiveVersion(tenantId, templateId);

      res.json({ success: true, version });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async cloneVersion(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const userId = this.getUserId(req);
      const { versionId } = req.params;

      const version = await this.versionService.cloneVersion(tenantId, versionId, userId);

      res.json({ success: true, version });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async validateVersion(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const { definition } = req.body;

      const validation = await this.versionService.validateVersion(tenantId, definition);

      res.json({ success: true, validation });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

// ============================================================================
// Route Definitions
// ============================================================================

export function getGovernanceRoutes(): RouteDefinition[] {
  return [
    // Audit routes
    {
      method: "get",
      path: "/audit/:instanceId",
      handler: "getAuditTrail",
      description: "Get audit trail for an instance",
    },
    {
      method: "get",
      path: "/audit/:instanceId/export",
      handler: "exportAuditTrail",
      description: "Export audit trail in various formats",
    },
    {
      method: "get",
      path: "/compliance/:reportType",
      handler: "getComplianceReport",
      description: "Get compliance report",
    },

    // Recovery routes
    {
      method: "get",
      path: "/health/:instanceId",
      handler: "getWorkflowHealth",
      description: "Check workflow health",
    },
    {
      method: "post",
      path: "/recovery/execute",
      handler: "executeRecoveryAction",
      description: "Execute a recovery action",
    },
    {
      method: "post",
      path: "/pause",
      handler: "pauseWorkflow",
      description: "Pause a workflow",
    },
    {
      method: "post",
      path: "/resume",
      handler: "resumeWorkflow",
      description: "Resume a paused workflow",
    },

    // Admin action routes
    {
      method: "post",
      path: "/admin/force-approve",
      handler: "forceApprove",
      description: "Force approve a step",
    },
    {
      method: "post",
      path: "/admin/force-reject",
      handler: "forceReject",
      description: "Force reject a step",
    },
    {
      method: "post",
      path: "/admin/reassign",
      handler: "reassignApprovers",
      description: "Reassign approvers",
    },
    {
      method: "post",
      path: "/admin/skip-step",
      handler: "skipStep",
      description: "Skip a step",
    },
    {
      method: "post",
      path: "/admin/cancel",
      handler: "cancelWorkflow",
      description: "Cancel a workflow",
    },
    {
      method: "post",
      path: "/admin/restart",
      handler: "restartFromStep",
      description: "Restart workflow from a step",
    },
    {
      method: "post",
      path: "/admin/modify-deadline",
      handler: "modifyDeadline",
      description: "Modify step deadline",
    },
    {
      method: "get",
      path: "/admin/history/:instanceId",
      handler: "getAdminActionHistory",
      description: "Get admin action history",
    },

    // Version control routes
    {
      method: "post",
      path: "/versions",
      handler: "createVersion",
      description: "Create a new version",
    },
    {
      method: "post",
      path: "/versions/publish",
      handler: "publishVersion",
      description: "Publish a version",
    },
    {
      method: "post",
      path: "/versions/deprecate",
      handler: "deprecateVersion",
      description: "Deprecate a version",
    },
    {
      method: "get",
      path: "/versions/template/:templateId",
      handler: "getVersionHistory",
      description: "Get version history for a template",
    },
    {
      method: "get",
      path: "/versions/compare",
      handler: "compareVersions",
      description: "Compare two versions",
    },
    {
      method: "get",
      path: "/versions/:versionId/impact",
      handler: "analyzeImpact",
      description: "Analyze impact of activating a version",
    },
    {
      method: "get",
      path: "/versions/active/:templateId",
      handler: "getActiveVersion",
      description: "Get active version for a template",
    },
    {
      method: "post",
      path: "/versions/:versionId/clone",
      handler: "cloneVersion",
      description: "Clone a version",
    },
    {
      method: "post",
      path: "/versions/validate",
      handler: "validateVersion",
      description: "Validate a version definition",
    },
  ];
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGovernanceApiController(
  auditService: IAuditTrailService,
  complianceService: IComplianceReportingService,
  errorDetectionService: IErrorDetectionService,
  recoveryService: IRecoveryService,
  adminService: IAdminActionsService,
  versionService: IVersionControlService,
  getTenantId: (req: Request) => string,
  getUserId: (req: Request) => string
): GovernanceApiController {
  return new GovernanceApiController(
    auditService,
    complianceService,
    errorDetectionService,
    recoveryService,
    adminService,
    versionService,
    getTenantId,
    getUserId
  );
}
