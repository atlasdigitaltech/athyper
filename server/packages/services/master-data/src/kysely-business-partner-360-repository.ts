import { sql, type Transaction } from "kysely";
import {
  BUSINESS_PARTNER_360_PERMISSIONS,
  type BusinessPartnerAggregate,
  type BusinessPartner360ActivitySummary,
  type BusinessPartner360AddressSummary,
  type BusinessPartner360ContactSummary,
  type BusinessPartner360MaskedIdentifierSummary,
  type BusinessPartner360SectionCode,
} from "@athyper/server-contract-master-data";
import type {
  BusinessPartner360Core,
  BusinessPartner360Fragments,
  BusinessPartner360Repository,
} from "./business-partner-360-service.js";
import type {
  BusinessPartner360CompletenessEvidence,
  BusinessPartner360EvidenceState,
} from "./business-partner-360-completeness.js";
import { KyselyBusinessPartnerCaseRepository } from "./kysely-business-partner-case-repository.js";
import {
  readBusinessPartner360CommonSection,
  readBusinessPartner360RestrictedTaxValue,
} from "./kysely-business-partner-360-sections.js";
import { readBusinessPartner360RoleCompanySection } from "./kysely-business-partner-360-role-sections.js";
import { readBusinessPartner360CommercialControlSection } from "./kysely-business-partner-360-commercial-controls.js";
import { readBusinessPartner360RestrictedBankValue } from "./kysely-business-partner-360-bank-reveal.js";
import { readBusinessPartner360ExplainabilitySection } from "./kysely-business-partner-360-explainability.js";
import { readBusinessPartner360NetworkSection } from "./kysely-business-partner-360-network.js";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;
export class KyselyBusinessPartner360Repository implements BusinessPartner360Repository<Tx> {
  private readonly legacy = new KyselyBusinessPartnerCaseRepository();
  async resolveCore(
    input: Parameters<BusinessPartner360Repository<Tx>["resolveCore"]>[0],
    transaction: Tx,
  ): Promise<BusinessPartner360Core | null> {
    const clock = (
      await sql<{
        business_date: string;
      }>`SELECT COALESCE(${input.asOf ?? null}::date,CURRENT_DATE)::text AS business_date`.execute(
        transaction,
      )
    ).rows[0]!.business_date;
    const partner = (
      await sql<Row>`SELECT id::text,code,partner_category::text,COALESCE(display_name,name) display_name,legal_name,status::text,record_version,COALESCE(updated_at,status_changed_at,created_at) changed_at FROM master.business_partner WHERE tenant_id=${input.tenantId}::uuid AND id=${input.businessPartnerId}::uuid AND partner_category='organization' LIMIT 1`.execute(
        transaction,
      )
    ).rows[0];
    if (!partner) return null;
    const roles = (
      await sql<Row>`SELECT id::text,'supplier' code,supplier_code role_code,status::text FROM master.supplier WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND status<>'archived' UNION ALL SELECT id::text,'customer',customer_code,status::text FROM master.customer WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND status<>'archived' ORDER BY code,id`.execute(
        transaction,
      )
    ).rows;
    let scopeValid = true,
      scopeResolved = false;
    if (input.operatingOrganizationId) {
      scopeResolved = true;
      scopeValid = Boolean(
        (
          await sql`SELECT 1 FROM master.business_partner_operating_organization_assignment a WHERE a.tenant_id=${input.tenantId}::uuid AND a.business_partner_id=${input.businessPartnerId}::uuid AND a.operating_organization_id=${input.operatingOrganizationId}::uuid AND (${input.roleLens ?? "all"}='all' OR a.partner_role::text=${input.roleLens ?? "all"}) AND a.status='active' AND a.effective_from<=${clock}::date AND (a.effective_until IS NULL OR a.effective_until>${clock}::date) LIMIT 1`.execute(
            transaction,
          )
        ).rows[0],
      );
    }
    // A role-free identity may be inspected for its first governed role extension.
    // Existing assignments, including inactive ones, must never grant this path.
    if (!scopeValid && input.operatingOrganizationId && roles.length === 0 && (input.roleLens ?? "all") === "all") {
      scopeValid = Boolean((await sql`SELECT 1 FROM master.operating_organization organization
        WHERE organization.tenant_id=${input.tenantId}::uuid AND organization.id=${input.operatingOrganizationId}::uuid
          AND organization.status='active'
          AND NOT EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment assignment
            WHERE assignment.tenant_id=${input.tenantId}::uuid AND assignment.business_partner_id=${input.businessPartnerId}::uuid)
        LIMIT 1`.execute(transaction)).rows[0]);
    }
    if (input.companyCodeId) {
      scopeResolved = true;
      scopeValid =
        scopeValid &&
        Boolean(input.operatingOrganizationId) &&
        Boolean(
          (
            await sql`SELECT 1 FROM master.operating_organization_company_assignment assignment JOIN master.company_code company ON company.tenant_id=assignment.tenant_id AND company.id=assignment.company_code_id WHERE assignment.tenant_id=${input.tenantId}::uuid AND assignment.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid AND assignment.company_code_id=${input.companyCodeId}::uuid AND assignment.status='active' AND assignment.effective_from<=${clock}::date AND (assignment.effective_until IS NULL OR assignment.effective_until>${clock}::date) AND (${input.legalEntityId ?? null}::uuid IS NULL OR company.legal_entity_id=${input.legalEntityId ?? null}::uuid) LIMIT 1`.execute(
              transaction,
            )
          ).rows[0],
        );
    } else if (input.legalEntityId) {
      scopeResolved = true;
      scopeValid =
        scopeValid &&
        Boolean(
          (
            await sql`SELECT 1 FROM master.legal_entity_internal_partner_link link WHERE link.tenant_id=${input.tenantId}::uuid AND link.business_partner_id=${input.businessPartnerId}::uuid AND link.legal_entity_id=${input.legalEntityId}::uuid AND link.status='active' AND link.effective_from<=${clock}::date AND(link.effective_until IS NULL OR link.effective_until>${clock}::date) LIMIT 1`.execute(
              transaction,
            )
          ).rows[0],
        );
    }
    return {
      id: text(partner, "id"),
      code: text(partner, "code"),
      category: text(
        partner,
        "partner_category",
      ) as BusinessPartner360Core["category"],
      displayName: text(partner, "display_name"),
      ...(optional(partner, "legal_name")
        ? { legalName: optional(partner, "legal_name") }
        : {}),
      status: text(partner, "status"),
      version: Number(partner["record_version"]),
      changedAt: iso(partner["changed_at"]),
      businessDate: clock,
      roles: roles.map((row) => ({
        id: text(row, "id"),
        code: text(row, "code") as "supplier" | "customer",
        ...(optional(row, "role_code")
          ? { roleCode: optional(row, "role_code") }
          : {}),
        status: text(row, "status"),
      })),
      scopeValid,
      scopeResolved,
    };
  }
  async readFragments(
    input: Parameters<BusinessPartner360Repository<Tx>["readFragments"]>[0],
    transaction: Tx,
  ): Promise<BusinessPartner360Fragments> {
    const can = (permission: string) => input.permissions.has(permission),
      ownerTypes = (
        await sql<{
          id: string;
          code: string;
        }>`SELECT id::text,code FROM control.owner_type WHERE code IN('business_partner','contact_person') AND status='active' AND (tenant_id IS NULL OR tenant_id=${input.tenantId}::uuid) ORDER BY tenant_id NULLS LAST`.execute(
          transaction,
        )
      ).rows,
      ownerType = ownerTypes.find((row) => row.code === "business_partner")?.id,
      contactOwnerType = ownerTypes.find(
        (row) => row.code === "contact_person",
      )?.id;
    const [address, contact, identifiers, work, recent] = await Promise.all([
      can(BUSINESS_PARTNER_360_PERMISSIONS.address) && ownerType
        ? sql<Row>`SELECT address.id::text,link.purpose,address.line1,address.line2,address.line3,COALESCE(address.city,address.dependent_locality) locality,address.region,address.postal_code,address.country_code::text,link.is_primary,address.validation_status,link.effective_from,link.effective_until FROM master.address_link link JOIN master.address address ON address.tenant_id=link.tenant_id AND address.id=link.address_id WHERE link.tenant_id=${input.tenantId}::uuid AND link.owner_type_id=${ownerType}::uuid AND link.owner_id=${input.core.id}::uuid AND link.is_primary AND link.usage_status='active' AND address.status='active' AND link.effective_from<=${input.asOf}::date AND (link.effective_until IS NULL OR link.effective_until>${input.asOf}::date) ORDER BY link.is_primary DESC,link.effective_from DESC,link.id LIMIT 1`.execute(
            transaction,
          )
        : Promise.resolve({ rows: [] } as { rows: Row[] }),
      can(BUSINESS_PARTNER_360_PERMISSIONS.contact) &&
      ownerType &&
      contactOwnerType
        ? sql<Row>`SELECT person.id::text,person.contact_name display_name,person.is_primary,link.purpose,link.channel_type,link.value,link.is_verified,link.effective_from,link.effective_until FROM master.contact_person person LEFT JOIN master.contact_link link ON link.tenant_id=person.tenant_id AND link.owner_type_id=${contactOwnerType}::uuid AND link.owner_id=person.id AND link.status='active' AND link.effective_from<=${input.asOf}::date AND (link.effective_until IS NULL OR link.effective_until>${input.asOf}::date) WHERE person.tenant_id=${input.tenantId}::uuid AND person.owner_type_id=${ownerType}::uuid AND person.owner_id=${input.core.id}::uuid AND person.status='active' AND person.is_primary AND person.id=(SELECT primary_person.id FROM master.contact_person primary_person WHERE primary_person.tenant_id=person.tenant_id AND primary_person.owner_type_id=person.owner_type_id AND primary_person.owner_id=person.owner_id AND primary_person.status='active' AND primary_person.is_primary ORDER BY primary_person.id LIMIT 1) ORDER BY link.is_primary DESC,link.channel_type,link.id LIMIT 10`.execute(
            transaction,
          )
        : Promise.resolve({ rows: [] } as { rows: Row[] }),
      can(BUSINESS_PARTNER_360_PERMISSIONS.identifierMasked)
        ? sql<Row>`SELECT id::text,scheme_code,COALESCE(metadata->>'maskedValue','••••') masked_value,is_primary,(verified_at IS NOT NULL) verified,NULL::text jurisdiction_code FROM master.business_partner_identifier WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.core.id}::uuid AND status='active' AND (issued_at IS NULL OR issued_at<=${input.asOf}::date) AND (effective_until IS NULL OR effective_until>${input.asOf}::date) UNION ALL SELECT registration.id::text,registration.registration_type_code,COALESCE(registration.metadata->>'maskedValue','••••'),registration.is_primary,(registration.verified_at IS NOT NULL),jurisdiction.code FROM master.business_partner_tax_registration registration JOIN master.tax_jurisdiction jurisdiction ON jurisdiction.tenant_id=registration.tenant_id AND jurisdiction.id=registration.jurisdiction_id WHERE registration.tenant_id=${input.tenantId}::uuid AND registration.business_partner_id=${input.core.id}::uuid AND registration.status='active' AND ${can(BUSINESS_PARTNER_360_PERMISSIONS.taxMasked)} AND (registration.effective_from IS NULL OR registration.effective_from<=${input.asOf}::date) AND (registration.effective_until IS NULL OR registration.effective_until>${input.asOf}::date) ORDER BY is_primary DESC,id LIMIT 5`.execute(
            transaction,
          )
        : Promise.resolve({ rows: [] } as { rows: Row[] }),
      sql<Row>`SELECT count(*)FILTER(WHERE governed_case.status IN('draft','submitted','in_review','approved','materializing','conflicted'))::int active_count,count(*)FILTER(WHERE governed_case.status='draft'AND latest_decision.result_code='ENTITY_CASE_RETURNED'AND latest_decision.recorded_at>=COALESCE(latest_draft.recorded_at,'-infinity'::timestamptz))::int returned_count FROM document.entity_case governed_case LEFT JOIN LATERAL(SELECT command.result_code,command.recorded_at FROM document.entity_case_command_evidence command WHERE command.tenant_id=governed_case.tenant_id AND command.entity_case_id=governed_case.id AND command.command_code='entity.case.decision' ORDER BY command.recorded_at DESC,command.id DESC LIMIT 1)latest_decision ON true LEFT JOIN LATERAL(SELECT command.recorded_at FROM document.entity_case_command_evidence command WHERE command.tenant_id=governed_case.tenant_id AND command.entity_case_id=governed_case.id AND command.command_code='entity.case.draft.write' ORDER BY command.recorded_at DESC,command.id DESC LIMIT 1)latest_draft ON true WHERE governed_case.tenant_id=${input.tenantId}::uuid AND governed_case.entity_code='master.business_partner'AND(governed_case.target_entity_id=${input.core.id}::uuid OR EXISTS(SELECT 1 FROM document.entity_case_command_evidence materialization WHERE materialization.tenant_id=governed_case.tenant_id AND materialization.entity_case_id=governed_case.id AND materialization.command_code='entity.case.materialize'AND materialization.result_evidence->>'businessPartnerId'=${input.core.id}))`.execute(
        transaction,
      ),
      sql<Row>`SELECT id::text,created_at occurred_at,status,event_type FROM(SELECT id,created_at,status,('entity.case.'||status) event_type FROM document.entity_case WHERE tenant_id=${input.tenantId}::uuid AND entity_code='master.business_partner' AND target_entity_id=${input.core.id}::uuid ORDER BY created_at DESC,id DESC LIMIT 5) events`.execute(
        transaction,
      ),
    ]);
    const primaryAddress = address.rows[0]
        ? mapAddress(address.rows[0])
        : undefined,
      primaryContact = contact.rows.length
        ? mapContact(contact.rows)
        : undefined,
      masked = identifiers.rows.map(mapIdentifier),
      workRow = work.rows[0] ?? {};
    const actualCounts = await readSummarySectionCounts(
      {
        tenantId: input.tenantId,
        businessPartnerId: input.core.id,
        operatingOrganizationId: input.operatingOrganizationId,
        companyCodeId: input.companyCodeId,
        asOf: input.asOf,
        ownerType,
        contactOwnerType,
        addressVisible: can(BUSINESS_PARTNER_360_PERMISSIONS.address),
        contactVisible: can(BUSINESS_PARTNER_360_PERMISSIONS.contact),
        identifierVisible: can(
          BUSINESS_PARTNER_360_PERMISSIONS.identifierMasked,
        ),
        taxVisible: can(BUSINESS_PARTNER_360_PERMISSIONS.taxMasked),
      },
      transaction,
    );
    const commodityCapabilityCount = (
      await sql<Row>`SELECT count(*)::int count FROM master.business_partner_commodity_capability WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.core.id}::uuid AND partner_role='supplier' AND effective_from<=${input.asOf}::date AND(effective_until IS NULL OR effective_until>${input.asOf}::date)`.execute(
        transaction,
      )
    ).rows[0];
    actualCounts.supplierControls += Number(
      commodityCapabilityCount?.["count"] ?? 0,
    );
    const counts: Partial<Record<BusinessPartner360SectionCode, number>> = {
      overview: 1,
      identity: 1,
      "roles-scope": input.core.roles.length,
      addresses: actualCounts.addresses,
      contacts: actualCounts.contacts,
      "identifiers-tax": actualCounts.identifiersTax,
      governance: actualCounts.governance,
      requests: Number(workRow["active_count"] ?? 0),
      activity: recent.rows.length,
      "business-activity": 0,
      network: actualCounts.network,
      ...(input.core.roles.some((role) => role.code === "supplier")
        ? {
            "supplier-company": actualCounts.supplierCompany,
            banking: actualCounts.banking,
            "qualifications-certificates": actualCounts.supplierControls,
          }
        : {}),
      ...(input.core.roles.some((role) => role.code === "customer")
        ? {
            "customer-company": actualCounts.customerCompany,
            credit: actualCounts.credit,
          }
        : {}),
    };
    return {
      ...(primaryAddress ? { primaryAddress } : {}),
      ...(primaryContact ? { primaryContact } : {}),
      identifiers: masked,
      openWork: {
        activeRequestCount: Number(workRow["active_count"] ?? 0),
        returnedRequestCount: Number(workRow["returned_count"] ?? 0),
        expiringQualificationCount: 0,
        expiringCertificateCount: 0,
        pendingBankVerificationCount: 0,
      },
      recentActivity: recent.rows.map(mapActivity),
      counts,
      provenance: [
        {
          plane: "neon",
          service: "master-data",
          sourceObject: "master.business_partner",
          observedAt: new Date().toISOString(),
          schemaVersion: "1",
        },
      ],
    };
  }
  async readCompletenessEvidence(
    input: Parameters<
      NonNullable<BusinessPartner360Repository<Tx>["readCompletenessEvidence"]>
    >[0],
    transaction: Tx,
  ): Promise<BusinessPartner360CompletenessEvidence> {
    const row =
      (
        await sql<Row>`SELECT
      EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment a WHERE a.tenant_id=${input.tenantId}::uuid AND a.business_partner_id=${input.core.id}::uuid AND a.partner_role='supplier' AND a.status='active' AND a.effective_from<=${input.asOf}::date AND(a.effective_until IS NULL OR a.effective_until>${input.asOf}::date) AND (${input.operatingOrganizationId ?? null}::uuid IS NULL OR a.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid)) supplier_organization,
      EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment a WHERE a.tenant_id=${input.tenantId}::uuid AND a.business_partner_id=${input.core.id}::uuid AND a.partner_role='customer' AND a.status='active' AND a.effective_from<=${input.asOf}::date AND(a.effective_until IS NULL OR a.effective_until>${input.asOf}::date) AND (${input.operatingOrganizationId ?? null}::uuid IS NULL OR a.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid)) customer_organization,
      EXISTS(SELECT 1 FROM master.company_code_supplier_profile p JOIN master.supplier s ON s.tenant_id=p.tenant_id AND s.id=p.supplier_id WHERE p.tenant_id=${input.tenantId}::uuid AND s.business_partner_id=${input.core.id}::uuid AND p.status='active' AND (${input.companyCodeId ?? null}::uuid IS NULL OR p.company_code_id=${input.companyCodeId ?? null}::uuid)) supplier_company,
      EXISTS(SELECT 1 FROM master.company_code_customer_profile p JOIN master.customer c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id WHERE p.tenant_id=${input.tenantId}::uuid AND c.business_partner_id=${input.core.id}::uuid AND p.status='active' AND (${input.companyCodeId ?? null}::uuid IS NULL OR p.company_code_id=${input.companyCodeId ?? null}::uuid)) customer_company,
      EXISTS(SELECT 1 FROM control.customer_credit_review review WHERE review.tenant_id=${input.tenantId}::uuid AND review.business_partner_id=${input.core.id}::uuid AND review.decision IN('approved','conditional') AND review.approved_credit_limit IS NOT NULL AND review.effective_from<=${input.asOf}::date AND(review.effective_until IS NULL OR review.effective_until>${input.asOf}::date) AND (${input.operatingOrganizationId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' AND scope.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid)) AND (${input.companyCodeId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId ?? null}::uuid))) credit_current,
      EXISTS(SELECT 1 FROM document.business_partner_bank_verification v WHERE v.tenant_id=${input.tenantId}::uuid AND v.business_partner_id=${input.core.id}::uuid AND v.status IN('verified','applied') AND (${input.companyCodeId ?? null}::uuid IS NULL OR v.company_code_id=${input.companyCodeId ?? null}::uuid)) bank_verified,
      EXISTS(SELECT 1 FROM control.business_partner_qualification q WHERE q.tenant_id=${input.tenantId}::uuid AND q.business_partner_id=${input.core.id}::uuid AND q.decision IN('approved','conditional') AND(q.effective_from IS NULL OR q.effective_from<=${input.asOf}::date) AND(q.effective_until IS NULL OR q.effective_until>${input.asOf}::date)) qualification_current,
      EXISTS(SELECT 1 FROM master.certification c WHERE c.tenant_id=${input.tenantId}::uuid AND c.owner_type='business_partner' AND c.owner_id=${input.core.id}::uuid AND c.status='active' AND(c.effective_from IS NULL OR c.effective_from<=${input.asOf}::date) AND(c.effective_until IS NULL OR c.effective_until>${input.asOf}::date)) certification_current,
      EXISTS(SELECT 1 FROM master.business_partner_identifier i WHERE i.tenant_id=${input.tenantId}::uuid AND i.business_partner_id=${input.core.id}::uuid AND i.status='active' AND i.verified_at IS NOT NULL AND(i.issued_at IS NULL OR i.issued_at<=${input.asOf}::date) AND(i.effective_until IS NULL OR i.effective_until>${input.asOf}::date) UNION ALL SELECT 1 FROM master.business_partner_tax_registration t WHERE t.tenant_id=${input.tenantId}::uuid AND t.business_partner_id=${input.core.id}::uuid AND t.status='active' AND t.verified_at IS NOT NULL AND(t.effective_from IS NULL OR t.effective_from<=${input.asOf}::date) AND(t.effective_until IS NULL OR t.effective_until>${input.asOf}::date)) identifier_verified`.execute(
          transaction,
        )
      ).rows[0] ?? {};
    const present = (
      key: string,
      state: BusinessPartner360EvidenceState = "verified",
    ) => ({
      state: Boolean(row[key]) ? state : ("missing" as const),
      fingerprint: String(Boolean(row[key])),
    });
    const identifierState: BusinessPartner360EvidenceState =
      input.permissions.has(BUSINESS_PARTNER_360_PERMISSIONS.identifierMasked)
        ? "verified"
        : "restricted_verified";
    return {
      "scope.supplier.organization": present(
        "supplier_organization",
        "present",
      ),
      "scope.customer.organization": present(
        "customer_organization",
        "present",
      ),
      "company.supplier.profile": present("supplier_company", "present"),
      "company.customer.profile": present("customer_company", "present"),
      "credit.current": present("credit_current"),
      "bank.verified_presence": present(
        "bank_verified",
        input.permissions.has(BUSINESS_PARTNER_360_PERMISSIONS.bankMasked)
          ? "verified"
          : "restricted_verified",
      ),
      "qualification.current": present("qualification_current"),
      "certification.current": present("certification_current"),
      "identifier.primary": present("identifier_verified", identifierState),
    };
  }
  async claimRestrictedReveal(
    input: Parameters<
      NonNullable<BusinessPartner360Repository<Tx>["claimRestrictedReveal"]>
    >[0],
    transaction: Tx,
  ): Promise<boolean> {
    const row = (
      await sql<{ id: string }>`INSERT INTO event.command_execution(
      tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,
      result_payload,started_at,completed_at,expires_at,status_changed_at,status_changed_by,created_by
    ) VALUES(
      ${input.tenantId}::uuid,${input.commandCode},${input.revealId},${input.fingerprint},'succeeded',
      ${input.principalId}::uuid,'master-data',${JSON.stringify({ claimed: true })}::jsonb,
      statement_timestamp(),statement_timestamp(),${input.purposeExpiresAt}::timestamptz,
      statement_timestamp(),${input.principalId}::uuid,${input.principalId}::uuid
    ) ON CONFLICT(tenant_id,command_code,idempotency_key) DO NOTHING RETURNING id::text`.execute(
        transaction,
      )
    ).rows[0];
    return Boolean(row);
  }
  legacyAggregate(
    tenantId: string,
    businessPartnerId: string,
    operatingOrganizationId: string,
    transaction: Tx,
  ): Promise<BusinessPartnerAggregate | null> {
    return this.legacy.getAggregate(
      tenantId,
      businessPartnerId,
      operatingOrganizationId,
      transaction,
    );
  }
  readCommonSection(
    input: Parameters<BusinessPartner360Repository<Tx>["readCommonSection"]>[0],
    transaction: Tx,
  ) {
    return readBusinessPartner360CommonSection(input, transaction);
  }
  readRestrictedTaxValue(
    input: Parameters<
      BusinessPartner360Repository<Tx>["readRestrictedTaxValue"]
    >[0],
    transaction: Tx,
  ) {
    return readBusinessPartner360RestrictedTaxValue(input, transaction);
  }
  readRoleCompanySection(
    input: Parameters<
      BusinessPartner360Repository<Tx>["readRoleCompanySection"]
    >[0],
    transaction: Tx,
  ) {
    return readBusinessPartner360RoleCompanySection(input, transaction);
  }
  readCommercialControlSection(
    input: Parameters<
      BusinessPartner360Repository<Tx>["readCommercialControlSection"]
    >[0],
    transaction: Tx,
  ) {
    return readBusinessPartner360CommercialControlSection(input, transaction);
  }
  readRestrictedBankValue(
    input: Parameters<
      BusinessPartner360Repository<Tx>["readRestrictedBankValue"]
    >[0],
    transaction: Tx,
  ) {
    return readBusinessPartner360RestrictedBankValue(input, transaction);
  }
  readExplainabilitySection(
    input: Parameters<
      BusinessPartner360Repository<Tx>["readExplainabilitySection"]
    >[0],
    transaction: Tx,
  ) {
    return readBusinessPartner360ExplainabilitySection(input, transaction);
  }
  readNetworkSection(
    input: Parameters<
      BusinessPartner360Repository<Tx>["readNetworkSection"]
    >[0],
    transaction: Tx,
  ) {
    return readBusinessPartner360NetworkSection(input, transaction);
  }
}
async function readSummarySectionCounts(
  input: {
    tenantId: string;
    businessPartnerId: string;
    operatingOrganizationId: string | undefined;
    companyCodeId: string | undefined;
    asOf: string;
    ownerType: string | undefined;
    contactOwnerType: string | undefined;
    addressVisible: boolean;
    contactVisible: boolean;
    identifierVisible: boolean;
    taxVisible: boolean;
  },
  transaction: Tx,
) {
  const row =
    (
      await sql<Row>`SELECT
    (SELECT count(*)::int FROM master.address_link link JOIN master.address address ON address.tenant_id=link.tenant_id AND address.id=link.address_id WHERE ${input.addressVisible} AND link.tenant_id=${input.tenantId}::uuid AND link.owner_type_id=${input.ownerType ?? null}::uuid AND link.owner_id=${input.businessPartnerId}::uuid AND link.usage_status='active' AND address.status='active' AND link.effective_from<=${input.asOf}::date AND(link.effective_until IS NULL OR link.effective_until>${input.asOf}::date)) addresses,
    (SELECT count(*)::int FROM master.contact_person person WHERE ${input.contactVisible} AND person.tenant_id=${input.tenantId}::uuid AND person.owner_type_id=${input.ownerType ?? null}::uuid AND person.owner_id=${input.businessPartnerId}::uuid AND person.status='active') contacts,
    ((SELECT count(*)::int FROM master.business_partner_identifier value WHERE ${input.identifierVisible} AND value.tenant_id=${input.tenantId}::uuid AND value.business_partner_id=${input.businessPartnerId}::uuid AND value.status='active' AND(value.issued_at IS NULL OR value.issued_at<=${input.asOf}::date) AND(value.effective_until IS NULL OR value.effective_until>${input.asOf}::date))+(SELECT count(*)::int FROM master.business_partner_tax_registration value WHERE ${input.taxVisible} AND value.tenant_id=${input.tenantId}::uuid AND value.business_partner_id=${input.businessPartnerId}::uuid AND value.status='active' AND(value.effective_from IS NULL OR value.effective_from<=${input.asOf}::date) AND(value.effective_until IS NULL OR value.effective_until>${input.asOf}::date))) identifiers_tax,
    (SELECT count(*)::int FROM master.company_code_supplier_profile profile JOIN master.supplier supplier ON supplier.tenant_id=profile.tenant_id AND supplier.id=profile.supplier_id WHERE profile.tenant_id=${input.tenantId}::uuid AND supplier.business_partner_id=${input.businessPartnerId}::uuid AND profile.status='active' AND(${input.companyCodeId ?? null}::uuid IS NULL OR profile.company_code_id=${input.companyCodeId ?? null}::uuid)) supplier_company,
    (SELECT count(*)::int FROM master.company_code_customer_profile profile JOIN master.customer customer ON customer.tenant_id=profile.tenant_id AND customer.id=profile.customer_id WHERE profile.tenant_id=${input.tenantId}::uuid AND customer.business_partner_id=${input.businessPartnerId}::uuid AND profile.status='active' AND(${input.companyCodeId ?? null}::uuid IS NULL OR profile.company_code_id=${input.companyCodeId ?? null}::uuid)) customer_company,
    (SELECT count(*)::int FROM master.bank_account_link link JOIN control.owner_type owner_type ON owner_type.id=link.owner_type_id WHERE link.tenant_id=${input.tenantId}::uuid AND owner_type.code='business_partner' AND(owner_type.tenant_id IS NULL OR owner_type.tenant_id=link.tenant_id) AND link.owner_id=${input.businessPartnerId}::uuid AND(${input.companyCodeId ?? null}::uuid IS NULL OR link.company_code_id=${input.companyCodeId ?? null}::uuid) AND link.effective_from<=${input.asOf}::date AND(link.effective_until IS NULL OR link.effective_until>${input.asOf}::date)) banking,
    ((SELECT count(*)::int FROM control.business_partner_qualification value WHERE value.tenant_id=${input.tenantId}::uuid AND value.business_partner_id=${input.businessPartnerId}::uuid AND(${input.operatingOrganizationId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=value.tenant_id AND scope.qualification_id=value.id AND scope.scope_mode='include' AND(scope.scope_kind='global' OR(scope.scope_kind='operating_organization' AND scope.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid)))) AND(${input.companyCodeId ?? null}::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=value.tenant_id AND scope.qualification_id=value.id AND scope.scope_kind='company_code' AND scope.scope_mode='include') OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=value.tenant_id AND scope.qualification_id=value.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId ?? null}::uuid)) AND(value.effective_from IS NULL OR value.effective_from<=${input.asOf}::date) AND(value.effective_until IS NULL OR value.effective_until>${input.asOf}::date))+(SELECT count(*)::int FROM control.supplier_preference_designation value WHERE value.tenant_id=${input.tenantId}::uuid AND value.business_partner_id=${input.businessPartnerId}::uuid AND(${input.operatingOrganizationId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=value.tenant_id AND scope.supplier_preference_id=value.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' AND scope.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid)) AND(${input.companyCodeId ?? null}::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=value.tenant_id AND scope.supplier_preference_id=value.id AND scope.scope_kind='company_code' AND scope.scope_mode='include') OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=value.tenant_id AND scope.supplier_preference_id=value.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId ?? null}::uuid)) AND value.effective_from<=${input.asOf}::date AND(value.effective_until IS NULL OR value.effective_until>${input.asOf}::date))+(SELECT count(*)::int FROM master.certification value WHERE value.tenant_id=${input.tenantId}::uuid AND value.owner_type='business_partner' AND value.owner_id=${input.businessPartnerId}::uuid AND value.status='active' AND(${input.companyCodeId ?? null}::uuid IS NULL OR value.company_code_id IS NULL OR value.company_code_id=${input.companyCodeId ?? null}::uuid) AND(value.effective_from IS NULL OR value.effective_from<=${input.asOf}::date) AND(value.effective_until IS NULL OR value.effective_until>${input.asOf}::date))) supplier_controls,
    (SELECT count(*)::int FROM control.customer_credit_review value WHERE value.tenant_id=${input.tenantId}::uuid AND value.business_partner_id=${input.businessPartnerId}::uuid AND(${input.operatingOrganizationId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=value.tenant_id AND scope.credit_review_id=value.id AND scope.scope_kind='operating_organization' AND scope.scope_mode='include' AND scope.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid)) AND(${input.companyCodeId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=value.tenant_id AND scope.credit_review_id=value.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND scope.company_code_id=${input.companyCodeId ?? null}::uuid)) AND(value.effective_from IS NULL OR value.effective_from<=${input.asOf}::date) AND(value.effective_until IS NULL OR value.effective_until>${input.asOf}::date)) credit,
    (SELECT count(*)::int FROM master.business_partner_governance_relation value WHERE value.tenant_id=${input.tenantId}::uuid AND value.business_partner_id=${input.businessPartnerId}::uuid AND value.status='active' AND(value.appointed_date IS NULL OR value.appointed_date<=${input.asOf}::date) AND(value.end_of_term IS NULL OR value.end_of_term>=${input.asOf}::date)) governance,
    (SELECT count(*)::int FROM control.mesh_business_partner_account_link value WHERE value.tenant_id=${input.tenantId}::uuid AND value.business_partner_id=${input.businessPartnerId}::uuid) network`.execute(
        transaction,
      )
    ).rows[0] ?? {};
  return {
    addresses: Number(row["addresses"] ?? 0),
    contacts: Number(row["contacts"] ?? 0),
    identifiersTax: Number(row["identifiers_tax"] ?? 0),
    governance: Number(row["governance"] ?? 0),
    supplierCompany: Number(row["supplier_company"] ?? 0),
    customerCompany: Number(row["customer_company"] ?? 0),
    banking: Number(row["banking"] ?? 0),
    supplierControls: Number(row["supplier_controls"] ?? 0),
    credit: Number(row["credit"] ?? 0),
    network: Number(row["network"] ?? 0),
  };
}
function mapAddress(row: Row): BusinessPartner360AddressSummary {
  return {
    lines: [optional(row,"line1"),optional(row,"line2"),optional(row,"line3")].filter((value): value is string => Boolean(value)),
    id: text(row, "id"),
    purpose: text(row, "purpose"),
    ...(optional(row, "line1") ? { line1: optional(row, "line1") } : {}),
    ...(optional(row, "locality")
      ? { locality: optional(row, "locality") }
      : {}),
    ...(optional(row, "region") ? { region: optional(row, "region") } : {}),
    ...(optional(row, "postal_code")
      ? { postalCode: optional(row, "postal_code") }
      : {}),
    countryCode: text(row, "country_code"),
    primary: Boolean(row["is_primary"]),
    verified: ["valid", "valid_with_correction", "overridden"].includes(
      text(row, "validation_status"),
    ),
    ...(row["effective_from"]
      ? { effectiveFrom: dateOnly(row["effective_from"]) }
      : {}),
    ...(row["effective_until"]
      ? { effectiveUntil: dateOnly(row["effective_until"]) }
      : {}),
  };
}
function mapContact(rows: readonly Row[]): BusinessPartner360ContactSummary {
  const first = rows[0]!;
  return {
    id: text(first, "id"),
    displayName: optional(first, "display_name"),
    purpose: optional(first, "purpose"),
    ...(rows.find((row) => row["channel_type"] === "email")
      ? {
          email: optional(
            rows.find((row) => row["channel_type"] === "email")!,
            "value",
          ),
        }
      : {}),
    ...(rows.find((row) =>
      ["phone", "sms", "whatsapp"].includes(String(row["channel_type"])),
    )
      ? {
          phone: optional(
            rows.find((row) =>
              ["phone", "sms", "whatsapp"].includes(
                String(row["channel_type"]),
              ),
            )!,
            "value",
          ),
        }
      : {}),
    primary: Boolean(first["is_primary"]),
    verified: rows.some((row) => Boolean(row["is_verified"])),
    ...(first["effective_from"]
      ? { effectiveFrom: iso(first["effective_from"]) }
      : {}),
    ...(first["effective_until"]
      ? { effectiveUntil: iso(first["effective_until"]) }
      : {}),
  };
}
function mapIdentifier(row: Row): BusinessPartner360MaskedIdentifierSummary {
  return {
    id: text(row, "id"),
    schemeCode: text(row, "scheme_code"),
    ...(optional(row, "jurisdiction_code")
      ? { jurisdictionCode: optional(row, "jurisdiction_code") }
      : {}),
    maskedValue: text(row, "masked_value"),
    primary: Boolean(row["is_primary"]),
    verified: Boolean(row["verified"]),
  };
}
function mapActivity(row: Row): BusinessPartner360ActivitySummary {
  return {
    id: text(row, "id"),
    occurredAt: iso(row["occurred_at"]),
    category: "request",
    eventCode: text(row, "event_type"),
    title: `Request ${text(row, "status").replaceAll("_", " ")}`,
    source: { plane: "neon", service: "master-data" },
  };
}
function text(row: Row, key: string) {
  const value = row[key];
  if (value === null || value === undefined)
    throw new Error(`BP_360_REPOSITORY_FIELD_MISSING:${key}`);
  return String(value);
}
function optional(row: Row, key: string) {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}
function iso(value: unknown) {
  const result = value instanceof Date ? value : new Date(String(value));
  return result.toISOString();
}
function dateOnly(value: unknown) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}
