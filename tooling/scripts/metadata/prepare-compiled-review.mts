/** Freeze the complete compiler output for review. Never marks source published or signs it. */
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { compileCompiledEntityArtifacts } from "../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js";
const root = resolve("metadata/products/mdg/entities");
const output = resolve(
  process.argv[2] ?? "docs/reports/bp-integration-20260921/compiled-review",
);
const stable = (v: any): any =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
const canonicalizer = {
  canonicalBytes: (v: unknown) => Buffer.from(JSON.stringify(stable(v))),
  sha256: (v: Uint8Array) =>
    `sha256:${createHash("sha256").update(v).digest("hex")}`,
};
async function paths(dir: string, prefix = ""): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory()
          ? paths(resolve(dir, e.name), `${prefix}${e.name}/`)
          : e.name.endsWith(".json")
            ? [`${prefix}${e.name}`]
            : [],
      ),
    )
  ).flat();
}
const documents = await Promise.all(
  (await paths(root)).map(async (ref) => ({
    ref,
    value: JSON.parse(await readFile(resolve(root, ref), "utf8")),
  })),
);
const release = documents.find(
  (d) => d.value.artifactType === "release_envelope",
);
if (!release || release.value.contractStatus !== "unsigned_review_only")
  throw Error("An unsigned review source is required");
const catalog = JSON.parse(
  await readFile(resolve(root, "../review/registry-catalog.json"), "utf8"),
);
const keys = (kind: string) =>
  new Set<string>(
    catalog.entries.filter((e: any) => e.kind === kind).map((e: any) => e.key),
  );
const {
  artifacts: _artifacts,
  releaseHash: _hash,
  signature: _signature,
  ...content
} = release.value;
const compilation = compileCompiledEntityArtifacts({
  canonicalizer,
  registry: {
    permissions: keys("permission"),
    handlers: keys("handler"),
    renderers: keys("renderer"),
    resolvers: keys("resolver"),
    evaluators: keys("evaluator"),
  },
  release: {
    content: { ...content, signature: { algorithm: "", keyId: "", value: "" } },
  },
  artifacts: documents
    .filter((d) =>
      [
        "core",
        "operation",
        "presentation_surface",
        "presentation_section",
        "flow",
      ].includes(d.value.artifactType),
    )
    .map(({ ref, value }) => {
      const { artifactHash: _hash, ...content } = value;
      return { ref, content };
    }),
});
async function save(path: string, value: unknown) {
  const bytes = JSON.stringify(value, null, 2) + "\n";
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: "wx" });
  } catch (error: any) {
    if (error.code !== "EEXIST" || (await readFile(path, "utf8")) !== bytes)
      throw error;
  }
}
for (const { ref, artifact } of compilation.artifacts)
  await save(resolve(output, "entities", ref), artifact.content);
await save(
  resolve(output, "entities", release.ref),
  compilation.releaseDocument,
);
await save(resolve(output, "review/registry-catalog.json"), catalog);
for (const name of [
  "index-catalog",
  "permission-catalog",
  "shape-catalog",
  "source-coverage",
  "storage-catalog",
]) {
  await save(
    resolve(output, `review/${name}.json`),
    JSON.parse(await readFile(resolve(root, `../review/${name}.json`), "utf8")),
  );
}
const report = {
  ...compilation.report,
  releaseHash: compilation.release.releaseHash,
  signed: false,
  activated: false,
  registryPublicationPending: catalog.entries
    .filter((e: any) => e.status !== "published")
    .map((e: any) => `${e.kind}:${e.key}`)
    .sort(),
};
await save(resolve(output, "compilation.json"), report);
console.log(JSON.stringify(report, null, 2));
