import type {
  AuthoringPlane,
  ExpandedNativeMetaEntityGraph,
  NormalizedCoreContext,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  plannedNativeBootstrapIdentities,
  sha256,
  type NativeBootstrapInput,
  type NativeReleaseCompilationContext,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { resolveNativeBootstrapAuthorization } from "./native-bootstrap-authorization.js";
import { resolveNativeBootstrapAi } from "./native-bootstrap-ai.js";
import { resolveNativeBootstrapListProviders } from "./native-bootstrap-provider.js";

/** Compiler semantics for the bounded read-only reference capability. Callers
 * supply independently resolved storage/components/target contracts; this does
 * not authorize SQL access, publication or activation. */
export function assembleNativeBootstrapCompilation(input: {
  command: NativeBootstrapInput;
  targetPlane?: AuthoringPlane;
  installedIdentities?: NormalizedCoreContext["identities"];
  graph: ExpandedNativeMetaEntityGraph;
  catalogue: NormalizedCoreContext["catalogues"][number];
  components: Pick<
    NativeReleaseCompilationContext,
    "components" | "componentResourceEvidence"
  > & {
    core: NativeReleaseCompilationContext["core"]["components"];
    layout: NativeReleaseCompilationContext["layout"]["components"];
  };
  targets: readonly {
    entityId: string;
    entityCode: string;
    keyKey: string;
    fieldKeys: readonly string[];
    labelFieldKey: string;
    resource: { owner: string; key: string; version: number; hash: string };
  }[];
  domains: NativeReleaseCompilationContext["domains"];
  referenceContract: { key: string; version: number; hash: string };
  identityResource: NativeReleaseCompilationContext["identityResource"];
  maximumMembers: number;
}): NativeReleaseCompilationContext {
  const { graph: g, command } = input;
  const identities =
    input.installedIdentities ?? plannedNativeBootstrapIdentities(command, g);
  if (
    identities.length !== g.fields.length ||
    new Set(identities.map((identity) => identity.id)).size !==
      identities.length ||
    identities.some(
      (identity) =>
        identity.entityId !== command.entityId ||
        identity.tenantId !== command.tenantId ||
        !g.fields.some((field) => field.fieldIdentityId === identity.id),
    )
  )
    throw Error("NATIVE_BOOTSTRAP_IDENTITY_CONTEXT_INVALID");
  const authorization = resolveNativeBootstrapAuthorization(
    g,
    identities,
    input.maximumMembers,
    input.targetPlane,
  );
  const relationLabels = (g.relations ?? []).map((r) => {
    const targets = (g.relationTargets ?? []).filter(
      (t) => t.entityRelationId === r.id,
    );
    if (targets.length !== 1) throw Error("NATIVE_BOOTSTRAP_TARGET_INVALID");
    const t = targets[0]!,
      known = input.targets.filter(
        (k) => k.entityId === t.targetEntityId && k.keyKey === t.targetKeyKey,
      );
    if (known.length !== 1) throw Error("NATIVE_BOOTSTRAP_TARGET_UNAVAILABLE");
    return {
      relationId: r.id!,
      labelFieldKey: known[0]!.labelFieldKey,
      resource: known[0]!.resource,
    };
  });
  return {
    graphHash: sha256(g),
    authoringSchemaHash: g.authoringSource.authoringSchemaHash,
    core: {
      entityId: command.entityId,
      tenantId: null,
      phase: "qualification",
      maxMembers: input.maximumMembers,
      identities,
      labels: g.ownedLabels!.labels.map((l) => l.id),
      searchProfiles: (g.searchProfiles ?? []).map((p) => p.id!),
      relationIds: (g.relations ?? []).map((r) => r.id!),
      keyIds: (g.keys ?? []).map((k) => k.id!),
      classificationCodes: ["public"],
      domains: input.domains.map((d) => d.code),
      contracts: [
        { kind: "reference", ...input.referenceContract, parameterCount: 0 },
      ],
      components: input.components.core,
      catalogues: [input.catalogue],
    },
    layout: {
      maxMembers: input.maximumMembers,
      navigationGroups: g.referenceMembers!.members.navigationGroup.map(
        ({ id, entitySurfaceId, position }) => ({
          id,
          entitySurfaceId,
          position,
        }),
      ),
      overlays: [],
      capabilityLayouts: [],
      relatedTargets: [],
      components: input.components.layout,
      fieldPresentation: g.fields.map((f) => {
        const policies = g.referenceMembers!.members.fieldAccess.filter(
          (a) =>
            a.entityFieldId === f.id && a.targetPlane === authorization.plane,
        );
        if (policies.length !== 1)
          throw Error("NATIVE_BOOTSTRAP_FIELD_POLICY_REQUIRED");
        const p = policies[0]!;
        return {
          fieldId: f.id,
          display: p.representation,
          queryUses: p.queryUses,
          filterOperators: [],
          inputSurfaceIds: [],
          referenceSurfaceKeys: [],
          referenceLoadModes: [],
        };
      }),
    },
    structural: { fieldIds: g.fields.map((f) => f.id), targets: input.targets },
    authorization,
    ai: resolveNativeBootstrapAi(g, authorization),
    identityResource: input.identityResource,
    listProviders: resolveNativeBootstrapListProviders(g),
    domains: input.domains,
    relationLabels,
    components: input.components.components,
    componentResourceEvidence: input.components.componentResourceEvidence,
  };
}
