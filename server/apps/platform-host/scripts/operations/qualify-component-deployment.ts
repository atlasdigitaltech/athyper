/** Read-only renderer deployment qualification. This never approves or publishes. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, isAbsolute, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { canonicalJson } from "@athyper/server-plane-studio-meta-entity-authoring";
import { createDeployedComponentQualification } from "../../src/composition/shared/publication/component-qualification.js";

const [configPath, outputPath, ...extra] = process.argv.slice(2);
if (!configPath || !outputPath || extra.length)
  throw Error(
    "Usage: qualify-component-deployment.ts <configuration.json> <new-evidence.json>",
  );
const c = JSON.parse(await readFile(configPath, "utf8"));
if (
  !c ||
  Object.keys(c).sort().join() !== "assets,hash,manifest,root,schema" ||
  ![
    "entity.component-deployment-probe/1",
    "entity.component-deployment-probe/2",
  ].includes(c.schema) ||
  !Array.isArray(c.assets) ||
  !c.assets.length ||
  c.assets.length > 20
)
  throw Error("COMPONENT_PROBE_CONFIGURATION_INVALID");
const canonical = {
  canonicalBytes: (v: unknown) => Buffer.from(canonicalJson(v)),
  sha256: (v: Uint8Array) => createHash("sha256").update(v).digest("hex"),
};
const qualify = createDeployedComponentQualification(
  {
    PUBLICATION_COMPONENT_DEPLOYMENT_ROOT: c.root,
    PUBLICATION_COMPONENT_DEPLOYMENT_MANIFEST: c.manifest,
    PUBLICATION_COMPONENT_DEPLOYMENT_HASH: c.hash,
  },
  canonical,
)!;
const manifest = JSON.parse(
  await readFile(resolve(c.root, c.manifest), "utf8"),
);
for (const component of manifest.components) await qualify(component);
const multi = manifest.schema === "entity.component-deployment/2";
if (multi !== (c.schema === "entity.component-deployment-probe/2"))
  throw Error("COMPONENT_PROBE_VERSION_MISMATCH");
const inventories = multi
  ? manifest.deployments
  : [{ plane: manifest.plane, files: manifest.files }];
const assets = [];
for (const asset of c.assets) {
  if (
    !asset ||
    Object.keys(asset).sort().join() !== (multi ? "path,plane,url" : "path,url")
  )
    throw Error("COMPONENT_PROBE_ASSET_INVALID");
  const plane = multi ? asset.plane : manifest.plane;
  const inventory = inventories.find(
    (entry: { plane: string }) => entry.plane === plane,
  );
  if (!inventory || (multi && !["studio", "neon", "mesh"].includes(plane)))
    throw Error("COMPONENT_PROBE_PLANE_REQUIRED");
  const url = new URL(asset.url);
  if (
    url.protocol !== "https:" ||
    (multi && url.hostname !== `${plane}.dev.athyper.test`) ||
    !url.hostname.endsWith(".dev.athyper.test") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("COMPONENT_PROBE_LOCAL_HTTPS_REQUIRED");
  const path = relative(resolve(c.root), resolve(c.root, asset.path));
  if (
    !path ||
    path === ".." ||
    path.startsWith(".." + sep) ||
    isAbsolute(path) ||
    !inventory.files.some((f: { path: string }) => f.path === asset.path)
  )
    throw Error("COMPONENT_PROBE_INVENTORIED_ASSET_REQUIRED");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error("COMPONENT_PROBE_HTTP_FAILED:" + response.status);
  if (!response.body) throw Error("COMPONENT_PROBE_EMPTY_RESPONSE");
  const digest = createHash("sha256");
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > 64 * 1024 * 1024)
      throw Error("COMPONENT_PROBE_RESPONSE_TOO_LARGE");
    digest.update(chunk);
  }
  const actual = digest.digest("hex");
  const expected = inventory.files.find(
    (f: { path: string }) => f.path === asset.path,
  ).sha256;
  if (actual !== expected) throw Error("COMPONENT_PROBE_HTTP_BYTES_CHANGED");
  assets.push({
    plane,
    url: url.href,
    path: asset.path,
    sha256: actual,
    status: response.status,
  });
}
if (
  inventories.some(
    (entry: { plane: string }) =>
      !assets.some((asset) => asset.plane === entry.plane),
  )
)
  throw Error("COMPONENT_PROBE_PLANE_COVERAGE_REQUIRED");
const evidence = {
  schema: multi
    ? "entity.component-deployment-probe-result/2"
    : "entity.component-deployment-probe-result/1",
  recordedAt: new Date().toISOString(),
  manifestHash: c.hash,
  components: manifest.components.map(
    (x: { declaration: { id: string; componentKey: string } }) => x.declaration,
  ),
  fileCount: inventories.reduce(
    (count: number, entry: { files: unknown[] }) => count + entry.files.length,
    0,
  ),
  assets,
  approval: "not-established",
  entityActivation: "not-established",
};
await writeFile(outputPath, JSON.stringify(evidence, null, 2) + "\n", {
  flag: "wx",
  mode: 0o600,
});
console.log(
  JSON.stringify({
    components: evidence.components.length,
    files: evidence.fileCount,
    assets: assets.length,
    approval: evidence.approval,
  }),
);
