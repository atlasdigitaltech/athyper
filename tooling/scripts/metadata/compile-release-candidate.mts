/**
 * Compile one explicit MetaEntity release candidate from hash-free authoring
 * input. This never signs, publishes, or activates a release.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { compileCompiledEntityArtifacts } from "../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js";

const artifactTypes = new Set(["core", "operation", "presentation_surface", "presentation_section", "flow"]);
const canonicalizer = {
  canonicalBytes: (value: unknown) => Buffer.from(JSON.stringify(stable(value))),
  sha256: (value: Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}`,
};

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || !value) throw new Error("Usage: --candidate <path> [--output <path>] [--publication-projection true]");
  args.set(key.slice(2), value);
}
const repository = resolve(import.meta.dirname, "../../..");
const entitiesRoot = resolve(repository, "metadata/entities");
const candidatePath = resolve(
  repository,
  args.get("candidate") ?? "metadata/review/release-candidates/business-partner-collaboration-ca08.json",
);
const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as Candidate;
assertCandidate(candidate);
const publicationProjection = args.get("publication-projection") === "true";
const catalog = JSON.parse(
  await readFile(resolve(entitiesRoot, "../review/registry-catalog.json"), "utf8"),
) as { entries: readonly RegistryEntry[] };
const documents = [
  ...await readDocuments(entitiesRoot),
  // Profiles keep their release-local logical refs (for example platform/...).
  ...await readDocuments(resolve(entitiesRoot, "../profiles")),
];
const byKey = new Map(
  documents
    .filter((document) => artifactTypes.has(String(document.value.artifactType)))
    .map((document) => [String(document.value.artifactKey), document]),
);
const closure = transitiveClosure(candidate.roots, byKey);
const replacementKeys = [...candidate.replacementArtifactKeys, ...candidate.addedArtifactKeys];
// A presentation replacement may explicitly narrow the navigation over artifacts
// already retained by the pinned runtime set. Do not traverse its broad source
// dependencies: that would accidentally promote deferred BP2 authoring into this
// release. Its direct dependencies are verified against the final runtime set below.
const directReplacementKeys = candidate.replacementArtifactKeys.filter((key) => !closure.has(key));
const artifactKeys = [...new Set([...closure, ...directReplacementKeys])].sort();
if (!sameSet(artifactKeys, candidate.expectedArtifactKeys))
  throw new Error(`Candidate artifact closure changed: ${difference(candidate.expectedArtifactKeys, artifactKeys)}`);
const forbidden = artifactKeys.filter((key) => candidate.forbiddenArtifactPrefixes.some((prefix) => key.startsWith(prefix)));
if (forbidden.length) throw new Error(`Candidate includes deferred artifact(s): ${forbidden.join(", ")}`);

const baseline = await readBaseline(candidate.baseline, repository);
if (new Set(replacementKeys).size !== replacementKeys.length)
  throw new Error("Candidate replacement artifact keys are duplicated");
for (const key of replacementKeys)
  if (!byKey.has(key)) throw new Error(`Candidate replacement source is missing: ${key}`);
for (const key of candidate.addedArtifactKeys)
  if (baseline.byKey.has(key)) throw new Error(`Candidate addition already exists in the pinned baseline: ${key}`);
for (const key of candidate.replacementArtifactKeys)
  if (!baseline.byKey.has(key)) throw new Error(`Candidate replacement is absent from the pinned baseline: ${key}`);

// A compiled runtime release replaces the whole pinned release.  The baseline is
// therefore carried forward byte-for-byte, while this candidate supplies only the
// explicitly approved collaboration and BP2-01 artifacts.  This prevents a small
// source slice from accidentally deleting live Business Partner behavior.
const runtimeDocuments = new Map(baseline.byKey);
for (const key of replacementKeys) runtimeDocuments.set(key, required(byKey.get(key), key));
const runtimeArtifactKeys = [...runtimeDocuments.keys()].sort();
if (!sameSet(runtimeArtifactKeys, candidate.expectedRuntimeArtifactKeys))
  throw new Error(`Candidate runtime artifact set changed: ${difference(candidate.expectedRuntimeArtifactKeys, runtimeArtifactKeys)}`);
for (const key of directReplacementKeys) {
  const dependencies = required(byKey.get(key), key).value.dependencies;
  if (!Array.isArray(dependencies) || dependencies.some((dependency) => typeof dependency !== "string" || !runtimeDocuments.has(dependency)))
    throw new Error(`Direct replacement dependencies are not retained by the runtime set: ${key}`);
}
const runtimeValues = runtimeArtifactKeys.map((key) => required(runtimeDocuments.get(key), key).value);
const baselineValues = [...baseline.byKey.values()].map((document) => document.value);
const providerClosure = deriveRegistryClosure(runtimeValues);
const baselineProviderClosure = deriveRegistryClosure(baselineValues);
const serviceKeys = [...collectValues(runtimeValues, "serviceKey")].sort();
if (providerClosure.evaluators.length && !serviceKeys.includes("neon.evaluator-registry.v1"))
  serviceKeys.unshift("neon.evaluator-registry.v1");
for (const key of baseline.externalDependencyKeys)
  if (!serviceKeys.includes(key)) serviceKeys.push(key);
serviceKeys.sort();
const declaredServices = candidate.release.externalDependencies.map((dependency) => dependency.serviceKey);
if (!sameSet(serviceKeys, declaredServices))
  throw new Error(`Candidate external dependency closure changed: ${difference(declaredServices, serviceKeys)}`);

const registry = Object.fromEntries(
  ["permission", "handler", "renderer", "resolver", "evaluator"].map((kind) => [
    `${kind}s`,
    new Set(catalog.entries.filter((entry) => entry.kind === kind).map((entry) => entry.key)),
  ]),
);
const { signature: _signature, ...releaseContent } = candidate.release;
const compilation = compileCompiledEntityArtifacts({
  canonicalizer,
  registry,
  release: {
    content: {
      ...releaseContent,
      ...(publicationProjection ? { contractStatus: "published" } : {}),
      signature: candidate.release.signature,
    },
  },
  artifacts: runtimeArtifactKeys.map((key) => {
    const { value } = required(runtimeDocuments.get(key), key);
    const { artifactHash: _hash, ...content } = value;
    return {
      // Baseline captures retain their evidence path (for example `baseline/...`).
      // A replacement release must publish canonical release-local references so
      // profile references in Core/Operation resolve through the pinned manifest.
      ref: canonicalRef(value),
      content: publicationProjection ? { ...content, contractStatus: "published" } : content,
    };
  }),
});
const status = new Map(catalog.entries.map((entry) => [`${entry.kind}:${entry.key}`, entry.status]));
const report = {
  ...compilation.report,
  candidateKey: candidate.candidateKey,
  roots: [...candidate.roots].sort(),
  sourceArtifactCount: artifactKeys.length,
  sourceArtifactKeys: artifactKeys,
  baseline: baseline.capturedFrom,
  carriedForwardArtifactCount: baseline.byKey.size - candidate.replacementArtifactKeys.length,
  replacementArtifactKeys: [...candidate.replacementArtifactKeys].sort(),
  addedArtifactKeys: [...candidate.addedArtifactKeys].sort(),
  releaseHash: compilation.release.releaseHash,
  signed: Boolean(candidate.release.signature.value),
  publicationProjection,
  activated: false,
  externalDependencyClosure: serviceKeys,
  permissionClosure: providerClosure.permissions.map((key) => ({ key, status: status.get(`permission:${key}`) ?? "missing" })),
  providerClosure: providerClosure.providers.map((entry) => ({ ...entry, status: status.get(`${entry.kind}:${entry.key}`) ?? "missing" })),
  introducedPermissionClosure: differenceValues(providerClosure.permissions, baselineProviderClosure.permissions).map((key) => ({ key, status: status.get(`permission:${key}`) ?? "missing" })),
  introducedProviderClosure: differenceProviders(providerClosure.providers, baselineProviderClosure.providers).map((entry) => ({ ...entry, status: status.get(`${entry.kind}:${entry.key}`) ?? "missing" })),
};
if (args.has("output")) await writeCompilation(resolve(repository, required(args.get("output"), "output")), compilation, report);
console.log(JSON.stringify(report, null, 2));

type Document = { readonly ref: string; readonly value: Record<string, any> };
type RegistryEntry = { readonly kind: string; readonly key: string; readonly status: string };
type Candidate = {
  readonly schema: string;
  readonly schemaVersion: number;
  readonly candidateKey: string;
  readonly targetPlanes: readonly string[];
  readonly roots: readonly string[];
  readonly expectedArtifactKeys: readonly string[];
  readonly expectedRuntimeArtifactKeys: readonly string[];
  readonly forbiddenArtifactPrefixes: readonly string[];
  readonly baseline: BaselineReference;
  readonly replacementArtifactKeys: readonly string[];
  readonly addedArtifactKeys: readonly string[];
  readonly release: Record<string, any> & { readonly externalDependencies: readonly { readonly serviceKey: string }[]; readonly signature: { readonly value: string } };
};
type BaselineReference = {
  readonly path: string;
  readonly publicationKey: string;
  readonly releaseId: string;
  readonly releaseHash: string;
  readonly artifactCount: number;
};
type Baseline = {
  readonly capturedFrom: Omit<BaselineReference, "path">;
  readonly byKey: ReadonlyMap<string, Document>;
  readonly externalDependencyKeys: readonly string[];
};

function assertCandidate(value: Candidate): void {
  if (value.schema !== "athyper.compiled-entity-release-candidate/1" || value.schemaVersion !== 1 || !value.candidateKey || value.targetPlanes.join(",") !== "neon" || !value.roots.length || !value.expectedArtifactKeys.length || !value.expectedRuntimeArtifactKeys.length || !value.release || !value.baseline?.path || !value.replacementArtifactKeys?.length || !value.addedArtifactKeys) throw new Error("Invalid release candidate");
}
async function readBaseline(reference: BaselineReference, repository: string): Promise<Baseline> {
  const path = resolve(repository, reference.path);
  const value = JSON.parse(await readFile(path, "utf8")) as {
    schema?: string; schemaVersion?: number; capturedFrom?: Record<string, unknown>;
    externalDependencies?: readonly { serviceKey?: string }[];
    artifacts?: readonly { ref?: string; content?: Record<string, unknown> }[];
  };
  if (value.schema !== "athyper.compiled-entity-baseline/1" || value.schemaVersion !== 1 || !value.capturedFrom || !Array.isArray(value.artifacts))
    throw new Error("Invalid pinned compiled entity baseline");
  const capturedFrom = value.capturedFrom as Baseline["capturedFrom"];
  for (const key of ["publicationKey", "releaseId", "releaseHash", "artifactCount"] as const)
    if (capturedFrom[key] !== reference[key]) throw new Error(`Pinned baseline ${key} does not match the candidate`);
  if (value.artifacts.length !== reference.artifactCount) throw new Error("Pinned baseline artifact count does not match the candidate");
  const documents = value.artifacts.map((artifact) => {
    if (!artifact.ref?.endsWith(".json") || !artifact.content || typeof artifact.content.artifactKey !== "string")
      throw new Error("Pinned baseline artifact is invalid");
    return { ref: artifact.ref, value: artifact.content } satisfies Document;
  });
  const byKey = new Map(documents.map((artifact) => [String(artifact.value.artifactKey), artifact]));
  if (byKey.size !== documents.length) throw new Error("Pinned baseline has duplicate artifact keys");
  const externalDependencyKeys = (value.externalDependencies ?? []).map((dependency) => dependency.serviceKey);
  if (externalDependencyKeys.some((key) => typeof key !== "string") || new Set(externalDependencyKeys).size !== externalDependencyKeys.length)
    throw new Error("Pinned baseline external dependencies are invalid");
  return { capturedFrom, byKey, externalDependencyKeys: Object.freeze([...externalDependencyKeys].sort()) };
}
async function readDocuments(root: string, prefix = ""): Promise<Document[]> {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const ref = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return readDocuments(root, `${ref}/`);
    if (!entry.isFile() || !ref.endsWith(".json")) return [];
    return [{ ref, value: JSON.parse(await readFile(resolve(root, ref), "utf8")) }];
  }))).flat();
}
function transitiveClosure(roots: readonly string[], byKey: ReadonlyMap<string, Document>): Set<string> {
  const result = new Set<string>();
  const pending = [...roots];
  for (const key of pending) {
    if (result.has(key)) continue;
    const document = required(byKey.get(key), `Missing candidate artifact ${key}`);
    result.add(key);
    pending.push(...(document.value.dependencies ?? []));
  }
  return result;
}
function deriveRegistryClosure(values: readonly Record<string, any>[]) {
  const kinds: Record<string, string> = { handlerKey: "handler", rendererKey: "renderer", resolverKey: "resolver", evaluatorKey: "evaluator" };
  const providers = new Map<string, { kind: string; key: string }>();
  const permissions = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return void value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "permissionCode" && typeof item === "string") permissions.add(item);
      if (kinds[key] && typeof item === "string") providers.set(`${kinds[key]}:${item}`, { kind: kinds[key]!, key: item });
      visit(item);
    }
  };
  values.forEach(visit);
  return { permissions: [...permissions].sort(), providers: [...providers.values()].sort((left, right) => `${left.kind}:${left.key}`.localeCompare(`${right.kind}:${right.key}`)), evaluators: [...providers.values()].filter((entry) => entry.kind === "evaluator") };
}
function collectValues(values: readonly unknown[], property: string): Set<string> {
  const result = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return void value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === property && typeof item === "string") result.add(item);
      visit(item);
    }
  };
  values.forEach(visit);
  return result;
}
function stable(value: any): any { return Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value; }
function sameSet(left: readonly string[], right: readonly string[]): boolean { const orderedLeft = [...left].sort(); const orderedRight = [...right].sort(); return orderedLeft.length === orderedRight.length && orderedLeft.every((value, index) => orderedRight[index] === value); }
function difference(expected: readonly string[], actual: readonly string[]): string { const missing = expected.filter((item) => !actual.includes(item)); const unexpected = actual.filter((item) => !expected.includes(item)); return JSON.stringify({ missing, unexpected }); }
function differenceValues(values: readonly string[], baseline: readonly string[]): string[] { const known = new Set(baseline); return values.filter((value) => !known.has(value)); }
function differenceProviders<T extends { kind: string; key: string }>(values: readonly T[], baseline: readonly T[]): T[] { const known = new Set(baseline.map((value) => `${value.kind}:${value.key}`)); return values.filter((value) => !known.has(`${value.kind}:${value.key}`)); }
function canonicalRef(value: Record<string, any>): string {
  const key = value.artifactKey;
  if (typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,126}(?:\/[A-Za-z][A-Za-z0-9_.-]{0,126})?$/.test(key))
    throw new Error("Invalid artifact key for canonical release reference");
  return `${key}.json`;
}
function required<T>(value: T | undefined, name: string): T { if (value === undefined) throw new Error(name); return value; }
async function writeCompilation(output: string, compilation: ReturnType<typeof compileCompiledEntityArtifacts>, report: unknown): Promise<void> {
  const save = async (path: string, value: unknown) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); };
  for (const { ref, artifact } of compilation.artifacts) await save(resolve(output, "entities", ref), artifact.content);
  await save(resolve(output, "entities", "release.json"), compilation.releaseDocument);
  await save(resolve(output, "compilation.json"), report);
}
