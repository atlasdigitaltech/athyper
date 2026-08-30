import { createHash, randomUUID } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxWriter } from "@athyper/server-contract-events";
import {
  businessPartnerRequestPermissions,
  businessPartnerPermissions,
  type ApplyBusinessPartnerRequestCommand,
  type BusinessPartnerRequest,
  type BusinessPartnerRequestExtensions,
  type BusinessPartnerRequestRepository,
  type BusinessPartnerRequestSchemaResolver,
  type BusinessPartnerRequestService,
  type BusinessPartnerRequestTransactionCoordinator,
  type BusinessPartnerRequestValidator,
  type BusinessPartnerRequestWorkflowDefinition,
  type BusinessPartnerRequestWorkflowResolver,
  type CreateBusinessPartnerRequestCommand,
  type DecideBusinessPartnerRequestCommand,
  type SubmitBusinessPartnerRequestCommand,
} from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

export interface BusinessPartnerRequestServiceOptions<Transaction> {
  readonly authorizer: Authorizer;
  readonly repository: BusinessPartnerRequestRepository<Transaction>;
  readonly transactions: BusinessPartnerRequestTransactionCoordinator<Transaction>;
  readonly schemas: BusinessPartnerRequestSchemaResolver;
  readonly validator: BusinessPartnerRequestValidator<Transaction>;
  readonly workflows: BusinessPartnerRequestWorkflowResolver<Transaction>;
  readonly audit: AuditRecorder<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly createRequestNo?: () => string;
}

