import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CanonicalCatalogV2, CatalogPlane } from "./canonical-catalog-v2-model.js";
import {
  buildExactScopeCompatibility,
} from "./exact-scope-compatibility-model.js";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../..");
const root = resolve(dbRoot, "seed/contracts/authorization/catalog");
const checkOnly = process.argv.includes("--check");
const summaries = [];

for (const plane of ["studio", "neon", "mesh"] as const satisfies readonly CatalogPlane[]) {
  const catalog = await json<CanonicalCatalogV2>(resolve(root, plane, "catalog.v2.json"));
  const catalogCodes = catalog.permissions.map((item) => item.canonicalCode);
  const contract = buildExactScopeCompatibility({
    plane,
    permissionCodes: catalogCodes,
  });
  await emit(resolve(root, plane, "scope-compatibility.v1.json"), contract);
  summaries.push({ plane, permissions: contract.permissions.length, scopeRows: contract.permissions.reduce((count, item) => count + item.scopes.length, 0), sha256: contract.sha256 });
}
console.log(JSON.stringify({ mode: checkOnly ? "check" : "write", contracts: summaries }, null, 2));

async function json<T>(path: string): Promise<T> { return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as T; }
async function emit(path: string, value: unknown): Promise<void> { const content=`${JSON.stringify(value,null,2)}\n`;if(checkOnly){const existing=await readFile(path,"utf8").catch(()=>"");if(existing!==content)throw new Error(`scope compatibility artifact drift: ${path}`);return;}await mkdir(dirname(path),{recursive:true});await writeFile(path,content,"utf8"); }
