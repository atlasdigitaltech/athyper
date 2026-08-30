import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BusinessPartnerRequest, BusinessPartnerRequestRepository, BusinessPartnerRequestValidationResult, CreateBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";
import { describe, expect, it } from "vitest";
import { createBusinessPartnerRequestService, createBusinessPartnerRequestValidator, MasterDataError } from "../index.js";

const context = {
  planeKey: "neon", tenantId: "11111111-1111-4111-8111-111111111111", principalId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333", profileHash: "profile", permissions: { allowed: [] },
} as unknown as VerifiedRequestContext;
const schema = { code: "neon.business_partner_request", version: 1, hash: "a".repeat(64) } as const;

class MemoryRepository implements BusinessPartnerRequestRepository<object> {
  readonly rows = new Map<string, BusinessPartnerRequest>();
  readonly validations: BusinessPartnerRequestValidationResult[] = [];
  async findByIdempotencyKey(tenantId: string, key: string) { return [...this.rows.values()].find(row => row.tenantId === tenantId && row.idempotencyKey === key) ?? null; }
  async create(input: Parameters<BusinessPartnerRequestRepository<object>["create"]>[0]) {
    const source = input.command.source;
    const registrationMode=input.command.registrationMode??(source.kind==="manual"?"direct":source.kind==="portal"?"self_service":"integration");
    const row: BusinessPartnerRequest = { id: "44444444-4444-4444-8444-444444444444", tenantId: input.tenantId, requestNo: input.requestNo, kind: input.command.kind, source, registrationMode, ...(input.command.invitationId?{invitationId:input.command.invitationId}:{}), ...(input.command.applicantPrincipalId?{applicantPrincipalId:input.command.applicantPrincipalId}:{}), ...(input.command.representedPartyName?{representedPartyName:input.command.representedPartyName}:{}), ...(input.command.representationEvidenceId?{representationEvidenceId:input.command.representationEvidenceId}:{}), ...(input.command.targetBusinessPartnerId ? { targetBusinessPartnerId: input.command.targetBusinessPartnerId } : {}), ...(input.command.requestedRole ? { requestedRole: input.command.requestedRole } : {}), operatingOrganizationId: input.command.operatingOrganizationId, ...(input.command.companyCodeId ? { companyCodeId: input.command.companyCodeId } : {}), schema: input.schema, proposedPayload: input.command.proposedPayload, extensionSummary:{mode:"typed_v1",counts:{addresses:input.command.extensions?.addresses?.length??0,contactPersons:input.command.extensions?.contactPersons?.length??0,contactChannels:input.command.extensions?.contactChannels?.length??0,identifiers:input.command.extensions?.identifiers?.length??0,taxRegistrations:input.command.extensions?.taxRegistrations?.length??0,classifications:input.command.extensions?.classifications?.length??0,certifications:input.command.extensions?.certifications?.length??0}}, validationSummary: {}, duplicateSummary: {}, changeImpact: {}, idempotencyKey: input.command.idempotencyKey, status: "draft", rowVersion: 1, createdAt: "2026-08-28T00:00:00.000Z", createdBy: input.createdBy };
    this.rows.set(row.id, row); return row;
  }
  async get(tenantId: string, requestId: string) { const row = this.rows.get(requestId); return row?.tenantId === tenantId ? row : null; }
  async getView(tenantId:string,requestId:string){const request=await this.get(tenantId,requestId);if(!request)return null;const validation=this.validations.at(-1);return{request,validationFindings:validation?.findings??[],...(request.workflowRequestId?{workflow:{requestId:request.workflowRequestId,stageId:"88888888-8888-4888-8888-888888888888",workItemId:"99999999-9999-4999-8999-999999999999",workItemVersion:1,workItemStatus:request.status==="pending_approval"?"open":"completed",definition:{code:"neon.business_partner.onboarding",version:1,hash:"b".repeat(64)}}}:{})};}
  async list(query: Parameters<BusinessPartnerRequestRepository<object>["list"]>[0]) { return [...this.rows.values()].filter(row => row.tenantId === query.tenantId && row.operatingOrganizationId === query.operatingOrganizationId); }
  async getAggregate(tenantId:string,businessPartnerId:string,operatingOrganizationId:string){const request=[...this.rows.values()].find(row=>row.tenantId===tenantId&&row.materializedBusinessPartnerId===businessPartnerId&&row.operatingOrganizationId===operatingOrganizationId);if(!request)return null;return{businessPartner:{id:businessPartnerId,code:"BP.TEST",name:"Acme",partnerCategory:"organization",aliases:[],status:"active",createdAt:"2026-08-28T04:00:00.000Z"},suppliers:request.materializedSupplierId?[{id:request.materializedSupplierId,supplierCode:"SUP.TEST",supplierType:"general",status:"onboarding",createdAt:"2026-08-28T04:00:00.000Z"}]:[],customers:request.materializedCustomerId?[{id:request.materializedCustomerId,customerCode:"CUS.TEST",customerType:"corporate",isKeyAccount:false,status:"prospect",createdAt:"2026-08-28T04:00:00.000Z"}]:[],organizationAssignments:[{id:request.materializedOperatingOrganizationAssignmentId!,operatingOrganizationId,operatingOrganizationCode:"organization",operatingOrganizationName:"Organization",partnerRole:request.requestedRole!,status:"active",effectiveFrom:"2026-08-28"}],onboardingRequests:[request]};}
  async patch(input: Parameters<BusinessPartnerRequestRepository<object>["patch"]>[0]) { const row = this.rows.get(input.requestId); if (!row || row.rowVersion !== input.expectedVersion) return null; const updated = { ...row, proposedPayload: input.proposedPayload, validationSummary:{},duplicateSummary:{},changeImpact:{},rowVersion: row.rowVersion + 1, updatedBy: input.updatedBy }; this.rows.set(row.id, updated); return updated; }
  async recordValidation(input: Parameters<BusinessPartnerRequestRepository<object>["recordValidation"]>[0]) { const row = this.rows.get(input.requestId); if (!row || row.rowVersion !== input.expectedVersion || !["draft","validation_failed","returned"].includes(row.status)) return null; this.validations.push(input.result); const updated: BusinessPartnerRequest = { ...row, status:input.result.valid ? "draft" : "validation_failed", validationSummary:input.result.validationSummary, duplicateSummary:input.result.duplicateSummary, changeImpact:input.result.changeImpact, rowVersion:row.rowVersion+2, updatedBy:input.evaluatedBy }; this.rows.set(row.id,updated); return updated; }
  async submit(input: Parameters<BusinessPartnerRequestRepository<object>["submit"]>[0]) { const row=this.rows.get(input.requestId); if(row?.status==="pending_approval") return null; if(!row||row.rowVersion!==input.expectedVersion||row.validationSummary["outcome"]!=="passed")return null; const updated:BusinessPartnerRequest={...row,status:"pending_approval",rowVersion:row.rowVersion+2,workflowRequestId:"77777777-7777-4777-8777-777777777777",decisionFingerprint:input.decisionFingerprint,submittedAt:"2026-08-28T02:00:00.000Z",submittedBy:input.submittedBy};this.rows.set(row.id,updated);return{request:updated,workflow:{requestId:updated.workflowRequestId!,stageId:"88888888-8888-4888-8888-888888888888",workItemId:"99999999-9999-4999-8999-999999999999",definition:{code:input.definition.code,version:input.definition.version,hash:input.definition.hash},decisionFingerprint:input.decisionFingerprint},replayed:false}; }
  async decide(input: Parameters<BusinessPartnerRequestRepository<object>["decide"]>[0]) {const row=this.rows.get(input.command.requestId);if(!row||row.status!=="pending_approval"||row.rowVersion!==input.command.expectedRequestVersion)return null;const status=input.command.decision==="approve"?"approved":input.command.decision==="reject"?"rejected":"returned";const updated:BusinessPartnerRequest={...row,status,rowVersion:row.rowVersion+1,...(status==="approved"?{approvedAt:"2026-08-28T03:00:00.000Z",approvedBy:input.decidedBy}:{})};this.rows.set(row.id,updated);return{request:updated,workflow:{requestId:input.command.workflowRequestId,stageId:"88888888-8888-4888-8888-888888888888",workItemId:input.command.workItemId,definition:{code:"neon.business_partner.onboarding",version:1,hash:"b".repeat(64)},decisionFingerprint:row.decisionFingerprint!},decision:input.command.decision,decisionFingerprint:input.decisionFingerprint,replayed:false};}
  async apply(input: Parameters<BusinessPartnerRequestRepository<object>["apply"]>[0]) {const row=this.rows.get(input.command.requestId);if(row?.status==="applied"&&row.applicationIdempotencyKey===input.command.idempotencyKey&&row.applicationFingerprint===input.applicationFingerprint)return application(row,true);if(!row||row.status!=="approved"||row.rowVersion!==input.command.expectedVersion)return null;const updated:BusinessPartnerRequest={...row,status:"applied",rowVersion:row.rowVersion+2,materializedBusinessPartnerId:row.targetBusinessPartnerId??"10101010-1010-4010-8010-101010101010",...(row.requestedRole==="customer"?{materializedCustomerId:"14141414-1010-4010-8010-101010101010"}:{materializedSupplierId:"11111111-1010-4010-8010-101010101010"}),materializedOperatingOrganizationAssignmentId:"12121212-1010-4010-8010-101010101010",materializationSnapshotId:"13131313-1010-4010-8010-101010101010",applicationIdempotencyKey:input.command.idempotencyKey,applicationFingerprint:input.applicationFingerprint,appliedAt:"2026-08-28T04:00:00.000Z",appliedBy:input.appliedBy};this.rows.set(row.id,updated);return application(updated,false);}
}

