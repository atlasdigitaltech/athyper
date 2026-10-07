import {
  FoundationContractError,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
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
  validateConversionJsonData(current, "/current");
  validateConversionJsonData(previous, "/previous");
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

/** Builds review candidates from complete field declarations, excluding only
 * the unstable legacy member ID. It never approves continuity or allocates a
 * stable identity. Same-name fields with changed declarations stay unresolved. */
export function proposeLegacyFieldCorrespondence(
  current: MetaEntityGraph,
  previous: MetaEntityGraph,
) {
  validateConversionJsonData(current, "/current");
  validateConversionJsonData(previous, "/previous");
  const inventory = compareLegacyFieldLineage(current, previous);
  const signature = (field: MetaEntityGraph["fields"][number]) => {
    const { id: _, ...declaration } = field;
    return canonicalJson(declaration);
  };
  const currentGroups = new Map<string, string[]>();
  const previousGroups = new Map<string, string[]>();
  for (const [graph, groups] of [
    [current, currentGroups],
    [previous, previousGroups],
  ] as const)
    for (const field of graph.fields) {
      const key = signature(field);
      groups.set(key, [...(groups.get(key) ?? []), field.id!]);
    }
  const mappings: { currentFieldId: string; previousFieldId: string }[] = [];
  const unresolved: {
    currentFieldId: string;
    reason: "changed-or-unavailable" | "ambiguous";
  }[] = [];
  for (const field of current.fields) {
    const key = signature(field);
    const candidates = previousGroups.get(key) ?? [];
    if (candidates.length === 1 && currentGroups.get(key)!.length === 1)
      mappings.push({
        currentFieldId: field.id!,
        previousFieldId: candidates[0]!,
      });
    else
      unresolved.push({
        currentFieldId: field.id!,
        reason:
          candidates.length === 0 ? "changed-or-unavailable" : "ambiguous",
      });
  }
  mappings.sort((a, b) =>
    a.currentFieldId < b.currentFieldId
      ? -1
      : a.currentFieldId > b.currentFieldId
        ? 1
        : 0,
  );
  unresolved.sort((a, b) =>
    a.currentFieldId < b.currentFieldId
      ? -1
      : a.currentFieldId > b.currentFieldId
        ? 1
        : 0,
  );
  const input = {
    currentSourceHash: inventory.currentSourceHash,
    previousSourceHash: inventory.previousSourceHash,
    mappings,
  };
  const validation = validateLegacyFieldCorrespondence(
    current,
    previous,
    input,
  );
  return {
    schema: "entity.legacy-field-correspondence-proposal/1" as const,
    comparator: "complete-declaration-except-member-id/1" as const,
    ...input,
    mappingHash: validation.mappingHash,
    unresolved,
    unmappedPreviousFieldIds: validation.unmappedPreviousFieldIds.sort(),
    authority: "not-established" as const,
    reviewRequired: true as const,
    securityQualification: "not-established" as const,
  };
}

export interface LegacyReleaseCorrespondence {
  readonly releaseId: string;
  readonly previousSourceHash: string;
  readonly mappings: readonly {
    currentFieldId: string;
    previousFieldId: string;
  }[];
  /** Explicit negative disposition: never maps an old pin to a guessed identity. */
  readonly rebindRequiredPreviousFieldIds: readonly string[];
}
/** Complete history coverage for an allocation/installation decision. The host
 * supplies the independently loaded release roster. This validates evidence;
 * it does not attest review, publication or installed runtime resolution. */
export function validateLegacyFieldIdentityPlan(
  current: MetaEntityGraph,
  releases: readonly { releaseId: string; graph: MetaEntityGraph }[],
  input: {
    currentSourceHash: string;
    releases: readonly LegacyReleaseCorrespondence[];
  },
) {
  const fail = (code: string): never => {
    throw new FoundationContractError(code, "/identityPlan");
  };
  validateConversionJsonData(input, "/identityPlan");
  compareLegacyFieldLineage(current, current);
  if (sha256(current) !== input.currentSourceHash)
    fail("F9_SOURCE_HASH_MISMATCH");
  const roster = new Map(releases.map((r) => [r.releaseId, r.graph]));
  if (roster.size !== releases.length || input.releases.length !== roster.size)
    fail("F9_RELEASE_COVERAGE_INVALID");
  const seen = new Set<string>();
  for (const decision of input.releases) {
    const previous = roster.get(decision.releaseId);
    if (!previous || seen.has(decision.releaseId))
      fail("F9_RELEASE_COVERAGE_INVALID");
    seen.add(decision.releaseId);
    const validation = validateLegacyFieldCorrespondence(current, previous!, {
      currentSourceHash: input.currentSourceHash,
      previousSourceHash: decision.previousSourceHash,
      mappings: decision.mappings,
    });
    const rebind = new Set(decision.rebindRequiredPreviousFieldIds);
    if (
      rebind.size !== decision.rebindRequiredPreviousFieldIds.length ||
      rebind.size !== validation.unmappedPreviousFieldIds.length ||
      validation.unmappedPreviousFieldIds.some((id) => !rebind.has(id))
    )
      fail("F9_LEGACY_DISPOSITION_INCOMPLETE");
  }
  const findings = input.releases
    .flatMap((decision) => {
      const previous = roster.get(decision.releaseId)!;
      return decision.rebindRequiredPreviousFieldIds.map((previousFieldId) => {
        const old = previous.fields.find((f) => f.id === previousFieldId)!;
        // A same-key lookup explains compatibility only; it cannot establish a
        // correspondence, restore a reference or admit a legacy dependent.
        const candidates = current.fields.filter(
          (f) => f.fieldKey === old.fieldKey,
        );
        const next = candidates.length === 1 ? candidates[0]! : null;
        const oldReference = (
          old.typeConfig as Record<string, unknown> | undefined
        )?.keyReference;
        const nextReference = (
          next?.typeConfig as Record<string, unknown> | undefined
        )?.keyReference;
        const changeKind =
          candidates.length === 0
            ? "removed-field"
            : !next
              ? "unclassified"
              : old.dataType !== next.dataType
                ? "semantic-type-change"
                : canonicalJson(oldReference ?? null) !==
                    canonicalJson(nextReference ?? null)
                  ? "reference-binding-change"
                  : "unclassified";
        return {
          releaseId: decision.releaseId,
          previousSourceHash: decision.previousSourceHash,
          previousFieldId,
          code: "F9_REBIND_REQUIRED" as const,
          changeKind,
          compatibility:
            changeKind === "unclassified"
              ? ("unknown" as const)
              : ("breaking" as const),
          blocking: true as const,
        };
      });
    })
    .sort((a, b) => {
      const x = a.releaseId + ":" + a.previousFieldId,
        y = b.releaseId + ":" + b.previousFieldId;
      return x < y ? -1 : x > y ? 1 : 0;
    });
  const normalized = {
    currentSourceHash: input.currentSourceHash,
    releases: input.releases
      .map((r) => ({
        releaseId: r.releaseId,
        previousSourceHash: r.previousSourceHash,
        mappings: r.mappings
          .map((m) => ({ ...m }))
          .sort((a, b) =>
            a.currentFieldId < b.currentFieldId
              ? -1
              : a.currentFieldId > b.currentFieldId
                ? 1
                : 0,
          ),
        rebindRequiredPreviousFieldIds: [
          ...r.rebindRequiredPreviousFieldIds,
        ].sort(),
      }))
      .sort((a, b) =>
        a.releaseId < b.releaseId ? -1 : a.releaseId > b.releaseId ? 1 : 0,
      ),
  };
  return {
    schema: "entity.legacy-field-identity-plan/1" as const,
    ...normalized,
    findings,
    planHash: sha256({ ...normalized, findings }),
    mappedOccurrences: normalized.releases.reduce(
      (n, r) => n + r.mappings.length,
      0,
    ),
    securityQualification: "not-established" as const,
    rebindOccurrences: normalized.releases.reduce(
      (n, r) => n + r.rebindRequiredPreviousFieldIds.length,
      0,
    ),
    authority: "not-established" as const,
  };
}

/** Diagnostics for compile/install dependency checks. The caller supplies the
 * independently validated complete plan and exact dependent source pins.
 * Returning no finding is NOT an access decision or proof of installed mapping. */
export function legacyFieldDependentFindings(
  plan: ReturnType<typeof validateLegacyFieldIdentityPlan>,
  dependencies: readonly {
    dependentKey: string;
    releaseId: string;
    sourceHash: string;
    fieldId: string;
  }[],
) {
  return dependencies.flatMap((dependency) => {
    const release = plan.releases.find(
      (r) => r.releaseId === dependency.releaseId,
    );
    if (!release || release.previousSourceHash !== dependency.sourceHash)
      return [
        {
          ...dependency,
          code: "F9_DEPENDENCY_SOURCE_UNAVAILABLE",
          blocking: true,
        },
      ];
    const finding = plan.findings.find(
      (f) =>
        f.releaseId === dependency.releaseId &&
        f.previousFieldId === dependency.fieldId,
    );
    if (finding) return [{ ...dependency, ...finding }];
    if (!release.mappings.some((m) => m.previousFieldId === dependency.fieldId))
      return [
        {
          ...dependency,
          code: "F9_DEPENDENCY_FIELD_UNAVAILABLE",
          blocking: true,
        },
      ];
    return [];
  });
}
