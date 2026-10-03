import { discoverWorkspace, resolveSourcePath } from "./source-workspace.mjs";
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, relative, sep, isAbsolute } from "node:path";

export function checkLayout(
  repository = fileURLToPath(new URL("../../../", import.meta.url)),
  { baseline = false } = {},
) {
  function assert(ok, message) {
    if (!ok) throw Error(message);
  }
  function within(root, path) {
    const rel = relative(root, path);
    return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  }
  function sourcePath(root, ref) {
    assert(typeof ref === "string" && ref.length > 0 && !isAbsolute(ref), `Invalid source reference: ${ref}`);
    const path = resolve(root, ref);
    assert(within(root, path), `Reference escapes source root: ${ref}`);
    if (existsSync(path)) assert(within(realpathSync(root), realpathSync(path)), `Reference escapes source root through symlink: ${ref}`);
    return path;
  }
  const read = (path) => JSON.parse(readFileSync(sourcePath(repository, path), "utf8"));
  // Frozen checkpoint evidence replaces the missing active relocation-map.json.
  // Historical inventories remain unchanged and are not active definitions.
  const inventory = read("docs/reviews/entity-metadata-checkpoint-inventory-20261003.json");
  const metadataRoot = resolve(repository, "metadata");
  const workspace = discoverWorkspace(metadataRoot);
  const { entitiesRoot: entities, profilesRoot: profiles } = workspace;
  const targets = new Set();
  for (const entry of inventory.deletedMetadataDisposition) {
    assert(entry.byteIdenticalDestinations.length === 1, `Ambiguous relocation evidence: ${entry.source}`);
    const to = entry.byteIdenticalDestinations[0];
    assert(!targets.has(to), `Duplicate relocation destination: ${to}`);
    targets.add(to);
    const destination = resolveSourcePath(sourcePath(repository, to));
    assert(existsSync(destination), `Missing relocated file: ${to}`);
    // The old compatibility README is evidence-bound documentation, not a JSON definition.
    if (to.endsWith(".json")) assert(!existsSync(sourcePath(repository, entry.source)), `Duplicate old definition: ${entry.source}`);
    if (baseline && to.endsWith(".json")) assert(
      createHash("sha256").update(readFileSync(destination)).digest("hex") === entry.sha256,
      `JSON differs from relocation baseline (feature edits require review): ${to}`,
    );
  }
  const files = workspace.documents.filter((document) => within(entities, document.path));
  const profileFiles = workspace.documents.filter((document) => within(profiles, document.path));
  assert(existsSync(resolve(workspace.reviewRoot, "registry-catalog.json")), "Missing registry evidence");
  assert(existsSync(resolve(workspace.schemasRoot, "entity-artifacts-v2/core.schema.json")), "Missing artifact schema");
  return { relocatedFiles: targets.size, entityJsonFiles: files.length, profileJsonFiles: profileFiles.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkLayout(undefined, { baseline: process.argv.includes("--baseline") });
  console.log(`Layout verified: ${result.relocatedFiles} relocated files, ${result.entityJsonFiles} entity JSON files, ${result.profileJsonFiles} profile JSON files; logical references resolve. No publication performed.`);
}
