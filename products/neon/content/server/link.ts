/**
 * Link Service - Entity-Document Linking Operations
 *
 * Handles linking documents to multiple entities,
 * unlinking, and querying links.
 */

export type LinkKind = "primary" | "related" | "supporting" | "compliance" | "audit";

export interface LinkDocumentParams {
  attachmentId: string;
  entityType: string;
  entityId: string;
  linkKind: LinkKind;
  tenantId: string;
  actorId: string;
  displayOrder?: number;
}

export interface EntityDocumentLink {
  id: string;
  attachmentId: string;
  entityType: string;
  entityId: string;
  linkKind: LinkKind;
  displayOrder: number;
  createdAt: string;
  createdBy: string;
}

export interface LinkedEntity {
  entityType: string;
  entityId: string;
  linkKind: LinkKind;
  displayOrder: number;
}

/**
 * Link document to entity
 *
 * Creates a many-to-many relationship between a document and an entity.
 * A document can be linked to multiple entities, and an entity can have multiple documents.
 *
 * @param params - Link parameters
 * @returns Created link
 * @throws Error if attachment or entity not found
 */
export async function linkDocumentToEntity(params: LinkDocumentParams): Promise<EntityDocumentLink> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Link creation failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Unlink document from entity
 *
 * Removes the link between a document and an entity.
 * Does not delete the document itself.
 *
 * @param linkId - Link ID to remove
 * @param tenantId - Tenant ID
 * @param actorId - User ID
 * @throws Error if link not found
 */
export async function unlinkDocument(
  linkId: string,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/unlink/${linkId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, actorId }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Unlink failed: ${res.status}`);
  }
}

/**
 * Get all entities linked to a document
 *
 * Returns a list of entities that reference this document.
 *
 * @param attachmentId - Attachment ID
 * @param tenantId - Tenant ID
 * @returns Array of linked entities
 * @throws Error if attachment not found
 */
export async function getLinkedEntities(
  attachmentId: string,
  tenantId: string,
): Promise<LinkedEntity[]> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(
    `${runtimeApiUrl}/api/content/links/${attachmentId}?tenant=${tenantId}`,
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Get linked entities failed: ${res.status}`);
  }

  return res.json();
}
