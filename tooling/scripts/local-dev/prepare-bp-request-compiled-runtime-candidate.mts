import { resolveSourcePath } from "../metadata/source-workspace.mjs";
/** Add the independently signed BP Request collection contract to the existing
 * compiled BP release. This is DEV migration input only; no approval or activation. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DurableGraphPreviewStore } from "../../../server/packages/planes/studio/meta-entity-authoring/src/durable-graph-preview.js";
import {
  canonicalBytes,
  sha256,
} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import {
  compileCompiledEntityArtifacts,
  compiledEntityRuntimeProjection,
} from "../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js";

const tenantId = "44444444-4444-4444-8444-444444444444";
const previousHash =
  "b1fc1fdfae1e251e6197083cfae4631fd5b4261b7077cf7d12c25502984cef90";
const directory = join(
  homedir(),
  ".athyper/instances/dev/candidates/business-partner-package",
);
const previous = JSON.parse(
  readFileSync(resolveSourcePath(join(directory, `${previousHash}.json`)), "utf8"),
);
if (sha256(canonicalBytes(previous)) !== previousHash)
  throw Error("PREVIOUS_CANDIDATE_CHANGED");
const root = process.env.ATHYPER_LOCAL_PREVIEW_ROOT ?? "/athyper/local-preview";
const store = new DurableGraphPreviewStore(
  join(root, "meta-entity.sqlite"),
  readFileSync(resolveSourcePath(join(root, "public.pem")), "utf8"),
);
const preview = store.read({
  tenantId,
  entityCode: "business_partner_request",
});
store.close();
if (!preview) throw Error("REQUEST_PREVIEW_NOT_ADMITTED");
const descriptor = structuredClone(
  (preview.projections as any).neon?.descriptor,
);
const operationBindings = (preview.projections as any).neon?.operationBindings;
if (
  !descriptor ||
  !Array.isArray(operationBindings) ||
  descriptor.authorizationRuntime !== undefined
)
  throw Error("REQUEST_COLLECTION_CONTRACT_INVALID");
const password = readFileSync(
  resolveSourcePath(join(homedir(), ".athyper/instances/dev/secrets/postgres-password")),
  "utf8",
).trim();
const host = execFileSync(
  "docker",
  [
    "inspect",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
    "athyper-dev-db-1",
  ],
  { encoding: "utf8" },
).trim();
const permissionId = execFileSync(
  "docker",
  [
    "exec",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-Atc",
    "SELECT id FROM authz.permission WHERE canonical_code='neon.relationship.entity_case.read' AND status='published'",
  ],
  { encoding: "utf8" },
).trim();
const predecessorTenantArtifactHash = execFileSync(
  "docker",
  [
    "exec",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-Atc",
    "SELECT artifact_hash FROM runtime_meta.release_activation_head WHERE publication_key='metadata.compiled_entity.business_partner.tenant.11111111-1111-4111-8111-111111111111'",
  ],
  { encoding: "utf8" },
).trim();
if (!/^[a-f0-9-]{36}$/i.test(permissionId) || !host)
  throw Error("REQUEST_READ_PERMISSION_UNAVAILABLE");
const uuid = (value: string) => {
  const h = createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32)
    .split("");
  h[12] = "4";
  h[16] = ["8", "9", "a", "b"][parseInt(h[16]!, 16) % 4]!;
  const v = h.join("");
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
};
const bindings = operationBindings.map((binding: any) => ({
  bindingId: uuid(`${preview.graphHash}:${binding.operationKey}:permission`),
  scopeBindingId: uuid(
    `${preview.graphHash}:${binding.operationKey}:operating_organization`,
  ),
  sourceEntityOperationId: uuid(`${preview.id}:${binding.operationKey}`),
  entityCode: "business_partner_request",
  operationKey: binding.operationKey,
  permissionId,
  permissionCode: "neon.relationship.entity_case.read",
  permissionKind: "entity_operation",
  decisionMode: "collection",
  scopeKind: "operating_organization",
  coordinateSource: "relation_resolver",
  coordinateKey: null,
  resolverKey: "platform.document_relationship.v1",
}));
descriptor.source = { entity_id: preview.id, release_hash: preview.graphHash };
descriptor.operation_scope_bindings = bindings;
const catalog = JSON.parse(
  readFileSync(resolveSourcePath("metadata/review/registry-catalog.json"), "utf8"),
);
const keys = (kind: string) =>
  new Set(
    catalog.entries
      .filter((entry: any) => entry.kind === kind)
      .map((entry: any) => entry.key),
  );
const livePermissions = execFileSync(
  "docker",
  [
    "exec",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-Atc",
    "SELECT canonical_code FROM authz.permission WHERE status='published' ORDER BY canonical_code",
  ],
  { encoding: "utf8" },
)
  .trim()
  .split("\n");
const {
  artifacts: _artifacts,
  releaseHash: _hash,
  signature: _signature,
  ...release
} = previous.compiledRuntime.release;
const currentRequestCore = JSON.parse(
  readFileSync(
    resolveSourcePath("metadata/entities/business_partner_request/core.json"),
    "utf8",
  ),
);
const currentRequestOperation = JSON.parse(
  readFileSync(
    resolveSourcePath("metadata/entities/business_partner_request/operation.json"),
    "utf8",
  ),
);
const artifacts = previous.compiledRuntime.artifacts
  .filter(
    (artifact: any) =>
      artifact.artifactKey !== "business_partner_request/runtime",
  )
  .map((artifact: any) => {
    const content =
      artifact.artifactKey === "business_partner_request/core"
        ? currentRequestCore
        : artifact.artifactKey === "business_partner_request/operation"
          ? currentRequestOperation
          : artifact.content;
    const { artifactHash: _artifactHash, ...rest } = content;
    return {
      ref: `${artifact.artifactKey}.json`,
      content: { ...rest, contractStatus: "unsigned_review_only" },
    };
  });
artifacts.push({
  ref: "business_partner_request/runtime.json",
  content: {
    schema: "athyper.compiled-entity-artifact/2.0-draft",
    schemaVersion: 2,
    contractStatus: "unsigned_review_only",
    artifactType: "runtime_contract",
    artifactKey: "business_partner_request/runtime",
    entityCode: "business_partner_request",
    plane: "neon",
    dependencies: [
      "business_partner_request/core",
      "business_partner_request/operation",
    ],
    descriptor,
  },
});
const compilation = compileCompiledEntityArtifacts({
  canonicalizer: {
    canonicalBytes,
    sha256: (bytes: Uint8Array) => `sha256:${sha256(bytes)}`,
  },
  registry: {
    permissions: new Set([...keys("permission"), ...livePermissions]),
    handlers: new Set([
      ...keys("handler"),
      "business_partner.attachment",
      "business_partner.account_holder",
      "business_partner.reference",
      "business_partner.organization",
    ]),
    renderers: keys("renderer"),
    resolvers: new Set([
      ...keys("resolver"),
      "organization.record.v1",
      "platform.document_relationship.v1",
    ]),
    evaluators: keys("evaluator"),
  },
  release: {
    content: {
      ...release,
      contractStatus: "unsigned_review_only",
      signature: { algorithm: "", keyId: "", value: "" },
    },
  },
  artifacts,
});
const candidate = {
  schema: "athyper.compiled-only-entity-candidate/1",
  entityCode: "business_partner",
  plane: "neon",
  provenance: {
    ...previous.provenance,
    replacesCandidateHash: previousHash,
    predecessorTenantArtifactHash,
    requestPreview: {
      tenantId,
      changeSetId: preview.changeSetId,
      revision: preview.revision,
      graphHash: preview.graphHash,
    },
  },
  compiledRuntime: compiledEntityRuntimeProjection(
    compilation,
    new Date().toISOString(),
    "business_partner",
    "11111111-1111-4111-8111-111111111111",
  ),
  approvalRequired: true,
  activationAuthorized: false,
};
const hash = sha256(canonicalBytes(candidate));
if (process.argv.includes("--write"))
  writeFileSync(
    join(directory, `${hash}.json`),
    JSON.stringify(candidate, null, 2) + "\n",
    { mode: 0o600, flag: "wx" },
  );
console.log(
  JSON.stringify({
    candidateHash: hash,
    artifactCount: compilation.report.artifactCount,
    requestBindingCount: bindings.length,
    previewGraphHash: preview.graphHash,
  }),
);
