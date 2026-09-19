import { compileEntityIntakeSurfaces } from "@athyper/contract-platform-entity-runtime";
import { AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import { baselineJsonHash } from "./baseline-publication.js";
type Json = Record<string, any>;
const deny = (code: string): never => {
  throw new AuthoringPolicyError(
    code,
    "Reviewed runtime restoration payload is invalid",
  );
};
/** Fresh native review covers the entire payload. Historical hashes are
 * provenance, never a substitute for current review, catalog or signing. */
export function compileRuntimeRestoration(native: Json):
  | {
      descriptor: Json;
      publicationKey: string;
      tenantId: string;
      descriptorHash: string;
    }
  | undefined {
  const surfaces = Array.isArray(native.surfaces) ? native.surfaces : [];
  const carriers = surfaces.filter(
    (s: Json) => s.layoutConfig?.runtimeRestoration !== undefined,
  );
  if (!carriers.length) return undefined;
  if (
    carriers.length !== 1 ||
    surfaces.some(
      (s: Json) =>
        s.layoutConfig?.authorizationSuccessor ||
        s.layoutConfig?.baselineImport,
    )
  )
    deny("RESTORATION_MARKER_CONFLICT");
  const m = carriers[0].layoutConfig.runtimeRestoration;
  if (
    !m ||
    Object.keys(m).sort().join(",") !==
      "descriptor,descriptorHash,kind,publicationKey,schemaVersion,sourceArtifactHash,tenantId" ||
    m.schemaVersion !== 1 ||
    m.kind !== "reviewed_empty_target" ||
    !/^metadata\.entity\.[a-z0-9_.-]+$/.test(m.publicationKey ?? "") ||
    !/^[a-f0-9-]{36}$/.test(m.tenantId ?? "") ||
    !/^[a-f0-9]{64}$/.test(m.sourceArtifactHash ?? "")
  )
    deny("RESTORATION_MARKER_INVALID");
  const d = m.descriptor;
  if (!d || baselineJsonHash(d) !== m.descriptorHash)
    deny("RESTORATION_PAYLOAD_HASH_MISMATCH");
  if (
    d.schema !== "athyper.entity-runtime-descriptor/1.0" ||
    d.planeKey !== "neon" ||
    d.entityCode !== native.entity?.entityCode
  )
    deny("RESTORATION_IDENTITY_MISMATCH");
  const same = (a: unknown, b: unknown) =>
    baselineJsonHash(a ?? null) === baselineJsonHash(b ?? null);
  if (
    !same(d.authorization, native.authorization) ||
    !same(d.ai, native.ai) ||
    !d.authorizationRuntime ||
    !native.authorizationRuntime
  )
    deny("RESTORATION_POLICY_MISMATCH");
  const normalize = (runtime: Json) => ({
    ...runtime,
    bindings: [...runtime.bindings].sort((a: Json, b: Json) =>
      a.operation.localeCompare(b.operation),
    ),
  });
  if (
    !Array.isArray(d.authorizationRuntime.bindings) ||
    !Array.isArray(native.authorizationRuntime.bindings) ||
    !same(
      normalize(d.authorizationRuntime),
      normalize(native.authorizationRuntime),
    ) ||
    !same(d.operation_scope_bindings, [])
  )
    deny("RESTORATION_BINDING_MISMATCH");
  const intakeInputs = new Set(compileEntityIntakeSurfaces(native).flatMap(s => s.sections.flatMap(section => section.fields.map(f => f.key))));
  const fields = (native.fields ?? []).filter((f: Json) => !(f.valueOrigin === "runtime" && intakeInputs.has(f.fieldKey))).map((f: Json) => f.fieldKey).sort();
  const operations = (native.operations ?? [])
    .filter((o: Json) => o.status !== "deprecated")
    .map((o: Json) => o.operationKey)
    .sort();
  if (
    !same(fields, (d.fields ?? []).map((f: Json) => f.key).sort()) ||
    !same(operations, Object.keys(d.operations ?? {}).sort())
  )
    deny("RESTORATION_NATIVE_COVERAGE_MISMATCH");
  // Full runtime parsing and registry/catalog qualification remain mandatory
  // worker/loader gates; this bridge must never substitute the reduced native
  // descriptor for the explicitly reviewed runtime storage and presentation.
  for (const key of ["storage", "recordPresentation", "listPresentation"])
    if (!d[key] || typeof d[key] !== "object" || Array.isArray(d[key]))
      deny("RESTORATION_RUNTIME_BRANCH_MISSING");
  return {
    descriptor: structuredClone(d),
    publicationKey: m.publicationKey,
    tenantId: m.tenantId,
    descriptorHash: m.descriptorHash,
  };
}
