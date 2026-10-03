/** Offline read-contract preparation. Preserves unresolved operations as gates;
 * never creates, signs, activates or approves a governed successor. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { discoverWorkspace } from "./source-workspace.mjs";
import {
  canonicalBytes,
  sha256,
} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import {
  prepareSplitReadRuntime,
  validateCompiledRuntimeContracts,
} from "../../../server/packages/platform/metadata/src/index.js";
import { parseCompiledEntityArtifact } from "../../../server/packages/contracts/publication/src/index.js";
import { createEntityAuthorizationRegistrations } from "../../../server/apps/platform-host/src/composition/shared/entity-runtime/read-registrations.js";
import { createPublicationRuntimeQualification } from "../../../server/apps/platform-host/src/composition/shared/publication/runtime-qualification.js";
const [rootCode, capturePath, output] = process.argv.slice(2);
if (!rootCode || !capturePath || !output || process.argv.length !== 5)
  throw Error(
    "Usage: <root-entity> <captured-active-releases.json> <review.json>",
  );
const workspace = discoverWorkspace();
const load = (code: string, file: string) => {
  const source = workspace.entities.get(code);
  if (!source) throw Error("Declared entity source missing");
  return JSON.parse(
    readFileSync(join(source.directory, file + ".json"), "utf8"),
  );
};
const root = load(rootCode, "core");
const codes = [
  rootCode,
  ...(root.entityRelationships ?? []).map((r: any) => r.targetEntity),
];
if (new Set(codes).size !== codes.length)
  throw Error("Repeated or recursive entity relationship");
const compiled: any[] = [];
const candidates: any[] = [];
const hash = (value: unknown) => `sha256:${sha256(canonicalBytes(value))}`;
for (const code of codes) {
  const core = load(code, "core"),
    operation = load(code, "operation");
  const result = prepareSplitReadRuntime(core, operation);
  const neverQuery = async () => {
    throw Error("Offline qualification must not query records");
  };
  createPublicationRuntimeQualification({
    registrations: createEntityAuthorizationRegistrations(
      { get: neverQuery, list: neverQuery } as never,
      result.descriptor.authorization,
    ),
  }).qualify(
    result.descriptor.authorization,
    result.descriptor.authorizationRuntime,
  );
  const runtime = {
    schema: core.schema,
    schemaVersion: 2,
    contractStatus: "unsigned_review_only",
    artifactType: "runtime_contract",
    artifactKey: code + "/runtime",
    entityCode: code,
    plane: core.plane,
    dependencies: [code + "/core", code + "/operation"],
    descriptor: result.descriptor,
  };
  const members = [core, operation, runtime].map((source) => {
    const { artifactHash: _old, ...content } = source;
    return parseCompiledEntityArtifact({
      ...content,
      artifactHash: hash(content),
    });
  });
  compiled.push(...members);
  candidates.push({
    entityCode: code,
    coreHash: members[0].artifactHash,
    operationHash: members[1].artifactHash,
    runtime: members[2].content,
    remainingOperations: result.remainingOperations,
    sharedReadBindingsQualified: true,
  });
}
validateCompiledRuntimeContracts(compiled);
const capture = readFileSync(resolve(capturePath));
const predecessors = JSON.parse(capture.toString());
if (
  !Array.isArray(predecessors) ||
  !predecessors.length ||
  predecessors.some((row) => row.payload?.entityCode !== rootCode)
)
  throw Error("Predecessor entity mismatch");
const rootCandidate = candidates.find(
  (candidate) => candidate.entityCode === rootCode,
);
const ledgers = predecessors.map((row) => ({
  publicationKey: row.publicationKey,
  tenantId: row.tenantId,
  sourceReleaseId: row.sourceReleaseId,
  artifactHash: row.artifactHash,
  runtimeBindings: (
    row.payload.artifacts.find(
      (a: any) => a.artifactKey === rootCode + "/runtime",
    )?.content?.descriptor?.authorizationRuntime?.bindings ?? []
  ).map((binding: any) => {
    const proposed =
      rootCandidate.runtime.descriptor.authorizationRuntime.bindings.find(
        (next: any) => next.operation === binding.operation,
      );
    return {
      predecessor: binding,
      predecessorOperation:
        row.payload.artifacts
          .find((a: any) => a.artifactKey === rootCode + "/runtime")
          ?.content?.descriptor?.authorization?.operations?.find(
            (op: any) => op.key === binding.operation,
          ) ?? null,
      proposed: proposed ?? null,
      proposedOperation: proposed
        ? rootCandidate.runtime.descriptor.authorization.operations.find(
            (operation: any) => operation.key === binding.operation,
          )
        : null,
      status: proposed
        ? "explicit_binding_migration_requires_review"
        : "unresolved_preserve_predecessor_behavior",
    };
  }),
  retainedTenantRuntimeKeys: row.tenantId
    ? row.payload.artifacts
        .filter(
          (a: any) =>
            a.artifactType === "runtime_contract" &&
            !codes.includes(a.entityCode),
        )
        .map((a: any) => a.artifactKey)
    : [],
}));
writeFileSync(
  resolve(output),
  JSON.stringify(
    {
      schema: "athyper.split-read-runtime-review/1",
      rootEntityCode: rootCode,
      status: "read_contracts_qualified_successor_incomplete",
      captureByteHash: sha256(capture),
      candidates,
      predecessorLedgers: ledgers,
      parentContractValidation: "passed",
      governedSuccessorCreated: false,
      publicationPerformed: false,
      independentApprovalRecorded: false,
      platformAuthor: null,
      platformReviewer: null,
      tenantAuthor: null,
      tenantReviewer: null,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    readContracts: candidates.length,
    parentContractValidation: "passed",
    remainingSourceOperations: candidates.reduce(
      (n, c) => n + c.remainingOperations.length,
      0,
    ),
    predecessorBindings: ledgers.reduce(
      (n, row) => n + row.runtimeBindings.length,
      0,
    ),
    publicationReady: false,
  }),
);
