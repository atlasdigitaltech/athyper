import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createBusinessPartnerAccountBankLinkageService } from "./business-partner-account-bank-linkage.js";

const tenant="11111111-1111-4111-8111-111111111111",principal="22222222-2222-4222-8222-222222222222";
const context:any={planeKey:"neon",tenantId:tenant,principalId:principal,permissions:{tenantId:tenant,principalId:principal,planeKey:"neon",allowed:[],denied:[],planLocked:[],planeExcluded:[],authorizationScopes:[]}};
describe("governed provisional bank resolution", () => {
 const input={context,bankAccountLinkId:"link",institutionId:"institution",evidenceReference:"review/ticket-42"};
 function setup(overrides:Record<string,unknown>={},decision={allowed:true} as any){
  const row={id:"provisional",tenant_id:tenant,business_partner_id:"partner",maker_id:"independent-maker",status:"unresolved",...overrides};
  const resolveProvisional=vi.fn(async()=>({id:row.id,status:"resolved"}));
  const record=vi.fn(async()=>{}),authorize=vi.fn(async()=>decision);
  const repository={provisionalForRegistration:vi.fn(async()=>row),resolveProvisional};
  const value=createBusinessPartnerAccountBankLinkageService({repository,authorizer:{authorize},audit:{record},transactions:{run:async(_p:unknown,_a:unknown,work:any)=>work({})}} as any);
  return {value,record,authorize,resolveProvisional};
 }
 it("uses dedicated MFA directory-resolution authority without company coordinates",async()=>{
  const f=setup();expect(await f.value.resolveProvisionalBankReference(input)).toMatchObject({replayed:false});
  expect(f.authorize).toHaveBeenCalledWith(expect.objectContaining({permissionCode:"neon.business_partner_bank.resolve_directory",resource:{tenantId:tenant,businessPartnerId:"partner",governedWorkflow:true}}));
  expect(f.record).toHaveBeenCalledWith(expect.objectContaining({eventCode:"business_partner.bank_provisional.resolved",metadata:expect.objectContaining({makerChecker:true,accountUnchanged:true})}),expect.anything());
  expect(JSON.stringify(f.record.mock.calls)).not.toContain(input.evidenceReference);
 });
 it.each([
  [{maker_id:principal},"NEON_BANK_PROVISIONAL_SELF_RESOLUTION"],
  [{shared_reference:true},"NEON_BANK_PROVISIONAL_SHARED"],
  [{shared_owner:true},"NEON_BANK_PROVISIONAL_SHARED"],
  [{status:"rejected"},"NEON_BANK_PROVISIONAL_NOT_UNRESOLVED"],
  [{status:"resolved",resolved_institution_id:"other"},"NEON_BANK_PROVISIONAL_NOT_UNRESOLVED"],
 ])("rejects unsafe or terminal resolution %j",async(overrides,code)=>{
  const f=setup(overrides as Record<string,unknown>);await expect(f.value.resolveProvisionalBankReference(input)).rejects.toMatchObject({code});expect(f.resolveProvisional).not.toHaveBeenCalled();expect(f.record).not.toHaveBeenCalled();
 });
 it("returns the same receipt after a lost response, without another write or audit",async()=>{
  const f=setup({status:"resolved",resolved_institution_id:"institution",resolved_branch_id:null});expect(await f.value.resolveProvisionalBankReference(input)).toMatchObject({replayed:true});expect(f.resolveProvisional).not.toHaveBeenCalled();expect(f.record).not.toHaveBeenCalled();
 });
 it.each([{allowed:false,reason:"mfa_required"},{allowed:false,reason:"denied"}])("requires current authority even for replay %j",async decision=>{
  const f=setup({status:"resolved",resolved_institution_id:"institution"},decision);await expect(f.value.resolveProvisionalBankReference(input)).rejects.toMatchObject({status:403});expect(f.resolveProvisional).not.toHaveBeenCalled();
 });
 it("fails the transaction when audit capture fails",async()=>{
  const f=setup();f.record.mockRejectedValueOnce(Error("audit unavailable"));await expect(f.value.resolveProvisionalBankReference(input)).rejects.toThrow("audit unavailable");
 });
});
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

