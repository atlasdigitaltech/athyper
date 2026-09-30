import {describe,expect,it} from "vitest";
import {assertGraphPreviewAiBindings} from "../graph-preview-ai-bindings.js";
const baseline = {ai: {enabled:true,searchFieldKeys:["old_name"],summaryFieldKeys:["old_name"],insightProviders:[{id:"registered",version:1}]},fields:[{key:"name",storagePath:"name"}],authorization:{fieldPolicies:[{fields:["name"],representation:"plain",readOperation:"read"}]}};
const proposed = () => ({...baseline,ai:{...baseline.ai,searchFieldKeys:["name"],summaryFieldKeys:["name"]}});
describe("preview AI field bindings",()=>{
 it("permits a field rename within previously qualified readable storage",()=>expect(()=>assertGraphPreviewAiBindings(proposed(),baseline)).not.toThrow());
 it("requires registry qualification for a new provider",()=>expect(()=>assertGraphPreviewAiBindings({...proposed(),ai:{...proposed().ai,insightProviders:[{id:"new_provider",version:1}]}},baseline)).toThrow("GRAPH_PREVIEW_AI_REGISTRY_QUALIFICATION_REQUIRED"));
 it("does not admit a field hidden by existing read policy",()=>expect(()=>assertGraphPreviewAiBindings(proposed(),{...baseline,authorization:{fieldPolicies:[]}})).toThrow());
 it("does not admit a masked field or change storage",()=>{
   expect(()=>assertGraphPreviewAiBindings({...proposed(),authorization:{fieldPolicies:[{fields:["name"],representation:"masked",readOperation:"read"}]}},baseline)).toThrow();
   expect(()=>assertGraphPreviewAiBindings({...proposed(),fields:[{key:"name",storagePath:"private_name"}]},baseline)).toThrow();
 });
 it("does not add AI where none was registered",()=>expect(()=>assertGraphPreviewAiBindings(proposed(),{...baseline,ai:undefined})).toThrow());
});
