import type {
  BusinessPartnerInvitation,
  BusinessPartnerInvitationRepository,
  BusinessPartnerInvitationScope,
} from "@athyper/server-contract-master-data";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";
import { KyselyBusinessPartnerCaseRepository } from "./kysely-business-partner-case-repository.js";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;

export class KyselyBusinessPartnerInvitationRepository implements BusinessPartnerInvitationRepository<Tx> {
  private readonly cases = new KyselyBusinessPartnerCaseRepository();
  constructor() {}

  async findByIdempotencyKey(tenantId: string, key: string, transaction: Tx) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:business_partner_invitation:${key}`},0))`.execute(
      transaction,
    );
    const row = (
      await sql<Row>`SELECT * FROM document.business_partner_invitation WHERE tenant_id=${tenantId}::uuid AND idempotency_key=${key} LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    return row
      ? {
          invitation: map(row),
          inviteeEmailHash: text(row, "invitee_email_hash"),
        }
      : null;
  }

  async create(
    input: Parameters<BusinessPartnerInvitationRepository<Tx>["create"]>[0],
    transaction: Tx,
  ) {
    const commercial =
        input.scope.kind === "commercial" ? input.scope : undefined,
      workforce = input.scope.kind === "workforce" ? input.scope : undefined;
    const row = (
      await sql<Row>`INSERT INTO document.business_partner_invitation(tenant_id,invitation_no,journey_kind,registration_mode,requested_role,scope_kind,requested_operating_organization_id,company_code_id,legal_entity_id,org_unit_id,position_id,intended_party_name,invitee_email_hash,token_hash,expires_at,idempotency_key,created_by)
      VALUES(${input.tenantId}::uuid,${input.invitationNo},${input.journeyKind},${input.registrationMode},${role(input.journeyKind)}::document.business_partner_requested_role_d,${input.scope.kind},${commercial?.operatingOrganizationId ?? null}::uuid,${input.scope.companyCodeId ?? null}::uuid,${workforce?.legalEntityId ?? null}::uuid,${workforce?.orgUnitId ?? null}::uuid,${workforce?.positionId ?? null}::uuid,${input.intendedPartyName},${input.inviteeEmailHash},${input.tokenHash},${input.expiresAt}::timestamptz,${input.idempotencyKey},${input.createdBy}::uuid) RETURNING *`.execute(
        transaction,
      )
    ).rows[0];
    if (!row) throw new Error("BUSINESS_PARTNER_INVITATION_CREATE_FAILED");
    return map(row);
  }

  async get(tenantId: string, invitationId: string, transaction: Tx) {
    const row = (
      await sql<Row>`SELECT * FROM document.business_partner_invitation WHERE tenant_id=${tenantId}::uuid AND id=${invitationId}::uuid LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    return row ? map(row) : null;
  }

  async resend(
    input: Parameters<BusinessPartnerInvitationRepository<Tx>["resend"]>[0],
    transaction: Tx,
  ) {
    const row = (
      await sql<Row>`UPDATE document.business_partner_invitation SET token_hash=${input.tokenHash},expires_at=${input.expiresAt}::timestamptz,resend_count=resend_count+1,last_sent_at=statement_timestamp(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.invitationId}::uuid AND status='pending' AND row_version=${input.expectedVersion} RETURNING *`.execute(
        transaction,
      )
    ).rows[0];
    return row ? map(row) : null;
  }

  async cancel(
    input: Parameters<BusinessPartnerInvitationRepository<Tx>["cancel"]>[0],
    transaction: Tx,
  ) {
    const row = (
      await sql<Row>`UPDATE document.business_partner_invitation SET status='cancelled',cancelled_at=statement_timestamp(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.invitationId}::uuid AND status='pending' AND row_version=${input.expectedVersion} RETURNING *`.execute(
        transaction,
      )
    ).rows[0];
    return row ? map(row) : null;
  }

