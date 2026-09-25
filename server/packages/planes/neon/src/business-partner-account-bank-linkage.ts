import { resolveMeshExternalReferenceCode } from "./mesh-external-reference-code.js";
import { normalizeBankIdentifier } from "@athyper/server-contract-master-data";
import { createHash, randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { SecretStore } from "@athyper/server-contract-secrets";

type Tx = Transaction<Record<string, never>>;
type Row = Readonly<Record<string, unknown>>;
export const meshAccountBankPermissions = Object.freeze({
  linkRequest: "neon.mesh_account_link.request",
  linkDecide: "neon.mesh_account_link.decide",
  linkRead: "neon.mesh_account_link.read",
  receive: "neon.mesh_bank_projection.receive",
  register: "neon.business_partner_bank.register",
  resolveDirectory: "neon.business_partner_bank.resolve_directory",
} as const);
export class NeonAccountBankLinkageError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NeonAccountBankLinkageError";
  }
}
export interface MeshBankDisclosureEnvelope {
  eventId: string;
  eventType:
    | "mesh.bank_account.disclosed"
    | "mesh.bank_account.changed"
    | "mesh.bank_account.revoked";
  schemaVersion: number;
  sourcePlane: "mesh";
  sourceTenantId: string;
  recipientTenantId: string;
  sourceNetworkAccountId: string;
  recipientNetworkAccountId: string;
  networkRelationshipId: string;
  disclosureId: string;
  disclosureVersion: number;
  lifecycleVersion: number;
  payloadHash: string;
  occurredAt: string;
  payload?: Readonly<Record<string, unknown>>;
  withdrawal?: { reason?: string };
}
export interface AccountBankTransactions {
  run<T>(
    plane: "neon",
    actor: {
      tenantId: string;
      principalId: string;
      requestId?: string;
      correlationId?: string;
    },
    work: (tx: Tx) => Promise<T>,
  ): Promise<T>;
}
export interface LocalAudit {
  record(input: Readonly<Record<string, unknown>>, tx: Tx): Promise<void>;
}

export class KyselyBusinessPartnerAccountBankRepository {
  async provisionalForRegistration(tenantId: string, linkId: string, tx: Tx) {
    return one(await sql<Row>`SELECT p.*, a.created_by::text maker_id, a.id::text bank_account_id,
      l.owner_id::text business_partner_id,
      EXISTS(SELECT 1 FROM master.bank_account other WHERE other.tenant_id=p.tenant_id
        AND other.provisional_bank_reference_id=p.id AND other.id<>a.id) shared_reference,
      EXISTS(SELECT 1 FROM master.payment_instrument_link other WHERE other.tenant_id=a.tenant_id
        AND other.payment_instrument_id=a.id AND (other.owner_type<>'business_partner' OR other.owner_id<>l.owner_id)) shared_owner
      FROM master.payment_instrument_link l
      JOIN master.bank_account a ON a.tenant_id=l.tenant_id AND a.id=l.payment_instrument_id
      JOIN master.bank_provisional_reference p ON p.tenant_id=a.tenant_id AND p.id=a.provisional_bank_reference_id
      WHERE l.tenant_id=${tenantId}::uuid AND l.id=${linkId}::uuid
        AND l.owner_type='business_partner' AND l.relationship_role='beneficiary'
      FOR UPDATE OF p,a,l`.execute(tx));
  }

  async resolveProvisional(row: Row, institutionId: string, branchId: string | undefined, tx: Tx) {
    const institution = one(await sql<Row>`SELECT id FROM shared.bank_institution
      WHERE id=${institutionId}::uuid AND country_code=${row["submitted_country"]}
        AND status='active' AND effective_from<=CURRENT_DATE
        AND (effective_until IS NULL OR effective_until>CURRENT_DATE)`.execute(tx));
    if (!institution) throw invalid("An active institution in the submitted jurisdiction is required");
    if (branchId) {
      const branch = one(await sql<Row>`SELECT id FROM shared.bank_branch
        WHERE id=${branchId}::uuid AND institution_id=${institutionId}::uuid
          AND country_code=${row["submitted_country"]} AND status='active'
          AND effective_from<=CURRENT_DATE AND (effective_until IS NULL OR effective_until>CURRENT_DATE)
        `.execute(tx));
      if (!branch) throw invalid("An active compatible branch in the submitted jurisdiction is required");
    }
    // Resolution annotates the tenant-local reference, never the protected account or global directory.
    return required(one(await sql<Row>`UPDATE master.bank_provisional_reference
      SET status='resolved',resolved_institution_id=${institutionId}::uuid,resolved_branch_id=${branchId??null}::uuid
      WHERE tenant_id=${row["tenant_id"]}::uuid AND id=${row["id"]}::uuid AND status='unresolved'
      RETURNING id::text,status,resolved_institution_id::text,resolved_branch_id::text`.execute(tx)));
  }
  async intakeOrganization(tenantId:string,organizationId:string,tx:Tx){
    return one(await sql<Row>`SELECT id FROM master.operating_organization WHERE tenant_id=${tenantId}::uuid AND id=${organizationId}::uuid AND status='active'`.execute(tx));
  }

