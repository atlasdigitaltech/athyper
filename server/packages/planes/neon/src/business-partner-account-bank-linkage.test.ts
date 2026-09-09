import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createBusinessPartnerAccountBankLinkageService } from "./business-partner-account-bank-linkage.js";

const tenant="11111111-1111-4111-8111-111111111111",principal="22222222-2222-4222-8222-222222222222";
const context:any={planeKey:"neon",tenantId:tenant,principalId:principal,permissions:{tenantId:tenant,principalId:principal,planeKey:"neon",allowed:[],denied:[],planLocked:[],planeExcluded:[],authorizationScopes:[]}};
function service(repository:any){return createBusinessPartnerAccountBankLinkageService({repository,authorizer:{async authorize(){return{allowed:true};}},transactions:{async run(_plane:unknown,_actor:unknown,work:(tx:never)=>Promise<unknown>){return work({}as never);}}}as any);}
describe("WP15 NEON account and bank linkage",()=>{
 it("does not turn a retained bank ordering quarantine into a successful duplicate acknowledgement",async()=>{
   const envelope={eventId:"55555555-5555-4555-8555-555555555555",eventType:"mesh.bank_account.changed" as const,schemaVersion:1,sourcePlane:"mesh" as const,sourceTenantId:"66666666-6666-4666-8666-666666666666",recipientTenantId:tenant,sourceNetworkAccountId:"77777777-7777-4777-8777-777777777777",recipientNetworkAccountId:"33333333-3333-4333-8333-333333333333",networkRelationshipId:"44444444-4444-4444-8444-444444444444",disclosureId:"88888888-8888-4888-8888-888888888888",disclosureVersion:2,lifecycleVersion:1,payloadHash:"a".repeat(64),occurredAt:"2026-09-05T00:00:00.000Z"};
   const value=service({inbox:async()=>({envelope_hash:hash(envelope)}),projection:async()=>null});
   expect(await value.receiveBankDisclosure({context,envelope})).toMatchObject({disposition:"duplicate",processingDisposition:"quarantined"});
 });
 it("rejects raw bank identifiers before persistence",async()=>{const value=service({inbox:async()=>null});const payload={schemaCode:"mesh.bank_account_disclosure",schemaVersion:1,fieldSetCode:"masked_retrieval_v1",recipient:{tenantId:tenant,networkAccountId:"33333333-3333-4333-8333-333333333333",networkRelationshipId:"44444444-4444-4444-8444-444444444444"},bankAccount:{accountLast4:"1234",accountFingerprint:"a".repeat(64),accountNumber:"SECRET"}};await expect(value.receiveBankDisclosure({context,envelope:{eventId:"55555555-5555-4555-8555-555555555555",eventType:"mesh.bank_account.disclosed",schemaVersion:1,sourcePlane:"mesh",sourceTenantId:"66666666-6666-4666-8666-666666666666",recipientTenantId:tenant,sourceNetworkAccountId:"77777777-7777-4777-8777-777777777777",recipientNetworkAccountId:"33333333-3333-4333-8333-333333333333",networkRelationshipId:"44444444-4444-4444-8444-444444444444",disclosureId:"88888888-8888-4888-8888-888888888888",disclosureVersion:1,lifecycleVersion:1,payloadHash:hash(payload),occurredAt:new Date().toISOString(),payload}})).rejects.toMatchObject({code:"NEON_ACCOUNT_BANK_INVALID"});});
 it("rejects account-link self approval",async()=>{const row={id:"33333333-3333-4333-8333-333333333333",tenant_id:tenant,network_relationship_id:"44444444-4444-4444-8444-444444444444",status:"pending_approval",created_by:principal};const value=service({link:async()=>row});await expect(value.decideAccountLink({context,linkId:row.id,decision:"approve"})).rejects.toMatchObject({code:"NEON_MESH_ACCOUNT_LINK_SELF_APPROVAL"});});
 it("retains an immutable receipt for a stale valid event",async()=>{let receipts=0;const relationshipId="44444444-4444-4444-8444-444444444444",recipientAccountId="33333333-3333-4333-8333-333333333333",payload={schemaCode:"mesh.bank_account_disclosure",schemaVersion:1,fieldSetCode:"masked_retrieval_v1",recipient:{tenantId:tenant,networkAccountId:recipientAccountId,networkRelationshipId:relationshipId},bankAccount:{accountHolderName:"Masked Holder",accountIdType:"iban",accountLast4:"1234",currencyCode:"USD",bankName:"Example Bank",bankCountryCode:"US",bic:"EXAMPLE1",accountFingerprint:"a".repeat(64)}};const value=service({inbox:async()=>null,activeLink:async()=>({id:"99999999-9999-4999-8999-999999999999"}),projection:async()=>({current_disclosure_version:2,current_lifecycle_version:1}),recordInbox:async()=>{receipts++;return"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";}});const result=await value.receiveBankDisclosure({context,envelope:{eventId:"55555555-5555-4555-8555-555555555555",eventType:"mesh.bank_account.changed",schemaVersion:1,sourcePlane:"mesh",sourceTenantId:"66666666-6666-4666-8666-666666666666",recipientTenantId:tenant,sourceNetworkAccountId:"77777777-7777-4777-8777-777777777777",recipientNetworkAccountId:recipientAccountId,networkRelationshipId:relationshipId,disclosureId:"88888888-8888-4888-8888-888888888888",disclosureVersion:1,lifecycleVersion:1,payloadHash:hash(payload),occurredAt:new Date().toISOString(),payload}});expect(result).toMatchObject({disposition:"stale",replayed:false});expect(receipts).toBe(1);});
});
function stable(v:unknown):string{if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(stable).join(",")}]`;return`{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${stable(x)}`).join(",")}}`;}function hash(v:unknown){return createHash("sha256").update(stable(v)).digest("hex");}