  async accept(
    input: Parameters<BusinessPartnerInvitationRepository<Tx>["accept"]>[0],
    transaction: Tx,
  ) {
    const raw = (
      await sql<Row>`SELECT invitation.*,invitation.expires_at<=statement_timestamp() is_expired FROM document.business_partner_invitation invitation WHERE tenant_id=${input.tenantId}::uuid AND token_hash=${input.tokenHash} FOR UPDATE`.execute(
        transaction,
      )
    ).rows[0];
    if (!raw) return null;
    const invitation = map(raw);
    if (
      text(raw, "invitee_email_hash") !== input.inviteeEmailHash ||
      invitation.journeyKind !== input.journeyKind
    )
      return null;
    if (invitation.status === "accepted") {
      if (
        invitation.applicantPrincipalId !== input.applicantPrincipalId ||
        !invitation.entityCaseId
      )
        throw used();
      const request = await this.cases.get(
        input.tenantId,
        invitation.entityCaseId,
        transaction,
      );
      if (!request || request.idempotencyKey !== input.requestIdempotencyKey)
        throw used();
      return { invitation, request, case: request, replayed: true };
    }
    if (invitation.status !== "pending")
      throw new MasterDataError(
        409,
        "BUSINESS_PARTNER_INVITATION_NOT_ACTIVE",
        "Invitation is no longer active",
      );
    if (raw["is_expired"] === true)
      throw new MasterDataError(
        410,
        "BUSINESS_PARTNER_INVITATION_EXPIRED",
        "Invitation has expired",
      );
    const existing = await this.cases.findByIdempotencyKey(
      input.tenantId,
      input.requestIdempotencyKey,
      transaction,
    );
    if (existing)
      throw new MasterDataError(
        409,
        "BUSINESS_PARTNER_REQUEST_IDEMPOTENCY_CONFLICT",
        "Request idempotency key is already in use",
      );
    const command = requestCommand(invitation, input);
    const request = await this.cases.create(
      {
        tenantId: input.tenantId,
        requestNo: input.requestNo,
        createdBy: input.applicantPrincipalId,
        schema: input.schema,
        command,
      },
      transaction,
    );
    const accepted = (
      await sql<Row>`UPDATE document.business_partner_invitation SET status='accepted',applicant_principal_id=${input.applicantPrincipalId}::uuid,entity_case_id=${request.id}::uuid,accepted_at=statement_timestamp(),updated_by=${input.applicantPrincipalId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${invitation.id}::uuid AND status='pending' RETURNING *`.execute(
        transaction,
      )
    ).rows[0];
    if (!accepted)
      throw new MasterDataError(
        409,
        "BUSINESS_PARTNER_INVITATION_RACE_LOST",
        "Another terminal transition won",
      );
    return { invitation: map(accepted), request, case: request, replayed: false };
  }

  async expireDue(
    input: Parameters<BusinessPartnerInvitationRepository<Tx>["expireDue"]>[0],
    transaction: Tx,
  ) {
    const rows = (
      await sql<Row>`WITH due AS(SELECT id FROM document.business_partner_invitation WHERE tenant_id=${input.tenantId}::uuid AND status='pending' AND expires_at<=${input.now}::timestamptz ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT ${input.limit}) UPDATE document.business_partner_invitation invitation SET status='expired',updated_by=${input.actorId}::uuid FROM due WHERE invitation.tenant_id=${input.tenantId}::uuid AND invitation.id=due.id AND invitation.status='pending' RETURNING invitation.*`.execute(
        transaction,
      )
    ).rows;
    return rows.map(map);
  }

