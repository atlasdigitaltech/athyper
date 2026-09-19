import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

// Isolated production entry: detect accidental eager imports of the full chooser.
const bundle = await build({
  entryPoints: [
    "packages/platform/entity/runtime/form-detail/src/entity-lookup.tsx",
  ],
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  metafile: true,
  write: false,
  outdir: "/tmp/athyper-field-control-chunks",
  external: ["react", "react/*", "react-dom", "react-dom/*"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "silent",
});
const outputs = bundle.metafile.outputs;
const entry = Object.entries(outputs).find(([, output]) =>
  output.entryPoint?.endsWith("form-detail/src/entity-lookup.tsx"),
)?.[0];
if (!entry) throw Error("Missing lookup entry");
const eager = new Set();
function visit(path) {
  if (eager.has(path)) return;
  eager.add(path);
  for (const imported of outputs[path]?.imports ?? [])
    if (!imported.external && imported.kind !== "dynamic-import")
      visit(imported.path);
}
visit(entry);
const runtime = "packages/platform/entity/runtime/list-view/src/index.tsx";
if (
  [...eager].some((path) => Object.hasOwn(outputs[path]?.inputs ?? {}, runtime))
)
  throw Error(
    "Full list chooser leaked into the initial compact lookup bundle",
  );
if (
  !Object.values(outputs).some((output) =>
    Object.hasOwn(output.inputs, runtime),
  )
)
  throw Error("Full chooser was not included in deferred output");

const searchModule = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `export {indexReferenceOptions, searchIndexedReferenceOptions} from './packages/platform/foundation/ui/src/searchable-select.tsx';`,
  },
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  write: false,
  external: ["react", "react/*", "react-dom", "react-dom/*"],
  logLevel: "silent",
});
// The production tree shaker removes the React component and its imports.
const source = searchModule.outputFiles[0].text;
// Import from a workspace-local temporary module so React externals resolve.
const { mkdtempSync, rmSync } = await import("node:fs");
const { pathToFileURL } = await import("node:url");
const temp = mkdtempSync("node_modules/.field-control-perf-");
let samples;
try {
  const file = `${temp}/search.mjs`;
  writeFileSync(file, source);
  const { indexReferenceOptions, searchIndexedReferenceOptions } = await import(
    pathToFileURL(`${process.cwd()}/${file}`)
  );
  const options = Array.from({ length: 500 }, (_, i) => ({
    value: `C${i}`,
    label: `Country ${i}`,
  }));
  const index = indexReferenceOptions(options, "en");
  if (index !== indexReferenceOptions(options, "en"))
    throw Error("Repeated controls did not share the catalogue index");
  samples = [];
  for (let i = 0; i < 120; i++) {
    const start = performance.now();
    for (const query of ["C24", "country 2", "unmatched", ""])
      searchIndexedReferenceOptions(index, query);
    if (i >= 20) samples.push((performance.now() - start) / 4);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
samples.sort((a, b) => a - b);
const p95 = samples[Math.floor(samples.length * 0.95)];
if (p95 > 100) throw Error(`Local search exceeds 100ms target: ${p95}ms`);
const eagerFiles = bundle.outputFiles.filter((file) =>
  [...eager].some((path) => file.path.endsWith(path.replace(/^(\.\.\/)+/, ""))),
);
const report = {
  measuredAt: new Date().toISOString(),
  fixture:
    "Isolated production compact lookup; React external; 500 local choices",
  fullChooserDeferred: true,
  eagerChunks: eager.size,
  eagerRawBytes: [...eager].reduce(
    (sum, key) => sum + (outputs[key]?.bytes ?? 0),
    0,
  ),
  eagerGzipBytes: eagerFiles.reduce(
    (sum, file) => sum + gzipSync(file.contents).byteLength,
    0,
  ),
  localSearchP95Milliseconds: Number(p95.toFixed(4)),
  limits:
    "Search timing excludes browser rendering. Bundle numbers are an isolated fixture, not a deployed application or a before/after baseline.",
};
if (process.argv.includes("--write"))
  writeFileSync(
    "docs/ui/global-field-controls-performance.json",
    JSON.stringify(report, null, 2) + "\n",
  );
console.log(JSON.stringify(report, null, 2));
