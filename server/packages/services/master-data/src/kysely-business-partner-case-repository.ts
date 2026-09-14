import { linkRequestCaptureDocuments } from "./business-partner-request-capture.js";
import { createHash, randomUUID } from "node:crypto";
import type {
  BusinessPartnerAggregate,
  BusinessPartnerRequest,
  BusinessPartnerRequestMaterializationProof,
  BusinessPartnerRequestRepository,
  BusinessPartnerRequestValidationFinding,
  BusinessPartnerRequestWorkflow,
  BusinessPartnerRequestWorkflowDefinition,
  BusinessPartnerRequestWorkflowStageDefinition,
} from "@athyper/server-contract-master-data";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";
import { KyselyBusinessPartnerEligibilityRepository } from "./kysely-business-partner-eligibility-repository.js";

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
export class KyselyBusinessPartnerCaseRepository implements BusinessPartnerRequestRepository<Tx> {
  constructor(
    private readonly entityCode:
      | "master.business_partner"
      | "master.business_partner_company_setup_request" = "master.business_partner",
  ) {}

  private readOne(
    tx: Tx,
    tenantId: string,
    column: "c.id" | "c.idempotency_key",
    value: string,
  ) {
    return readOne(tx, tenantId, column, value, this.entityCode);
  }

  async matchesGovernedImportCreation(
    input: Parameters<
      NonNullable<
        BusinessPartnerRequestRepository<Tx>["matchesGovernedImportCreation"]
      >
    >[0],
    transaction: Tx,
  ): Promise<boolean> {
    const { command, context, existing, schema } = input;
    if (
      command.kind !== "new_partner" ||
      command.source.kind !== "import" ||
      Object.keys(command.source).length !== 1 ||
      command.registrationMode !== "integration" ||
      existing.tenantId !== context.tenantId ||
      existing.createdBy !== context.principalId
    )
      return false;
    const payload = casePayload(command, existing.requestNo);
    const rows = await sql`SELECT 1 FROM document.entity_case c
      JOIN document.entity_case_command_evidence e ON e.tenant_id=c.tenant_id AND e.entity_case_id=c.id
      JOIN snapshot.entity_snapshot s ON s.tenant_id=e.tenant_id AND s.snapshot_id=e.result_snapshot_id
      WHERE c.tenant_id=${context.tenantId}::uuid AND c.id=${existing.id}::uuid
        AND c.idempotency_key=${command.idempotencyKey} AND c.created_by=${context.principalId}::uuid
        AND c.form_template_release_id=${schema.releaseId ?? null}::uuid
        AND e.command_code='entity.case.draft.write' AND e.before_version=0
        AND s.payload_json=${JSON.stringify(payload)}::jsonb`.execute(
      transaction,
    );
    return rows.rows.length === 1;
  }
  async findByIdempotencyKey(tenantId: string, key: string, transaction: Tx) {
    const row = await this.readOne(
      transaction,
      tenantId,
      "c.idempotency_key",
      key,
    );
    return row ? mapCase(row) : null;
  }

  async create(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["create"]>[0],
    transaction: Tx,
  ) {
    if (
      this.entityCode === "master.business_partner_company_setup_request" &&
      (input.command.kind !== "configure_company" ||
        input.command.source.kind !== "manual" ||
        !input.command.companyCodeId ||
        !input.command.operatingOrganizationId ||
        !input.command.targetBusinessPartnerId)
    )
      throw new MasterDataError(
        400,
        "BP_COMPANY_PILOT_COMMAND_INVALID",
        "Company setup requires a manual configure_company request with company, organization and target BP",
      );
    const contract = (
      await sql<Row>`SELECT id,entity_contract_hash,release_id,release_no
        FROM runtime_meta.entity_contract
       WHERE tenant_id=${input.tenantId}::uuid
         AND entity_code=${this.entityCode} AND status='published'
       ORDER BY release_no DESC,id DESC LIMIT 1`.execute(transaction)
    ).rows[0];
    if (!contract)
      throw new MasterDataError(
        503,
        "BUSINESS_PARTNER_CASE_CONTRACT_UNAVAILABLE",
        "No published Business Partner entity contract is active in NEON",
      );
    let targetIdentity: Row | undefined;
    if (
      input.command.targetBusinessPartnerId &&
      (input.command.kind === "add_supplier" ||
        input.command.kind === "add_customer")
    ) {
      targetIdentity = (
        await sql<Row>`SELECT bp.*,
          EXISTS(SELECT 1 FROM master.supplier supplier
            WHERE supplier.tenant_id=bp.tenant_id
              AND supplier.business_partner_id=bp.id
              AND supplier.status<>'retired') has_supplier,
          EXISTS(SELECT 1 FROM master.customer customer
            WHERE customer.tenant_id=bp.tenant_id
              AND customer.business_partner_id=bp.id
              AND customer.status<>'retired') has_customer
        FROM master.business_partner bp
        WHERE bp.tenant_id=${input.tenantId}::uuid
          AND bp.id=${input.command.targetBusinessPartnerId}::uuid
          AND bp.status='active'
        FOR SHARE`.execute(transaction)
      ).rows[0];
      if (!targetIdentity)
        throw new MasterDataError(
          409,
          "BUSINESS_PARTNER_ROLE_EXTENSION_TARGET_INELIGIBLE",
          "The target Business Partner is not active or is outside the tenant",
        );
      const alreadyExists =
        (input.command.requestedRole === "supplier" &&
          targetIdentity["has_supplier"] === true) ||
        (input.command.requestedRole === "customer" &&
          targetIdentity["has_customer"] === true);
      if (alreadyExists)
        throw new MasterDataError(
          409,
          "BUSINESS_PARTNER_ROLE_ALREADY_EXISTS",
          `The target Business Partner already has a current ${input.command.requestedRole} role`,
        );
    }
    if (
      input.command.targetBusinessPartnerId &&
      (input.command.kind === "assign_organization" ||
        input.command.kind === "configure_company")
    ) {
      targetIdentity = (
        await sql<Row>`SELECT bp.*,
          supplier.id supplier_role_id,supplier.supplier_code,
          customer.id customer_role_id,customer.customer_code
        FROM master.business_partner bp
        LEFT JOIN master.supplier supplier
          ON supplier.tenant_id=bp.tenant_id AND supplier.business_partner_id=bp.id AND supplier.status<>'retired'
        LEFT JOIN master.customer customer
          ON customer.tenant_id=bp.tenant_id AND customer.business_partner_id=bp.id AND customer.status<>'retired'
        WHERE bp.tenant_id=${input.tenantId}::uuid
          AND bp.id=${input.command.targetBusinessPartnerId}::uuid
          AND bp.status='active'
        FOR SHARE OF bp`.execute(transaction)
      ).rows[0];
      const roleId =
        input.command.requestedRole === "supplier"
          ? targetIdentity?.["supplier_role_id"]
          : targetIdentity?.["customer_role_id"];
      if (!targetIdentity || !roleId)
        throw new MasterDataError(
          409,
          "BUSINESS_PARTNER_SCOPE_TARGET_INELIGIBLE",
          "The target Business Partner does not have the requested active role",
        );
    }
    const isChange = [
      "amend_partner",
      "change_bank",
      "activate_supplier",
      "deactivate",
      "reactivate",
      "archive",
    ].includes(input.command.kind);
    if (isChange) {
      targetIdentity = (
        await sql<Row>`SELECT * FROM master.business_partner
        WHERE tenant_id=${input.tenantId}::uuid AND id=${input.command.targetBusinessPartnerId}::uuid FOR SHARE`.execute(
          transaction,
        )
      ).rows[0];
      if (!targetIdentity)
        throw new MasterDataError(
          409,
          "BUSINESS_PARTNER_CHANGE_TARGET_UNAVAILABLE",
          "Business Partner change target is unavailable",
        );
    }
    let meshResolution: Row | undefined;
    if (input.command.kind === "amend_partner") {
      if (input.command.source.kind !== "mesh")
        throw new MasterDataError(
          409,
          "BUSINESS_PARTNER_AMENDMENT_SOURCE_REQUIRED",
          "This amendment path requires retained MESH field decisions",
        );
      meshResolution = (
        await sql<Row>`SELECT r.* FROM document.mesh_profile_change_resolution r
        JOIN control.mesh_business_partner_profile_projection p ON p.tenant_id=r.tenant_id AND p.id=r.projection_id
        WHERE r.tenant_id=${input.tenantId}::uuid AND r.id=${input.command.proposedPayload["meshChangeResolutionId"]}::uuid
          AND r.business_partner_id=${input.command.targetBusinessPartnerId}::uuid AND r.created_by=${input.createdBy}::uuid
          AND r.operating_organization_id=${input.command.operatingOrganizationId}::uuid
          AND r.incoming_snapshot_id=${input.command.source.projectionId}::uuid
          AND p.current_snapshot_id=r.incoming_snapshot_id AND p.projection_status='active'
          AND r.expected_target_version=${Number(targetIdentity!["record_version"])}
        FOR SHARE OF p`.execute(transaction)
      ).rows[0];
      if (!meshResolution)
        throw new MasterDataError(
          409,
          "MESH_PROFILE_CHANGE_STALE",
          "Retained decisions or the pinned source/target are no longer current",
        );
    }
    const caseId = randomUUID();
    const payload = casePayload(input.command, input.requestNo, targetIdentity);
    if (isChange && targetIdentity)
      Object.assign(payload, {
        expectedBusinessPartnerVersion: Number(
          targetIdentity["record_version"],
        ),
        priorStatus: String(targetIdentity["status"]),
      });
    if (meshResolution) {
      const mapping: Record<string, string> = {
        legalName: "name",
        legalForm: "legalForm",
        countryCode: "registrationCountryCode",
        incorporationDate: "incorporationDate",
        websiteUrl: "websiteUrl",
        description: "description",
      };
      for (const [path, value] of Object.entries(
        object(meshResolution["proposed_values"]),
      )) {
        const field = mapping[path.slice(8)];
        if (!field)
          throw new MasterDataError(
            409,
            "MESH_PROFILE_CHANGE_INVALID",
            "Unsupported retained profile field",
          );
        if (value === null) delete (payload as Row)[field];
        else (payload as Row)[field] = value;
      }
      Object.assign(payload, {
        meshChangeResolutionId: String(meshResolution["id"]),
        meshChangeFingerprint: String(meshResolution["preview_fingerprint"]),
        meshChangeDecisions: object(meshResolution["decisions"]),
        meshChangePreview: object(meshResolution["preview"]),
        reasonCode: "MESH_PROFILE_CHANGE",
      });
    }
    if (input.command.kind === "change_bank") {
      const source = (
        await sql<Row>`SELECT projection.current_snapshot_id,profile.preferred_remittance_bank_link_id
        FROM control.mesh_bank_account_projection projection
        JOIN control.mesh_business_partner_account_link link ON link.tenant_id=projection.tenant_id AND link.id=projection.account_link_id AND link.status='active'
        JOIN master.supplier supplier ON supplier.tenant_id=link.tenant_id AND supplier.business_partner_id=link.business_partner_id
        JOIN master.company_code_supplier_profile profile ON profile.tenant_id=supplier.tenant_id AND profile.supplier_id=supplier.id
        WHERE projection.tenant_id=${input.tenantId}::uuid AND projection.id=${input.command.proposedPayload["bankProjectionId"]}::uuid
          AND link.business_partner_id=${input.command.targetBusinessPartnerId}::uuid
          AND profile.id=${input.command.proposedPayload["supplierCompanyProfileId"]}::uuid
          AND profile.company_code_id=${input.command.companyCodeId}::uuid AND profile.status='active'
          AND projection.projection_status IN('available','change_pending') FOR SHARE OF projection,profile,link`.execute(
          transaction,
        )
      ).rows[0];
      if (!source)
        throw new MasterDataError(
          409,
          "BUSINESS_PARTNER_BANK_SOURCE_UNAVAILABLE",
          "An active matching company profile and bank projection are required",
        );
      Object.assign(payload, {
        expectedBankSnapshotId: text(source, "current_snapshot_id"),
        ...(nullable(source["preferred_remittance_bank_link_id"])
          ? {
              priorBankLinkId: text(
                source,
                "preferred_remittance_bank_link_id",
              ),
            }
          : {}),
      });
    }
    await executeCaseCommand(async () =>
      sql`SELECT * FROM document.command_entity_case_draft(
        ${input.tenantId}::uuid,${caseId}::uuid,0::bigint,NULL::uuid,
        ${input.requestNo},${this.entityCode},${input.command.kind},
        ${input.command.targetBusinessPartnerId ?? null}::uuid,
        ${`business-partner-case:${input.requestNo}`},${text(contract, "id")}::uuid,
        ${text(contract, "entity_contract_hash")},${input.schema.releaseId}::uuid,
        ${input.schema.version}::bigint,${input.schema.hash},${JSON.stringify(payload)}::jsonb,
        ${input.command.idempotencyKey},${input.createdBy}::uuid,NULL::uuid
      )`.execute(transaction),
    );
    await linkRequestCaptureDocuments({tenantId:input.tenantId,principalId:input.createdBy,caseId,extensions:input.command.extensions??{}},transaction);
    if (meshResolution)
      await sql`INSERT INTO document.mesh_profile_change_case(tenant_id,resolution_id,entity_case_id) VALUES(${input.tenantId}::uuid,${String(meshResolution["id"])}::uuid,${caseId}::uuid)`.execute(
        transaction,
      );
    const row = await this.readOne(transaction, input.tenantId, "c.id", caseId);
    if (!row) throw new Error("BUSINESS_PARTNER_CASE_CREATE_FAILED");
    return mapCase(row);
  }

