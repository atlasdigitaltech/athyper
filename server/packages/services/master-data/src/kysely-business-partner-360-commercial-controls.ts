import { receivedBankDisclosureCard } from "./business-partner-bank-disclosure-card.js";
import { sql, type Transaction } from "kysely";
import type {
  BusinessPartner360BankingData,
  BusinessPartner360CommodityCodeItem,
  BusinessPartner360CreditReviewData,
  BusinessPartner360SupplierControlsData,
} from "@athyper/server-contract-master-data";
import type {
  BusinessPartner360CommercialControlRead,
  BusinessPartner360Repository,
} from "./business-partner-360-service.js";
type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;
type Input = Parameters<
  BusinessPartner360Repository<Tx>["readCommercialControlSection"]
>[0];
export async function readBusinessPartner360CommercialControlSection(
  input: Input,
  tx: Tx,
): Promise<BusinessPartner360CommercialControlRead> {
  if (input.sectionCode === "banking") return banking(input, tx);
  if (input.sectionCode === "credit") return credit(input, tx);
  return supplierControlsWithCommodities(input, tx);
}
async function supplierControlsWithCommodities(
  input: Input,
  tx: Tx,
): Promise<BusinessPartner360CommercialControlRead> {
  const section = await supplierControls(input, tx),
    baseData = section.data as BusinessPartner360SupplierControlsData;
  if (!input.operatingOrganizationId)
    return { ...section, data: { ...baseData, commodityCapabilities: [] } };
  const [capabilityResult, qualificationScopeResult] = await Promise.all([
    sql<Row>`SELECT capability.id::text,capability.partner_role::text,capability.status::text,capability.effective_from,capability.effective_until,capability.notes,category.id::text category_id,category.code category_code,category.name category_name,COALESCE(jsonb_agg(jsonb_build_object('domainCode',code.domain_code,'code',code.code,'name',code.name,'mappingType',assignment.mapping_type::text,'primary',assignment.is_owner_primary) ORDER BY code.domain_code,code.code) FILTER(WHERE assignment.id IS NOT NULL),'[]'::jsonb) commodity_codes FROM master.business_partner_commodity_capability capability JOIN master.commodity_category category ON category.tenant_id=capability.tenant_id AND category.id=capability.commodity_category_id LEFT JOIN master.commodity_code_assignment assignment ON assignment.tenant_id=capability.tenant_id AND assignment.commodity_category_id=capability.commodity_category_id AND assignment.is_active LEFT JOIN shared.commodity_code code ON code.domain_code=assignment.commodity_domain_code AND code.id=assignment.commodity_code_id AND code.is_active WHERE capability.tenant_id=${input.tenantId}::uuid AND capability.business_partner_id=${input.businessPartnerId}::uuid AND capability.partner_role='supplier' AND capability.effective_from<=${input.asOf}::date AND(capability.effective_until IS NULL OR capability.effective_until>${input.asOf}::date) GROUP BY capability.id,capability.partner_role,capability.status,capability.effective_from,capability.effective_until,capability.notes,category.id,category.code,category.name ORDER BY category.code,capability.id`.execute(
      tx,
    ),
    sql<Row>`SELECT qualification.id::text,COALESCE(jsonb_agg(DISTINCT capability.id::text ORDER BY capability.id::text),'[]'::jsonb) commodity_capability_ids FROM control.business_partner_qualification qualification JOIN control.business_partner_decision_scope commodity_scope ON commodity_scope.tenant_id=qualification.tenant_id AND commodity_scope.qualification_id=qualification.id AND commodity_scope.scope_kind='commodity_category' AND commodity_scope.scope_mode='include' JOIN master.business_partner_commodity_capability capability ON capability.tenant_id=qualification.tenant_id AND capability.business_partner_id=qualification.business_partner_id AND capability.partner_role=qualification.partner_role AND capability.commodity_category_id=commodity_scope.commodity_category_id WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.business_partner_id=${input.businessPartnerId}::uuid AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope organization_scope WHERE organization_scope.tenant_id=qualification.tenant_id AND organization_scope.qualification_id=qualification.id AND organization_scope.scope_kind='operating_organization' AND organization_scope.scope_mode='include' AND organization_scope.operating_organization_id=${input.operatingOrganizationId}::uuid) GROUP BY qualification.id ORDER BY qualification.id`.execute(
      tx,
    ),
  ]);
  const commodityCapabilities = capabilityResult.rows.map((row) => ({
    id: text(row, "id"),
    partnerRole: text(row, "partner_role"),
    categoryId: text(row, "category_id"),
    categoryCode: text(row, "category_code"),
    categoryName: text(row, "category_name"),
    status: text(row, "status"),
    effectiveFrom: date(row["effective_from"]),
    ...(row["effective_until"]
      ? { effectiveUntil: date(row["effective_until"]) }
      : {}),
    ...(optional(row, "notes") ? { notes: optional(row, "notes") } : {}),
    commodityCodes: commodityCodes(row["commodity_codes"]),
    manageHref: `${href(input, "commercial-controls")}/commodity-capabilities/${text(row, "id")}`,
  }));
  const capabilityById = new Map(
      commodityCapabilities.map((item) => [item.id, item]),
    ),
    qualificationCapabilitiesById = new Map(
      qualificationScopeResult.rows.map((row) => [
        text(row, "id"),
        stringArray(row["commodity_capability_ids"]),
      ]),
    );
  const qualifications = baseData.qualifications.map((item) => {
    const commodityCapabilityIds =
        qualificationCapabilitiesById.get(item.id) ?? [],
      capabilities = commodityCapabilityIds.flatMap((id) => {
        const capability = capabilityById.get(id);
        return capability ? [capability] : [];
      }),
      capability = capabilities[0];
    return {
      ...item,
      ...(commodityCapabilityIds.length
        ? {
            commodityCapabilityId: commodityCapabilityIds[0]!,
            commodityCapabilityIds,
            commodityCapabilities: capabilities,
          }
        : {}),
      ...(capability
        ? {
            commodityCategoryCode: capability.categoryCode,
            commodityCategoryName: capability.categoryName,
            commodityCodes: capability.commodityCodes,
          }
        : {}),
    };
  });
  return {
    ...section,
    state:
      section.state === "empty" && commodityCapabilities.length
        ? "ready"
        : section.state,
    data: { ...baseData, commodityCapabilities, qualifications },
    provenance: [
      ...section.provenance,
      ...[
        "master.business_partner_commodity_capability",
        "master.commodity_category",
        "master.commodity_code_assignment",
        "shared.commodity_code",
      ].map((sourceObject) => ({
        plane: "neon" as const,
        service: "master-data",
        sourceObject,
        observedAt: new Date().toISOString(),
        schemaVersion: "1",
      })),
    ],
  };
}
function commodityCodes(
  value: unknown,
): readonly BusinessPartner360CommodityCodeItem[] {
  const parsed =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return typeof item["domainCode"] === "string" &&
      typeof item["code"] === "string" &&
      typeof item["name"] === "string" &&
      typeof item["mappingType"] === "string"
      ? [
          {
            domainCode: item["domainCode"],
            code: item["code"],
            name: item["name"],
            mappingType: item["mappingType"],
            primary: Boolean(item["primary"]),
          },
        ]
      : [];
  });
}
async function banking(input: Input, tx: Tx) {
  let authorizedCompanyIds = input.authorizedCompanyIds;
  if(input.authorizeCompany && !input.companyCodeId){
    const candidates=(await sql<Row>`SELECT DISTINCT u.company_code_id::text FROM master.bank_account_company_usage u
      JOIN master.bank_account_link l ON l.tenant_id=u.tenant_id AND l.id=u.bank_account_link_id
      WHERE l.tenant_id=${input.tenantId}::uuid AND l.owner_type='business_partner' AND l.owner_id=${input.businessPartnerId}::uuid`.execute(tx)).rows;
    const decisions=await Promise.all(candidates.map(async row=>({id:String(row["company_code_id"]),allowed:await input.authorizeCompany!(String(row["company_code_id"]))})));
    authorizedCompanyIds=decisions.filter(value=>value.allowed).map(value=>value.id);
  }
  const rows = (
    await sql<Row>`SELECT link.id::text link_id,account.id::text account_id,account.account_last4,account.account_holder_name,account.currency_code::text,COALESCE(bank.name,account.bank_name_override) bank_name,COALESCE(bank.country_code,account.bank_country_override)::text bank_country_code,link.purpose,link.relationship_role::text,link.company_code_id::text,link.is_primary,account.bic_override,account.account_id_type::text,usage.usage_scope,usage_company.company_usage,usage_company.company_assignments,usage_company.acceptance,usage_company.mesh_source,usage_company.disclosure_status,usage_company.usage_primary,master.bank_account_company_eligible(link.tenant_id,link.id,${input.companyCodeId ?? null}::uuid,${input.asOf}::date) company_applicable,account.status::text account_status,account.is_verified,account.verification_method::text,account.verified_at,link.effective_from,link.effective_until,verification.id::text verification_id,verification.status verification_status,verification.created_at verification_created_at FROM control.owner_type owner_type JOIN master.bank_account_link link ON link.owner_type_id=owner_type.id JOIN master.bank_account account ON account.tenant_id=link.tenant_id AND account.id=link.bank_account_id LEFT JOIN shared.v_bank_directory bank ON bank.id=account.bank_institution_id AND bank.branch_id IS NOT DISTINCT FROM account.bank_branch_id LEFT JOIN master.bank_account_usage usage ON usage.tenant_id=link.tenant_id AND usage.bank_account_link_id=link.id
 LEFT JOIN LATERAL(SELECT bool_or(u.is_primary) usage_primary,bool_or(u.source_account_id IS NOT NULL) mesh_source,
 string_agg(DISTINCT CASE WHEN u.source_account_id IS NULL THEN NULL WHEN current_projection.id IS NULL THEN 'Disclosure unavailable' WHEN current_projection.projection_status='revoked' THEN 'Disclosure revoked' WHEN (current_snapshot.payload_json->>'expiresAt')::timestamptz<=clock_timestamp() THEN 'Disclosure expired' ELSE 'Disclosure current' END, ', ') disclosure_status,
 jsonb_agg(DISTINCT jsonb_build_object('assignmentId',u.id::text,'companyCodeId',u.company_code_id::text,'companyName',company.name,'purpose',u.purpose,'primary',u.is_primary,'effectiveFrom',u.effective_from,'effectiveUntil',u.effective_until,'acceptanceCurrent',COALESCE((u.accepted_at IS NOT NULL AND (u.source_account_id IS NULL OR (current_projection.current_disclosure_id=u.accepted_disclosure_id AND current_projection.current_disclosure_version=u.accepted_disclosure_version AND current_projection.account_fingerprint=u.accepted_account_fingerprint AND current_projection.projection_status IN ('available','linked') AND (current_snapshot.payload_json->>'expiresAt' IS NULL OR (current_snapshot.payload_json->>'expiresAt')::timestamptz>clock_timestamp())))),false),'acceptance',CASE WHEN (u.accepted_at IS NOT NULL AND (u.source_account_id IS NULL OR (current_projection.current_disclosure_id=u.accepted_disclosure_id AND current_projection.current_disclosure_version=u.accepted_disclosure_version AND current_projection.account_fingerprint=u.accepted_account_fingerprint AND current_projection.projection_status IN ('available','linked') AND (current_snapshot.payload_json->>'expiresAt' IS NULL OR (current_snapshot.payload_json->>'expiresAt')::timestamptz>clock_timestamp())))) THEN 'Accepted for use' WHEN u.accepted_at IS NULL THEN 'Not accepted for use' ELSE 'Change pending review' END)) company_assignments,
 string_agg(company.name, ', ' ORDER BY company.name) company_usage,
 string_agg(CASE WHEN u.accepted_at IS NULL THEN 'Not accepted for ' || company.name
 WHEN u.accepted_disclosure_version IS NOT NULL AND (current_projection.current_disclosure_id IS DISTINCT FROM u.accepted_disclosure_id OR current_projection.current_disclosure_version IS DISTINCT FROM u.accepted_disclosure_version OR current_projection.projection_status='revoked' OR (current_snapshot.payload_json->>'expiresAt')::timestamptz<=clock_timestamp()) THEN 'Change pending review for ' || company.name
 ELSE 'Accepted for ' || company.name END, ', ' ORDER BY company.name) acceptance
 FROM master.bank_account_company_usage u JOIN master.company_code company ON company.tenant_id=u.tenant_id AND company.id=u.company_code_id
 LEFT JOIN snapshot.mesh_bank_account_disclosure_received accepted_snapshot ON accepted_snapshot.tenant_id=u.tenant_id AND accepted_snapshot.disclosure_id=u.accepted_disclosure_id
 LEFT JOIN control.mesh_bank_account_projection current_projection ON current_projection.tenant_id=u.tenant_id AND current_projection.network_relationship_id=accepted_snapshot.network_relationship_id
 LEFT JOIN snapshot.mesh_bank_account_disclosure_received current_snapshot ON current_snapshot.tenant_id=u.tenant_id AND current_snapshot.id=current_projection.current_snapshot_id
 WHERE (${authorizedCompanyIds ?? null}::uuid[] IS NULL OR u.company_code_id=ANY(${authorizedCompanyIds ?? null}::uuid[])) AND u.tenant_id=link.tenant_id AND u.bank_account_link_id=link.id AND u.effective_from<=${input.asOf}::date AND(u.effective_until IS NULL OR u.effective_until>${input.asOf}::date)
 AND(${input.companyCodeId ?? null}::uuid IS NULL OR u.company_code_id=${input.companyCodeId ?? null}::uuid)) usage_company ON true LEFT JOIN LATERAL(SELECT item.id,item.status,item.created_at FROM document.business_partner_bank_verification item WHERE item.tenant_id=link.tenant_id AND item.business_partner_id=${input.businessPartnerId}::uuid AND(item.candidate_bank_account_link_id=link.id OR item.prior_bank_account_link_id=link.id) ORDER BY item.created_at DESC,item.id DESC LIMIT 1)verification ON true WHERE owner_type.code='business_partner' AND(owner_type.tenant_id IS NULL OR owner_type.tenant_id=${input.tenantId}::uuid) AND link.tenant_id=${input.tenantId}::uuid AND link.owner_id=${input.businessPartnerId}::uuid AND (${authorizedCompanyIds ?? null}::uuid[] IS NULL OR link.company_code_id IS NULL OR link.company_code_id=ANY(${authorizedCompanyIds ?? null}::uuid[])) AND link.effective_from<=${input.asOf}::date AND(link.effective_until IS NULL OR link.effective_until>${input.asOf}::date) ORDER BY link.is_primary DESC,link.effective_from DESC,link.id`.execute(
      tx,
    )
  ).rows;
  const accounts = rows.map((row) => ({
    linkId: text(row, "link_id"),
    accountId: text(row, "account_id"),
    maskedAccount: `•••• ${text(row, "account_last4")}`,
    lastFour: text(row, "account_last4"),
    accountHolderName: text(row, "account_holder_name"),
    currencyCode: text(row, "currency_code"),
    ...(optional(row, "bank_name")
      ? { bankName: optional(row, "bank_name") }
      : {}),
    ...(optional(row, "bank_country_code")
      ? { bankCountryCode: optional(row, "bank_country_code") }
      : {}),
    purpose: text(row, "purpose"),
    relationshipRole: text(row, "relationship_role"),
    ...(input.companyCodeId ? {companyCodeId:input.companyCodeId} : {}),
    source: row["mesh_source"] ? "MESH" : "NEON",
    ...(optional(row, "disclosure_status") ? {disclosureStatus:optional(row,"disclosure_status")} : {}),
    ...(input.companyCodeId ? {companyApplicable:Boolean(row["company_applicable"])} : {}),
    bic: optional(row, "bic_override"),
    accountIdType: text(row, "account_id_type"),
    companyAssignments: (row["company_assignments"] ?? []) as never,
    companyUsage: optional(row, "usage_scope") === "all_authorized_companies" ? "Available to all authorized companies" : optional(row, "company_usage") ?? "Company assignment required",
    acceptance: optional(row, "acceptance") ?? "Not accepted for use",
    primary: Boolean(input.companyCodeId && row["usage_primary"]),
    accountStatus: text(row, "account_status"),
    verified: Boolean(row["is_verified"]),
    ...(optional(row, "verification_method")
      ? { verificationMethod: optional(row, "verification_method") }
      : {}),
    ...(row["verified_at"] ? { verifiedAt: iso(row["verified_at"]) } : {}),
    ...(optional(row, "verification_id")
      ? {
          verificationState: {
            id: optional(row, "verification_id")!,
            status: optional(row, "verification_status")!,
            createdAt: iso(row["verification_created_at"]),
          },
        }
      : {}),
    effectiveFrom: date(row["effective_from"]),
    ...(row["effective_until"]
      ? { effectiveUntil: date(row["effective_until"]) }
      : {}),
    revealable: !input.historical,
  }));
  const disclosures = (await sql<Row>`SELECT p.id::text,p.projection_status,p.current_disclosure_id::text,p.current_disclosure_version,s.payload_json,s.received_at,assignments.company_assignments
    FROM control.mesh_bank_account_projection p
    JOIN control.mesh_business_partner_account_link mapping ON mapping.tenant_id=p.tenant_id AND mapping.id=p.account_link_id AND mapping.status='active'
    JOIN snapshot.mesh_bank_account_disclosure_received s ON s.tenant_id=p.tenant_id AND s.id=p.current_snapshot_id
    LEFT JOIN LATERAL (SELECT jsonb_agg(details ORDER BY details.company_name,details.purpose) company_assignments FROM (
      SELECT u.id::text assignment_id,u.company_code_id::text,company.name company_name,u.purpose,u.is_primary,u.effective_from::text,u.effective_until::text,
        u.accepted_at,u.accepted_disclosure_id::text,u.accepted_disclosure_version,verification.id::text verification_id,verification.status verification_status
      FROM master.bank_account_company_usage u
      JOIN master.bank_account_link local_link ON local_link.tenant_id=u.tenant_id AND local_link.id=u.bank_account_link_id AND local_link.owner_type='business_partner' AND local_link.owner_id=mapping.business_partner_id
      JOIN master.company_code company ON company.tenant_id=u.tenant_id AND company.id=u.company_code_id
      LEFT JOIN LATERAL (SELECT v.id,v.status FROM document.business_partner_bank_verification v
        WHERE v.tenant_id=u.tenant_id AND v.bank_projection_id=p.id AND v.company_code_id=u.company_code_id
          AND v.candidate_bank_account_link_id=local_link.id ORDER BY v.created_at DESC,v.id DESC LIMIT 1) verification ON true
      WHERE u.tenant_id=p.tenant_id AND ((u.source_tenant_id=p.source_tenant_id AND u.source_account_id::text=s.payload_json->'bankAccount'->>'sourceAccountId') OR verification.id IS NOT NULL)
        AND u.effective_from<=${input.asOf}::date AND(u.effective_until IS NULL OR u.effective_until>${input.asOf}::date)
        AND local_link.effective_from<=${input.asOf}::date AND(local_link.effective_until IS NULL OR local_link.effective_until>${input.asOf}::date)
        AND (${authorizedCompanyIds ?? null}::uuid[] IS NULL OR u.company_code_id=ANY(${authorizedCompanyIds ?? null}::uuid[]))
        AND (${input.companyCodeId ?? null}::uuid IS NULL OR u.company_code_id=${input.companyCodeId ?? null}::uuid)
    ) details) assignments ON true
    WHERE p.tenant_id=${input.tenantId}::uuid AND mapping.business_partner_id=${input.businessPartnerId}::uuid AND NOT ${input.historical}
    ORDER BY p.id`.execute(tx)).rows;
  const receivedAccounts = disclosures.map(row => receivedBankDisclosureCard(row,input.companyCodeId));
  const profile = input.companyCodeId ? (await sql<Row>`SELECT profile.id::text FROM master.company_code_supplier_profile profile
    JOIN master.supplier supplier ON supplier.tenant_id=profile.tenant_id AND supplier.id=profile.supplier_id
    WHERE profile.tenant_id=${input.tenantId}::uuid AND supplier.business_partner_id=${input.businessPartnerId}::uuid
      AND profile.company_code_id=${input.companyCodeId}::uuid AND profile.status='active' LIMIT 1`.execute(tx)).rows[0] : undefined;
  const scopeQuery = input.companyCodeId ? `?companyCodeId=${encodeURIComponent(input.companyCodeId)}` : "";
  const data: BusinessPartner360BankingData = {
    readOnly: input.historical,
    scopeState: input.historical ? "historical" : input.companyCodeId ? "scoped" : "global",
    accounts: [...accounts, ...receivedAccounts],
    ...(profile ? {supplierCompanyProfileId:String(profile["id"])} : {}),
    manageHref: href(input, "banking") + scopeQuery,
    verifyHref: href(input, "bank-verification") + scopeQuery,
  };
  return result(
    data,
    accounts.length || receivedAccounts.length ? "ready" : "empty",
    "master.bank_account_link",
  );
}
async function supplierControls(input: Input, tx: Tx) {
  const [q, p, b, c] = await Promise.all([
    sql<Row>`SELECT qualification.id::text,qualification.partner_role::text,qualification.qualification_type_code,qualification.decision::text,qualification.decision_reason,organization_scope.operating_organization_id::text,company_scope.company_code_id::text,qualification.effective_from,qualification.effective_until,qualification.next_review_at FROM control.business_partner_qualification qualification JOIN control.business_partner_decision_scope organization_scope ON organization_scope.tenant_id=qualification.tenant_id AND organization_scope.qualification_id=qualification.id AND organization_scope.scope_kind='operating_organization' AND organization_scope.scope_mode='include' AND organization_scope.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid LEFT JOIN LATERAL(SELECT scope.id,scope.company_code_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=qualification.tenant_id AND scope.qualification_id=qualification.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND(${input.companyCodeId ?? null}::uuid IS NULL OR scope.company_code_id=${input.companyCodeId ?? null}::uuid) ORDER BY scope.company_code_id,scope.id LIMIT 1)company_scope ON true WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.business_partner_id=${input.businessPartnerId}::uuid AND(${input.companyCodeId ?? null}::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=qualification.tenant_id AND scope.qualification_id=qualification.id AND scope.scope_kind='company_code' AND scope.scope_mode='include') OR company_scope.id IS NOT NULL) AND(qualification.effective_from IS NULL OR qualification.effective_from<=${input.asOf}::date) AND(qualification.effective_until IS NULL OR qualification.effective_until>${input.asOf}::date) ORDER BY qualification.qualification_type_code,qualification.id`.execute(
      tx,
    ),
    sql<Row>`SELECT preference.id::text,preference.status::text,organization_scope.operating_organization_id::text,company_scope.company_code_id::text,commodity_scope.commodity_category_ids,preference.rationale,preference.effective_from,preference.effective_until FROM control.supplier_preference_designation preference JOIN control.business_partner_decision_scope organization_scope ON organization_scope.tenant_id=preference.tenant_id AND organization_scope.supplier_preference_id=preference.id AND organization_scope.scope_kind='operating_organization' AND organization_scope.scope_mode='include' AND organization_scope.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid LEFT JOIN LATERAL(SELECT scope.id,scope.company_code_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND(${input.companyCodeId ?? null}::uuid IS NULL OR scope.company_code_id=${input.companyCodeId ?? null}::uuid) ORDER BY scope.company_code_id,scope.id LIMIT 1)company_scope ON true LEFT JOIN LATERAL(SELECT jsonb_agg(DISTINCT scope.commodity_category_id::text ORDER BY scope.commodity_category_id::text) commodity_category_ids FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='commodity_category' AND scope.scope_mode='include')commodity_scope ON true WHERE preference.tenant_id=${input.tenantId}::uuid AND preference.business_partner_id=${input.businessPartnerId}::uuid AND(${input.companyCodeId ?? null}::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='company_code' AND scope.scope_mode='include') OR company_scope.id IS NOT NULL) AND preference.effective_from<=${input.asOf}::date AND(preference.effective_until IS NULL OR preference.effective_until>${input.asOf}::date) ORDER BY preference.effective_from DESC,preference.id`.execute(
      tx,
    ),
    sql<Row>`SELECT id::text,partner_role_scope::text,operation_code,reason_code,reason,status::text,operating_organization_id::text,company_code_id::text,effective_from,effective_until FROM control.business_partner_block WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND(operating_organization_id IS NULL OR operating_organization_id=${input.operatingOrganizationId ?? null}::uuid) AND(company_code_id IS NULL OR company_code_id=${input.companyCodeId ?? null}::uuid) AND effective_from<=${input.asOf}::date AND(effective_until IS NULL OR effective_until>${input.asOf}::date) ORDER BY effective_from DESC,id`.execute(
      tx,
    ),
    sql<Row>`SELECT certification.id::text,COALESCE(type.name,certification.custom_name) name,type.issuing_body,certification.certificate_number,certification.certified_by,certification.status,certification.company_code_id::text,certification.effective_from,certification.effective_until,attachment.id::text attachment_id,attachment.file_name,attachment.content_type,attachment.size_bytes,attachment.status::text attachment_status FROM master.certification certification LEFT JOIN master.certification_type type ON(type.tenant_id IS NULL OR type.tenant_id=certification.tenant_id)AND type.id=certification.certification_type_id LEFT JOIN document.attachment attachment ON attachment.tenant_id=certification.tenant_id AND attachment.id=certification.document_attachment_id AND attachment.is_active AND attachment.is_virus_scanned AND attachment.status='active' AND (attachment.expires_at IS NULL OR attachment.expires_at>clock_timestamp()) AND EXISTS(SELECT 1 FROM document.attachment_series attachment_series WHERE attachment_series.tenant_id=attachment.tenant_id AND attachment_series.id=attachment.series_id AND attachment_series.current_attachment_id=attachment.id) WHERE certification.tenant_id=${input.tenantId}::uuid AND certification.owner_type='business_partner' AND certification.owner_id=${input.businessPartnerId}::uuid AND(certification.company_code_id IS NULL OR certification.company_code_id=${input.companyCodeId ?? null}::uuid) AND(certification.effective_from IS NULL OR certification.effective_from<=${input.asOf}::date) ORDER BY name,certification.id`.execute(
      tx,
    ),
  ]);
  const base = href(input, "commercial-controls");
  const data: BusinessPartner360SupplierControlsData = {
    readOnly: input.historical,
    scopeState: input.historical ? "historical" : input.operatingOrganizationId ? "scoped" : "global",
    qualifications: q.rows.map((row) => ({
      id: text(row, "id"),
      partnerRole: text(row, "partner_role"),
      typeCode: text(row, "qualification_type_code"),
      decision: text(row, "decision"),
      ...(optional(row, "decision_reason")
        ? { decisionReason: optional(row, "decision_reason") }
        : {}),
      ...(optional(row, "operating_organization_id")
        ? {
            operatingOrganizationId: optional(row, "operating_organization_id"),
          }
        : {}),
      ...(optional(row, "company_code_id")
        ? { companyCodeId: optional(row, "company_code_id") }
        : {}),
      ...(row["effective_from"]
        ? { effectiveFrom: date(row["effective_from"]) }
        : {}),
      ...(row["effective_until"]
        ? { effectiveUntil: date(row["effective_until"]) }
        : {}),
      ...(row["next_review_at"]
        ? { nextReviewAt: date(row["next_review_at"]) }
        : {}),
      manageHref: `${base}/qualifications/${text(row, "id")}`,
    })),
    preferences: p.rows.map((row) => {
      const commodityCategoryIds = stringArray(row["commodity_category_ids"]);
      return {
        id: text(row, "id"),
        status: text(row, "status"),
        operatingOrganizationId: text(row, "operating_organization_id"),
        ...(optional(row, "company_code_id")
          ? { companyCodeId: optional(row, "company_code_id") }
          : {}),
        ...(commodityCategoryIds.length
          ? {
              commodityCategoryId: commodityCategoryIds[0]!,
              commodityCategoryIds,
            }
          : {}),
        rationale: text(row, "rationale"),
        effectiveFrom: date(row["effective_from"]),
        ...(row["effective_until"]
          ? { effectiveUntil: date(row["effective_until"]) }
          : {}),
        manageHref: `${base}/preferences/${text(row, "id")}`,
      };
    }),
    blocks: b.rows.map((row) => ({
      id: text(row, "id"),
      roleScope: text(row, "partner_role_scope"),
      operationCode: text(row, "operation_code"),
      ...(optional(row, "reason_code")
        ? { reasonCode: optional(row, "reason_code") }
        : {}),
      reason: text(row, "reason"),
      status: text(row, "status"),
      ...(optional(row, "operating_organization_id")
        ? {
            operatingOrganizationId: optional(row, "operating_organization_id"),
          }
        : {}),
      ...(optional(row, "company_code_id")
        ? { companyCodeId: optional(row, "company_code_id") }
        : {}),
      effectiveFrom: iso(row["effective_from"]),
      ...(row["effective_until"]
        ? { effectiveUntil: iso(row["effective_until"]) }
        : {}),
      manageHref: `${base}/blocks/${text(row, "id")}`,
    })),
    certifications: c.rows.map((row) => ({
      id: text(row, "id"),
      name: text(row, "name"),
      ...(optional(row, "issuing_body")
        ? { issuingBody: optional(row, "issuing_body") }
        : {}),
      ...(optional(row, "certificate_number")
        ? { certificateNumber: optional(row, "certificate_number") }
        : {}),
      ...(optional(row, "certified_by")
        ? { certifiedBy: optional(row, "certified_by") }
        : {}),
      status: text(row, "status"),
      ...(optional(row, "company_code_id")
        ? { companyCodeId: optional(row, "company_code_id") }
        : {}),
      ...(row["effective_from"]
        ? { effectiveFrom: date(row["effective_from"]) }
        : {}),
      ...(row["effective_until"]
        ? { effectiveUntil: date(row["effective_until"]) }
        : {}),
      ...(optional(row, "attachment_id")
        ? {
            attachment: {
              attachmentId: optional(row, "attachment_id")!,
              fileName: optional(row, "file_name")!,
              ...(optional(row, "content_type")
                ? { contentType: optional(row, "content_type") }
                : {}),
              ...(row["size_bytes"] !== null && row["size_bytes"] !== undefined
                ? { sizeBytes: Number(row["size_bytes"]) }
                : {}),
              status: optional(row, "attachment_status")!,
              downloadHref: `/api/attachments/${optional(row, "attachment_id")!}/download`,
            },
          }
        : {}),
      manageHref: `${base}/certifications/${text(row, "id")}`,
    })),
  };
  return result(
    data,
    q.rows.length + p.rows.length + b.rows.length + c.rows.length
      ? "ready"
      : "empty",
    "control.business_partner_qualification",
  );
}
async function credit(input: Input, tx: Tx) {
  if (!input.operatingOrganizationId || !input.companyCodeId)
    return result(
      {
        title: "Credit review",
        readOnly: true,
        scopeState: input.historical ? "historical" : "missing_scope",
        reviews: [],
        createHref: href(input, "credit-reviews/new"),
      } satisfies BusinessPartner360CreditReviewData,
      "empty",
      "control.customer_credit_review",
    );
  const rows = (
    await sql<Row>`SELECT review.id::text,review.review_type_code,review.requested_credit_limit,review.requested_currency_code::text,review.approved_credit_limit,review.approved_currency_code::text,review.decision,review.decision_reason,review.conditions,review.effective_from,review.effective_until,review.reviewed_at,company_scope.company_code_id::text FROM control.customer_credit_review review JOIN control.business_partner_decision_scope organization_scope ON organization_scope.tenant_id=review.tenant_id AND organization_scope.credit_review_id=review.id AND organization_scope.scope_kind='operating_organization' AND organization_scope.scope_mode='include' AND organization_scope.operating_organization_id=${input.operatingOrganizationId}::uuid JOIN control.business_partner_decision_scope company_scope ON company_scope.tenant_id=review.tenant_id AND company_scope.credit_review_id=review.id AND company_scope.scope_kind='company_code' AND company_scope.scope_mode='include' AND company_scope.company_code_id=${input.companyCodeId}::uuid WHERE review.tenant_id=${input.tenantId}::uuid AND review.business_partner_id=${input.businessPartnerId}::uuid AND review.effective_from<=${input.asOf}::date AND(review.effective_until IS NULL OR review.effective_until>${input.asOf}::date) ORDER BY review.created_at DESC,review.id DESC`.execute(
      tx,
    )
  ).rows;
  const base = href(input, "credit-reviews"),
    reviews = rows.map((row) => ({
      id: text(row, "id"),
      reviewTypeCode: text(row, "review_type_code"),
      ...(row["requested_credit_limit"] !== null
        ? { requestedCreditLimit: Number(row["requested_credit_limit"]) }
        : {}),
      ...(optional(row, "requested_currency_code")
        ? { requestedCurrencyCode: optional(row, "requested_currency_code") }
        : {}),
      ...(row["approved_credit_limit"] !== null
        ? { approvedCreditLimit: Number(row["approved_credit_limit"]) }
        : {}),
      ...(optional(row, "approved_currency_code")
        ? { approvedCurrencyCode: optional(row, "approved_currency_code") }
        : {}),
      decision: text(row, "decision"),
      ...(optional(row, "decision_reason")
        ? { decisionReason: optional(row, "decision_reason") }
        : {}),
      conditions: Array.isArray(row["conditions"])
        ? (row["conditions"] as unknown[])
        : [],
      effectiveFrom: date(row["effective_from"]),
      ...(row["effective_until"]
        ? { effectiveUntil: date(row["effective_until"]) }
        : {}),
      ...(row["reviewed_at"] ? { reviewedAt: iso(row["reviewed_at"]) } : {}),
      companyCodeId: text(row, "company_code_id"),
      manageHref: `${base}/${text(row, "id")}`,
    })),
    current = reviews.find(
      (review) =>
        (review.decision === "approved" || review.decision === "conditional") &&
        review.approvedCreditLimit !== undefined &&
        review.approvedCurrencyCode,
    );
  const data: BusinessPartner360CreditReviewData = {
    title: "Credit review",
    readOnly: input.historical,
    scopeState: input.historical ? "historical" : "scoped",
    ...(current
      ? {
          currentLimit: {
            creditReviewId: current.id,
            amount: current.approvedCreditLimit!,
            currencyCode: current.approvedCurrencyCode!,
            decision: current.decision,
            effectiveFrom: current.effectiveFrom,
            ...(current.effectiveUntil
              ? { effectiveUntil: current.effectiveUntil }
              : {}),
          },
        }
      : {}),
    reviews,
    createHref: `${base}/new`,
  };
  return result(
    data,
    rows.length ? "ready" : "empty",
    "control.customer_credit_review",
  );
}
function result(
  data: unknown,
  state: "ready" | "empty" | "partial",
  sourceObject: string,
): BusinessPartner360CommercialControlRead {
  return {
    data,
    state,
    provenance: [
      {
        plane: "neon",
        service: "master-data",
        sourceObject,
        observedAt: new Date().toISOString(),
        schemaVersion: "1",
      },
    ],
  };
}
function href(input: Input, path: string) {
  return `/mdg/business-partner/${encodeURIComponent(input.businessPartnerId)}/${path}`;
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
function stringArray(value: unknown): readonly string[] {
  const parsed =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}
function iso(value: unknown) {
  return (
    value instanceof Date ? value : new Date(String(value))
  ).toISOString();
}
function date(value: unknown) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}