describe("partner bank fact capture",()=>{
 it("registers a partner account without company membership or company usage",async()=>{
  const authorize=vi.fn(async(_input:any)=>({allowed:true as const})),source=vi.fn(async()=>({owner_type_id:"owner-type"})),create=vi.fn(async(input:any)=>({bank_account_link_id:"link",account_last4:input.accountLast4,status:"active"}));
  const value=createBusinessPartnerAccountBankLinkageService({repository:{protectedRegistrationByKey:async()=>null,protectedRegistrationSource:source,createProtectedRegistration:create} as any,authorizer:{authorize},transactions:{async run(_p:any,_a:any,work:any){return work({});}},secrets:{async resolve(){throw Error("unused");},async create(reference){return{reference,version:"1",discard:async()=>{}};}}});
  await value.registerProtectedBankAccount({context,businessPartnerId:"partner",accountHolderName:"Supplier",accountIdentifier:"GB82WEST12345698765432",accountIdType:"iban",currencyCode:"GBP",bankName:"Bank",bankCountryCode:"GB",idempotencyKey:"partner-global-001"});
  expect(source).toHaveBeenCalledWith(tenant,"partner",undefined,expect.anything());
  expect(create.mock.calls[0]?.[0].companyCodeId).toBeUndefined();
  expect(authorize.mock.calls[0]?.[0]).toMatchObject({permissionCode:"neon.business_partner_bank.register",resource:{tenantId:tenant,businessPartnerId:"partner",governedWorkflow:true}});
  expect(JSON.stringify(authorize.mock.calls)).not.toContain("companyCodeId");
 });
 it("validates the partner before capture and discards a capture after a failed database write",async()=>{
  const discard=vi.fn(async()=>{}),capture=vi.fn(async(reference:string)=>({reference,version:"1",discard}));let valid=false;
  const value=createBusinessPartnerAccountBankLinkageService({repository:{protectedRegistrationByKey:async()=>null,protectedRegistrationSource:async()=>valid?{owner_type_id:"owner"}:null,createProtectedRegistration:async()=>{throw Error("write failed");}} as any,authorizer:{async authorize(){return{allowed:true};}},transactions:{async run(_p:any,_a:any,work:any){return work({});}},secrets:{async resolve(){throw Error("unused");},create:capture}});
  const input={context,businessPartnerId:"partner",accountHolderName:"Supplier",accountIdentifier:"GB82WEST12345698765432",accountIdType:"iban",currencyCode:"GBP",bankName:"Bank",bankCountryCode:"GB",idempotencyKey:"partner-failure-001"};
  await expect(value.registerProtectedBankAccount(input)).rejects.toMatchObject({code:"NEON_BANK_REGISTRATION_SCOPE_INVALID"});expect(capture).not.toHaveBeenCalled();
  valid=true;await expect(value.registerProtectedBankAccount(input)).rejects.toThrow("write failed");expect(discard).toHaveBeenCalledTimes(1);
 });

 it("retains bank authorization when company scope is absent",async()=>{
  const value=createBusinessPartnerAccountBankLinkageService({repository:{} as any,authorizer:{async authorize(){return{allowed:false,reason:"test denial"};}},transactions:{} as any});
  await expect(value.registerProtectedBankAccount({context,businessPartnerId:"partner",accountHolderName:"Supplier",accountIdentifier:"GB82WEST12345698765432",accountIdType:"iban",currencyCode:"GBP",bankName:"Bank",bankCountryCode:"GB",idempotencyKey:"partner-denied-001"})).rejects.toMatchObject({status:403});
 });
 it("does not let registration-only authority create company usage",async()=>{
  const authorize=vi.fn(async(input:any)=>input.permissionCode==="neon.business_partner_bank.register"?{allowed:true as const}:{allowed:false as const,reason:"No company authority"});
  const value=createBusinessPartnerAccountBankLinkageService({repository:{} as any,authorizer:{authorize},transactions:{} as any});
  await expect(value.registerProtectedBankAccount({context,businessPartnerId:"partner",companyCodeId:"company",accountHolderName:"Supplier",accountIdentifier:"GB82WEST12345698765432",accountIdType:"iban",currencyCode:"GBP",bankName:"Bank",bankCountryCode:"GB",idempotencyKey:"partner-company-denied"})).rejects.toMatchObject({status:400,code:"NEON_ACCOUNT_BANK_INVALID"});
  expect(authorize).not.toHaveBeenCalledWith(expect.objectContaining({permissionCode:"neon.business_partner_bank.apply"}));
 });

 it("stores the full bank identifier only in protected storage",async()=>{let protectedBytes="",created:any;const repository={protectedRegistrationByKey:async()=>null,protectedRegistrationSource:async()=>({owner_type_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}),createProtectedRegistration:async(input:any)=>{created=input;return{bank_account_link_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",account_last4:input.accountLast4,status:"active"};}};const value=createBusinessPartnerAccountBankLinkageService({repository:repository as any,authorizer:{async authorize(){return{allowed:true};}},transactions:{async run(_plane:any,_actor:any,work:any){return work({});}},secrets:{async resolve(){throw new Error("unused");},async create(_reference,value){protectedBytes=new TextDecoder().decode(value);return{reference:_reference,version:"1",discard:async()=>{}};}}});const result=await value.registerProtectedBankAccount({context,businessPartnerId:"33333333-3333-4333-8333-333333333333",accountHolderName:"Example Supplier",accountIdentifier:"GB82 WEST 1234 5698 7654 32",accountIdType:"iban",currencyCode:"GBP",bankName:"Example Bank",bankCountryCode:"GB",idempotencyKey:"protected-bank-001"});expect(result.registration).toMatchObject({account_last4:"5432"});expect(protectedBytes).toBe("GB82WEST12345698765432");expect(created).not.toHaveProperty("accountIdentifier");expect(JSON.stringify(created)).not.toContain("GB82WEST12345698765432");expect(created.protectedValueToken).toMatch(/^bank:/);});

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

 it("rejects reuse of account-link keys with different coordinates",async()=>{
   await expect(fixture(true).value.requestAccountLink({context,profileProjectionId:"different",businessPartnerId:"partner",idempotencyKey:"link-replay-review"})).rejects.toMatchObject({status:409});
 });

});

it("checks protected registration payloads and replays without requiring the secret store",async()=>{
  const input={context,businessPartnerId:"partner",accountHolderName:"Supplier",accountIdentifier:"GB82WEST12345698765432",accountIdType:"iban",currencyCode:"GBP",bankName:"Bank",bankCountryCode:"GB",idempotencyKey:"protected-details-review"};
  const row={bank_account_link_id:"link",business_partner_id:"partner",company_code_id:null,registration_account_fingerprint:hash({tenantId:tenant,normalized:"GB82WEST12345698765432",country:"GB",type:"iban"}),registration_account_id_type:"iban",account_holder_name:"Supplier",currency_code:"GBP",bank_name:"Bank",bank_country_code:"GB",bic_override:null};
  const value=service({protectedRegistrationByKey:async()=>row});
  expect(await value.registerProtectedBankAccount(input)).toMatchObject({replayed:true,registration:{bank_account_link_id:"link"}});
  expect((await value.registerProtectedBankAccount(input)).registration).not.toHaveProperty("registration_account_fingerprint");
  await expect(value.registerProtectedBankAccount({...input,accountIdentifier:"GB29NWBK60161331926819"})).rejects.toMatchObject({status:409});
  await expect(value.registerProtectedBankAccount({...input,bankName:"Different bank"})).rejects.toMatchObject({status:409});
});