  async recover(
    input: Parameters<BusinessPartnerInvitationRepository<Tx>["recover"]>[0],
    transaction: Tx,
  ) {
    const row = (
      await sql<Row>`SELECT invitation.* FROM document.business_partner_invitation invitation JOIN document.entity_case entity_case ON entity_case.tenant_id=invitation.tenant_id AND entity_case.id=invitation.entity_case_id WHERE invitation.tenant_id=${input.tenantId}::uuid AND invitation.id=${input.invitationId}::uuid AND invitation.status='accepted' AND entity_case.status IN('draft','conflicted') FOR UPDATE OF invitation`.execute(
        transaction,
      )
    ).rows[0];
    if (!row) return null;
    await sql`INSERT INTO document.business_partner_invitation_recovery(tenant_id,invitation_id,entity_case_id,prior_applicant_principal_id,requested_applicant_principal_id,reason,idempotency_key,requested_by) VALUES(${input.tenantId}::uuid,${input.invitationId}::uuid,${text(row, "entity_case_id")}::uuid,${text(row, "applicant_principal_id")}::uuid,${input.newApplicantPrincipalId}::uuid,${input.reason},${input.idempotencyKey},${input.recoveredBy}::uuid) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING`.execute(
      transaction,
    );
    return map(row);
  }

  async getOwnedRequest(
    tenantId: string,
    requestId: string,
    principalId: string,
    journeyKind: Parameters<
      BusinessPartnerInvitationRepository<Tx>["getOwnedRequest"]
    >[3],
    transaction: Tx,
  ) {
    const row = (
      await sql<{
        owned: boolean;
      }>`SELECT EXISTS(SELECT 1 FROM document.entity_case entity_case JOIN document.business_partner_invitation invitation ON invitation.tenant_id=entity_case.tenant_id AND invitation.entity_case_id=entity_case.id WHERE entity_case.tenant_id=${tenantId}::uuid AND entity_case.id=${requestId}::uuid AND invitation.applicant_principal_id=${principalId}::uuid AND invitation.journey_kind=${journeyKind} AND invitation.applicant_access_revoked_at IS NULL) owned`.execute(
        transaction,
      )
    ).rows[0];
    return row?.owned
      ? this.cases.get(tenantId, requestId, transaction)
      : null;
  }
  async correctOwnedRequest(
    input: Parameters<
      BusinessPartnerInvitationRepository<Tx>["correctOwnedRequest"]
    >[0],
    transaction: Tx,
  ) {
    const owned = await this.getOwnedRequest(input.tenantId,input.requestId,input.applicantPrincipalId,input.journeyKind,transaction);
    if (!owned || owned.status !== "returned") return null;
    return this.cases.patch({tenantId:input.tenantId,requestId:input.requestId,expectedVersion:input.expectedVersion,proposedPayload:input.proposedPayload,updatedBy:input.applicantPrincipalId},transaction);
  }
  async attachOwnedEvidence(
    input: Parameters<
      BusinessPartnerInvitationRepository<Tx>["attachOwnedEvidence"]
    >[0],
    transaction: Tx,
  ) {
    const owned = await this.getOwnedRequest(input.tenantId,input.requestId,input.applicantPrincipalId,input.journeyKind,transaction);
    if (!owned || !["draft","validation_failed","returned"].includes(owned.status)) return null;
    return (await sql<{evidence_id:string}>`SELECT document.command_entity_case_attachment(${input.tenantId}::uuid,${input.requestId}::uuid,${input.evidenceKind},${input.attachmentId}::uuid,${input.contentHash},${input.classificationCode},${input.applicantPrincipalId}::uuid) evidence_id`.execute(transaction)).rows[0]?.evidence_id ?? null;
  }
}