  async protectedRegistrationByKey(tenantId: string, key: string, tx: Tx) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:protected-registration:${key}`},0))`.execute(tx);
    return one(await sql<Row>`SELECT account.metadata->>'accountFingerprint' registration_account_fingerprint,account.account_id_type::text registration_account_id_type,link.company_code_id::text,link.owner_id::text business_partner_id,link.id::text bank_account_link_id,account.id::text bank_account_id,account.account_last4,account.account_holder_name,account.currency_code::text,provisional.submitted_name bank_name,provisional.submitted_country::text bank_country_code,account.bic_override,instrument.status,account.created_by::text
      FROM master.payment_instrument_link link JOIN master.bank_account account ON account.tenant_id=link.tenant_id AND account.id=link.payment_instrument_id
      JOIN master.payment_instrument instrument ON instrument.tenant_id=account.tenant_id AND instrument.id=account.id
      LEFT JOIN master.bank_provisional_reference provisional ON provisional.tenant_id=account.tenant_id AND provisional.id=account.provisional_bank_reference_id
      WHERE link.tenant_id=${tenantId}::uuid AND link.metadata->>'registrationIdempotencyKey'=${key}`.execute(tx));
  }
  async protectedRegistrationSource(tenantId:string,businessPartnerId:string,companyCodeId:string|undefined,tx:Tx){
    if (companyCodeId) throw invalid("Bank facts are partner-level; company usage is not supported");
    return one(await sql<Row>`SELECT owner.id::text owner_type_id
      FROM master.business_partner bp JOIN control.owner_type owner ON owner.code='business_partner'
        AND(owner.tenant_id IS NULL OR owner.tenant_id=bp.tenant_id)
      WHERE bp.tenant_id=${tenantId}::uuid AND bp.id=${businessPartnerId}::uuid AND bp.status='active'
      ORDER BY (owner.tenant_id IS NOT NULL) DESC LIMIT 1 FOR SHARE OF bp`.execute(tx));
  }
  async createProtectedRegistration(input:{tenantId:string;principalId:string;businessPartnerId:string;companyCodeId?:string;accountHolderName:string;accountIdType:string;accountFingerprint:string;accountLast4:string;currencyCode:string;bankName:string;bankCountryCode:string;bic?:string;clearingScheme?:string;branchCode?:string;protectedValueToken:string;idempotencyKey:string;source:Row},tx:Tx){
    const accountId=randomUUID(),linkId=randomUUID(),provisionalId=randomUUID();
    await sql`INSERT INTO master.payment_instrument(id,tenant_id,instrument_type_code,created_by)
      VALUES(${accountId}::uuid,${input.tenantId}::uuid,'bank_account',${input.principalId}::uuid)`.execute(tx);
    await sql`INSERT INTO master.bank_provisional_reference(id,tenant_id,submitted_name,submitted_country,submitted_bic)
      VALUES(${provisionalId}::uuid,${input.tenantId}::uuid,${input.bankName},${input.bankCountryCode}::char(2),${input.bic??null})`.execute(tx);
    await sql`INSERT INTO master.bank_account(id,tenant_id,provisional_bank_reference_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bic_override,metadata,created_by)
      VALUES(${accountId}::uuid,${input.tenantId}::uuid,${provisionalId}::uuid,${input.accountHolderName},${input.accountIdType}::master.bank_account_id_type_d,${input.accountFingerprint.toUpperCase()},${input.accountLast4},${input.currencyCode}::char(3),${input.bic??null},${JSON.stringify({protectedValueToken:input.protectedValueToken,accountFingerprint:input.accountFingerprint,classification:"restricted",source:"protected_registration",clearingScheme:input.clearingScheme,branchCode:input.branchCode?.replace(/[ -]/g, "")})}::jsonb,${input.principalId}::uuid)`.execute(tx);
    await sql`INSERT INTO master.payment_instrument_link(id,tenant_id,owner_type_id,owner_type,owner_id,relationship_role,payment_instrument_id,company_code_id,purpose,is_primary,metadata,created_by)
      VALUES(${linkId}::uuid,${input.tenantId}::uuid,${String(input.source["owner_type_id"])}::uuid,'business_partner',${input.businessPartnerId}::uuid,'beneficiary',${accountId}::uuid,NULL,'default',false,${JSON.stringify({registrationIdempotencyKey:input.idempotencyKey,registrationMode:"protected",lineage:{authority:"master.bank_account",source:"partner_registration"}})}::jsonb,${input.principalId}::uuid)`.execute(tx);
    const registration=required(await this.protectedRegistrationByKey(input.tenantId,input.idempotencyKey,tx));
    if(registration["account_last4"]!==input.accountLast4)throw conflict("NEON_BANK_REGISTRATION_MASK_MISMATCH","Protected bank display suffix was not preserved; reconcile the deployed normalization contract");
    return registration;
  }
  async protectedRegistration(tenantId:string,linkId:string,tx:Tx,lock=false){
    return one(await sql<Row>`SELECT link.tenant_id::text,link.id::text bank_account_link_id,account.id::text bank_account_id,link.company_code_id::text,link.owner_id::text business_partner_id,account.account_last4,account.account_holder_name,account.currency_code::text,provisional.submitted_name bank_name,provisional.submitted_country::text bank_country_code,account.bic_override,instrument.status,account.created_by::text
      FROM master.payment_instrument_link link JOIN master.bank_account account ON account.tenant_id=link.tenant_id AND account.id=link.payment_instrument_id
      JOIN master.payment_instrument instrument ON instrument.tenant_id=account.tenant_id AND instrument.id=account.id
      LEFT JOIN master.bank_provisional_reference provisional ON provisional.tenant_id=account.tenant_id AND provisional.id=account.provisional_bank_reference_id
      WHERE link.tenant_id=${tenantId}::uuid AND link.id=${linkId}::uuid AND link.owner_type='business_partner' AND link.relationship_role='beneficiary' ${sql.raw(lock?"FOR UPDATE OF account":"")}`.execute(tx));
  }

  async linkByKey(tenantId: string, key: string, tx: Tx) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:account-link:${key}`},0))`.execute(tx);
    return one(
      await sql<Row>`SELECT * FROM control.mesh_business_partner_account_link WHERE tenant_id=${tenantId}::uuid AND idempotency_key=${key}`.execute(
        tx,
      ),
    );
  }
  async link(id: string, tenantId: string, tx: Tx, lock = false) {
    return one(
      await sql<Row>`SELECT * FROM control.mesh_business_partner_account_link WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid ${sql.raw(lock ? "FOR UPDATE" : "")}`.execute(
        tx,
      ),
    );
  }
  async linkSource(
    tenantId: string,
    projectionId: string,
    businessPartnerId: string,
    onboardingRequestId: string | undefined,
    tx: Tx,
  ) {
    return one(
      await sql<Row>`SELECT p.*,s.payload_json,bp.status::text partner_status,EXISTS(SELECT 1 FROM master.supplier WHERE tenant_id=p.tenant_id AND business_partner_id=${businessPartnerId}::uuid) has_supplier,EXISTS(SELECT 1 FROM master.customer WHERE tenant_id=p.tenant_id AND business_partner_id=${businessPartnerId}::uuid) has_customer,CASE WHEN ${onboardingRequestId ?? null}::uuid IS NULL THEN true ELSE EXISTS(SELECT 1 FROM document.entity_case governed_case WHERE governed_case.tenant_id=p.tenant_id AND governed_case.id=${onboardingRequestId ?? null}::uuid AND governed_case.status='materialized' AND governed_case.target_entity_id=${businessPartnerId}::uuid) END request_applied FROM control.mesh_business_partner_profile_projection p JOIN snapshot.mesh_business_partner_profile_received s ON s.tenant_id=p.tenant_id AND s.id=p.current_snapshot_id JOIN master.business_partner bp ON bp.tenant_id=p.tenant_id AND bp.id=${businessPartnerId}::uuid WHERE p.tenant_id=${tenantId}::uuid AND p.id=${projectionId}::uuid AND p.projection_status='active' FOR UPDATE OF p`.execute(
        tx,
      ),
    );
  }
  async createLink(
    input: {
      tenantId: string;
      projection: Row;
      businessPartnerId: string;
      role: string;
      onboardingRequestId?: string;
      key: string;
      principalId: string;
    },
    tx: Tx,
  ) {
    const id = randomUUID();
    await sql`INSERT INTO control.mesh_business_partner_account_link(id,tenant_id,profile_projection_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,business_partner_id,proposed_role,onboarding_request_id,idempotency_key,created_by) VALUES(${id}::uuid,${input.tenantId}::uuid,${input.projection["id"]}::uuid,${input.projection["source_tenant_id"]}::uuid,${input.projection["source_network_account_id"]}::uuid,${input.projection["recipient_network_account_id"]}::uuid,${input.projection["network_relationship_id"]}::uuid,${input.businessPartnerId}::uuid,${input.role}::master.partner_role_d,${input.onboardingRequestId ?? null}::uuid,${input.key},${input.principalId}::uuid)`.execute(
      tx,
    );
    return required(await this.link(id, input.tenantId, tx));
  }
  async decideLink(
    row: Row,
    decision: "approve" | "reject",
    principalId: string,
    reason: string | undefined,
    tx: Tx,
  ) {
    const fingerprint = hash({
      id: row["id"],
      decision,
      principalId,
      reason: reason ?? null,
      sourceNetworkAccountId: row["source_network_account_id"],
      businessPartnerId: row["business_partner_id"],
    });
    if (decision === "reject") {
      await sql`UPDATE control.mesh_business_partner_account_link SET status='rejected',decision_fingerprint=${fingerprint},reviewed_at=clock_timestamp(),reviewed_by=${principalId}::uuid,updated_at=clock_timestamp(),updated_by=${principalId}::uuid WHERE id=${row["id"]}::uuid`.execute(
        tx,
      );
    } else {
      const ownerType = one(
        await sql<Row>`SELECT id FROM control.owner_type WHERE tenant_id IS NULL AND code='business_partner' AND status='active'`.execute(
          tx,
        ),
      );
      if (!ownerType)
        throw conflict(
          "NEON_MESH_OWNER_TYPE_MISSING",
          "Business Partner owner type is not active",
        );
      const externalId = String(row["source_network_account_id"]),
        existing = one(
          await sql<Row>`SELECT * FROM master.external_reference WHERE tenant_id=${row["tenant_id"]}::uuid AND source_system_code='athyper_mesh' AND external_entity_code='network_account' AND external_id=${externalId} FOR UPDATE`.execute(
            tx,
          ),
        );
      if (
        existing &&
        String(existing["owner_id"]) !== String(row["business_partner_id"])
      )
        throw conflict(
          "NEON_MESH_ACCOUNT_ALREADY_LINKED",
          "MESH account is already mapped to another Business Partner",
        );
      const externalCode = await resolveMeshExternalReferenceCode(row, tx);
      let referenceId = existing ? String(existing["id"]) : randomUUID();
      if (!existing)
        await sql`INSERT INTO master.external_reference(id,tenant_id,owner_type_id,owner_id,source_system_code,external_entity_code,external_id,external_code,metadata,created_by) VALUES(${referenceId}::uuid,${row["tenant_id"]}::uuid,${ownerType["id"]}::uuid,${row["business_partner_id"]}::uuid,'athyper_mesh','network_account',${externalId},${externalCode ?? null},${JSON.stringify({ sourceTenantId: row["source_tenant_id"], recipientNetworkAccountId: row["recipient_network_account_id"], networkRelationshipId: row["network_relationship_id"], proposedRole: row["proposed_role"] })}::jsonb,${principalId}::uuid)`.execute(
          tx,
        );
      if (existing && externalCode && !String(existing["external_code"] ?? "").trim())
        await sql`UPDATE master.external_reference SET external_code=${externalCode},updated_at=clock_timestamp(),updated_by=${principalId}::uuid WHERE tenant_id=${row["tenant_id"]}::uuid AND id=${referenceId}::uuid AND NULLIF(btrim(external_code),'') IS NULL`.execute(tx);
      await sql`UPDATE control.mesh_business_partner_account_link SET status='active',external_reference_id=${referenceId}::uuid,decision_fingerprint=${fingerprint},reviewed_at=clock_timestamp(),reviewed_by=${principalId}::uuid,approved_at=clock_timestamp(),approved_by=${principalId}::uuid,updated_at=clock_timestamp(),updated_by=${principalId}::uuid WHERE id=${row["id"]}::uuid`.execute(
        tx,
      );
    }
    return required(
      await this.link(String(row["id"]), String(row["tenant_id"]), tx),
    );
  }
  async inbox(tenantId: string, eventId: string, tx: Tx) {
    return one(
      await sql<Row>`SELECT * FROM control.mesh_bank_account_disclosure_inbox WHERE tenant_id=${tenantId}::uuid AND event_id=${eventId}::uuid`.execute(
        tx,
      ),
    );
  }
  async activeLink(
    tenantId: string,
    envelope: MeshBankDisclosureEnvelope,
    tx: Tx,
  ) {
    return one(
      await sql<Row>`SELECT * FROM control.mesh_business_partner_account_link WHERE tenant_id=${tenantId}::uuid AND source_tenant_id=${envelope.sourceTenantId}::uuid AND source_network_account_id=${envelope.sourceNetworkAccountId}::uuid AND recipient_network_account_id=${envelope.recipientNetworkAccountId}::uuid AND network_relationship_id=${envelope.networkRelationshipId}::uuid AND status='active' FOR UPDATE`.execute(
        tx,
      ),
    );
  }
  async projection(
    tenantId: string,
    relationshipId: string,
    tx: Tx,
    lock = false,
  ) {
    return one(
      await sql<Row>`SELECT p.*,s.payload_json FROM control.mesh_bank_account_projection p JOIN snapshot.mesh_bank_account_disclosure_received s ON s.tenant_id=p.tenant_id AND s.id=p.current_snapshot_id WHERE p.tenant_id=${tenantId}::uuid AND p.network_relationship_id=${relationshipId}::uuid ${sql.raw(lock ? "FOR UPDATE OF p" : "")}`.execute(
        tx,
      ),
    );
  }
  async recordInbox(
    input: {
      tenantId: string;
      principalId: string;
      envelope: MeshBankDisclosureEnvelope;
      envelopeHash: string;
    },
    tx: Tx,
  ) {
    const e = input.envelope,
      inboxId = randomUUID();
    await sql`INSERT INTO control.mesh_bank_account_disclosure_inbox(id,tenant_id,event_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,disclosure_id,disclosure_version,lifecycle_version,event_type,payload_hash,envelope_json,envelope_hash,occurred_at,received_by) VALUES(${inboxId}::uuid,${input.tenantId}::uuid,${e.eventId}::uuid,${e.sourceTenantId}::uuid,${e.sourceNetworkAccountId}::uuid,${e.recipientNetworkAccountId}::uuid,${e.networkRelationshipId}::uuid,${e.disclosureId}::uuid,${e.disclosureVersion},${e.lifecycleVersion},${e.eventType},${e.payloadHash},${JSON.stringify(e)}::jsonb,${input.envelopeHash},${e.occurredAt}::timestamptz,${input.principalId}::uuid)`.execute(
      tx,
    );
    return inboxId;
  }
  async receive(
    input: {
      tenantId: string;
      principalId: string;
      envelope: MeshBankDisclosureEnvelope;
      envelopeHash: string;
      link: Row;
    },
    tx: Tx,
  ) {
    const e = input.envelope,
      inboxId = await this.recordInbox(input, tx);
    const current = await this.projection(
      input.tenantId,
      e.networkRelationshipId,
      tx,
      true,
    );
    if (e.eventType === "mesh.bank_account.revoked") {
      if (current)
        await sql`UPDATE control.mesh_bank_account_projection SET current_lifecycle_version=${e.lifecycleVersion},last_inbox_event_id=${inboxId}::uuid,projection_status='revoked',updated_at=clock_timestamp(),updated_by=${input.principalId}::uuid WHERE id=${current["id"]}::uuid`.execute(
          tx,
        );
      return {
        disposition: current ? "applied" : "quarantined",
        reasonCode: current ? undefined : "MESH_BANK_PROJECTION_MISSING",
      };
    }
    const snapshotId = randomUUID(),
      account = object(e.payload?.["bankAccount"]),
      fingerprint = String(account["accountFingerprint"] ?? "");
    await sql`INSERT INTO snapshot.mesh_bank_account_disclosure_received(id,tenant_id,inbox_event_id,source_tenant_id,network_relationship_id,disclosure_id,disclosure_version,lifecycle_version,payload_json,payload_hash,received_by) VALUES(${snapshotId}::uuid,${input.tenantId}::uuid,${inboxId}::uuid,${e.sourceTenantId}::uuid,${e.networkRelationshipId}::uuid,${e.disclosureId}::uuid,${e.disclosureVersion},${e.lifecycleVersion},${JSON.stringify(e.payload)}::jsonb,${e.payloadHash},${input.principalId}::uuid)`.execute(
      tx,
    );
    if (current)
      await sql`UPDATE control.mesh_bank_account_projection SET current_disclosure_id=${e.disclosureId}::uuid,current_disclosure_version=${e.disclosureVersion},current_lifecycle_version=${e.lifecycleVersion},current_snapshot_id=${snapshotId}::uuid,last_inbox_event_id=${inboxId}::uuid,account_fingerprint=${fingerprint},projection_status='change_pending',updated_at=clock_timestamp(),updated_by=${input.principalId}::uuid WHERE id=${current["id"]}::uuid`.execute(
        tx,
      );
    else
      await sql`INSERT INTO control.mesh_bank_account_projection(tenant_id,account_link_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,current_disclosure_id,current_disclosure_version,current_lifecycle_version,current_snapshot_id,last_inbox_event_id,account_fingerprint,projection_status,updated_by) VALUES(${input.tenantId}::uuid,${input.link["id"]}::uuid,${e.sourceTenantId}::uuid,${e.sourceNetworkAccountId}::uuid,${e.recipientNetworkAccountId}::uuid,${e.networkRelationshipId}::uuid,${e.disclosureId}::uuid,${e.disclosureVersion},${e.lifecycleVersion},${snapshotId}::uuid,${inboxId}::uuid,${fingerprint},'available',${input.principalId}::uuid)`.execute(
        tx,
      );
    return { disposition: "applied" };
  }

}