describe("native bank verification controls",()=>{
 it("stores the full bank identifier only in protected storage",async()=>{let protectedBytes="",created:any;const repository={protectedRegistrationByKey:async()=>null,protectedRegistrationSource:async()=>({owner_type_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}),createProtectedRegistration:async(input:any)=>{created=input;return{bank_account_link_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",account_last4:input.accountLast4,status:"pending_verification"};}};const value=createBusinessPartnerAccountBankLinkageService({repository:repository as any,authorizer:{async authorize(){return{allowed:true};}},transactions:{async run(_plane:any,_actor:any,work:any){return work({});}},secrets:{async resolve(){throw new Error("unused");},async put(_reference,value){protectedBytes=new TextDecoder().decode(value);return{reference:_reference,version:"1"};}}});const result=await value.registerProtectedBankAccount({context,businessPartnerId:"33333333-3333-4333-8333-333333333333",companyCodeId:"44444444-4444-4444-8444-444444444444",accountHolderName:"Example Supplier",accountIdentifier:"GB82 WEST 1234 5698 7654 32",accountIdType:"iban",currencyCode:"GBP",bankName:"Example Bank",bankCountryCode:"GB",idempotencyKey:"protected-bank-001"});expect(result.registration).toMatchObject({account_last4:"5432"});expect(protectedBytes).toBe("GB82WEST12345698765432");expect(created).not.toHaveProperty("accountIdentifier");expect(JSON.stringify(created)).not.toContain("GB82WEST12345698765432");expect(created.protectedValueToken).toMatch(/^bank:/);});
 it("enforces independent verification of a protected registration",async()=>{const row={tenant_id:tenant,bank_account_link_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",bank_account_id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",company_code_id:"44444444-4444-4444-8444-444444444444",business_partner_id:"33333333-3333-4333-8333-333333333333",status:"pending_verification",created_by:principal};const value=service({protectedRegistration:async()=>row});await expect(value.decideProtectedBankRegistration({context,bankAccountLinkId:row.bank_account_link_id,decision:"verify",verificationMethod:"bank_callback",evidence:{reference:"call-1"}})).rejects.toMatchObject({code:"NEON_BANK_REGISTRATION_SELF_VERIFICATION"});});
 it("does not apply a protected registration before independent verification",async()=>{const row={tenant_id:tenant,bank_account_link_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",company_code_id:"44444444-4444-4444-8444-444444444444",status:"pending_verification",is_verified:false};const value=service({protectedRegistration:async()=>row});await expect(value.applyProtectedBankRegistration({context,bankAccountLinkId:row.bank_account_link_id})).rejects.toMatchObject({code:"NEON_BANK_REGISTRATION_NOT_VERIFIED"});});
 it("applies an independently verified protected registration",async()=>{let applied=false;const row={tenant_id:tenant,bank_account_link_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",company_code_id:"44444444-4444-4444-8444-444444444444",status:"active",is_verified:true};const value=service({protectedRegistration:async()=>row,applyProtectedRegistration:async()=>{applied=true;return{...row,is_applied:true};}});expect(await value.applyProtectedBankRegistration({context,bankAccountLinkId:row.bank_account_link_id})).toMatchObject({is_applied:true});expect(applied).toBe(true);});
 it("rejects maker verification even with a matching company permission",async()=>{
  const value=service({verification:async()=>({id:"verification",company_code_id:"company",status:"pending_verification",created_by:principal})});
  await expect(value.decideBankVerification({context,verificationId:"verification",decision:"verify",candidateBankAccountLinkId:"candidate",verificationMethod:"independent_review",evidence:{reference:"test"}})).rejects.toMatchObject({code:"NEON_BANK_VERIFICATION_SELF_APPROVAL"});
 });
 it("rejects application before verification",async()=>{
  const value=service({verification:async()=>({id:"verification",company_code_id:"company",status:"pending_verification"})});
  await expect(value.applyBankVerification({context,verificationId:"verification"})).rejects.toMatchObject({code:"NEON_BANK_VERIFICATION_NOT_VERIFIED"});
 });
 it("returns an applied receipt on replay without switching remittance again",async()=>{
  const value=service({verification:async()=>({id:"verification",company_code_id:"company",status:"applied"}),applyVerification:async()=>{throw new Error("must not write");}});
  expect(await value.applyBankVerification({context,verificationId:"verification"})).toMatchObject({replayed:true,verification:{status:"applied"}});
 });
});


describe("replay authorization and coordinates",()=>{
 const link={profile_projection_id:"projection",business_partner_id:"partner",network_relationship_id:"relationship",onboarding_request_id:null};
 const verification={bank_projection_id:"projection",supplier_company_profile_id:"profile",company_code_id:"company"};
 function fixture(allowed:boolean){
   const authorize=vi.fn(async()=>({allowed}));
   const value=createBusinessPartnerAccountBankLinkageService({repository:{linkByKey:async()=>link,verificationByKey:async()=>verification} as any,authorizer:{authorize} as any,transactions:{async run(_plane,_actor,work){return work({} as never);}}});
   return{value,authorize};
 }
 it("checks relationship permission on account-link replay",async()=>{
   const {value,authorize}=fixture(false);
   await expect(value.requestAccountLink({context,profileProjectionId:"projection",businessPartnerId:"partner",idempotencyKey:"link-replay-review"})).rejects.toMatchObject({status:403});
   expect(authorize).toHaveBeenCalledWith(expect.objectContaining({resource:expect.objectContaining({networkRelationshipId:"relationship"})}));
 });
 it("checks company permission on bank-verification replay",async()=>{
   const {value,authorize}=fixture(false);
   await expect(value.startBankVerification({context,bankProjectionId:"projection",supplierCompanyProfileId:"profile",idempotencyKey:"bank-replay-review"})).rejects.toMatchObject({status:403});
   expect(authorize).toHaveBeenCalledWith(expect.objectContaining({resource:expect.objectContaining({companyCodeId:"company"})}));
 });
 it("rejects reuse of account-link keys with different coordinates",async()=>{
   await expect(fixture(true).value.requestAccountLink({context,profileProjectionId:"different",businessPartnerId:"partner",idempotencyKey:"link-replay-review"})).rejects.toMatchObject({status:409});
 });
 it("rejects reuse of bank-verification keys with different coordinates",async()=>{
   await expect(fixture(true).value.startBankVerification({context,bankProjectionId:"different",supplierCompanyProfileId:"profile",idempotencyKey:"bank-replay-review"})).rejects.toMatchObject({status:409});
 });
 it("preserves identical authorized replays",async()=>{
   const {value}=fixture(true);
   expect(await value.requestAccountLink({context,profileProjectionId:"projection",businessPartnerId:"partner",idempotencyKey:"link-replay-review"})).toEqual({link,replayed:true});
   expect(await value.startBankVerification({context,bankProjectionId:"projection",supplierCompanyProfileId:"profile",idempotencyKey:"bank-replay-review"})).toEqual({verification,replayed:true});
 });
 it("authorizes the stored company when replaying a protected registration",async()=>{
   const authorize=vi.fn(async(input:any)=>(input.resource.companyCodeId==="company"?{allowed:true as const}:{allowed:false as const,reason:"test"}));
   const value=createBusinessPartnerAccountBankLinkageService({repository:{protectedRegistrationByKey:async()=>({business_partner_id:"partner",company_code_id:"other-company"})} as any,authorizer:{authorize},transactions:{async run(_plane,_actor,work){return work({} as never);}},secrets:{put:vi.fn(),resolve:vi.fn()}});
   await expect(value.registerProtectedBankAccount({context,businessPartnerId:"partner",companyCodeId:"company",accountHolderName:"Supplier",accountIdentifier:"GB82WEST12345698765432",accountIdType:"iban",currencyCode:"GBP",bankName:"Bank",bankCountryCode:"GB",idempotencyKey:"protected-replay-review"})).rejects.toMatchObject({status:403});
   expect(authorize).toHaveBeenCalledTimes(2);
 });
});


it("checks protected registration payloads and replays without requiring the secret store",async()=>{
  const input={context,businessPartnerId:"partner",companyCodeId:"company",accountHolderName:"Supplier",accountIdentifier:"GB82WEST12345698765432",accountIdType:"iban",currencyCode:"GBP",bankName:"Bank",bankCountryCode:"GB",idempotencyKey:"protected-details-review"};
  const row={bank_account_link_id:"link",business_partner_id:"partner",company_code_id:"company",registration_account_fingerprint:hash({tenantId:tenant,normalized:"GB82WEST12345698765432",country:"GB",type:"iban"}),registration_account_id_type:"iban",account_holder_name:"Supplier",currency_code:"GBP",bank_name_override:"Bank",bank_country_override:"GB",bic_override:null};
  const value=service({protectedRegistrationByKey:async()=>row});
  expect(await value.registerProtectedBankAccount(input)).toMatchObject({replayed:true,registration:{bank_account_link_id:"link"}});
  expect((await value.registerProtectedBankAccount(input)).registration).not.toHaveProperty("registration_account_fingerprint");
  await expect(value.registerProtectedBankAccount({...input,accountIdentifier:"GB29NWBK60161331926819"})).rejects.toMatchObject({status:409});
  await expect(value.registerProtectedBankAccount({...input,bankName:"Different bank"})).rejects.toMatchObject({status:409});
});

// Exercise the real application guard, including same-fingerprint version changes.
import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import { KyselyBusinessPartnerAccountBankRepository } from "./business-partner-account-bank-linkage.js";
describe("disclosure version binding",()=>{
 it.each([
  {current_disclosure_id:"reviewed",current_disclosure_version:2,projection_status:"available",payload_json:{}},
  {current_disclosure_id:"replacement",current_disclosure_version:1,projection_status:"available",payload_json:{}},
  {current_disclosure_id:"reviewed",current_disclosure_version:1,projection_status:"revoked",payload_json:{}},
  {current_disclosure_id:"reviewed",current_disclosure_version:1,projection_status:"available",payload_json:{expiresAt:"2020-01-01T00:00:00.000Z"}},
 ])("rejects stale, replaced, revoked or expired disclosure without applying",async projection=>{
  const db=new Kysely({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>new DummyDriver(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()}});
  const repository=new KyselyBusinessPartnerAccountBankRepository();
  vi.spyOn(repository,"projection").mockResolvedValue({id:"projection",account_fingerprint:"same",...projection});
  const candidate=vi.spyOn(repository,"verifyCandidate");
  await expect(repository.applyVerification({tenant_id:tenant,bank_projection_id:"projection",expected_disclosure_id:"reviewed",expected_disclosure_version:1,expected_account_fingerprint:"same"},principal,db as any)).rejects.toMatchObject({code:"NEON_BANK_DISCLOSURE_CHANGED"});
  expect(candidate).not.toHaveBeenCalled();
  await db.destroy();
 });
});

it("does not turn a company grant into tenant-wide usage authority",async()=>{
 const value=service({});
 await expect(value.configureUsageScope({context,linkId:"33333333-3333-4333-8333-333333333333",usageScope:"all_authorized_companies"})).rejects.toMatchObject({status:403});
});
