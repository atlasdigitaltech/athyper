#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CanonicalCatalogV2 } from "./canonical-catalog-v2-model.js";
import { compileInventoryPromotion, type InventoryPromotionQualification, type InventoryPromotionQualificationContract, type PromotionPlane, type ReviewedInventory } from "./inventory-promotion-model.js";

const dbRoot = resolve(import.meta.dirname, "../..");
export async function runInventoryPromotion(plane: PromotionPlane, checkOnly=false): Promise<ReturnType<typeof compileInventoryPromotion>> {
  const root=resolve(dbRoot, `seed/contracts/authorization/inventory/${plane}`);
  const result=compileInventoryPromotion({
    inventory: await json<ReviewedInventory>(resolve(root,"reviewed-slices.v1.json")),
    qualification: await json<InventoryPromotionQualificationContract>(resolve(root,"promotion-qualification.v1.json")),
    existingCatalog: await json<CanonicalCatalogV2>(resolve(dbRoot,`seed/contracts/authorization/catalog/${plane}/catalog.v2.json`)),
  });
  const output=resolve(root,"promotion"); await mkdir(output,{recursive:true});
  const report={contractVersion:"athyper.authorization.inventory-promotion-report.v1",plane,mode:"candidate_only_non_enforcing",ready:result.ready,qualifiedPermissionCodes:result.qualifiedPermissionCodes,blockers:result.blockers};
  await emit(resolve(output,"promotion-report.v1.json"),report,checkOnly);
  const inventory=await json<ReviewedInventory>(resolve(root,"reviewed-slices.v1.json"));
  const transitionByPermission=new Map(inventory.lifecycles.flatMap((lifecycle)=>lifecycle.transitions.map((transition)=>[transition.permissionCode,{entityCode:lifecycle.entityCode,transitionCode:transition.code}] as const)));
  const template:InventoryPromotionQualificationContract={contractVersion:"athyper.authorization.inventory-promotion-qualification.v1",plane,defaultDecision:"deny_unqualified",qualifications:inventory.operations.map((operation):InventoryPromotionQualification=>{const transition=transitionByPermission.get(operation.permissionCode);return{permissionCode:operation.permissionCode,decision:"pending",scopeCoordinatesReviewed:false,lifecycle:transition?{disposition:"transition",lifecycleEntityCode:transition.entityCode,transitionCode:transition.transitionCode}:{disposition:operation.operationKey==="read"?"not_applicable":"state_neutral"},assurance:{riskTierReviewed:false,mfaReviewed:false,sodReviewed:false},writerOwnership:{reviewed:false,owner:operation.serviceOwner}};}).sort((a,b)=>a.permissionCode.localeCompare(b.permissionCode))};
  await emit(resolve(output,"qualification-template.v1.json"),template,checkOnly);
  if(result.ready){ await emit(resolve(output,"catalog.v2.candidate.json"),result.catalog,checkOnly); await emit(resolve(output,"operation-bindings.v1.candidate.json"),result.operationBindings,checkOnly); await emit(resolve(output,"scope-compatibility.v1.candidate.json"),result.scopeCompatibility,checkOnly); await emit(resolve(output,"seed-pack-permission-catalog.candidate.json"),result.seedPackPermissionCatalog,checkOnly); }
  return result;
}
async function emit(path:string,value:unknown,check:boolean){const content=`${JSON.stringify(value,null,2)}\n`;if(check){const current=await readFile(path,"utf8").catch(()=>null);if(current!==content)throw new Error(`stale or missing promotion artifact: ${path}`);}else await writeFile(path,content,"utf8");}
async function json<T>(path:string):Promise<T>{return JSON.parse(await readFile(path,"utf8")) as T;}
function plane():PromotionPlane{const value=process.argv.find((item)=>item.startsWith("--plane="))?.split("=")[1];if(value!=="neon"&&value!=="mesh")throw new Error("--plane must be neon or mesh");return value;}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href){const result=await runInventoryPromotion(plane(),process.argv.includes("--check"));console.log(JSON.stringify({ready:result.ready,qualified:result.qualifiedPermissionCodes.length,blockers:result.blockers.length},null,2));if(process.argv.includes("--strict")&&!result.ready)process.exitCode=1;}
