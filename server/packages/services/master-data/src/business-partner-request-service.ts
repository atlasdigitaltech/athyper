import { projectBusinessPartnerCaseExplanation } from "./business-partner-case-explanation.js";
import { parseInstant } from "@athyper/platform-temporal";
import { createHash, randomUUID } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxWriter } from "@athyper/server-contract-events";
import {
  businessPartnerRequestPermissions,
  businessPartnerPermissions,
  businessPartnerQualificationPermissions,
  type ApplyBusinessPartnerRequestCommand,
  type BusinessPartnerRequest,
  type BusinessPartnerRequestExtensions,
  type BusinessPartnerRequestRepository,
  type BusinessPartnerRequestSchemaResolver,
  type BusinessPartnerRequestService,
  type BusinessPartnerRequestTransactionCoordinator,
  type BusinessPartnerRequestValidator,
  type BusinessPartnerRequestView,
  type BusinessPartnerRequestWorkflowDefinition,
  type BusinessPartnerRequestWorkflowResolver,
  type CreateBusinessPartnerRequestCommand,
  type DecideBusinessPartnerRequestCommand,
  type SubmitBusinessPartnerRequestCommand,
} from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";
import { projectBusinessPartnerNotification } from "./business-partner-notifications.js";
import type { BusinessPartnerOnboardingCycleCoordinator } from "./business-partner-onboarding-cycle.js";

export interface BusinessPartnerRequestServiceOptions<Transaction> {
  readonly authorizer: Authorizer;
  readonly repository: BusinessPartnerRequestRepository<Transaction>;
  readonly transactions: BusinessPartnerRequestTransactionCoordinator<Transaction>;
  readonly schemas: BusinessPartnerRequestSchemaResolver;
  readonly validator: BusinessPartnerRequestValidator<Transaction>;
  readonly workflows: BusinessPartnerRequestWorkflowResolver<Transaction>;
  readonly audit: AuditRecorder<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly onboardingCycles?: BusinessPartnerOnboardingCycleCoordinator<Transaction>;
  readonly createRequestNo?: () => string;
}

