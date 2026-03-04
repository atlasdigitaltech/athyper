/**
 * Content Permissions
 *
 * Permission definitions and helper functions for content management.
 * Integrates with PolicyGateService for authorization checks.
 */

/**
 * Content permission actions
 */
export const CONTENT_PERMISSIONS = {
  // Basic file operations
  DOCUMENT_READ: "document.read",
  DOCUMENT_UPLOAD: "document.upload",
  DOCUMENT_DELETE: "document.delete",
  DOCUMENT_DOWNLOAD: "document.download",

  // Versioning
  DOCUMENT_VERSION_CREATE: "document.version.create",
  DOCUMENT_VERSION_RESTORE: "document.version.restore",
  DOCUMENT_VERSION_VIEW: "document.version.view",

  // Entity linking
  DOCUMENT_LINK_MANAGE: "document.link.manage",
  DOCUMENT_LINK_VIEW: "document.link.view",

  // Per-kind permissions (optional granularity)
  DOCUMENT_ATTACHMENT_UPLOAD: "document.attachment.upload",
  DOCUMENT_INVOICE_UPLOAD: "document.invoice.upload",
  DOCUMENT_CONTRACT_UPLOAD: "document.contract.upload",
  DOCUMENT_GENERATED_VIEW: "document.generated.view",

  // ACL management
  DOCUMENT_ACL_MANAGE: "document.acl.manage",
} as const;

export type ContentPermission = typeof CONTENT_PERMISSIONS[keyof typeof CONTENT_PERMISSIONS];

/**
 * Permission context for content operations
 */
export interface ContentPermissionContext {
  entityType?: string;
  entityId?: string;
  attachmentId?: string;
  kind?: string;
  ownerId?: string;
}

/**
 * Check if user has permission for content operation
 *
 * @param actorId - User ID
 * @param tenantId - Tenant ID
 * @param permission - Permission to check
 * @param context - Additional context (entity, attachment, etc.)
 * @returns True if permission granted
 *
 * @example
 * const canUpload = await checkContentPermission(
 *   userId,
 *   tenantId,
 *   CONTENT_PERMISSIONS.DOCUMENT_UPLOAD,
 *   { entityType: "invoice", entityId: "123", kind: "invoice" }
 * );
 */
export async function checkContentPermission(
  actorId: string,
  tenantId: string,
  permission: ContentPermission,
  context?: ContentPermissionContext,
): Promise<boolean> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    // If runtime not configured, deny by default (fail-safe)
    console.warn("RUNTIME_API_URL not configured - denying permission check");
    return false;
  }

  try {
    const res = await fetch(`${runtimeApiUrl}/api/policy/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        principalId: actorId,
        tenantId,
        operation: permission,
        resource: context || {},
      }),
    });

    if (!res.ok) {
      console.error(`Permission check failed: ${res.status}`);
      return false;
    }

    const { allowed } = await res.json();
    return allowed === true;
  } catch (err) {
    console.error("Permission check error:", err);
    // Deny on error (fail-safe)
    return false;
  }
}

/**
 * Check multiple permissions at once
 *
 * @param actorId - User ID
 * @param tenantId - Tenant ID
 * @param permissions - Array of permissions to check
 * @param context - Additional context
 * @returns Map of permission -> boolean
 */
export async function checkContentPermissions(
  actorId: string,
  tenantId: string,
  permissions: ContentPermission[],
  context?: ContentPermissionContext,
): Promise<Record<string, boolean>> {
  const results = await Promise.all(
    permissions.map((perm) => checkContentPermission(actorId, tenantId, perm, context)),
  );

  return permissions.reduce((acc, perm, idx) => {
    acc[perm] = results[idx];
    return acc;
  }, {} as Record<string, boolean>);
}

/**
 * Throw error if permission denied
 *
 * @param actorId - User ID
 * @param tenantId - Tenant ID
 * @param permission - Permission to require
 * @param context - Additional context
 * @throws Error if permission denied
 */
export async function requireContentPermission(
  actorId: string,
  tenantId: string,
  permission: ContentPermission,
  context?: ContentPermissionContext,
): Promise<void> {
  const allowed = await checkContentPermission(actorId, tenantId, permission, context);

  if (!allowed) {
    throw new Error(`Permission denied: ${permission}`);
  }
}