export function createBusinessPartnerRequestService<Transaction>(options: BusinessPartnerRequestServiceOptions<Transaction>): BusinessPartnerRequestService {
  const requestNo = options.createRequestNo ?? (() => `BPR-${randomUUID().replaceAll("-", "").toUpperCase()}`);
  return {
    async create(command) {
      assertContext(command.context);
      validateCreate(command);
      await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.create, scope(command.operatingOrganizationId, command.companyCodeId));
      const schema = await options.schemas.resolve({ context: command.context, kind: command.kind, sourceKind: command.source.kind, ...(command.requestedRole?{requestedRole:command.requestedRole}:{}) });
      validateSchema(schema);
      return options.transactions.run("neon", actor(command.context), async (transaction) => {
        const existing = await options.repository.findByIdempotencyKey(command.context.tenantId, command.idempotencyKey, transaction);
        if (existing) {
          if (creationFingerprint(existing) !== commandFingerprint(command, schema)) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_IDEMPOTENCY_CONFLICT", "Idempotency key was reused with different request content");
          return { request: existing, replayed: true };
        }
        const created = await options.repository.create({ tenantId: command.context.tenantId, requestNo: requestNo(), command: withoutContext(command), schema, createdBy: command.context.principalId }, transaction);
        await effects(options, command.context, transaction, "business_partner.request.created", created, { sourceKind: created.source.kind, requestKind: created.kind });
        return { request: created, replayed: false };
      });
    },
    async get(query) {
      assertContext(query.context);
      return options.transactions.run("neon", actor(query.context), async (transaction) => {
        const request = await options.repository.get(query.context.tenantId, query.requestId, transaction);
        if (!request) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        await authorize(options.authorizer, query.context, businessPartnerRequestPermissions.read, scope(request.operatingOrganizationId, request.companyCodeId));
        return request;
      });
    },
    async getView(query) {
      assertContext(query.context);
      return options.transactions.run("neon", actor(query.context), async (transaction) => {
        const view = await options.repository.getView(query.context.tenantId, query.requestId, transaction);
        if (!view) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        await authorize(options.authorizer, query.context, businessPartnerRequestPermissions.read, scope(view.request.operatingOrganizationId, view.request.companyCodeId));
        return view;
      });
    },
    async list(query) {
      assertContext(query.context);
      if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200)) throw invalid("limit must be between 1 and 200");
      await authorize(options.authorizer, query.context, businessPartnerRequestPermissions.read, scope(query.operatingOrganizationId));
      return options.transactions.run("neon", actor(query.context), transaction => options.repository.list({ tenantId: query.context.tenantId, operatingOrganizationId: query.operatingOrganizationId, ...(query.status ? { status: query.status } : {}), ...(query.limit ? { limit: query.limit } : {}), ...(query.beforeCreatedAt ? { beforeCreatedAt: query.beforeCreatedAt } : {}) }, transaction));
    },
    async getAggregate(query) {
      assertContext(query.context);
      await authorize(options.authorizer, query.context, businessPartnerPermissions.read, scope(query.operatingOrganizationId));
      return options.transactions.run("neon", actor(query.context), async (transaction) => {
        const aggregate = await options.repository.getAggregate(query.context.tenantId, query.businessPartnerId, query.operatingOrganizationId, transaction);
        if (!aggregate) throw new MasterDataError(404, "BUSINESS_PARTNER_NOT_FOUND", "Business Partner was not found in the selected operating organization");
        return aggregate;
      });
    },
    async patch(command) {
      assertContext(command.context);
      if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) throw invalid("expectedVersion must be a positive integer");
      validatePayload(command.proposedPayload);
      if(command.extensions!==undefined)validateExtensions(command.extensions);
      return options.transactions.run("neon", actor(command.context), async (transaction) => {
        const current = await options.repository.get(command.context.tenantId, command.requestId, transaction);
        if (!current) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        if(command.extensions!==undefined)validateExtensionApplicability(current.kind,current.requestedRole,command.extensions);
        validatePayloadBoundary({source:current.source,requestedRole:current.requestedRole,proposedPayload:command.proposedPayload} as CreateBusinessPartnerRequestCommand);
        if (!["draft", "validation_failed", "returned"].includes(current.status)) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_NOT_EDITABLE", "Only draft, validation-failed, or returned requests can be edited");
        const organizationId = command.operatingOrganizationId ?? current.operatingOrganizationId;
        await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.update, scope(organizationId, command.companyCodeId === undefined ? current.companyCodeId : command.companyCodeId ?? undefined));
        const updated = await options.repository.patch({ tenantId: command.context.tenantId, requestId: command.requestId, expectedVersion: command.expectedVersion, proposedPayload: command.proposedPayload, ...(command.extensions!==undefined?{extensions:command.extensions}:{}), ...(command.operatingOrganizationId ? { operatingOrganizationId: command.operatingOrganizationId } : {}), ...(command.companyCodeId !== undefined ? { companyCodeId: command.companyCodeId } : {}), ...(command.legalEntityId !== undefined ? { legalEntityId: command.legalEntityId } : {}), ...(command.orgUnitId !== undefined ? { orgUnitId: command.orgUnitId } : {}), ...(command.positionId !== undefined ? { positionId: command.positionId } : {}), ...(command.requestedRole !== undefined ? { requestedRole: command.requestedRole } : {}), updatedBy: command.context.principalId }, transaction);
        if (!updated) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Request version or editable state changed");
        await effects(options, command.context, transaction, "business_partner.request.updated", updated, { priorVersion: command.expectedVersion });
        return updated;
      });
    },
    async validate(command) {
      assertContext(command.context);
      if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) throw invalid("expectedVersion must be a positive integer");
      return options.transactions.run("neon", actor(command.context), async (transaction) => {
        const current = await options.repository.get(command.context.tenantId, command.requestId, transaction);
        if (!current) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        if (!['draft', 'validation_failed', 'returned'].includes(current.status)) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_NOT_VALIDATABLE", "Only draft, validation-failed, or returned requests can be validated");
        if (current.rowVersion !== command.expectedVersion) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Request version changed before validation");
        await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.validate, scope(current.operatingOrganizationId, current.companyCodeId));
        const validation = await options.validator.validate({ context: command.context, request: current }, transaction);
        validateValidationResult(validation);
        const request = await options.repository.recordValidation({ tenantId: command.context.tenantId, requestId: command.requestId, expectedVersion: command.expectedVersion, evaluatedBy: command.context.principalId, result: validation }, transaction);
        if (!request) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Request version or validation state changed");
        await effects(options, command.context, transaction, "business_partner.request.validated", request, { evaluationId: validation.evaluationId, valid: validation.valid, ruleset: validation.ruleset });
        return { request, validation };
      });
    },
    async submit(command) {
      assertContext(command.context);
      validateWorkflowCommand(command.expectedVersion, command.idempotencyKey);
      return options.transactions.run("neon", actor(command.context), async (transaction) => {
        const current = await options.repository.get(command.context.tenantId, command.requestId, transaction);
        if (!current) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.submit, { ...scope(current.operatingOrganizationId, current.companyCodeId), tenantId: current.tenantId, requestId: current.id, makerCheckerEnforced: true });
        if (current.status === "pending_approval" && current.workflowRequestId) {
          const replay = await options.repository.submit({ tenantId: command.context.tenantId, requestId: command.requestId, expectedVersion: command.expectedVersion, submittedBy: command.context.principalId, idempotencyKey: command.idempotencyKey, definition: placeholderDefinition(), decisionFingerprint: current.decisionFingerprint ?? "", ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}) }, transaction);
          if (replay?.replayed) return replay;
          throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_ALREADY_SUBMITTED", "Request is already submitted with different command evidence");
        }
        if (current.status !== "draft") throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_NOT_SUBMITTABLE", "Only a validated draft can be submitted");
        if (current.rowVersion !== command.expectedVersion) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Request version changed before submission");
        assertPassedValidation(current);
        if (current.registrationMode === "on_behalf" && !current.representationEvidenceId) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_REPRESENTATION_EVIDENCE_REQUIRED", "On-behalf registration requires representation evidence before submission");
        const definition = await options.workflows.resolve({ context: command.context, request: current }, transaction);
        validateWorkflowDefinition(definition, command.context.principalId);
        const fingerprint = submissionFingerprint(current, definition);
        const result = await options.repository.submit({ tenantId: command.context.tenantId, requestId: command.requestId, expectedVersion: command.expectedVersion, submittedBy: command.context.principalId, idempotencyKey: command.idempotencyKey, definition, decisionFingerprint: fingerprint, ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}) }, transaction);
        if (!result) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Request version, validation evidence, or submission state changed");
        await effects(options, command.context, transaction, "business_partner.request.submitted", result.request, { workflowRequestId: result.workflow.requestId, workItemId: result.workflow.workItemId, definition: result.workflow.definition, decisionFingerprint: fingerprint });
        return result;
      });
    },
    async decide(command) {
      assertContext(command.context);
      validateDecisionCommand(command);
      return options.transactions.run("neon", actor(command.context), async (transaction) => {
        const current = await options.repository.get(command.context.tenantId, command.requestId, transaction);
        if (!current) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        if (current.workflowRequestId !== command.workflowRequestId) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_WORKFLOW_MISMATCH", "Decision does not address the request's pinned workflow");
        if (command.decision === "approve" && current.submittedBy === command.context.principalId) throw new MasterDataError(403, "BUSINESS_PARTNER_REQUEST_SELF_APPROVAL_FORBIDDEN", "The submitter cannot approve their own Business Partner request");
        await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.decide, { ...scope(current.operatingOrganizationId, current.companyCodeId), tenantId: current.tenantId, requestId: current.id, workflowRequestId: command.workflowRequestId, submittedBy: current.submittedBy });
        const fingerprint = decisionFingerprint(current, command);
        const result = await options.repository.decide({ tenantId: command.context.tenantId, command: withoutDecisionContext(command), decidedBy: command.context.principalId, decisionFingerprint: fingerprint }, transaction);
        if (!result) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_DECISION_CONFLICT", "Request or work-item state/version changed, or the actor is not eligible");
        if (!result.replayed) await effects(options, command.context, transaction, `business_partner.request.${command.decision === "approve" ? "approved" : command.decision === "reject" ? "rejected" : "returned"}`, result.request, { workflowRequestId: result.workflow.requestId, workItemId: result.workflow.workItemId, decision: command.decision, decisionFingerprint: fingerprint });
        return result;
      });
    },
    async apply(command) {
      assertContext(command.context);
      validateWorkflowCommand(command.expectedVersion, command.idempotencyKey);
      return options.transactions.run("neon", actor(command.context), async (transaction) => {
        const current = await options.repository.get(command.context.tenantId, command.requestId, transaction);
        if (!current) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.apply, {
          ...scope(current.operatingOrganizationId, current.companyCodeId),
          tenantId: current.tenantId,
          requestId: current.id,
          approvedBy: current.approvedBy,
          approvedEvidencePinned: Boolean(current.approvedAt && current.approvedBy && current.decisionFingerprint),
        });
        assertRoleMaterializable(current);
        if(current.status!=="applied"){
          const volatileValidation=await options.validator.validate({context:command.context,request:current},transaction);
          validateValidationResult(volatileValidation);
          if(!volatileValidation.valid)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_VOLATILE_VALIDATION_FAILED","Request validity changed after approval; review and approval must be repeated");
        }
        const fingerprint = applicationFingerprint(current, command);
        const result = await options.repository.apply({
          tenantId: command.context.tenantId,
          command: withoutApplyContext(command),
          appliedBy: command.context.principalId,
          applicationFingerprint: fingerprint,
          ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}),
        }, transaction);
        if (!result) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_APPLICATION_CONFLICT", "Request version, approval, validation, duplicate, source, or organization evidence changed before materialization");
        const appliedEvent=current.kind==="deactivate"?"business_partner.lifecycle.deactivated":current.kind==="reactivate"?"business_partner.lifecycle.reactivated":current.kind==="archive"?"business_partner.lifecycle.archived":current.kind==="change_bank"?"business_partner.bank_verification.requested":"business_partner.request.applied";
        if (!result.replayed) await effects(options, command.context, transaction, appliedEvent, result.request, {
          businessPartnerId: result.materialization.businessPartnerId,
          resultKind: result.materialization.resultKind,
          partnerRole: result.materialization.partnerRole,
          roleId: result.materialization.roleId,
          ...(result.materialization.supplierId ? { supplierId: result.materialization.supplierId } : {}),
          ...(result.materialization.customerId ? { customerId: result.materialization.customerId } : {}),
          operatingOrganizationAssignmentId: result.materialization.operatingOrganizationAssignmentId,
          ...(result.materialization.onboardingCaseId ? { onboardingCaseId: result.materialization.onboardingCaseId } : {}),
          snapshotId: result.materialization.snapshotId,
          ...(result.materialization.bankVerificationId ? { bankVerificationId: result.materialization.bankVerificationId } : {}),
          ...(result.materialization.reasonCode ? { reasonCode: result.materialization.reasonCode } : {}),
          applicationFingerprint: result.materialization.applicationFingerprint,
        });
        return result;
      });
    },
  };
}

