/** Offline authoring-source discovery. The index is derived on every load and is
 * never a second authoring definition or a published runtime registry. */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { coverageReport } from "./coverage-report.mjs";

const excluded = new Set(["review", "history", "generated", "codegen", "dist", "build", "out", "node_modules", "__pycache__"]);
const descriptorKeys = new Set(["schema", "entityCode", "definition", "artifacts", "placement", "localization", "capabilities", "activity", "release"]);
const classificationKeys = ["authoringOwnership", "entityClass", "ownershipModel", "targets"];
const planes = new Set(["studio", "neon", "mesh"]);
const entityClasses = new Set(["business", "configuration", "reference", "process", "projection", "technical"]);
const ownershipModels = new Set(["system", "package", "tenant", "overlay"]);
const memberKeys = ["definition", "placement", "localization", "capabilities", "activity", "release"];
const fail = (message) => { throw new Error(`Metadata source configuration: ${message}`); };
const json = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch (error) { fail(`${path}: ${error.message}`); } };
const inside = (root, path) => { const rel = relative(root, path); return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
function safeRef(ref, exclude = true) {
  if (typeof ref !== "string" || !ref || isAbsolute(ref) || ref.includes("\\") || ref.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith(".") || (exclude && excluded.has(part)))) fail(`invalid or excluded source path ${JSON.stringify(ref)}`);
  return ref;
}
function requiredPath(root, ref, directory = false, exclude = true) {
  safeRef(ref, exclude);
  const path = resolve(root, ref);
  if (!existsSync(path) || !inside(realpathSync(root), realpathSync(path))) fail(`missing or escaping source path ${ref} beneath ${root}`);
  if (directory ? !statSync(path).isDirectory() : !statSync(path).isFile()) fail(`expected ${directory ? "directory" : "file"}: ${path}`);
  return path;
}
function files(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.name.startsWith(".") || excluded.has(entry.name)) return [];
    const path = resolve(root, entry.name);
    if (entry.isSymbolicLink()) fail(`symlink in active source tree: ${path}`);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}

/** Draft classification records unresolved graph properties as null. Target
 * intent never expands an artifact's compiled plane or attests publication. */
function validateClassification(descriptor, directory, file) {
  if (descriptor.authoringOwnership !== "platform") fail(`${file}: authoringOwnership must be platform for product defaults`);
  for (const key of ["entityClass", "ownershipModel"]) {
    const value = descriptor[key];
    const supported = key === "entityClass" ? entityClasses : ownershipModels;
    if (value !== null && !supported.has(value)) fail(`${file}: ${key} must be one of ${[...supported].join(", ")} or null for an unresolved draft`);
  }
  const targets = descriptor.targets;
  if (!targets || Object.keys(targets).sort().join() !== ["declared", "recommended", "required"].sort().join()) fail(`${file}: targets must declare declared, required and recommended plane arrays`);
  for (const [kind, values] of Object.entries(targets)) {
    if (!Array.isArray(values) || values.some((plane) => !planes.has(plane)) || new Set(values).size !== values.length || (kind === "declared" && !values.length)) fail(`${file}: targets.${kind} contains missing, duplicate or unsupported planes`);
  }
  if (targets.required.some((plane) => targets.recommended.includes(plane))) fail(`${file}: required and recommended targets overlap`);
  const native = descriptor.definition ? json(requiredPath(directory, descriptor.definition)) : undefined;
  const artifacts = (descriptor.artifacts ?? []).map((ref) => json(requiredPath(directory, ref)));
  const observed = native?.planes ?? [...new Set(artifacts.filter((artifact) => artifact.artifactType === "core").map((artifact) => artifact.plane))];
  if (!Array.isArray(observed) || observed.length !== targets.declared.length || !observed.every((plane) => targets.declared.includes(plane))) fail(`${file}: targets.declared must match the canonical definition or split core planes`);
  for (const artifact of artifacts) {
    if (artifact.artifactType === "core" && artifact.entityCode !== descriptor.entityCode) fail(`${file}: core artifact ${artifact.artifactKey} belongs to another entity`);
    if (artifact.plane && !targets.declared.includes(artifact.plane)) fail(`${file}: artifact plane ${artifact.plane} is outside declared targets`);
  }
  if (native) {
    const reference = native.schema === "athyper.shared-reference-product/1";
    const entity = reference ? { entityCode: native.definition?.entityCode, entityClass: "reference", ownershipModel: "system" } : native.definition?.entity;
    if (!entity || entity.entityCode !== descriptor.entityCode || entity.entityClass !== descriptor.entityClass || entity.ownershipModel !== descriptor.ownershipModel) fail(`${file}: classification must match the native product graph`);
  }
  if (descriptor.placement) {
    const placement = json(requiredPath(directory, descriptor.placement));
    if (placement.schema !== "athyper.entity-placement/1" || placement.entityCode !== descriptor.entityCode || !Array.isArray(placement.placements)) fail(`${file}: invalid placement identity or placements`);
    if (placement.placements.some((entry) => !targets.declared.includes(entry.plane))) fail(`${file}: placement plane is outside declared targets`);
    // Native products use one authoring module identity. Prefer the Studio
    // source placement; target navigation remains independently configured.
    const sourcePlane = targets.declared.includes("studio") ? "studio" : targets.declared[0];
    const sourcePlacement = placement.placements.find((entry) => entry.plane === sourcePlane);
    if (native && sourcePlacement && native.moduleCode !== sourcePlacement.module) fail(`${file}: native moduleCode must match the ${sourcePlane} authoring placement module ${sourcePlacement.module}`);
  }
}

