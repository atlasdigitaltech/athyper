import {
  FoundationContractError,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
/** Evidence candidates only. A legacy member UUID is not a stable identity, and
 * matching names never authorize a rebind or reuse of a retired identity. */
export function compareLegacyFieldLineage(
  current: MetaEntityGraph,
  previous: MetaEntityGraph,
) {
  const index = (graph: MetaEntityGraph) => {
    const ids = new Map<string, MetaEntityGraph["fields"][number]>();
    for (const field of graph.fields) {
      if (!field.id || ids.has(field.id))
        throw new FoundationContractError(
          "F9_SOURCE_MEMBER_ID_AMBIGUOUS",
          "/fields",
        );
      ids.set(field.id, field);
    }
    return ids;
  };
  const old = index(previous);
  index(current);
  // Conservative full field equality: cosmetic edits also require review. A
  // narrow semantic comparator needs its own qualified version before use.
  const fields = current.fields.map((field) => {
    const prior = old.get(field.id!);
    return {
      fieldId: field.id!,
      fieldKey: field.fieldKey,
      previousFieldId: prior?.id ?? null,
      status: !prior
        ? "rebind-required"
        : canonicalJson(prior) === canonicalJson(field)
          ? "exact-member-candidate"
          : "changed-member-review-required",
      stableIdentityId: null,
    };
  });
  return {
    currentSourceHash: sha256(current),
    previousSourceHash: sha256(previous),
    fields,
    removedFieldIds: [...old.keys()]
      .filter((id) => !current.fields.some((f) => f.id === id))
      .sort(),
    qualification: "not-established" as const,
  };
}
/** Checks a supplied correspondence; callers still need independent review,
 * installed resource identity, revocation and canonical identity allocation.
 * No field-name join, UUID allocation or permission restoration occurs here. */
export function validateLegacyFieldCorrespondence(
  current: MetaEntityGraph,
  previous: MetaEntityGraph,
  input: {
    currentSourceHash: string;
    previousSourceHash: string;
    mappings: readonly { currentFieldId: string; previousFieldId: string }[];
  },
) {
  const fail = (code: string): never => {
    throw new FoundationContractError(code, "/fieldMappings");
  };
  const inventory = compareLegacyFieldLineage(current, previous);
  if (
    input.currentSourceHash !== inventory.currentSourceHash ||
    input.previousSourceHash !== inventory.previousSourceHash
  )
    fail("F9_SOURCE_HASH_MISMATCH");
  const currentIds = new Set<string>(),
    previousIds = new Set<string>();
  const signature = (field: MetaEntityGraph["fields"][number]) => {
    const { id: _, ...rest } = field;
    return canonicalJson(rest);
  };
  for (const mapping of input.mappings) {
    if (
      currentIds.has(mapping.currentFieldId) ||
      previousIds.has(mapping.previousFieldId)
    )
      fail("F9_MAPPING_AMBIGUOUS");
    currentIds.add(mapping.currentFieldId);
    previousIds.add(mapping.previousFieldId);
    const target = current.fields.find((f) => f.id === mapping.currentFieldId),
      source = previous.fields.find((f) => f.id === mapping.previousFieldId);
    if (!target || !source) fail("F9_MAPPING_MEMBER_UNAVAILABLE");
    if (signature(target!) !== signature(source!))
      fail("F9_MAPPING_SEMANTICS_CHANGED");
  }
  return {
    currentSourceHash: input.currentSourceHash,
    previousSourceHash: input.previousSourceHash,
    mappingHash: sha256(input),
    mappedCount: input.mappings.length,
    unmappedCurrentFieldIds: current.fields
      .filter((f) => !currentIds.has(f.id!))
      .map((f) => f.id!),
    unmappedPreviousFieldIds: previous.fields
      .filter((f) => !previousIds.has(f.id!))
      .map((f) => f.id!),
    authority: "not-established" as const,
  };
}
