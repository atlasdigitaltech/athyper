import { parseInstant } from "@athyper/platform-temporal";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxWriter } from "@athyper/server-contract-events";
import {
  businessPartnerInvitationPermissions,
  type BusinessPartnerInvitation,
  type BusinessPartnerInvitationJourney,
  type BusinessPartnerInvitationRepository,
  type BusinessPartnerInvitationScope,
  type BusinessPartnerInvitationService,
  type BusinessPartnerInvitationTransactionCoordinator,
  type BusinessPartnerRequest,
  type BusinessPartnerRequestService,
  type BusinessPartnerRequestSchemaResolver,
  type CreateBusinessPartnerInvitationCommand,
} from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";
import type { BusinessPartnerOnboardingCycleCoordinator } from "./business-partner-onboarding-cycle.js";

export interface BusinessPartnerInvitationServiceOptions<Transaction> {
  readonly authorizer: Authorizer;
  readonly repository: BusinessPartnerInvitationRepository<Transaction>;
  readonly transactions: BusinessPartnerInvitationTransactionCoordinator<Transaction>;
  readonly schemas: BusinessPartnerRequestSchemaResolver;
  readonly audit: AuditRecorder<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly onboardingCycles?: BusinessPartnerOnboardingCycleCoordinator<Transaction>;
  readonly requests: Pick<BusinessPartnerRequestService, "validate" | "submit">;
  readonly evidence: {stage(input:{planeKey:"neon";tenantId:string;principalId:string;attachmentId:string;fileName:string;contentType:string;sizeBytes:number;entityType:string;entityId:string}):Promise<{attachmentId:string;uploadUrl:string;expiresAt:string}>;finalize(input:{planeKey:"neon";tenantId:string;principalId:string;attachmentId:string},contentType:string):Promise<{id:string;status:string;sha256?:string}>};
  readonly createInvitationNo?: (journey: BusinessPartnerInvitationJourney) => string;
  readonly createRequestNo?: () => string;
  readonly createToken?: () => string;
  readonly now?: () => Date;
}

const templates = Object.freeze({
  supplier: Object.freeze({ journeyKind: "supplier", requestedRole: "supplier", approvedFields: Object.freeze(["name", "registrationNumber", "taxIdentifiers", "addresses", "contacts", "bankEvidence"]), approvedActions: ["accept", "status", "correct", "evidence", "submit"] as const }),
  customer: Object.freeze({ journeyKind: "customer", requestedRole: "customer", approvedFields: Object.freeze(["name", "registrationNumber", "taxIdentifiers", "addresses", "contacts"]), approvedActions: ["accept", "status", "correct", "evidence", "submit"] as const }),
  candidate: Object.freeze({ journeyKind: "candidate", requestedRole: "workforce", approvedFields: Object.freeze(["firstName", "lastName", "preferredName", "personalEmail", "phone", "startDate", "identityEvidence"]), approvedActions: ["accept", "status", "correct", "evidence", "submit"] as const }),
} as const);

