import {
  FoundationContractError,
  parseReferenceMembers,
  validateReferenceIdentity,
  validateFoundationNode,
  referenceUuid,
  type ReferenceAnchors,
  type ReferenceFieldIdentity,
  type ReferenceMemberGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";

export interface ReferenceMemberCodecContext {
  readonly entityId: string;
  readonly tenantId: string | null;
  readonly revision: number;
  readonly authoringSchemaHash: string;
  readonly anchors: ReferenceAnchors;
  /** Independently loaded service-owned catalogue, never supplied by a client
   * to authorize identity creation, historical reconstruction or retirement. */
  readonly identities: readonly ReferenceFieldIdentity[];
  readonly maximumBytes: number;
}
export interface DecodedReferenceMembers {
  readonly graph: ReferenceMemberGraph;
  readonly identities: readonly ReferenceFieldIdentity[];
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function closed(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return fail("REFERENCE_PACKAGE_INVALID", path);
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    return fail("REFERENCE_PACKAGE_INVALID", path);
  return row;
}
function contextValid(context: ReferenceMemberCodecContext): void {
  validateFoundationNode(referenceUuid, context.entityId, "/source/entityId");
  validateFoundationNode(
    referenceUuid,
    context.anchors.changeSetId,
    "/source/changeSetId",
  );
  if (context.tenantId !== null)
    validateFoundationNode(referenceUuid, context.tenantId, "/source/tenantId");
  if (
    !Number.isSafeInteger(context.revision) ||
    context.revision < 0 ||
    !/^[0-9a-f]{64}$/.test(context.authoringSchemaHash) ||
    !Number.isSafeInteger(context.maximumBytes) ||
    context.maximumBytes < 1
  )
    fail("REFERENCE_PACKAGE_CONTEXT_REQUIRED", "/context");
  const identities = new Set<string>();
  for (const identity of context.identities) {
    validateReferenceIdentity(identity);
    if (
      identity.entityId !== context.entityId ||
      identity.tenantId !== context.tenantId ||
      identities.has(identity.id)
    )
      fail("REFERENCE_PACKAGE_IDENTITY_SCOPE_INVALID", "/identities");
    identities.add(identity.id);
  }
}
function identityOrder(
  identities: readonly ReferenceFieldIdentity[],
): readonly ReferenceFieldIdentity[] {
  return [...identities].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}
/** Complete selected-member wire codec. It is intentionally not a legacy native
 * graph converter or a publication artifact. No arbitrary property copy-through,
 * FK remap, position inference, permission grant or identity mutation is allowed. */
export function encodeReferenceMembers(
  graph: ReferenceMemberGraph,
  context: ReferenceMemberCodecContext,
): string {
  contextValid(context);
  const selected = parseReferenceMembers(graph, context.anchors);
  const payload = canonicalJson({
    schema: "entity.authoring-reference-package/1",
    authoringSchemaHash: context.authoringSchemaHash,
    positionConvention: "one-based",
    source: {
      entityId: context.entityId,
      tenantId: context.tenantId,
      changeSetId: context.anchors.changeSetId,
      revision: context.revision,
    },
    anchorHash: sha256(context.anchors.tables),
    graphHash: sha256(selected),
    graph: selected,
    identities: identityOrder(context.identities),
  });
  if (Buffer.byteLength(payload, "utf8") > context.maximumBytes)
    fail("REFERENCE_PACKAGE_LIMIT", "");
  return payload;
}
export function decodeReferenceMembers(
  packet: string,
  context: ReferenceMemberCodecContext,
): DecodedReferenceMembers {
  contextValid(context);
  if (
    typeof packet !== "string" ||
    Buffer.byteLength(packet, "utf8") > context.maximumBytes
  )
    fail("REFERENCE_PACKAGE_LIMIT", "");
  let raw: unknown;
  try {
    raw = JSON.parse(packet);
  } catch {
    return fail("REFERENCE_PACKAGE_JSON_INVALID", "");
  }
  const root = closed(
    raw,
    [
      "schema",
      "authoringSchemaHash",
      "positionConvention",
      "source",
      "anchorHash",
      "graphHash",
      "graph",
      "identities",
    ],
    "",
  );
  if (root.schema !== "entity.authoring-reference-package/1")
    fail("REFERENCE_PACKAGE_VERSION_UNSUPPORTED", "/schema");
  if (root.authoringSchemaHash !== context.authoringSchemaHash)
    fail("REFERENCE_PACKAGE_DESCRIPTOR_MISMATCH", "/authoringSchemaHash");
  if (root.positionConvention !== "one-based")
    fail(
      "REFERENCE_PACKAGE_POSITION_CONVENTION_UNSUPPORTED",
      "/positionConvention",
    );
  const source = closed(
    root.source,
    ["entityId", "tenantId", "changeSetId", "revision"],
    "/source",
  );
  if (
    source.entityId !== context.entityId ||
    source.tenantId !== context.tenantId ||
    source.changeSetId !== context.anchors.changeSetId
  )
    fail("REFERENCE_PACKAGE_SOURCE_MISMATCH", "/source");
  if (source.revision !== context.revision)
    fail("REFERENCE_PACKAGE_REVISION_MISMATCH", "/source/revision");
  if (root.anchorHash !== sha256(context.anchors.tables))
    fail("REFERENCE_PACKAGE_ANCHOR_MISMATCH", "/anchorHash");
  const graph = parseReferenceMembers(root.graph, context.anchors);
  if (root.graphHash !== sha256(graph))
    fail("REFERENCE_PACKAGE_GRAPH_HASH_MISMATCH", "/graphHash");
  if (!Array.isArray(root.identities))
    fail("REFERENCE_PACKAGE_IDENTITIES_INVALID", "/identities");
  for (const identity of root.identities as unknown[])
    validateReferenceIdentity(identity);
  if (
    canonicalJson(
      identityOrder(root.identities as unknown as ReferenceFieldIdentity[]),
    ) !== canonicalJson(identityOrder(context.identities))
  )
    fail("REFERENCE_PACKAGE_IDENTITY_AUTHORITY_MISMATCH", "/identities");
  return {
    graph: structuredClone(graph),
    identities: structuredClone(context.identities),
  };
}
