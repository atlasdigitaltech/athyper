/**
 * ACL Service - Per-Document Access Control
 *
 * Handles granting and revoking permissions for specific documents.
 * This supplements the PolicyGateService for exceptional cases.
 */

export type AclPermission = "read" | "download" | "delete" | "share";

export interface GrantPermissionParams {
  attachmentId: string;
  principalId?: string;
  roleId?: string;
  permission: AclPermission;
  granted: boolean;
  tenantId: string;
  actorId: string;
  expiresAt?: Date;
}

export interface DocumentAcl {
  id: string;
  attachmentId: string;
  principalId: string | null;
  roleId: string | null;
  permission: AclPermission;
  granted: boolean;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string | null;
}

export interface CheckAclParams {
  attachmentId: string;
  principalId: string;
  permission: AclPermission;
  tenantId: string;
}

/**
 * Grant or revoke permission for a document
 *
 * @param params - Grant parameters
 * @returns Created ACL entry
 * @throws Error if invalid (must specify principalId OR roleId, not both)
 */
export async function grantPermission(params: GrantPermissionParams): Promise<DocumentAcl> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  // Validate: must have exactly one of principalId or roleId
  if (!params.principalId && !params.roleId) {
    throw new Error("Must specify either principalId or roleId");
  }
  if (params.principalId && params.roleId) {
    throw new Error("Cannot specify both principalId and roleId");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/acl/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      expiresAt: params.expiresAt?.toISOString(),
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Grant permission failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Revoke all permissions for a principal on a document
 *
 * @param attachmentId - Attachment ID
 * @param principalId - User ID
 * @param tenantId - Tenant ID
 * @param actorId - User ID performing revocation
 * @throws Error if not found
 */
export async function revokePermissions(
  attachmentId: string,
  principalId: string,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/acl/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachmentId, principalId, tenantId, actorId }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Revoke permissions failed: ${res.status}`);
  }
}

/**
 * Check if principal has permission via ACL
 *
 * This checks per-document ACL only. Should be combined with PolicyGateService.
 *
 * @param params - Check parameters
 * @returns True if permission granted via ACL
 */
export async function checkDocumentPermission(params: CheckAclParams): Promise<boolean> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/acl/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    console.error(`ACL check failed: ${res.status}`);
    return false;
  }

  const { allowed } = await res.json();
  return allowed === true;
}

/**
 * List all ACL entries for a document
 *
 * @param attachmentId - Attachment ID
 * @param tenantId - Tenant ID
 * @returns Array of ACL entries
 */
export async function listDocumentAcls(
  attachmentId: string,
  tenantId: string,
): Promise<DocumentAcl[]> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(
    `${runtimeApiUrl}/api/content/acl/${attachmentId}?tenant=${tenantId}`,
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `List ACLs failed: ${res.status}`);
  }

  return res.json();
}
