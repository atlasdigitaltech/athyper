// lib/schema-manager/change-request.ts
//
// Change request model for enterprise governance.
// Wraps schema changes in an approval workflow before they go live.

// ─── Types ───────────────────────────────────────────────────

export type ChangeRequestStatus = "draft" | "pending_review" | "approved" | "rejected" | "applied";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ChangeRequest {
    id: string;
    entityName: string;
    versionId: string;
    title: string;
    rationale: string;
    riskLevel: RiskLevel;
    status: ChangeRequestStatus;
    author: string;
    authorSidHash: string;
    createdAt: string;
    updatedAt: string;
    reviewedBy?: string;
    reviewedAt?: string;
    reviewComment?: string;
    appliedAt?: string;
    changes: ChangeRequestChange[];
    diagnostics: ChangeRequestDiagnostic[];
}

export interface ChangeRequestChange {
    type: "field_added" | "field_modified" | "field_removed" | "relation_added" | "relation_removed" | "index_added" | "index_removed" | "policy_updated";
    target: string;
    description: string;
    breaking: boolean;
    before?: unknown;
    after?: unknown;
}

export interface ChangeRequestDiagnostic {
    level: "info" | "warning" | "error";
    code: string;
    message: string;
}

// ─── Risk Assessment ─────────────────────────────────────────

export function assessRiskLevel(changes: ChangeRequestChange[]): RiskLevel {
    const breakingCount = changes.filter((c) => c.breaking).length;
    const hasRemovals = changes.some((c) => c.type.endsWith("_removed"));
    const totalChanges = changes.length;

    if (breakingCount > 3 || (hasRemovals && breakingCount > 0)) return "critical";
    if (breakingCount > 0 || hasRemovals) return "high";
    if (totalChanges > 5) return "medium";
    return "low";
}

// ─── Status Transitions ──────────────────────────────────────

const VALID_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
    draft: ["pending_review"],
    pending_review: ["approved", "rejected", "draft"],
    approved: ["applied", "draft"],
    rejected: ["draft"],
    applied: [],
};

export function canTransition(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Labels ──────────────────────────────────────────────────

export const STATUS_LABELS: Record<ChangeRequestStatus, { label: string; color: string }> = {
    draft: { label: "Draft", color: "text-muted-foreground" },
    pending_review: { label: "Pending Review", color: "text-warning" },
    approved: { label: "Approved", color: "text-success" },
    rejected: { label: "Rejected", color: "text-destructive" },
    applied: { label: "Applied", color: "text-info" },
};

export const RISK_LABELS: Record<RiskLevel, { label: string; color: string }> = {
    low: { label: "Low", color: "text-success" },
    medium: { label: "Medium", color: "text-warning" },
    high: { label: "High", color: "text-destructive" },
    critical: { label: "Critical", color: "text-destructive" },
};
