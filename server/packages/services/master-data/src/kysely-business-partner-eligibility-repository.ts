import { sql } from "kysely";
import type {
  BusinessPartnerEligibilityRepository,
  BusinessPartnerQualification,
  CustomerAccountDesignation,
  CustomerCreditReview,
  PartnerEligibilityDecision,
  PartnerEligibilityReason,
  SupplierActivationEvidence,
  SupplierPreferenceDesignation,
} from "@athyper/server-contract-master-data";

type Tx = { executeQuery?: unknown };
type QualificationRow = {
  id: string;
  tenant_id: string;
  business_partner_id: string;
  partner_role: "supplier" | "customer";
  role_id: string;
  operating_organization_id: string | null;
  company_code_id: string | null;
  commodity_capability_id: string | null;
  qualification_type_code: string;
  decision: BusinessPartnerQualification["decision"];
  decision_reason: string | null;
  risk_assessment_id: string | null;
  effective_from: string | null;
  effective_until: string | null;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  approved_at: Date | string | null;
  approved_by: string | null;
  next_review_at: string | null;
  row_version: string | number;
  created_at: Date | string;
  created_by: string;
  updated_at: Date | string | null;
  updated_by: string | null;
  decision_idempotency_key?: string | null;
  decision_fingerprint?: string | null;
};
type PreferenceRow = {
  id: string;
  tenant_id: string;
  business_partner_id: string;
  supplier_id: string;
  operating_organization_id: string;
  company_code_id: string | null;
  commodity_category_id: string | null;
  effective_from: string;
  effective_until: string | null;
  rationale: string;
  status: SupplierPreferenceDesignation["status"];
  decision_reason: string | null;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  approved_at: Date | string | null;
  approved_by: string | null;
  decision_idempotency_key: string | null;
  decision_fingerprint: string | null;
  revocation_reason: string | null;
  revoked_at: Date | string | null;
  revoked_by: string | null;
  revocation_idempotency_key: string | null;
  revocation_fingerprint: string | null;
  row_version: string | number;
  created_at: Date | string;
  created_by: string;
  updated_at: Date | string | null;
  updated_by: string | null;
};
type ActivationRow = {
  id: string;
  tenant_id: string;
  business_partner_id: string;
  supplier_id: string;
  operating_organization_id: string;
  company_code_id: string | null;
  business_date: string;
  prior_status: string;
  resulting_status: "active";
  readiness_fingerprint: string;
  readiness_evidence: PartnerEligibilityDecision;
  idempotency_key: string;
  command_fingerprint: string;
  activated_at: Date | string;
  activated_by: string;
};
type CreditRow = {
  id: string;
  tenant_id: string;
  business_partner_id: string;
  customer_id: string;
  operating_organization_id: string;
  company_code_id: string;
  review_type_code: string;
  requested_credit_limit: string | number | null;
  requested_currency_code: string | null;
  approved_credit_limit: string | number | null;
  approved_currency_code: string | null;
  risk_class_code: string | null;
  decision: CustomerCreditReview["decision"];
  decision_reason: string | null;
  conditions: readonly Readonly<Record<string, unknown>>[];
  effective_from: string;
  effective_until: string | null;
  idempotency_key: string;
  decision_idempotency_key: string | null;
  decision_fingerprint: string | null;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  approved_at: Date | string | null;
  approved_by: string | null;
  row_version: string | number;
  created_at: Date | string;
  created_by: string;
  updated_at: Date | string | null;
  updated_by: string | null;
};
type DesignationRow = {
  id: string;
  tenant_id: string;
  business_partner_id: string;
  customer_id: string;
  operating_organization_id: string;
  company_code_id: string | null;
  country_code: string | null;
  channel_code: string | null;
  designation_type: CustomerAccountDesignation["designationType"];
  priority_tier: number | null;
  effective_from: string;
  effective_until: string | null;
  rationale: string;
  status: CustomerAccountDesignation["status"];
  decision_reason: string | null;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  approved_at: Date | string | null;
  approved_by: string | null;
  revoked_at: Date | string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  row_version: string | number;
  created_at: Date | string;
  created_by: string;
  updated_at: Date | string | null;
  updated_by: string | null;
};

const qualificationReadColumns =
  sql.raw(`qualification.id,qualification.tenant_id,qualification.business_partner_id,qualification.partner_role,
  (SELECT role_record.id FROM (SELECT id,tenant_id,business_partner_id,'supplier'::text partner_role FROM master.supplier UNION ALL SELECT id,tenant_id,business_partner_id,'customer'::text partner_role FROM master.customer) role_record WHERE role_record.tenant_id=qualification.tenant_id AND role_record.business_partner_id=qualification.business_partner_id AND role_record.partner_role=qualification.partner_role::text LIMIT 1) role_id,
  (SELECT scope.operating_organization_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=qualification.tenant_id AND scope.qualification_id=qualification.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' ORDER BY scope.scope_group,scope.id LIMIT 1) operating_organization_id,
  (SELECT scope.company_code_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=qualification.tenant_id AND scope.qualification_id=qualification.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' ORDER BY scope.scope_group,scope.id LIMIT 1) company_code_id,
  (SELECT capability.id FROM control.business_partner_decision_scope scope JOIN master.business_partner_commodity_capability capability ON capability.tenant_id=qualification.tenant_id AND capability.business_partner_id=qualification.business_partner_id AND capability.partner_role=qualification.partner_role AND capability.commodity_category_id=scope.commodity_category_id WHERE scope.tenant_id=qualification.tenant_id AND scope.qualification_id=qualification.id AND scope.scope_kind='commodity_category' AND scope.scope_mode='include' ORDER BY capability.effective_from DESC,capability.id LIMIT 1) commodity_capability_id,
  qualification.qualification_type_code,qualification.decision,qualification.decision_reason,qualification.risk_assessment_id,qualification.effective_from,qualification.effective_until,qualification.reviewed_at,qualification.reviewed_by,qualification.approved_at,qualification.approved_by,qualification.next_review_at,qualification.decision_idempotency_key,qualification.decision_fingerprint,qualification.row_version,qualification.created_at,qualification.created_by,qualification.updated_at,qualification.updated_by`);
