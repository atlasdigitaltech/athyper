import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, relative, sep } from "node:path";

export function checkLayout(
  repository = fileURLToPath(new URL("../../../", import.meta.url)),
  { baseline = false } = {},
) {
  const read = (path) =>
    JSON.parse(readFileSync(resolve(repository, path), "utf8"));
  const inventory = read("metadata/relocation-map.json");
  const productRoot = resolve(repository, "metadata/products/mdg");
  const manifest = read("metadata/products/mdg/manifest.json");
  const entities = resolve(productRoot, manifest.entitiesRoot);
  function assert(ok, message) {
    if (!ok) throw Error(message);
  }
  function walk(root) {
    return readdirSync(root, { withFileTypes: true }).flatMap((e) =>
      e.name === "__pycache__"
        ? []
        : e.isDirectory()
          ? walk(resolve(root, e.name))
          : [resolve(root, e.name)],
    );
  }
  const targets = new Set();
  for (const entry of inventory.files) {
    assert(
      !targets.has(entry.to),
      `Duplicate relocation destination: ${entry.to}`,
    );
    targets.add(entry.to);
    assert(
      existsSync(resolve(repository, entry.to)),
      `Missing relocated file: ${entry.to}`,
    );
    if (!entry.to.endsWith(".json")) continue;
    assert(
      !existsSync(resolve(repository, entry.from)),
      `Duplicate old definition: ${entry.from}`,
    );
    if (baseline)
      assert(
        createHash("sha256")
          .update(readFileSync(resolve(repository, entry.to)))
          .digest("hex") === entry.sha256,
        `JSON differs from relocation baseline (feature edits require review): ${entry.to}`,
      );
  }
  function checkRefs(value, file) {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      const refs =
        key === "ref" || key.endsWith("Ref")
          ? [item]
          : key.endsWith("Refs") && Array.isArray(item)
            ? item
            : [];
      for (const ref of refs)
        if (typeof ref === "string" && ref.endsWith(".json")) {
          const target = resolve(entities, ref);
          assert(
            !relative(entities, target).startsWith(`..${sep}`),
            `Reference escapes entity package: ${file}: ${ref}`,
          );
          assert(
            existsSync(target),
            `Unresolved logical reference: ${file}: ${ref}`,
          );
        }
      checkRefs(item, file);
    }
  }
  const files = walk(entities).filter((f) => f.endsWith(".json"));
  const artifactKeys = new Set();
  for (const file of files) {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (value.artifactKey) {
      assert(
        !artifactKeys.has(value.artifactKey),
        `Duplicate artifact identity: ${value.artifactKey}`,
      );
      artifactKeys.add(value.artifactKey);
    }
    checkRefs(value, relative(entities, file));
  }
  assert(
    existsSync(resolve(entities, manifest.releaseEntry)),
    "Missing release entry",
  );
  assert(
    existsSync(
      resolve(productRoot, manifest.reviewRoot, "registry-catalog.json"),
    ),
    "Missing registry evidence",
  );
  assert(
    existsSync(resolve(productRoot, manifest.schemasRoot, "core.schema.json")),
    "Missing artifact schema",
  );
  return {
    relocatedFiles: inventory.files.length,
    entityJsonFiles: files.length,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = checkLayout(undefined, {
    baseline: process.argv.includes("--baseline"),
  });
  console.log(
    `Layout verified: ${result.relocatedFiles} relocated files, ${result.entityJsonFiles} entity JSON files; logical references resolve. No publication performed.`,
  );
}