export function createBusinessPartnerAccountBankLinkageService(options: {
  authorizer: Authorizer;
  repository: KyselyBusinessPartnerAccountBankRepository;
  transactions: AccountBankTransactions;
  audit?: LocalAudit;
  secrets?: SecretStore;
  onboardingCycles?:{advanceForBusinessPartner(input:{tenantId:string;principalId:string;businessPartnerId:string;eventCode:string;metadata?:Readonly<Record<string,unknown>>},transaction:Tx):Promise<void>};
}) {
  return Object.freeze({
    async resolveProvisionalBankReference(input: {context: VerifiedRequestContext; bankAccountLinkId: string; institutionId: string; branchId?: string; evidenceReference: string}) {
      context(input.context);
      if (!input.evidenceReference?.trim() || input.evidenceReference.length > 512) throw invalid("A bounded independent-review evidence reference is required");
      if (!options.audit) throw conflict("NEON_BANK_AUDIT_UNAVAILABLE", "Resolution requires transactional audit");
      const audit = options.audit;
      return options.transactions.run("neon", actor(input.context), async tx => {
        const row = await options.repository.provisionalForRegistration(input.context.tenantId, input.bankAccountLinkId, tx);
        if (!row) throw missing("NEON_BANK_PROVISIONAL_NOT_FOUND", "Provisional bank reference was not found");
        await permitRegistration(options.authorizer, input.context, meshAccountBankPermissions.resolveDirectory, String(row["business_partner_id"]));
        if (row["maker_id"] === input.context.principalId) throw forbidden("NEON_BANK_PROVISIONAL_SELF_RESOLUTION", "Registrant cannot resolve their own bank reference");
        if (row["shared_reference"] || row["shared_owner"]) throw conflict("NEON_BANK_PROVISIONAL_SHARED", "Shared references require a separately governed multi-owner review");
        if (row["status"] === "resolved" && row["resolved_institution_id"] === input.institutionId && (row["resolved_branch_id"] ?? undefined) === input.branchId)
          return {reference: {id: row["id"], status: "resolved", resolved_institution_id: input.institutionId, resolved_branch_id: input.branchId ?? null}, replayed: true};
        if (row["status"] !== "unresolved") throw conflict("NEON_BANK_PROVISIONAL_NOT_UNRESOLVED", "A terminal bank resolution cannot be replaced");
        const reference = await options.repository.resolveProvisional(row, input.institutionId, input.branchId, tx);
        await audit.record({eventCode: "business_partner.bank_provisional.resolved", action: "resolve", outcome: "success",
          tenantId: input.context.tenantId, entityType: "payment_instrument_link", entityId: input.bankAccountLinkId,
          actor: {kind: "user", principalId: input.context.principalId}, requestId: input.context.requestId,
          metadata: {businessPartnerId: row["business_partner_id"], provisionalReferenceId: row["id"], institutionId: input.institutionId,
            branchId: input.branchId ?? null, makerChecker: true, evidenceReferenceHash: hash(input.evidenceReference.trim()), accountUnchanged: true}}, tx);
        return {reference, replayed: false};
      });
    },

    async protectIntakeValue(input:{context:VerifiedRequestContext;operatingOrganizationId:string;kind:"tax"|"certificate"|"bank";value:string;bankCountryCode?:string;accountIdType?:string}){
      context(input.context);
      if(!["tax","certificate","bank"].includes(input.kind)||!input.value.trim()||input.value.length>(input.kind==="tax"?128:256)||/[\u0000-\u001f]/.test(input.value))throw invalid("Invalid protected registration value");
      const decision=await options.authorizer.authorize({context:input.context,permissionCode:"neon.relationship.entity_case.create",resource:{tenantId:input.context.tenantId,operatingOrganizationId:input.operatingOrganizationId,governedWorkflow:true}});
      if(!decision.allowed)throw forbidden("FORBIDDEN","Request creation authority is required");
      await options.transactions.run("neon",actor(input.context),async tx=>{
        const row=await options.repository.intakeOrganization(input.context.tenantId,input.operatingOrganizationId,tx);
        if(!row)throw invalid("An active authorized operating organization is required");
      });
      if(!options.secrets?.create || !options.audit)throw new NeonAccountBankLinkageError(503,"NEON_PROTECTED_STORE_UNAVAILABLE","Audited protected registration is unavailable");
      let value=input.value.trim();
      if(input.kind==="bank"){
        if(!/^[A-Z]{2}$/.test(input.bankCountryCode??"")||!["iban","local_account"].includes(input.accountIdType??"")||value.length>64)throw invalid("Bank country, identifier type and bounded account identifier are required");
        if(input.accountIdType==="iban")try{value=normalizeBankIdentifier({accountIdentifier:value,accountIdType:"iban",bankCountryCode:input.bankCountryCode!}).identifier}catch(error){throw invalid((error as Error).message)}
      }
      const token=`${input.kind}:${randomUUID()}`;
      let captured: Awaited<ReturnType<NonNullable<SecretStore["create"]>>> | undefined;
      try {
        await options.transactions.run("neon",actor(input.context),async tx=>{
          // Reject missing audit contracts before creating external material. Both succeed before returning a token.
          await options.audit!.record({eventCode:"business_partner.intake_value.protected",action:"register",outcome:"success",tenantId:input.context.tenantId,entityType:"business_partner",actor:{kind:"user",principalId:input.context.principalId},requestId:input.context.requestId,metadata:{kind:input.kind,operatingOrganizationId:input.operatingOrganizationId,protected:true}},tx);
          captured = await options.secrets!.create!(`protected-values/${input.context.tenantId}/${token}`,new TextEncoder().encode(value));
        });
      } catch (error) {
        if (captured) {
          try { await captured.discard(); }
          catch { throw new NeonAccountBankLinkageError(503,"NEON_PROTECTED_CAPTURE_CLEANUP_REQUIRED","Protected capture failed; operator reconciliation is required"); }
        }
        throw error;
      }
      return {protectedValueToken:token,valueHash:hash(value),maskedValue:value.length>4?"••••"+value.slice(-4):"••••"};
    },
    async registerProtectedBankAccount(input:{context:VerifiedRequestContext;businessPartnerId:string;companyCodeId?:string;accountHolderName:string;accountIdentifier:string;accountIdType:string;currencyCode:string;bankName:string;bankCountryCode:string;bic?:string;clearingScheme?:string;branchCode?:string;idempotencyKey:string}){
      context(input.context);key(input.idempotencyKey);
      await permitRegistration(options.authorizer,input.context,meshAccountBankPermissions.register,input.businessPartnerId,input.companyCodeId);
      if(input.companyCodeId)throw invalid("Bank facts are partner-level; company usage is not supported");
      let normalized: string;
      try { const value = normalizeBankIdentifier(input); normalized = value.identifier; input = {...input, ...(value.bic ? {bic:value.bic} : {})}; }
      catch (error) { throw invalid((error as Error).message); }
      if(!input.accountHolderName.trim()||!/^[A-Z]{3}$/.test(input.currencyCode)||!/^[A-Z]{2}$/.test(input.bankCountryCode)||!input.bankName.trim())throw invalid("Complete account holder, currency, bank name and country are required");
      const accountFingerprint=hash({tenantId:input.context.tenantId,normalized,country:input.bankCountryCode,type:input.accountIdType,scheme:input.accountIdType==="local"?input.clearingScheme:undefined,branch:input.accountIdType==="local"?input.branchCode?.replace(/[ -]/g, ""):undefined}),accountLast4=normalized.slice(-4);
      const replayRegistration=async(row:Row)=>{
        await permitRegistration(options.authorizer,input.context,meshAccountBankPermissions.register,String(row["business_partner_id"]),typeof row["company_code_id"]==="string"?row["company_code_id"]:undefined);
        const expected:Row={business_partner_id:input.businessPartnerId,company_code_id:input.companyCodeId??null,registration_account_fingerprint:accountFingerprint,registration_account_id_type:input.accountIdType,account_holder_name:input.accountHolderName.trim(),currency_code:input.currencyCode,bank_name:input.bankName.trim(),bank_country_code:input.bankCountryCode,bic_override:input.bic??null};
        if(Object.entries(expected).some(([field,value])=>(row[field]??null)!==value))throw conflict("NEON_BANK_REGISTRATION_KEY_COLLISION","Idempotency key was reused with different registration details");
        return{registration:publicRegistration(row),replayed:true};
      };
      const prior=await options.transactions.run("neon",actor(input.context),tx=>options.repository.protectedRegistrationByKey(input.context.tenantId,input.idempotencyKey,tx));
      if(prior)return replayRegistration(prior);
      if(!options.secrets?.create)throw new NeonAccountBankLinkageError(503,"NEON_BANK_PROTECTED_STORE_UNAVAILABLE","Protected bank registration requires recoverable protected storage");
      const token=`bank:${randomUUID()}`;
      return options.transactions.run("neon",actor(input.context),async tx=>{
        const replay=await options.repository.protectedRegistrationByKey(input.context.tenantId,input.idempotencyKey,tx);
        if(replay)return replayRegistration(replay);
        const source=await options.repository.protectedRegistrationSource(input.context.tenantId,input.businessPartnerId,input.companyCodeId,tx);
        if(!source)throw conflict("NEON_BANK_REGISTRATION_SCOPE_INVALID","An active partner is required");
        // Capture only after scope validation and the idempotency lock. A raced retry never creates a second secret.
        const captured=await options.secrets!.create!(`protected-values/${input.context.tenantId}/${token}`,new TextEncoder().encode(normalized));
        try {
        const registration=await options.repository.createProtectedRegistration({tenantId:input.context.tenantId,principalId:input.context.principalId,businessPartnerId:input.businessPartnerId,companyCodeId:input.companyCodeId,accountHolderName:input.accountHolderName.trim(),accountIdType:input.accountIdType,currencyCode:input.currencyCode,bankName:input.bankName.trim(),bankCountryCode:input.bankCountryCode,...(input.bic?{bic:input.bic}:{}),...(input.clearingScheme?{clearingScheme:input.clearingScheme}:{}),...(input.branchCode?{branchCode:input.branchCode}:{}),accountFingerprint,accountLast4,protectedValueToken:token,idempotencyKey:input.idempotencyKey,source},tx);
        await options.audit?.record({eventCode:"business_partner.bank_registration.protected",action:"register",outcome:"success",tenantId:input.context.tenantId,entityType:"payment_instrument_link",entityId:registration["bank_account_link_id"],actor:{kind:"user",principalId:input.context.principalId},requestId:input.context.requestId,metadata:{businessPartnerId:input.businessPartnerId,companyCodeId:input.companyCodeId,accountLast4,protected:true}},tx);
        await options.onboardingCycles?.advanceForBusinessPartner({tenantId:input.context.tenantId,principalId:input.context.principalId,businessPartnerId:input.businessPartnerId,eventCode:"business_partner.bank_registration.protected",metadata:{bankAccountLinkId:registration["bank_account_link_id"],accountLast4,companyCodeId:input.companyCodeId}},tx);
        return{registration:publicRegistration(registration),replayed:false};
        } catch(error) {
          // The callback failed, so its database writes cannot commit. Do not discard on an ambiguous COMMIT failure.
          try { await captured.discard(); }
          catch { throw new NeonAccountBankLinkageError(503,"NEON_PROTECTED_CAPTURE_CLEANUP_REQUIRED","Bank registration failed; protected capture requires operator reconciliation"); }
          throw error;
        }
      });
    },
    async getProtectedBankRegistration(input:{context:VerifiedRequestContext;bankAccountLinkId:string}){context(input.context);return options.transactions.run("neon",actor(input.context),async tx=>{const row=await options.repository.protectedRegistration(input.context.tenantId,input.bankAccountLinkId,tx);if(!row)throw missing("NEON_BANK_REGISTRATION_NOT_FOUND","Protected bank registration was not found");await permitRegistration(options.authorizer,input.context,meshAccountBankPermissions.register,String(row["business_partner_id"]),typeof row["company_code_id"]==="string"?row["company_code_id"]:undefined);return row;});},

    async requestAccountLink(input: {
      context: VerifiedRequestContext;
      profileProjectionId: string;
      businessPartnerId: string;
      onboardingRequestId?: string;
      idempotencyKey: string;
    }) {
      context(input.context);
      key(input.idempotencyKey);
      return options.transactions.run(
        "neon",
        actor(input.context),
        async (tx) => {
          const replay = await options.repository.linkByKey(
            input.context.tenantId,
            input.idempotencyKey,
            tx,
          );
          if (replay) {
            await permit(options.authorizer,input.context,meshAccountBankPermissions.linkRequest,String(replay["network_relationship_id"]));
            if(replay["profile_projection_id"]!==input.profileProjectionId||replay["business_partner_id"]!==input.businessPartnerId||(replay["onboarding_request_id"]??undefined)!==input.onboardingRequestId)
              throw conflict("NEON_ACCOUNT_LINK_KEY_COLLISION","Idempotency key was reused with different account-link coordinates");
            return { link: replay, replayed: true };
          }
          const source = await options.repository.linkSource(
            input.context.tenantId,
            input.profileProjectionId,
            input.businessPartnerId,
            input.onboardingRequestId,
            tx,
          );
          if (!source)
            throw conflict(
              "NEON_MESH_PROFILE_NOT_LINKABLE",
              "Active MESH profile projection and Business Partner are required",
            );
          const role = String(
            object(object(source["payload_json"])["recipient"])[
              "proposedNeonRole"
            ] ?? "",
          );
          if (!["supplier", "customer"].includes(role))
            throw conflict(
              "NEON_MESH_DIRECTION_INVALID",
              "MESH relationship does not provide a supported directional NEON role",
            );
          if (
            !source[role === "supplier" ? "has_supplier" : "has_customer"] ||
            !source["request_applied"]
          )
            throw conflict(
              "NEON_MESH_ROLE_NOT_READY",
              "The explicit NEON role/onboarding request is not applied",
            );
          await permit(
            options.authorizer,
            input.context,
            meshAccountBankPermissions.linkRequest,
            String(source["network_relationship_id"]),
          );
          return {
            link: await options.repository.createLink(
              {
                tenantId: input.context.tenantId,
                projection: source,
                businessPartnerId: input.businessPartnerId,
                role,
                ...(input.onboardingRequestId
                  ? { onboardingRequestId: input.onboardingRequestId }
                  : {}),
                key: input.idempotencyKey,
                principalId: input.context.principalId,
              },
              tx,
            ),
            replayed: false,
          };
        },
      );
    },
    async decideAccountLink(input: {
      context: VerifiedRequestContext;
      linkId: string;
      decision: "approve" | "reject";
      reason?: string;
    }) {
      context(input.context);
      return options.transactions.run(
        "neon",
        actor(input.context),
        async (tx) => {
          const row = await options.repository.link(
            input.linkId,
            input.context.tenantId,
            tx,
            true,
          );
          if (!row)
            throw missing(
              "NEON_MESH_ACCOUNT_LINK_NOT_FOUND",
              "Account link was not found",
            );
          await permit(
            options.authorizer,
            input.context,
            meshAccountBankPermissions.linkDecide,
            String(row["network_relationship_id"]),
          );
          if (String(row["status"]) !== "pending_approval")
            throw conflict(
              "NEON_MESH_ACCOUNT_LINK_NOT_PENDING",
              "Only a pending account link can be decided",
            );
          if (String(row["created_by"]) === input.context.principalId)
            throw forbidden(
              "NEON_MESH_ACCOUNT_LINK_SELF_APPROVAL",
              "Requester cannot approve their own MESH account mapping",
            );
          if (input.decision === "reject") reason(input.reason);
          return options.repository.decideLink(
            row,
            input.decision,
            input.context.principalId,
            input.reason,
            tx,
          );
        },
      );
    },
    async getAccountLink(input: {
      context: VerifiedRequestContext;
      linkId: string;
    }) {
      context(input.context);
      return options.transactions.run(
        "neon",
        actor(input.context),
        async (tx) => {
          const row = await options.repository.link(
            input.linkId,
            input.context.tenantId,
            tx,
          );
          if (!row)
            throw missing(
              "NEON_MESH_ACCOUNT_LINK_NOT_FOUND",
              "Account link was not found",
            );
          await permit(
            options.authorizer,
            input.context,
            meshAccountBankPermissions.linkRead,
            String(row["network_relationship_id"]),
          );
          return row;
        },
      );
    },
    async receiveBankDisclosure(input: {
      context: VerifiedRequestContext;
      envelope: MeshBankDisclosureEnvelope;
    }) {
      context(input.context);
      const e = parseEnvelope(input.envelope);
      if (e.recipientTenantId !== input.context.tenantId)
        throw forbidden(
          "NEON_BANK_RECIPIENT_MISMATCH",
          "Envelope recipient does not match authenticated tenant",
        );
      await permit(
        options.authorizer,
        input.context,
        meshAccountBankPermissions.receive,
        e.networkRelationshipId,
      );
      return options.transactions.run(
        "neon",
        actor(input.context),
        async (tx) => {
          const envelopeHash = hash(e),
            existing = await options.repository.inbox(
              input.context.tenantId,
              e.eventId,
              tx,
            );
          if (existing) {
            if (String(existing["envelope_hash"]) !== envelopeHash)
              throw conflict(
                "NEON_BANK_EVENT_ID_COLLISION",
                "Event ID was reused with different content",
              );
            const current = await options.repository.projection(input.context.tenantId, e.networkRelationshipId, tx);
            // An inbox record alone may be a retained ordering quarantine.
            // Only a projection which has reached/passed this version proves processing.
            const processingDisposition = order(e, current) === "stale" ? "stale" : "quarantined";
            return { disposition: "duplicate", processingDisposition, reasonCode: processingDisposition === "quarantined" ? "MESH_BANK_EVENT_QUARANTINED" : undefined, replayed: true };
          }
          validateEnvelope(e);
          const link = await options.repository.activeLink(
            input.context.tenantId,
            e,
            tx,
          );
          if (!link)
            throw conflict(
              "NEON_MESH_ACCOUNT_LINK_REQUIRED",
              "Approved directional account mapping is required before bank receipt",
            );
          const current = await options.repository.projection(
            input.context.tenantId,
            e.networkRelationshipId,
            tx,
            true,
          );
          const ordering = order(e, current);
          if (ordering) {
            await options.repository.recordInbox(
              {
                tenantId: input.context.tenantId,
                principalId: input.context.principalId,
                envelope: e,
                envelopeHash,
              },
              tx,
            );
            return {
              disposition: ordering,
              reasonCode: `MESH_BANK_EVENT_${ordering.toUpperCase()}`,
              replayed: false,
            };
          }
          return {
            ...(await options.repository.receive(
              {
                tenantId: input.context.tenantId,
                principalId: input.context.principalId,
                envelope: e,
                envelopeHash,
                link,
              },
              tx,
            )),
            replayed: false,
          };
        },
      );
    },

  });
}

