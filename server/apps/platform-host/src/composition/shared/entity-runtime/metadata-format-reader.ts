import type { MetadataReader } from "@athyper/server-contract-metadata";

/** Explicit migration mode: an admitted split release takes precedence. A miss
 * may use the existing native publication reader; errors NEVER cause fallback.
 * Both readers enforce active heads, exact plane and signed tenant scope.
 * Compiled-only planes do not use this bridge. */
export function createMetadataFormatReader(compiled: MetadataReader, native: MetadataReader): MetadataReader {
  return { async getEntityDescriptor(context, entityCode) {
    const descriptor = await compiled.getEntityDescriptor(context, entityCode);
    return descriptor ?? native.getEntityDescriptor(context, entityCode);
  } };
}
