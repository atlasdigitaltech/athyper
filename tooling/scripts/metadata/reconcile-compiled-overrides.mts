/** Offline comparison of captured, already-published artifacts. No signing,
 * activation, automatic merge or transfer of tenant authority is performed. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createEntityAuthorizationRegistrations } from "../../../server/apps/platform-host/src/composition/shared/entity-runtime/read-registrations.js";
import { createPublicationRuntimeQualification } from "../../../server/apps/platform-host/src/composition/shared/publication/runtime-qualification.js";
import { discoverWorkspace } from "./source-workspace.mjs";
const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4)
  throw Error("Usage: <captured-active-releases.json> <review.json>");
const bytes = readFileSync(resolve(input));
const rows = JSON.parse(bytes.toString());
if (!Array.isArray(rows) || rows.length !== 2)
  throw Error("Exactly one platform and one tenant predecessor required");
const platform = rows.find((row) => row.tenantId === null);
const tenant = rows.find((row) => typeof row.tenantId === "string");
if (
  !platform ||
  !tenant ||
  !platform.sourceReleaseId ||
  !tenant.sourceReleaseId ||
  platform.publicationKey === tenant.publicationKey
)
  throw Error("Distinct source authority required");
if (
  !platform.payload?.entityCode ||
  platform.payload.entityCode !== tenant.payload?.entityCode ||
  tenant.payload.tenantId !== tenant.tenantId
)
  throw Error("Matching product and tenant payload coordinates required");
const index = (row: any) => {
  if (!Array.isArray(row.payload?.artifacts))
    throw Error("Captured artifacts required");
  const map = new Map<string, any>();
  for (const artifact of row.payload.artifacts) {
    if (!artifact.artifactKey || map.has(artifact.artifactKey))
      throw Error("Missing/duplicate artifact key");
    map.set(artifact.artifactKey, artifact);
  }
  return map;
};
const base = index(platform),
  extension = index(tenant);
const sources = new Map(
  discoverWorkspace()
    .documents.filter(
      (document) => typeof document.value.artifactKey === "string",
    )
    .map((document) => [document.value.artifactKey, document.value]),
);
const at = (value: any, pointer: string) =>
  pointer === "/"
    ? value
    : pointer
        .slice(1)
        .split("/")
        .reduce(
          (current, key) =>
            current?.[key.replaceAll("~1", "/").replaceAll("~0", "~")],
          value,
        );
function differences(before: any, after: any, path = ""): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) !== Array.isArray(after)
  )
    return [path || "/"];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .flatMap((key) =>
      key === "artifactHash" && path === ""
        ? []
        : differences(
            before[key],
            after[key],
            `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
          ),
    );
}
const artifacts = [...new Set([...base.keys(), ...extension.keys()])]
  .sort()
  .map((key) => {
    const a = base.get(key),
      b = extension.get(key);
    const paths = a && b ? differences(a.content, b.content) : ["/"];
    const source = sources.get(key);
    const sourceChangedPaths =
      a && source ? differences(a.content, source) : null;
    const tenantDeltaPaths = a && b ? paths : [];
    const preservedTenantPaths =
      source && b
        ? tenantDeltaPaths.filter(
            (path) =>
              JSON.stringify(at(b.content, path)) ===
              JSON.stringify(at(source, path)),
          )
        : [];
    const unresolvedTenantPaths = tenantDeltaPaths.filter(
      (path) => !preservedTenantPaths.includes(path),
    );
    return {
      artifactKey: key,
      sourceContentHash: source
        ? createHash("sha256").update(JSON.stringify(source)).digest("hex")
        : null,
      sourceChangedPaths,
      preservedTenantPaths,
      unresolvedTenantPaths,
      platformHash: a?.artifactHash ?? null,
      tenantHash: b?.artifactHash ?? null,
      status: !a
        ? "tenant_only_preserve"
        : !b
          ? "tenant_omission_review"
          : paths.length
            ? "tenant_delta_review"
            : "same_content",
      deltaPaths: paths,
    };
  });
const runtimeQualification = [...extension.values()]
  .filter((artifact) => artifact.artifactType === "runtime_contract")
  .map((artifact) => {
    const descriptor = artifact.content.descriptor;
    if (descriptor.collectionRelationship)
      return {
        artifactKey: artifact.artifactKey,
        status: "collection_contract_separate_qualification_required",
        reason:
          "Collection scope bindings use their existing qualification path, not shared read-handler registration.",
      };
    const neverQuery = async () => {
      throw Error("Offline qualification must not execute queries");
    };
    try {
      const registrations = createEntityAuthorizationRegistrations(
        { list: neverQuery, get: neverQuery } as never,
        descriptor.authorization,
      );
      createPublicationRuntimeQualification({ registrations }).qualify(
        descriptor.authorization,
        descriptor.authorizationRuntime,
      );
      return {
        artifactKey: artifact.artifactKey,
        status: "shared_read_registration_qualified",
        declaredBindings: descriptor.authorizationRuntime.bindings.length,
      };
    } catch (error) {
      return {
        artifactKey: artifact.artifactKey,
        status: "shared_read_registration_rejected",
        declaredBindings:
          descriptor.authorizationRuntime?.bindings?.length ?? 0,
        error: String(error),
      };
    }
  });
const identity = (row: any) => ({
  publicationKey: row.publicationKey,
  tenantId: row.tenantId,
  sourceReleaseId: row.sourceReleaseId,
  artifactHash: row.artifactHash,
});
writeFileSync(
  resolve(output),
  JSON.stringify(
    {
      schema: "athyper.compiled-override-reconciliation/1",
      status: "unsigned_review_required",
      capturedInputByteHash: createHash("sha256").update(bytes).digest("hex"),
      platform: identity(platform),
      tenant: identity(tenant),
      artifacts,
      runtimeQualification,
      qualificationScope:
        "Current shared read registrations only; does not attest deployment-specific injected registrations, write handlers, persisted human reviews or active release admissibility.",
      recommendation:
        "Preserve tenant-only runtime members and explicitly review tenant deltas against the platform successor. Do not deactivate the tenant head or promote tenant changes into the product baseline automatically.",
      platformAuthor: null,
      platformIndependentReviewer: null,
      tenantAuthor: null,
      tenantIndependentReviewer: null,
      mergePerformed: false,
      publicationPerformed: false,
      approvalRecorded: false,
    },
    null,
    2,
  ) + "\n",
);