export function discoverWorkspace(metadataRoot = fileURLToPath(new URL("../../../metadata/", import.meta.url))) {
  metadataRoot = resolve(metadataRoot);
  const manifest = json(resolve(metadataRoot, "manifest.json"));
  if (manifest?.schema !== "athyper.metadata-workspace/1") fail(`${metadataRoot}/manifest.json: unsupported workspace schema`);
  const entitiesRoot = requiredPath(metadataRoot, manifest.entitiesRoot, true);
  const profilesRoot = requiredPath(metadataRoot, manifest.profilesRoot, true);
  const reviewRoot = requiredPath(metadataRoot, manifest.reviewRoot, true, false);
  const schemasRoot = requiredPath(metadataRoot, manifest.schemasRoot, true);
  const roots = [entitiesRoot, profilesRoot, reviewRoot, schemasRoot];
  if (roots.some((a, i) => roots.some((b, j) => i !== j && inside(a, b)))) fail("workspace roots must be distinct and non-overlapping");
  const entityFiles = files(entitiesRoot);
  const entities = new Map();
  for (const file of entityFiles.filter((path) => path.endsWith(`${sep}entity.json`))) {
    const descriptor = json(file);
    if (!descriptor || !["athyper.entity-source/1", "athyper.entity-source/2"].includes(descriptor.schema)) fail(`${file}: unsupported entity descriptor schema; expected athyper.entity-source/1 or /2`);
    const classified = descriptor.schema === "athyper.entity-source/2";
    const unknown = Object.keys(descriptor).filter((key) => !descriptorKeys.has(key) && !(classified && classificationKeys.includes(key)));
    if (unknown.length) fail(`${file}: unsupported descriptor properties: ${unknown.join(", ")}`);
    const code = descriptor.entityCode;
    if (typeof code !== "string" || !/^[a-z][a-z0-9_]*$/.test(code)) fail(`${file}: invalid entityCode`);
    safeRef(code);
    if (entities.has(code)) fail(`competing declarations for ${code}: ${entities.get(code).descriptorPath} and ${file}`);
    if (descriptor.artifacts !== undefined && (!Array.isArray(descriptor.artifacts) || descriptor.artifacts.some((ref) => typeof ref !== "string"))) fail(`${file}: artifacts must be an array of file references`);
    if (!descriptor.definition && !descriptor.artifacts?.length) fail(`${file}: declare definition or artifacts`);
    const directory = dirname(file);
    const members = [...memberKeys.filter((key) => descriptor[key] !== undefined).map((key) => descriptor[key]), ...(descriptor.artifacts ?? [])];
    if (new Set(members).size !== members.length) fail(`${file}: duplicate descriptor member`);
    for (const ref of members) {
      if (typeof ref !== "string" || !ref.endsWith(".json")) fail(`${file}: expected a JSON member reference, received ${JSON.stringify(ref)}`);
      requiredPath(directory, ref);
    }
    if (classified) validateClassification(descriptor, directory, file);
    entities.set(code, { entityCode: code, directory, descriptorPath: file, descriptor });
  }
  if (!entities.size) fail(`${entitiesRoot}: no entity.json declarations found`);
  const documents = [];
  const byRef = new Map();
  const byArtifact = new Map();
  function add(ref, path, owner) {
    if (byRef.has(ref)) fail(`ambiguous logical reference ${ref}: ${byRef.get(ref).path} and ${path}`);
    const value = json(path);
    // Only entity.json declares an entity. Core, operations and presentations
    // may repeat the owning entityCode without declaring competing entities.
    if (owner && ["athyper.entity-source/1", "athyper.entity-source/2"].includes(value?.schema) && path !== owner.descriptorPath) fail(`${path}: entity descriptors must be named entity.json`);
    if (value?.artifactKey) {
      if (byArtifact.has(value.artifactKey)) fail(`duplicate artifact identity ${value.artifactKey}: ${byArtifact.get(value.artifactKey)} and ${path}`);
      byArtifact.set(value.artifactKey, path);
    }
    const document = { ref, path, value };
    byRef.set(ref, document);
    documents.push(document);
  }
  for (const path of entityFiles.filter((path) => path.endsWith(".json"))) {
    const owners = [...entities.values()].filter((entry) => inside(entry.directory, path));
    if (owners.length !== 1) fail(`${path}: expected one owning entity.json, found ${owners.length}`);
    const owner = owners[0];
    add(`${owner.entityCode}/${relative(owner.directory, path).split(sep).join("/")}`, path, owner);
  }
  for (const path of files(profilesRoot).filter((path) => path.endsWith(".json"))) add(relative(profilesRoot, path).split(sep).join("/"), path);
  // Preserve the existing capability-profile source-lock and {code, version}
  // contracts. This resolves source identity only; native profile parsing and
  // binding validation remain in the publication contract/compiler.
  const capabilityProfiles = new Map();
  for (const document of documents.filter((entry) => inside(profilesRoot, entry.path) && entry.path.endsWith(`${sep}source-lock.json`))) {
    const lock = document.value;
    if (lock?.schema !== "athyper.capability-profile-source-lock/1" || !Array.isArray(lock.profiles) || Object.keys(lock).some((key) => !["schema", "profiles"].includes(key))) fail(`${document.path}: unsupported capability profile source lock`);
    for (const entry of lock.profiles) {
      if (!entry || Object.keys(entry).sort().join() !== ["code", "file", "sha256", "version"].sort().join() || typeof entry.code !== "string" || !Number.isSafeInteger(entry.version) || entry.version < 1 || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail(`${document.path}: invalid capability profile lock entry`);
      const path = requiredPath(dirname(document.path), entry.file);
      const profile = documents.find((candidate) => candidate.path === path)?.value;
      const key = `${entry.code}@${entry.version}`;
      if (createHash("sha256").update(readFileSync(path)).digest("hex") !== entry.sha256) fail(`${path}: capability profile source hash differs from ${document.path}`);
      if (profile?.schema !== "athyper.capability-profile/1" || profile.profileCode !== entry.code || profile.profileVersion !== entry.version) fail(`${path}: capability profile identity does not match ${key}`);
      if (capabilityProfiles.has(key)) fail(`${document.path}: competing capability profile ${key}`);
      capabilityProfiles.set(key, path);
    }
  }
  function resolveProfile(selection) {
    if (!selection || Object.keys(selection).sort().join() !== "code,version" || typeof selection.code !== "string" || !Number.isSafeInteger(selection.version) || selection.version < 1) fail(`invalid capability profile selection ${JSON.stringify(selection)}`);
    const key = `${selection.code}@${selection.version}`;
    const path = capabilityProfiles.get(key);
    if (!path) fail(`unresolved required capability profile ${key}; declare it in a supported source-lock.json`);
    return path;
  }
  function resolveRef(ref) {
    safeRef(ref);
    const document = byRef.get(ref);
    if (!document) fail(`unresolved required logical reference ${ref}`);
    return document.path;
  }
  function checkRefs(value, file) {
    if (!value || typeof value !== "object") return;
    if ((value.schema === "athyper.entity-activity-source/1" || typeof value.capabilityKey === "string") && value.profile !== undefined) {
      try { resolveProfile(value.profile); } catch (error) { fail(`${file}: ${error.message}`); }
    }
    for (const [key, item] of Object.entries(value)) {
      const refs = key === "ref" || key.endsWith("Ref") ? [item] : key.endsWith("Refs") && Array.isArray(item) ? item : [];
      for (const ref of refs) if (typeof ref === "string" && ref.endsWith(".json")) {
        try { resolveRef(ref); } catch (error) { fail(`${file}: ${error.message}`); }
      }
      checkRefs(item, file);
    }
  }
  for (const document of documents) checkRefs(document.value, document.path);
  if (manifest.releaseEntry !== undefined) resolveRef(manifest.releaseEntry);
  return { metadataRoot, manifest, entitiesRoot, profilesRoot, reviewRoot, schemasRoot, entities, documents, coverage: coverageReport(entities), resolveRef, resolveProfile };
}

/** Resolve existing repository-rooted logical source paths at the I/O boundary.
 * A caller can continue to supply <entity-root>/<entityCode>/<artifact>, while
 * physical ownership directories are obtained solely from entity descriptors.
 * Non-entity inputs (captured evidence, temp files, etc.) retain their paths. */
export function resolveSourcePath(input) {
  if (typeof input !== "string" && !(input instanceof URL)) return input;
  const path = input instanceof URL ? fileURLToPath(input) : resolve(input);
  let ancestor = existsSync(path) && statSync(path).isDirectory() ? path : dirname(path);
  while (dirname(ancestor) !== ancestor) {
    const manifestPath = resolve(ancestor, "manifest.json");
    if (existsSync(manifestPath)) {
      const manifest = json(manifestPath);
      if (manifest?.schema === "athyper.metadata-workspace/1") {
        const root = resolve(ancestor, manifest.entitiesRoot);
        if (!inside(root, path) || path === root) return input;
        const workspace = discoverWorkspace(ancestor);
        const physical = [...workspace.entities.values()].some((entry) => entry.directory === path) || workspace.documents.some((entry) => entry.path === path);
        const ref = relative(root, path).split(sep).join("/");
        const candidates = [...new Set([
          physical ? path : undefined,
          workspace.entities.get(ref)?.directory,
          workspace.documents.find((document) => document.ref === ref)?.path,
        ].filter(Boolean))];
        if (candidates.length > 1) fail(`ambiguous rooted source path ${input}: ${candidates.join(" and ")}`);
        const target = candidates[0] ?? workspace.resolveRef(ref);
        return input instanceof URL ? pathToFileURL(target + (input.pathname.endsWith("/") ? sep : "")) : target;
      }
    }
    ancestor = dirname(ancestor);
  }
  return input;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const workspace = discoverWorkspace(process.argv[2]);
  console.log(JSON.stringify({ entitiesRoot: workspace.entitiesRoot, profilesRoot: workspace.profilesRoot, reviewRoot: workspace.reviewRoot, schemasRoot: workspace.schemasRoot, entities: Object.fromEntries(workspace.entities), documents: workspace.documents, coverage: workspace.coverage }));
}
