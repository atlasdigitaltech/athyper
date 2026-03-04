/**
 * Audit Integrity Verification Handlers
 *
 * API handlers for triggering and viewing integrity verification reports.
 * Requires security_admin role.
 */

import type { AuditIntegrityService } from "../../domain/audit-integrity.service.js";

// ============================================================================
// Types
// ============================================================================

export interface IntegrityHandlerDeps {
  integrityService: AuditIntegrityService;
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
 * POST /audit/integrity/verify-range
 * Trigger a range verification for a tenant's audit data.
 */
export class TriggerIntegrityVerificationHandler {
  constructor(private readonly deps: IntegrityHandlerDeps) {}

  async handle(
    context: HandlerContext,
    body: { startDate: string; endDate: string },
  ): Promise<HandlerResult> {
    if (!context.roles.includes("security_admin")) {
      return { status: 403, body: { error: "Forbidden: requires security_admin role" } };
    }

    if (!body.startDate || !body.endDate) {
      return { status: 400, body: { error: "startDate and endDate are required" } };
    }

    const report = await this.deps.integrityService.verifyTenantRange({
      tenantId: context.tenantId,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      initiatedBy: context.userId,
    });

    return { status: 200, body: report };
  }
}

/**
 * POST /audit/integrity/verify-export
 * Trigger an export verification.
 */
export class TriggerExportVerificationHandler {
  constructor(private readonly deps: IntegrityHandlerDeps) {}

  async handle(
    context: HandlerContext,
    body: { manifestKey: string },
  ): Promise<HandlerResult> {
    if (!context.roles.includes("security_admin")) {
      return { status: 403, body: { error: "Forbidden: requires security_admin role" } };
    }

    if (!body.manifestKey) {
      return { status: 400, body: { error: "manifestKey is required" } };
    }

    const report = await this.deps.integrityService.verifyExport({
      tenantId: context.tenantId,
      manifestKey: body.manifestKey,
      initiatedBy: context.userId,
    });

    return { status: 200, body: report };
  }
}

/**
 * GET /audit/integrity/reports
 * List past integrity reports for a tenant.
 */
export class ListIntegrityReportsHandler {
  constructor(private readonly deps: IntegrityHandlerDeps) {}

  async handle(
    context: HandlerContext,
    query: { limit?: number },
  ): Promise<HandlerResult> {
    if (!context.roles.includes("security_admin")) {
      return { status: 403, body: { error: "Forbidden: requires security_admin role" } };
    }

    const reports = await this.deps.integrityService.listReports(
      context.tenantId,
      query.limit ?? 25,
    );

    return { status: 200, body: reports };
  }
}

/**
 * GET /audit/integrity/reports/:id
 * Get a specific integrity report.
 */
export class GetIntegrityReportHandler {
  constructor(private readonly deps: IntegrityHandlerDeps) {}

  async handle(
    context: HandlerContext,
    params: { id: string },
  ): Promise<HandlerResult> {
    if (!context.roles.includes("security_admin")) {
      return { status: 403, body: { error: "Forbidden: requires security_admin role" } };
    }

    const report = await this.deps.integrityService.getReport(
      context.tenantId,
      params.id,
    );

    if (!report) {
      return { status: 404, body: { error: "Report not found" } };
    }

    return { status: 200, body: report };
  }
}
