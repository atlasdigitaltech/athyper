/** One-time migration input -> one compiled release. No approvals or activation. */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  canonicalBytes,
  sha256,
} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import {
  compileCompiledEntityArtifacts,
  compiledEntityRuntimeProjection,
} from "../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js";

assert.ok(process.argv.slice(2).every((arg) => arg === "--write"));
const previousHash =
  "f8fbe4ccbbae56efe7de7fe9dd7f930449722584b2b41e58eb0aef5670594b0e";
const directory = join(
  homedir(),
  ".athyper/instances/dev/candidates/business-partner-package",
);
const previous = JSON.parse(
  readFileSync(join(directory, previousHash + ".json"), "utf8"),
);
assert.equal(sha256(canonicalBytes(previous)), previousHash);
const core = JSON.parse(
  readFileSync(
    "metadata/products/mdg/entities/business_partner/core.json",
    "utf8",
  ),
);
const catalog = JSON.parse(
  readFileSync("metadata/products/mdg/review/registry-catalog.json", "utf8"),
);
assert.equal(
  execFileSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "com.docker.compose.project"}}',
      "athyper-dev-db-1",
    ],
    { encoding: "utf8" },
  ).trim(),
  "athyper-dev",
);
const permissions = execFileSync(
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
const keys = (kind: string) =>
  new Set<string>(
    catalog.entries
      .filter((entry: { kind: string }) => entry.kind === kind)
      .map((entry: { key: string }) => entry.key),
  );
const {
  artifacts: _entries,
  releaseHash: _hash,
  signature: _signature,
  ...release
} = previous.compiledRuntime.release;
const compilation = compileCompiledEntityArtifacts({
  canonicalizer: {
    canonicalBytes,
    sha256: (bytes) => `sha256:${sha256(bytes)}`,
  },
  // Explicit existing intake field adapters (index.tsx/request-workspace.tsx),
  // not candidate-derived executable registrations. Server authorization bindings
  // must additionally pass the real publication loader's runtime qualifier.
  registry: {
    permissions: new Set([...keys("permission"), ...permissions]),
    handlers: new Set([
      ...keys("handler"),
      "business_partner.attachment",
      "business_partner.account_holder",
      "business_partner.reference",
      "business_partner.organization",
    ]),
    renderers: keys("renderer"),
    resolvers: new Set([...keys("resolver"), "organization.record.v1"]),
    evaluators: keys("evaluator"),
  },
  release: {
    content: {
      ...release,
      contractStatus: "unsigned_review_only",
      signature: { algorithm: "", keyId: "", value: "" },
    },
  },
  runtimeContracts: { business_partner: previous.nativeDescriptor },
  artifacts: previous.compiledRuntime.artifacts.map(
    (artifact: { artifactKey: string; content: Record<string, unknown> }) => {
      const value =
        artifact.artifactKey === "business_partner/core"
          ? core
          : artifact.content;
      const { artifactHash: _artifactHash, ...content } = value;
      return {
        ref: `${artifact.artifactKey}.json`,
        content: { ...content, contractStatus: "draft_for_review" },
      };
    },
  ),
});
const candidate = {
  schema: "athyper.compiled-only-entity-candidate/1",
  entityCode: "business_partner",
  plane: "neon",
  provenance: {
    compiledSourceReleaseId: previous.provenance.compiledSourceReleaseId,
    compiledSourceArtifactHash: previous.provenance.compiledSourceArtifactHash,
    replacesCandidateHash: previousHash,
    sourceCoreHash: core.artifactHash,
  },
  compiledRuntime: compiledEntityRuntimeProjection(
    compilation,
    previous.compiledRuntime.generatedAt,
    "business_partner",
    "11111111-1111-4111-8111-111111111111",
  ),
  approval: { status: "required", sourceApprovalInherited: false },
  activationAuthorized: false,
};
const candidateHash = sha256(canonicalBytes(candidate)),
  path = join(directory, candidateHash + ".json");
if (process.argv.includes("--write")) {
  const bytes = JSON.stringify(candidate, null, 2) + "\n";
  if (existsSync(path)) assert.equal(readFileSync(path, "utf8"), bytes);
  else writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
}
console.log(
  JSON.stringify({
    candidateHash,
    path,
    artifactCount: compilation.report.artifactCount,
    compiledReleaseHash: compilation.release.releaseHash,
    nativePublicationRequired: false,
    approved: false,
    activationChanged: false,
  }),
);
