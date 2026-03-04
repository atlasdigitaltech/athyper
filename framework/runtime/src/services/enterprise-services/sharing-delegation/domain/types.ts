/**
 * Sharing & Delegation — Domain Types
 *
 * Core type definitions for delegation grants, record sharing,
 * share audit events, and cross-tenant tokens.
 */

// ============================================================================
// Delegation
// ============================================================================

export type DelegationScopeType = "task" | "entity" | "workflow" | "module";

export interface DelegationGrant {
    id: string;
    tenantId: string;
    delegatorId: string;
    delegateId: string;
    scopeType: DelegationScopeType;
    scopeRef?: string;
    permissions: string[];
    reason?: string;
    expiresAt?: Date;
    isRevoked: boolean;
    revokedAt?: Date;
    revokedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateDelegationInput {
    tenantId: string;
    delegatorId: string;
    delegateId: string;
    scopeType: DelegationScopeType;
    scopeRef?: string;
    permissions: string[];
    reason?: string;
    expiresAt?: Date;
}

export type DelegationRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface DelegationRequest {
    id: string;
    tenantId: string;
    requesterId: string;
    targetId: string;
    scopeType: string;
    scopeRef?: string;
    permissions: string[];
    reason?: string;
    status: DelegationRequestStatus;
    decidedBy?: string;
    decidedAt?: Date;
    createdAt: Date;
}

// ============================================================================
// Record-Level Sharing
// ============================================================================

export type SharedWithType = "user" | "group" | "ou";
export type PermissionLevel = "view" | "edit" | "admin";

export interface RecordShare {
    id: string;
    tenantId: string;
    entityType: string;
    entityId: string;
    sharedWithId: string;
    sharedWithType: SharedWithType;
    permissionLevel: PermissionLevel;
    sharedBy: string;
    reason?: string;
    expiresAt?: Date;
    isRevoked: boolean;
    revokedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateRecordShareInput {
    tenantId: string;
    entityType: string;
    entityId: string;
    sharedWithId: string;
    sharedWithType: SharedWithType;
    permissionLevel: PermissionLevel;
    sharedBy: string;
    reason?: string;
    expiresAt?: Date;
}

// ============================================================================
// Share Audit
// ============================================================================

export type ShareGrantType = "delegation" | "record_share" | "external_share";

export type ShareAuditAction =
    | "grant_created"
    | "grant_revoked"
    | "grant_expired"
    | "access_via_share"
    | "share_modified"
    | "delegation_created"
    | "delegation_revoked";

export interface ShareAuditEntry {
    id: string;
    tenantId: string;
    grantId?: string;
    grantType: ShareGrantType;
    action: ShareAuditAction;
    actorId: string;
    targetId?: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
    createdAt: Date;
}

export interface CreateShareAuditInput {
    tenantId: string;
    grantId?: string;
    grantType: ShareGrantType;
    action: ShareAuditAction;
    actorId: string;
    targetId?: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
}

// ============================================================================
// External Share Token (Cross-Tenant)
// ============================================================================

export interface ExternalShareToken {
    id: string;
    tenantId: string;
    tokenHash: string;
    issuerTenantId: string;
    issuedBy: string;
    targetEmail: string;
    entityType: string;
    entityId: string;
    permissionLevel: "view" | "edit";
    expiresAt: Date;
    isRevoked: boolean;
    revokedAt?: Date;
    lastAccessedAt?: Date;
    accessCount: number;
    createdAt: Date;
}

export interface CreateExternalShareInput {
    tenantId: string;
    issuedBy: string;
    targetEmail: string;
    entityType: string;
    entityId: string;
    permissionLevel?: "view" | "edit";
    expiresInDays?: number;
}

// ============================================================================
// Query Options
// ============================================================================

export interface ShareListOptions {
    limit?: number;
    offset?: number;
}

export interface ShareAuditQueryOptions {
    startDate?: Date;
    endDate?: Date;
    actorId?: string;
    entityType?: string;
    entityId?: string;
    action?: ShareAuditAction;
    limit?: number;
    offset?: number;
}

// ============================================================================
// Effective Permission Resolution
// ============================================================================

export type ShareAccessAction = "read" | "write" | "share";

export interface EffectiveSharePermission {
    allowed: boolean;
    permissionLevel?: PermissionLevel;
    source?: "direct_share" | "delegation" | "group_share" | "ou_share";
    grantId?: string;
    expiresAt?: Date;
}

// ============================================================================
// Admin Reassignment
// ============================================================================

export interface ReassignTaskInput {
    tenantId: string;
    taskId: string;
    fromUserId: string;
    toUserId: string;
    reason: string;
    adminId: string;
}

export interface BulkReassignInput {
    tenantId: string;
    fromUserId: string;
    toUserId: string;
    taskIds?: string[];
    reason: string;
    adminId: string;
}

export interface ReassignResult {
    taskId: string;
    success: boolean;
    error?: string;
}
