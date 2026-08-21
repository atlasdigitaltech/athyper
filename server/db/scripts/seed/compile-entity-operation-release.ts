import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CanonicalCatalogV2 } from "./canonical-catalog-v2-model.js";
import { compileEntityOperationProjection, type MetadataReleaseProjectionSource } from "./entity-operation-projection-compiler.js";
import type { ExactScopeCompatibilityContract } from "./exact-scope-compatibility-model.js";

const releasePath = option("--release");
const outputPath = option("--output");
if (!releasePath || !outputPath) throw new Error("Usage: compile-entity-operation-release.ts --release=PATH --output=PATH");
const release = await json<MetadataReleaseProjectionSource>(resolve(releasePath));
const dbRoot = resolve(import.meta.dirname, "../..");
const root = resolve(dbRoot, "seed/contracts/authorization/catalog");
const plane = release.targetPlane;
const projection = compileEntityOperationProjection({
  release,
  catalog: await json<CanonicalCatalogV2>(resolve(root, plane, "catalog.v2.json")),
  scopeCompatibility: await json<ExactScopeCompatibilityContract>(resolve(root, plane, "scope-compatibility.v1.json")),
});
const target = resolve(outputPath);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ plane, bindings: projection.globalEntityOperationBindings.length, scopeChildren: projection.exactScopeCoordinateChildren.length, sha256: projection.sha256 }, null, 2));

function option(name:string):string|undefined{const value=process.argv.slice(2).find((item)=>item.startsWith(`${name}=`));return value?.slice(name.length+1).trim()||undefined;}
async function json<T>(path:string):Promise<T>{return JSON.parse(await readFile(path,"utf8")) as T;}
