import { readFileSync, existsSync, readdirSync, realpathSync } from "node:fs";
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
  const manifest = read("metadata/manifest.json");
  assert(manifest.schema === "athyper.metadata-workspace/1", "Unsupported metadata workspace schema");
  const entities = sourcePath(metadataRoot, manifest.entitiesRoot);
  const profiles = sourcePath(metadataRoot, manifest.profilesRoot);
  function walk(root) {
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
      entry.name === "__pycache__"
        ? []
        : entry.isDirectory()
          ? walk(resolve(root, entry.name))
          : entry.isFile() ? [resolve(root, entry.name)] : [],
    );
  }
  const targets = new Set();
  for (const entry of inventory.deletedMetadataDisposition) {
    assert(entry.byteIdenticalDestinations.length === 1, `Ambiguous relocation evidence: ${entry.source}`);
    const to = entry.byteIdenticalDestinations[0];
    assert(!targets.has(to), `Duplicate relocation destination: ${to}`);
    targets.add(to);
    const destination = sourcePath(repository, to);
    assert(existsSync(destination), `Missing relocated file: ${to}`);
    // The old compatibility README is evidence-bound documentation, not a JSON definition.
    if (to.endsWith(".json")) assert(!existsSync(sourcePath(repository, entry.source)), `Duplicate old definition: ${entry.source}`);
    if (baseline && to.endsWith(".json")) assert(
      createHash("sha256").update(readFileSync(destination)).digest("hex") === entry.sha256,
      `JSON differs from relocation baseline (feature edits require review): ${to}`,
    );
  }
  function checkRefs(value, file) {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      const refs = key === "ref" || key.endsWith("Ref") ? [item]
        : key.endsWith("Refs") && Array.isArray(item) ? item : [];
      for (const ref of refs) if (typeof ref === "string" && ref.endsWith(".json")) {
        const candidates = [sourcePath(entities, ref), sourcePath(profiles, ref)].filter(existsSync);
        assert(candidates.length === 1, `${candidates.length ? "Ambiguous" : "Unresolved"} logical reference: ${file}: ${ref}`);
      }
      checkRefs(item, file);
    }
  }
  const files = walk(entities).filter((file) => file.endsWith(".json"));
  const profileFiles = walk(profiles).filter((file) => file.endsWith(".json"));
  const artifactKeys = new Set();
  for (const file of [...files, ...profileFiles]) {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (value.artifactKey) {
      assert(!artifactKeys.has(value.artifactKey), `Duplicate artifact identity: ${value.artifactKey}`);
      artifactKeys.add(value.artifactKey);
    }
    checkRefs(value, relative(metadataRoot, file));
  }
  // This workspace declares roots, not a single product release. Validate an
  // explicit releaseEntry only when supplied; never infer one from entity names.
  if (manifest.releaseEntry !== undefined) assert(existsSync(sourcePath(entities, manifest.releaseEntry)), "Missing release entry");
  const reviewRoot = sourcePath(metadataRoot, manifest.reviewRoot);
  const schemasRoot = sourcePath(metadataRoot, manifest.schemasRoot);
  assert(existsSync(resolve(reviewRoot, "registry-catalog.json")), "Missing registry evidence");
  assert(existsSync(resolve(schemasRoot, "entity-artifacts-v2/core.schema.json")), "Missing artifact schema");
  return { relocatedFiles: targets.size, entityJsonFiles: files.length, profileJsonFiles: profileFiles.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkLayout(undefined, { baseline: process.argv.includes("--baseline") });
  console.log(`Layout verified: ${result.relocatedFiles} relocated files, ${result.entityJsonFiles} entity JSON files, ${result.profileJsonFiles} profile JSON files; logical references resolve. No publication performed.`);
}
