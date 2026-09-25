// @vitest-environment jsdom
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {invalidateEntityRuntimeRecord,subscribeEntityRuntimeRecord,useEntityRuntimeSectionWorkspace} from "../../../../platform/entity/runtime/form-detail/src/use-section-resource";
const mocks=vi.hoisted(()=>({bootstrap:vi.fn(),section:vi.fn()}));
vi.mock("@athyper/platform-entity-descriptor-client",()=>({entityRuntimeClient:mocks}));
const scope={tenantId:"tenant",principalId:"checker",authEpoch:1,entityCode:"business_partner",recordId:"partner"};
const client={} as any;
const paged = (data: unknown) => ({releaseHash:"r19",releaseId:"release19",data});
it.each([401,403,404])("uses permission denial only for first-page 403, not %s authentication/not-found failures",async(status)=>{
 mocks.section.mockRejectedValue(Object.assign(new Error("Unavailable"),{status}));
 await act(async()=>root.render(<Probe/>));
 expect(state.sections.banking?.status).toBe(status === 403 ? "forbidden" : "error");
 expect(state.sections.banking?.resource).toBeUndefined();
});
it("does not reload bootstrap for equal context objects or section navigation, but does for changed scope",async()=>{
 function ContextProbe({context,section}:{context:any;section:string}){useEntityRuntimeSectionWorkspace({client,cacheScope:"context-test",entityCode:"business_partner",recordId:"context-test",surfaceKey:"detail",resourceContext:context,deepLinkedSectionKey:section});return null;}
 await act(async()=>root.render(<ContextProbe context={{companyCodeId:"one",legalEntityId:"legal"}} section="banking"/>));
 await act(async()=>root.render(<ContextProbe context={{legalEntityId:"legal",companyCodeId:"one"}} section="summary"/>));
 expect(mocks.bootstrap).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(<ContextProbe context={{legalEntityId:"legal",companyCodeId:"two"}} section="summary"/>));
 expect(mocks.bootstrap).toHaveBeenCalledTimes(2);
});
let root:Root,container:HTMLDivElement,state:ReturnType<typeof useEntityRuntimeSectionWorkspace>;
function Probe(){state=useEntityRuntimeSectionWorkspace({client,cacheScope:"tenant:checker:1:company:en",entityCode:scope.entityCode,recordId:scope.recordId,surfaceKey:"detail",deepLinkedSectionKey:"banking"});return <p>{String(state.bootstrap?.header?.values?.["version"]??"")}:{state.sections["banking"]?.status}</p>;}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});mocks.bootstrap.mockReset();mocks.section.mockReset();mocks.bootstrap.mockImplementation(async()=>({releaseHash:"r19",releaseId:"release19",header:{values:{version:mocks.bootstrap.mock.calls.length}},plan:{sections:[{key:"summary"},{key:"banking"}],initialSectionKeys:["summary"]}}));mocks.section.mockImplementation(async()=>({releaseHash:"r19",releaseId:"release19",data:{items:[]}}));container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();invalidateEntityRuntimeRecord(scope);});
it("refreshes bootstrap summary and active Banking after a successful command, preserving navigation",async()=>{
 await act(async()=>root.render(<Probe/>));expect(mocks.bootstrap).toHaveBeenCalledTimes(1);
 await act(async()=>invalidateEntityRuntimeRecord(scope));expect(mocks.bootstrap).toHaveBeenCalledTimes(2);expect(state.activeSectionKey).toBe("banking");expect(container.textContent).toBe("2:ready");
 expect(mocks.section.mock.calls.filter(([,input])=>input.sectionKey==="banking")).toHaveLength(2);
 expect(mocks.section.mock.calls.filter(([,input])=>input.sectionKey==="summary")).toHaveLength(2);
});
it("ignores another tenant, principal, record or authorization epoch",async()=>{
 await act(async()=>root.render(<Probe/>));const refresh=vi.fn(),unsubscribe=subscribeEntityRuntimeRecord(scope,refresh);
 for(const other of [{tenantId:"other"},{principalId:"other"},{authEpoch:2},{recordId:"other"}])await act(async()=>invalidateEntityRuntimeRecord({...scope,...other}));
 expect(mocks.bootstrap).toHaveBeenCalledTimes(1);expect(refresh).not.toHaveBeenCalled();
 await act(async()=>invalidateEntityRuntimeRecord(scope));expect(refresh).toHaveBeenCalledTimes(1);unsubscribe();
});
it("does not admit a stale pre-command section response after invalidation",async()=>{
 let complete!:(value:unknown)=>void;mocks.section.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 await act(async()=>root.render(<Probe/>));await act(async()=>invalidateEntityRuntimeRecord(scope));
 await act(async()=>complete({releaseHash:"r19",releaseId:"release19",data:{items:[{id:"stale"}]}}));
 expect(JSON.stringify(state.sections)).not.toContain("stale");expect(state.bootstrap?.header?.values?.["version"]).toBe(2);
});
it("shares a section between two mounted workspaces while one unmounts",async()=>{
 let finish!:(value:unknown)=>void,signal!:AbortSignal;
 mocks.section.mockImplementation((_client,input)=>{signal=input.signal;return new Promise(resolve=>{finish=resolve;});});
 mocks.bootstrap.mockResolvedValue({releaseHash:"shared-test",releaseId:"shared-test",header:{values:{}},plan:{sections:[{key:"banking"}],initialSectionKeys:["banking"]}});
 function Consumer({name}:{name:string}){const view=useEntityRuntimeSectionWorkspace({client,cacheScope:"tenant:checker:1:company:en",entityCode:"business_partner",recordId:"shared-test",surfaceKey:"detail"});return <p>{name}:{view.sections.banking?.status}</p>;}
 await act(async()=>root.render(<><Consumer key="one" name="one"/><Consumer key="two" name="two"/></>));
 expect(mocks.section).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(<><Consumer key="two" name="two"/></>));
 expect(signal.aborted).toBe(false);
 await act(async()=>finish({releaseHash:"shared-test",releaseId:"shared-test",data:{items:[]}}));
 expect(container.textContent).toBe("two:ready");
});
it("retains loaded rows after continuation failure and retries the same cursor once",async()=>{
 mocks.section.mockResolvedValue(paged({items:[{id:"first"}],nextCursor:"page2"}));
 await act(async()=>root.render(<Probe/>));
 let fail!:(error:Error)=>void;
 mocks.section.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject;}));
 const count=mocks.section.mock.calls.length;
 await act(async()=>{state.loadMore("banking");state.loadMore("banking");});
 expect(mocks.section.mock.calls.length).toBe(count+1);
 expect(state.sections.banking?.loadingMore).toBe(true);
 await act(async()=>fail(new Error("Temporary network failure")));
 expect(state.sections.banking).toMatchObject({status:"ready",loadingMore:false,loadMoreError:"Temporary network failure",resource:{data:{items:[{id:"first"}],nextCursor:"page2"}}});
 mocks.section.mockResolvedValueOnce(paged({items:[{id:"second"}]}));
 await act(async()=>state.loadMore("banking"));
 expect(state.sections.banking?.resource?.data).toEqual({items:[{id:"first"},{id:"second"}]});
 expect(state.sections.banking?.loadMoreError).toBeUndefined();
});
it("removes displayed rows when continuation reports revoked access",async()=>{
 mocks.section.mockResolvedValue(paged({items:[{id:"first"}],nextCursor:"page2"}));
 await act(async()=>root.render(<Probe/>));
 mocks.section.mockRejectedValueOnce(Object.assign(new Error("Denied"),{status:403}));
 await act(async()=>state.loadMore("banking"));
 expect(state.sections.banking).toMatchObject({status:"forbidden"});
 expect(state.sections.banking?.resource).toBeUndefined();
});

