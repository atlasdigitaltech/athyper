/**
 * Audit UX Handlers
 *
 * API handlers for end-user and auditor features:
 *   - Explain Event (correlation_id -> full chain)
 *   - Who Saw What (entity access report)
 *   - DSAR (data subject access request)
 */

import type { AuditAccessReportService } from "../../domain/audit-access-report.service.js";
import type { AuditDsarService } from "../../domain/audit-dsar.service.js";
import type { AuditExplainabilityService } from "../../domain/audit-explainability.service.js";

// ============================================================================
// Types
// ============================================================================

export interface UxHandlerDeps {
  explainability: AuditExplainabilityService;
  accessReport: AuditAccessReportService;
  dsar: AuditDsarService;
}

export interface HandlerContext {
  tenantId: string;
  userId: string;
  roles: string[];
}

interface HandlerResult {
  status: number;
  body: unknown;
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /audit/explain/:correlationId
 * Explain an audit event chain. Requires view_tenant_events.
 */
export class ExplainEventHandler {
  constructor(private readonly deps: UxHandlerDeps) {}

  async handle(
    context: HandlerContext,
    params: { correlationId: string },
  ): Promise<HandlerResult> {
    if (
      !context.roles.includes("view_tenant_events") &&
      !context.roles.includes("security_admin")
    ) {
      return {
        status: 403,
        body: { error: "Forbidden: requires view_tenant_events role" },
      };
    }

    if (!params.correlationId) {
      return { status: 400, body: { error: "correlationId is required" } };
    }

    const explanation = await this.deps.explainability.explain(
      context.tenantId,
      params.correlationId,
    );

    return { status: 200, body: explanation };
  }
}

/**
 * GET /audit/access-report/:entityType/:entityId
 * Who saw what for an entity. Requires security_admin.
 */
export class WhoSawWhatHandler {
  constructor(private readonly deps: UxHandlerDeps) {}

  async handle(
    context: HandlerContext,
    params: { entityType: string; entityId: string },
    query?: { startDate?: string; endDate?: string; limit?: number },
  ): Promise<HandlerResult> {
    if (!context.roles.includes("security_admin")) {
      return {
        status: 403,
        body: { error: "Forbidden: requires security_admin role" },
      };
    }

    if (!params.entityType || !params.entityId) {
      return {
        status: 400,
        body: { error: "entityType and entityId are required" },
      };
    }

    const report = await this.deps.accessReport.generateWhoSawWhat(
      context.tenantId,
      params.entityType,
      params.entityId,
      {
        startDate: query?.startDate ? new Date(query.startDate) : undefined,
        endDate: query?.endDate ? new Date(query.endDate) : undefined,
        limit: query?.limit,
      },
    );

    return { status: 200, body: report };
  }
}

/**
 * GET /audit/dsar/:subjectUserId
 * Data subject access request. Requires security_admin.
 */
export class DsarHandler {
  constructor(private readonly deps: UxHandlerDeps) {}

  async handle(
    context: HandlerContext,
    params: { subjectUserId: string },
  ): Promise<HandlerResult> {
    if (!context.roles.includes("security_admin")) {
      return {
        status: 403,
        body: { error: "Forbidden: requires security_admin role" },
      };
    }

    if (!params.subjectUserId) {
      return { status: 400, body: { error: "subjectUserId is required" } };
    }

    const result = await this.deps.dsar.generateDataSubjectReport(
      context.tenantId,
      params.subjectUserId,
    );

    return { status: 200, body: result };
  }
}