export function createBusinessPartnerRequestService<Transaction>(options: BusinessPartnerRequestServiceOptions<Transaction>): BusinessPartnerRequestService {
  const requestNo = options.createRequestNo ?? (() => `BPR-${randomUUID().replaceAll("-", "").toUpperCase()}`);
  return {
    async preflightCreate(command) {
      assertContext(command.context);
      validateCreate(command);
      await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.create, {...scope(command.operatingOrganizationId, command.companyCodeId), entityCode: "entity_case", operationKey: "create", authorizationTarget: "proposed"});
      if (!options.validator.validateProposed) throw new MasterDataError(503, "BUSINESS_PARTNER_DRAFT_VALIDATOR_UNAVAILABLE", "Draft validation is unavailable");
      const schema = await options.schemas.resolve({ context: command.context, kind: command.kind, sourceKind: command.source.kind, ...(command.requestedRole ? {requestedRole: command.requestedRole} : {}) });
      validateSchema(schema);
      if (!schema.releaseId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(schema.releaseId)) throw new MasterDataError(503, "BUSINESS_PARTNER_REQUEST_SCHEMA_INVALID", "Published request schema release identity is invalid");
      if (command.expectedForm && JSON.stringify([command.expectedForm.code, command.expectedForm.version, command.expectedForm.hash, command.expectedForm.releaseId]) !== JSON.stringify([schema.code, schema.version, schema.hash, schema.releaseId])) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_FORM_CHANGED", "Reload the published request form");
      const validation = await options.transactions.run("neon", actor(command.context), transaction => options.validator.validateProposed!({ context: command.context, request: command }, transaction));
      validateValidationResult(validation);
      return {schema: {...schema, releaseId: schema.releaseId}, validation};
    },
    async create(command) {
      assertContext(command.context);
      validateCreate(command);
      await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.create, {...scope(command.operatingOrganizationId, command.companyCodeId),entityCode:"entity_case",operationKey:"create",authorizationTarget:"proposed"});
      const schema = await options.schemas.resolve({ context: command.context, kind: command.kind, sourceKind: command.source.kind, ...(command.requestedRole?{requestedRole:command.requestedRole}:{}) });
      validateSchema(schema);
      if (!schema.releaseId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(schema.releaseId)) throw new MasterDataError(503, "BUSINESS_PARTNER_REQUEST_SCHEMA_INVALID", "Published request schema release identity is invalid");
      if(command.expectedForm&&(command.expectedForm.code!==schema.code||command.expectedForm.version!==schema.version||command.expectedForm.hash!==schema.hash||command.expectedForm.releaseId!==schema.releaseId))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_FORM_CHANGED","The published request form changed after it was opened; reload before creating the request");
      return options.transactions.run("neon", actor(command.context), async (transaction) => {
        const existing = await options.repository.findByIdempotencyKey(command.context.tenantId, command.idempotencyKey, transaction);
        if (existing) {
          const matches = command.source.kind === "import" && command.kind === "new_partner" && options.repository.matchesGovernedImportCreation
            ? await options.repository.matchesGovernedImportCreation({context: command.context, command: withoutContext(command), schema, existing}, transaction)
            : creationFingerprint(existing) === commandFingerprint(command, schema);
          if (!matches) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_IDEMPOTENCY_CONFLICT", "Idempotency key was reused with different request content");
          return { request: existing, case: existing, replayed: true };
        }
        const created = await options.repository.create({ tenantId: command.context.tenantId, requestNo: requestNo(), command: withoutContext(command), schema, createdBy: command.context.principalId }, transaction);
        await effects(options, command.context, transaction, "business_partner.case.created", created, { sourceKind: created.source.kind, caseOperation: created.kind });
        return { request: created, case: created, replayed: false };
      });
    },
    async get(query) {
      assertContext(query.context);
      return options.transactions.run("neon", actor(query.context), async (transaction) => {
        const request = await options.repository.get(query.context.tenantId, query.requestId, transaction);
        if (!request) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        await authorize(options.authorizer, query.context, businessPartnerRequestPermissions.read, caseScope(request));
        return request;
      });
    },
    async explainCase(query) {
      assertContext(query.context);
      if (query.expectedVersion !== undefined && (!Number.isSafeInteger(query.expectedVersion) || query.expectedVersion < 1)) throw invalid("expectedVersion must be positive");
      return options.transactions.run("neon", actor(query.context), async transaction => {
        const view = await options.repository.getView(query.context.tenantId, query.requestId, transaction);
        if (!view) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Case explanation is unavailable");
        await authorize(options.authorizer, query.context, businessPartnerRequestPermissions.read, caseScope(view.request));
        if (query.businessPartnerId && query.businessPartnerId !== view.request.targetBusinessPartnerId && query.businessPartnerId !== view.request.materializedBusinessPartnerId) throw new MasterDataError(403, "FORBIDDEN", "Case explanation is unavailable");
        if (query.expectedVersion !== undefined && query.expectedVersion !== view.request.rowVersion) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Saved case changed; refresh the explanation");
        let baselineAllowed = false;
        if (view.previousSnapshot) {
          const payload = view.previousSnapshot.payload;
          const decision = await options.authorizer.authorize({context: query.context, observation:{entityCode:"business_partner",surface:"record",phase:"discover"}, permissionCode: businessPartnerRequestPermissions.read, resource: scope(typeof payload.operatingOrganizationId === "string" ? payload.operatingOrganizationId : undefined, typeof payload.companyCodeId === "string" ? payload.companyCodeId : undefined)});
          baselineAllowed = decision.allowed;
        }
        return projectBusinessPartnerCaseExplanation(view, baselineAllowed);
      });
    },
    async getView(query) {
      assertContext(query.context);
      return options.transactions.run("neon", actor(query.context), async (transaction) => {
        const view = await options.repository.getView(query.context.tenantId, query.requestId, transaction);
        if (!view) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        await authorize(options.authorizer, query.context, businessPartnerRequestPermissions.read, caseScope(view.request));
        const { previousSnapshot: _baseline, ...publicView } = view;
        return publicView;
      });
    },
    async list(query) {
      assertContext(query.context);
      if (query.beforeCreatedAt !== undefined && !Number.isFinite(parseInstant(query.beforeCreatedAt))) throw invalid("beforeCreatedAt must be a valid timestamp");
      if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200)) throw invalid("limit must be between 1 and 200");
      await authorize(options.authorizer, query.context, businessPartnerRequestPermissions.read, {...scope(query.operatingOrganizationId),entityCode:"entity_case",operationKey:"discover"});
      return options.transactions.run("neon", actor(query.context), async transaction => {
        const rows = await options.repository.list({ tenantId: query.context.tenantId, operatingOrganizationId: query.operatingOrganizationId, ...(query.status ? { status: query.status } : {}), ...(query.limit ? { limit: query.limit } : {}), ...(query.beforeCreatedAt ? { beforeCreatedAt: query.beforeCreatedAt } : {}) }, transaction);
        const visible: BusinessPartnerRequest[] = [];
        for (const row of rows) {
          if (row.tenantId !== query.context.tenantId) throw new MasterDataError(403,"FORBIDDEN","Case ownership mismatch");
          const decision = await options.authorizer.authorize({context:query.context,permissionCode:businessPartnerRequestPermissions.read,resource:caseScope(row)});
          if (decision.allowed) visible.push(row);
        }
        return visible;
      });
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
        await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.update, caseScope(current));
        const organizationId = command.operatingOrganizationId ?? current.operatingOrganizationId;
        await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.update, { ...caseScope(current), ...scope(organizationId, command.companyCodeId === undefined ? current.companyCodeId : command.companyCodeId ?? undefined), companyCodeId: command.companyCodeId === undefined ? current.companyCodeId : command.companyCodeId ?? undefined, authorizationTarget: "proposed" });
        const updated = await options.repository.patch({ tenantId: command.context.tenantId, requestId: command.requestId, expectedVersion: command.expectedVersion, proposedPayload: command.proposedPayload, ...(command.extensions!==undefined?{extensions:command.extensions}:{}), ...(command.operatingOrganizationId ? { operatingOrganizationId: command.operatingOrganizationId } : {}), ...(command.companyCodeId !== undefined ? { companyCodeId: command.companyCodeId } : {}), ...(command.requestedRole !== undefined ? { requestedRole: command.requestedRole } : {}), updatedBy: command.context.principalId }, transaction);
        if (!updated) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Request version or editable state changed");
        await effects(options, command.context, transaction, "business_partner.case.updated", updated, { priorVersion: command.expectedVersion });
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
        await authorizeCaseMutation(options.authorizer, command.context, current, "validate");
        const validation = await options.validator.validate({ context: command.context, request: current }, transaction);
        validateValidationResult(validation);
        const request = await options.repository.recordValidation({ tenantId: command.context.tenantId, requestId: command.requestId, expectedVersion: command.expectedVersion, evaluatedBy: command.context.principalId, result: validation }, transaction);
        if (!request) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Request version or validation state changed");
        await effects(options, command.context, transaction, "business_partner.case.validated", request, { evaluationId: validation.evaluationId, valid: validation.valid, ruleset: validation.ruleset });
        return { request, case: request, validation };
      });
    },
    async submit(command) {
      assertContext(command.context);
      validateWorkflowCommand(command.expectedVersion, command.idempotencyKey);
      return options.transactions.run("neon", actor(command.context), async (transaction) => {
        const current = await options.repository.get(command.context.tenantId, command.requestId, transaction);
        if (!current) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        await authorizeCaseMutation(options.authorizer, command.context, current, "submit");
        if (current.status === "pending_approval" && current.workflowRequestId) {
          const replay = await options.repository.submit({ tenantId: command.context.tenantId, requestId: command.requestId, expectedVersion: command.expectedVersion, submittedBy: command.context.principalId, idempotencyKey: command.idempotencyKey, definition: placeholderDefinition(), decisionFingerprint: current.decisionFingerprint ?? "", ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}) }, transaction);
          if (replay?.replayed) return replay;
          throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_ALREADY_SUBMITTED", "Request is already submitted with different command evidence");
        }
        if (current.status !== "draft") throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_NOT_SUBMITTABLE", "Only a validated draft can be submitted");
        if (current.rowVersion !== command.expectedVersion) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Request version changed before submission");
        assertPassedValidation(current);
        const submissionValidation = await options.validator.validate({context:command.context,request:current},transaction);
        if(!submissionValidation.valid)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_SUBMISSION_VALIDATION_FAILED","Request no longer satisfies current validation rules; validate and correct the draft before submission");
        if (current.registrationMode === "on_behalf" && !current.representationEvidenceId) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_REPRESENTATION_EVIDENCE_REQUIRED", "On-behalf registration requires representation evidence before submission");
        const definition = await options.workflows.resolve({ context: command.context, request: current }, transaction);
        validateWorkflowDefinition(definition, command.context.principalId);
        const fingerprint = submissionFingerprint(current, definition);
        const result = await options.repository.submit({ tenantId: command.context.tenantId, requestId: command.requestId, expectedVersion: command.expectedVersion, submittedBy: command.context.principalId, idempotencyKey: command.idempotencyKey, definition, decisionFingerprint: fingerprint, ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}) }, transaction);
        if (!result) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT", "Request version, validation evidence, or submission state changed");
        await effects(options, command.context, transaction, "business_partner.case.submitted", result.request, { cycleRunId: result.workflow.requestId, cycleTaskId: result.workflow.workItemId, definition: result.workflow.definition, decisionFingerprint: fingerprint, currentApproverPrincipalIds: definition.approverPrincipalIds });
        return result;
      });
    },
    async decide(command) {
      assertContext(command.context);
      validateDecisionCommand(command);
      return options.transactions.run("neon", actor(command.context), async (transaction) => {
        const view = await options.repository.getView(command.context.tenantId, command.requestId, transaction);
        if (!view) throw new MasterDataError(404, "BUSINESS_PARTNER_REQUEST_NOT_FOUND", "Business Partner request was not found");
        const current = view.request;
        if (current.workflowRequestId !== command.workflowRequestId) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_WORKFLOW_MISMATCH", "Decision does not address the request's pinned workflow");
        if (command.decision === "approve" && current.submittedBy === command.context.principalId) throw new MasterDataError(403, "BUSINESS_PARTNER_REQUEST_SELF_APPROVAL_FORBIDDEN", "The submitter cannot approve their own Business Partner request");
        assertDecisionTask(view.workflow, command);
        await authorize(options.authorizer, command.context, businessPartnerRequestPermissions.decide, { ...caseScope(current), tenantId: current.tenantId, requestId: current.id, workflowRequestId: command.workflowRequestId, submittedBy: current.submittedBy });
        const fingerprint = decisionFingerprint(current, command);
        const result = await options.repository.decide({ tenantId: command.context.tenantId, command: withoutDecisionContext(command), decidedBy: command.context.principalId, decisionFingerprint: fingerprint }, transaction);
        if (!result) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_DECISION_CONFLICT", "Request or work-item state/version changed, or the actor is not eligible");
        if (!result.replayed) {const eventCode=result.request.status==="approved"?"business_partner.case.approved":result.request.status==="rejected"?"business_partner.case.rejected":result.request.status==="returned"?"business_partner.case.returned":result.workflow.workItemStatus==="open"?"business_partner.workflow.stage.activated":"business_partner.workflow.vote.recorded";await effects(options, command.context, transaction,eventCode,result.request,{cycleRunId:result.workflow.requestId,cycleTaskId:result.workflow.workItemId,stageId:result.workflow.stageId,decision:command.decision,decisionFingerprint:fingerprint,...(result.workflow.ownerPrincipalId?{currentApproverPrincipalIds:[result.workflow.ownerPrincipalId]}:{})});}
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
          ...caseScope(current),
          tenantId: current.tenantId,
          requestId: current.id,
          approvedBy: current.approvedBy,
          approvedEvidencePinned: Boolean(current.approvedAt && current.approvedBy && current.decisionFingerprint),
        });
        if(current.kind==="activate_supplier")await authorize(options.authorizer,command.context,businessPartnerQualificationPermissions.activateSupplier,{...caseScope(current),businessPartnerId:current.targetBusinessPartnerId,activationCaseId:current.id,approvedEvidencePinned:Boolean(current.approvedAt&&current.approvedBy&&current.decisionFingerprint),requiresElevatedAssurance:true});
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
        const appliedEvent=current.kind==="deactivate"?"business_partner.lifecycle.deactivated":current.kind==="reactivate"?"business_partner.lifecycle.reactivated":current.kind==="archive"?"business_partner.lifecycle.archived":current.kind==="change_bank"?"business_partner.bank_verification.requested":current.kind==="activate_supplier"?"business_partner.supplier.activated":"business_partner.case.materialized";
        if (!result.replayed) await effects(options, command.context, transaction, appliedEvent, result.request, {
          businessPartnerId: result.materialization.businessPartnerId,
          resultKind: result.materialization.resultKind,
          partnerRole: result.materialization.partnerRole,
          roleId: result.materialization.roleId,
          ...(result.materialization.supplierId ? { supplierId: result.materialization.supplierId } : {}),
          ...(result.materialization.customerId ? { customerId: result.materialization.customerId } : {}),
          operatingOrganizationAssignmentId: result.materialization.operatingOrganizationAssignmentId,
          snapshotId: result.materialization.snapshotId,
          ...(result.materialization.bankVerificationId ? { bankVerificationId: result.materialization.bankVerificationId } : {}),
          ...(result.materialization.activationEvidenceId ? { activationEvidenceId: result.materialization.activationEvidenceId } : {}),
          ...(result.materialization.reasonCode ? { reasonCode: result.materialization.reasonCode } : {}),
          applicationFingerprint: result.materialization.applicationFingerprint,
        });
        return result;
      });
    },
  };
}

