/**
 * Creates immutable review sources for a component deployment manifest. This is
 * deliberately offline: it cannot propose, approve, install, or publish a
 * component. The control API re-reads and qualifies every source at review.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseUiComponentResourceSource } from "@athyper/server-contract-meta-entity-authoring";
import {
  canonicalJson,
  sha256,
} from "@athyper/server-plane-studio-meta-entity-authoring";

const [manifestPath, outputPath, releaseNumbersPath, ...extra] =
  process.argv.slice(2);
if (!manifestPath || !outputPath || extra.length)
  throw Error(
    "Usage: tsx scripts/operations/prepare-component-resource-candidates.ts <component-manifest.json> <new-output-directory> [release-numbers.json]",
  );

const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
if (
  !manifest ||
  manifest.schema !== "entity.component-deployment/2" ||
  !Array.isArray(manifest.components) ||
  !manifest.components.length ||
  !Array.isArray(manifest.deployments) ||
  !manifest.deployments.length
)
  throw Error("COMPONENT_DEPLOYMENT_MANIFEST_INVALID");

const supplied = manifest.components.map(parseUiComponentResourceSource);
if (
  new Set(supplied.map((component) => component.declaration.id)).size !==
  supplied.length
)
  throw Error("COMPONENT_RESOURCE_CANDIDATES_NOT_UNIQUE");
const components = [
  // Map retains the last value for each key; order versions oldest first so
  // an older Studio-only declaration cannot replace a newer multi-plane one.
  ...new Map(
    supplied
      .sort(
        (left, right) =>
          left.declaration.componentVersion -
            right.declaration.componentVersion ||
          left.declaration.id.localeCompare(right.declaration.id),
      )
      .map((component) => [component.declaration.componentKey, component]),
  ).values(),
];
if (
  components.length !==
  new Set(components.map((component) => component.declaration.componentKey))
    .size
)
  throw Error("COMPONENT_RESOURCE_CANDIDATES_NOT_UNIQUE");

const deploymentPlanes = new Set(
  manifest.deployments.map(
    (deployment: { plane?: unknown }) => deployment.plane,
  ),
);
if (
  [...deploymentPlanes].some(
    (plane) => !["studio", "neon", "mesh"].includes(String(plane)),
  ) ||
  [...components].some((component) =>
    component.declaration.supportedPlanes.some(
      (plane) => !deploymentPlanes.has(plane),
    ),
  )
)
  throw Error("COMPONENT_DEPLOYMENT_PLANE_UNQUALIFIED");

const releaseNumbers: Record<string, number> | undefined = releaseNumbersPath
  ? JSON.parse(await readFile(resolve(releaseNumbersPath), "utf8"))
  : undefined;
if (
  releaseNumbersPath &&
  (!releaseNumbers ||
    typeof releaseNumbers !== "object" ||
    Array.isArray(releaseNumbers) ||
    components.some(
      (c) =>
        !Number.isSafeInteger(
          releaseNumbers[c.declaration.publicationResourceKey],
        ) || releaseNumbers[c.declaration.publicationResourceKey]! < 1,
    ) ||
    Object.keys(releaseNumbers).length !== components.length)
)
  throw Error("COMPONENT_RELEASE_NUMBERS_INVALID");

const root = resolve(outputPath);
await mkdir(root, { mode: 0o700 });
const generatedAt = new Date().toISOString();
const candidates = components
  .map((payload) => {
    const source = {
      generatedAt,
      kind: "entity_ui_component" as const,
      payload,
      publicationKey: payload.declaration.publicationResourceKey,
      releaseId: randomUUID(),
      releaseNo:
        releaseNumbers?.[payload.declaration.publicationResourceKey] ?? 1,
    };
    return {
      releaseId: source.releaseId,
      publicationKey: source.publicationKey,
      sourceHash: sha256(source),
      source,
    };
  })
  .sort((left, right) =>
    left.publicationKey.localeCompare(right.publicationKey),
  );
for (const candidate of candidates)
  await writeFile(
    resolve(root, `${candidate.releaseId}.json`),
    canonicalJson(candidate.source) + "\n",
    { flag: "wx", mode: 0o600 },
  );
await writeFile(
  resolve(root, "candidates.json"),
  canonicalJson({
    schema: "entity.component-resource-candidates/1",
    deploymentManifest: basename(manifestPath),
    deploymentManifestHash: sha256(manifest),
    candidates: candidates.map(
      ({ source: _source, ...candidate }) => candidate,
    ),
  }) + "\n",
  { flag: "wx", mode: 0o600 },
);
process.stdout.write(
  JSON.stringify(
    {
      root,
      candidates: candidates.map(
        ({ publicationKey, releaseId, sourceHash }) => ({
          publicationKey,
          releaseId,
          sourceHash,
        }),
      ),
    },
    null,
    2,
  ) + "\n",
);
