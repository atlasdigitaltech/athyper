/**
 * Standard response envelope for metadata-driven collection sections.
 * Domain adapters supply only a stable revision, projected data, and an
 * optional opaque continuation cursor.
 */
export function collectionResource<T extends Record<string, unknown>>(
  revision: string,
  data: T,
  nextCursor?: string,
) {
  return {
    revision,
    data: { ...data, ...(nextCursor ? { nextCursor } : {}) },
  };
}