function assertContext(context: VerifiedRequestContext): void { if (context.planeKey !== "neon") throw new MasterDataError(400, "BUSINESS_PARTNER_REQUEST_NEON_REQUIRED", "Business Partner requests execute only in NEON"); }
function validateCreate(command: CreateBusinessPartnerRequestCommand): void {
  const workforce=command.requestedRole==="workforce";
  const commercial=["new_partner","add_supplier","add_customer","assign_organization","configure_company","change_bank"].includes(command.kind)&&!workforce;
  if (commercial&&!command.operatingOrganizationId) throw invalid("operatingOrganizationId is required for commercial scope");
  if ((command.kind==="add_workforce"||command.kind==="change_employment"||(command.kind==="new_partner"&&workforce))&&(!command.legalEntityId||!command.companyCodeId||!command.orgUnitId)) throw invalid("workforce requests require legalEntityId, companyCodeId, and orgUnitId");
  if (command.idempotencyKey.trim() !== command.idempotencyKey || command.idempotencyKey.length < 8 || command.idempotencyKey.length > 200) throw invalid("idempotencyKey must be trimmed and contain 8 to 200 characters");
  if ((command.kind === "new_partner") !== !command.targetBusinessPartnerId) throw invalid("new_partner must not have a target; every other request kind requires one");
  if (command.kind === "add_supplier" && command.requestedRole !== "supplier") throw invalid("add_supplier requires requestedRole supplier");
  if (command.kind === "add_customer" && command.requestedRole !== "customer") throw invalid("add_customer requires requestedRole customer");
  if (command.kind === "add_workforce" && command.requestedRole !== "workforce") throw invalid("add_workforce requires requestedRole workforce");
  if (command.kind === "new_partner" && !["supplier", "customer", "workforce"].includes(command.requestedRole ?? "")) throw invalid("new_partner requires supplier, customer, or workforce role");
  if (["add_supplier", "add_customer", "assign_organization", "configure_company"].includes(command.kind) && !["supplier", "customer"].includes(command.requestedRole ?? "")) throw invalid("Commercial role onboarding and configuration support only supplier or customer");
  if (command.kind === "change_bank" && command.requestedRole !== "supplier") throw invalid("change_bank requires requestedRole supplier");
  if (command.kind === "change_employment" && command.requestedRole !== "workforce") throw invalid("change_employment requires requestedRole workforce");
  if (["amend_partner","deactivate","reactivate","archive"].includes(command.kind) && command.requestedRole) throw invalid("Partner amendment and lifecycle requests must not claim a role result");
  if (command.kind === "configure_company" && !command.companyCodeId) throw invalid("configure_company requires companyCodeId");
  const registrationMode = command.registrationMode ?? defaultRegistrationMode(command.source.kind);
  if (registrationMode === "self_service" && (command.source.kind !== "portal" || !command.invitationId || !command.applicantPrincipalId || command.representedPartyName || command.representationEvidenceId)) throw invalid("Self-service registration requires portal source, invitation, and applicant coordinates only");
  if (registrationMode === "on_behalf" && (command.source.kind !== "manual" || !command.representedPartyName?.trim() || command.invitationId || command.applicantPrincipalId)) throw invalid("On-behalf registration requires manual source and represented party coordinates");
  if (registrationMode === "integration" && !["mesh", "import", "api"].includes(command.source.kind)) throw invalid("Integration registration requires mesh, import, or api source");
  if (registrationMode === "direct" && (command.source.kind !== "manual" || command.invitationId || command.applicantPrincipalId || command.representedPartyName || command.representationEvidenceId)) throw invalid("Direct maintenance requires a manual source without representation coordinates");
  if (command.source.kind === "mesh" && (command.source.systemCode !== "athyper_mesh" || !command.source.entityCode || !command.source.entityId || !command.source.projectionId || !command.source.version || !isHash(command.source.payloadHash))) throw invalid("MESH source coordinates, pinned version, and payload hash are required");
  validatePayload(command.proposedPayload);
  validatePayloadBoundary(command);
  validateExtensions(command.extensions??{});
  validateExtensionApplicability(command.kind,command.requestedRole,command.extensions??{});
}
function validateSchema(schema: { readonly code: string; readonly version: number; readonly hash: string }): void { if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(schema.code) || !Number.isSafeInteger(schema.version) || schema.version < 1 || !isHash(schema.hash)) throw new MasterDataError(503, "BUSINESS_PARTNER_REQUEST_SCHEMA_INVALID", "Published request schema coordinates are invalid"); }
function validateValidationResult(result: Awaited<ReturnType<BusinessPartnerRequestValidator<unknown>["validate"]>>): void {
  validateSchema(result.ruleset);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.evaluationId) || Number.isNaN(Date.parse(result.evaluatedAt)) || result.findings.length === 0) throw new MasterDataError(503, "BUSINESS_PARTNER_REQUEST_VALIDATOR_INVALID", "Validator returned invalid evaluation coordinates");
  for (const finding of result.findings) {
    if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(finding.ruleCode) || !/^[A-Z][A-Z0-9_.-]{1,126}$/.test(finding.messageCode) || !finding.fieldPath.trim() || finding.fieldPath.length > 512 || Buffer.byteLength(JSON.stringify(finding.evidenceReference), "utf8") > 65_536) throw new MasterDataError(503, "BUSINESS_PARTNER_REQUEST_VALIDATOR_INVALID", "Validator returned an invalid finding");
  }
}
function validatePayload(payload: Readonly<Record<string, unknown>>): void { if (!payload || Array.isArray(payload) || typeof payload !== "object") throw invalid("proposedPayload must be an object"); if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 1_048_576) throw invalid("proposedPayload exceeds 1 MiB"); }
function validatePayloadBoundary(command: CreateBusinessPartnerRequestCommand): void {
  if(command.source.kind==="mesh"&&command.requestedRole==="workforce")throw invalid("MESH cannot originate workforce or person materialization");
  if(command.requestedRole==="workforce")return;
  const denied=new Set(["employeenumber","personnumber","hiredate","servicedate","probationenddate","terminationdate","employmenttype","manageremployeeid","fte","dateofbirth","nationalid","nationalidentifier","nationalidtoken","taxid","taxidentifier","taxidentifiertoken","taxregistration","taxregistrations","passportnumber","passportnumbertoken","emergencycontact","protectedattributes","addresses","contacts","contactpersons","contactchannels","identifiers","classifications","certifications"]);
  const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==="object"?Object.entries(value as Record<string,unknown>).flatMap(([key,item])=>[key.replace(/[_-]/g,"").toLowerCase(),...keys(item)]):[];
  const field=keys(command.proposedPayload).find(key=>denied.has(key));
  if(field)throw invalid("Generic Business Partner and commercial payloads cannot contain workforce or restricted person fields");
}
function validateExtensions(value:BusinessPartnerRequestExtensions):void{
  const groups=Object.entries(value);let total=0;const itemKeys=new Set<string>(),contacts=new Set<string>();
  for(const [group,rows] of groups){if(!Array.isArray(rows)||rows.length>100)throw invalid(`${group} must contain at most 100 typed items`);total+=rows.length;for(const raw of rows){if(!raw||typeof raw!=="object"||Array.isArray(raw))throw invalid(`${group} contains an invalid typed item`);const item=raw as unknown as Record<string,unknown>,key=item["clientItemKey"],field=item["definitionFieldCode"];if(typeof key!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(key)||itemKeys.has(`${group}:${key}`))throw invalid(`${group} clientItemKey is invalid or duplicated`);itemKeys.add(`${group}:${key}`);if(typeof field!=="string"||!/^[a-z][a-z0-9_.-]{1,126}$/.test(field))throw invalid(`${group} definitionFieldCode is invalid`);if(group==="contactPersons")contacts.add(key);for(const name of["normalizedHash","valueHash"]){if(item[name]!==undefined&&(typeof item[name]!=="string"||!/^[a-f0-9]{64}$/.test(item[name] as string)))throw invalid(`${group}.${name} must be SHA-256`);}for(const name of["protectedValueToken","certificateNumberToken"]){if(item[name]!==undefined&&(typeof item[name]!=="string"||!/^[A-Za-z0-9._:-]{8,512}$/.test(item[name] as string)))throw invalid(`${group}.${name} must be an opaque protected-data token`);}for(const [name,fieldValue]of Object.entries(item))if(typeof fieldValue==="string"&&fieldValue.length>2048)throw invalid(`${group}.${name} exceeds the typed field limit`);}}
  if(total>300)throw invalid("Typed request extensions must contain at most 300 items");
  for(const channel of value.contactChannels??[])if(!contacts.has(channel.contactClientItemKey))throw invalid("Every contact channel must reference a contact person in the same request");
  for(const identifier of value.identifiers??[]){if(Boolean(identifier.value)===Boolean(identifier.protectedValueToken))throw invalid("Identifier requires exactly one ordinary value or protected token");const scheme=identifier.schemeCode.replace(/[_-]/g,"").toLowerCase();if(identifier.value&&["nationalid","nationalidentifier","taxid","taxidentifier","passport","passportnumber"].includes(scheme))throw invalid("Restricted identifier schemes require an opaque protected token");}
  for(const tax of value.taxRegistrations??[])if(!tax.protectedValueToken||!tax.maskedValue)throw invalid("Tax registration requires a protected token and masked presentation");
  for(const tax of value.taxRegistrations??[])if(tax.protectedValueToken.length>128)throw invalid("Tax registration protected token exceeds the canonical field limit");
  for(const classification of value.classifications??[])if(classification.confidence!==undefined&&(!Number.isInteger(classification.confidence)||classification.confidence<0||classification.confidence>100))throw invalid("Classification confidence must be an integer from 0 to 100");
  for(const rows of groups.map(([,items])=>items))for(const item of rows){if(item.effectiveFrom&&item.effectiveUntil&&item.effectiveUntil<=item.effectiveFrom)throw invalid("Typed extension effectiveUntil must be later than effectiveFrom");}
  for(const certificate of value.certifications??[])if(Boolean(certificate.certificationTypeId)===Boolean(certificate.customName))throw invalid("Certification requires exactly one registered type or custom name");

  const required=(field:unknown,name:string,max=512):string=>{if(typeof field!=="string"||!field.trim()||field.length>max)throw invalid(`${name} is required and must not exceed ${max} characters`);return field;};
  const uuid=(field:unknown,name:string):void=>{if(typeof field!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(field))throw invalid(`${name} must be a UUID`);};
  const code=(field:unknown,name:string):void=>{if(typeof field!=="string"||!/^[a-z][a-z0-9_.-]{1,62}$/.test(field))throw invalid(`${name} must be a lowercase code`);};
  for(const item of value.addresses??[]){code(item.purpose,"Address purpose");if(!/^[A-Z]{2}$/.test(item.countryCode))throw invalid("Address countryCode must be ISO alpha-2 uppercase");required(item.normalizedHash,"Address normalizedHash",64);if(item.addressKind==="po_box")required(item.poBox,"Address poBox",160);if(item.validationEvidenceId)uuid(item.validationEvidenceId,"Address validationEvidenceId");}
  for(const item of value.contactPersons??[]){required(item.contactName,"Contact name",240);if(item.roleCode)code(item.roleCode,"Contact roleCode");}
  for(const item of value.contactChannels??[]){required(item.contactClientItemKey,"Contact channel contactClientItemKey",100);if(!["email","phone","fax","sms","whatsapp","website"].includes(item.channelType))throw invalid("Contact channel type is invalid");required(item.value,"Contact channel value",512);code(item.purpose,"Contact channel purpose");}
  for(const item of value.identifiers??[]){code(item.schemeCode,"Identifier schemeCode");required(item.valueHash,"Identifier valueHash",64);required(item.maskedValue,"Identifier maskedValue",256);}
  for(const item of value.taxRegistrations??[]){uuid(item.jurisdictionId,"Tax jurisdictionId");if(item.taxTypeId)uuid(item.taxTypeId,"Tax taxTypeId");code(item.registrationTypeCode,"Tax registrationTypeCode");required(item.valueHash,"Tax valueHash",64);}
  for(const item of value.classifications??[]){uuid(item.referenceId,"Classification referenceId");if(!["commodity","industry"].includes(item.classificationKind))throw invalid("Classification kind is invalid");if(item.classificationKind==="industry"&&!(["isic","naics"] as const).includes(item.domainCode as "isic"|"naics"))throw invalid("Industry classification domainCode must be isic or naics");}
  for(const item of value.certifications??[]){if(item.certificationTypeId)uuid(item.certificationTypeId,"Certification certificationTypeId");if(item.attachmentId)uuid(item.attachmentId,"Certification attachmentId");if(item.companyCodeId)uuid(item.companyCodeId,"Certification companyCodeId");}
}
function validateExtensionApplicability(kind:CreateBusinessPartnerRequestCommand["kind"],role:CreateBusinessPartnerRequestCommand["requestedRole"],extensions:BusinessPartnerRequestExtensions):void{const count=Object.values(extensions).reduce((total,items)=>total+(items?.length??0),0);if(count>0&&!(kind==="amend_partner"||kind==="add_supplier"||kind==="add_customer"||(kind==="new_partner"&&role!=="workforce")))throw invalid("Typed identity extensions are not applicable to this request kind");}
function validateWorkflowCommand(expectedVersion: number, idempotencyKey: string): void { if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw invalid("expectedVersion must be a positive integer"); if (idempotencyKey.trim() !== idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) throw invalid("idempotencyKey must be trimmed and contain 8 to 200 characters"); }
function validateDecisionCommand(command: DecideBusinessPartnerRequestCommand): void { validateWorkflowCommand(command.expectedRequestVersion, command.idempotencyKey); if (!Number.isSafeInteger(command.expectedWorkItemVersion) || command.expectedWorkItemVersion < 1) throw invalid("expectedWorkItemVersion must be a positive integer"); if (!command.reason.trim() || command.reason.trim() !== command.reason || command.reason.length > 2_000) throw invalid("A trimmed decision reason of at most 2000 characters is required"); }
function assertRoleMaterializable(request: BusinessPartnerRequest): void {
  if (request.status !== "approved" && request.status !== "applied") throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_NOT_APPLICABLE", "Only an approved request can be materialized");
  const supported = (request.kind === "new_partner" && !request.targetBusinessPartnerId && (request.requestedRole === "supplier" || request.requestedRole === "customer"))
    || (request.kind === "new_partner" && !request.targetBusinessPartnerId && request.requestedRole === "workforce")
    || (request.kind === "add_workforce" && Boolean(request.targetBusinessPartnerId) && request.requestedRole === "workforce")
    || (request.kind === "add_supplier" && Boolean(request.targetBusinessPartnerId) && request.requestedRole === "supplier")
    || (request.kind === "add_customer" && Boolean(request.targetBusinessPartnerId) && request.requestedRole === "customer")
    || (request.kind === "assign_organization" && Boolean(request.targetBusinessPartnerId) && (request.requestedRole === "supplier" || request.requestedRole === "customer"))
    || (request.kind === "configure_company" && Boolean(request.targetBusinessPartnerId) && Boolean(request.companyCodeId) && (request.requestedRole === "supplier" || request.requestedRole === "customer"))
    || (request.kind === "change_bank" && Boolean(request.targetBusinessPartnerId) && Boolean(request.companyCodeId) && request.requestedRole === "supplier")
    || (request.kind === "change_employment" && Boolean(request.targetBusinessPartnerId) && request.requestedRole === "workforce")
    || (["amend_partner","deactivate","reactivate","archive"].includes(request.kind) && Boolean(request.targetBusinessPartnerId) && !request.requestedRole);
  if (!supported) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_KIND_UNSUPPORTED", "The request kind, target, role, and scope combination has no application authority");
  if (!request.approvedAt || !request.approvedBy || !request.decisionFingerprint || (["supplier","customer"].includes(request.requestedRole??"")&&!request.operatingOrganizationId) || (request.requestedRole==="workforce"&&(!request.legalEntityId||!request.companyCodeId||!request.orgUnitId))) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_APPROVAL_EVIDENCE_INVALID", "Pinned approval and request-kind-specific scope evidence are required");
  assertPassedValidation(request);
}
function assertPassedValidation(request: BusinessPartnerRequest): void { if (request.validationSummary["outcome"] !== "passed") throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VALIDATION_REQUIRED", "A current passing validation evaluation is required before submission"); if (request.duplicateSummary["blocking"] === true) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_DUPLICATE_BLOCKED", "Blocking duplicate evidence must be resolved before submission"); }
function validateWorkflowDefinition(definition: BusinessPartnerRequestWorkflowDefinition, submitterId: string): void { validateSchema(definition); if (!/^[A-Za-z][A-Za-z0-9_.-]{0,62}$/.test(definition.stageCode) || !definition.stageName.trim() || definition.approverPrincipalIds.length === 0 || new Set(definition.approverPrincipalIds).size !== definition.approverPrincipalIds.length || definition.approverPrincipalIds.includes(submitterId) || definition.approverPrincipalIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_APPROVER_UNAVAILABLE", "Workflow requires at least one distinct eligible approver and valid pinned stage coordinates"); }
function placeholderDefinition(): BusinessPartnerRequestWorkflowDefinition { return { code: "replay", version: 1, hash: "0".repeat(64), stageCode: "replay", stageName: "Replay", approverPrincipalIds: [] }; }
function isHash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function invalid(message: string): MasterDataError { return new MasterDataError(400, "BUSINESS_PARTNER_REQUEST_INVALID", message); }
async function authorize(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string, resource: Readonly<Record<string, unknown>>): Promise<void> { const decision = await authorizer.authorize({ context, permissionCode, resource }); if (!decision.allowed) throw new MasterDataError(403, "FORBIDDEN", `Permission denied: ${permissionCode}`); }
function scope(operatingOrganizationId?: string, companyCodeId?: string): Readonly<Record<string, unknown>> { return { ...(operatingOrganizationId ? { operatingOrganizationId } : {}), ...(companyCodeId ? { companyCodeId } : {}) }; }
function actor(context: VerifiedRequestContext) { return { tenantId: context.tenantId, principalId: context.principalId }; }
function withoutContext(command: CreateBusinessPartnerRequestCommand): Omit<CreateBusinessPartnerRequestCommand, "context"> { const { context: _context, ...result } = command; return result; }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; }
function hash(value: unknown): string { return createHash("sha256").update(stable(value)).digest("hex"); }
function commandFingerprint(command: CreateBusinessPartnerRequestCommand, schema: BusinessPartnerRequest["schema"]): string { return hash({ kind: command.kind, source: command.source, registrationMode:command.registrationMode??defaultRegistrationMode(command.source.kind), invitationId:command.invitationId, applicantPrincipalId:command.applicantPrincipalId, representedPartyName:command.representedPartyName, representationEvidenceId:command.representationEvidenceId, targetBusinessPartnerId: command.targetBusinessPartnerId, requestedRole: command.requestedRole, operatingOrganizationId: command.operatingOrganizationId, companyCodeId: command.companyCodeId, legalEntityId:command.legalEntityId,orgUnitId:command.orgUnitId,positionId:command.positionId,proposedPayload: command.proposedPayload, extensionFingerprint:hash(command.extensions??{}), schema }); }
function creationFingerprint(request: BusinessPartnerRequest): string { return hash({ kind: request.kind, source: request.source, registrationMode:request.registrationMode, invitationId:request.invitationId, applicantPrincipalId:request.applicantPrincipalId, representedPartyName:request.representedPartyName, representationEvidenceId:request.representationEvidenceId, targetBusinessPartnerId: request.targetBusinessPartnerId, requestedRole: request.requestedRole, operatingOrganizationId: request.operatingOrganizationId, companyCodeId: request.companyCodeId,legalEntityId:request.legalEntityId,orgUnitId:request.orgUnitId,positionId:request.positionId, proposedPayload: request.proposedPayload, extensionFingerprint:request.extensionSummary.fingerprint??hash({}), schema: request.schema }); }
function defaultRegistrationMode(sourceKind: CreateBusinessPartnerRequestCommand["source"]["kind"]): BusinessPartnerRequest["registrationMode"] { return sourceKind === "manual" ? "direct" : sourceKind === "portal" ? "self_service" : "integration"; }
function submissionFingerprint(request: BusinessPartnerRequest, definition: BusinessPartnerRequestWorkflowDefinition): string { return hash({ requestId: request.id, rowVersion: request.rowVersion, schema: request.schema, proposedPayload: request.proposedPayload, extensionSummary:request.extensionSummary, validationSummary: request.validationSummary, duplicateSummary: request.duplicateSummary, changeImpact: request.changeImpact, source: request.source, workflow: { ...definition, approverPrincipalIds: [...definition.approverPrincipalIds].sort() } }); }
function decisionFingerprint(request: BusinessPartnerRequest, command: DecideBusinessPartnerRequestCommand): string { return hash({ requestId: request.id, workflowRequestId: command.workflowRequestId, workItemId: command.workItemId, requestFingerprint: request.decisionFingerprint, expectedRequestVersion: command.expectedRequestVersion, expectedWorkItemVersion: command.expectedWorkItemVersion, decision: command.decision, reason: command.reason, decidedBy: command.context.principalId }); }
function applicationFingerprint(request: BusinessPartnerRequest, command: ApplyBusinessPartnerRequestCommand): string { return hash({ requestId: request.id, requestKind:request.kind, baseRecordVersion:request.baseRecordVersion, expectedVersion: command.expectedVersion, applicationIdempotencyKey: command.idempotencyKey, decisionFingerprint: request.decisionFingerprint, approvedAt: request.approvedAt, approvedBy: request.approvedBy, schema: request.schema, proposedPayload: request.proposedPayload, extensionFingerprint:request.extensionSummary.fingerprint,extensionCounts:request.extensionSummary.counts, validationSummary: request.validationSummary, duplicateSummary: request.duplicateSummary, changeImpact:request.changeImpact, source: request.source, requestedRole: request.requestedRole, operatingOrganizationId: request.operatingOrganizationId, companyCodeId: request.companyCodeId,legalEntityId:request.legalEntityId,orgUnitId:request.orgUnitId,positionId:request.positionId, appliedBy: command.context.principalId }); }
function withoutDecisionContext(command: DecideBusinessPartnerRequestCommand): Omit<DecideBusinessPartnerRequestCommand, "context"> { const { context: _context, ...result } = command; return result; }
function withoutApplyContext(command: ApplyBusinessPartnerRequestCommand): Omit<ApplyBusinessPartnerRequestCommand, "context"> { const { context: _context, ...result } = command; return result; }
async function effects<Transaction>(options: BusinessPartnerRequestServiceOptions<Transaction>, context: VerifiedRequestContext, transaction: Transaction, eventCode: string, request: BusinessPartnerRequest, metadata: Readonly<Record<string, unknown>>): Promise<void> { const safeMetadata={extensionMode:request.extensionSummary.mode,extensionCounts:request.extensionSummary.counts,...metadata};await options.outbox.append({ tenantId: context.tenantId, topic: "business-partner-onboarding", eventType: eventCode, entityType: "business_partner_request", entityId: request.id, actorId: context.principalId, correlationId: context.correlationId, payload: { requestId: request.id, requestNo: request.requestNo, status: request.status, rowVersion: request.rowVersion, ...safeMetadata } }, transaction); const action=eventCode.endsWith("created")?"create":eventCode.endsWith("approved")?"approve":eventCode.endsWith("rejected")?"reject":"update"; await options.audit.record({ eventCode, action, outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: context.tenantId, entityType: "business_partner_request", entityId: request.id, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}), metadata:safeMetadata }, transaction); }