async function authorizeCaseMutation(authorizer:Authorizer,context:VerifiedRequestContext,request:BusinessPartnerRequest,action:"validate"|"submit"){if(request.source.kind==="portal"&&request.registrationMode==="self_service"&&request.applicantPrincipalId===context.principalId&&(request.requestedRole==="supplier"||request.requestedRole==="customer")){await authorize(authorizer,context,request.requestedRole==="supplier"?"neon.supplier_registration.external.respond":"neon.customer_registration.external.respond",{...caseScope(request),tenantId:request.tenantId,requestId:request.id,externalApplicant:true,restrictedSessionRequired:true,ownedRequestRequired:true,operation:action,makerCheckerEnforced:true});return;}await authorize(authorizer,context,action==="validate"?businessPartnerRequestPermissions.validate:businessPartnerRequestPermissions.submit,{...caseScope(request),...(action==="submit"?{tenantId:request.tenantId,requestId:request.id,makerCheckerEnforced:true}:{})});}

function assertContext(context: VerifiedRequestContext): void { if (context.planeKey !== "neon") throw new MasterDataError(400, "BUSINESS_PARTNER_REQUEST_NEON_REQUIRED", "Business Partner requests execute only in NEON"); }
function validateCreate(command: CreateBusinessPartnerRequestCommand): void {
  const commercial=["new_partner","add_supplier","add_customer","assign_organization","configure_company","change_bank","activate_supplier"].includes(command.kind);
  if (commercial&&!command.operatingOrganizationId) throw invalid("operatingOrganizationId is required for commercial scope");
  if (command.idempotencyKey.trim() !== command.idempotencyKey || command.idempotencyKey.length < 8 || command.idempotencyKey.length > 200) throw invalid("idempotencyKey must be trimmed and contain 8 to 200 characters");
  if ((command.kind === "new_partner") !== !command.targetBusinessPartnerId) throw invalid("new_partner must not have a target; every other request kind requires one");
  if (command.kind === "add_supplier" && command.requestedRole !== "supplier") throw invalid("add_supplier requires requestedRole supplier");
  if (command.kind === "add_customer" && command.requestedRole !== "customer") throw invalid("add_customer requires requestedRole customer");
  if (command.kind === "new_partner" && !["supplier", "customer"].includes(command.requestedRole ?? "")) throw invalid("new_partner requires supplier or customer role");
  if (["add_supplier", "add_customer", "assign_organization", "configure_company"].includes(command.kind) && !["supplier", "customer"].includes(command.requestedRole ?? "")) throw invalid("Commercial role onboarding and configuration support only supplier or customer");
  if (command.kind === "change_bank" && command.requestedRole !== "supplier") throw invalid("change_bank requires requestedRole supplier");
  if (command.kind === "activate_supplier" && command.requestedRole !== "supplier") throw invalid("activate_supplier requires requestedRole supplier");
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.evaluationId) || Number.isNaN(parseInstant(result.evaluatedAt)) || result.findings.length === 0) throw new MasterDataError(503, "BUSINESS_PARTNER_REQUEST_VALIDATOR_INVALID", "Validator returned invalid evaluation coordinates");
  for (const finding of result.findings) {
    if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(finding.ruleCode) || !/^[A-Z][A-Z0-9_.-]{1,126}$/.test(finding.messageCode) || !finding.fieldPath.trim() || finding.fieldPath.length > 512 || Buffer.byteLength(JSON.stringify(finding.evidenceReference), "utf8") > 65_536) throw new MasterDataError(503, "BUSINESS_PARTNER_REQUEST_VALIDATOR_INVALID", "Validator returned an invalid finding");
  }
}
function validatePayload(payload: Readonly<Record<string, unknown>>): void { if (!payload || Array.isArray(payload) || typeof payload !== "object") throw invalid("proposedPayload must be an object"); if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 1_048_576) throw invalid("proposedPayload exceeds 1 MiB"); }
function validatePayloadBoundary(command: CreateBusinessPartnerRequestCommand): void {
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
function validateExtensionApplicability(kind:CreateBusinessPartnerRequestCommand["kind"],_role:CreateBusinessPartnerRequestCommand["requestedRole"],extensions:BusinessPartnerRequestExtensions):void{const count=Object.values(extensions).reduce((total,items)=>total+(items?.length??0),0);if(count>0&&!(kind==="amend_partner"||kind==="add_supplier"||kind==="add_customer"||kind==="new_partner"))throw invalid("Typed identity extensions are not applicable to this request kind");}
function validateWorkflowCommand(expectedVersion: number, idempotencyKey: string): void { if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw invalid("expectedVersion must be a positive integer"); if (idempotencyKey.trim() !== idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) throw invalid("idempotencyKey must be trimmed and contain 8 to 200 characters"); }
function validateDecisionCommand(command: DecideBusinessPartnerRequestCommand): void { validateWorkflowCommand(command.expectedRequestVersion, command.idempotencyKey); if (!Number.isSafeInteger(command.expectedWorkItemVersion) || command.expectedWorkItemVersion < 1) throw invalid("expectedWorkItemVersion must be a positive integer"); if (!command.reason.trim() || command.reason.trim() !== command.reason || command.reason.length > 2_000) throw invalid("A trimmed decision reason of at most 2000 characters is required"); }
function assertRoleMaterializable(request: BusinessPartnerRequest): void {
  if (request.status !== "approved" && request.status !== "applied") throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_NOT_APPLICABLE", "Only an approved request can be materialized");
  const supported = (request.kind === "new_partner" && !request.targetBusinessPartnerId && (request.requestedRole === "supplier" || request.requestedRole === "customer"))
    || (request.kind === "add_supplier" && Boolean(request.targetBusinessPartnerId) && request.requestedRole === "supplier")
    || (request.kind === "add_customer" && Boolean(request.targetBusinessPartnerId) && request.requestedRole === "customer")
    || (request.kind === "assign_organization" && Boolean(request.targetBusinessPartnerId) && (request.requestedRole === "supplier" || request.requestedRole === "customer"))
    || (request.kind === "configure_company" && Boolean(request.targetBusinessPartnerId) && Boolean(request.companyCodeId) && (request.requestedRole === "supplier" || request.requestedRole === "customer"))
    || (request.kind === "change_bank" && Boolean(request.targetBusinessPartnerId) && Boolean(request.companyCodeId) && request.requestedRole === "supplier")
    || (request.kind === "activate_supplier" && Boolean(request.targetBusinessPartnerId) && request.requestedRole === "supplier")
    || (["amend_partner","deactivate","reactivate","archive"].includes(request.kind) && Boolean(request.targetBusinessPartnerId) && !request.requestedRole);
  if (!supported) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_KIND_UNSUPPORTED", "The request kind, target, role, and scope combination has no application authority");
  if (!request.approvedAt || !request.approvedBy || !request.decisionFingerprint || (["supplier","customer"].includes(request.requestedRole??"")&&!request.operatingOrganizationId)) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_APPROVAL_EVIDENCE_INVALID", "Pinned approval and request-kind-specific scope evidence are required");
  assertPassedValidation(request);
}
function assertPassedValidation(request: BusinessPartnerRequest): void { if (request.validationSummary["outcome"] !== "passed") throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_VALIDATION_REQUIRED", "A current passing validation evaluation is required before submission"); if (request.duplicateSummary["blocking"] === true) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_DUPLICATE_BLOCKED", "Blocking duplicate evidence must be resolved before submission"); }
function assertDecisionTask(workflow: BusinessPartnerRequestView["workflow"], command: DecideBusinessPartnerRequestCommand): void {
  if (!workflow || workflow.requestId !== command.workflowRequestId || workflow.workItemId !== command.workItemId) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_TASK_MISMATCH", "Decision does not address the current workflow task");
  if (!Number.isSafeInteger(workflow.workItemVersion) || workflow.workItemVersion !== command.expectedWorkItemVersion) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_TASK_VERSION_CONFLICT", "Workflow task version changed before the decision");
  if (!["open", "claimed"].includes(workflow.workItemStatus)) throw new MasterDataError(409, "BUSINESS_PARTNER_REQUEST_TASK_NOT_OPEN", "Workflow task is no longer open for decision");
  if (workflow.ownerPrincipalId !== command.context.principalId) throw new MasterDataError(403, "BUSINESS_PARTNER_REQUEST_TASK_OWNER_REQUIRED", "Only the current workflow task owner may decide this request");
}
function validateWorkflowDefinition(definition: BusinessPartnerRequestWorkflowDefinition, submitterId: string): void { validateSchema(definition);const stages=definition.stages?.filter(stage=>stage.routed)??[{code:definition.stageCode,name:definition.stageName,mode:"parallel" as const,quorum:{kind:"any" as const},approverPrincipalIds:definition.approverPrincipalIds,routed:true}];if(!stages.length)throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_WORKFLOW_ROUTE_EMPTY","Configured workflow conditions selected no approval stage");for(const stage of stages){const approvers=stage.approverPrincipalIds;if(!/^[A-Za-z][A-Za-z0-9_.-]{0,62}$/.test(stage.code)||!stage.name.trim()||approvers.length===0||new Set(approvers).size!==approvers.length||approvers.includes(submitterId)||approvers.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_APPROVER_UNAVAILABLE",`Workflow stage ${stage.code} requires at least one distinct eligible approver`);const value=stage.quorum.value;if(!["all","any","count","percentage"].includes(stage.quorum.kind)||(stage.quorum.kind==="count"&&(!Number.isInteger(value)||value!<1||value!>approvers.length))||(stage.quorum.kind==="percentage"&&(!Number.isFinite(value)||value!<=0||value!>100)))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_QUORUM_INVALID",`Workflow stage ${stage.code} has an invalid quorum`);if(stage.slaMinutes!==undefined&&(!Number.isInteger(stage.slaMinutes)||stage.slaMinutes<1))throw new MasterDataError(409,"BUSINESS_PARTNER_REQUEST_SLA_INVALID",`Workflow stage ${stage.code} has an invalid SLA`);}}
function placeholderDefinition(): BusinessPartnerRequestWorkflowDefinition { return { code: "replay", version: 1, hash: "0".repeat(64), stageCode: "replay", stageName: "Replay", approverPrincipalIds: [] }; }
function isHash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function invalid(message: string): MasterDataError { return new MasterDataError(400, "BUSINESS_PARTNER_REQUEST_INVALID", message); }
async function authorize(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string, resource: Readonly<Record<string, unknown>>): Promise<void> { const decision = await authorizer.authorize({ context, permissionCode, resource, observation: { entityCode: "business_partner", surface: "command", phase: permissionCode.endsWith(".read") ? "discover" : "execute" } }); if (!decision.allowed) { if (decision.reason === "mfa_required") throw new MasterDataError(403, "BUSINESS_PARTNER_REQUEST_STEP_UP_REQUIRED", `MFA verification is required for ${permissionCode}`); throw new MasterDataError(403, "FORBIDDEN", `Permission denied: ${permissionCode}`); } }
function scope(operatingOrganizationId?: string, companyCodeId?: string): Readonly<Record<string, unknown>> { return { ...(operatingOrganizationId ? { operatingOrganizationId } : {}), ...(companyCodeId ? { companyCodeId } : {}) }; }
function actor(context: VerifiedRequestContext) { return { tenantId: context.tenantId, principalId: context.principalId }; }
function withoutContext(command: CreateBusinessPartnerRequestCommand): Omit<CreateBusinessPartnerRequestCommand, "context"> { const { context: _context, ...result } = command; return result; }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; }
function hash(value: unknown): string { return createHash("sha256").update(stable(value)).digest("hex"); }
function commandFingerprint(command: CreateBusinessPartnerRequestCommand, schema: BusinessPartnerRequest["schema"]): string { return hash({ kind: command.kind, source: command.source, registrationMode:command.registrationMode??defaultRegistrationMode(command.source.kind), invitationId:command.invitationId, applicantPrincipalId:command.applicantPrincipalId, representedPartyName:command.representedPartyName, representationEvidenceId:command.representationEvidenceId, targetBusinessPartnerId: command.targetBusinessPartnerId, requestedRole: command.requestedRole, operatingOrganizationId: command.operatingOrganizationId, companyCodeId: command.companyCodeId,proposedPayload: command.proposedPayload, extensionFingerprint:hash(command.extensions??{}), schema }); }
function creationFingerprint(request: BusinessPartnerRequest): string { return hash({ kind: request.kind, source: request.source, registrationMode:request.registrationMode, invitationId:request.invitationId, applicantPrincipalId:request.applicantPrincipalId, representedPartyName:request.representedPartyName, representationEvidenceId:request.representationEvidenceId, targetBusinessPartnerId: request.targetBusinessPartnerId, requestedRole: request.requestedRole, operatingOrganizationId: request.operatingOrganizationId, companyCodeId: request.companyCodeId, proposedPayload: request.proposedPayload, extensionFingerprint:request.extensionSummary.fingerprint??hash({}), schema: request.schema }); }
function defaultRegistrationMode(sourceKind: CreateBusinessPartnerRequestCommand["source"]["kind"]): BusinessPartnerRequest["registrationMode"] { return sourceKind === "manual" ? "direct" : sourceKind === "portal" ? "self_service" : "integration"; }
function submissionFingerprint(request: BusinessPartnerRequest, definition: BusinessPartnerRequestWorkflowDefinition): string { return hash({ requestId: request.id, rowVersion: request.rowVersion, schema: request.schema, proposedPayload: request.proposedPayload, extensionSummary:request.extensionSummary, validationSummary: request.validationSummary, duplicateSummary: request.duplicateSummary, changeImpact: request.changeImpact, source: request.source, workflow: { ...definition, approverPrincipalIds: [...definition.approverPrincipalIds].sort(),...(definition.stages?{stages:definition.stages.map(stage=>({...stage,approverPrincipalIds:[...stage.approverPrincipalIds].sort(),...(stage.escalationPrincipalIds?{escalationPrincipalIds:[...stage.escalationPrincipalIds].sort()}:{} )}))}:{}) } }); }
function decisionFingerprint(request: BusinessPartnerRequest, command: DecideBusinessPartnerRequestCommand): string { return hash({ requestId: request.id, workflowRequestId: command.workflowRequestId, workItemId: command.workItemId, requestFingerprint: request.decisionFingerprint, expectedRequestVersion: command.expectedRequestVersion, expectedWorkItemVersion: command.expectedWorkItemVersion, decision: command.decision, reason: command.reason, decidedBy: command.context.principalId }); }
function applicationFingerprint(request: BusinessPartnerRequest, command: ApplyBusinessPartnerRequestCommand): string { return hash({ requestId: request.id, requestKind:request.kind, baseRecordVersion:request.baseRecordVersion, expectedVersion: command.expectedVersion, applicationIdempotencyKey: command.idempotencyKey, decisionFingerprint: request.decisionFingerprint, approvedAt: request.approvedAt, approvedBy: request.approvedBy, schema: request.schema, proposedPayload: request.proposedPayload, extensionFingerprint:request.extensionSummary.fingerprint,extensionCounts:request.extensionSummary.counts, validationSummary: request.validationSummary, duplicateSummary: request.duplicateSummary, changeImpact:request.changeImpact, source: request.source, requestedRole: request.requestedRole, operatingOrganizationId: request.operatingOrganizationId, companyCodeId: request.companyCodeId, appliedBy: command.context.principalId }); }
function withoutDecisionContext(command: DecideBusinessPartnerRequestCommand): Omit<DecideBusinessPartnerRequestCommand, "context"> { const { context: _context, ...result } = command; return result; }
function withoutApplyContext(command: ApplyBusinessPartnerRequestCommand): Omit<ApplyBusinessPartnerRequestCommand, "context"> { const { context: _context, ...result } = command; return result; }
async function effects<Transaction>(options: BusinessPartnerRequestServiceOptions<Transaction>, context: VerifiedRequestContext, transaction: Transaction, eventCode: string, request: BusinessPartnerRequest, metadata: Readonly<Record<string, unknown>>): Promise<void> { const safeMetadata={extensionMode:request.extensionSummary.mode,extensionCounts:request.extensionSummary.counts,...metadata};await options.onboardingCycles?.advance({tenantId:context.tenantId,principalId:context.principalId,eventCode,request,...(request.invitationId?{invitationId:request.invitationId}:{}),metadata:safeMetadata},transaction);const notification=projectBusinessPartnerNotification(eventCode,request,context.principalId,metadata);await options.outbox.append({ tenantId: context.tenantId, topic: "business-partner-governed-case", eventType: eventCode, ...(notification?{eventKey:notification.event.deduplicationKey}:{}), entityType: "entity_case", entityId: request.id, actorId: context.principalId, correlationId: context.correlationId, payload: { caseId: request.id, caseNo: request.requestNo, status: request.status, rowVersion: request.rowVersion, ...safeMetadata, ...(notification?{notification:notification.event,recipient_principal_ids:notification.recipientPrincipalIds}:{}) } }, transaction); const action=eventCode.endsWith("created")?"create":eventCode.endsWith("approved")?"approve":eventCode.endsWith("rejected")?"reject":"update"; await options.audit.record({ eventCode, action, outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: context.tenantId, entityType: "entity_case", entityId: request.id, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}), metadata:safeMetadata }, transaction); }

/** Child ownership is loaded from the case repository, independently of the BP parent. */
function caseScope(request: BusinessPartnerRequest): Readonly<Record<string,unknown>> {
  return { ...scope(request.operatingOrganizationId,request.companyCodeId), tenantId:request.tenantId,
    entityCode:"entity_case", resourceCode:"entity_case", recordId:request.id, requestId:request.id, authorizationTarget:"existing" };
}
