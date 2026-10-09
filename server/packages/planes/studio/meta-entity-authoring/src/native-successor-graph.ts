import { randomUUID } from "node:crypto";
import {
  AuthoringPolicyError,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";
import { nativeBootstrapPlans } from "./native-bootstrap-plans.js";
import { validateNativeSnapshotReferences } from "./native-snapshot-validation.js";
import type { NativeIdentityAdoptionSource } from "./native-bootstrap-identities.js";

/** Builds authoring input, not release/read authority. The admitted command must
 * resolve the exact predecessor again. Stable identities and external resource
 * pins are never allocated or replaced. Target enrollment is a separate authored
 * change; cloning a Studio graph never implicitly grants another plane access. */
export function buildNativeSuccessorGraph(input: {
  source: ExpandedNativeMetaEntityGraph;
  sourceHash: string;
  sourceReleaseId: string;
  sourceRevision: number;
  changeSetId: string;
  authorId: string;
  maximumMembers: number;
  allocateId?: () => string;
  /** Complete author-selected plane declarations in predecessor member coordinates.
   * No plane permissions or exposure are inferred from the source. */
  targetEnrollment?: {
    members: Pick<
      NonNullable<ExpandedNativeMetaEntityGraph["referenceMembers"]>["members"],
      "target" | "authorizationProfile" | "fieldAccess" | "accessPermission"
    >;
    operationPermissions: NonNullable<
      ExpandedNativeMetaEntityGraph["operationPermissions"]
    >;
    operationScopeBindings: NonNullable<
      ExpandedNativeMetaEntityGraph["operationScopeBindings"]
    >;
  };
}): {
  graph: ExpandedNativeMetaEntityGraph;
  baseReleaseId: string;
  identitySources: readonly NativeIdentityAdoptionSource[];
  memberIds: Readonly<Record<string, string>>;
} {
  const fail = (): never => {
    throw new AuthoringPolicyError(
      "NATIVE_SUCCESSOR_SOURCE_INVALID",
      "Resolve an exact native predecessor and allocate distinct draft-local member IDs.",
    );
  };
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const source = structuredClone(input.source);
  const previous = source.ownedLabels?.changeSetId;
  if (
    !previous ||
    ![previous, input.sourceReleaseId, input.changeSetId, input.authorId].every(
      (id) => uuid.test(id),
    ) ||
    input.changeSetId === previous ||
    previous === source.authoringSource.entityId ||
    input.changeSetId === input.sourceReleaseId ||
    !Number.isSafeInteger(input.sourceRevision) ||
    input.sourceRevision < 1 ||
    source.contractSchema !== "athyper.meta-entity-contract/2.5" ||
    source.authoringSource.tenantId !== null ||
    source.authoringSource.sourceKind !== "product" ||
    sha256(source) !== input.sourceHash
  )
    fail();
  const coordinate = {
    entityId: source.authoringSource.entityId,
    tenantId: null,
    changeSetId: previous!,
  };
  // Descriptors determine the complete owned-member set, including nested label,
  // reference and AI families. Do not use the legacy whole-JSON UUID replacer.
  const plans = nativeBootstrapPlans(source, coordinate, input.maximumMembers);
  const owned = [
    ...plans.flatMap((p) => p.insert.map((r) => r.id)),
    ...source.operations.map((o) => o.id),
  ];
  const identities = source.fieldIdentities;
  if (
    !identities ||
    identities.length !== source.fields.length ||
    new Set(identities.map((i) => i.id)).size !== identities.length ||
    source.fields.some(
      (f) =>
        !identities.some(
          (i) =>
            i.id === f.fieldIdentityId &&
            i.entityId === coordinate.entityId &&
            i.tenantId === null,
        ),
    ) ||
    identities.some(
      (i) => !["reserved", "active"].includes(i.identityStatus),
    ) ||
    new Set(owned).size !== owned.length ||
    owned.some((id) => !uuid.test(id) || identities.some((i) => i.id === id))
  )
    fail();
  const forbidden = new Set<string>([
    previous!,
    input.sourceReleaseId,
    input.changeSetId,
    input.authorId,
    coordinate.entityId,
    ...owned,
    ...identities!.map((i) => i.id),
  ]);
  // Exclude every external UUID, too; an allocator collision must not make an
  // unchanged external reference accidentally point at a new local member.
  function collect(v: unknown): void {
    if (typeof v === "string" && uuid.test(v)) forbidden.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  }
  collect(source);
  const ids = new Map<string, string>([[previous!, input.changeSetId]]);
  for (const old of owned) {
    const id = (input.allocateId ?? randomUUID)();
    if (!uuid.test(id) || forbidden.has(id)) fail();
    forbidden.add(id);
    ids.set(old, id);
  }
  function copy(v: unknown, key = ""): unknown {
    if (Array.isArray(v)) return v.map((x) => copy(x, key));
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, copy(x, k)]),
      );
    // Only identifier properties are rewritten. Labels, predicate literal values,
    // translations and descriptions that happen to equal an ID remain exact text.
    if (
      typeof v === "string" &&
      (key === "id" || key.endsWith("Id") || key.endsWith("Ids"))
    )
      return ids.get(v) ?? v;
    return v;
  }
  let graph = copy(source) as ExpandedNativeMetaEntityGraph;
  if (input.targetEnrollment) {
    const enrollment = input.targetEnrollment;
    if (
      Object.keys(enrollment).sort().join() !==
        "members,operationPermissions,operationScopeBindings" ||
      Object.keys(enrollment.members).sort().join() !==
        "accessPermission,authorizationProfile,fieldAccess,target" ||
      !enrollment.members.target.some((t) => t.targetPlane === "studio")
    )
      fail();
    const newIds = [
      ...Object.values(enrollment.members).flatMap((rows) =>
        rows.map((row) => row.id),
      ),
      ...enrollment.operationPermissions.map((r) => r.id),
      ...enrollment.operationScopeBindings.map((r) => r.id),
    ];
    if (
      new Set(newIds).size !== newIds.length ||
      newIds.some(
        (id) => typeof id !== "string" || !uuid.test(id) || forbidden.has(id),
      )
    )
      fail();
    const projected = copy(enrollment) as typeof enrollment;
    graph = {
      ...graph,
      referenceMembers: {
        ...graph.referenceMembers!,
        members: { ...graph.referenceMembers!.members, ...projected.members },
      },
      operationPermissions: projected.operationPermissions,
      operationScopeBindings: projected.operationScopeBindings,
    };
  }
  // The stable catalogue is immutable source evidence, not a draft-local family.
  (graph as { fieldIdentities: typeof identities }).fieldIdentities =
    structuredClone(identities);
  const newCoordinate = { ...coordinate, changeSetId: input.changeSetId };
  validateNativeSnapshotReferences(graph, newCoordinate, input.maximumMembers);
  nativeBootstrapPlans(graph, newCoordinate, input.maximumMembers);
  const identitySources = source.fields
    .filter(
      (f) =>
        identities!.find((i) => i.id === f.fieldIdentityId)!.identityStatus ===
        "reserved",
    )
    .map((field) => ({
      identityId: field.fieldIdentityId,
      targetFieldId: ids.get(field.id)!,
      sourceChangeSetId: previous!,
      sourceFieldId: field.id,
      sourceRevision: input.sourceRevision,
      sourceHash: input.sourceHash,
      sourceReleaseId: input.sourceReleaseId,
    }));
  return {
    graph,
    baseReleaseId: input.sourceReleaseId,
    identitySources,
    memberIds: Object.fromEntries(ids),
  };
}
