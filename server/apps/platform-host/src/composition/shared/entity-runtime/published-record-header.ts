import { createHash } from "node:crypto";
import { assertCommonReferenceDescriptor, type EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { readCompiledRuntimeContract, type PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import type { EntityRuntimeHeaderRepository } from "@athyper/server-platform-experience";

type Input = Parameters<EntityRuntimeHeaderRepository["readHeader"]>[0];
/** A read-only header from the request's pinned release and authorized query
 * service. The content digest is an HTTP/UI revision, not a database version
 * token and never authority to mutate a record. No native fallback or raw SQL. */
export function createPublishedRecordHeader(options: {
  reader: PinnedCompiledEntityReader;
  read(input: Input, descriptor: EntityRuntimeDescriptor, fields: readonly string[]): Promise<Readonly<Record<string, unknown>> | null>;
}): EntityRuntimeHeaderRepository {
  return { async readHeader(input) {
    const { context, release, core } = input;
    if (!context.tenantId || !context.principalId || !input.recordId || release.coordinate.tenantId !== context.tenantId
      || release.coordinate.principalId !== context.principalId || release.coordinate.planeKey !== context.planeKey
      || release.coordinate.entityCode !== core.entityCode || core.plane !== context.planeKey || core.artifactType !== "core")
      throw Error("ENTITY_HEADER_RELEASE_SCOPE_MISMATCH");
    const descriptor = await readCompiledRuntimeContract(options.reader, release);
    assertCommonReferenceDescriptor(descriptor, context.planeKey);
    if (descriptor.entityCode !== core.entityCode || !descriptor.operations.read || !descriptor.operations.list)
      throw Error("ENTITY_HEADER_DESCRIPTOR_MISMATCH");
    const fields = [...new Set([...input.fieldKeys, descriptor.storage.idField])].sort();
    if (fields.some(key => !descriptor.fields.some(field => field.key === key))) throw Error("ENTITY_HEADER_FIELD_UNAVAILABLE");
    const row = await options.read(input, descriptor, fields);
    if (!row) return null;
    if (String(row[descriptor.storage.idField]) !== input.recordId) throw Error("ENTITY_HEADER_RECORD_MISMATCH");
    // Never copy extra fields returned by a provider to the public header.
    const values = Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
    const revision = createHash("sha256").update(JSON.stringify({ releaseHash: release.release.releaseHash, values })).digest("hex");
    return { revision, values };
  } };
}
