import {expect,it,vi} from "vitest";
import type {MetaEntityGraph} from "@athyper/server-contract-meta-entity-authoring";
import type {AtlasLearningHandoff} from "@athyper/server-contract-metadata";
import {applyLearningCorrection,cloneGraphIds,parseLearningFixtures,AtlasLearningInbox} from "../learning-inbox.js";
import {compileGraph} from "../deterministic.js";
import {MetaEntityAuthoringService} from "../authoring-service.js";
const graph:MetaEntityGraph={contractSchema:"athyper.meta-entity-contract/2.1",entity:{entityCode:"business_partner"},runtimeProfiles:[{profileKey:"default",backingKind:"virtual",apiExposure:"catalog_only",readMode:"none",writeMode:"none"}],fields:[{id:"field-id",fieldKey:"code",dataType:"string",typeConfig:{kind:"string"}}],operations:[{operationKey:"read",operationKind:"read",label:"Read",auditEventCode:"partner.read"}],surfaces:[{surfaceKey:"detail",surfaceKind:"detail",title:"Partner",layoutConfig:{ai:{schemaVersion:1,enabled:true,aliases:["partner"],summaryFieldKeys:["code"],searchFieldKeys:[],relationshipKeys:[],contextKinds:["record"],insightProviders:[{id:"entity_read_record",version:1}],actions:[],presentationProfiles:[]}}}]};
const proposal:AtlasLearningHandoff={schemaVersion:1,candidateId:"00000000-0000-4000-8000-000000000001",feedbackId:"00000000-0000-4000-8000-000000000002",tenantId:"00000000-0000-4000-8000-000000000003",submittedBy:"00000000-0000-4000-8000-000000000004",originPlane:"neon",locale:"en",phrase:"company snapshot",capabilityId:"entity_read_record",entityCode:"business_partner",sourceReleaseId:"00000000-0000-4000-8000-000000000005",sourceDescriptorHash:"a".repeat(64),sourceContractHash:compileGraph(graph).contractHash,proposalHash:"b".repeat(64),expiresAt:"2099-01-01T00:00:00.000Z"};
it("changes only the AI declaration and gives the published artifact deterministic provenance",()=>{
 const next=applyLearningCorrection(graph,proposal),compiled=compileGraph(next);
 expect(next.fields).toBe(graph.fields);expect(next.operations).toBe(graph.operations);
 expect(compiled.descriptorHash).not.toBe(compileGraph(graph).descriptorHash);
 expect(compiled.descriptor.ai).toMatchObject({vocabulary:{terms:[{phrase:proposal.phrase,origin:{candidateId:proposal.candidateId,proposalHash:proposal.proposalHash}}]}});
 expect(compileGraph(applyLearningCorrection(graph,proposal))).toEqual(compiled);
 expect(graph.surfaces?.[0]?.layoutConfig?.ai).not.toHaveProperty("vocabulary");
});
it("rejects stale, cross-entity, undeclared and collision proposals before mutation",()=>{
 for(const patch of [{sourceContractHash:"c".repeat(64)},{entityCode:"network_relationship"},{capabilityId:"bp_read_contacts"}])expect(()=>applyLearningCorrection(graph,{...proposal,...patch})).toThrow();
 const next=applyLearningCorrection(graph,proposal);expect(()=>applyLearningCorrection(next,{...proposal,sourceContractHash:compileGraph(next).contractHash})).toThrow(/already/);
});
it("preserves graph reference identity while allocating new draft rows",()=>{
 const next=cloneGraphIds({...graph,searchProfiles:[{id:"search",searchKey:"default",searchKind:"contains",minimumQueryLength:2}],searchFields:[{entitySearchProfileId:"search",entityFieldId:"field-id",position:1,matchMode:"contains"}]});
 expect(next.fields[0]?.id).not.toBe("field-id");expect(next.searchFields?.[0]?.entityFieldId).toBe(next.fields[0]?.id);expect(next.searchFields?.[0]?.entitySearchProfileId).toBe(next.searchProfiles?.[0]?.id);
});
it("requires distinct held-out positive questions and a negative, with bounded exact input",()=>{
 const fixtures=[{question:"Show this company snapshot",expected:"read"},{question:"Display the current company snapshot",expected:"read"},{question:"Delete this company snapshot",expected:"delegate"}];
 expect(parseLearningFixtures(fixtures)).toEqual(fixtures);
 for(const value of [[],fixtures.slice(0,2),[fixtures[0],fixtures[0],fixtures[2]],fixtures.map(row=>({...row,prompt:"secret"}))])expect(()=>parseLearningFixtures(value)).toThrow();
});
it("refuses learning-bearing publication without the configured review gate",async()=>{
 const repository={get:vi.fn(async()=>({status:"approved"})),loadGraph:vi.fn(async()=>applyLearningCorrection(graph,proposal)),createRelease:vi.fn()};
 const service=new MetaEntityAuthoringService({repository:repository as never,signer:{sign:vi.fn()},publication:{} as never});
 await expect(service.publish({changeSetId:"draft",expectedRevision:1,actorId:"reviewer",targetPlanes:["neon"]})).rejects.toMatchObject({code:"LEARNING_REVIEW_UNAVAILABLE"});expect(repository.createRelease).not.toHaveBeenCalled();
});
it("denies inbox access outside Studio or without reviewer authorization before querying",async()=>{
 const database={transaction:vi.fn()},authorizer={authorize:vi.fn(async()=>({allowed:false}))};
 const inbox=new AtlasLearningInbox({database:database as never,authorizer:authorizer as never,sourceCurrent:vi.fn(),evaluate:vi.fn()});
 for(const planeKey of ["neon","mesh","studio"])await expect(inbox.list({planeKey} as never)).rejects.toMatchObject({code:"FORBIDDEN"});expect(database.transaction).not.toHaveBeenCalled();
});