export function createBusinessPartnerInvitationService<Transaction>(options: BusinessPartnerInvitationServiceOptions<Transaction>): BusinessPartnerInvitationService {
  const now = options.now ?? (() => new Date());
  const issueToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
  const issueNo = options.createInvitationNo ?? (journey => `${journey === "candidate" ? "WFI" : "BPI"}-${randomUUID().replaceAll("-", "").toUpperCase()}`);
  const requestNo = options.createRequestNo ?? (() => `BPR-${randomUUID().replaceAll("-", "").toUpperCase()}`);
  return {
    template(journeyKind) { return templates[journeyKind]; },
    async create(command) {
      assertNeon(command.context);
      if(command.journeyKind === "candidate") throw new MasterDataError(410,"WORKFORCE_INVITATION_MOVED","Candidate intake must create a People/Workforce request");
      validateCreate(command, now());
      await authorize(options.authorizer, command.context, permission(command.journeyKind, "create"), { ...scopeForAuthorization(command.context.tenantId, command.scope), proposalOnly: true, makerCheckerEnforced: true });
      const emailHash = digest(normalizeEmail(command.inviteeEmail));
      return options.transactions.run("neon", actor(command.context), async transaction => {
        const existing = await options.repository.findByIdempotencyKey(command.context.tenantId, command.idempotencyKey, transaction);
        if (existing) {
          if (existing.inviteeEmailHash !== emailHash || fingerprint(existing.invitation) !== commandFingerprint(command)) throw conflict("BUSINESS_PARTNER_INVITATION_IDEMPOTENCY_CONFLICT", "Idempotency key was reused with different invitation content");
          return { invitation: existing.invitation, replayed: true };
        }
        const rawToken = issueToken(); assertTokenEntropy(rawToken);
        const invitation = await options.repository.create({ tenantId: command.context.tenantId, invitationNo: issueNo(command.journeyKind), journeyKind: command.journeyKind, registrationMode: command.registrationMode ?? "self_service", scope: command.scope, intendedPartyName: command.intendedPartyName, inviteeEmailHash: emailHash, tokenHash: digest(rawToken), expiresAt: new Date(command.expiresAt).toISOString(), idempotencyKey: command.idempotencyKey, createdBy: command.context.principalId }, transaction);
        await effect(options, transaction, command.context, invitation, "created");
        return { invitation, token: rawToken, replayed: false };
      });
    },
    async get(input) {
      assertNeon(input.context);
      return options.transactions.run("neon", actor(input.context), async transaction => {
        const invitation = await options.repository.get(input.context.tenantId, input.invitationId, transaction); if (!invitation) throw notFound();
        await authorize(options.authorizer, input.context, permission(invitation.journeyKind, "read"), scopeForAuthorization(input.context.tenantId, invitation.scope));
        return invitation;
      });
    },
    async resend(input) {
      assertNeon(input.context); validateVersion(input.expectedVersion); validateExpiry(input.expiresAt, now());
      return options.transactions.run("neon", actor(input.context), async transaction => {
        const current = await options.repository.get(input.context.tenantId, input.invitationId, transaction); if (!current) throw notFound();
        await authorize(options.authorizer, input.context, permission(current.journeyKind, "create"), scopeForAuthorization(input.context.tenantId, current.scope));
        const rawToken = issueToken(); assertTokenEntropy(rawToken);
        const invitation = await options.repository.resend({ tenantId: input.context.tenantId, invitationId: input.invitationId, expectedVersion: input.expectedVersion, tokenHash: digest(rawToken), expiresAt: new Date(input.expiresAt).toISOString(), actorId: input.context.principalId }, transaction);
        if (!invitation) throw conflict("BUSINESS_PARTNER_INVITATION_RACE_LOST", "Invitation was accepted, cancelled, expired, or changed before resend");
        await effect(options, transaction, input.context, invitation, "resent"); return { invitation, token: rawToken, replayed: false };
      });
    },
    async cancel(input) {
      assertNeon(input.context); validateVersion(input.expectedVersion);
      return options.transactions.run("neon", actor(input.context), async transaction => {
        const current = await options.repository.get(input.context.tenantId, input.invitationId, transaction); if (!current) throw notFound();
        await authorize(options.authorizer, input.context, permission(current.journeyKind, "cancel"), scopeForAuthorization(input.context.tenantId, current.scope));
        const invitation = await options.repository.cancel({ tenantId: input.context.tenantId, invitationId: input.invitationId, expectedVersion: input.expectedVersion, actorId: input.context.principalId }, transaction);
        if (!invitation) throw conflict("BUSINESS_PARTNER_INVITATION_RACE_LOST", "Invitation was accepted, cancelled, expired, or changed before cancellation");
        await effect(options, transaction, input.context, invitation, "cancelled"); return invitation;
      });
    },
    async accept(command) {
      assertNeon(command.context); validateAccept(command.token, command.inviteeEmail, command.requestIdempotencyKey, command.proposedPayload);
      if(command.journeyKind === "candidate") throw new MasterDataError(410,"WORKFORCE_INVITATION_MOVED","Candidate invitations must use the People/Workforce service");
      await authorize(options.authorizer, command.context, permission(command.journeyKind, "respond"), { tenantId: command.context.tenantId, externalApplicant: true, restrictedSessionRequired: true, journeyKind: command.journeyKind });
      assertApprovedFields(command.journeyKind, command.proposedPayload);
      const schema = await options.schemas.resolve({ context: command.context, kind: "new_partner", sourceKind: "portal", requestedRole: command.journeyKind });
      if (!schema.code || schema.version < 1 || !/^[a-f0-9]{64}$/.test(schema.hash)) throw new MasterDataError(503, "BUSINESS_PARTNER_INVITATION_SCHEMA_UNAVAILABLE", "Published request schema is unavailable");
      return options.transactions.run("neon", actor(command.context), async transaction => {
        const result = await options.repository.accept({ tenantId: command.context.tenantId, journeyKind: command.journeyKind, tokenHash: digest(command.token), inviteeEmailHash: digest(normalizeEmail(command.inviteeEmail)), applicantPrincipalId: command.context.principalId, requestIdempotencyKey: command.requestIdempotencyKey, requestNo: requestNo(), schema, proposedPayload: command.proposedPayload }, transaction);
        if (!result) throw notFound(); if (!result.replayed) {await options.onboardingCycles?.advance({tenantId:command.context.tenantId,principalId:command.context.principalId,eventCode:`business_partner_invitation.${result.invitation.journeyKind}.accepted`,request:result.request,invitationId:result.invitation.id},transaction);await effect(options, transaction, command.context, result.invitation, "accepted");} const application=externalProjection(command.journeyKind,result.request);return{invitation:{id:result.invitation.id,invitationNo:result.invitation.invitationNo,status:result.invitation.status},request:{id:application.requestId,...application},case:{id:application.requestId,...application},replayed:result.replayed};
      });
    },
    async expireDue(input) {
      const limit = input.limit ?? 500, at = input.now ?? now().toISOString();
      if (!input.tenantId || !input.actorId || !Number.isSafeInteger(limit) || limit < 1 || limit > 5000 || Number.isNaN(parseInstant(at))) throw invalid("Expiry input is invalid");
      return options.transactions.run("neon", { tenantId: input.tenantId, principalId: input.actorId }, async transaction => options.repository.expireDue({ tenantId: input.tenantId, actorId: input.actorId, now: at, limit }, transaction));
    },
    async externalStatus(input) {
      assertNeon(input.context); await authorize(options.authorizer,input.context,permission(input.journeyKind,"respond"),{tenantId:input.context.tenantId,externalApplicant:true,restrictedSessionRequired:true,ownedRequestRequired:true,journeyKind:input.journeyKind});
      return options.transactions.run("neon",actor(input.context),async transaction=>{const request=await options.repository.getOwnedRequest(input.context.tenantId,input.requestId,input.context.principalId,input.journeyKind,transaction);if(!request)throw notFound();return externalProjection(input.journeyKind,request);});
    },
    async correctReturned(input) {
      assertNeon(input.context);validateVersion(input.expectedVersion);assertApprovedFields(input.journeyKind,input.proposedPayload);await authorize(options.authorizer,input.context,permission(input.journeyKind,"respond"),{tenantId:input.context.tenantId,externalApplicant:true,restrictedSessionRequired:true,ownedRequestRequired:true,operation:"correct",journeyKind:input.journeyKind});
      return options.transactions.run("neon",actor(input.context),async transaction=>{const corrected=await options.repository.correctOwnedRequest({tenantId:input.context.tenantId,requestId:input.requestId,applicantPrincipalId:input.context.principalId,journeyKind:input.journeyKind,expectedVersion:input.expectedVersion,proposedPayload:input.proposedPayload},transaction);if(!corrected)throw conflict("BUSINESS_PARTNER_INVITATION_CORRECTION_CONFLICT","Only the owning restricted applicant can correct the current returned request version");return corrected;});
    },
    async attachEvidence(input) {
      assertNeon(input.context);if(!/^[a-z][a-z0-9_.-]{1,62}$/.test(input.evidenceKind)||!/^[a-f0-9]{64}$/.test(input.contentHash))throw invalid("Evidence kind or content hash is invalid");await authorize(options.authorizer,input.context,permission(input.journeyKind,"respond"),{tenantId:input.context.tenantId,externalApplicant:true,restrictedSessionRequired:true,ownedRequestRequired:true,operation:"evidence",journeyKind:input.journeyKind});
      return options.transactions.run("neon",actor(input.context),async transaction=>{const evidenceId=await options.repository.attachOwnedEvidence({tenantId:input.context.tenantId,requestId:input.requestId,applicantPrincipalId:input.context.principalId,journeyKind:input.journeyKind,evidenceKind:input.evidenceKind,attachmentId:input.attachmentId,contentHash:input.contentHash,classificationCode:input.classificationCode},transaction);if(!evidenceId)throw conflict("BUSINESS_PARTNER_INVITATION_EVIDENCE_CONFLICT","Evidence can only be attached by the owning restricted applicant while correction is open");return{evidenceId};});
    },
    async stageEvidence(input){assertNeon(input.context);if(!Number.isSafeInteger(input.sizeBytes)||input.sizeBytes<1||input.sizeBytes>25*1024*1024||!input.fileName.trim()||input.fileName.length>1024||!input.contentType.trim()||input.contentType.length>255)throw invalid("Evidence upload metadata is invalid");await authorize(options.authorizer,input.context,permission(input.journeyKind,"respond"),{tenantId:input.context.tenantId,externalApplicant:true,restrictedSessionRequired:true,ownedRequestRequired:true,operation:"evidence_stage",journeyKind:input.journeyKind});const owned=await options.transactions.run("neon",actor(input.context),transaction=>options.repository.getOwnedRequest(input.context.tenantId,input.requestId,input.context.principalId,input.journeyKind,transaction));if(!owned||!["draft","validation_failed","returned"].includes(owned.status))throw notFound();return options.evidence.stage({planeKey:"neon",tenantId:input.context.tenantId,principalId:input.context.principalId,attachmentId:input.attachmentId,fileName:input.fileName.trim(),contentType:input.contentType.trim(),sizeBytes:input.sizeBytes,entityType:"document.entity_case",entityId:owned.id});},
    async completeEvidence(input){assertNeon(input.context);await authorize(options.authorizer,input.context,permission(input.journeyKind,"respond"),{tenantId:input.context.tenantId,externalApplicant:true,restrictedSessionRequired:true,ownedRequestRequired:true,operation:"evidence_complete",journeyKind:input.journeyKind});const owned=await options.transactions.run("neon",actor(input.context),transaction=>options.repository.getOwnedRequest(input.context.tenantId,input.requestId,input.context.principalId,input.journeyKind,transaction));if(!owned||!["draft","validation_failed","returned"].includes(owned.status))throw notFound();const attachment=await options.evidence.finalize({planeKey:"neon",tenantId:input.context.tenantId,principalId:input.context.principalId,attachmentId:input.attachmentId},input.contentType);if(attachment.status!=="active"||!attachment.sha256)throw conflict("BUSINESS_PARTNER_INVITATION_EVIDENCE_UNAVAILABLE","Evidence did not pass integrity and malware validation");const linked=await options.transactions.run("neon",actor(input.context),transaction=>options.repository.attachOwnedEvidence({tenantId:input.context.tenantId,requestId:input.requestId,applicantPrincipalId:input.context.principalId,journeyKind:input.journeyKind,evidenceKind:input.evidenceKind,attachmentId:input.attachmentId,contentHash:attachment.sha256!,classificationCode:input.classificationCode},transaction));if(!linked)throw conflict("BUSINESS_PARTNER_INVITATION_EVIDENCE_CONFLICT","Evidence can only be linked to the owning editable application");return{evidenceId:linked,attachmentId:attachment.id,status:attachment.status};},
    async submitOwned(input) {
      assertNeon(input.context); validateVersion(input.expectedVersion);
      if (!validKey(input.idempotencyKey)) throw invalid("A valid idempotency key is required");
      await authorize(options.authorizer,input.context,permission(input.journeyKind,"respond"),{tenantId:input.context.tenantId,externalApplicant:true,restrictedSessionRequired:true,ownedRequestRequired:true,operation:"submit",journeyKind:input.journeyKind});
      const owned=await options.transactions.run("neon",actor(input.context),transaction=>options.repository.getOwnedRequest(input.context.tenantId,input.requestId,input.context.principalId,input.journeyKind,transaction));
      if(!owned)throw notFound();
      if(owned.rowVersion!==input.expectedVersion)throw conflict("BUSINESS_PARTNER_INVITATION_SUBMISSION_CONFLICT","Application version changed before submission");
      const validated=await options.requests.validate({context:input.context,requestId:input.requestId,expectedVersion:owned.rowVersion});
      if(!validated.validation.valid)return externalProjection(input.journeyKind,validated.request);
      const submitted=await options.requests.submit({context:input.context,requestId:input.requestId,expectedVersion:validated.request.rowVersion,idempotencyKey:input.idempotencyKey});
      return externalProjection(input.journeyKind,submitted.request);
    },
    async recover(input) {
      assertNeon(input.context);
      if (!validKey(input.idempotencyKey) || !input.reason.trim() || input.reason.length > 4000) throw invalid("Recovery reason and idempotency key are required");
      await authorize(options.authorizer, input.context, businessPartnerInvitationPermissions.recover, { tenantId: input.context.tenantId, supportRecovery: true });
      return options.transactions.run("neon", actor(input.context), async transaction => {
        const invitation = await options.repository.recover({ tenantId: input.context.tenantId, invitationId: input.invitationId, newApplicantPrincipalId: input.newApplicantPrincipalId, recoveredBy: input.context.principalId, reason: input.reason, idempotencyKey: input.idempotencyKey }, transaction);
        if (!invitation) throw conflict("BUSINESS_PARTNER_INVITATION_RECOVERY_NOT_ALLOWED", "Recovery is unavailable or already requested with different evidence"); return invitation;
      });
    },
  };
}

