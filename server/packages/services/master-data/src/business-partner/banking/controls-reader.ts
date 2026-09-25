import { stringArray } from "../record/string-array.js";
import { requiredText as text, optionalText as optional, timestamp as iso, dateOnly as date } from "../record/row-values.js";
import { readPartnerBankingFacts } from "./facts-reader.js";
import { publicDecisionScopes, type ScopeRow } from "../../partner-decision-scope.js";
import { readCrosswalkEvidence } from "../../business-partner-crosswalk-evidence.js";
import { sql, type Transaction } from "kysely";
import type {
  BusinessPartner360CommodityCodeItem,
  BusinessPartner360CreditReviewData,
  BusinessPartner360SupplierControlsData,
} from "@athyper/server-contract-master-data";
import type {
  BusinessPartner360CommercialControlRead,
  BusinessPartner360Repository,
} from "../record/service.js";
type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;
type Input = Parameters<
  BusinessPartner360Repository<Tx>["readCommercialControlSection"]
>[0];
export async function readBusinessPartner360CommercialControlSection(
  input: Input,
  tx: Tx,
): Promise<BusinessPartner360CommercialControlRead> {
  if (input.sectionCode === "banking") return readPartnerBankingFacts(input, tx);
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
    sql<Row>`SELECT classification.id::text,'partner'::text partner_role,classification.status::text,classification.effective_from,classification.effective_until,classification.notes,category.id::text category_id,category.code category_code,category.name category_name,COALESCE(jsonb_agg(jsonb_build_object('domainCode',code.domain_code,'code',code.code,'name',code.name,'mappingType',assignment.mapping_type::text,'confidence',assignment.confidence,'provenance',assignment.provenance::text,'primary',assignment.is_owner_primary,'routingDefault',assignment.is_code_routing_default) ORDER BY code.domain_code,code.code) FILTER(WHERE assignment.id IS NOT NULL),'[]'::jsonb) commodity_codes FROM master.business_partner_commodity_classification classification JOIN master.commodity_category category ON category.tenant_id=classification.tenant_id AND category.id=classification.commodity_category_id LEFT JOIN master.commodity_code_assignment assignment ON assignment.tenant_id=classification.tenant_id AND assignment.commodity_category_id=classification.commodity_category_id AND assignment.is_active LEFT JOIN shared.commodity_code code ON code.domain_code=assignment.commodity_domain_code AND code.id=assignment.commodity_code_id AND code.is_active WHERE classification.tenant_id=${input.tenantId}::uuid AND classification.business_partner_id=${input.businessPartnerId}::uuid AND classification.status='active' AND classification.effective_from<=${input.asOf}::date AND(classification.effective_until IS NULL OR classification.effective_until>${input.asOf}::date) GROUP BY classification.id,classification.status,classification.effective_from,classification.effective_until,classification.notes,category.id,category.code,category.name ORDER BY category.code,classification.id`.execute(
      tx,
    ),
    sql<Row>`SELECT qualification.id::text,COALESCE(jsonb_agg(DISTINCT classification.id::text ORDER BY classification.id::text),'[]'::jsonb) commodity_capability_ids FROM control.business_partner_qualification qualification JOIN control.business_partner_decision_scope reference ON reference.tenant_id=qualification.tenant_id AND reference.qualification_id=qualification.id JOIN master.business_partner_commodity_classification classification ON classification.tenant_id=reference.tenant_id AND classification.id=reference.commodity_classification_id WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.business_partner_id=${input.businessPartnerId}::uuid AND EXISTS(SELECT 1 FROM control.business_partner_decision_scope organization_scope WHERE organization_scope.tenant_id=qualification.tenant_id AND organization_scope.qualification_id=qualification.id AND organization_scope.scope_kind='operating_organization' AND organization_scope.scope_mode='include' AND organization_scope.operating_organization_id=${input.operatingOrganizationId}::uuid) GROUP BY qualification.id ORDER BY qualification.id`.execute(
      tx,
    ),
  ]);
  const crosswalks = await readCrosswalkEvidence(tx, "commodity",
    capabilityResult.rows.flatMap(row => commodityCodes(row["commodity_codes"])));
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
    commodityCodes: commodityCodes(row["commodity_codes"]).map(code => ({ ...code,
      crosswalks: crosswalks.filter(mapping => (mapping.sourceDomainCode === code.domainCode && mapping.sourceCode === code.code) || (mapping.targetDomainCode === code.domainCode && mapping.targetCode === code.code)),
    })),
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
        "master.business_partner_commodity_classification",
        "master.commodity_category",
        "master.commodity_code_assignment",
        "shared.commodity_code",
        "shared.commodity_crosswalk",
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
            ...(typeof item["confidence"] === "number" ? { confidence: item["confidence"] } : {}),
            ...(typeof item["provenance"] === "string" ? { provenance: item["provenance"] } : {}),
            primary: Boolean(item["primary"]),
            routingDefault: Boolean(item["routingDefault"]),
          },
        ]
      : [];
  });
}

