// lib/semantic-colors.ts
//
// Maps domain concepts to theme-aware semantic color tokens.
// All colors resolve through CSS custom properties, so they
// automatically adapt to the active theme preset and mode.
//
// Usage: import the relevant record and use the value as Tailwind classes.
//   import { KIND_BADGE } from "@/lib/semantic-colors";
//   <Badge className={KIND_BADGE[kind]} />

// ─── Entity Kind ─────────────────────────────────────────────

export const KIND_BORDER: Record<string, string> = {
    ref: "border-l-categorical-1",
    ent: "border-l-categorical-2",
    doc: "border-l-categorical-3",
};

export const KIND_BADGE: Record<string, string> = {
    ref: "border-categorical-1 text-categorical-1",
    ent: "border-categorical-2 text-categorical-2",
    doc: "border-categorical-3 text-categorical-3",
};

// ─── Policy Scope ────────────────────────────────────────────

export const SCOPE_BORDER: Record<string, string> = {
    global: "border-l-categorical-4",
    module: "border-l-categorical-1",
    entity: "border-l-categorical-2",
    entity_version: "border-l-categorical-3",
};

// ─── Integration Endpoint Type ───────────────────────────────

export const ENDPOINT_TYPE_BORDER: Record<string, string> = {
    rest_api: "border-l-categorical-1",
    graphql: "border-l-categorical-5",
    soap: "border-l-categorical-3",
    webhook: "border-l-categorical-2",
};

export const ENDPOINT_TYPE_BADGE: Record<string, string> = {
    rest_api: "bg-categorical-1/15 text-categorical-1",
    graphql: "bg-categorical-5/15 text-categorical-5",
    soap: "bg-categorical-3/15 text-categorical-3",
    webhook: "bg-categorical-2/15 text-categorical-2",
};

// ─── Publishable Item Type ───────────────────────────────────

export const ITEM_TYPE_BADGE: Record<string, string> = {
    module: "bg-categorical-1/15 text-categorical-1",
    app: "bg-categorical-4/15 text-categorical-4",
    entity_template: "bg-categorical-5/15 text-categorical-5",
    workflow_template: "bg-categorical-3/15 text-categorical-3",
};

// ─── Status (draft/published/archived) ───────────────────────

export const STATUS_DOT: Record<string, string> = {
    draft: "bg-warning",
    published: "bg-success",
    archived: "bg-muted-foreground/40",
};

// ─── Severity ────────────────────────────────────────────────

export const SEVERITY_BORDER: Record<string, string> = {
    info: "border-l-info",
    warning: "border-l-warning",
    error: "border-l-destructive",
    critical: "border-l-destructive",
};

// ─── Sync Status ─────────────────────────────────────────────

export const SYNC_DOT: Record<string, string> = {
    success: "bg-success",
    failure: "bg-destructive",
    partial: "bg-warning",
};

// ─── Health / KPI Variant ────────────────────────────────────

export const KPI_CARD: Record<string, string> = {
    default: "border-border hover:border-primary/30",
    warning: "border-warning bg-warning/10",
    critical: "border-destructive bg-destructive/10",
};

export const KPI_VALUE: Record<string, string> = {
    default: "text-foreground",
    warning: "text-warning",
    critical: "text-destructive",
};

// ─── Summary Card (border-l-4 status) ────────────────────────

export const SUMMARY_BORDER: Record<string, string> = {
    healthy: "border-success/40",
    warning: "border-warning/40",
    critical: "border-destructive/40",
};

export const SUMMARY_VALUE: Record<string, string> = {
    healthy: "text-success",
    warning: "text-warning",
    critical: "text-destructive",
};

// ─── Publishing Status Badge ─────────────────────────────────

export const PUBLISHING_STATUS_BADGE: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    validating: "bg-info/15 text-info",
    ready: "bg-success/15 text-success",
    published: "bg-categorical-4/15 text-categorical-4",
    rejected: "bg-destructive/15 text-destructive",
};

// ─── Circuit Breaker ─────────────────────────────────────────

export const CIRCUIT_BREAKER_BADGE: Record<string, string> = {
    CLOSED: "border-success text-success",
    OPEN: "border-destructive text-destructive",
    HALF_OPEN: "border-warning text-warning",
};

// ─── Active/Enabled Status ───────────────────────────────────

export const ACTIVE_BADGE = "border-success text-success";
export const ENABLED_BADGE = "border-success text-success";

// ─── Readiness Score ─────────────────────────────────────────

export function readinessScoreClasses(score: number): { text: string; bg: string } {
    if (score >= 90) return { text: "text-success", bg: "bg-success/10" };
    if (score >= 70) return { text: "text-warning", bg: "bg-warning/10" };
    return { text: "text-destructive", bg: "bg-destructive/10" };
}

// ─── Percent Bar ─────────────────────────────────────────────

export function percentBarColor(value: number): string {
    if (value >= 80) return "bg-success";
    if (value >= 50) return "bg-warning";
    return "bg-destructive";
}

// ─── Health Indicator ────────────────────────────────────────

export function healthIndicatorColor(
    value: number,
    warningThreshold: number,
    criticalThreshold: number,
): string {
    if (value >= criticalThreshold) return "text-destructive";
    if (value >= warningThreshold) return "text-warning";
    return "text-success";
}

// ─── Check Status Icon Color ─────────────────────────────────

export const CHECK_STATUS_COLOR: Record<string, string> = {
    passed: "text-success",
    failed: "text-destructive",
    warning: "text-warning",
    pending: "text-muted-foreground",
};

// ─── Field Attribute Badge ──────────────────────────────────

export const FIELD_ATTR_BADGE: Record<string, string> = {
    required: "text-destructive border-destructive/40",
    unique: "text-categorical-4 border-categorical-4/40",
    searchable: "text-categorical-1 border-categorical-1/40",
    filterable: "text-categorical-2 border-categorical-2/40",
    immutable: "text-muted-foreground border-muted-foreground/40",
};

// ─── Version Status Banner ──────────────────────────────────

export const STATUS_BANNER: Record<string, string> = {
    draft: "border-success/40 bg-success/5 text-success",
    published: "border-warning/40 bg-warning/5 text-warning",
    archived: "border-muted-foreground/40 bg-muted text-muted-foreground",
};

// ─── Relation Type Badge ────────────────────────────────────

export const RELATION_TYPE_BADGE: Record<string, string> = {
    belongs_to: "text-categorical-1 border-categorical-1/40",
    has_many: "text-categorical-2 border-categorical-2/40",
    m2m: "text-categorical-4 border-categorical-4/40",
};

// ─── Diff Change Type ───────────────────────────────────────

export const DIFF_ICON_COLOR: Record<string, string> = {
    added: "text-success",
    removed: "text-destructive",
    modified: "text-warning",
    renamed: "text-warning",
    type_changed: "text-warning",
};

// ─── Subject / Actor Type Badge ─────────────────────────────

export const SUBJECT_TYPE_BADGE: Record<string, string> = {
    kc_role: "bg-categorical-1/15 text-categorical-1",
    kc_group: "bg-categorical-4/15 text-categorical-4",
    user: "bg-categorical-2/15 text-categorical-2",
    service: "bg-warning/15 text-warning",
};

// ─── Policy Effect Badge ────────────────────────────────────

export const EFFECT_BADGE: Record<string, string> = {
    allow: "border-success text-success",
    deny: "border-destructive text-destructive",
};