function externalProjection(journey:BusinessPartnerInvitationJourney,request:BusinessPartnerRequest){const allowed=new Set<string>(templates[journey].approvedFields);const editablePayload=Object.fromEntries(Object.entries(request.proposedPayload).filter(([key])=>allowed.has(key)));return{requestId:request.id,requestNo:request.requestNo,status:request.status,rowVersion:request.rowVersion,validationSummary:request.validationSummary,editablePayload,...(request.updatedAt?{updatedAt:request.updatedAt}:{})};}

function permission(journey: BusinessPartnerInvitationJourney, action: "create" | "read" | "cancel" | "respond") { const prefix = journey === "candidate" ? "candidate" : journey; return businessPartnerInvitationPermissions[`${prefix}${action[0]!.toUpperCase()}${action.slice(1)}` as keyof typeof businessPartnerInvitationPermissions]; }
function assertApprovedFields(journey: BusinessPartnerInvitationJourney, payload: Readonly<Record<string, unknown>>) { const allowed = new Set<string>(templates[journey].approvedFields); const denied = Object.keys(payload).filter(key => !allowed.has(key)); if (denied.length) throw new MasterDataError(403, "BUSINESS_PARTNER_INVITATION_FIELD_NOT_ALLOWED", `Fields are not approved for ${journey}: ${denied.sort().join(", ")}`); }
function validateCreate(command: CreateBusinessPartnerInvitationCommand, at: Date) { if (!validKey(command.idempotencyKey) || !command.intendedPartyName.trim() || command.intendedPartyName !== command.intendedPartyName.trim() || command.intendedPartyName.length > 512) throw invalid("Invitation identity is invalid"); normalizeEmail(command.inviteeEmail); validateExpiry(command.expiresAt, at); if ((command.journeyKind === "candidate") !== (command.scope.kind === "workforce")) throw invalid("Journey and typed scope do not match"); if (command.registrationMode && command.registrationMode !== "self_service") throw invalid("Email invitation templates support self_service registration only"); }
function validateExpiry(value: string, at: Date) { const parsed = parseInstant(value); if (Number.isNaN(parsed) || parsed < at.valueOf() + 5 * 60_000 || parsed > at.valueOf() + 30 * 86400_000) throw invalid("expiresAt must be between 5 minutes and 30 days in the future"); }
function validateAccept(token: string, email: string, key: string, payload: Readonly<Record<string, unknown>>) { if (token.trim() !== token || token.length < 32 || token.length > 512 || !validKey(key)) throw invalid("Invitation acceptance evidence is invalid"); normalizeEmail(email); if (!payload || Array.isArray(payload) || typeof payload !== "object" || Buffer.byteLength(JSON.stringify(payload)) > 1_048_576) throw invalid("proposedPayload must be an object no larger than 1 MiB"); }
function assertTokenEntropy(token: string) { if (token.length < 32) throw new MasterDataError(503, "BUSINESS_PARTNER_INVITATION_TOKEN_GENERATOR_INVALID", "Invitation token generator returned insufficient entropy"); }
function fingerprint(value: BusinessPartnerInvitation) { return digest(stable({ journeyKind: value.journeyKind, registrationMode: value.registrationMode, scope: value.scope, intendedPartyName: value.intendedPartyName, expiresAt: value.expiresAt })); }
function commandFingerprint(value: CreateBusinessPartnerInvitationCommand) { return digest(stable({ journeyKind: value.journeyKind, registrationMode: value.registrationMode ?? "self_service", scope: value.scope, intendedPartyName: value.intendedPartyName, expiresAt: new Date(value.expiresAt).toISOString() })); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`; return JSON.stringify(value); }
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function normalizeEmail(value: string) { const result = value.trim().toLowerCase(); if (result !== value.trim().toLowerCase() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) || result.length > 320) throw invalid("A valid invitee email is required"); return result; }
function validKey(value: string) { return value.trim() === value && value.length >= 8 && value.length <= 200; }
function validateVersion(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw invalid("expectedVersion must be a positive integer"); }
function scopeForAuthorization(tenantId: string, value: BusinessPartnerInvitationScope) { return value.kind === "commercial" ? { tenantId, operatingOrganizationId: value.operatingOrganizationId, companyCodeId: value.companyCodeId } : { tenantId, legalEntityId: value.legalEntityId, companyCodeId: value.companyCodeId, orgUnitId: value.orgUnitId, workforceOnly: true }; }
function actor(context: VerifiedRequestContext) { return { tenantId: context.tenantId, principalId: context.principalId, requestId: context.requestId, correlationId: context.correlationId }; }
function assertNeon(context: VerifiedRequestContext) { if (context.planeKey !== "neon") throw new MasterDataError(403, "BUSINESS_PARTNER_INVITATION_NEON_REQUIRED", "Invitation authority belongs to NEON"); }
async function authorize(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string, resource: Readonly<Record<string, unknown>>) { const decision = await authorizer.authorize({ context, permissionCode, resource }); if (!decision.allowed) throw new MasterDataError(403, "BUSINESS_PARTNER_INVITATION_FORBIDDEN", "Invitation operation is not authorized"); }
async function effect<Transaction>(options: BusinessPartnerInvitationServiceOptions<Transaction>, transaction: Transaction, context: VerifiedRequestContext, invitation: BusinessPartnerInvitation, kind: string) { const eventType = `business_partner_invitation.${invitation.journeyKind}.${kind}`; const metadata = { journeyKind: invitation.journeyKind, requestedRole: invitation.requestedRole, rowVersion: invitation.rowVersion }; await options.outbox.append({ tenantId: invitation.tenantId, topic: "business-partner-invitation", eventType, entityType: "business_partner_invitation", entityId: invitation.id, actorId: context.principalId, correlationId: context.correlationId, payload: { invitationId: invitation.id, invitationNo: invitation.invitationNo, status: invitation.status, ...metadata } }, transaction); await options.audit.record({ eventCode: eventType, action: kind === "created" ? "create" : kind === "cancelled" ? "cancel" : "update", outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: invitation.tenantId, entityType: "business_partner_invitation", entityId: invitation.id, requestId: context.requestId, metadata }, transaction); }
function invalid(message: string) { return new MasterDataError(400, "BUSINESS_PARTNER_INVITATION_INVALID", message); }
function conflict(code: string, message: string) { return new MasterDataError(409, code, message); }
function notFound() { return new MasterDataError(404, "BUSINESS_PARTNER_INVITATION_NOT_FOUND", "Invitation was not found"); }