const preferenceReadColumns =
  sql.raw(`preference.id,preference.tenant_id,preference.business_partner_id,preference.supplier_id,
  (SELECT scope.operating_organization_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' ORDER BY scope.scope_group,scope.id LIMIT 1) operating_organization_id,
  (SELECT scope.company_code_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' ORDER BY scope.scope_group,scope.id LIMIT 1) company_code_id,
  (SELECT scope.commodity_category_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='commodity_category' AND scope.scope_mode='include' ORDER BY scope.scope_group,scope.id LIMIT 1) commodity_category_id,
  preference.effective_from,preference.effective_until,preference.rationale,preference.status,preference.decision_reason,preference.reviewed_at,preference.reviewed_by,preference.approved_at,preference.approved_by,preference.decision_idempotency_key,preference.decision_fingerprint,preference.revocation_reason,preference.revoked_at,preference.revoked_by,preference.revocation_idempotency_key,preference.revocation_fingerprint,preference.row_version,preference.created_at,preference.created_by,preference.updated_at,preference.updated_by`);
const creditReadColumns =
  sql.raw(`review.id,review.tenant_id,review.business_partner_id,review.customer_id,
  (SELECT scope.operating_organization_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' ORDER BY scope.scope_group,scope.id LIMIT 1) operating_organization_id,
  (SELECT scope.company_code_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' ORDER BY scope.scope_group,scope.id LIMIT 1) company_code_id,
  review.review_type_code,review.requested_credit_limit,review.requested_currency_code,review.approved_credit_limit,review.approved_currency_code,review.risk_class_code,review.decision,review.decision_reason,review.conditions,review.effective_from,review.effective_until,review.idempotency_key,review.decision_idempotency_key,review.decision_fingerprint,review.reviewed_at,review.reviewed_by,review.approved_at,review.approved_by,review.row_version,review.created_at,review.created_by,review.updated_at,review.updated_by`);
const designationReadColumns =
  sql.raw(`designation.id,designation.tenant_id,designation.business_partner_id,designation.customer_id,
  (SELECT scope.operating_organization_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=designation.tenant_id AND scope.customer_designation_id=designation.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' ORDER BY scope.scope_group,scope.id LIMIT 1) operating_organization_id,
  (SELECT scope.company_code_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=designation.tenant_id AND scope.customer_designation_id=designation.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' ORDER BY scope.scope_group,scope.id LIMIT 1) company_code_id,
  designation.country_code,designation.channel_code,designation.designation_type,designation.priority_tier,designation.effective_from,designation.effective_until,designation.rationale,designation.status,designation.decision_reason,designation.reviewed_at,designation.reviewed_by,designation.approved_at,designation.approved_by,designation.revoked_at,designation.revoked_by,designation.revocation_reason,designation.row_version,designation.created_at,designation.created_by,designation.updated_at,designation.updated_by`);