async function supplierControls(input: Input, tx: Tx) {
  const [q, p, b, c] = await Promise.all([
    sql<Row>`SELECT qualification.*, COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.scope_group,s.id) FROM control.business_partner_decision_scope s WHERE s.tenant_id=qualification.tenant_id AND s.qualification_id=qualification.id),'[]'::jsonb) coverage FROM control.business_partner_qualification qualification WHERE qualification.tenant_id=${input.tenantId}::uuid AND qualification.business_partner_id=${input.businessPartnerId}::uuid ORDER BY qualification.created_at DESC,qualification.id`.execute(
      tx,
    ),
    sql<Row>`SELECT preference.id::text,preference.status::text,organization_scope.operating_organization_id::text,company_scope.company_code_id::text,commodity_scope.commodity_category_ids,preference.rationale,preference.effective_from,preference.effective_until FROM control.supplier_preference_designation preference JOIN control.business_partner_decision_scope organization_scope ON organization_scope.tenant_id=preference.tenant_id AND organization_scope.supplier_preference_id=preference.id AND organization_scope.scope_kind='operating_organization' AND organization_scope.scope_mode='include' AND organization_scope.operating_organization_id=${input.operatingOrganizationId ?? null}::uuid LEFT JOIN LATERAL(SELECT scope.id,scope.company_code_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='company_code' AND scope.scope_mode='include' AND(${input.companyCodeId ?? null}::uuid IS NULL OR scope.company_code_id=${input.companyCodeId ?? null}::uuid) ORDER BY scope.company_code_id,scope.id LIMIT 1)company_scope ON true LEFT JOIN LATERAL(SELECT jsonb_agg(DISTINCT scope.commodity_category_id::text ORDER BY scope.commodity_category_id::text) commodity_category_ids FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='commodity_category' AND scope.scope_mode='include')commodity_scope ON true WHERE preference.tenant_id=${input.tenantId}::uuid AND preference.business_partner_id=${input.businessPartnerId}::uuid AND(${input.companyCodeId ?? null}::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=preference.tenant_id AND scope.supplier_preference_id=preference.id AND scope.scope_kind='company_code' AND scope.scope_mode='include') OR company_scope.id IS NOT NULL) AND preference.effective_from<=${input.asOf}::date AND(preference.effective_until IS NULL OR preference.effective_until>${input.asOf}::date) ORDER BY preference.effective_from DESC,preference.id`.execute(
      tx,
    ),
    sql<Row>`SELECT b.*,COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.scope_group,s.id) FROM control.business_partner_decision_scope s WHERE s.tenant_id=b.tenant_id AND s.block_id=b.id),'[]'::jsonb) coverage FROM control.business_partner_block b WHERE b.tenant_id=${input.tenantId}::uuid AND b.business_partner_id=${input.businessPartnerId}::uuid ORDER BY b.effective_from DESC,b.id`.execute(
      tx,
    ),
    sql<Row>`SELECT certification.id::text,certification.certification_type_id::text,certification.custom_name,COALESCE(type.name,certification.custom_name) name,type.issuing_body,certification.certificate_number,certification.certified_by,certification.status,certification.company_code_id::text,certification.effective_from,certification.effective_until,attachment.id::text attachment_id,attachment.file_name,attachment.content_type,attachment.size_bytes,attachment.status::text attachment_status FROM master.certification certification LEFT JOIN master.certification_type type ON(type.tenant_id IS NULL OR type.tenant_id=certification.tenant_id)AND type.id=certification.certification_type_id LEFT JOIN document.attachment attachment ON attachment.tenant_id=certification.tenant_id AND attachment.id=certification.document_attachment_id AND attachment.is_active AND attachment.is_virus_scanned AND attachment.status='active' AND (attachment.expires_at IS NULL OR attachment.expires_at>clock_timestamp()) AND EXISTS(SELECT 1 FROM document.attachment_series attachment_series WHERE attachment_series.tenant_id=attachment.tenant_id AND attachment_series.id=attachment.series_id AND attachment_series.current_attachment_id=attachment.id) WHERE certification.tenant_id=${input.tenantId}::uuid AND certification.owner_type='business_partner' AND certification.owner_id=${input.businessPartnerId}::uuid AND(certification.company_code_id IS NULL OR certification.company_code_id=${input.companyCodeId ?? null}::uuid) AND(certification.effective_from IS NULL OR certification.effective_from<=${input.asOf}::date) AND(certification.effective_until IS NULL OR certification.effective_until>${input.asOf}::date) ORDER BY name,certification.id`.execute(
      tx,
    ),
  ]);
  const base = href(input, "commercial-controls");
  const data: BusinessPartner360SupplierControlsData = {
    readOnly: input.historical,
    scopeState: input.historical
      ? "historical"
      : input.operatingOrganizationId
        ? "scoped"
        : "global",
    qualifications: q.rows.map((row) => ({
      id: text(row, "id"),
      partnerRole: "See coverage",
      coverage:publicDecisionScopes((row["coverage"] ?? []) as ScopeRow[]),contextKind:row["context_kind"],contextId:row["context_id"],
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
      roleScope: "See coverage",
      operationCode: stringArray(row["operation_codes"]).join(", "),
      operationCodes:stringArray(row["operation_codes"]),coverage:publicDecisionScopes((row["coverage"] ?? []) as ScopeRow[]),contextKind:row["context_kind"],contextId:row["context_id"],restrictionMode:row["restriction_mode"],targetEntityType:row["target_entity_type"],targetEntityId:row["target_entity_id"],targetLineId:row["target_line_id"],
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
      ...(optional(row, "custom_name") ? { customName: optional(row, "custom_name") } : {}),
      ...(optional(row, "certification_type_id") ? { certificationTypeId: optional(row, "certification_type_id") } : {}),
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