function parseEnvelope(e: MeshBankDisclosureEnvelope) {
  if (!e || typeof e !== "object")
    throw invalid("MESH bank envelope is required");
  return {
    ...e,
    eventId: uuid(e.eventId, "eventId"),
    sourceTenantId: uuid(e.sourceTenantId, "sourceTenantId"),
    recipientTenantId: uuid(e.recipientTenantId, "recipientTenantId"),
    sourceNetworkAccountId: uuid(
      e.sourceNetworkAccountId,
      "sourceNetworkAccountId",
    ),
    recipientNetworkAccountId: uuid(
      e.recipientNetworkAccountId,
      "recipientNetworkAccountId",
    ),
    networkRelationshipId: uuid(
      e.networkRelationshipId,
      "networkRelationshipId",
    ),
    disclosureId: uuid(e.disclosureId, "disclosureId"),
    disclosureVersion: positive(e.disclosureVersion, "disclosureVersion"),
    lifecycleVersion: positive(e.lifecycleVersion, "lifecycleVersion"),
    occurredAt: instant(e.occurredAt),
  };
}
function validateEnvelope(e: MeshBankDisclosureEnvelope) {
  if (
    e.sourcePlane !== "mesh" ||
    e.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(e.payloadHash)
  )
    throw invalid("Unsupported source, schema or payload hash");
  if (e.eventType === "mesh.bank_account.revoked") {
    if (e.payload) throw invalid("Revocation cannot contain a bank payload");
    return;
  }
  if (!e.payload || hash(e.payload) !== e.payloadHash)
    throw conflict(
      "NEON_BANK_PAYLOAD_HASH_MISMATCH",
      "Bank payload hash does not match",
    );
  const keys = new Set([
      "sourceAccountId",
      "ownerVerified",
      "accountHolderName",
      "accountIdType",
      "accountLast4",
      "currencyCode",
      "bankName",
      "bankCountryCode",
      "bic",
      "accountFingerprint",
    ]),
    bank = object(e.payload["bankAccount"]);
  if (
    Object.keys(bank).some((k) => !keys.has(k)) ||
    !/^[A-Z0-9]{4}$/.test(String(bank["accountLast4"] ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(bank["accountFingerprint"] ?? "")) ||
    containsSensitive(e.payload)
  )
    throw invalid("Only the governed masked bank field set is accepted");
  if(bank["sourceAccountId"] !== undefined) uuid(bank["sourceAccountId"],"sourceAccountId");
  if(e.payload["expiresAt"] != null && !Number.isFinite(Date.parse(String(e.payload["expiresAt"])))) throw invalid("Disclosure expiry must be an instant");
  const recipient = object(e.payload["recipient"]);
  if (
    recipient["tenantId"] !== e.recipientTenantId ||
    recipient["networkAccountId"] !== e.recipientNetworkAccountId ||
    recipient["networkRelationshipId"] !== e.networkRelationshipId
  )
    throw conflict(
      "NEON_BANK_RECIPIENT_BINDING_MISMATCH",
      "Payload recipient binding does not match envelope",
    );
}
function order(e: MeshBankDisclosureEnvelope, current: Row | null) {
  if (!current)
    return e.eventType === "mesh.bank_account.disclosed" &&
      e.disclosureVersion === 1 &&
      e.lifecycleVersion === 1
      ? undefined
      : "quarantined";
  const version = Number(current["current_disclosure_version"]),
    lifecycle = Number(current["current_lifecycle_version"]);
  if (
    e.disclosureVersion < version ||
    (e.disclosureVersion === version && e.lifecycleVersion <= lifecycle)
  )
    return "stale";
  if (e.disclosureVersion > version + 1) return "quarantined";
  if (e.disclosureVersion === version + 1)
    return e.eventType === "mesh.bank_account.changed" &&
      e.lifecycleVersion === 1
      ? undefined
      : "quarantined";
  return e.eventType === "mesh.bank_account.revoked" &&
    e.lifecycleVersion === lifecycle + 1
    ? undefined
    : "quarantined";
}
function containsSensitive(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(containsSensitive);
  if (!v || typeof v !== "object") return false;
  return Object.entries(v as Record<string, unknown>).some(
    ([k, x]) =>
      /(account.?id.?value|account.?number|iban|routing.?number|raw)/i.test(
        k,
      ) || containsSensitive(x),
  );
}
function object(v: unknown) {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Readonly<Record<string, unknown>>)
    : {};
}
function one(r: { rows: readonly Row[] }) {
  return r.rows[0] ?? null;
}
function required<T>(v: T | null | undefined): T {
  if (v == null) throw new Error("Required WP15 row was not returned");
  return v;
}
function context(c: VerifiedRequestContext) {
  if (c.planeKey !== "neon") throw invalid("NEON context is required");
}
function actor(c: VerifiedRequestContext) {
  return {
    tenantId: c.tenantId,
    principalId: c.principalId,
    requestId: c.requestId,
    correlationId: c.correlationId,
  };
}
async function permitRegistration(a: Authorizer, c: VerifiedRequestContext, permissionCode: string, businessPartnerId: string, companyCodeId?: string) {
  if (companyCodeId) return permit(a, c, permissionCode, companyCodeId);
  const decision = await a.authorize({ context: c, permissionCode,
    resource: { tenantId: c.tenantId, businessPartnerId, governedWorkflow: true } });
  if (!decision.allowed && decision.reason === "mfa_required") throw forbidden("NEON_BANK_STEP_UP_REQUIRED", "Complete normal MFA before this protected bank operation");
  if (!decision.allowed) throw forbidden("FORBIDDEN", `Permission denied: ${permissionCode}`);
}

