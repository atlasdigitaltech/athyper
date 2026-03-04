/**
 * Version Service - Document Versioning Operations
 *
 * Handles creating new versions of existing documents,
 * viewing version history, and restoring previous versions.
 */

export interface CreateNewVersionParams {
  documentId: string;
  file: File;
  tenantId: string;
  actorId: string;
}

export interface VersionMetadata {
  id: string;
  versionNo: number;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  sha256: string | null;
  uploadedBy: string | null;
  createdAt: string;
  isCurrent: boolean;
  replacedAt?: string;
  replacedBy?: string;
}

export interface VersionHistoryResult {
  documentId: string;
  currentVersion: VersionMetadata;
  versions: VersionMetadata[];
}

export interface RestoreVersionParams {
  documentId: string;
  versionNo: number;
  tenantId: string;
  actorId: string;
}

/**
 * Create a new version of an existing document
 *
 * @param params - Version creation parameters
 * @returns New version metadata
 * @throws Error if document not found or upload fails
 */
export async function createNewVersion(
  params: CreateNewVersionParams,
): Promise<VersionMetadata> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("documentId", params.documentId);
  formData.append("tenantId", params.tenantId);
  formData.append("actorId", params.actorId);

  const res = await fetch(`${runtimeApiUrl}/api/content/version/create`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Version creation failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Get version history for a document
 *
 * @param documentId - Document ID
 * @param tenantId - Tenant ID
 * @returns Version history with all versions
 * @throws Error if document not found
 */
export async function getVersionHistory(
  documentId: string,
  tenantId: string,
): Promise<VersionHistoryResult> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(
    `${runtimeApiUrl}/api/content/versions/${documentId}?tenant=${tenantId}`,
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(
      error.message || `Get version history failed: ${res.status}`,
    );
  }

  return res.json();
}

/**
 * Restore a previous version as the current version
 *
 * Creates a new version (n+1) that is a copy of the specified version.
 *
 * @param params - Restore parameters
 * @returns New current version metadata
 * @throws Error if version not found
 */
export async function restoreVersion(
  params: RestoreVersionParams,
): Promise<VersionMetadata> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/version/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Version restore failed: ${res.status}`);
  }

  return res.json();
}