it.each([401,404])("shows continuation %s as a load error, not permission denial, and retains already loaded rows",async(status)=>{
 mocks.section.mockResolvedValue(paged({items:[{id:"first"}],nextCursor:"page2"}));
 await act(async()=>root.render(<Probe/>));
 mocks.section.mockRejectedValueOnce(Object.assign(new Error("Unavailable"),{status}));
 await act(async()=>state.loadMore("banking"));
 expect(state.sections.banking).toMatchObject({status:"ready",loadingMore:false,loadMoreError:"Unavailable",resource:{data:{items:[{id:"first"}],nextCursor:"page2"}}});
 mocks.section.mockResolvedValueOnce(paged({items:[{id:"second"}]}));
 await act(async()=>state.loadMore("banking"));
 expect(mocks.section).toHaveBeenLastCalledWith(client,expect.objectContaining({cursor:"page2"}));
 expect(state.sections.banking?.loadMoreError).toBeUndefined();
});

it.each(["comments", "attachments"])("keeps loaded %s after a failed continuation and retries the same cursor", async(sectionKey) => {
  mocks.bootstrap.mockResolvedValue({releaseHash:"r19",releaseId:"release19",header:{values:{}},plan:{sections:[{key:sectionKey}],initialSectionKeys:[sectionKey]}});
  mocks.section.mockResolvedValue(paged({items:[{id:"first"}],nextCursor:"page2"}));
  function CollectionProbe() {state=useEntityRuntimeSectionWorkspace({client,cacheScope:"tenant:checker:1:company:en",entityCode:scope.entityCode,recordId:scope.recordId,surfaceKey:"detail",deepLinkedSectionKey:sectionKey});return null;}
  await act(async()=>root.render(<CollectionProbe/>));
  mocks.section.mockRejectedValueOnce(Object.assign(new Error("Unavailable"),{status:503}));
  await act(async()=>state.loadMore(sectionKey));
  expect(state.sections[sectionKey]).toMatchObject({status:"ready",loadMoreError:"Unavailable",resource:{data:{items:[{id:"first"}],nextCursor:"page2"}}});
  mocks.section.mockResolvedValueOnce(paged({items:[{id:"second"}]}));
  await act(async()=>state.loadMore(sectionKey));
  expect(mocks.section).toHaveBeenLastCalledWith(client,expect.objectContaining({sectionKey,cursor:"page2"}));
  expect(state.sections[sectionKey]?.resource?.data).toEqual({items:[{id:"first"},{id:"second"}]});
});
