import {
  FoundationContractError,
  assertOwnedLabelsComplete,
  parseOwnedLabels,
  emptyReferenceMembers,
  referenceUuid,
  validateFoundationNode,
  validateReferenceIdentity,
  type MetaEntityGraph,
  type OwnedLabelGraph,
  type OwnedLabelContext,
  type ReferenceFieldIdentity,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256, validateGraph } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";

export interface LegacySourceEnrollmentInput {
  readonly sourceHash: string;
  readonly revision: number;
  readonly sourceKind: "product" | "tenant_entity";
  readonly context: OwnedLabelContext;
  readonly labels: OwnedLabelGraph;
  /** Exact independently allocated catalogue records; this adapter never creates
   * identities or substitutes source member IDs. Database enrollment must prove
   * these records' authority and attribution independently. */
  readonly identities: readonly ReferenceFieldIdentity[];
  readonly maximumBytes: number;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
/** Pure 2.1/2.2 -> 2.3 source preparation. No database mutation, grant, protected
 * state initialization, publication or claim of installed host qualification.
 * Original values are retained verbatim; only explicit normalized enrollment
 * families and the format marker are added. Native lowering follows separately. */
export function prepareLegacySourceEnrollment(
  source: MetaEntityGraph,
  input: LegacySourceEnrollmentInput,
) {
  validateConversionJsonData(source, "/source");
  validateConversionJsonData(input, "/enrollment");
  source = structuredClone(source);
  input = structuredClone(input);
  if (
    Object.keys(input).sort().join() !==
    "context,identities,labels,maximumBytes,revision,sourceHash,sourceKind"
  )
    fail("LEGACY_ENROLLMENT_INPUT_INVALID", "/enrollment");
  if (
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    !Number.isSafeInteger(input.maximumBytes) ||
    input.maximumBytes < 1 ||
    !/^[a-f0-9]{64}$/.test(input.sourceHash) ||
    sha256(source) !== input.sourceHash
  )
    fail("LEGACY_ENROLLMENT_SOURCE_MISMATCH", "/source");
  if (
    !Object.hasOwn(source, "contractSchema") ||
    ![
      "athyper.meta-entity-contract/2.1",
      "athyper.meta-entity-contract/2.2",
    ].includes(source.contractSchema) ||
    Object.hasOwn(source, "referenceMembers") ||
    Object.hasOwn(source, "fieldIdentities")
  )
    fail("LEGACY_ENROLLMENT_VERSION_UNSUPPORTED", "/source/contractSchema");
  validateFoundationNode(
    {
      type: "object",
      properties: {
        entityId: referenceUuid,
        changeSetId: referenceUuid,
        tenantId: { anyOf: [referenceUuid, { type: "null" }] },
        supportedLocales: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1, maxLength: 127 },
        },
      },
    },
    input.context,
    "/enrollment/context",
  );
  for (const id of [
    input.context.entityId,
    input.context.changeSetId,
    ...(input.context.tenantId === null ? [] : [input.context.tenantId]),
  ])
    validateFoundationNode(referenceUuid, id, "/enrollment/context");
  if (
    !["product", "tenant_entity"].includes(input.sourceKind) ||
    (input.sourceKind === "product") !== (input.context.tenantId === null)
  )
    fail("LEGACY_ENROLLMENT_OWNERSHIP_MISMATCH", "/enrollment/sourceKind");
  const issues = validateGraph(source).issues;
  if (issues.length)
    fail("LEGACY_ENROLLMENT_SOURCE_INVALID", "/source/" + issues[0]!.path);
  const labels = parseOwnedLabels(input.labels, input.context);
  assertOwnedLabelsComplete(labels, input.context);
  if (
    source.ownedLabels !== undefined &&
    canonicalJson(source.ownedLabels) !== canonicalJson(labels)
  )
    fail("LEGACY_ENROLLMENT_LABEL_CHANGED", "/source/ownedLabels");
  const labelMap = new Map(labels.labels.map((l) => [l.labelKey, l]));
  // Validate every explicit localized reference, including nested sections,
  // navigation, badges and AI declarations. Plain legacy labels remain intact.
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, path + "/" + i));
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (Object.hasOwn(row, "labelKey") && Object.hasOwn(row, "defaultText")) {
      const label = labelMap.get(String(row.labelKey));
      if (
        !label ||
        label.sourceKind !== "owned" ||
        label.defaultText !== row.defaultText
      )
        return fail("LEGACY_ENROLLMENT_LABEL_MISMATCH", path);
      if (
        row.defaultLocale !== undefined &&
        row.defaultLocale !== labels.defaultLocale
      )
        fail("LEGACY_ENROLLMENT_LABEL_MISMATCH", path + "/defaultLocale");
      if (row.values !== undefined) {
        const expected = Object.fromEntries([
          [labels.defaultLocale, label.defaultText],
          ...labels.translations
            .filter((t) => t.labelId === label.id)
            .map((t) => [t.localeCode, t.text]),
        ]);
        if (canonicalJson(row.values) !== canonicalJson(expected))
          fail("LEGACY_ENROLLMENT_LABEL_MISMATCH", path + "/values");
      }
    }
    Object.entries(row).forEach(([key, v]) => visit(v, path + "/" + key));
  };
  visit(source, "/source");
  const keys = new Set<string>(),
    ids = new Set<string>();
  if (
    !Array.isArray(input.identities) ||
    input.identities.length !== source.fields.length
  )
    fail("LEGACY_ENROLLMENT_IDENTITY_INVENTORY_INVALID", "/identities");
  for (const identity of input.identities) {
    validateReferenceIdentity(identity);
    if (
      identity.entityId !== input.context.entityId ||
      identity.tenantId !== input.context.tenantId ||
      identity.identityStatus === "retired" ||
      keys.has(identity.fieldKey) ||
      ids.has(identity.id)
    )
      fail("LEGACY_ENROLLMENT_IDENTITY_INVALID", "/identities");
    keys.add(identity.fieldKey);
    ids.add(identity.id);
    const fields = source.fields.filter(
      (f) => f.fieldKey === identity.fieldKey,
    );
    if (
      fields.length !== 1 ||
      !fields[0]!.id ||
      identity.parentIdentityId !== null
    )
      fail(
        "LEGACY_ENROLLMENT_IDENTITY_INVALID",
        "/identities/" + identity.fieldKey,
      );
    if (
      identity.identityStatus === "reserved" &&
      identity.introducedChangeSetId !== input.context.changeSetId
    )
      fail(
        "LEGACY_ENROLLMENT_IDENTITY_INVALID",
        "/identities/introducedChangeSetId",
      );
    if (
      (identity.identityStatus === "reserved") !==
      (identity.firstReleaseId === null)
    )
      fail("LEGACY_ENROLLMENT_IDENTITY_INVALID", "/identities/firstReleaseId");
    if (
      identity.retiredAt !== null ||
      identity.retiredBy !== null ||
      identity.retirementReleaseId !== null ||
      identity.replacementIdentityId !== null
    )
      fail("LEGACY_ENROLLMENT_IDENTITY_INVALID", "/identities/retirement");
  }
  const candidate: MetaEntityGraph = {
    ...source,
    contractSchema: "athyper.meta-entity-contract/2.3",
    ownedLabels: labels,
    fieldIdentities: [...input.identities].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    referenceMembers: emptyReferenceMembers(),
  };
  if (
    Buffer.byteLength(canonicalJson(source)) > input.maximumBytes ||
    Buffer.byteLength(canonicalJson(candidate)) > input.maximumBytes
  )
    fail("LEGACY_ENROLLMENT_SIZE_EXCEEDED", "/source");
  // Reconstruct from the candidate, not a captured backup. This proves that
  // normalization introduced no change to any original property or member ID.
  const {
    referenceMembers: _,
    fieldIdentities: __,
    ownedLabels: ___,
    ...original
  } = candidate;
  const reconstructed = {
    ...original,
    contractSchema: source.contractSchema,
    ...(source.ownedLabels === undefined
      ? {}
      : { ownedLabels: candidate.ownedLabels }),
  };
  if (sha256(reconstructed) !== input.sourceHash)
    fail("LEGACY_ENROLLMENT_SOURCE_LOSS", "/source");
  return {
    schema: "entity.legacy-source-enrollment-proof/1" as const,
    source: {
      entityId: input.context.entityId,
      changeSetId: input.context.changeSetId,
      tenantId: input.context.tenantId,
      revision: input.revision,
      sourceKind: input.sourceKind,
      graphHash: input.sourceHash,
    },
    candidate,
    targetHash: sha256(candidate),
    fieldBindings: input.identities.map((identity) => ({
      fieldId: source.fields.find((f) => f.fieldKey === identity.fieldKey)!.id!,
      identityId: identity.id,
    })),
    qualification: "not-established" as const,
  };
}
