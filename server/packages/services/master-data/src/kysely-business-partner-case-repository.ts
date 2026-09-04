import { createHash, randomUUID } from "node:crypto";
import type {
  BusinessPartnerAggregate,
  BusinessPartnerRequest,
  BusinessPartnerRequestRepository,
  BusinessPartnerRequestValidationFinding,
  BusinessPartnerRequestWorkflow,
} from "@athyper/server-contract-master-data";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;

const EMPTY_COUNTS = Object.freeze({
  addresses: 0,
  contactPersons: 0,
  contactChannels: 0,
  identifiers: 0,
  taxRegistrations: 0,
  classifications: 0,
  certifications: 0,
});

/**
 * Compatibility adapter for the existing Business Partner HTTP contract.
 * Persistence and commands are exclusively owned by document.entity_case.
 */
export class KyselyBusinessPartnerCaseRepository
  implements BusinessPartnerRequestRepository<Tx>
{
  async findByIdempotencyKey(tenantId: string, key: string, transaction: Tx) {
    const row = await readOne(transaction, tenantId, "c.idempotency_key", key);
    return row ? mapCase(row) : null;
  }

  async create(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["create"]>[0],
    transaction: Tx,
  ) {
    const contract = (
      await sql<Row>`SELECT id,entity_contract_hash,release_id,release_no
        FROM runtime_meta.entity_contract
       WHERE tenant_id=${input.tenantId}::uuid
         AND entity_code='master.business_partner' AND status='published'
       ORDER BY release_no DESC,id DESC LIMIT 1`.execute(transaction)
    ).rows[0];
    if (!contract)
      throw new MasterDataError(
        503,
        "BUSINESS_PARTNER_CASE_CONTRACT_UNAVAILABLE",
        "No published Business Partner entity contract is active in NEON",
      );
    const caseId = randomUUID();
    const payload = casePayload(input.command, input.requestNo);
    await executeCaseCommand(async () =>
      sql`SELECT * FROM document.command_entity_case_draft(
        ${input.tenantId}::uuid,${caseId}::uuid,0::bigint,NULL::uuid,
        ${input.requestNo},'master.business_partner',${input.command.kind},
        ${input.command.targetBusinessPartnerId ?? null}::uuid,
        ${`business-partner-case:${input.requestNo}`},${text(contract, "id")}::uuid,
        ${text(contract, "entity_contract_hash")},${input.schema.releaseId}::uuid,
        ${input.schema.version}::bigint,${input.schema.hash},${JSON.stringify(payload)}::jsonb,
        ${input.command.idempotencyKey},${input.createdBy}::uuid,NULL::uuid
      )`.execute(transaction),
    );
    const row = await readOne(transaction, input.tenantId, "c.id", caseId);
    if (!row) throw new Error("BUSINESS_PARTNER_CASE_CREATE_FAILED");
    return mapCase(row);
  }

  async get(tenantId: string, caseId: string, transaction: Tx) {
    const row = await readOne(transaction, tenantId, "c.id", caseId);
    return row ? mapCase(row) : null;
  }

  async getView(tenantId: string, caseId: string, transaction: Tx) {
    const row = await readOne(transaction, tenantId, "c.id", caseId);
    if (!row) return null;
    const request = mapCase(row);
    const findings = await readFindings(transaction, tenantId, caseId);
    const workflow = request.workflowRequestId
      ? {
          requestId: request.workflowRequestId,
          cycleRunId: request.workflowRequestId,
          stageId: request.workflowRequestId,
          workItemId: request.workflowRequestId,
          cycleTaskId: request.workflowRequestId,
          workItemVersion: 1,
          workItemStatus:
            request.status === "pending_approval" ? "open" : "completed",
          definition: request.schema,
        }
      : undefined;
    return { request, validationFindings: findings, ...(workflow ? { workflow } : {}) };
  }

  async list(
    query: Parameters<BusinessPartnerRequestRepository<Tx>["list"]>[0],
    transaction: Tx,
  ) {
    const rows = (
      await sql<Row>`WITH cases AS (
        SELECT ${sql.raw(CASE_SELECT)}
          FROM document.entity_case c
          JOIN snapshot.entity_snapshot s ON s.tenant_id=c.tenant_id AND s.snapshot_id=c.current_snapshot_id
          LEFT JOIN document.business_partner_invitation i ON i.tenant_id=c.tenant_id AND i.entity_case_id=c.id
         WHERE c.tenant_id=${query.tenantId}::uuid
           AND c.entity_code='master.business_partner'
           AND NULLIF(s.payload_json->>'operatingOrganizationId','')::uuid=${query.operatingOrganizationId}::uuid
           ${query.beforeCreatedAt ? sql`AND c.created_at<${query.beforeCreatedAt}::timestamptz` : sql``}
      )
      SELECT * FROM cases
       WHERE ${query.status ?? null}::text IS NULL
          OR ${sql.raw(COMPATIBILITY_STATUS_SQL)}=${query.status ?? null}
       ORDER BY created_at DESC,id DESC LIMIT ${query.limit ?? 50}`.execute(
        transaction,
      )
    ).rows.map(mapCase);
    return rows;
  }

  async getAggregate(
    tenantId: string,
    businessPartnerId: string,
    operatingOrganizationId: string,
    transaction: Tx,
  ): Promise<BusinessPartnerAggregate | null> {
    const bp = (
      await sql<Row>`SELECT bp.* FROM master.business_partner bp
        JOIN master.business_partner_operating_organization_assignment a
          ON a.tenant_id=bp.tenant_id AND a.business_partner_id=bp.id
       WHERE bp.tenant_id=${tenantId}::uuid AND bp.id=${businessPartnerId}::uuid
         AND a.operating_organization_id=${operatingOrganizationId}::uuid LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    if (!bp) return null;
    const [suppliers, customers, assignments, cases] = await Promise.all([
      sql<Row>`SELECT * FROM master.supplier WHERE tenant_id=${tenantId}::uuid AND business_partner_id=${businessPartnerId}::uuid ORDER BY created_at,id`.execute(transaction),
      sql<Row>`SELECT * FROM master.customer WHERE tenant_id=${tenantId}::uuid AND business_partner_id=${businessPartnerId}::uuid ORDER BY created_at,id`.execute(transaction),
      sql<Row>`SELECT a.*,o.code operating_organization_code,o.name operating_organization_name FROM master.business_partner_operating_organization_assignment a JOIN master.operating_organization o ON o.tenant_id=a.tenant_id AND o.id=a.operating_organization_id WHERE a.tenant_id=${tenantId}::uuid AND a.business_partner_id=${businessPartnerId}::uuid ORDER BY a.created_at,a.id`.execute(transaction),
      sql<Row>`SELECT ${sql.raw(CASE_SELECT)} FROM document.entity_case c JOIN snapshot.entity_snapshot s ON s.tenant_id=c.tenant_id AND s.snapshot_id=c.current_snapshot_id LEFT JOIN document.business_partner_invitation i ON i.tenant_id=c.tenant_id AND i.entity_case_id=c.id WHERE c.tenant_id=${tenantId}::uuid AND c.entity_code='master.business_partner' AND (c.target_entity_id=${businessPartnerId}::uuid OR EXISTS(SELECT 1 FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.command_code='entity.case.materialize' AND e.result_evidence->>'businessPartnerId'=${businessPartnerId})) ORDER BY c.created_at DESC`.execute(transaction),
    ]);
    return {
      businessPartner: {
        id: text(bp, "id"),
        code: text(bp, "code"),
        name: text(bp, "name"),
        ...optionalValue(bp, "display_name", "displayName"),
        ...optionalValue(bp, "legal_name", "legalName"),
        partnerCategory: text(bp, "partner_category"),
        ...optionalValue(bp, "legal_form", "legalForm"),
        ...optionalValue(bp, "registration_country_code", "registrationCountryCode"),
        ...optionalDate(bp, "incorporation_date", "incorporationDate", true),
        ...optionalValue(bp, "website_url", "websiteUrl"),
        ...optionalValue(bp, "description", "description"),
        aliases: [],
        status: text(bp, "status"),
        createdAt: date(bp["created_at"]),
        ...optionalDate(bp, "updated_at", "updatedAt"),
      },
      suppliers: suppliers.rows.map((row) => ({
        id: text(row, "id"), supplierCode: text(row, "supplier_code"),
        supplierType: String(row["supplier_type"] ?? "general"), status: text(row, "status"),
        createdAt: date(row["created_at"]), ...optionalDate(row, "updated_at", "updatedAt"),
      })),
      customers: customers.rows.map((row) => ({
        id: text(row, "id"), customerCode: text(row, "customer_code"),
        customerType: String(row["customer_type"] ?? "corporate"), status: text(row, "status"),
        recordVersion: Number(row["record_version"] ?? 1), designations: [],
        createdAt: date(row["created_at"]), ...optionalDate(row, "updated_at", "updatedAt"),
      })),
      supplierCompanyProfiles: [],
      customerCompanyProfiles: [],
      organizationAssignments: assignments.rows.map((row) => ({
        id: text(row, "id"), operatingOrganizationId: text(row, "operating_organization_id"),
        operatingOrganizationCode: text(row, "operating_organization_code"),
        operatingOrganizationName: text(row, "operating_organization_name"),
        partnerRole: text(row, "partner_role"), status: text(row, "status"),
        effectiveFrom: dateOnly(row["effective_from"]),
        ...optionalDate(row, "effective_until", "effectiveUntil", true),
      })),
      onboardingRequests: cases.rows.map(mapCase),
    };
  }

  async patch(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["patch"]>[0],
    transaction: Tx,
  ) {
    const current = await readOne(transaction, input.tenantId, "c.id", input.requestId);
    if (!current || mapCase(current).rowVersion !== input.expectedVersion) return null;
    const payload = {
      ...object(current["payload_json"]),
      ...input.proposedPayload,
      ...(input.operatingOrganizationId
        ? { operatingOrganizationId: input.operatingOrganizationId }
        : {}),
      ...(input.companyCodeId !== undefined
        ? { companyCodeId: input.companyCodeId }
        : {}),
      ...(input.requestedRole !== undefined
        ? { requestedRole: input.requestedRole }
        : {}),
    };
    const key = `case-patch:${input.requestId}:${input.expectedVersion}:${hash(payload).slice(0, 24)}`;
    await executeCaseCommand(async () =>
      sql`SELECT * FROM document.command_entity_case_draft(
        ${input.tenantId}::uuid,${input.requestId}::uuid,${input.expectedVersion}::bigint,
        ${text(current, "current_snapshot_id")}::uuid,${text(current, "case_code")},
        ${text(current, "entity_code")},${text(current, "operation_code")},
        ${nullable(current["target_entity_id"])}::uuid,${nullable(current["pre_materialization_ref"])},
        ${text(current, "entity_contract_id")}::uuid,${text(current, "entity_contract_hash")},
        ${nullable(current["form_template_release_id"])}::uuid,${Number(current["form_template_release_no"])}::bigint,
        ${nullable(current["form_template_hash"])},${JSON.stringify(payload)}::jsonb,${key},
        ${input.updatedBy}::uuid,NULL::uuid
      )`.execute(transaction),
    );
    const row = await readOne(transaction, input.tenantId, "c.id", input.requestId);
    return row ? mapCase(row) : null;
  }

  async replacePayload(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["patch"]>[0],
    transaction: Tx,
  ) {
    const current = await readOne(transaction, input.tenantId, "c.id", input.requestId);
    if (!current || mapCase(current).rowVersion !== input.expectedVersion) return null;
    const previous = object(current["payload_json"]);
    const payload = {
      ...input.proposedPayload,
      ...preserved(previous, [
        "requestedRole",
        "registrationChannel",
        "operatingOrganizationId",
        "companyCodeId",
        "meshRegistrationExchangeId",
        "meshRegistrationEvidenceHash",
      ]),
    };
    const key = `case-replace:${input.requestId}:${input.expectedVersion}:${hash(payload).slice(0, 24)}`;
    await executeCaseCommand(async () =>
      sql`SELECT * FROM document.command_entity_case_draft(
        ${input.tenantId}::uuid,${input.requestId}::uuid,${input.expectedVersion}::bigint,
        ${text(current, "current_snapshot_id")}::uuid,${text(current, "case_code")},
        ${text(current, "entity_code")},${text(current, "operation_code")},
        ${nullable(current["target_entity_id"])}::uuid,${nullable(current["pre_materialization_ref"])},
        ${text(current, "entity_contract_id")}::uuid,${text(current, "entity_contract_hash")},
        ${nullable(current["form_template_release_id"])}::uuid,${Number(current["form_template_release_no"])}::bigint,
        ${nullable(current["form_template_hash"])},${JSON.stringify(payload)}::jsonb,${key},
        ${input.updatedBy}::uuid,NULL::uuid
      )`.execute(transaction),
    );
    const row = await readOne(transaction, input.tenantId, "c.id", input.requestId);
    return row ? mapCase(row) : null;
  }

  async recordValidation(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["recordValidation"]>[0],
    transaction: Tx,
  ) {
    const key = `case-validation:${input.requestId}:${input.result.evaluationId}`;
    await executeCaseCommand(async () =>
      sql`SELECT * FROM document.command_entity_case_validation(
        ${input.tenantId}::uuid,${input.requestId}::uuid,${input.expectedVersion}::bigint,
        ${input.result.evaluationId}::uuid,${input.result.ruleset.code},${String(input.result.ruleset.version)},
        ${input.result.ruleset.hash},${JSON.stringify(input.result.findings)}::jsonb,
        ${JSON.stringify(input.result.validationSummary)}::jsonb,${JSON.stringify(input.result.duplicateSummary)}::jsonb,
        ${JSON.stringify(input.result.changeImpact)}::jsonb,${key},${input.evaluatedBy}::uuid,NULL::uuid
      )`.execute(transaction),
    );
    const row = await readOne(transaction, input.tenantId, "c.id", input.requestId);
    return row ? mapCase(row) : null;
  }

  async submit(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["submit"]>[0],
    transaction: Tx,
  ) {
    const result = await lifecycle(transaction, {
      tenantId: input.tenantId, caseId: input.requestId, action: "submit",
      expectedVersion: input.expectedVersion, reason: null, key: input.idempotencyKey,
      actorId: input.submittedBy, correlationId: input.correlationId,
    });
    const row = await readOne(transaction, input.tenantId, "c.id", input.requestId);
    if (!row) return null;
    const request = mapCase(row);
    return { request, case: request, workflow: workflow(request, input.definition, input.decisionFingerprint), replayed: result.replayed };
  }

  async decide(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["decide"]>[0],
    transaction: Tx,
  ) {
    const result = await lifecycle(transaction, {
      tenantId: input.tenantId, caseId: input.command.requestId, action: input.command.decision,
      expectedVersion: input.command.expectedRequestVersion, reason: input.command.reason,
      key: input.command.idempotencyKey, actorId: input.decidedBy,
    });
    const row = await readOne(transaction, input.tenantId, "c.id", input.command.requestId);
    if (!row) return null;
    const request = mapCase(row);
    const definition = {
      code: request.schema.code, version: request.schema.version, hash: request.schema.hash,
      stageCode: "governed_case_review", stageName: "Governed case review", approverPrincipalIds: [input.decidedBy],
    };
    return {
      request,
      case: request,
      workflow: workflow(request, definition, input.decisionFingerprint),
      decision: input.command.decision,
      decisionFingerprint: input.decisionFingerprint,
      replayed: result.replayed,
    };
  }

  async apply(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["apply"]>[0],
    transaction: Tx,
  ) {
    const raw = (
      await executeCaseCommand(async () =>
        sql<Row>`SELECT * FROM master.command_materialize_business_partner_role_case(
          ${input.tenantId}::uuid,${input.command.requestId}::uuid,${input.command.expectedVersion}::bigint,
          ${input.command.idempotencyKey},${input.appliedBy}::uuid,${input.correlationId ?? null}::uuid
        )`.execute(transaction),
      )
    ).rows[0];
    if (!raw) return null;
    const row = await readOne(transaction, input.tenantId, "c.id", input.command.requestId);
    if (!row) return null;
    const request = mapCase(row);
    const role = request.requestedRole;
    const roleId = nullable(raw["role_id"]);
    const snapshotId = text(raw, "result_snapshot_id");
    return {
      request,
      case: request,
      materialization: {
        businessPartnerId: text(raw, "business_partner_id"),
        resultKind: "partner_role_created" as const,
        ...(role ? { partnerRole: role } : {}),
        ...(roleId ? { roleId } : {}),
        ...(role === "supplier" && roleId ? { supplierId: roleId } : {}),
        ...(role === "customer" && roleId ? { customerId: roleId } : {}),
        snapshotId,
        applicationFingerprint: input.applicationFingerprint,
        extensionMaterializationCounts: EMPTY_COUNTS,
      },
      replayed: raw["replayed"] === true,
    };
  }
}

const CASE_SELECT = `c.*,s.payload_json,i.id invitation_id,i.registration_mode invitation_registration_mode,
 i.applicant_principal_id,
 (SELECT v.evaluation_id FROM document.entity_case_validation v WHERE v.tenant_id=c.tenant_id AND v.entity_case_id=c.id ORDER BY v.evaluated_at DESC,v.id DESC LIMIT 1) validation_evaluation_id,
 (SELECT v.evaluated_snapshot_id FROM document.entity_case_validation v WHERE v.tenant_id=c.tenant_id AND v.entity_case_id=c.id ORDER BY v.evaluated_at DESC,v.id DESC LIMIT 1) validation_snapshot_id,
 (SELECT v.details->'validationSummary' FROM document.entity_case_validation v WHERE v.tenant_id=c.tenant_id AND v.entity_case_id=c.id ORDER BY v.evaluated_at DESC,v.id DESC LIMIT 1) validation_summary,
 (SELECT v.details->'duplicateSummary' FROM document.entity_case_validation v WHERE v.tenant_id=c.tenant_id AND v.entity_case_id=c.id ORDER BY v.evaluated_at DESC,v.id DESC LIMIT 1) duplicate_summary,
 (SELECT v.details->'changeImpact' FROM document.entity_case_validation v WHERE v.tenant_id=c.tenant_id AND v.entity_case_id=c.id ORDER BY v.evaluated_at DESC,v.id DESC LIMIT 1) change_impact,
 (SELECT e.recorded_at FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.command_code='entity.case.submit' ORDER BY e.recorded_at DESC LIMIT 1) submitted_at,
 (SELECT e.recorded_by FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.command_code='entity.case.submit' ORDER BY e.recorded_at DESC LIMIT 1) submitted_by,
 (SELECT e.recorded_at FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.result_code='ENTITY_CASE_APPROVED' ORDER BY e.recorded_at DESC LIMIT 1) approved_at,
 (SELECT e.recorded_by FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.result_code='ENTITY_CASE_APPROVED' ORDER BY e.recorded_at DESC LIMIT 1) approved_by,
  (SELECT e.request_fingerprint FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.command_code='entity.case.decision' ORDER BY e.recorded_at DESC LIMIT 1) decision_fingerprint,
  (SELECT e.result_code FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.command_code='entity.case.decision' ORDER BY e.recorded_at DESC LIMIT 1) latest_decision,
  (SELECT e.recorded_at FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.command_code='entity.case.decision' ORDER BY e.recorded_at DESC LIMIT 1) latest_decision_at,
  (SELECT e.recorded_at FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.command_code='entity.case.draft.write' ORDER BY e.recorded_at DESC LIMIT 1) latest_draft_at,
 (SELECT m.completed_at FROM document.entity_case_materialization m WHERE m.tenant_id=c.tenant_id AND m.entity_case_id=c.id AND m.status='succeeded' ORDER BY m.attempt_no DESC LIMIT 1) applied_at,
 (SELECT m.completed_by FROM document.entity_case_materialization m WHERE m.tenant_id=c.tenant_id AND m.entity_case_id=c.id AND m.status='succeeded' ORDER BY m.attempt_no DESC LIMIT 1) applied_by,
 (SELECT m.result_evidence FROM document.entity_case_command_evidence m WHERE m.tenant_id=c.tenant_id AND m.entity_case_id=c.id AND m.command_code='entity.case.materialize' ORDER BY m.recorded_at DESC LIMIT 1) materialization_evidence`;

const COMPATIBILITY_STATUS_SQL = `CASE
 WHEN status IN('submitted','in_review') THEN 'pending_approval'
 WHEN status='materializing' THEN 'applying'
 WHEN status='materialized' THEN 'applied'
 WHEN status='conflicted' THEN 'validation_failed'
 WHEN status='draft' AND latest_decision='ENTITY_CASE_RETURNED'
  AND latest_decision_at IS NOT NULL
  AND(latest_draft_at IS NULL OR latest_decision_at>=latest_draft_at) THEN 'returned'
 WHEN status='draft' AND validation_snapshot_id=current_snapshot_id
  AND validation_summary->>'outcome'='failed' THEN 'validation_failed'
 ELSE status END`;

async function readOne(tx: Tx, tenantId: string, column: "c.id" | "c.idempotency_key", value: string) {
  return (
    await sql<Row>`SELECT ${sql.raw(CASE_SELECT)} FROM document.entity_case c
      JOIN snapshot.entity_snapshot s ON s.tenant_id=c.tenant_id AND s.snapshot_id=c.current_snapshot_id
      LEFT JOIN document.business_partner_invitation i ON i.tenant_id=c.tenant_id AND i.entity_case_id=c.id
     WHERE c.tenant_id=${tenantId}::uuid AND c.entity_code='master.business_partner'
       AND ${sql.raw(column)}=${value} LIMIT 1`.execute(tx)
  ).rows[0] ?? null;
}

async function readFindings(tx: Tx, tenantId: string, caseId: string) {
  const rows = (
    await sql<Row>`SELECT v.* FROM document.entity_case_validation v
      WHERE v.tenant_id=${tenantId}::uuid AND v.entity_case_id=${caseId}::uuid
        AND v.evaluation_id=(SELECT evaluation_id FROM document.entity_case_validation
          WHERE tenant_id=${tenantId}::uuid AND entity_case_id=${caseId}::uuid
          ORDER BY evaluated_at DESC,id DESC LIMIT 1)
      ORDER BY v.ordinal`.execute(tx)
  ).rows;
  return rows.map((row): BusinessPartnerRequestValidationFinding => {
    const details = object(row["details"]);
    return {
      ruleCode: String(details["ruleCode"] ?? row["finding_code"]),
      severity: text(row, "severity") as BusinessPartnerRequestValidationFinding["severity"],
      fieldPath: String(row["field_path"] ?? ""),
      outcome: String(details["outcome"] ?? "failed") as BusinessPartnerRequestValidationFinding["outcome"],
      messageCode: text(row, "finding_code"),
      evidenceReference: object(details["evidenceReference"]),
    };
  });
}

function mapCase(row: Row): BusinessPartnerRequest {
  const payload = object(row["payload_json"]);
  const status = mapStatus(row);
  const role = payload["requestedRole"];
  const org = nullable(payload["operatingOrganizationId"]);
  const company = nullable(payload["companyCodeId"]);
  const materialization = object(row["materialization_evidence"]);
  const source = sourceFromPayload(payload);
  return {
    id: text(row, "id"), caseId: text(row, "id"),
    tenantId: text(row, "tenant_id"), requestNo: text(row, "case_code"), caseNo: text(row, "case_code"),
    kind: (text(row, "operation_code") === "register" ? "new_partner" : text(row, "operation_code")) as BusinessPartnerRequest["kind"],
    source,
    registrationMode: String(row["invitation_registration_mode"] ?? (source.kind === "mesh" ? "integration" : "direct")) as BusinessPartnerRequest["registrationMode"],
    ...optionalValue(row, "invitation_id", "invitationId"),
    ...optionalValue(row, "applicant_principal_id", "applicantPrincipalId"),
    ...optionalValue(row, "target_entity_id", "targetBusinessPartnerId"),
    ...(role === "supplier" || role === "customer" ? { requestedRole: role } : {}),
    ...(org ? { operatingOrganizationId: org } : {}),
    ...(company ? { companyCodeId: company } : {}),
    schema: {
      code: "neon.business_partner.entity_case",
      version: Number(row["form_template_release_no"] ?? 1),
      hash: String(row["form_template_hash"] ?? row["entity_contract_hash"]),
      ...optionalValue(row, "form_template_release_id", "releaseId"),
    },
    proposedPayload: payload,
    extensionSummary: { mode: "typed_v1", counts: EMPTY_COUNTS },
    validationSummary: object(row["validation_summary"]),
    duplicateSummary: object(row["duplicate_summary"]),
    changeImpact: object(row["change_impact"]),
    ...(row["submitted_at"] ? { workflowRequestId: text(row, "id") } : {}),
    ...optionalFrom(materialization, "businessPartnerId", "materializedBusinessPartnerId"),
    ...(role === "supplier" ? optionalFrom(materialization, "roleId", "materializedSupplierId") : {}),
    ...(role === "customer" ? optionalFrom(materialization, "roleId", "materializedCustomerId") : {}),
    ...optionalFrom(materialization, "assignmentId", "materializedOperatingOrganizationAssignmentId"),
    ...optionalValue(row, "result_snapshot_id", "materializationSnapshotId"),
    ...optionalValue(row, "decision_fingerprint", "decisionFingerprint"),
    ...optionalDate(row, "submitted_at", "submittedAt"),
    ...optionalValue(row, "submitted_by", "submittedBy"),
    ...optionalDate(row, "approved_at", "approvedAt"),
    ...optionalValue(row, "approved_by", "approvedBy"),
    ...optionalDate(row, "applied_at", "appliedAt"),
    ...optionalValue(row, "applied_by", "appliedBy"),
    idempotencyKey: text(row, "idempotency_key"),
    status, caseStatus: text(row, "status") as NonNullable<BusinessPartnerRequest["caseStatus"]>, rowVersion: Number(row["row_version"]),
    createdAt: date(row["created_at"]), createdBy: text(row, "created_by"),
    ...optionalDate(row, "updated_at", "updatedAt"), ...optionalValue(row, "updated_by", "updatedBy"),
  };
}

function mapStatus(row: Row): BusinessPartnerRequest["status"] {
  const value = text(row, "status"),
    latestDecisionAt = row["latest_decision_at"] == null
      ? undefined
      : new Date(String(row["latest_decision_at"])).valueOf(),
    latestDraftAt = row["latest_draft_at"] == null
      ? undefined
      : new Date(String(row["latest_draft_at"])).valueOf();
  if (value === "submitted" || value === "in_review") return "pending_approval";
  if (value === "materializing") return "applying";
  if (value === "materialized") return "applied";
  if (value === "conflicted") return "validation_failed";
  if (
    value === "draft" &&
    row["latest_decision"] === "ENTITY_CASE_RETURNED" &&
    latestDecisionAt !== undefined &&
    Number.isFinite(latestDecisionAt) &&
    (latestDraftAt === undefined || latestDecisionAt >= latestDraftAt)
  )
    return "returned";
  if (value === "draft" && row["validation_snapshot_id"] === row["current_snapshot_id"] && object(row["validation_summary"])["outcome"] === "failed") return "validation_failed";
  return value as BusinessPartnerRequest["status"];
}

function sourceFromPayload(payload: Readonly<Record<string, unknown>>): BusinessPartnerRequest["source"] {
  const channel = String(payload["registrationChannel"] ?? "internal");
  if (channel === "mesh_proposal") {
    const exchangeId=nullable(payload["meshRegistrationExchangeId"]),payloadHash=nullable(payload["meshRegistrationEvidenceHash"]);
    return {kind:"mesh",systemCode:"athyper_mesh",entityCode:"business_partner_profile",...(exchangeId?{entityId:exchangeId,projectionId:exchangeId}:{}),...(payloadHash?{payloadHash}:{})};
  }
  if (channel === "invitation" || channel === "customer_onboarding") return { kind: "portal" };
  return { kind: "manual" };
}

function casePayload(command: Parameters<BusinessPartnerRequestRepository<Tx>["create"]>[0]["command"], requestNo: string) {
  const proposed = command.proposedPayload;
  const role = command.requestedRole;
  const external = command.source.kind === "portal" || command.source.kind === "mesh";
  const channel = command.source.kind === "mesh" ? "mesh_proposal" : command.source.kind === "portal" ? (role === "customer" ? "customer_onboarding" : "invitation") : "internal";
  const code = String(proposed["businessPartnerCode"] ?? proposed["partnerCode"] ?? proposed[role === "customer" ? "customerCode" : "supplierCode"] ?? requestNo);
  const name = String(proposed["name"] ?? proposed["legalName"] ?? proposed["displayName"] ?? code);
  return {
    ...proposed,
    businessPartnerCode: code,
    name,
    ownershipClass: String(proposed["ownershipClass"] ?? (external ? "external" : "internal")),
    ...(role ? { requestedRole: role, roleCode: String(proposed["roleCode"] ?? proposed[role === "customer" ? "customerCode" : "supplierCode"] ?? code) } : {}),
    registrationChannel: String(proposed["registrationChannel"] ?? channel),
    ...(command.operatingOrganizationId ? { operatingOrganizationId: command.operatingOrganizationId } : {}),
    ...(command.companyCodeId ? { companyCodeId: command.companyCodeId } : {}),
    ...(command.source.kind === "mesh" ? {
      meshRegistrationExchangeId: command.source.entityId ?? command.source.projectionId,
      meshRegistrationEvidenceHash: command.source.payloadHash,
      preflight: proposed["preflight"] ?? { trust: "passed", rate: "passed", duplicate: "passed", sponsorPolicy: "approved" },
    } : {}),
  };
}

async function lifecycle(tx: Tx, input: { tenantId: string; caseId: string; action: string; expectedVersion: number; reason: string | null; key: string; actorId: string; correlationId?: string }) {
  const row = (
    await executeCaseCommand(async () =>
      sql<Row>`SELECT * FROM document.command_entity_case_lifecycle(
        ${input.tenantId}::uuid,${input.caseId}::uuid,${input.action},${input.expectedVersion}::bigint,
        NULL::uuid,NULL::uuid,${input.reason},${input.key},${input.actorId}::uuid,
        ${input.correlationId ?? null}::uuid
      )`.execute(tx),
    )
  ).rows[0];
  if (!row) throw new Error("BUSINESS_PARTNER_CASE_LIFECYCLE_FAILED");
  return { replayed: row["replayed"] === true };
}

function workflow(request: BusinessPartnerRequest, definition: { code: string; version: number; hash: string }, fingerprint: string): BusinessPartnerRequestWorkflow {
  return { requestId: request.id, cycleRunId: request.id, stageId: request.id, workItemId: request.id, cycleTaskId: request.id, definition: { code: definition.code, version: definition.version, hash: definition.hash }, decisionFingerprint: fingerprint };
}

async function executeCaseCommand<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "P0002") throw new MasterDataError(404, "BUSINESS_PARTNER_CASE_NOT_FOUND", "Business Partner case was not found");
    if (code === "42501") throw new MasterDataError(403, "BUSINESS_PARTNER_CASE_AUTHORITY_DENIED", "Business Partner case authority denied the command");
    if (code === "40001") throw new MasterDataError(409, "BUSINESS_PARTNER_CASE_VERSION_CONFLICT", "Business Partner case version is stale");
    if (["23503", "23505", "23514", "55000"].includes(code)) throw new MasterDataError(409, "BUSINESS_PARTNER_CASE_COMMAND_CONFLICT", error instanceof Error ? error.message : "Business Partner case command conflict");
    throw error;
  }
}

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function object(value: unknown): Readonly<Record<string, unknown>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}; }
function preserved(value: Readonly<Record<string, unknown>>, keys: readonly string[]) { return Object.fromEntries(keys.flatMap((key) => value[key] === undefined ? [] : [[key, value[key]]])); }
function text(row: Row, key: string) { if (row[key] == null) throw new Error(`BUSINESS_PARTNER_CASE_ROW_INVALID:${key}`); return String(row[key]); }
function nullable(value: unknown) { return value == null || value === "" ? undefined : String(value); }
function date(value: unknown) { const parsed = value instanceof Date ? value : new Date(String(value)); if (Number.isNaN(parsed.valueOf())) throw new Error("BUSINESS_PARTNER_CASE_ROW_INVALID:date"); return parsed.toISOString(); }
function dateOnly(value: unknown) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function optionalValue(row: Row, column: string, key: string) { const value = nullable(row[column]); return value ? { [key]: value } : {}; }
function optionalFrom(row: Readonly<Record<string, unknown>>, column: string, key: string) { const value = nullable(row[column]); return value ? { [key]: value } : {}; }
function optionalDate(row: Row, column: string, key: string, only = false) { return row[column] == null ? {} : { [key]: only ? dateOnly(row[column]) : date(row[column]) }; }
