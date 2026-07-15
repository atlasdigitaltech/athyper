import "server-only";

import { recordDocumentEditOpenMetric } from "@/lib/server/document-open-rollout-guard";

export type DocumentEditMetricTransport = "workspace_submit";

export interface DocumentEditMetric {
  event:
    | "save"
    | "workspace_open"
    | "workspace_projection"
    | "workspace_compatibility_fetch"
    | "workspace_projection_validation"
    | "workspace_section"
    | "workspace_validation"
    | "draft_recovery"
    | "draft_discard"
    | "workflow_compensation";
  entityCode: string;
  tenantId?: string;
  transportMode?: DocumentEditMetricTransport;
  outcome: string;
  statusCode?: number;
  durationMs?: number;
  reason?: string;
  idempotencyReplay?: boolean;
}

/** Structured, token-free lifecycle metric emitted by server routes. */
export function recordDocumentEditMetric(metric: DocumentEditMetric): void {
  console.info("[document-edit/metric]", {
    ...metric,
    ...(typeof metric.durationMs === "number"
      ? { durationMs: Math.max(0, Math.round(metric.durationMs)) }
      : {}),
  });
  recordDocumentEditOpenMetric(metric);
}

export function documentEditMetricTenant(context: {
  session: {
    activeOrg?: string | null;
    organizations?: Record<string, { tenantId?: string }>;
  };
}): string | undefined {
  const activeOrg = context.session.activeOrg;
  return activeOrg ? context.session.organizations?.[activeOrg]?.tenantId : undefined;
}
