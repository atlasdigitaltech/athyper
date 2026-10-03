/** Read-only source provenance investigation. Does not amend a graph or create a successor. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { discoverWorkspace } from "./source-workspace.mjs";
import { loadReferenceProduct } from "../../../server/db/scripts/provisioning/prepare-reference-runtime.js";
import { parseTableEntityProduct } from "../../../server/packages/planes/studio/meta-entity-authoring/src/authoring/table-product.js";
import { sha256 } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4) throw Error("Usage: <captured-inventory.json> <provenance-report.json>");
const bytes = readFileSync(resolve(input));
const inventory = JSON.parse(bytes.toString());
if (inventory.schema !== "athyper.module-identity-review/1" || inventory.status !== "unsigned_review_only") throw Error("Unsupported inventory");
const workspace = discoverWorkspace();
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
const revision = git("rev-parse", "HEAD");
const commits = [...new Set(git("log", "--all", "--format=%H", "--", "metadata/**/definition.json", "metadata/**/localization.json", "metadata/**/capabilities.json", "metadata/**/activity.json", "metadata/profiles").split("\n").filter(Boolean))];
const plans: any[] = [];
function changedPaths(before: any, after: any, path = ""): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || Array.isArray(before) !== Array.isArray(after)) return [path || "/"];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(key => changedPaths(before[key], after[key], `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`));
}
function load(directory: string, profileRoot: string, localized: boolean) {
  const raw = JSON.parse(readFileSync(join(directory, "definition.json"), "utf8"));
  if (raw.schema === "athyper.shared-reference-product/1") return loadReferenceProduct(directory, profileRoot);
  const localization = join(directory, "localization.json");
  return parseTableEntityProduct(raw, localized && existsSync(localization) ? JSON.parse(readFileSync(localization, "utf8")) : undefined);
}
for (const registry of inventory.registries.filter((r: any) => r.snapshot.authoringRegistryAvailable)) {
  for (const product of registry.products) {
    const row = product.registryRows.length === 1 ? product.registryRows[0] : undefined;
    const baseline = row?.baseline;
    const markers = (baseline?.graph.surfaces ?? []).flatMap((s: any) => [s.layoutConfig?.systemReferenceProduct, s.layoutConfig?.tableEntityProduct].filter(Boolean));
    if (markers.length !== 1) throw Error("Exactly one predecessor marker required");
    const marker = markers[0];
    const plan: any = { entityCode: product.entityCode, database: registry.snapshot.database,
      predecessor: { releaseId: baseline.releaseId, revisionId: baseline.revisionId, contractHash: baseline.contractHash, productHash: marker.productHash },
      status: "exact_source_unresolved", attempts: [], matches: [], successorPrepared: false };
    plans.push(plan);
    const source = workspace.entities.get(product.entityCode);
    if (!source) throw Error("Source missing");
    let currentProduct: any;
    let exactProduct: any;
    for (const localized of [false, true]) {
      try {
        const current = load(source.directory, resolve("metadata/profiles"), localized);
        if (localized) currentProduct = current;
        const hash = sha256({ ...current, moduleCode: marker.moduleCode });
        plan.attempts.push({ source: "workspace", localized, hash, match: hash === marker.productHash });
        if (hash === marker.productHash) { exactProduct = { ...current, moduleCode: marker.moduleCode }; plan.matches.push({ source: "workspace", localized, hash }); }
      } catch (error) { plan.attempts.push({ source: "workspace", localized, error: String(error) }); }
    }
    // Historical candidates are read without altering their module or any business property.
    for (const commit of commits) {
      const paths = git("ls-tree", "-r", "--name-only", commit, "metadata").split("\n");
      const definitions = paths.filter(path => path.endsWith(`/${product.entityCode}/definition.json`));
      for (const path of definitions) {
        const temp = mkdtempSync(join(tmpdir(), "athyper-product-provenance-"));
        try {
          const archive = execFileSync("git", ["archive", "--format=tar", commit, dirname(path), ...(paths.some(p => p.startsWith("metadata/profiles/")) ? ["metadata/profiles"] : [])], { maxBuffer: 32 * 1024 * 1024 });
          execFileSync("tar", ["-xf", "-", "-C", temp], { input: archive });
          const inputPaths = paths.filter(p => p.startsWith(dirname(path) + "/") || p.startsWith("metadata/profiles/"));
          const sourceTreeHash = sha256(inputPaths.map(p => [p, git("rev-parse", `${commit}:${p}`)]));
          for (const localized of [false, true]) {
            try {
              const candidate = load(join(temp, dirname(path)), join(temp, "metadata/profiles"), localized);
              const hash = sha256(candidate);
              plan.attempts.push({ source: "git", commit, path, sourceTreeHash, localized, hash, match: hash === marker.productHash });
              if (hash === marker.productHash) { exactProduct = candidate; plan.matches.push({ source: "git", commit, path, sourceTreeHash, localized, hash }); }
            } catch (error) { plan.attempts.push({ source: "git", commit, path, localized, error: String(error).replaceAll(temp, "<historical-snapshot>") }); }
          }
        } finally { rmSync(temp, { recursive: true, force: true }); }
      }
    }
    if (plan.matches.length) plan.status = "exact_source_hash_matched";
    plan.currentProductHash = currentProduct ? sha256(currentProduct) : null;
    plan.currentDeltaPaths = exactProduct && currentProduct ? changedPaths(exactProduct, currentProduct) : null;
    plan.moduleOnlySourceChange = Array.isArray(plan.currentDeltaPaths) && plan.currentDeltaPaths.every((path: string) => path === "/moduleCode");
    plan.reviewRequired = true;
    console.log(`${plan.entityCode}: ${plan.status}`);
  }
}
writeFileSync(resolve(output), JSON.stringify({ schema: "athyper.product-predecessor-provenance/1", status: "unsigned_read_only_evidence",
  inventoryByteHash: createHash("sha256").update(bytes).digest("hex"), toolRevision: revision,
  parserInputByteHashes: Object.fromEntries([
    "tooling/scripts/metadata/reconcile-product-predecessors.mts",
    "tooling/scripts/metadata/source-workspace.mjs",
    "server/db/scripts/provisioning/prepare-reference-runtime.ts",
    "server/packages/planes/studio/meta-entity-authoring/src/authoring/table-product.ts",
  ].map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])),
  parserSemantics: "current-workspace parsers; historical bytes and locked profiles; only exact predecessor product-hash equality is a match",
  searchedCommits: commits, plans, publicationPerformed: false, humanReviewRecorded: false }, null, 2) + "\n");