async function permit(
  a: Authorizer,
  c: VerifiedRequestContext,
  permissionCode: string,
  scopeId: string,
) {
  const coordinate = (permissionCode.startsWith("neon.business_partner_bank.") || permissionCode === meshAccountBankPermissions.register)
    ? { companyCodeId: scopeId }
    : { networkRelationshipId: scopeId };
  if (
    !(
      await a.authorize({
        context: c,
        permissionCode,
        resource: {
          tenantId: c.tenantId,
          ...coordinate,
          governedWorkflow: true,
        },
      })
    ).allowed
  )
    throw forbidden("FORBIDDEN", `Permission denied: ${permissionCode}`);
}
function key(v: string) {
  if (v.trim() !== v || v.length < 8 || v.length > 200)
    throw invalid("idempotencyKey must contain 8 to 200 trimmed characters");
}
function reason(v?: string) {
  if (!v || v.trim() !== v || v.length > 4000)
    throw invalid("reason must contain 1 to 4000 trimmed characters");
}
function uuid(v: unknown, name: string) {
  const x = String(v);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      x,
    )
  )
    throw invalid(`${name} must be a UUID`);
  return x;
}
function positive(v: unknown, name: string) {
  const x = Number(v);
  if (!Number.isSafeInteger(x) || x < 1)
    throw invalid(`${name} must be positive`);
  return x;
}
function instant(v: unknown) {
  const x = new Date(String(v));
  if (Number.isNaN(x.valueOf())) throw invalid("occurredAt must be an instant");
  return x.toISOString();
}
function invalid(message: string) {
  return new NeonAccountBankLinkageError(
    400,
    "NEON_ACCOUNT_BANK_INVALID",
    message,
  );
}
function forbidden(code: string, message: string) {
  return new NeonAccountBankLinkageError(403, code, message);
}
function conflict(code: string, message: string) {
  return new NeonAccountBankLinkageError(409, code, message);
}
function missing(code: string, message: string) {
  return new NeonAccountBankLinkageError(404, code, message);
}
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`)
    .join(",")}}`;
}
function hash(v: unknown) {
  return createHash("sha256").update(stable(v)).digest("hex");
}
export type BusinessPartnerAccountBankLinkageService = ReturnType<
  typeof createBusinessPartnerAccountBankLinkageService
>;

function publicRegistration(row:Row):Row {
  const {registration_account_fingerprint: _fingerprint,registration_account_id_type: _type,...registration}=row;
  return registration;
}
