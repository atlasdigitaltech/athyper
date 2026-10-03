import { readFileSync } from "node:fs";
import { resolveSourcePath } from "../../../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { expect, it } from "vitest";
import { prepareActivityCapabilityMember } from "@athyper/server-contract-publication";
import { parseSharedReferenceProduct, compileSharedReferenceProduct } from "../authoring/product.js";
import { compileSystemReferenceTarget } from "../compilation/target-compiler.js";
import { amendSuccessorCapabilities } from "../publication/amend-successor-capabilities.js";

it.each(["studio","neon","mesh"] as const)("enrolls Activity into an immutable successor on %s, preserving read-only operations",plane=>{
  const root=new URL("../../../../../../../metadata/",import.meta.url);
  const definition=JSON.parse(readFileSync(resolveSourcePath(new URL("entities/country/definition.json",root)),"utf8"));
  definition.definition.entityCode="example_reference";definition.definition.storageObject="example_reference";
  const profile=JSON.parse(readFileSync(new URL("profiles/activity/standard.v1.json",root),"utf8"));
  const member=prepareActivityCapabilityMember("example_reference",{schema:"athyper.entity-activity-source/1",profile:{code:profile.profileCode,version:1}},()=>profile,
    {versionHistoryAvailable:false,automaticCaptureAvailable:false,writableOperations:[]});
  const product=parseSharedReferenceProduct(definition,[member]);
  const graph={...compileSharedReferenceProduct(product,"studio").graph,capabilities:[]};
  graph.surfaces=graph.surfaces?.map(surface=>surface.surfaceKind==="list" ? {...surface,layoutConfig:{...surface.layoutConfig,systemReferenceProduct:{schema:"athyper.system-reference-source/1",productHash:"a".repeat(64),moduleCode:product.moduleCode,targetPlanes:["studio","neon","mesh"]}}}:surface);
  const before=structuredClone(graph);
  const amended=amendSuccessorCapabilities(graph,product);
  expect({...amended,capabilities:[]}).toEqual(before);expect(graph).toEqual(before);
  expect(amended.capabilities).toEqual([member]);
  expect(amendSuccessorCapabilities(amended,product)).toEqual(amended);
  expect(()=>compileSystemReferenceTarget(amended,plane)).not.toThrow();
  expect(()=>amendSuccessorCapabilities({...graph,runtimeProfiles:[{...graph.runtimeProfiles![0]!,writeMode:"generic"}]},product)).toThrow("CAPABILITY_PRODUCT_SOURCE_MISMATCH");
});
