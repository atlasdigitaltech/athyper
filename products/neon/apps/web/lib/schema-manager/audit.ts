import "server-only";

import { createHash } from "node:crypto";

// ─── Mesh Audit Event Types ──────────────────────────────────
//
// Following the exact pattern from @neon/auth/audit.
// The BFF writes records to a Redis LIST for lightweight recording.
// A background worker can drain the list into PostgreSQL for long-term storage.

export const MeshAuditEvent = {
    // Entity lifecycle
    ENTITY_CREATED: "mesh.entity_created",
    ENTITY_UPDATED: "mesh.entity_updated",
    ENTITY_DELETED: "mesh.entity_deleted",
    // Field operations
    FIELD_ADDED: "mesh.field_added",
    FIELD_UPDATED: "mesh.field_updated",
    FIELD_DELETED: "mesh.field_deleted",
    FIELD_REORDERED: "mesh.field_reordered",
    // Relation operations
    RELATION_ADDED: "mesh.relation_added",
    RELATION_DELETED: "mesh.relation_deleted",
    // Index operations
    INDEX_ADDED: "mesh.index_added",
    INDEX_DELETED: "mesh.index_deleted",
    // Policy operations
    POLICY_UPDATED: "mesh.policy_updated",
    // Overlay operations
    OVERLAY_SAVED: "mesh.overlay_saved",
    // Version lifecycle
    VERSION_CREATED: "mesh.version_created",
    VERSION_PUBLISHED: "mesh.version_published",
    VERSION_DEPRECATED: "mesh.version_deprecated",
    // Schema compilation
    SCHEMA_COMPILED: "mesh.schema_compiled",
} as const;

export type MeshAuditEventType = (typeof MeshAuditEvent)[keyof typeof MeshAuditEvent];

// ─── Audit Record ─────────────────────────────────────────────

export interface MeshAuditRecord {
    ts: string;
    event: MeshAuditEventType;
    tenantId: string;
    sidHash?: string;
    entityName: string;
    entityId?: string;
    versionId?: string;
    correlationId?: string;
    before?: unknown;
    after?: unknown;
    meta?: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Hash a session ID for audit logging.
 * Logs only a prefix of the hash — enough for correlation, not enough to replay.
 */
export function hashSidForAudit(sid: string): string {
    return createHash("sha256").update(sid).digest("hex").slice(0, 16);
}
