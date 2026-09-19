import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { describe, expect, it, vi } from "vitest";
import { createBusinessPartnerProfileMatchService, KyselyBusinessPartnerProfileMatchRepository, NeonProfileMatchError } from "./business-partner-profile-match.js";

const tenant="11111111-1111-4111-8111-111111111111",principal="22222222-2222-4222-8222-222222222222",snapshot="33333333-3333-4333-8333-333333333333",projection="44444444-4444-4444-8444-444444444444",org="55555555-5555-4555-8555-555555555555",candidate="66666666-6666-4666-8666-666666666666",publication="77777777-7777-4777-8777-777777777777";
const context={planeKey:"neon",realmKey:"athyper",tenantId:tenant,principalId:principal,authEpoch:1,profileHash:"profile",requestId:"request",assurance:"elevated",permissions:{planeKey:"neon",tenantId:tenant,principalId:principal,principalFingerprint:"fingerprint",profileHash:"profile",schemaHash:"schema",resolvedAt:1,allowed:[],denied:[],planLocked:[],planeExcluded:[],entries:[],authorizationScopes:[]}} as VerifiedRequestContext;

class Repository extends KyselyBusinessPartnerProfileMatchRepository{
  resolutions=new Map<string,any>();
  override async resolutionByKey(_tenant:string,key:string){return this.resolutions.get(key)??null;}
  override async saveResolution(input:any){const row={id:"abababab-abab-4bab-8bab-abababababab",incoming_snapshot_id:input.preview.incomingSnapshotId,business_partner_id:input.preview.businessPartnerId,operating_organization_id:input.orgId,created_by:input.principalId,preview_fingerprint:input.preview.fingerprint,decisions:input.decisions,proposed_values:input.proposed};this.resolutions.set(input.key,row);return row;}
  matches=new Map<string,any>();acceptances=new Map<string,any>();events=new Map<string,any>();sequence=0;
  override async source(_tenant:string,id:string):Promise<Awaited<ReturnType<KyselyBusinessPartnerProfileMatchRepository["source"]>>>{return id===snapshot?{projectionId:projection,publicationId:publication,publicationVersion:3,payloadHash:"a".repeat(64),payload:{recipient:{proposedNeonRole:"supplier"},partner:{accountCode:"SUPPLIER.ONE",displayName:"Supplier One",legalName:"Supplier One Ltd",legalForm:"Ltd",countryCode:"MY",websiteUrl:"https://supplier.example/about",description:"source"}}}:null;}
  override async candidates(){return[{id:candidate,code:"SUPPLIER.ONE",name:"Supplier One Ltd",legalForm:"Sdn Bhd",countryCode:"MY",websiteUrl:"https://supplier.example",description:"local"},{id:"88888888-8888-4888-8888-888888888888",code:"OTHER",name:"Other"}];}
  override async matchByKey(_tenant:string,key:string){return[...this.matches.values()].find(row=>row.idempotency_key===key)??null;}
  override async match(_tenant:string,id:string){return this.matches.get(id)??null;}
  override async createMatch(input:any):Promise<Awaited<ReturnType<KyselyBusinessPartnerProfileMatchRepository["createMatch"]>>>{const id=`99999999-9999-4999-8999-${String(++this.sequence).padStart(12,"0")}`,row={id,projection_id:input.projectionId,snapshot_id:input.snapshotId,source_payload_hash:input.payloadHash,source_publication_version:input.publicationVersion,operating_organization_id:input.operatingOrganizationId,company_code_id:input.companyCodeId,candidate_business_partner_id:input.candidateId,algorithm_code:"mesh_business_partner_candidate_v1",algorithm_version:1,algorithm_hash:input.algorithmHash,ranked_candidates:input.ranked,field_diff:input.diff,diff_hash:input.diffHash,idempotency_key:input.key,created_at:"2026-08-28T00:00:00Z"};this.matches.set(id,row);return row;}
  override async acceptanceByKey(_tenant:string,key:string){const row=[...this.acceptances.values()].find(value=>value.request_idempotency_key===key);return row?{...row,entity_case_id:this.events.get(row.id)?.entity_case_id}:null;}
  override async createAcceptance(input:any):Promise<Awaited<ReturnType<KyselyBusinessPartnerProfileMatchRepository["createAcceptance"]>>>{const id=`aaaaaaaa-aaaa-4aaa-8aaa-${String(++this.sequence).padStart(12,"0")}`,row={id,match_id:input.matchId,snapshot_id:input.snapshotId,accepted_field_paths:input.paths,proposed_payload:input.payload,acceptance_hash:input.hash,request_idempotency_key:input.key};this.acceptances.set(id,row);return row;}
  override async caseEvent(_tenant:string,id:string){return this.events.get(id)??null;}
  override async appendCaseEvent(input:any){this.events.set(input.acceptanceId,{entity_case_id:input.caseId});}
}
function fixture(allowed=true,responseLost=false){const repository=new Repository(),permissions:string[]=[],commands:any[]=[];const service=createBusinessPartnerProfileMatchService({repository,authorizer:{async authorize(input){permissions.push(input.permissionCode);return allowed?{allowed:true}:{allowed:false,reason:"test"};}},transactions:{async run(_plane,_actor,work){return work({} as never);}},businessPartnerRequests:{async create(command:any){commands.push(command);if(command.kind==="amend_partner"){const row=[...repository.resolutions.values()].find(item=>item.id===command.proposedPayload.meshChangeResolutionId);if(row)row.entity_case_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";if(responseLost)throw new Error("response lost after draft commit");}return{request:{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},replayed:commands.length>1};}} as any});return{repository,permissions,commands,service};}

describe("NEON MESH Business Partner match/request adapter",()=>{
  it("builds a read-only change preview from server baseline and current tenant authority",async()=>{
    const value=fixture();
    const baseline=vi.spyOn(value.repository,"changeBaseline").mockResolvedValue({snapshotId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",payload:{partner:{legalName:"Old name"}},paths:["partner.legalName"]});
    const current=vi.spyOn(value.repository,"currentPartner").mockResolvedValue({version:4,fields:{displayName:undefined,legalName:"Local name",legalForm:undefined,countryCode:undefined,incorporationDate:undefined,websiteUrl:undefined,description:undefined}});
    const preview=await value.service.previewChange({context,snapshotId:snapshot,businessPartnerId:candidate,operatingOrganizationId:org});
    expect(preview).toMatchObject({targetVersion:4,businessPartnerId:candidate,incomingSnapshotId:snapshot});
    expect(preview.fields).toEqual(expect.arrayContaining([expect.objectContaining({path:"partner.legalName",classification:"conflict"})]));
    expect(baseline).toHaveBeenCalledWith(tenant,projection,candidate,expect.anything());
    expect(current).toHaveBeenCalledWith(tenant,candidate,org,expect.anything());
    expect(value.commands).toHaveLength(0);
    expect(value.permissions).toEqual(["neon.business_partner_profile_match.read"]);
    baseline.mockResolvedValue(null);
    await expect(value.service.previewChange({context,snapshotId:snapshot,businessPartnerId:candidate,operatingOrganizationId:org})).rejects.toMatchObject({code:"MESH_PROFILE_CHANGE_BASELINE_REQUIRED"});
  });
  it("denies a change preview before reading baseline or canonical values",async()=>{
    const value=fixture(false),source=vi.spyOn(value.repository,"source");
    await expect(value.service.previewChange({context,snapshotId:snapshot,businessPartnerId:candidate,operatingOrganizationId:org})).rejects.toMatchObject({status:403});
    expect(source).not.toHaveBeenCalled();
  });
  it("persists all decisions and creates exactly one governed amendment without a role result",async()=>{
    const value=fixture();
    vi.spyOn(value.repository,"changeBaseline").mockResolvedValue({snapshotId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",payload:{partner:{legalName:"Old name"}},paths:["partner.legalName"]});
    vi.spyOn(value.repository,"currentPartner").mockResolvedValue({version:4,fields:{legalName:"Local name",displayName:null,legalForm:null,countryCode:null,incorporationDate:null,websiteUrl:null,description:null}});
    const coordinates={context,snapshotId:snapshot,businessPartnerId:candidate,operatingOrganizationId:org};
    const preview=await value.service.previewChange(coordinates),decisions=Object.fromEntries(preview.fields.map(field=>[field.path,"source" as const]));
    const command={...coordinates,fingerprint:preview.fingerprint,decisions,idempotencyKey:"r6-resolve-001"};
    const result=await value.service.resolveChange(command);
    expect(value.commands[0]).toMatchObject({kind:"amend_partner",targetBusinessPartnerId:candidate,proposedPayload:{meshChangeResolutionId:result.resolutionId}});
    expect(value.commands[0]).not.toHaveProperty("requestedRole");
    expect(await value.service.resolveChange(command)).toMatchObject({...result,replayed:true});
    expect(value.commands).toHaveLength(1);
    await expect(value.service.resolveChange({...command,decisions:{...decisions,"partner.legalName":"local"}})).rejects.toMatchObject({code:"MESH_PROFILE_CHANGE_KEY_COLLISION"});
    await expect(value.service.resolveChange({...command,context:{...context,principalId:candidate}})).rejects.toMatchObject({code:"MESH_PROFILE_CHANGE_KEY_COLLISION"});
  });
  it("recovers the linked amendment after a committed draft loses its response",async()=>{
    const value=fixture(true,true);
    vi.spyOn(value.repository,"changeBaseline").mockResolvedValue({snapshotId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",payload:{partner:{legalName:"Old name"}},paths:["partner.legalName"]});
    vi.spyOn(value.repository,"currentPartner").mockResolvedValue({version:4,fields:{legalName:"Local name",displayName:null,legalForm:null,countryCode:null,incorporationDate:null,websiteUrl:null,description:null}});
    const coordinates={context,snapshotId:snapshot,businessPartnerId:candidate,operatingOrganizationId:org};
    const preview=await value.service.previewChange(coordinates),decisions=Object.fromEntries(preview.fields.map(field=>[field.path,"source" as const]));
    const command={...coordinates,fingerprint:preview.fingerprint,decisions,idempotencyKey:"r6-resolve-001"};
    const result=await value.service.resolveChange(command);
    expect(result.replayed).toBe(true);
    expect(value.commands[0]).toMatchObject({kind:"amend_partner",targetBusinessPartnerId:candidate,proposedPayload:{meshChangeResolutionId:result.resolutionId}});
    expect(value.commands[0]).not.toHaveProperty("requestedRole");
    expect(await value.service.resolveChange(command)).toMatchObject({...result,replayed:true});
    expect(value.commands).toHaveLength(1);
    await expect(value.service.resolveChange({...command,decisions:{...decisions,"partner.legalName":"local"}})).rejects.toMatchObject({code:"MESH_PROFILE_CHANGE_KEY_COLLISION"});
    await expect(value.service.resolveChange({...command,context:{...context,principalId:candidate}})).rejects.toMatchObject({code:"MESH_PROFILE_CHANGE_KEY_COLLISION"});
  });
  it("rejects stale comparisons before persisting decisions or creating a case",async()=>{
    const value=fixture();
    vi.spyOn(value.repository,"changeBaseline").mockResolvedValue({snapshotId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",payload:{partner:{legalName:"Old"}},paths:["partner.legalName"]});
    vi.spyOn(value.repository,"currentPartner").mockResolvedValue({version:5,fields:{legalName:"Current",displayName:null,legalForm:null,countryCode:null,incorporationDate:null,websiteUrl:null,description:null}});
    await expect(value.service.resolveChange({context,snapshotId:snapshot,businessPartnerId:candidate,operatingOrganizationId:org,fingerprint:"old",decisions:{},idempotencyKey:"r6-stale-001"})).rejects.toMatchObject({status:409});
    expect(value.repository.resolutions.size).toBe(0);expect(value.commands).toHaveLength(0);
  });
  it("pins deterministic ranking, selected candidate and seven-field diff",async()=>{const value=fixture(),command={context,snapshotId:snapshot,operatingOrganizationId:org,candidateBusinessPartnerId:candidate,idempotencyKey:"match-key-001"};const first=await value.service.create(command);expect(first.rankedCandidates[0]).toMatchObject({businessPartnerId:candidate,score:215,reasons:["ACCOUNT_CODE_EXACT","LEGAL_NAME_NORMALIZED","WEBSITE_HOST_EXACT","COUNTRY_CODE_EXACT"]});expect(first.fieldDiff).toHaveLength(7);expect(first.candidateBusinessPartnerId).toBe(candidate);const replay=await value.service.create(command);expect(replay).toMatchObject({id:first.id,replayed:true,diffHash:first.diffHash});const{candidateBusinessPartnerId:_,...collision}=command;await expect(value.service.create(collision)).rejects.toMatchObject({code:"MESH_PROFILE_MATCH_KEY_COLLISION"});});
  it("accepts only explicit fields and creates a source-neutral governed request",async()=>{const value=fixture();const match=await value.service.create({context,snapshotId:snapshot,operatingOrganizationId:org,idempotencyKey:"new-match-001"});const result=await value.service.createRequest({context,matchId:match.id,acceptedFieldPaths:["partner.legalName","partner.countryCode"],idempotencyKey:"accept-key-001"});expect(result.requestId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");expect(value.commands[0]).toMatchObject({kind:"new_partner",source:{kind:"mesh",projectionId:snapshot,payloadHash:"a".repeat(64)},requestedRole:"supplier",proposedPayload:{name:"Supplier One Ltd",registrationCountryCode:"MY"}});expect(value.commands[0].proposedPayload).not.toHaveProperty("description");});
  it("recovers after request creation by returning the durable saga link",async()=>{const value=fixture();const match=await value.service.create({context,snapshotId:snapshot,operatingOrganizationId:org,idempotencyKey:"recovery-match"});const command={context,matchId:match.id,acceptedFieldPaths:["partner.legalName"],idempotencyKey:"recovery-accept"};await value.service.createRequest(command);expect(await value.service.createRequest(command)).toMatchObject({requestId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",replayed:true});expect(value.commands).toHaveLength(1);});
  it("rejects unsupported fields, implicit legal name and negative authorization",async()=>{const value=fixture();const match=await value.service.create({context,snapshotId:snapshot,operatingOrganizationId:org,idempotencyKey:"reject-match"});await expect(value.service.createRequest({context,matchId:match.id,acceptedFieldPaths:["partner.bankAccount"],idempotencyKey:"reject-accept"})).rejects.toMatchObject({code:"MESH_PROFILE_ACCEPTANCE_INVALID"});await expect(value.service.createRequest({context,matchId:match.id,acceptedFieldPaths:["partner.description"],idempotencyKey:"reject-implicit"})).rejects.toMatchObject({code:"MESH_PROFILE_LEGAL_NAME_REQUIRED"});await expect(fixture(false).service.create({context,snapshotId:snapshot,operatingOrganizationId:org,idempotencyKey:"denied-match"})).rejects.toBeInstanceOf(NeonProfileMatchError);});
});


describe("profile match review regressions",()=>{
  it("compares accountCode to the candidate code",async()=>{
    const value=fixture();
    const match=await value.service.create({context,snapshotId:snapshot,operatingOrganizationId:org,candidateBusinessPartnerId:candidate,idempotencyKey:"code-diff-review"});
    expect(match.fieldDiff.find(field=>field.path==="partner.accountCode")).toMatchObject({sourceValue:"SUPPLIER.ONE",candidateValue:"SUPPLIER.ONE",equal:true});
  });
  it("does not award matching points for absent names",async()=>{
    const value=fixture();
    const source=await value.repository.source(tenant,snapshot);
    vi.spyOn(value.repository,"source").mockResolvedValue({...source!,payload:{partner:{}}});
    const match=await value.service.create({context,snapshotId:snapshot,operatingOrganizationId:org,idempotencyKey:"empty-names-review"});
    expect(match.rankedCandidates.every(candidate=>candidate.score===0&&candidate.reasons.length===0)).toBe(true);
  });
  it("rejects a concurrent match key collision instead of returning another scope",async()=>{
    const value=fixture();
    const command={context,snapshotId:snapshot,operatingOrganizationId:org,idempotencyKey:"match-race-review"};
    const first=await value.service.create(command);
    vi.spyOn(value.repository,"matchByKey").mockResolvedValueOnce(null);
    vi.spyOn(value.repository,"createMatch").mockResolvedValueOnce(null);
    await expect(value.service.create({...command,candidateBusinessPartnerId:candidate})).rejects.toMatchObject({status:409,code:"MESH_PROFILE_MATCH_KEY_COLLISION"});
    expect(value.repository.matches.size).toBe(1);
    expect(first.candidateBusinessPartnerId).toBeUndefined();
  });
  it("rejects a concurrent acceptance collision before creating or linking a case",async()=>{
    const value=fixture();
    const match=await value.service.create({context,snapshotId:snapshot,operatingOrganizationId:org,idempotencyKey:"accept-race-match"});
    vi.spyOn(value.repository,"acceptanceByKey").mockResolvedValueOnce(null).mockResolvedValueOnce({id:"other-acceptance",acceptance_hash:"different"});
    vi.spyOn(value.repository,"createAcceptance").mockResolvedValueOnce(null);
    await expect(value.service.createRequest({context,matchId:match.id,acceptedFieldPaths:["partner.legalName"],idempotencyKey:"accept-race-review"})).rejects.toMatchObject({status:409,code:"MESH_PROFILE_ACCEPTANCE_KEY_COLLISION"});
    expect(value.commands).toHaveLength(0);
    expect(value.repository.events.size).toBe(0);
  });
});
