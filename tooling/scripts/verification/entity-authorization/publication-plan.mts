/** Offline publication review compiler. No writer, publisher, or enforcement switch. */
import { createHash } from "node:crypto";
import {
  parseEntityAuthorizationProfile,
  entityScopeResolvers,
} from "../../../../server/packages/contracts/metadata/src/entity-authorization.js";

export const digest = (value: unknown): string =>
  createHash("sha256").update(canonical(value)).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export interface HeadCandidate {
  publicationKey: string;
  appliedReleaseId: string;
  headVersion: number;
  headReleaseNo: number;
  headArtifactHash: string;
  appliedStatus: string;
  appliedPublicationKey: string;
  appliedReleaseNo: number;
  appliedArtifactHash: string;
  appliedSourceReleaseId: string;
  descriptorId: string;
  descriptorStatus: string;
  descriptorKind: string;
  descriptorTenantId: string | null;
  descriptorReleaseId: string;
  descriptorContractHash: string;
  contractStatus: string;
  contractTenantId: string | null;
  entityCode: string;
  planeKey: string;
  releaseId: string;
  releaseNo: number;
  contractHash: string;
  compiledHash: string;
  descriptor: Record<string, any>;
}
export interface PublicationSnapshot {
  schemaVersion: 1;
  environment: string;
  capturedAt: string;
  tenantId: string;
  planeKey: string;
  entityCode: string;
  candidates: HeadCandidate[];
  permissions: {
    id: string;
    code: string;
    status: string;
    kind: string;
    scopes: string[];
  }[];
  bindings: {
    operationKey: string;
    permissionCode: string;
    appliedReleaseId: string;
    tenantId: string | null;
    releaseId: string;
    compiledHash: string;
    status: string;
    effective: boolean;
    decisionMode: string;
    scopes: unknown[];
  }[];
}
interface SourceReference {
  path: string;
  anchors: string[];
}
interface Handler {
  key: string;
  source: SourceReference;
  workflow: string;
  requirement: string;
}
interface Workflow {
  key: string;
  preflight: boolean;
  requirements: string[];
  source: SourceReference | null;
}
export interface BindingManifest {
  schemaVersion: 1;
  entityCode: string;
  planeKey: string;
  runtimeContractVersion: string;
  handlers: Handler[];
  workflows: Workflow[];
  operations: {
    key: string;
    handler: string;
    variant: string;
    disposition: "mapped" | "review_required";
    reason: string;
  }[];
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function exact(value: any, keys: string[], label: string) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `Invalid ${label}`,
  );
  assert(
    Object.keys(value).length === keys.length &&
      keys.every((k) => Object.hasOwn(value, k)),
    `Unknown or missing ${label} property`,
  );
}
function text(value: unknown) {
  assert(
    typeof value === "string" && value.trim().length > 0,
    "Nonempty text required",
  );
}
function unique(values: string[], label: string) {
  assert(new Set(values).size === values.length, `Duplicate ${label}`);
}
function source(value: SourceReference) {
  exact(value, ["path", "anchors"], "source reference");
  text(value.path);
  assert(
    /^(server|packages)\/[a-zA-Z0-9_./-]+\.ts$/.test(value.path) &&
      !value.path.split("/").includes(".."),
    "Unsafe source path",
  );
  assert(
    Array.isArray(value.anchors) && value.anchors.length > 0,
    "Source anchors required",
  );
  value.anchors.forEach(text);
}
export function parseBindingManifest(raw: unknown): BindingManifest {
  const m = raw as BindingManifest;
  exact(
    m,
    [
      "schemaVersion",
      "entityCode",
      "planeKey",
      "runtimeContractVersion",
      "handlers",
      "workflows",
      "operations",
    ],
    "binding manifest",
  );
  assert(
    m.schemaVersion === 1 &&
      m.runtimeContractVersion === "entity-authorization.v1",
    "Unsupported binding version",
  );
  text(m.entityCode);
  assert(["studio", "neon", "mesh"].includes(m.planeKey), "Invalid plane");
  for (const items of [m.handlers, m.workflows, m.operations]) {
    assert(
      Array.isArray(items) && items.length > 0 && items.length <= 512,
      "Invalid binding list",
    );
    unique(
      items.map((x) => x.key),
      "binding key",
    );
  }
  for (const w of m.workflows) {
    exact(w, ["key", "preflight", "requirements", "source"], "workflow");
    text(w.key);
    assert(
      typeof w.preflight === "boolean" &&
        Array.isArray(w.requirements) &&
        w.requirements.length > 0,
      "Workflow requirements required",
    );
    w.requirements.forEach(text);
    if (w.source !== null) source(w.source);
    assert(
      !w.preflight || w.source !== null,
      "Preflight workflow requires source evidence",
    );
  }
  for (const h of m.handlers) {
    exact(h, ["key", "source", "workflow", "requirement"], "handler");
    text(h.key);
    text(h.requirement);
    source(h.source);
    assert(
      m.workflows.some((w) => w.key === h.workflow),
      `Unknown workflow: ${h.workflow}`,
    );
  }
  for (const o of m.operations) {
    exact(
      o,
      ["key", "handler", "variant", "disposition", "reason"],
      "operation binding",
    );
    [o.key, o.variant, o.reason].forEach(text);
    assert(
      ["mapped", "review_required"].includes(o.disposition),
      "Invalid disposition",
    );
    assert(
      m.handlers.some((h) => h.key === o.handler),
      `Unknown handler: ${o.handler}`,
    );
  }
  return m;
}
export function resolveEffectiveHead(
  snapshot: PublicationSnapshot,
): HeadCandidate {
  assert(snapshot.schemaVersion === 1, "Unsupported snapshot version");
  const eligible = snapshot.candidates.filter(
    (c) =>
      c.entityCode === snapshot.entityCode &&
      c.planeKey === snapshot.planeKey &&
      (c.contractTenantId === null ||
        c.contractTenantId === snapshot.tenantId) &&
      c.appliedStatus === "active" &&
      c.descriptorStatus === "active" &&
      c.descriptorKind === "entity_runtime" &&
      c.contractStatus === "published",
  );
  assert(eligible.length, "No effective activation head");
  for (const c of eligible) {
    assert(
      c.publicationKey === c.appliedPublicationKey &&
        c.headReleaseNo === c.appliedReleaseNo &&
        c.headArtifactHash === c.appliedArtifactHash &&
        c.releaseId === c.appliedSourceReleaseId &&
        c.descriptorReleaseId === c.releaseId &&
        c.releaseNo === c.headReleaseNo &&
        c.descriptorTenantId === c.contractTenantId &&
        c.descriptorContractHash === c.contractHash,
      "Incompatible activation head artifacts",
    );
    assert(
      Number.isSafeInteger(c.headVersion) &&
        c.headVersion > 0 &&
        Number.isSafeInteger(c.releaseNo) &&
        c.releaseNo > 0,
      "Invalid head version",
    );
    for (const hash of [c.compiledHash, c.contractHash, c.headArtifactHash])
      assert(/^[a-f0-9]{64}$/.test(hash), "Invalid artifact hash");
  }
  eligible.sort(
    (a, b) =>
      Number(b.contractTenantId !== null) -
        Number(a.contractTenantId !== null) || b.releaseNo - a.releaseNo,
  );
  const winner = eligible[0]!;
  assert(
    !eligible
      .slice(1)
      .some(
        (c) =>
          c.contractTenantId === winner.contractTenantId &&
          c.releaseNo === winner.releaseNo,
      ),
    "Ambiguous effective activation heads",
  );
  return winner;
}
export function headPin(snapshot: PublicationSnapshot) {
  const h = resolveEffectiveHead(snapshot);
  // Pin all eligible heads as well as the winner: newly introduced overrides invalidate the packet.
  return {
    tenantId: snapshot.tenantId,
    planeKey: snapshot.planeKey,
    entityCode: snapshot.entityCode,
    publicationKey: h.publicationKey,
    appliedReleaseId: h.appliedReleaseId,
    headVersion: h.headVersion,
    releaseId: h.releaseId,
    releaseNo: h.releaseNo,
    compiledHash: h.compiledHash,
    contractHash: h.contractHash,
    eligibleHeadsHash: digest(
      snapshot.candidates
        .map((c) => ({
          publicationKey: c.publicationKey,
          headVersion: c.headVersion,
          appliedReleaseId: c.appliedReleaseId,
          compiledHash: c.compiledHash,
        }))
        .sort((a, b) => a.publicationKey.localeCompare(b.publicationKey)),
    ),
  };
}
export function compilePublicationPlan(input: {
  snapshot: PublicationSnapshot;
  profile: unknown;
  manifest: unknown;
  readSource: (path: string) => string;
}) {
  const { snapshot } = input,
    selected = resolveEffectiveHead(snapshot),
    manifest = parseBindingManifest(input.manifest);
  const profile = parseEntityAuthorizationProfile(input.profile);
  assert(
    profile.entityCode === snapshot.entityCode &&
      profile.planeKey === snapshot.planeKey &&
      manifest.entityCode === profile.entityCode &&
      manifest.planeKey === profile.planeKey,
    "Cross-entity or cross-plane publication input",
  );
  const prior = selected.descriptor.operations ?? {};
  assert(
    Object.keys(prior).every((key) =>
      profile.operations.some((o) => o.key === key),
    ),
    "Unmapped installed operation",
  );
  assert(
    profile.operations.length === manifest.operations.length &&
      profile.operations.every((o) =>
        manifest.operations.some((b) => b.key === o.key),
      ),
    "Incomplete operation handler coverage",
  );
  const evidence = new Map<string, { path: string; sha256: string }>();
  for (const ref of [
    ...manifest.handlers.map((h) => h.source),
    ...manifest.workflows.flatMap((w) => (w.source ? [w.source] : [])),
  ]) {
    const contents = input.readSource(ref.path);
    assert(
      ref.anchors.every((anchor) => contents.includes(anchor)),
      `Unresolved source reference: ${ref.path}`,
    );
    evidence.set(ref.path, {
      path: ref.path,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }
  const proposedOperations = Object.fromEntries(
    profile.operations.map((o) => {
      assert(
        !prior[o.key] || prior[o.key].permissionCode === o.permissionCode,
        `Installed permission mismatch: ${o.key}`,
      );
      assert(
        !prior[o.key]?.authorizationMode ||
          prior[o.key].authorizationMode === "bound_operation",
        `Permission-only bypass requires review: ${o.key}`,
      );
      return [
        o.key,
        { ...prior[o.key], code: o.key, permissionCode: o.permissionCode },
      ];
    }),
  );
  const descriptor: Record<string, any> = {
    ...selected.descriptor,
    operations: proposedOperations,
    authorization: profile,
  };
  parseEntityAuthorizationProfile(profile, {
    entityCode: profile.entityCode,
    planeKey: profile.planeKey,
    fields: (descriptor.fields ?? []).map((f: any) => f.key),
    operations: proposedOperations,
  });
  const bindings = profile.operations.map((o) => {
    const binding = manifest.operations.find((b) => b.key === o.key)!,
      handler = manifest.handlers.find((h) => h.key === binding.handler)!,
      workflow = manifest.workflows.find((w) => w.key === handler.workflow)!;
    assert(
      o.requiresPreflight === workflow.preflight,
      `Preflight mismatch: ${o.key}`,
    );
    const permissions = snapshot.permissions.filter(
      (p) => p.code === o.permissionCode && p.status === "published",
    );
    assert(
      permissions.length <= 1,
      `Ambiguous catalog permission: ${o.permissionCode}`,
    );
    const permission = permissions[0];
    const coordinates = entityScopeResolvers[o.scope];
    const scopeKinds = coordinates.length
      ? coordinates.map(
          (k) =>
            ({
              operatingOrganizationId: "operating_organization",
              companyCodeId: "company_code",
              workspaceId: "workspace",
              networkRelationshipId: "network_relationship",
            })[k],
        )
      : ["tenant"];
    const gaps: string[] = [];
    if (!permission) gaps.push("permission_catalog_missing");
    else if (scopeKinds.some((kind) => !permission.scopes.includes(kind)))
      gaps.push("permission_scope_review_required");
    if (binding.disposition === "review_required")
      gaps.push("operation_semantics_review_required");
    const installed = snapshot.bindings.filter(
      (b) =>
        b.operationKey === o.key &&
        b.appliedReleaseId === selected.appliedReleaseId &&
        b.tenantId === selected.contractTenantId &&
        b.status === "published" &&
        b.effective,
    );
    assert(
      installed.length <= 1,
      `Ambiguous installed operation binding: ${o.key}`,
    );
    const installedBinding = installed[0];
    if (
      installedBinding &&
      (installedBinding.releaseId !== selected.releaseId ||
        installedBinding.compiledHash !== selected.compiledHash ||
        installedBinding.permissionCode !== o.permissionCode)
    )
      gaps.push("installed_binding_incompatible");
    const proposedScopes = scopeKinds.map((kind) => ({
      scopeKind: kind,
      coordinateSource:
        kind === "tenant" ? "tenant_context" : "relation_resolver",
      resolverKey: kind === "tenant" ? null : o.scope,
      coordinateKey: null,
    }));
    const decisionMode =
      o.target === "collection" ? "collection" : "entity_resource";
    const bindingChange = !installedBinding
      ? "add"
      : digest(
            [...installedBinding.scopes].sort((a: any, b: any) =>
              a.scopeKind.localeCompare(b.scopeKind),
            ),
          ) !==
            digest(
              [...proposedScopes].sort((a, b) =>
                a.scopeKind.localeCompare(b.scopeKind),
              ),
            ) || installedBinding.decisionMode !== decisionMode
        ? "replace_scope_or_mode"
        : "retain_permission_and_scope";
    return {
      operationKey: o.key,
      decisionMode,
      bindingChange,
      permissionCode: o.permissionCode,
      permissionId: permission?.id ?? null,
      permissionKind: permission?.kind ?? null,
      scopeResolver: o.scope,
      target: o.target,
      effect: o.effect,
      requiresParentRead: o.requiresParentRead,
      requiresPreflight: o.requiresPreflight,
      discoveryOperation: o.discoveryOperation ?? null,
      scopeBindings: proposedScopes.map((s) => ({
        ...s,
        missingValueBehavior: "deny",
      })),
      handlerKey: handler.key,
      handlerVariant: binding.variant,
      handlerRequirement: handler.requirement,
      workflowKey: workflow.key,
      workflowRequirements: workflow.requirements,
      installedDescriptorOperation: Boolean(prior[o.key]),
      installedBinding: installedBinding ?? null,
      disposition: binding.disposition,
      reason: binding.reason,
      gaps,
    };
  });
  // Native publication owns these generated coordinates. Never carry the old
  // release hash or installed binding IDs into an edited descriptor draft.
  delete descriptor.source;
  delete descriptor.operation_scope_bindings;
  const payload = {
    schemaVersion: 1,
    kind: "entity_authorization_publication_candidate",
    handlerReferenceKind: "source_reference_not_runtime_registration",
    runtimeContractVersion: manifest.runtimeContractVersion,
    base: headPin(snapshot),
    descriptorDraft: descriptor,
    generatedCoordinatesRequired: [
      "source release/contract hash",
      "native entity operation IDs",
      "release-bound operation_scope_bindings",
      "descriptor and artifact hashes/signatures",
    ],
    bindings,
    sourceEvidence: [...evidence.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    profileHash: digest(profile),
    manifestHash: digest(manifest),
  };
  return {
    schemaVersion: 1,
    kind: "publication_dry_run",
    environment: snapshot.environment,
    base: payload.base,
    candidateHash: digest(payload),
    candidate: payload,
    coverage: {
      operations: bindings.length,
      addedDescriptorOperations: bindings.filter(
        (b) => !b.installedDescriptorOperation,
      ).length,
      addedBindings: bindings.filter((b) => b.bindingChange === "add").length,
      replacedScopeOrModeBindings: bindings.filter(
        (b) => b.bindingChange === "replace_scope_or_mode",
      ).length,
      unexplainedBindingGaps: 0,
      reviewGatedOperations: bindings.filter((b) => b.gaps.length).length,
    },
    gapDispositions: [
      {
        code: "permission_catalog_missing",
        resolution:
          "Propose a canonical permission catalog entry or explicitly reviewed alias; do not synthesize a permission ID or grant.",
      },
      {
        code: "permission_scope_review_required",
        resolution:
          "Review the precise required scope against the catalog. Do not widen catalog scope or effective grants automatically.",
      },
      {
        code: "operation_semantics_review_required",
        resolution:
          "Resolve the operation-specific reason and handler variant in the manifest before native publication.",
      },
      {
        code: "installed_binding_incompatible",
        resolution:
          "Rebuild a compatible native release; never reuse mismatched binding hashes.",
      },
    ],
    engineeringChecksPassed: true,
    publicationEligible: false,
    enforcementEligible: false,
    effectiveGrantsChanged: false,
    grantChanges: [],
    limitations: [
      "Source anchors establish reference existence, not deployed handler registration or execution qualification.",
      "Candidate is an unsigned review artifact; it is not a native publication envelope or an activation receipt.",
      "Scope catalog compatibility is not an effective grant or permission to widen existing grants.",
    ],
    blockers: [
      "Review operation-specific gaps before native publication",
      "Compile candidate through native authoring/publication and qualify registered handler, resolver and workflow versions",
      "Named-role and policy-difference review before any grant changes or enforcement",
      "Authenticated command qualification and compatible activation/rollback evidence",
    ],
    rollback: {
      restoreGrants: false,
      base: payload.base,
      requireCurrentRevocations: true,
    },
  };
}