export class KyselyBusinessPartnerEligibilityRepository implements BusinessPartnerEligibilityRepository<Tx> {
  async findCustomerDesignationByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Tx,
  ) {
    const row = (
      await sql<DesignationRow>`SELECT ${designationReadColumns} FROM control.customer_account_designation designation WHERE designation.tenant_id=${tenantId}::uuid AND designation.idempotency_key=${idempotencyKey}`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? mapDesignation(row) : null;
  }
  async getCustomerDesignation(
    tenantId: string,
    designationId: string,
    transaction: Tx,
  ) {
    const row = (
      await sql<DesignationRow>`SELECT ${designationReadColumns} FROM control.customer_account_designation designation WHERE designation.tenant_id=${tenantId}::uuid AND designation.id=${designationId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? mapDesignation(row) : null;
  }
  async createCustomerDesignation(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["createCustomerDesignation"]
    >[0],
    transaction: Tx,
  ) {
    const created = (
      await sql<{
        aggregate_id: string;
      }>`SELECT aggregate_id FROM control.command_create_business_partner_decision(${input.tenantId}::uuid,'customer_designation',${input.businessPartnerId}::uuid,'customer',${input.customerId}::uuid,${input.operatingOrganizationId}::uuid,${input.companyCodeId ?? null}::uuid,NULL::uuid,${JSON.stringify({ countryCode: input.countryCode, channelCode: input.channelCode, designationType: input.designationType, priorityTier: input.priorityTier, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, rationale: input.rationale })}::jsonb,${input.idempotencyKey},${input.createdBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!created) throw new Error("CUSTOMER_DESIGNATION_CREATE_FAILED");
    const row = (
      await sql<DesignationRow>`SELECT ${designationReadColumns} FROM control.customer_account_designation designation WHERE designation.tenant_id=${input.tenantId}::uuid AND designation.id=${created.aggregate_id}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!row) throw new Error("CUSTOMER_DESIGNATION_READBACK_FAILED");
    return mapDesignation(row);
  }
  async decideCustomerDesignation(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["decideCustomerDesignation"]
    >[0],
    transaction: Tx,
  ) {
    const command = (
      await sql<{
        replayed: boolean;
      }>`SELECT replayed FROM control.command_business_partner_decision(${input.tenantId}::uuid,'customer_designation',${input.designationId}::uuid,${input.decision},${input.expectedVersion}::bigint,${input.reason},${input.idempotencyKey},${input.decisionFingerprint},'{}'::jsonb,${input.decidedBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!command) return null;
    const row = (
      await sql<DesignationRow>`SELECT ${designationReadColumns} FROM control.customer_account_designation designation WHERE designation.tenant_id=${input.tenantId}::uuid AND designation.id=${input.designationId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    return row
      ? { designation: mapDesignation(row), replayed: command.replayed }
      : null;
  }
  async listCustomerDesignations(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["listCustomerDesignations"]
    >[0],
    transaction: Tx,
  ) {
    const rows = (
      await sql<DesignationRow>`SELECT ${designationReadColumns} FROM control.customer_account_designation designation WHERE designation.tenant_id=${input.tenantId}::uuid AND designation.business_partner_id=${input.businessPartnerId}::uuid AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=designation.tenant_id AND scope.customer_designation_id=designation.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' AND scope.operating_organization_id=${input.operatingOrganizationId}::uuid) AND (${input.companyCodeId ?? null}::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=designation.tenant_id AND scope.customer_designation_id=designation.id AND scope.scope_kind='company_code') OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=designation.tenant_id AND scope.customer_designation_id=designation.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId ?? null}::uuid)) ORDER BY designation.created_at DESC,designation.id DESC`.execute(
        transaction as never,
      )
    ).rows;
    return rows.map(mapDesignation);
  }
  async findCustomerCreditReviewByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Tx,
  ) {
    const row = (
      await sql<CreditRow>`SELECT ${creditReadColumns} FROM control.customer_credit_review review WHERE review.tenant_id=${tenantId}::uuid AND review.idempotency_key=${idempotencyKey}`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? mapCredit(row) : null;
  }
  async getCustomerCreditReview(
    tenantId: string,
    reviewId: string,
    transaction: Tx,
  ) {
    const row = (
      await sql<CreditRow>`SELECT ${creditReadColumns} FROM control.customer_credit_review review WHERE review.tenant_id=${tenantId}::uuid AND review.id=${reviewId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? mapCredit(row) : null;
  }
  async createCustomerCreditReview(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["createCustomerCreditReview"]
    >[0],
    transaction: Tx,
  ) {
    const created = (
      await sql<{
        aggregate_id: string;
      }>`SELECT aggregate_id FROM control.command_create_business_partner_decision(${input.tenantId}::uuid,'customer_credit_review',${input.businessPartnerId}::uuid,'customer',${input.customerId}::uuid,${input.operatingOrganizationId}::uuid,${input.companyCodeId}::uuid,NULL::uuid,${JSON.stringify({ reviewTypeCode: input.reviewTypeCode, requestedCreditLimit: input.requestedCreditLimit, requestedCurrencyCode: input.requestedCurrencyCode, riskClassCode: input.riskClassCode, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil })}::jsonb,${input.idempotencyKey},${input.createdBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!created) throw new Error("CUSTOMER_CREDIT_SCOPE_INVALID");
    const row = (
      await sql<CreditRow>`SELECT ${creditReadColumns} FROM control.customer_credit_review review WHERE review.tenant_id=${input.tenantId}::uuid AND review.id=${created.aggregate_id}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!row) throw new Error("CUSTOMER_CREDIT_SCOPE_INVALID");
    return mapCredit(row);
  }
  async decideCustomerCreditReview(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["decideCustomerCreditReview"]
    >[0],
    transaction: Tx,
  ) {
    const command = (
      await sql<{
        replayed: boolean;
      }>`SELECT replayed FROM control.command_business_partner_decision(${input.tenantId}::uuid,'customer_credit_review',${input.reviewId}::uuid,${input.decision},${input.expectedVersion}::bigint,${input.reason},${input.idempotencyKey},${input.decisionFingerprint},${JSON.stringify({ approvedCreditLimit: input.approvedCreditLimit, approvedCurrencyCode: input.approvedCurrencyCode, conditions: input.conditions ?? [] })}::jsonb,${input.decidedBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!command) return null;
    const row = (
      await sql<CreditRow>`SELECT ${creditReadColumns} FROM control.customer_credit_review review WHERE review.tenant_id=${input.tenantId}::uuid AND review.id=${input.reviewId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? { review: mapCredit(row), replayed: command.replayed } : null;
  }
  async listCustomerCreditReviews(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["listCustomerCreditReviews"]
    >[0],
    transaction: Tx,
  ) {
    const rows = (
      await sql<CreditRow>`SELECT ${creditReadColumns} FROM control.customer_credit_review review WHERE review.tenant_id=${input.tenantId}::uuid AND review.business_partner_id=${input.businessPartnerId}::uuid AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' AND scope.operating_organization_id=${input.operatingOrganizationId}::uuid) AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId}::uuid) ORDER BY review.created_at DESC,review.id DESC`.execute(
        transaction as never,
      )
    ).rows;
    return rows.map(mapCredit);
  }
  async transitionCustomer(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["transitionCustomer"]
    >[0],
    transaction: Tx,
  ) {
    const row = (
      await sql<{
        customer_id: string;
        status: "prospect" | "active" | "suspended" | "inactive" | "archived";
        resulting_version: string | number;
        event_id: string;
        replayed: boolean;
      }>`SELECT customer_id::text,status,resulting_version,event_id::text,replayed FROM control.command_customer_lifecycle(${input.tenantId}::uuid,${input.businessPartnerId}::uuid,${input.customerId}::uuid,${input.operatingOrganizationId}::uuid,${input.companyCodeId}::uuid,${input.action},${input.expectedVersion}::bigint,${input.reasonCode},${input.businessDate}::date,${input.readiness?.decisionFingerprint ?? null},${JSON.stringify(input.readiness ?? {})}::jsonb,${input.idempotencyKey},${input.actorId}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    return row
      ? {
          customerId: row.customer_id,
          status: row.status,
          resultingVersion: Number(row.resulting_version),
          eventId: row.event_id,
          replayed: row.replayed,
          ...(input.readiness ? { readiness: input.readiness } : {}),
        }
      : null;
  }
  async findSupplierActivationByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Tx,
  ) {
    const row = (
      await sql<ActivationRow>`SELECT * FROM document.supplier_activation_evidence WHERE tenant_id=${tenantId}::uuid AND idempotency_key=${idempotencyKey}`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? mapActivation(row) : null;
  }
  async activateSupplier(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["activateSupplier"]
    >[0],
    transaction: Tx,
  ) {
    const supplier = (
      await sql<{
        id: string;
        status: string;
        record_version: string | number;
      }>`SELECT id::text,status::text,record_version FROM master.supplier WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND status IN('onboarding','suspended','inactive') FOR UPDATE`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!supplier) return null;
    const updated = (
      await sql`SELECT * FROM control.command_business_partner_lifecycle(${input.tenantId}::uuid,'supplier',${supplier.id}::uuid,'active',${Number(supplier.record_version)}::bigint,'SUPPLIER_READINESS_APPROVED',${input.idempotencyKey},${input.activatedBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!updated) return null;
    const row = (
      await sql<ActivationRow>`INSERT INTO document.supplier_activation_evidence(tenant_id,business_partner_id,supplier_id,operating_organization_id,company_code_id,business_date,prior_status,resulting_status,readiness_fingerprint,readiness_evidence,idempotency_key,command_fingerprint,activated_by) VALUES(${input.tenantId}::uuid,${input.businessPartnerId}::uuid,${supplier.id}::uuid,${input.operatingOrganizationId}::uuid,${input.companyCodeId ?? null}::uuid,${input.businessDate}::date,${supplier.status},'active',${input.readiness.decisionFingerprint},${JSON.stringify(input.readiness)}::jsonb,${input.idempotencyKey},${input.commandFingerprint},${input.activatedBy}::uuid) RETURNING *`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? mapActivation(row) : null;
  }
  async expireQualifications(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["expireQualifications"]
    >[0],
    transaction: Tx,
  ) {
    const due = (
      await sql<QualificationRow>`SELECT ${qualificationReadColumns} FROM control.business_partner_qualification qualification WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.decision IN('approved','conditional') AND ((qualification.effective_until IS NOT NULL AND qualification.effective_until<=${input.businessDate}::date) OR (qualification.next_review_at IS NOT NULL AND qualification.next_review_at<${input.businessDate}::date)) ORDER BY COALESCE(qualification.effective_until,qualification.next_review_at),qualification.id FOR UPDATE OF qualification SKIP LOCKED LIMIT ${input.limit}`.execute(
        transaction as never,
      )
    ).rows;
    const expired: BusinessPartnerQualification[] = [];
    for (const value of due) {
      const key = `qualification-expiry:${value.id}:${input.businessDate}`;
      const command = (
        await sql`SELECT * FROM control.command_business_partner_decision(${input.tenantId}::uuid,'qualification',${value.id}::uuid,'expired',${Number(value.row_version)}::bigint,'QUALIFICATION_EVIDENCE_EXPIRED',${key},${String(value.decision_fingerprint)},${JSON.stringify({ businessDate: input.businessDate })}::jsonb,${input.actorId}::uuid)`.execute(
          transaction as never,
        )
      ).rows[0];
      if (command) {
        const row = (
          await sql<QualificationRow>`SELECT ${qualificationReadColumns} FROM control.business_partner_qualification qualification WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.id=${value.id}::uuid`.execute(
            transaction as never,
          )
        ).rows[0];
        if (row) expired.push(mapQualification(row));
      }
    }
    return expired;
  }
  async findPreferenceByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Tx,
  ) {
    const row = (
      await sql<PreferenceRow>`SELECT ${preferenceReadColumns} FROM control.supplier_preference_designation preference WHERE preference.tenant_id=${tenantId}::uuid AND preference.idempotency_key=${idempotencyKey}`.execute(
        transaction as never,
      )
    ).rows[0];
    return row
      ? mapPreference(row, new Date().toISOString().slice(0, 10))
      : null;
  }
  async getPreference(
    tenantId: string,
    preferenceId: string,
    businessDate: string,
    transaction: Tx,
  ) {
    const row = (
      await sql<PreferenceRow>`SELECT ${preferenceReadColumns} FROM control.supplier_preference_designation preference WHERE preference.tenant_id=${tenantId}::uuid AND preference.id=${preferenceId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? mapPreference(row, businessDate) : null;
  }
  async createPreference(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["createPreference"]
    >[0],
    transaction: Tx,
  ) {
    const created = (
      await sql<{
        aggregate_id: string;
      }>`SELECT aggregate_id FROM control.command_create_business_partner_decision(${input.tenantId}::uuid,'supplier_preference',${input.businessPartnerId}::uuid,'supplier',${input.supplierId}::uuid,${input.operatingOrganizationId}::uuid,${input.companyCodeId ?? null}::uuid,${input.commodityCategoryId ?? null}::uuid,${JSON.stringify({ effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, rationale: input.rationale })}::jsonb,${input.idempotencyKey},${input.createdBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!created) throw new Error("Supplier preference insert returned no row");
    const row = (
      await sql<PreferenceRow>`SELECT ${preferenceReadColumns} FROM control.supplier_preference_designation preference WHERE preference.tenant_id=${input.tenantId}::uuid AND preference.id=${created.aggregate_id}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!row) throw new Error("Supplier preference readback returned no row");
    return mapPreference(row, input.effectiveFrom);
  }
  async decidePreference(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["decidePreference"]
    >[0],
    transaction: Tx,
  ) {
    const command = (
      await sql<{
        replayed: boolean;
      }>`SELECT replayed FROM control.command_business_partner_decision(${input.tenantId}::uuid,'supplier_preference',${input.preferenceId}::uuid,${input.decision},${input.expectedVersion}::bigint,${input.reason},${input.idempotencyKey},${input.decisionFingerprint},'{}'::jsonb,${input.decidedBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!command) return null;
    const row = (
      await sql<PreferenceRow>`SELECT ${preferenceReadColumns} FROM control.supplier_preference_designation preference WHERE preference.tenant_id=${input.tenantId}::uuid AND preference.id=${input.preferenceId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    return row
      ? {
          preference: mapPreference(row, row.effective_from),
          replayed: command.replayed,
        }
      : null;
  }
  async revokePreference(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["revokePreference"]
    >[0],
    transaction: Tx,
  ) {
    const command = (
      await sql<{
        replayed: boolean;
      }>`SELECT replayed FROM control.command_business_partner_decision(${input.tenantId}::uuid,'supplier_preference',${input.preferenceId}::uuid,'revoked',${input.expectedVersion}::bigint,${input.reason},${input.idempotencyKey},${input.revocationFingerprint},'{}'::jsonb,${input.revokedBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!command) return null;
    const row = (
      await sql<PreferenceRow>`SELECT ${preferenceReadColumns} FROM control.supplier_preference_designation preference WHERE preference.tenant_id=${input.tenantId}::uuid AND preference.id=${input.preferenceId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    return row
      ? {
          preference: mapPreference(row, new Date().toISOString().slice(0, 10)),
          replayed: command.replayed,
        }
      : null;
  }
  async listPreferences(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["listPreferences"]
    >[0],
    transaction: Tx,
  ) {
    const rows = (
      await sql<PreferenceRow>`SELECT ${preferenceReadColumns} FROM control.supplier_preference_designation preference WHERE preference.tenant_id=${input.tenantId}::uuid AND preference.business_partner_id=${input.businessPartnerId}::uuid AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' AND scope.operating_organization_id=${input.operatingOrganizationId}::uuid) AND(NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='company_code' AND scope.scope_mode='include') OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId ?? null}::uuid)) AND(NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='commodity_category' AND scope.scope_mode='include') OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='commodity_category' AND scope.scope_mode='include' AND scope.commodity_category_id=${input.commodityCategoryId ?? null}::uuid)) ORDER BY preference.effective_from DESC,preference.created_at DESC,preference.id DESC`.execute(
        transaction as never,
      )
    ).rows;
    return rows.map((row) => mapPreference(row, input.businessDate));
  }
  async findQualificationByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Tx,
  ) {
    const row = (
      await sql<QualificationRow>`SELECT ${qualificationReadColumns} FROM control.business_partner_qualification qualification WHERE qualification.tenant_id=${tenantId}::uuid AND qualification.idempotency_key=${idempotencyKey}`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? mapQualification(row) : null;
  }
  async getQualification(
    tenantId: string,
    qualificationId: string,
    transaction: Tx,
  ) {
    const row = (
      await sql<QualificationRow>`SELECT ${qualificationReadColumns} FROM control.business_partner_qualification qualification WHERE qualification.tenant_id=${tenantId}::uuid AND qualification.id=${qualificationId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    return row ? mapQualification(row) : null;
  }
  async qualificationTargetReady(input: {tenantId: string; businessPartnerId: string; operatingOrganizationId: string; companyCodeId?: string}, transaction: Tx): Promise<boolean> {
    // No command function or evidence write: inspect the commercial parent and
    // active proposed catalog scope. Specific role/type/content validation is
    // still performed by the actual create command before materialization.
    const result = await sql<{ready: boolean}>`SELECT EXISTS(
      SELECT 1 FROM master.business_partner bp
      JOIN master.operating_organization org ON org.tenant_id=bp.tenant_id
        AND org.id=${input.operatingOrganizationId}::uuid AND org.status='active'
      WHERE bp.tenant_id=${input.tenantId}::uuid AND bp.id=${input.businessPartnerId}::uuid
      AND (EXISTS(SELECT 1 FROM master.supplier r WHERE r.tenant_id=bp.tenant_id AND r.business_partner_id=bp.id)
        OR EXISTS(SELECT 1 FROM master.customer r WHERE r.tenant_id=bp.tenant_id AND r.business_partner_id=bp.id))
      AND (${input.companyCodeId ?? null}::uuid IS NULL OR EXISTS(
        SELECT 1 FROM master.company_code company
        JOIN master.operating_organization_company_assignment assignment
          ON assignment.tenant_id=company.tenant_id AND assignment.company_code_id=company.id
        WHERE company.tenant_id=bp.tenant_id AND company.id=${input.companyCodeId ?? null}::uuid
          AND company.status='active' AND company.is_active
          AND assignment.operating_organization_id=org.id AND assignment.status='active'
          AND assignment.effective_from<=current_date
          AND (assignment.effective_until IS NULL OR assignment.effective_until>current_date)
      ))) AS ready`.execute(transaction as never);
    return result.rows[0]?.ready === true;
  }
  async createQualification(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["createQualification"]
    >[0],
    transaction: Tx,
  ) {
    const role = (
      await sql<{
        id: string;
      }>`SELECT id::text FROM ${sql.raw(input.partnerRole === "supplier" ? "master.supplier" : "master.customer")} WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND (${input.roleId ?? null}::uuid IS NULL OR id=${input.roleId ?? null}::uuid) LIMIT 1`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!role) throw new Error("Qualification commercial role was not found");
    const created = (
      await sql<{
        aggregate_id: string;
      }>`SELECT aggregate_id FROM control.command_create_business_partner_decision(${input.tenantId}::uuid,'qualification',${input.businessPartnerId}::uuid,${input.partnerRole},${role.id}::uuid,${input.operatingOrganizationId}::uuid,${input.companyCodeId ?? null}::uuid,(SELECT commodity_category_id FROM master.business_partner_commodity_capability WHERE tenant_id=${input.tenantId}::uuid AND id=${input.commodityCapabilityId ?? null}::uuid),${JSON.stringify({ qualificationTypeCode: input.qualificationTypeCode, riskAssessmentId: input.riskAssessmentId, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, nextReviewAt: input.nextReviewAt })}::jsonb,${input.idempotencyKey},${input.createdBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!created) throw new Error("Qualification insert returned no row");
    const row = (
      await sql<QualificationRow>`SELECT ${qualificationReadColumns} FROM control.business_partner_qualification qualification WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.id=${created.aggregate_id}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!row) throw new Error("Qualification readback returned no row");
    return mapQualification(row);
  }
  async decideQualification(
    input: Parameters<
      BusinessPartnerEligibilityRepository<Tx>["decideQualification"]
    >[0],
    transaction: Tx,
  ) {
    const command = (
      await sql<{
        replayed: boolean;
      }>`SELECT replayed FROM control.command_business_partner_decision(${input.tenantId}::uuid,'qualification',${input.qualificationId}::uuid,${input.decision},${input.expectedVersion}::bigint,${input.reason},${input.idempotencyKey},${input.decisionFingerprint},'{}'::jsonb,${input.decidedBy}::uuid)`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!command) return null;
    const row = (
      await sql<QualificationRow>`SELECT ${qualificationReadColumns} FROM control.business_partner_qualification qualification WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.id=${input.qualificationId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!row) return null;
    return { qualification: mapQualification(row), replayed: command.replayed };
  }
  async resolve(
    input: Parameters<BusinessPartnerEligibilityRepository<Tx>["resolve"]>[0],
    transaction: Tx,
  ) {
    const partner = (
      await sql<{
        status: string;
        role_id: string | null;
        role_status: string | null;
        assignment_id: string | null;
        assignment_status: string | null;
        company_compatible: boolean;
        profile_id: string | null;
        profile_status: string | null;
        payment_term_id: string | null;
        bank_link_id: string | null;
      }>`SELECT bp.status,role_record.id::text role_id,role_record.status role_status,assignment.id::text assignment_id,assignment.status::text assignment_status,CASE WHEN ${input.companyCodeId ?? null}::uuid IS NULL THEN true ELSE EXISTS(SELECT 1 FROM master.operating_organization_company_assignment edge WHERE edge.tenant_id=bp.tenant_id AND edge.operating_organization_id=${input.operatingOrganizationId}::uuid AND edge.company_code_id=${input.companyCodeId ?? null}::uuid AND edge.status='active' AND edge.effective_from<=${input.businessDate}::date AND (edge.effective_until IS NULL OR edge.effective_until>${input.businessDate}::date)) END company_compatible,profile.id::text profile_id,profile.status profile_status,profile.payment_term_id::text,profile.preferred_remittance_bank_link_id::text bank_link_id FROM master.business_partner bp LEFT JOIN LATERAL (SELECT id,status::text status FROM master.supplier WHERE ${input.role}='supplier' AND tenant_id=bp.tenant_id AND business_partner_id=bp.id UNION ALL SELECT id,status::text status FROM master.customer WHERE ${input.role}='customer' AND tenant_id=bp.tenant_id AND business_partner_id=bp.id LIMIT 1) role_record ON true LEFT JOIN master.business_partner_operating_organization_assignment assignment ON assignment.tenant_id=bp.tenant_id AND assignment.business_partner_id=bp.id AND assignment.operating_organization_id=${input.operatingOrganizationId}::uuid AND assignment.partner_role=${input.role}::master.partner_role_d AND assignment.effective_from<=${input.businessDate}::date AND (assignment.effective_until IS NULL OR assignment.effective_until>${input.businessDate}::date) LEFT JOIN LATERAL (SELECT id,status::text status,payment_term_id,preferred_remittance_bank_link_id FROM master.company_code_supplier_profile WHERE ${input.role}='supplier' AND tenant_id=bp.tenant_id AND supplier_id=role_record.id AND company_code_id=${input.companyCodeId ?? null}::uuid UNION ALL SELECT id,status::text status,payment_term_id,NULL::uuid preferred_remittance_bank_link_id FROM master.company_code_customer_profile WHERE ${input.role}='customer' AND tenant_id=bp.tenant_id AND customer_id=role_record.id AND company_code_id=${input.companyCodeId ?? null}::uuid LIMIT 1) profile ON ${input.companyCodeId ?? null}::uuid IS NOT NULL WHERE bp.tenant_id=${input.tenantId}::uuid AND bp.id=${input.businessPartnerId}::uuid`.execute(
        transaction as never,
      )
    ).rows[0];
    if (!partner) return null;
    const qualificationRows = (
      await sql<QualificationRow>`SELECT ${qualificationReadColumns} FROM control.business_partner_qualification qualification WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.business_partner_id=${input.businessPartnerId}::uuid AND qualification.partner_role=${input.role}::master.partner_role_d AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=qualification.tenant_id AND scope.qualification_id=qualification.id AND scope.scope_mode='include' AND(scope.scope_kind='global' OR(scope.scope_kind='operating_organization' AND scope.operating_organization_id=${input.operatingOrganizationId}::uuid))) AND(NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=qualification.tenant_id AND scope.qualification_id=qualification.id AND scope.scope_kind='company_code' AND scope.scope_mode='include') OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=qualification.tenant_id AND scope.qualification_id=qualification.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId ?? null}::uuid)) ORDER BY qualification.created_at DESC,qualification.id DESC`.execute(
        transaction as never,
      )
    ).rows;
    const qualifications = qualificationRows.map(mapQualification);
    const active = qualifications.find(
      (q) =>
        (q.decision === "approved" || q.decision === "conditional") &&
        (!q.effectiveFrom || q.effectiveFrom <= input.businessDate) &&
        (!q.effectiveUntil || q.effectiveUntil > input.businessDate) &&
        (!q.nextReviewAt || q.nextReviewAt >= input.businessDate),
    );
    const blocks = (
      await sql<{
        id: string;
      }>`SELECT id::text FROM control.business_partner_block WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND status='active' AND partner_role_scope IN ('all',${input.role}) AND operation_code=${input.operationCode} AND (operating_organization_id IS NULL OR operating_organization_id=${input.operatingOrganizationId}::uuid) AND (company_code_id IS NULL OR company_code_id=${input.companyCodeId ?? null}::uuid) AND effective_from<=(${input.businessDate}::date+time '23:59:59') AND (effective_until IS NULL OR effective_until>${input.businessDate}::date) ORDER BY id`.execute(
        transaction as never,
      )
    ).rows;
    const risk = (
      await sql<{
        id: string;
        status: string;
        risk_band: string;
        overall_score: string | number | null;
        next_review_at: string | null;
        version: number;
      }>`SELECT id::text,status,risk_band,overall_score,next_review_at::text,version FROM master.party_risk_assessment WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND status='approved' AND (${active?.riskAssessmentId ?? null}::uuid IS NULL OR id=${active?.riskAssessmentId ?? null}::uuid) ORDER BY CASE WHEN id=${active?.riskAssessmentId ?? null}::uuid THEN 0 ELSE 1 END,version DESC LIMIT 1`.execute(
        transaction as never,
      )
    ).rows[0];
    const bankReady =
      input.role !== "supplier" || input.operationCode !== "payment"
        ? true
        : (
            await sql<{
              ready: boolean;
            }>`SELECT EXISTS(SELECT 1 FROM master.company_code_supplier_profile profile JOIN master.bank_account_link link ON link.tenant_id=profile.tenant_id AND link.id=profile.preferred_remittance_bank_link_id JOIN master.bank_account account ON account.tenant_id=link.tenant_id AND account.id=link.bank_account_id WHERE profile.tenant_id=${input.tenantId}::uuid AND profile.id=${partner.profile_id ?? null}::uuid AND link.effective_from<=${input.businessDate}::date AND (link.effective_until IS NULL OR link.effective_until>${input.businessDate}::date) AND account.status='active' AND account.is_verified=true AND (account.metadata->>'verificationExpiresAt' IS NULL OR (account.metadata->>'verificationExpiresAt')::date>=${input.businessDate}::date)) ready`.execute(
              transaction as never,
            )
          ).rows[0]?.ready === true;
    const reasons: PartnerEligibilityReason[] = [];
    const block = (code: PartnerEligibilityReason["code"], recordId?: string) =>
      reasons.push({
        code,
        severity: "blocking",
        ...(recordId ? { recordId } : {}),
      });
    if (partner.status !== "active") block("PARTNER_INACTIVE");
    if (!partner.role_id) block("ROLE_MISSING");
    else if (
      partner.role_status !== "active" &&
      !(
        input.operationCode === "activation" &&
        ((input.role === "customer" &&
          ["prospect", "suspended"].includes(partner.role_status ?? "")) ||
          (input.role === "supplier" && partner.role_status === "onboarding"))
      )
    )
      block("ROLE_INACTIVE", partner.role_id);
    if (!partner.assignment_id || partner.assignment_status !== "active")
      block("ORG_ASSIGNMENT_MISSING", partner.assignment_id ?? undefined);
    if (!partner.company_compatible) block("ORG_COMPANY_INCOMPATIBLE");
    if (input.role === "supplier" && !active) {
      const latest = qualifications[0];
      if (!latest || latest.decision === "pending")
        block("QUALIFICATION_PENDING", latest?.id);
      else if (latest.decision === "rejected")
        block("QUALIFICATION_REJECTED", latest.id);
      else if (latest.decision === "suspended")
        block("QUALIFICATION_SUSPENDED", latest.id);
      else block("QUALIFICATION_EXPIRED", latest.id);
    }
    for (const item of blocks) block("BLOCKED_FOR_OPERATION", item.id);
    if (!risk) block("RISK_ASSESSMENT_MISSING");
    else {
      if (risk.next_review_at && risk.next_review_at < input.businessDate)
        block("RISK_ASSESSMENT_EXPIRED", risk.id);
      if (risk.risk_band === "critical") block("RISK_CRITICAL", risk.id);
    }
    if (input.companyCodeId) {
      if (!partner.profile_id) block("COMPANY_PROFILE_MISSING");
      else if (partner.profile_status !== "active")
        block("COMPANY_PROFILE_INACTIVE", partner.profile_id);
      if (
        ["payment", "order", "invoice", "credit", "activation"].includes(
          input.operationCode,
        ) &&
        !partner.payment_term_id
      )
        block("PAYMENT_TERM_INVALID", partner.profile_id ?? undefined);
      if (
        input.operationCode === "payment" &&
        input.role === "supplier" &&
        !bankReady
      )
        block("BANK_NOT_READY", partner.profile_id ?? undefined);
    }
    if (input.role === "customer" && input.companyCodeId) {
      const credits = (
        await sql<CreditRow>`SELECT ${creditReadColumns} FROM control.customer_credit_review review WHERE review.tenant_id=${input.tenantId}::uuid AND review.business_partner_id=${input.businessPartnerId}::uuid AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' AND scope.operating_organization_id=${input.operatingOrganizationId}::uuid) AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId}::uuid) ORDER BY review.created_at DESC,review.id DESC`.execute(
          transaction as never,
        )
      ).rows;
      const credit = credits[0],
        effective = credits.find(
          (item) =>
            (item.decision === "approved" || item.decision === "conditional") &&
            (!item.effective_from ||
              dateOnly(item.effective_from) <= input.businessDate) &&
            (!item.effective_until ||
              dateOnly(item.effective_until) > input.businessDate),
        );
      if (!effective) {
        if (!credit) block("CREDIT_REVIEW_MISSING");
        else if (credit.decision === "pending")
          block("CREDIT_REVIEW_PENDING", credit.id);
        else if (credit.decision === "rejected")
          block("CREDIT_REVIEW_REJECTED", credit.id);
        else if (credit.decision === "suspended")
          block("CREDIT_REVIEW_SUSPENDED", credit.id);
        else block("CREDIT_REVIEW_EXPIRED", credit.id);
      }
    }
    const preferences =
      input.role === "supplier"
        ? (
            await sql<{
              id: string;
            }>`SELECT preference.id::text FROM control.supplier_preference_designation preference WHERE preference.tenant_id=${input.tenantId}::uuid AND preference.business_partner_id=${input.businessPartnerId}::uuid AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' AND scope.operating_organization_id=${input.operatingOrganizationId}::uuid) AND preference.status='approved' AND preference.effective_from<=${input.businessDate}::date AND(preference.effective_until IS NULL OR preference.effective_until>${input.businessDate}::date) AND(NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='company_code' AND scope.scope_mode='include') OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId ?? null}::uuid)) AND(NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='commodity_category' AND scope.scope_mode='include') OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='commodity_category' AND scope.scope_mode='include' AND scope.commodity_category_id=${input.commodityCategoryId ?? null}::uuid)) ORDER BY preference.id`.execute(
              transaction as never,
            )
          ).rows
        : [];
    reasons.sort((a, b) =>
      `${a.code}:${a.recordId ?? ""}`.localeCompare(
        `${b.code}:${b.recordId ?? ""}`,
      ),
    );
    return {
      businessPartnerId: input.businessPartnerId,
      role: input.role,
      operatingOrganizationId: input.operatingOrganizationId,
      ...(input.companyCodeId ? { companyCodeId: input.companyCodeId } : {}),
      operationCode: input.operationCode,
      businessDate: input.businessDate,
      eligible: !reasons.some((reason) => reason.severity === "blocking"),
      reasons,
      qualifications,
      ...(risk
        ? {
            riskAssessment: {
              id: risk.id,
              status: risk.status,
              riskBand: risk.risk_band,
              ...(risk.overall_score == null
                ? {}
                : { overallScore: Number(risk.overall_score) }),
              ...(risk.next_review_at
                ? { nextReviewAt: risk.next_review_at }
                : {}),
              version: risk.version,
            },
          }
        : {}),
      activeBlockIds: blocks.map((item) => item.id),
      preferredSupplier: preferences.length > 0,
      effectivePreferenceIds: preferences.map((item) => item.id),
    };
  }
}

function mapQualification(row: QualificationRow): BusinessPartnerQualification {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    businessPartnerId: row.business_partner_id,
    partnerRole: row.partner_role,
    roleId: row.role_id,
    ...(row.operating_organization_id
      ? { operatingOrganizationId: row.operating_organization_id }
      : {}),
    ...(row.company_code_id ? { companyCodeId: row.company_code_id } : {}),
    ...(row.commodity_capability_id
      ? { commodityCapabilityId: row.commodity_capability_id }
      : {}),
    qualificationTypeCode: row.qualification_type_code,
    decision: row.decision,
    ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),
    ...(row.reviewed_at ? { reviewedAt: iso(row.reviewed_at) } : {}),
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.approved_at ? { approvedAt: iso(row.approved_at) } : {}),
    ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
    ...(row.risk_assessment_id
      ? { riskAssessmentId: row.risk_assessment_id }
      : {}),
    ...(row.effective_from
      ? { effectiveFrom: dateOnly(row.effective_from) }
      : {}),
    ...(row.effective_until
      ? { effectiveUntil: dateOnly(row.effective_until) }
      : {}),
    ...(row.next_review_at
      ? { nextReviewAt: dateOnly(row.next_review_at) }
      : {}),
    ...(row.reviewed_at ? { reviewedAt: iso(row.reviewed_at) } : {}),
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.approved_at ? { approvedAt: iso(row.approved_at) } : {}),
    ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
    rowVersion: Number(row.row_version),
    createdAt: iso(row.created_at),
    createdBy: row.created_by,
    ...(row.updated_at ? { updatedAt: iso(row.updated_at) } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}
function iso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
function dateOnly(value: Date | string) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}
function mapPreference(
  row: PreferenceRow,
  businessDate: string,
): SupplierPreferenceDesignation {
  const effectiveFrom = dateOnly(row.effective_from),
    effectiveUntil = row.effective_until
      ? dateOnly(row.effective_until)
      : undefined,
    temporalStatus =
      row.status === "pending"
        ? "pending"
        : row.status === "rejected"
          ? "rejected"
          : row.status === "revoked"
            ? "revoked"
            : effectiveFrom > businessDate
              ? "scheduled"
              : effectiveUntil && effectiveUntil <= businessDate
                ? "expired"
                : "active";
  return {
    id: row.id,
    tenantId: row.tenant_id,
    businessPartnerId: row.business_partner_id,
    supplierId: row.supplier_id,
    operatingOrganizationId: row.operating_organization_id,
    ...(row.company_code_id ? { companyCodeId: row.company_code_id } : {}),
    ...(row.commodity_category_id
      ? { commodityCategoryId: row.commodity_category_id }
      : {}),
    effectiveFrom,
    ...(effectiveUntil ? { effectiveUntil } : {}),
    rationale: row.rationale,
    status: row.status,
    temporalStatus,
    ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),
    ...(row.reviewed_at ? { reviewedAt: iso(row.reviewed_at) } : {}),
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.approved_at ? { approvedAt: iso(row.approved_at) } : {}),
    ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
    ...(row.revocation_reason
      ? { revocationReason: row.revocation_reason }
      : {}),
    ...(row.revoked_at ? { revokedAt: iso(row.revoked_at) } : {}),
    ...(row.revoked_by ? { revokedBy: row.revoked_by } : {}),
    rowVersion: Number(row.row_version),
    createdAt: iso(row.created_at),
    createdBy: row.created_by,
    ...(row.updated_at ? { updatedAt: iso(row.updated_at) } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}
function mapActivation(row: ActivationRow): SupplierActivationEvidence {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    businessPartnerId: row.business_partner_id,
    supplierId: row.supplier_id,
    operatingOrganizationId: row.operating_organization_id,
    ...(row.company_code_id ? { companyCodeId: row.company_code_id } : {}),
    businessDate: dateOnly(row.business_date),
    priorStatus: row.prior_status,
    resultingStatus: row.resulting_status,
    readinessFingerprint: row.readiness_fingerprint,
    readiness: row.readiness_evidence,
    idempotencyKey: row.idempotency_key,
    commandFingerprint: row.command_fingerprint,
    activatedAt: iso(row.activated_at),
    activatedBy: row.activated_by,
  };
}
function mapCredit(row: CreditRow): CustomerCreditReview {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    businessPartnerId: row.business_partner_id,
    customerId: row.customer_id,
    operatingOrganizationId: row.operating_organization_id,
    companyCodeId: row.company_code_id,
    reviewTypeCode: row.review_type_code,
    ...(row.requested_credit_limit == null
      ? {}
      : { requestedCreditLimit: Number(row.requested_credit_limit) }),
    ...(row.requested_currency_code
      ? { requestedCurrencyCode: row.requested_currency_code }
      : {}),
    ...(row.approved_credit_limit == null
      ? {}
      : { approvedCreditLimit: Number(row.approved_credit_limit) }),
    ...(row.approved_currency_code
      ? { approvedCurrencyCode: row.approved_currency_code }
      : {}),
    ...(row.risk_class_code ? { riskClassCode: row.risk_class_code } : {}),
    decision: row.decision,
    ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),
    conditions: row.conditions ?? [],
    effectiveFrom: dateOnly(row.effective_from),
    ...(row.effective_until
      ? { effectiveUntil: dateOnly(row.effective_until) }
      : {}),
    ...(row.reviewed_at ? { reviewedAt: iso(row.reviewed_at) } : {}),
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.approved_at ? { approvedAt: iso(row.approved_at) } : {}),
    ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
    rowVersion: Number(row.row_version),
    createdAt: iso(row.created_at),
    createdBy: row.created_by,
    ...(row.updated_at ? { updatedAt: iso(row.updated_at) } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}
function mapDesignation(row: DesignationRow): CustomerAccountDesignation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    businessPartnerId: row.business_partner_id,
    customerId: row.customer_id,
    operatingOrganizationId: row.operating_organization_id,
    ...(row.company_code_id ? { companyCodeId: row.company_code_id } : {}),
    ...(row.country_code ? { countryCode: row.country_code.trim() } : {}),
    ...(row.channel_code ? { channelCode: row.channel_code } : {}),
    designationType: row.designation_type,
    ...(row.priority_tier === null
      ? {}
      : { priorityTier: Number(row.priority_tier) }),
    effectiveFrom: dateOnly(row.effective_from),
    ...(row.effective_until
      ? { effectiveUntil: dateOnly(row.effective_until) }
      : {}),
    rationale: row.rationale,
    status: row.status,
    ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),
    ...(row.reviewed_at ? { reviewedAt: iso(row.reviewed_at) } : {}),
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.approved_at ? { approvedAt: iso(row.approved_at) } : {}),
    ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
    ...(row.revoked_at ? { revokedAt: iso(row.revoked_at) } : {}),
    ...(row.revoked_by ? { revokedBy: row.revoked_by } : {}),
    ...(row.revocation_reason ? { revocationReason: row.revocation_reason } : {}),
    rowVersion: Number(row.row_version),
    createdAt: iso(row.created_at),
    createdBy: row.created_by,
    ...(row.updated_at ? { updatedAt: iso(row.updated_at) } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}