function requestCommand(
  invitation: BusinessPartnerInvitation,
  input: Parameters<BusinessPartnerInvitationRepository<Tx>["accept"]>[0],
) {
  if (
    invitation.journeyKind === "candidate" ||
    invitation.requestedRole === "workforce" ||
    invitation.scope.kind !== "commercial"
  )
    throw new MasterDataError(
      410,
      "WORKFORCE_INVITATION_MOVED",
      "Candidate invitations must use the People/Workforce service",
    );
  const base = {
    idempotencyKey: input.requestIdempotencyKey,
    kind: "new_partner" as const,
    source: { kind: "portal" as const },
    registrationMode: "self_service" as const,
    invitationId: invitation.id,
    applicantPrincipalId: input.applicantPrincipalId,
    requestedRole: invitation.requestedRole,
    proposedPayload: input.proposedPayload,
  };
  return {
    ...base,
    operatingOrganizationId: invitation.scope.operatingOrganizationId,
    ...(invitation.scope.companyCodeId
      ? { companyCodeId: invitation.scope.companyCodeId }
      : {}),
  };
}
function map(row: Row): BusinessPartnerInvitation {
  const scope = mapScope(row);
  return {
    id: text(row, "id"),
    tenantId: text(row, "tenant_id"),
    invitationNo: text(row, "invitation_no"),
    journeyKind: text(
      row,
      "journey_kind",
    ) as BusinessPartnerInvitation["journeyKind"],
    registrationMode: text(
      row,
      "registration_mode",
    ) as BusinessPartnerInvitation["registrationMode"],
    requestedRole: text(
      row,
      "requested_role",
    ) as BusinessPartnerInvitation["requestedRole"],
    scope,
    intendedPartyName: text(row, "intended_party_name"),
    status: text(row, "status") as BusinessPartnerInvitation["status"],
    expiresAt: date(row["expires_at"]),
    ...(optional(row, "applicant_principal_id")
      ? { applicantPrincipalId: optional(row, "applicant_principal_id") }
      : {}),
    ...(optional(row, "entity_case_id")
      ? { entityCaseId: optional(row, "entity_case_id") }
      : {}),
    ...(row["accepted_at"] ? { acceptedAt: date(row["accepted_at"]) } : {}),
    ...(row["cancelled_at"] ? { cancelledAt: date(row["cancelled_at"]) } : {}),
    ...(row["superseded_at"]
      ? { supersededAt: date(row["superseded_at"]) }
      : {}),
    idempotencyKey: text(row, "idempotency_key"),
    rowVersion: Number(row["row_version"]),
    createdAt: date(row["created_at"]),
    createdBy: text(row, "created_by"),
    ...(row["updated_at"] ? { updatedAt: date(row["updated_at"]) } : {}),
    ...(optional(row, "updated_by")
      ? { updatedBy: optional(row, "updated_by") }
      : {}),
  };
}
function mapScope(row: Row): BusinessPartnerInvitationScope {
  return text(row, "scope_kind") === "commercial"
    ? {
        kind: "commercial",
        operatingOrganizationId: text(
          row,
          "requested_operating_organization_id",
        ),
        ...(optional(row, "company_code_id")
          ? { companyCodeId: optional(row, "company_code_id") }
          : {}),
      }
    : {
        kind: "workforce",
        legalEntityId: text(row, "legal_entity_id"),
        companyCodeId: text(row, "company_code_id"),
        orgUnitId: text(row, "org_unit_id"),
        ...(optional(row, "position_id")
          ? { positionId: optional(row, "position_id") }
          : {}),
      };
}
function role(journey: string) {
  return journey === "candidate" ? "workforce" : journey;
}
function used() {
  return new MasterDataError(
    409,
    "BUSINESS_PARTNER_INVITATION_ALREADY_USED",
    "Invitation was already used with different applicant or request evidence",
  );
}
function text(row: Row, key: string) {
  const value = row[key];
  if (value == null)
    throw new Error(`BUSINESS_PARTNER_INVITATION_ROW_INVALID:${key}`);
  return String(value);
}
function optional(row: Row, key: string) {
  return row[key] == null ? undefined : String(row[key]);
}
function date(value: unknown) {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.valueOf()))
    throw new Error("BUSINESS_PARTNER_INVITATION_ROW_INVALID:date");
  return parsed.toISOString();
}