function application(request:BusinessPartnerRequest,replayed:boolean){const partnerRole=request.materializedCustomerId?"customer" as const:"supplier" as const;const roleId=request.materializedCustomerId??request.materializedSupplierId!;return{request,materialization:{businessPartnerId:request.materializedBusinessPartnerId!,partnerRole,roleId,...(request.materializedSupplierId?{supplierId:request.materializedSupplierId}:{}),...(request.materializedCustomerId?{customerId:request.materializedCustomerId}:{}),operatingOrganizationAssignmentId:request.materializedOperatingOrganizationAssignmentId!,snapshotId:request.materializationSnapshotId!,applicationFingerprint:request.applicationFingerprint!,extensionMaterializationCounts:request.extensionSummary.counts},replayed};}

function command(overrides: Partial<CreateBusinessPartnerRequestCommand> = {}): CreateBusinessPartnerRequestCommand {
  return { context, idempotencyKey: "request-key-001", kind: "new_partner", source: { kind: "manual" }, requestedRole: "supplier", operatingOrganizationId: "55555555-5555-4555-8555-555555555555", proposedPayload: { legalName: "Acme" }, ...overrides };
}

function fixture(allowed = true) {
  const repository = new MemoryRepository(), permissions: string[] = [], effects: string[] = [];
  const service = createBusinessPartnerRequestService({
    repository,
    authorizer: { async authorize(request) { permissions.push(request.permissionCode); return allowed ? { allowed: true } : { allowed: false, reason: "test" }; } },
    schemas: { async resolve() { return schema; } },
    validator: createBusinessPartnerRequestValidator({ duplicates:{ async findExactLegalName(){return [];} }, createEvaluationId:()=>"66666666-6666-4666-8666-666666666666", now:()=>new Date("2026-08-28T01:00:00.000Z") }),
    workflows:{async resolve(){return{code:"neon.business_partner.onboarding",version:1,hash:"b".repeat(64),stageCode:"business_review",stageName:"Business Partner Review",approverPrincipalIds:["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]};}},
    transactions: { async run(_plane, _actor, work) { return work({}); } },
    audit: { async record(input) { effects.push(input.eventCode); return {} as never; } },
    outbox: { async append(input) { effects.push(input.eventType); } },
    createRequestNo: () => "BPR-TEST-001",
  });
  return { service, repository, permissions, effects };
}

describe("Business Partner request service", () => {
  it("types direct, portal, integration, and on-behalf registration coordinates",async()=>{
    const value=fixture();
    const direct=await value.service.create(command());
    expect(direct.request.registrationMode).toBe("direct");
    await expect(value.service.create(command({idempotencyKey:"invalid-portal-001",source:{kind:"portal"},registrationMode:"self_service"}))).rejects.toMatchObject({code:"BUSINESS_PARTNER_REQUEST_INVALID"});
    await expect(value.service.create(command({idempotencyKey:"invalid-integration-001",source:{kind:"manual"},registrationMode:"integration"}))).rejects.toMatchObject({code:"BUSINESS_PARTNER_REQUEST_INVALID"});
    const represented=await value.service.create(command({idempotencyKey:"on-behalf-001",registrationMode:"on_behalf",representedPartyName:"Acme Supplier"}));
    expect(represented.request).toMatchObject({registrationMode:"on_behalf",representedPartyName:"Acme Supplier"});
  });

  it("creates once and replays the same internal NEON command without duplicate effects", async () => {
    const value = fixture();
    const first = await value.service.create(command()), second = await value.service.create(command());
    expect(first).toMatchObject({ replayed: false, request: { status: "draft", source: { kind: "manual" } } });
    expect(second).toMatchObject({ replayed: true, request: { id: first.request.id } });
    expect(value.effects).toEqual(["business_partner.request.created", "business_partner.request.created"]);
    expect(value.permissions).toEqual(["neon.relationship.business_partner_request.create", "neon.relationship.business_partner_request.create"]);
  });

  it("requires pinned MESH projection evidence before authorization or persistence", async () => {
    const value = fixture();
    await expect(value.service.create(command({ source: { kind: "mesh", systemCode: "athyper_mesh" } }))).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_INVALID" });
    expect(value.permissions).toEqual([]);
    expect(value.repository.rows.size).toBe(0);
  });

  it("persists identity extensions as typed coordinates and keeps them outside the general payload",async()=>{
    const value=fixture();
    const created=await value.service.create(command({extensions:{
      identifiers:[{clientItemKey:"duns-1",definitionFieldCode:"identity.identifier.duns",schemeCode:"duns",value:"123456789",valueHash:"b".repeat(64),maskedValue:"*****6789",isPrimary:true}],
      taxRegistrations:[{clientItemKey:"tax-1",definitionFieldCode:"tax.registration.primary",jurisdictionId:"77777777-7777-4777-8777-777777777777",registrationTypeCode:"vat",protectedValueToken:"vault:tax:opaque-001",valueHash:"c".repeat(64),maskedValue:"VAT-****42",isPrimary:true}],
    }}));
    expect(created.request.proposedPayload).toEqual({legalName:"Acme"});
    expect(created.request.extensionSummary).toMatchObject({mode:"typed_v1",counts:{identifiers:1,taxRegistrations:1}});
  });

  it("rejects identity extension families in unrestricted JSON and raw tax values in typed tax rows",async()=>{
    const value=fixture();
    await expect(value.service.create(command({proposedPayload:{legalName:"Acme",taxRegistrations:[{registrationNumber:"RAW-TAX-ID"}]}}))).rejects.toMatchObject({code:"BUSINESS_PARTNER_REQUEST_INVALID"});
    await expect(value.service.create(command({idempotencyKey:"raw-tax-extension-001",extensions:{taxRegistrations:[{clientItemKey:"tax-1",definitionFieldCode:"tax.registration.primary",jurisdictionId:"77777777-7777-4777-8777-777777777777",registrationTypeCode:"vat",protectedValueToken:"",valueHash:"c".repeat(64),maskedValue:"VAT-****42"}]}}))).rejects.toMatchObject({code:"BUSINESS_PARTNER_REQUEST_INVALID"});
    await expect(value.service.create(command({idempotencyKey:"raw-national-id-001",extensions:{identifiers:[{clientItemKey:"nid-1",definitionFieldCode:"identity.identifier.national",schemeCode:"national_id",value:"RAW-NATIONAL-ID",valueHash:"d".repeat(64),maskedValue:"*****1234"}]}}))).rejects.toMatchObject({code:"BUSINESS_PARTNER_REQUEST_INVALID"});
    expect(value.repository.rows.size).toBe(0);
    expect(value.permissions).toEqual([]);
  });

  it("requires an exact company coordinate for a role-specific finance configuration",async()=>{
    const value=fixture();
    const base={kind:"configure_company" as const,targetBusinessPartnerId:"aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",requestedRole:"supplier" as const,proposedPayload:{currencyCode:"USD"}};
    await expect(value.service.create(command(base))).rejects.toMatchObject({code:"BUSINESS_PARTNER_REQUEST_INVALID"});
    const created=await value.service.create(command({...base,companyCodeId:"bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",idempotencyKey:"company-config-001"}));
    expect(created.request).toMatchObject({kind:"configure_company",requestedRole:"supplier",companyCodeId:"bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",status:"draft"});
  });

  it("fails closed on idempotency drift and authorization denial", async () => {
    const value = fixture();
    await value.service.create(command());
    await expect(value.service.create(command({ proposedPayload: { legalName: "Different" } }))).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(fixture(false).service.create(command())).rejects.toBeInstanceOf(MasterDataError);
  });

  it("uses expected versions and organization-scoped update permission", async () => {
    const value = fixture(), created = (await value.service.create(command())).request;
    const updated = await value.service.patch({ context, requestId: created.id, expectedVersion: 1, proposedPayload: { legalName: "Acme Ltd" } });
    expect(updated).toMatchObject({ rowVersion: 2, proposedPayload: { legalName: "Acme Ltd" } });
    await expect(value.service.patch({ context, requestId: created.id, expectedVersion: 1, proposedPayload: {} })).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT" });
    expect(value.permissions.at(-1)).toBe("neon.relationship.business_partner_request.update");
  });

  it("loads a request before applying its organization-scoped read decision", async () => {
    const value=fixture(),created=(await value.service.create(command())).request;
    value.permissions.length=0;
    await expect(value.service.get({context,requestId:created.id})).resolves.toMatchObject({id:created.id});
    expect(value.permissions).toEqual(["neon.relationship.business_partner_request.read"]);
  });

  it("loads a review projection with latest validation and workflow coordinates",async()=>{const value=fixture(),created=(await value.service.create(command())).request;const validated=await value.service.validate({context,requestId:created.id,expectedVersion:1});const submitted=await value.service.submit({context,requestId:created.id,expectedVersion:validated.request.rowVersion,idempotencyKey:"submit-view-001"});const view=await value.service.getView({context,requestId:created.id});expect(view).toMatchObject({request:{status:"pending_approval"},workflow:{requestId:submitted.workflow.requestId,workItemVersion:1,workItemStatus:"open"}});expect(view.validationFindings).toHaveLength(15);});

  it("persists a ruleset-pinned validation evaluation and request summaries atomically", async () => {
    const value=fixture(),created=(await value.service.create(command())).request;
    const result=await value.service.validate({context,requestId:created.id,expectedVersion:1});
    expect(result.request).toMatchObject({status:"draft",rowVersion:3,validationSummary:{outcome:"passed"}});
    expect(result.validation).toMatchObject({evaluationId:"66666666-6666-4666-8666-666666666666",valid:true,ruleset:{code:"neon.business_partner_request.phase1",version:1}});
    expect(result.validation.findings).toHaveLength(15);
    expect(value.repository.validations).toHaveLength(1);
    expect(value.permissions.at(-1)).toBe("neon.relationship.business_partner_request.validate");
    expect(value.effects.slice(-2)).toEqual(["business_partner.request.validated","business_partner.request.validated"]);
  });

  it("moves requests with blocking findings to validation_failed and rejects stale validation", async () => {
    const value=fixture(),created=(await value.service.create(command({proposedPayload:{}}))).request;
    const result=await value.service.validate({context,requestId:created.id,expectedVersion:1});
    expect(result.request.status).toBe("validation_failed");
    expect(result.validation.valid).toBe(false);
    expect(result.validation.findings).toContainEqual(expect.objectContaining({ruleCode:"identity.legal_name.required",outcome:"failed",severity:"error"}));
    await expect(value.service.validate({context,requestId:created.id,expectedVersion:1})).rejects.toMatchObject({code:"BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT"});
    expect(value.repository.validations).toHaveLength(1);
  });

  it("submits a passing request into a pinned workflow and approves it with a distinct maker/checker",async()=>{const value=fixture(),created=(await value.service.create(command())).request;const validated=await value.service.validate({context,requestId:created.id,expectedVersion:1});const submitted=await value.service.submit({context,requestId:created.id,expectedVersion:validated.request.rowVersion,idempotencyKey:"submit-key-001"});expect(submitted).toMatchObject({replayed:false,request:{status:"pending_approval"},workflow:{definition:{code:"neon.business_partner.onboarding",version:1}}});const approverContext={...context,principalId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",assurance:"elevated"} as VerifiedRequestContext;const decided=await value.service.decide({context:approverContext,requestId:created.id,workflowRequestId:submitted.workflow.requestId,workItemId:submitted.workflow.workItemId,expectedRequestVersion:submitted.request.rowVersion,expectedWorkItemVersion:1,decision:"approve",reason:"Validated onboarding evidence",idempotencyKey:"decision-key-001"});expect(decided).toMatchObject({decision:"approve",request:{status:"approved",approvedBy:approverContext.principalId}});expect(value.effects.slice(-4)).toEqual(["business_partner.request.submitted","business_partner.request.submitted","business_partner.request.approved","business_partner.request.approved"]);});

  it("rejects self approval before persistence",async()=>{const value=fixture(),created=(await value.service.create(command())).request;const validated=await value.service.validate({context,requestId:created.id,expectedVersion:1});const submitted=await value.service.submit({context,requestId:created.id,expectedVersion:validated.request.rowVersion,idempotencyKey:"submit-key-002"});await expect(value.service.decide({context:{...context,assurance:"elevated"},requestId:created.id,workflowRequestId:submitted.workflow.requestId,workItemId:submitted.workflow.workItemId,expectedRequestVersion:submitted.request.rowVersion,expectedWorkItemVersion:1,decision:"approve",reason:"Invalid self approval",idempotencyKey:"decision-key-002"})).rejects.toMatchObject({code:"BUSINESS_PARTNER_REQUEST_SELF_APPROVAL_FORBIDDEN",status:403});});

  it.each([["return","returned"],["reject","rejected"]] as const)("persists a %s decision as %s",async(decision,status)=>{const value=fixture(),created=(await value.service.create(command())).request;const validated=await value.service.validate({context,requestId:created.id,expectedVersion:1});const submitted=await value.service.submit({context,requestId:created.id,expectedVersion:validated.request.rowVersion,idempotencyKey:`submit-${decision}-001`});const approverContext={...context,principalId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",assurance:"elevated"} as VerifiedRequestContext;const result=await value.service.decide({context:approverContext,requestId:created.id,workflowRequestId:submitted.workflow.requestId,workItemId:submitted.workflow.workItemId,expectedRequestVersion:submitted.request.rowVersion,expectedWorkItemVersion:1,decision,reason:`Evidence requires ${decision}`,idempotencyKey:`decision-${decision}-001`});expect(result.request.status).toBe(status);expect(result.decisionFingerprint).toMatch(/^[a-f0-9]{64}$/);});

  it("corrects, revalidates, and resubmits a returned request on its immutable workflow binding",async()=>{const value=fixture(),created=(await value.service.create(command())).request;const validated=await value.service.validate({context,requestId:created.id,expectedVersion:1});const first=await value.service.submit({context,requestId:created.id,expectedVersion:validated.request.rowVersion,idempotencyKey:"submit-return-cycle-001"});const approverContext={...context,principalId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",assurance:"elevated"} as VerifiedRequestContext;const returned=await value.service.decide({context:approverContext,requestId:created.id,workflowRequestId:first.workflow.requestId,workItemId:first.workflow.workItemId,expectedRequestVersion:first.request.rowVersion,expectedWorkItemVersion:1,decision:"return",reason:"Correct the legal name",idempotencyKey:"return-cycle-001"});const corrected=await value.service.patch({context,requestId:created.id,expectedVersion:returned.request.rowVersion,proposedPayload:{legalName:"Acme Corrected"}});const revalidated=await value.service.validate({context,requestId:created.id,expectedVersion:corrected.rowVersion});const second=await value.service.submit({context,requestId:created.id,expectedVersion:revalidated.request.rowVersion,idempotencyKey:"submit-return-cycle-002"});expect(second.request).toMatchObject({status:"pending_approval",workflowRequestId:first.workflow.requestId});expect(second.request.decisionFingerprint).not.toBe(first.request.decisionFingerprint);});

  it("materializes an approved Phase 1B supplier exactly once and returns stable result coordinates",async()=>{const value=fixture(),created=(await value.service.create(command())).request;const validated=await value.service.validate({context,requestId:created.id,expectedVersion:1});const submitted=await value.service.submit({context,requestId:created.id,expectedVersion:validated.request.rowVersion,idempotencyKey:"submit-apply-001"});const approverContext={...context,principalId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",assurance:"elevated"} as VerifiedRequestContext;const approved=await value.service.decide({context:approverContext,requestId:created.id,workflowRequestId:submitted.workflow.requestId,workItemId:submitted.workflow.workItemId,expectedRequestVersion:submitted.request.rowVersion,expectedWorkItemVersion:1,decision:"approve",reason:"Approved for supplier onboarding",idempotencyKey:"decision-apply-001"});const applyContext={...context,principalId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",assurance:"elevated"} as VerifiedRequestContext;const first=await value.service.apply({context:applyContext,requestId:created.id,expectedVersion:approved.request.rowVersion,idempotencyKey:"application-key-001"});const second=await value.service.apply({context:applyContext,requestId:created.id,expectedVersion:approved.request.rowVersion,idempotencyKey:"application-key-001"});expect(first).toMatchObject({replayed:false,request:{status:"applied"},materialization:{businessPartnerId:"10101010-1010-4010-8010-101010101010",supplierId:"11111111-1010-4010-8010-101010101010"}});expect(second).toMatchObject({replayed:true,materialization:first.materialization});expect(value.permissions.at(-1)).toBe("neon.relationship.business_partner_request.apply");expect(value.effects.slice(-2)).toEqual(["business_partner.request.applied","business_partner.request.applied"]);});

  it("returns a materialized aggregate only through the master read permission and organization scope",async()=>{const value=fixture(),created=(await value.service.create(command())).request;const row={...created,materializedBusinessPartnerId:"10101010-1010-4010-8010-101010101010",materializedSupplierId:"11111111-1010-4010-8010-101010101010",materializedOperatingOrganizationAssignmentId:"12121212-1010-4010-8010-101010101010"};value.repository.rows.set(created.id,row);const aggregate=await value.service.getAggregate({context,businessPartnerId:row.materializedBusinessPartnerId,operatingOrganizationId:created.operatingOrganizationId!});expect(aggregate).toMatchObject({businessPartner:{code:"BP.TEST"},suppliers:[{supplierCode:"SUP.TEST"}]});expect(value.permissions.at(-1)).toBe("neon.relationship.business_partner.read");await expect(value.service.getAggregate({context,businessPartnerId:row.materializedBusinessPartnerId,operatingOrganizationId:"55555555-5555-4555-8555-000000000000"})).rejects.toMatchObject({code:"BUSINESS_PARTNER_NOT_FOUND",status:404});});

  it("materializes an independently approved customer extension against the same identity",async()=>{const value=fixture(),created=(await value.service.create(command({kind:"add_customer",targetBusinessPartnerId:"10101010-1010-4010-8010-101010101010",requestedRole:"customer",proposedPayload:{customerCode:"CUS.TEST"}}))).request;const validated=await value.service.validate({context,requestId:created.id,expectedVersion:1});const submitted=await value.service.submit({context,requestId:created.id,expectedVersion:validated.request.rowVersion,idempotencyKey:"submit-customer-001"});const approverContext={...context,principalId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",assurance:"elevated"} as VerifiedRequestContext;const approved=await value.service.decide({context:approverContext,requestId:created.id,workflowRequestId:submitted.workflow.requestId,workItemId:submitted.workflow.workItemId,expectedRequestVersion:submitted.request.rowVersion,expectedWorkItemVersion:1,decision:"approve",reason:"Independent customer role approved",idempotencyKey:"decision-customer-001"});const applied=await value.service.apply({context:{...context,principalId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",assurance:"elevated"} as VerifiedRequestContext,requestId:created.id,expectedVersion:approved.request.rowVersion,idempotencyKey:"application-customer-001"});expect(applied).toMatchObject({request:{targetBusinessPartnerId:"10101010-1010-4010-8010-101010101010"},materialization:{businessPartnerId:"10101010-1010-4010-8010-101010101010",partnerRole:"customer",roleId:"14141414-1010-4010-8010-101010101010",customerId:"14141414-1010-4010-8010-101010101010"}});expect(applied.request.materializedSupplierId).toBeUndefined();});

  it("rejects mismatched add-role request kinds before authorization",async()=>{const value=fixture();await expect(value.service.create(command({kind:"add_customer",targetBusinessPartnerId:"10101010-1010-4010-8010-101010101010",requestedRole:"supplier"}))).rejects.toMatchObject({code:"BUSINESS_PARTNER_REQUEST_INVALID",status:400});expect(value.permissions).toEqual([]);});
});