  async get(tenantId: string, caseId: string, transaction: Tx) {
    const row = await this.readOne(transaction, tenantId, "c.id", caseId);
    return row ? mapCase(row) : null;
  }

  async getView(tenantId: string, caseId: string, transaction: Tx) {
    const row = await this.readOne(transaction, tenantId, "c.id", caseId);
    if (!row) return null;
    const request = mapCase(row);
    const findings = await readFindings(
      transaction,
      tenantId,
      caseId,
      nullable(row["validation_evaluation_id"]),
    );
    const validationRunRow = (await sql<Row>`SELECT v.evaluation_id,v.evaluated_at,v.evaluated_snapshot_id,i.version_number,
      (evaluated.payload_json IS DISTINCT FROM current.payload_json) stale
      FROM document.entity_case_validation v
      JOIN snapshot.entity_snapshot_identity i ON i.tenant_id=v.tenant_id AND i.id=v.evaluated_snapshot_id
      JOIN snapshot.entity_snapshot evaluated ON evaluated.tenant_id=v.tenant_id AND evaluated.snapshot_id=v.evaluated_snapshot_id
      JOIN snapshot.entity_snapshot current ON current.tenant_id=v.tenant_id AND current.snapshot_id=${text(row, "current_snapshot_id")}::uuid
      WHERE v.tenant_id=${tenantId}::uuid AND v.entity_case_id=${caseId}::uuid AND v.evaluation_id=${nullable(row["validation_evaluation_id"]) ?? null}::uuid LIMIT 1`.execute(transaction)).rows[0];
    const previous = (
      await sql<Row>`SELECT prior.id,prior.version_number,body.payload_json
      FROM snapshot.entity_snapshot_identity current
      JOIN snapshot.entity_snapshot_identity prior ON prior.tenant_id=current.tenant_id
        AND prior.id=current.previous_snapshot_id AND prior.entity_id=current.entity_id AND prior.entity_type=current.entity_type
      JOIN snapshot.entity_snapshot body ON body.tenant_id=prior.tenant_id AND body.snapshot_id=prior.id
      WHERE current.tenant_id=${tenantId}::uuid AND current.id=${text(row, "current_snapshot_id")}::uuid`.execute(
        transaction,
      )
    ).rows[0];
    const workflowRow = request.workflowRequestId
      ? await readWorkflow(transaction, tenantId, caseId)
      : undefined;
    const workflow = workflowRow
      ? {
          ...workflowResponse(workflowRow, request.decisionFingerprint ?? ""),
          stages: await readWorkflowStages(
            transaction,
            tenantId,
            text(workflowRow, "request_id"),
          ),
        }
      : undefined;
    const onboardingCycle = await readOnboardingCycle(
      transaction,
      tenantId,
      caseId,
    );
    const materializationProof =
      request.status === "applied"
        ? await readMaterializationProof(transaction, tenantId, caseId, request)
        : undefined;
    return {
      request,
      validationFindings: findings,
      ...(validationRunRow ? {validationRun: {evaluationId:text(validationRunRow,"evaluation_id"),evaluatedAt:date(validationRunRow["evaluated_at"]),snapshotId:text(validationRunRow,"evaluated_snapshot_id"),requestVersion:Number(validationRunRow["version_number"]),stale:validationRunRow["stale"] === true}} : {}),
      validationCurrent: Boolean(
        row["validation_snapshot_id"] &&
        row["validation_snapshot_id"] === row["current_snapshot_id"],
      ),
      snapshotId: text(row, "current_snapshot_id"),
      ...(previous
        ? {
            previousSnapshot: {
              id: text(previous, "id"),
              revision: Number(previous["version_number"]),
              payload: object(previous["payload_json"]),
            },
          }
        : {}),
      ...(workflow ? { workflow } : {}),
      ...(onboardingCycle ? { onboardingCycle } : {}),
      ...(materializationProof ? { materializationProof } : {}),
    };
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
           AND c.entity_code=${this.entityCode}
           AND ${
             this.entityCode === "master.business_partner_company_setup_request"
               ? sql`c.owner_company_code_id=${query.companyCodeId ?? null}::uuid`
               : sql`NULLIF(s.payload_json->>'operatingOrganizationId','')::uuid=${query.operatingOrganizationId ?? null}::uuid`
           }
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
        LEFT JOIN master.business_partner_operating_organization_assignment a
          ON a.tenant_id=bp.tenant_id AND a.business_partner_id=bp.id
         AND a.operating_organization_id=${operatingOrganizationId}::uuid
       WHERE bp.tenant_id=${tenantId}::uuid AND bp.id=${businessPartnerId}::uuid
         AND (a.id IS NOT NULL OR NOT EXISTS(
           SELECT 1 FROM master.business_partner_operating_organization_assignment scoped
            WHERE scoped.tenant_id=bp.tenant_id AND scoped.business_partner_id=bp.id
         )) LIMIT 1`.execute(transaction)
    ).rows[0];
    if (!bp) return null;
    const [suppliers, customers, assignments, cases] = await Promise.all([
      sql<Row>`SELECT * FROM master.supplier WHERE tenant_id=${tenantId}::uuid AND business_partner_id=${businessPartnerId}::uuid ORDER BY created_at,id`.execute(
        transaction,
      ),
      sql<Row>`SELECT * FROM master.customer WHERE tenant_id=${tenantId}::uuid AND business_partner_id=${businessPartnerId}::uuid ORDER BY created_at,id`.execute(
        transaction,
      ),
      sql<Row>`SELECT a.*,o.code operating_organization_code,o.name operating_organization_name FROM master.business_partner_operating_organization_assignment a JOIN master.operating_organization o ON o.tenant_id=a.tenant_id AND o.id=a.operating_organization_id WHERE a.tenant_id=${tenantId}::uuid AND a.business_partner_id=${businessPartnerId}::uuid ORDER BY a.created_at,a.id`.execute(
        transaction,
      ),
      sql<Row>`SELECT ${sql.raw(CASE_SELECT)} FROM document.entity_case c JOIN snapshot.entity_snapshot s ON s.tenant_id=c.tenant_id AND s.snapshot_id=c.current_snapshot_id LEFT JOIN document.business_partner_invitation i ON i.tenant_id=c.tenant_id AND i.entity_case_id=c.id WHERE c.tenant_id=${tenantId}::uuid AND c.entity_code=${this.entityCode} AND (c.target_entity_id=${businessPartnerId}::uuid OR EXISTS(SELECT 1 FROM document.entity_case_command_evidence e WHERE e.tenant_id=c.tenant_id AND e.entity_case_id=c.id AND e.command_code='entity.case.materialize' AND e.result_evidence->>'businessPartnerId'=${businessPartnerId})) ORDER BY c.created_at DESC`.execute(
        transaction,
      ),
    ]);
    const supplierProfiles =
      await sql<Row>`SELECT profile.* FROM master.company_code_supplier_profile profile
      JOIN master.supplier supplier ON supplier.tenant_id=profile.tenant_id AND supplier.id=profile.supplier_id
      JOIN master.operating_organization_company_assignment scope ON scope.tenant_id=profile.tenant_id AND scope.company_code_id=profile.company_code_id
      WHERE profile.tenant_id=${tenantId}::uuid AND supplier.business_partner_id=${businessPartnerId}::uuid
        AND scope.operating_organization_id=${operatingOrganizationId}::uuid AND scope.status='active' AND scope.effective_from<=CURRENT_DATE AND (scope.effective_until IS NULL OR scope.effective_until>CURRENT_DATE) AND profile.status='active'`.execute(
        transaction,
      );
    return {
      businessPartner: {
        id: text(bp, "id"),
        code: text(bp, "code"),
        name: text(bp, "name"),
        partnerCategory: text(bp, "partner_category"),
        ...optionalValue(bp, "legal_form", "legalForm"),
        ...optionalValue(
          bp,
          "registration_country_code",
          "registrationCountryCode",
        ),
        ...optionalDate(bp, "incorporation_date", "incorporationDate", true),
        ...optionalValue(bp, "website_url", "websiteUrl"),
        ...optionalValue(bp, "description", "description"),
        aliases: [],
        status: text(bp, "status"),
        createdAt: date(bp["created_at"]),
        ...optionalDate(bp, "updated_at", "updatedAt"),
      },
      suppliers: suppliers.rows.map((row) => ({
        id: text(row, "id"),
        supplierCode: text(row, "supplier_code"),
        supplierType: String(row["supplier_type"] ?? "general"),
        status: text(row, "status"),
        createdAt: date(row["created_at"]),
        ...optionalDate(row, "updated_at", "updatedAt"),
      })),
      customers: customers.rows.map((row) => ({
        id: text(row, "id"),
        customerCode: text(row, "customer_code"),
        customerType: String(row["customer_type"] ?? "corporate"),
        status: text(row, "status"),
        recordVersion: Number(row["record_version"] ?? 1),
        designations: [],
        createdAt: date(row["created_at"]),
        ...optionalDate(row, "updated_at", "updatedAt"),
      })),
      supplierCompanyProfiles: supplierProfiles.rows.map((row) => ({
        id: text(row, "id"),
        supplierId: text(row, "supplier_id"),
        companyCodeId: text(row, "company_code_id"),
        status: text(row, "status"),
        createdAt: date(row["created_at"]),
        ...optionalValue(row, "currency_code", "currencyCode"),
        ...optionalValue(row, "payment_term_id", "paymentTermId"),
      })),
      customerCompanyProfiles: [],
      organizationAssignments: assignments.rows.map((row) => ({
        id: text(row, "id"),
        operatingOrganizationId: text(row, "operating_organization_id"),
        operatingOrganizationCode: text(row, "operating_organization_code"),
        operatingOrganizationName: text(row, "operating_organization_name"),
        partnerRole: text(row, "partner_role"),
        status: text(row, "status"),
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
    const current = await this.readOne(
      transaction,
      input.tenantId,
      "c.id",
      input.requestId,
    );
    if (!current)
      return null;
    if (object(current["payload_json"])["meshChangeResolutionId"])
      throw new MasterDataError(
        409,
        "MESH_PROFILE_CHANGE_IMMUTABLE",
        "Create a new comparison and resolution to change field decisions",
      );
    const payload = {
      ...Object.fromEntries(Object.entries({
        ...object(current["payload_json"]), ...input.proposedPayload,
      }).filter(([, value]) => value !== null)),
      ...(input.extensions !== undefined ? {relationshipProposals:input.extensions} : {}),
      ...preserved(object(current["payload_json"]), [
        "expectedBusinessPartnerVersion",
        "priorStatus",
        "expectedBankSnapshotId",
        "priorBankLinkId",
      ]),
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
    if (mapCase(current).rowVersion !== input.expectedVersion) {
      // A lost response can be retried only while the exact accepted result is still current.
      const replay = (await sql<Row>`SELECT id FROM document.entity_case_command_evidence
        WHERE tenant_id=${input.tenantId}::uuid AND entity_case_id=${input.requestId}::uuid
          AND command_code='entity.case.draft.write' AND idempotency_key=${key}
          AND recorded_by=${input.updatedBy}::uuid AND outcome='accepted'
          AND after_version=${mapCase(current).rowVersion}::bigint
          AND result_snapshot_id=${text(current,"current_snapshot_id")}::uuid`.execute(transaction)).rows[0];
      if (!replay || mapCase(current).status !== "draft") return null;
      return mapCase(current);
    }
    await linkRequestCaptureDocuments({tenantId:input.tenantId,principalId:input.updatedBy,caseId:input.requestId,extensions:object((payload as Row)["relationshipProposals"])},transaction);
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
    const row = await this.readOne(
      transaction,
      input.tenantId,
      "c.id",
      input.requestId,
    );
    return row ? mapCase(row) : null;
  }

  async replacePayload(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["patch"]>[0],
    transaction: Tx,
  ) {
    const current = await this.readOne(
      transaction,
      input.tenantId,
      "c.id",
      input.requestId,
    );
    if (!current || mapCase(current).rowVersion !== input.expectedVersion)
      return null;
    const previous = object(current["payload_json"]);
    if (previous["meshChangeResolutionId"])
      throw new MasterDataError(
        409,
        "MESH_PROFILE_CHANGE_IMMUTABLE",
        "Create a new comparison and resolution to change field decisions",
      );
    const payload = {
      ...input.proposedPayload,
      ...preserved(previous, [
        "requestedRole",
        "expectedBankSnapshotId",
        "priorBankLinkId",
        "expectedBusinessPartnerVersion",
        "priorStatus",
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
    const row = await this.readOne(
      transaction,
      input.tenantId,
      "c.id",
      input.requestId,
    );
    return row ? mapCase(row) : null;
  }

  async recordValidation(
    input: Parameters<
      BusinessPartnerRequestRepository<Tx>["recordValidation"]
    >[0],
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
    const row = await this.readOne(
      transaction,
      input.tenantId,
      "c.id",
      input.requestId,
    );
    return row ? mapCase(row) : null;
  }

  async submit(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["submit"]>[0],
    transaction: Tx,
  ) {
    const captureCase=await this.readOne(transaction,input.tenantId,"c.id",input.requestId);
    if(captureCase && mapCase(captureCase).status!=="pending_approval")await linkRequestCaptureDocuments({tenantId:input.tenantId,principalId:input.submittedBy,caseId:input.requestId,extensions:object(object(captureCase["payload_json"])["relationshipProposals"])},transaction);
    const result = await lifecycle(transaction, {
      tenantId: input.tenantId,
      caseId: input.requestId,
      action: "submit",
      expectedVersion: input.expectedVersion,
      reason: null,
      key: input.idempotencyKey,
      actorId: input.submittedBy,
      correlationId: input.correlationId,
    });
    if (result.replayed) {
      const row = await this.readOne(
          transaction,
          input.tenantId,
          "c.id",
          input.requestId,
        ),
        existing = await readWorkflow(
          transaction,
          input.tenantId,
          input.requestId,
        );
      if (!row || !existing) return null;
      const request = mapCase(row);
      return {
        request,
        case: request,
        workflow: workflowResponse(existing, input.decisionFingerprint),
        replayed: true,
      };
    }
    const prior = (
      await sql<Row>`SELECT id,(SELECT count(*)::int FROM document.workflow_stage s WHERE s.tenant_id=w.tenant_id AND s.workflow_request_id=w.id) stage_count FROM document.workflow_request w WHERE tenant_id=${input.tenantId}::uuid AND entity_type='business_partner_case' AND entity_id=${input.requestId} ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`.execute(
        transaction,
      )
    ).rows[0];
    const stageNo = Number(prior?.["stage_count"] ?? 0) + 1;
    const configuredStages = workflowStages(input.definition);
    const metadata = {
      submissionIdempotencyKey: input.idempotencyKey,
      submissionFingerprint: input.decisionFingerprint,
      approverPrincipalIds: [...input.definition.approverPrincipalIds].sort(),
      iteration: stageNo,
    };
    const workflowRow = prior
      ? (
          await sql<Row>`UPDATE document.workflow_request SET definition_code=${input.definition.code},definition_version=${input.definition.version},compiled_artifact_hash=${input.definition.hash},template_snapshot=${JSON.stringify({ stages: configuredStages })}::jsonb,requested_by=${input.submittedBy}::uuid,requested_at=now(),decision=NULL,decided_by=NULL,decided_at=NULL,reason=NULL,status='pending',metadata=metadata||${JSON.stringify(metadata)}::jsonb,updated_by=${input.submittedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${text(prior, "id")}::uuid RETURNING id`.execute(
            transaction,
          )
        ).rows[0]
      : (
          await sql<Row>`INSERT INTO document.workflow_request(tenant_id,workflow_type,definition_code,definition_version,compiled_artifact_hash,template_snapshot,entity_type,entity_id,entity_snapshot,requested_by,correlation_id,metadata,created_by) VALUES(${input.tenantId}::uuid,'approval',${input.definition.code},${input.definition.version},${input.definition.hash},${JSON.stringify({ stages: configuredStages })}::jsonb,'business_partner_case',${input.requestId},'{}'::jsonb,${input.submittedBy}::uuid,${input.correlationId ?? null}::uuid,${JSON.stringify(metadata)}::jsonb,${input.submittedBy}::uuid) RETURNING id`.execute(
            transaction,
          )
        ).rows[0];
    if (!workflowRow)
      throw new Error("BUSINESS_PARTNER_WORKFLOW_CREATE_FAILED");
    const workflowId = text(workflowRow, "id");
    let activeStage: Row | undefined, activeItem: Row | undefined;
    for (let index = 0; index < configuredStages.length; index += 1) {
      const definition = configuredStages[index]!,
        number = stageNo + index,
        suffix = stageNo === 1 ? "" : `_${stageNo}`,
        stageCode = suffix
          ? `${definition.code.slice(0, 63 - suffix.length)}${suffix}`
          : definition.code,
        status = !definition.routed
          ? "skipped"
          : activeStage
            ? "pending"
            : "active",
        quorum = quorumEvidence(definition, status === "active");
      const stage = (
        await sql<Row>`INSERT INTO document.workflow_stage(tenant_id,workflow_request_id,stage_no,stage_code,name,mode,quorum,sla_policy_code,started_at,completed_at,outcome,status,created_by) VALUES(${input.tenantId}::uuid,${workflowId}::uuid,${number},${stageCode},${definition.name},${definition.mode},${JSON.stringify(quorum)}::jsonb,${definition.slaMinutes ? `business_partner.${definition.code}` : null},${status === "active" || status === "skipped" ? sql`now()` : null},${status === "skipped" ? sql`now()` : null},${status === "skipped" ? "skipped" : null},${status}::document.workflow_stage_status_d,${input.submittedBy}::uuid) RETURNING *`.execute(
          transaction,
        )
      ).rows[0];
      if (!stage)
        throw new Error("BUSINESS_PARTNER_WORKFLOW_STAGE_CREATE_FAILED");
      if (status === "active") {
        activeStage = stage;
        activeItem = (
          await createStageWorkItems(transaction, {
            caseEntityCode: this.entityCode,
            tenantId: input.tenantId,
            requestId: input.requestId,
            workflowId,
            stage,
            definition,
            submittedBy: input.submittedBy,
            decisionFingerprint: input.decisionFingerprint,
          })
        )[0];
      }
    }
    if (!activeStage || !activeItem)
      throw new Error("BUSINESS_PARTNER_WORKFLOW_ROUTE_EMPTY");
    const row = await this.readOne(
      transaction,
      input.tenantId,
      "c.id",
      input.requestId,
    );
    if (!row) return null;
    const request = mapCase(row),
      workflow = {
        requestId: workflowId,
        stageId: text(activeStage, "id"),
        workItemId: text(activeItem, "id"),
        workItemVersion: Number(activeItem["row_version"]),
        workItemStatus: text(activeItem, "status"),
        ownerPrincipalId: text(activeItem, "assignee_principal_id"),
        definition: {
          code: input.definition.code,
          version: input.definition.version,
          hash: input.definition.hash,
        },
      };
    return {
      request,
      case: request,
      workflow: { ...workflow, decisionFingerprint: input.decisionFingerprint },
      replayed: false,
    };
  }

  async decide(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["decide"]>[0],
    transaction: Tx,
  ) {
    const currentWorkflow = await readWorkflow(
      transaction,
      input.tenantId,
      input.command.requestId,
      input.command.workItemId,
    );
    if (!currentWorkflow) return null;
    if (
      object(currentWorkflow["outcome"])["decisionFingerprint"] ===
      input.decisionFingerprint
    ) {
      const replayRow = await this.readOne(
        transaction,
        input.tenantId,
        "c.id",
        input.command.requestId,
      );
      if (!replayRow) return null;
      const replayRequest = mapCase(replayRow);
      return {
        request: replayRequest,
        case: replayRequest,
        workflow: workflowResponse(currentWorkflow, input.decisionFingerprint),
        decision: input.command.decision,
        decisionFingerprint: input.decisionFingerprint,
        replayed: true,
      };
    }
    const item = (
      await sql<Row>`UPDATE document.work_item SET status='completed',completed_at=now(),row_version=row_version+1,outcome=${JSON.stringify({ decision: input.command.decision, reason: input.command.reason, idempotencyKey: input.command.idempotencyKey, decisionFingerprint: input.decisionFingerprint, decidedBy: input.decidedBy })}::jsonb,updated_by=${input.decidedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.command.workItemId}::uuid AND source_entity_code='business_partner_case' AND source_entity_id=${input.command.requestId}::uuid AND status IN('open','claimed') AND row_version=${input.command.expectedWorkItemVersion} AND COALESCE(claimant_principal_id,assignee_principal_id)=${input.decidedBy}::uuid RETURNING id,row_version,status`.execute(
        transaction,
      )
    ).rows[0];
    if (!item) return null;
    const stageId = text(currentWorkflow, "stage_id"),
      quorum = object(currentWorkflow["quorum"]),
      required = Number(quorum["required"] ?? 1),
      approvalCount = Number(
        (
          await sql<{
            count: number;
          }>`SELECT count(DISTINCT outcome->>'decidedBy')::int count FROM document.work_item WHERE tenant_id=${input.tenantId}::uuid AND source_entity_code='business_partner_case' AND source_entity_id=${input.command.requestId}::uuid AND payload->>'workflowStageId'=${stageId} AND status='completed' AND outcome->>'decision'='approve'`.execute(
            transaction,
          )
        ).rows[0]?.count ?? 0,
      ),
      stageApproved =
        input.command.decision === "approve" && approvalCount >= required;
    let result = { replayed: false },
      responseWorkflow: Row = {
        ...currentWorkflow,
        row_version: item["row_version"],
        status: item["status"],
      };
    if (input.command.decision !== "approve" || stageApproved) {
      const terminalDecision = input.command.decision !== "approve";
      await sql`UPDATE document.workflow_stage SET status='completed',completed_at=now(),outcome=${terminalDecision ? (input.command.decision === "reject" ? "rejected" : "cancelled") : "approved"},updated_by=${input.decidedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${stageId}::uuid`.execute(
        transaction,
      );
      if (terminalDecision) {
        result = await lifecycle(transaction, {
          tenantId: input.tenantId,
          caseId: input.command.requestId,
          action: input.command.decision,
          expectedVersion: input.command.expectedRequestVersion,
          reason: input.command.reason,
          key: input.command.idempotencyKey,
          actorId: input.decidedBy,
        });
        await sql`UPDATE document.workflow_stage SET status='cancelled',started_at=COALESCE(started_at,now()),completed_at=now(),outcome='cancelled',updated_by=${input.decidedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND workflow_request_id=${input.command.workflowRequestId}::uuid AND status='pending'`.execute(
          transaction,
        );
        await sql`UPDATE document.work_item SET status='cancelled',completed_at=now(),row_version=row_version+1,updated_by=${input.decidedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND source_entity_code='business_partner_case' AND source_entity_id=${input.command.requestId}::uuid AND status IN('open','claimed')`.execute(
          transaction,
        );
        await finishWorkflow(
          transaction,
          input,
          input.command.decision === "reject" ? "rejected" : "cancelled",
        );
      } else {
        await sql`UPDATE document.work_item SET status='cancelled',completed_at=now(),row_version=row_version+1,updated_by=${input.decidedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND source_entity_code='business_partner_case' AND source_entity_id=${input.command.requestId}::uuid AND payload->>'workflowStageId'=${stageId} AND status IN('open','claimed')`.execute(
          transaction,
        );
        const pending = (
          await sql<Row>`SELECT * FROM document.workflow_stage WHERE tenant_id=${input.tenantId}::uuid AND workflow_request_id=${input.command.workflowRequestId}::uuid AND status='pending' ORDER BY stage_no LIMIT 1 FOR UPDATE`.execute(
            transaction,
          )
        ).rows[0];
        const nextDefinition = pending ? stageDefinition(pending) : undefined,
          next =
            pending && nextDefinition
              ? (
                  await sql<Row>`UPDATE document.workflow_stage SET status='active',started_at=now(),quorum=${JSON.stringify(quorumEvidence(nextDefinition, true))}::jsonb,updated_by=${input.decidedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${text(pending, "id")}::uuid RETURNING *`.execute(
                    transaction,
                  )
                ).rows[0]
              : undefined;
        if (next && nextDefinition) {
          const items = await createStageWorkItems(transaction, {
            caseEntityCode: this.entityCode,
            tenantId: input.tenantId,
            requestId: input.command.requestId,
            workflowId: input.command.workflowRequestId,
            stage: next,
            definition: nextDefinition,
            submittedBy: input.decidedBy,
            decisionFingerprint: text(
              currentWorkflow,
              "submission_fingerprint",
            ),
          });
          responseWorkflow = {
            ...currentWorkflow,
            stage_id: next["id"],
            work_item_id: items[0]!["id"],
            row_version: items[0]!["row_version"],
            status: items[0]!["status"],
            owner_principal_id: items[0]!["assignee_principal_id"],
            quorum: next["quorum"],
          };
        } else {
          result = await lifecycle(transaction, {
            tenantId: input.tenantId,
            caseId: input.command.requestId,
            action: "approve",
            expectedVersion: input.command.expectedRequestVersion,
            reason: input.command.reason,
            key: input.command.idempotencyKey,
            actorId: input.decidedBy,
          });
          await finishWorkflow(transaction, input, "approved");
        }
      }
    }
    const row = await this.readOne(
      transaction,
      input.tenantId,
      "c.id",
      input.command.requestId,
    );
    if (!row) return null;
    const request = mapCase(row);
    return {
      request,
      case: request,
      workflow: workflowResponse(responseWorkflow, input.decisionFingerprint),
      decision: input.command.decision,
      decisionFingerprint: input.decisionFingerprint,
      replayed: result.replayed,
    };
  }

  async apply(
    input: Parameters<BusinessPartnerRequestRepository<Tx>["apply"]>[0],
    transaction: Tx,
  ) {
    const current = await this.readOne(
      transaction,
      input.tenantId,
      "c.id",
      input.command.requestId,
    );
    if (!current) return null;
    if (current["operation_code"] === "activate_supplier")
      return applySupplierActivationCase(input, current, transaction);
    const change = [
      "change_bank",
      "deactivate",
      "reactivate",
      "archive",
    ].includes(String(current["operation_code"]));
    const materializer =
      current["operation_code"] === "amend_partner"
        ? "master.command_materialize_mesh_profile_change_case"
        : current["operation_code"] === "configure_company"
          ? "master.command_materialize_business_partner_company_case"
          : change
            ? "master.command_materialize_business_partner_change_case"
            : "master.command_materialize_business_partner_role_case";
    const raw = (
      await executeCaseCommand(async () =>
        sql<Row>`SELECT * FROM ${sql.raw(materializer)}(
          ${input.tenantId}::uuid,${input.command.requestId}::uuid,${input.command.expectedVersion}::bigint,
          ${input.command.idempotencyKey},${input.appliedBy}::uuid,${input.correlationId ?? null}::uuid
        )`.execute(transaction),
      )
    ).rows[0];
    if (!raw) return null;
    const row = await this.readOne(
      transaction,
      input.tenantId,
      "c.id",
      input.command.requestId,
    );
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
        resultKind:
          request.kind === "amend_partner"
            ? ("partner_amended" as const)
            : request.kind === "configure_company"
              ? ("company_configured" as const)
              : request.kind === "change_bank"
                ? ("bank_verification_started" as const)
                : request.kind === "deactivate"
                  ? ("partner_deactivated" as const)
                  : request.kind === "reactivate"
                    ? ("partner_reactivated" as const)
                    : request.kind === "archive"
                      ? ("partner_archived" as const)
                      : ("partner_role_created" as const),
        ...(nullable(raw["bank_verification_id"])
          ? { bankVerificationId: text(raw, "bank_verification_id") }
          : {}),
        ...(nullable(raw["company_profile_id"])
          ? { companyProfileId: text(raw, "company_profile_id") }
          : {}),
        ...(change
          ? { reasonCode: String(request.proposedPayload["reasonCode"]) }
          : {}),
        ...(role ? { partnerRole: role } : {}),
        ...(roleId ? { roleId } : {}),
        ...(role === "supplier" && roleId ? { supplierId: roleId } : {}),
        ...(role === "customer" && roleId ? { customerId: roleId } : {}),
        snapshotId,
        applicationFingerprint: input.applicationFingerprint,
        extensionMaterializationCounts: request.extensionSummary.counts,
      },
      replayed: raw["replayed"] === true,
    };
  }
}

async function applySupplierActivationCase(
  input: Parameters<BusinessPartnerRequestRepository<Tx>["apply"]>[0],
  current: Row,
  transaction: Tx,
) {
  const request = mapCase(current),
    payload = request.proposedPayload,
    activation = object(payload["activation"]),
    businessPartnerId = request.targetBusinessPartnerId,
    operatingOrganizationId = request.operatingOrganizationId,
    companyCodeId = request.companyCodeId,
    businessDate = String(activation["businessDate"] ?? "");
  if (
    !businessPartnerId ||
    !operatingOrganizationId ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(businessDate)
  )
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_CASE_SCOPE_INVALID",
      "Activation case requires a target, operating organization and business date",
    );
  const key = `activation-case:${request.id}`,
    prior = (
      await sql<Row>`SELECT evidence.*,supplier.id::text role_id,c.result_snapshot_id::text FROM document.supplier_activation_evidence evidence JOIN master.supplier supplier ON supplier.tenant_id=evidence.tenant_id AND supplier.id=evidence.supplier_id JOIN document.entity_case c ON c.tenant_id=evidence.tenant_id AND c.id=${request.id}::uuid WHERE evidence.tenant_id=${input.tenantId}::uuid AND evidence.idempotency_key=${key}`.execute(
        transaction,
      )
    ).rows[0];
  if (prior) {
    const row = await readOne(transaction, input.tenantId, "c.id", request.id);
    if (!row) return null;
    return activationResult(
      mapCase(row),
      prior,
      input.applicationFingerprint,
      true,
    );
  }
  if (
    request.status !== "approved" ||
    request.rowVersion !== input.command.expectedVersion
  )
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_CASE_NOT_APPROVED",
      "An independently approved activation case at the expected version is required",
    );
  const repository = new KyselyBusinessPartnerEligibilityRepository(),
    raw = await repository.resolve(
      {
        tenantId: input.tenantId,
        businessPartnerId,
        role: "supplier",
        operatingOrganizationId,
        ...(companyCodeId ? { companyCodeId } : {}),
        operationCode: companyCodeId ? "payment" : "purchasing",
        businessDate,
      },
      transaction,
    );
  if (!raw)
    throw new MasterDataError(
      404,
      "BUSINESS_PARTNER_NOT_FOUND",
      "Business Partner was not found",
    );
  const reasons = raw.reasons.filter(
      (reason) => reason.code !== "ROLE_INACTIVE",
    ),
    decision = {
      ...raw,
      eligible: !reasons.some((reason) => reason.severity === "blocking"),
      reasons,
    },
    readiness = {
      ...decision,
      decisionFingerprint: createHash("sha256")
        .update(JSON.stringify({ tenantId: input.tenantId, ...decision }))
        .digest("hex"),
    };
  if (!readiness.eligible)
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_READINESS_FAILED",
      `Supplier activation is blocked: ${reasons
        .filter((reason) => reason.severity === "blocking")
        .map((reason) => reason.code)
        .join(",")}`,
    );
  const expected = String(activation["readinessFingerprint"] ?? "");
  if (expected && expected !== readiness.decisionFingerprint)
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_READINESS_CHANGED",
      "Supplier readiness changed after the activation case was proposed",
    );
  const commandFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          caseId: request.id,
          businessPartnerId,
          operatingOrganizationId,
          companyCodeId: companyCodeId ?? null,
          businessDate,
          readinessFingerprint: readiness.decisionFingerprint,
        }),
      )
      .digest("hex"),
    evidence = await repository.activateSupplier(
      {
        tenantId: input.tenantId,
        businessPartnerId,
        operatingOrganizationId,
        ...(companyCodeId ? { companyCodeId } : {}),
        businessDate,
        idempotencyKey: key,
        activatedBy: input.appliedBy,
        readiness,
        commandFingerprint,
      },
      transaction,
    );
  if (!evidence)
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_STATE_CONFLICT",
      "Supplier is no longer in an activatable state",
    );
  const snapshot = (
    await sql<Row>`SELECT snapshot.fn_capture_entity('master.business_partner',${businessPartnerId}::uuid,${String(payload["businessPartnerCode"] ?? request.requestNo)},1,${String(current["entity_contract_hash"])} ,1,'supplier.activation.materialized','version',${JSON.stringify({ ...payload, activation: { ...activation, readinessFingerprint: readiness.decisionFingerprint, activationEvidenceId: evidence.id } })}::jsonb,${input.correlationId ?? null}::uuid,NULL,NULL,NULL,'legal','neon-business-partner')::text result_snapshot_id`.execute(
      transaction,
    )
  ).rows[0];
  if (!snapshot) throw new Error("SUPPLIER_ACTIVATION_SNAPSHOT_FAILED");
  const snapshotId = text(snapshot, "result_snapshot_id"),
    materializationId = randomUUID(),
    nextVersion = request.rowVersion + 1;
  await sql`INSERT INTO document.entity_case_materialization(id,tenant_id,entity_case_id,attempt_no,source_snapshot_id,result_snapshot_id,materializer_code,materializer_version,request_fingerprint,status,result_code,started_at,completed_at,requested_by,completed_by) VALUES(${materializationId}::uuid,${input.tenantId}::uuid,${request.id}::uuid,1,${String(current["decision_snapshot_id"])}::uuid,${snapshotId}::uuid,'neon.supplier_activation','1',${input.applicationFingerprint},'succeeded','SUPPLIER_ACTIVATED',now(),now(),${input.appliedBy}::uuid,${input.appliedBy}::uuid)`.execute(
    transaction,
  );
  await sql`UPDATE document.entity_case SET target_entity_id=${businessPartnerId}::uuid,result_snapshot_id=${snapshotId}::uuid,status='materialized',row_version=${nextVersion},updated_at=now(),updated_by=${input.appliedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${request.id}::uuid AND status='approved' AND row_version=${request.rowVersion}`.execute(
    transaction,
  );
  await sql`INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,result_code,result_snapshot_id,result_evidence,recorded_by) VALUES(${input.tenantId}::uuid,${request.id}::uuid,'entity.case.materialize',${input.command.idempotencyKey},${input.applicationFingerprint},${request.rowVersion},${request.rowVersion},${nextVersion},'approved','materialized','accepted','SUPPLIER_ACTIVATED',${snapshotId}::uuid,${JSON.stringify({ activationEvidenceId: evidence.id, readinessFingerprint: readiness.decisionFingerprint, businessPartnerId, supplierId: evidence.supplierId })}::jsonb,${input.appliedBy}::uuid)`.execute(
    transaction,
  );
  await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by) VALUES(${input.tenantId}::uuid,'governed-entity-case','entity.case.materialized',${`entity-case:${request.id}:v${nextVersion}:supplier-activation`},'document.entity_case',${request.id}::uuid,'entity_case',${request.id}::uuid,${nextVersion},${input.appliedBy}::uuid,'neon-business-partner',${input.correlationId ?? null}::uuid,${input.tenantId},${JSON.stringify({ caseId: request.id, businessPartnerId, supplierId: evidence.supplierId, activationEvidenceId: evidence.id, readinessFingerprint: readiness.decisionFingerprint, resultSnapshotId: snapshotId, status: "materialized", resultKind: "supplier_activated" })}::jsonb,${input.appliedBy}::uuid)`.execute(
    transaction,
  );
  const updated = await readOne(
    transaction,
    input.tenantId,
    "c.id",
    request.id,
  );
  return updated
    ? activationResult(
        mapCase(updated),
        {
          ...evidence,
          role_id: evidence.supplierId,
          result_snapshot_id: snapshotId,
        },
        input.applicationFingerprint,
        false,
      )
    : null;
}

function activationResult(
  request: BusinessPartnerRequest,
  row: Row,
  fingerprint: string,
  replayed: boolean,
) {
  return {
    request,
    case: request,
    materialization: {
      businessPartnerId: request.targetBusinessPartnerId!,
      resultKind: "supplier_activated" as const,
      partnerRole: "supplier" as const,
      roleId: String(row["role_id"] ?? row["supplierId"]),
      supplierId: String(row["role_id"] ?? row["supplierId"]),
      activationEvidenceId: String(row["id"]),
      snapshotId: String(row["result_snapshot_id"]),
      applicationFingerprint: fingerprint,
      extensionMaterializationCounts: request.extensionSummary.counts,
    },
    replayed,
  };
}

async function readOnboardingCycle(tx: Tx, tenantId: string, caseId: string) {
  const run = (
    await sql<Row>`SELECT run.* FROM governance.cycle_subject subject
    JOIN governance.cycle_run run ON run.tenant_id=subject.tenant_id AND run.id=subject.cycle_run_id
   WHERE subject.tenant_id=${tenantId}::uuid AND subject.entity_case_id=${caseId}::uuid AND subject.is_primary
   ORDER BY run.created_at DESC LIMIT 1`.execute(tx)
  ).rows[0];
  if (!run) return undefined;
  const [tasks, subjects] = await Promise.all([
    sql<Row>`SELECT task.id,task.code,task.name,task.status,task.completion_mode,task.started_at,task.completed_at,task.completion_evidence
      FROM governance.cycle_task task
      JOIN control.cycle_template_revision revision ON revision.tenant_id=task.tenant_id AND revision.id=${text(run, "template_revision_id")}::uuid
      WHERE task.tenant_id=${tenantId}::uuid AND task.cycle_run_id=${text(run, "id")}::uuid
      ORDER BY array_position(revision.topological_task_ids,task.task_template_id) NULLS LAST,task.created_at,task.id`.execute(
      tx,
    ),
    sql<Row>`SELECT subject_role,is_primary,entity_case_id,external_reference FROM governance.cycle_subject WHERE tenant_id=${tenantId}::uuid AND cycle_run_id=${text(run, "id")}::uuid ORDER BY is_primary DESC,created_at,id`.execute(
      tx,
    ),
  ]);
  return {
    runId: text(run, "id"),
    code: text(run, "code"),
    name: text(run, "name"),
    status: text(run, "status"),
    template: {
      code: "BP_SUPPLIER_ONBOARDING",
      version: Number(run["template_revision_number"]),
      hash: text(run, "template_hash"),
      releaseId: text(run, "template_revision_id"),
    },
    ...optionalDate(run, "started_at", "startedAt"),
    ...optionalDate(run, "completed_at", "completedAt"),
    tasks: tasks.rows.map((row) => ({
      id: text(row, "id"),
      code: text(row, "code"),
      name: text(row, "name"),
      status: text(row, "status"),
      completionMode: text(row, "completion_mode") as
        "manual" | "system" | "hybrid",
      ...optionalDate(row, "started_at", "startedAt"),
      ...optionalDate(row, "completed_at", "completedAt"),
      completionEvidence: object(row["completion_evidence"]),
    })),
    subjects: subjects.rows.map((row) => ({
      role: text(row, "subject_role"),
      primary: Boolean(row["is_primary"]),
      ...optionalValue(row, "entity_case_id", "entityCaseId"),
      ...optionalValue(row, "external_reference", "externalReference"),
    })),
  };
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
 (SELECT w.id FROM document.workflow_request w WHERE w.tenant_id=c.tenant_id AND w.entity_type='business_partner_case' AND w.entity_id=c.id::text ORDER BY w.created_at DESC,w.id DESC LIMIT 1) workflow_request_id,
 (SELECT w.metadata->>'submissionFingerprint' FROM document.workflow_request w WHERE w.tenant_id=c.tenant_id AND w.entity_type='business_partner_case' AND w.entity_id=c.id::text ORDER BY w.created_at DESC,w.id DESC LIMIT 1) submission_fingerprint,
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

async function readOne(
  tx: Tx,
  tenantId: string,
  column: "c.id" | "c.idempotency_key",
  value: string,
  entityCode = "master.business_partner",
) {
  return (
    (
      await sql<Row>`SELECT ${sql.raw(CASE_SELECT)} FROM document.entity_case c
      JOIN snapshot.entity_snapshot s ON s.tenant_id=c.tenant_id AND s.snapshot_id=c.current_snapshot_id
      LEFT JOIN document.business_partner_invitation i ON i.tenant_id=c.tenant_id AND i.entity_case_id=c.id
     WHERE c.tenant_id=${tenantId}::uuid AND c.entity_code=${entityCode}
       AND ${sql.raw(column)}=${value} LIMIT 1`.execute(tx)
    ).rows[0] ?? null
  );
}

async function readFindings(
  tx: Tx,
  tenantId: string,
  caseId: string,
  evaluationId: string | undefined,
) {
  const rows = (
    await sql<Row>`SELECT v.* FROM document.entity_case_validation v
      WHERE v.tenant_id=${tenantId}::uuid AND v.entity_case_id=${caseId}::uuid
        AND v.evaluation_id=${evaluationId ?? null}::uuid
      ORDER BY v.ordinal`.execute(tx)
  ).rows;
  return rows.map((row): BusinessPartnerRequestValidationFinding => {
    const details = object(row["details"]);
    return {
      ruleCode: String(details["ruleCode"] ?? row["finding_code"]),
      severity: text(
        row,
        "severity",
      ) as BusinessPartnerRequestValidationFinding["severity"],
      fieldPath: String(row["field_path"] ?? ""),
      outcome: String(
        details["outcome"] ?? "failed",
      ) as BusinessPartnerRequestValidationFinding["outcome"],
      messageCode: text(row, "finding_code"),
      evidenceReference: object(details["evidenceReference"]),
    };
  });
}

async function readMaterializationProof(
  tx: Tx,
  tenantId: string,
  caseId: string,
  request: BusinessPartnerRequest,
): Promise<BusinessPartnerRequestMaterializationProof | undefined> {
  const row = (
    await sql<Row>`SELECT
      m.id materialization_id,m.attempt_no,m.result_code,m.materializer_code,m.materializer_version,
      m.request_fingerprint,m.completed_at,m.completed_by,
      source.id source_snapshot_id,source.entity_type source_entity_type,source.entity_id source_entity_id,
      source.version_number source_version,source.payload_hash source_payload_hash,source.captured_at source_captured_at,
      result.id result_snapshot_id,result.entity_type result_entity_type,result.entity_id result_entity_id,
      result.version_number result_version,result.payload_hash result_payload_hash,result.captured_at result_captured_at
    FROM document.entity_case_materialization m
    JOIN snapshot.entity_snapshot_identity source
      ON source.tenant_id=m.tenant_id AND source.id=m.source_snapshot_id
    JOIN snapshot.entity_snapshot_identity result
      ON result.tenant_id=m.tenant_id AND result.id=m.result_snapshot_id
   WHERE m.tenant_id=${tenantId}::uuid AND m.entity_case_id=${caseId}::uuid AND m.status='succeeded'
   ORDER BY m.attempt_no DESC LIMIT 1`.execute(tx)
  ).rows[0];
  if (!row || !request.materializedBusinessPartnerId) return undefined;
  const lineageRows = (
    await sql<Row>`SELECT id,source_snapshot_id,target_snapshot_id,lineage_role,
      target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_at
    FROM snapshot.entity_case_snapshot_lineage
   WHERE tenant_id=${tenantId}::uuid AND entity_case_id=${caseId}::uuid
   ORDER BY created_at DESC,id DESC LIMIT 25`.execute(tx)
  ).rows;
  return Object.freeze({
    schema: "athyper.business-partner-materialization-proof/1",
    materializationId: text(row, "materialization_id"),
    attemptNo: Number(row["attempt_no"]),
    status: "succeeded",
    resultCode: text(row, "result_code"),
    sourceSnapshot: snapshotCoordinate(row, "source"),
    resultSnapshot: snapshotCoordinate(row, "result"),
    materializer: {
      code: text(row, "materializer_code"),
      version: text(row, "materializer_version"),
    },
    applicationFingerprint: text(row, "request_fingerprint"),
    completedAt: date(row["completed_at"]),
    completedBy: text(row, "completed_by"),
    result: {
      businessPartnerId: request.materializedBusinessPartnerId,
      ...(request.materializedBankVerificationId
        ? { bankVerificationId: request.materializedBankVerificationId }
        : {}),
      ...(request.requestedRole ? { partnerRole: request.requestedRole } : {}),
      ...(request.materializedSupplierId
        ? { roleId: request.materializedSupplierId }
        : {}),
      ...(request.materializedCustomerId
        ? { roleId: request.materializedCustomerId }
        : {}),
      ...(request.materializedOperatingOrganizationAssignmentId
        ? {
            operatingOrganizationAssignmentId:
              request.materializedOperatingOrganizationAssignmentId,
          }
        : {}),
    },
    lineage: Object.freeze(
      lineageRows.map((edge) =>
        Object.freeze({
          lineageId: text(edge, "id"),
          sourceSnapshotId: text(edge, "source_snapshot_id"),
          targetSnapshotId: text(edge, "target_snapshot_id"),
          role: text(edge, "lineage_role"),
          ...optionalValue(
            edge,
            "target_authority_type",
            "targetAuthorityType",
          ),
          ...optionalValue(edge, "target_authority_id", "targetAuthorityId"),
          transformationCode: text(edge, "transformation_code"),
          transformationVersion: text(edge, "transformation_version"),
          evidenceHash: text(edge, "evidence_hash"),
          createdAt: date(edge["created_at"]),
        }),
      ),
    ),
  });
}

function snapshotCoordinate(row: Row, prefix: "source" | "result") {
  return Object.freeze({
    snapshotId: text(row, `${prefix}_snapshot_id`),
    entityType: text(row, `${prefix}_entity_type`),
    entityId: text(row, `${prefix}_entity_id`),
    version: Number(row[`${prefix}_version`]),
    payloadHash: text(row, `${prefix}_payload_hash`),
    capturedAt: date(row[`${prefix}_captured_at`]),
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
    id: text(row, "id"),
    caseId: text(row, "id"),
    tenantId: text(row, "tenant_id"),
    requestNo: text(row, "case_code"),
    caseNo: text(row, "case_code"),
    kind: (text(row, "operation_code") === "register"
      ? "new_partner"
      : text(row, "operation_code")) as BusinessPartnerRequest["kind"],
    source,
    registrationMode: String(
      row["invitation_registration_mode"] ??
        (["mesh", "import", "api"].includes(source.kind)
          ? "integration"
          : "direct"),
    ) as BusinessPartnerRequest["registrationMode"],
    ...optionalValue(row, "invitation_id", "invitationId"),
    ...optionalValue(row, "applicant_principal_id", "applicantPrincipalId"),
    ...optionalValue(row, "target_entity_id", "targetBusinessPartnerId"),
    ...(role === "supplier" || role === "customer"
      ? { requestedRole: role }
      : {}),
    ...(org ? { operatingOrganizationId: org } : {}),
    ...(company ? { companyCodeId: company } : {}),
    schema: {
      code: "neon.business_partner.entity_case",
      version: Number(row["form_template_release_no"] ?? 1),
      hash: String(row["form_template_hash"] ?? row["entity_contract_hash"]),
      ...optionalValue(row, "form_template_release_id", "releaseId"),
    },
    proposedPayload: payload,
    extensionSummary: { mode: "typed_v1", counts: extensionCounts(payload) },
    validationSummary: object(row["validation_summary"]),
    duplicateSummary: object(row["duplicate_summary"]),
    changeImpact: object(row["change_impact"]),
    ...optionalValue(row, "workflow_request_id", "workflowRequestId"),
    ...optionalFrom(
      materialization,
      "businessPartnerId",
      "materializedBusinessPartnerId",
    ),
    ...(role === "supplier"
      ? optionalFrom(materialization, "roleId", "materializedSupplierId")
      : {}),
    ...(role === "customer"
      ? optionalFrom(materialization, "roleId", "materializedCustomerId")
      : {}),
    ...optionalFrom(
      materialization,
      "assignmentId",
      "materializedOperatingOrganizationAssignmentId",
    ),
    ...optionalFrom(
      materialization,
      "bankVerificationId",
      "materializedBankVerificationId",
    ),
    ...optionalFrom(materialization, "resultKind", "applicationResultKind"),
    ...optionalFrom(materialization, "reasonCode", "applicationReasonCode"),
    ...optionalValue(row, "result_snapshot_id", "materializationSnapshotId"),
    ...(nullable(row["submission_fingerprint"])
      ? { decisionFingerprint: nullable(row["submission_fingerprint"])! }
      : optionalValue(row, "decision_fingerprint", "decisionFingerprint")),
    ...optionalDate(row, "submitted_at", "submittedAt"),
    ...optionalValue(row, "submitted_by", "submittedBy"),
    ...optionalDate(row, "approved_at", "approvedAt"),
    ...optionalValue(row, "approved_by", "approvedBy"),
    ...optionalDate(row, "applied_at", "appliedAt"),
    ...optionalValue(row, "applied_by", "appliedBy"),
    idempotencyKey: text(row, "idempotency_key"),
    status,
    caseStatus: text(row, "status") as NonNullable<
      BusinessPartnerRequest["caseStatus"]
    >,
    rowVersion: Number(row["row_version"]),
    createdAt: date(row["created_at"]),
    createdBy: text(row, "created_by"),
    ...optionalDate(row, "updated_at", "updatedAt"),
    ...optionalValue(row, "updated_by", "updatedBy"),
  };
}

function mapStatus(row: Row): BusinessPartnerRequest["status"] {
  const value = text(row, "status"),
    latestDecisionAt =
      row["latest_decision_at"] == null
        ? undefined
        : new Date(String(row["latest_decision_at"])).valueOf(),
    latestDraftAt =
      row["latest_draft_at"] == null
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
  if (
    value === "draft" &&
    row["validation_snapshot_id"] === row["current_snapshot_id"] &&
    object(row["validation_summary"])["outcome"] === "failed"
  )
    return "validation_failed";
  return value as BusinessPartnerRequest["status"];
}

function sourceFromPayload(
  payload: Readonly<Record<string, unknown>>,
): BusinessPartnerRequest["source"] {
  const channel = String(payload["registrationChannel"] ?? "internal");
  if (channel === "mesh_proposal") {
    const exchangeId = nullable(payload["meshRegistrationExchangeId"]),
      payloadHash = nullable(payload["meshRegistrationEvidenceHash"]);
    return {
      kind: "mesh",
      systemCode: "athyper_mesh",
      entityCode: "business_partner_profile",
      ...(exchangeId ? { entityId: exchangeId, projectionId: exchangeId } : {}),
      ...(payloadHash ? { payloadHash } : {}),
    };
  }
  if (channel === "import" || channel === "api") return { kind: channel };
  if (channel === "invitation" || channel === "customer_onboarding")
    return { kind: "portal" };
  return { kind: "manual" };
}

function casePayload(
  command: Parameters<
    BusinessPartnerRequestRepository<Tx>["create"]
  >[0]["command"],
  requestNo: string,
  targetIdentity?: Row,
) {
  const proposed = command.draftCapture
    ? Object.fromEntries(Object.entries(command.proposedPayload).filter(([, value]) => value !== null))
    : command.proposedPayload;
  const role = command.requestedRole;
  const external =
    command.source.kind === "portal" || command.source.kind === "mesh";
  const channel =
    command.source.kind === "import" || command.source.kind === "api"
      ? command.source.kind
      : command.source.kind === "mesh"
        ? "mesh_proposal"
        : command.source.kind === "portal"
          ? role === "customer"
            ? "customer_onboarding"
            : "invitation"
          : "internal";
  const code = String(
    proposed["businessPartnerCode"] ??
      proposed["partnerCode"] ??
      proposed[role === "customer" ? "customerCode" : "supplierCode"] ??
      requestNo,
  );
  const name = String(
    proposed["name"] ??
      code,
  );
  const immutableTargetIdentity = targetIdentity
    ? {
        businessPartnerCode: text(targetIdentity, "code"),
        name: text(targetIdentity, "name"),
        ...optionalValue(targetIdentity, "legal_form", "legalForm"),
        ...optionalValue(
          targetIdentity,
          "registration_country_code",
          "registrationCountryCode",
        ),
        ...optionalDate(
          targetIdentity,
          "incorporation_date",
          "incorporationDate",
          true,
        ),
        ...optionalValue(targetIdentity, "website_url", "websiteUrl"),
        ...optionalValue(targetIdentity, "description", "description"),
        ownershipClass: text(targetIdentity, "ownership_class"),
      }
    : {};
  const ownershipClass = String(
    targetIdentity?.["ownership_class"] ??
      proposed["ownershipClass"] ??
      (external ? "external" : "internal"),
  );
  // Freeze the role subtype in the draft that is validated and approved. SQL
  // consumes this explicit value instead of applying its general/corporate fallback.
  const commercialRoleDefaults =
    role &&
    ["new_partner", "add_supplier", "add_customer"].includes(command.kind)
      ? role === "supplier"
        ? {
            supplierType:
              proposed["supplierType"] ??
              (ownershipClass === "internal" ? "intercompany" : "general"),
          }
        : {
            customerType:
              proposed["customerType"] ??
              (ownershipClass === "internal" ? "intercompany" : "corporate"),
          }
      : {};
  return {
    ...proposed,
    ...commercialRoleDefaults,
    ...(command.extensions
      ? { relationshipProposals: command.extensions }
      : {}),
    businessPartnerCode: code,
    ...(!command.draftCapture || proposed["name"] != null ? { name } : {}),
    ...(!command.draftCapture || proposed["ownershipClass"] != null ? { ownershipClass } : {}),
    ...immutableTargetIdentity,
    ...(role
      ? {
          requestedRole: role,
          roleCode: String(
            proposed["roleCode"] ??
              proposed[role === "customer" ? "customerCode" : "supplierCode"] ??
              (targetIdentity
                ? targetIdentity[
                    role === "customer" ? "customer_code" : "supplier_code"
                  ]
                : undefined) ??
              code,
          ),
        }
      : {}),
    registrationChannel:
      command.source.kind === "import" || command.source.kind === "api"
        ? channel
        : String(proposed["registrationChannel"] ?? channel),
    ...(command.operatingOrganizationId
      ? { operatingOrganizationId: command.operatingOrganizationId }
      : {}),
    ...(command.companyCodeId ? { companyCodeId: command.companyCodeId } : {}),
    ...(command.source.kind === "mesh"
      ? {
          meshRegistrationExchangeId:
            command.source.entityId ?? command.source.projectionId,
          meshRegistrationEvidenceHash: command.source.payloadHash,
          preflight: proposed["preflight"] ?? {
            trust: "passed",
            rate: "passed",
            duplicate: "passed",
            sponsorPolicy: "approved",
          },
        }
      : {}),
  };
}

function extensionCounts(payload: Readonly<Record<string, unknown>>) {
  const extensions = object(payload["relationshipProposals"]);
  return Object.freeze({
    addresses: items(extensions["addresses"]),
    contactPersons: items(extensions["contactPersons"]),
    contactChannels: items(extensions["contactChannels"]),
    identifiers: items(extensions["identifiers"]),
    ...(items(extensions["aliases"])?{aliases:items(extensions["aliases"])}:{}),
    ...(items(extensions["governanceRelations"])?{governanceRelations:items(extensions["governanceRelations"])}:{}),
    ...(items(extensions["relationships"])?{relationships:items(extensions["relationships"])}:{}),
    taxRegistrations: items(extensions["taxRegistrations"]),
    classifications: items(extensions["classifications"]),
    certifications: items(extensions["certifications"]),
  });
}
function items(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

async function lifecycle(
  tx: Tx,
  input: {
    tenantId: string;
    caseId: string;
    action: string;
    expectedVersion: number;
    reason: string | null;
    key: string;
    actorId: string;
    correlationId?: string;
  },
) {
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

async function readWorkflow(
  tx: Tx,
  tenantId: string,
  caseId: string,
  workItemId?: string,
) {
  return (
    await sql<Row>`SELECT w.id request_id,w.definition_code,w.definition_version,w.compiled_artifact_hash,w.template_snapshot,s.id stage_id,s.quorum,i.id work_item_id,i.row_version,i.status,COALESCE(i.claimant_principal_id,i.assignee_principal_id) owner_principal_id,i.outcome,i.payload->>'submissionFingerprint' submission_fingerprint
    FROM document.workflow_request w
    JOIN document.workflow_stage s ON s.tenant_id=w.tenant_id AND s.workflow_request_id=w.id
    JOIN document.work_item i ON i.tenant_id=w.tenant_id AND i.source_entity_code='business_partner_case' AND i.source_entity_id=${caseId}::uuid AND i.payload->>'workflowStageId'=s.id::text
    WHERE w.tenant_id=${tenantId}::uuid AND w.entity_type='business_partner_case' AND w.entity_id=${caseId}
      AND (${workItemId ?? null}::uuid IS NULL OR i.id=${workItemId ?? null}::uuid)
    ORDER BY (s.status='active') DESC,(COALESCE(i.claimant_principal_id,i.assignee_principal_id)=master.current_principal_id_soft()) DESC,s.stage_no DESC,i.created_at DESC,i.id DESC LIMIT 1`.execute(
      tx,
    )
  ).rows[0];
}

async function readWorkflowStages(
  tx: Tx,
  tenantId: string,
  workflowId: string,
) {
  const rows = (
    await sql<Row>`SELECT s.id,s.stage_no,s.stage_code,s.name,s.mode,s.quorum,s.status,s.outcome,s.started_at,s.completed_at,i.id work_item_id,i.status work_item_status,i.row_version,i.assignee_principal_id,i.claimant_principal_id,i.due_at,i.priority,i.outcome work_item_outcome,i.completed_at work_item_completed_at,reviewer.name reviewer_name FROM document.workflow_stage s LEFT JOIN document.work_item i ON i.tenant_id=s.tenant_id AND i.payload->>'workflowStageId'=s.id::text LEFT JOIN master.principal reviewer ON reviewer.tenant_id=i.tenant_id AND reviewer.id=COALESCE(i.claimant_principal_id,i.assignee_principal_id) WHERE s.tenant_id=${tenantId}::uuid AND s.workflow_request_id=${workflowId}::uuid ORDER BY s.stage_no,i.created_at,i.id`.execute(
      tx,
    )
  ).rows;
  const grouped = new Map<string, { stage: Row; items: Row[] }>();
  for (const row of rows) {
    const id = text(row, "id"),
      entry = grouped.get(id) ?? { stage: row, items: [] };
    if (row["work_item_id"]) entry.items.push(row);
    grouped.set(id, entry);
  }
  return [...grouped.values()].map(({ stage, items }) => {
    const q = object(stage["quorum"]);
    return {
      id: text(stage, "id"),
      code: text(stage, "stage_code"),
      name: text(stage, "name"),
      stageNo: Number(stage["stage_no"]),
      mode: text(stage, "mode") as "serial" | "parallel",
      status: text(stage, "status"),
      ...(nullable(stage["outcome"])
        ? { outcome: text(stage, "outcome") }
        : {}),
      quorum: {
        kind: String(q["kind"] ?? q["type"] ?? "any") as
          "all" | "any" | "count" | "percentage",
        ...(q["value"] !== undefined ? { value: Number(q["value"]) } : {}),
        required: Number(q["required"] ?? 1),
        eligibleCount: Number(q["eligibleCount"] ?? items.length),
      },
      ...(nullable(stage["started_at"])
        ? { startedAt: date(stage["started_at"]) }
        : {}),
      ...(nullable(stage["completed_at"])
        ? { completedAt: date(stage["completed_at"]) }
        : {}),
      ...(typeof q["dueAt"] === "string" ? { dueAt: q["dueAt"] } : {}),
      remindersAt: Array.isArray(q["remindersAt"])
        ? q["remindersAt"].filter((v): v is string => typeof v === "string")
        : [],
      ...(typeof q["escalateAt"] === "string"
        ? { escalateAt: q["escalateAt"] }
        : {}),
      workItems: items.map((item) => {
        const outcome = object(item["work_item_outcome"]);
        return {
          id: text(item, "work_item_id"),
          status: text(item, "work_item_status"),
          rowVersion: Number(item["row_version"]),
          ...(nullable(
            item["claimant_principal_id"] ?? item["assignee_principal_id"],
          )
            ? {
                ownerPrincipalId: text(
                  item,
                  item["claimant_principal_id"]
                    ? "claimant_principal_id"
                    : "assignee_principal_id",
                ),
              }
            : {}),
          ...(nullable(item["due_at"]) ? { dueAt: date(item["due_at"]) } : {}),
          ...optionalValue(item, "reviewer_name", "ownerDisplayName"),
          priority: text(item, "priority"),
          ...(typeof outcome["decision"] === "string"
            ? { decision: outcome["decision"] }
            : {}),
          ...(nullable(item["work_item_completed_at"])
            ? { decidedAt: date(item["work_item_completed_at"]) }
            : {}),
          ...(typeof outcome["decidedBy"] === "string"
            ? { decidedBy: outcome["decidedBy"] }
            : {}),
        };
      }),
    };
  });
}

function workflowResponse(
  row: Row,
  fingerprint: string,
): BusinessPartnerRequestWorkflow & {
  readonly workItemVersion: number;
  readonly workItemStatus: string;
  readonly ownerPrincipalId: string;
} {
  return {
    requestId: text(row, "request_id"),
    cycleRunId: text(row, "request_id"),
    stageId: text(row, "stage_id"),
    workItemId: text(row, "work_item_id"),
    cycleTaskId: text(row, "work_item_id"),
    workItemVersion: Number(row["row_version"]),
    workItemStatus: text(row, "status"),
    ownerPrincipalId: text(row, "owner_principal_id"),
    definition: {
      code: text(row, "definition_code"),
      version: Number(row["definition_version"]),
      hash: text(row, "compiled_artifact_hash"),
    },
    decisionFingerprint: fingerprint,
  };
}

function workflowStages(
  definition: BusinessPartnerRequestWorkflowDefinition,
): BusinessPartnerRequestWorkflowStageDefinition[] {
  return definition.stages?.length
    ? [...definition.stages]
    : [
        {
          code: definition.stageCode,
          name: definition.stageName,
          mode: "parallel",
          quorum: { kind: "any" },
          approverPrincipalIds: definition.approverPrincipalIds,
          routed: true,
        },
      ];
}
function requiredVotes(stage: BusinessPartnerRequestWorkflowStageDefinition) {
  const eligible = stage.approverPrincipalIds.length;
  switch (stage.quorum.kind) {
    case "all":
      return eligible;
    case "count":
      return Math.min(eligible, stage.quorum.value ?? 1);
    case "percentage":
      return Math.ceil((eligible * (stage.quorum.value ?? 100)) / 100);
    default:
      return 1;
  }
}
function quorumEvidence(
  stage: BusinessPartnerRequestWorkflowStageDefinition,
  active = false,
) {
  const started = new Date(),
    at = (minutes: number) =>
      new Date(started.valueOf() + minutes * 60_000).toISOString(),
    remindersAtMinutes = (stage.remindersAtMinutes ?? []).filter(
      (value) => value > 0 && (!stage.slaMinutes || value < stage.slaMinutes),
    );
  return {
    kind: stage.quorum.kind,
    ...(stage.quorum.value !== undefined ? { value: stage.quorum.value } : {}),
    required: requiredVotes(stage),
    eligibleCount: stage.approverPrincipalIds.length,
    approverPrincipalIds: [...stage.approverPrincipalIds].sort(),
    ...(stage.escalationPrincipalIds?.length
      ? { escalationPrincipalIds: [...stage.escalationPrincipalIds].sort() }
      : {}),
    routed: stage.routed,
    ...(stage.routeEvidence ? { routeEvidence: stage.routeEvidence } : {}),
    ...(stage.slaMinutes ? { slaMinutes: stage.slaMinutes } : {}),
    remindersAtMinutes,
    ...(stage.escalateAtMinutes
      ? { escalateAtMinutes: stage.escalateAtMinutes }
      : {}),
    ...(active && stage.slaMinutes ? { dueAt: at(stage.slaMinutes) } : {}),
    remindersAt: active ? remindersAtMinutes.map(at) : [],
    ...(active && stage.escalateAtMinutes
      ? { escalateAt: at(stage.escalateAtMinutes) }
      : {}),
  };
}
function stageDefinition(
  row: Row,
): BusinessPartnerRequestWorkflowStageDefinition {
  const q = object(row["quorum"]);
  return {
    code: text(row, "stage_code"),
    name: text(row, "name"),
    mode: text(row, "mode") as "serial" | "parallel",
    quorum: {
      kind: String(q["kind"] ?? "any") as
        "all" | "any" | "count" | "percentage",
      ...(q["value"] !== undefined ? { value: Number(q["value"]) } : {}),
    },
    approverPrincipalIds: Array.isArray(q["approverPrincipalIds"])
      ? q["approverPrincipalIds"].filter(
          (v): v is string => typeof v === "string",
        )
      : [],
    routed: true,
    ...(Number(q["slaMinutes"]) > 0
      ? { slaMinutes: Number(q["slaMinutes"]) }
      : {}),
    remindersAtMinutes: Array.isArray(q["remindersAtMinutes"])
      ? q["remindersAtMinutes"].map(Number).filter(Number.isFinite)
      : [],
    ...(Number(q["escalateAtMinutes"]) > 0
      ? { escalateAtMinutes: Number(q["escalateAtMinutes"]) }
      : {}),
    ...(Array.isArray(q["escalationPrincipalIds"])
      ? {
          escalationPrincipalIds: q["escalationPrincipalIds"].filter(
            (v): v is string => typeof v === "string",
          ),
        }
      : {}),
  };
}
async function createStageWorkItems(
  tx: Tx,
  input: {
    caseEntityCode?: string;
    tenantId: string;
    requestId: string;
    workflowId: string;
    stage: Row;
    definition: BusinessPartnerRequestWorkflowStageDefinition;
    submittedBy: string;
    decisionFingerprint: string;
  },
) {
  const result: Row[] = [];
  for (const owner of [...input.definition.approverPrincipalIds].sort()) {
    const q = object(input.stage["quorum"]),
      payload = {
        workflowRequestId: input.workflowId,
        workflowStageId: text(input.stage, "id"),
        stageCode: input.definition.code,
        submissionFingerprint: input.decisionFingerprint,
        quorum: {
          kind: input.definition.quorum.kind,
          ...(input.definition.quorum.value !== undefined
            ? { value: input.definition.quorum.value }
            : {}),
          required: Number(q["required"] ?? 1),
        },
        remindersAt: q["remindersAt"] ?? [],
        ...(typeof q["escalateAt"] === "string"
          ? { escalateAt: q["escalateAt"] }
          : {}),
        ...(input.definition.escalationPrincipalIds?.[0]
          ? {
              sla_escalation_principal_id:
                input.definition.escalationPrincipalIds[0],
            }
          : {}),
        eligibilityEvidence: {
          permissionCode:
            input.caseEntityCode ===
            "master.business_partner_company_setup_request"
              ? "neon.relationship.bp_company_setup_request.decide"
              : "neon.relationship.entity_case.decide",
          approverPrincipalIds: [
            ...input.definition.approverPrincipalIds,
          ].sort(),
        },
      };
    const row = (
      await sql<Row>`INSERT INTO document.work_item(tenant_id,work_type_code,title,description,source_entity_code,source_entity_id,source_action_code,assignee_principal_id,due_at,payload,status,created_by) VALUES(${input.tenantId}::uuid,'business_partner_case.approval',${`${input.definition.name}: ${input.requestId}`},'Review pinned validation and exact-match evidence','business_partner_case',${input.requestId}::uuid,'decide',${owner}::uuid,${input.definition.slaMinutes ? sql`now()+make_interval(mins=>${input.definition.slaMinutes})` : null},${JSON.stringify(payload)}::jsonb,'open',${input.submittedBy}::uuid) RETURNING *`.execute(
        tx,
      )
    ).rows[0];
    if (!row) throw new Error("BUSINESS_PARTNER_WORK_ITEM_CREATE_FAILED");
    result.push(row);
    await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,payload,created_by) VALUES(${input.tenantId}::uuid,'workflow','workflow.work_item.created',${`business-partner-stage:${input.workflowId}:${text(input.stage, "id")}:${owner}`},'business_partner_case',${input.requestId}::uuid,'workflow.work_item',${text(row, "id")}::uuid,${input.submittedBy}::uuid,'business-partner.workflow',${JSON.stringify({ work_item_id: text(row, "id"), title: String(row["title"]), status: "open", priority: "normal", due_at: nullable(row["due_at"]) ?? null, stage_code: input.definition.code, entity_type: "business_partner_case", entity_id: input.requestId, recipient_principal_ids: [owner] })}::jsonb,${input.submittedBy}::uuid) ON CONFLICT (tenant_id,event_key) WHERE event_key IS NOT NULL DO NOTHING`.execute(
      tx,
    );
  }
  return result;
}
async function finishWorkflow(
  tx: Tx,
  input: {
    tenantId: string;
    decidedBy: string;
    decisionFingerprint: string;
    command: {
      workflowRequestId: string;
      workItemId: string;
      idempotencyKey: string;
      reason: string;
    };
  },
  status: "approved" | "rejected" | "cancelled",
) {
  const decision =
    status === "approved"
      ? "approve"
      : status === "rejected"
        ? "reject"
        : "return";
  await sql`UPDATE document.workflow_request SET status=${status}::document.workflow_request_status_d,decision=${decision}::document.workflow_decision_d,decided_at=now(),decided_by=${input.decidedBy}::uuid,reason=${input.command.reason},metadata=metadata||${JSON.stringify({ decisionIdempotencyKey: input.command.idempotencyKey, decisionFingerprint: input.decisionFingerprint, decision, workItemId: input.command.workItemId })}::jsonb,updated_by=${input.decidedBy}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.command.workflowRequestId}::uuid`.execute(
    tx,
  );
}

async function executeCaseCommand<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "P0002")
      throw new MasterDataError(
        404,
        "BUSINESS_PARTNER_CASE_NOT_FOUND",
        "Business Partner case was not found",
      );
    if (code === "42501")
      throw new MasterDataError(
        403,
        "BUSINESS_PARTNER_CASE_AUTHORITY_DENIED",
        "Business Partner case authority denied the command",
      );
    if (code === "40001")
      throw new MasterDataError(
        409,
        "BUSINESS_PARTNER_CASE_VERSION_CONFLICT",
        "Business Partner case version is stale",
      );
    if (["23503", "23505", "23514", "55000"].includes(code))
      throw new MasterDataError(
        409,
        "BUSINESS_PARTNER_CASE_COMMAND_CONFLICT",
        error instanceof Error
          ? error.message
          : "Business Partner case command conflict",
      );
    throw error;
  }
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function object(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
function preserved(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
) {
  return Object.fromEntries(
    keys.flatMap((key) =>
      value[key] === undefined ? [] : [[key, value[key]]],
    ),
  );
}
function text(row: Row, key: string) {
  if (row[key] == null)
    throw new Error(`BUSINESS_PARTNER_CASE_ROW_INVALID:${key}`);
  return String(row[key]);
}
function nullable(value: unknown) {
  return value == null || value === "" ? undefined : String(value);
}
function date(value: unknown) {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.valueOf()))
    throw new Error("BUSINESS_PARTNER_CASE_ROW_INVALID:date");
  return parsed.toISOString();
}
function dateOnly(value: unknown) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}
function optionalValue(row: Row, column: string, key: string) {
  const value = nullable(row[column]);
  return value ? { [key]: value } : {};
}
function optionalFrom(
  row: Readonly<Record<string, unknown>>,
  column: string,
  key: string,
) {
  const value = nullable(row[column]);
  return value ? { [key]: value } : {};
}
function optionalDate(row: Row, column: string, key: string, only = false) {
  return row[column] == null
    ? {}
    : { [key]: only ? dateOnly(row[column]) : date(row[column]) };
}
