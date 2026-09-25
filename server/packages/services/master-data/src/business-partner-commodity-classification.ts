import { sql, type Transaction } from "kysely";
import { readCrosswalkEvidence } from "./business-partner-crosswalk-evidence.js";

export interface PartnerCommodityQuery {
  readonly tenantId: string;
  readonly businessPartnerId: string;
  readonly asOf: string;
  readonly limit?: number;
  readonly afterId?: string;
  readonly snapshotAt?: string;
}

/** Authorized callers only. No role, organization, qualification or company predicates. */
export async function readPartnerCommodityClassifications(
  input: PartnerCommodityQuery,
  tx: Transaction<Record<string, never>>,
) {
  if (
    input.limit !== undefined &&
    (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
  )
    throw new TypeError(
      "Classification page limit must be an integer between 1 and 100",
    );
  const limit = input.limit ?? 25;
  const result = await sql<{
    id: string;
    commodityCodeId: string | null;
    commodityCode: string | null;
    commodityName: string | null;
    levelNo: number | null;
    categoryId: string;
    categoryCode: string;
    categoryName: string;
    assignmentKind: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
    sourceSystem: string;
    sourceReference: string;
    status: string;
    recordVersion: string;
    verifiedAt: string | null;
  }>`SELECT c.id::text,c.commodity_code_id::text AS "commodityCodeId",direct.code AS "commodityCode",
    direct.name AS "commodityName",direct.level_no AS "levelNo",
    c.commodity_category_id::text AS "categoryId",category.code AS "categoryCode",
    category.name AS "categoryName",c.assignment_kind AS "assignmentKind",c.effective_from::text AS "effectiveFrom",
    c.effective_until::text AS "effectiveUntil",c.source_system AS "sourceSystem",c.source_reference AS "sourceReference",
    c.status::text,c.record_version::text AS "recordVersion",c.verified_at::text AS "verifiedAt"
    FROM master.business_partner_commodity_classification c
    LEFT JOIN master.commodity_category category ON category.tenant_id=c.tenant_id AND category.id=c.commodity_category_id
    LEFT JOIN shared.commodity_code direct ON direct.id=c.commodity_code_id
    WHERE c.tenant_id=${input.tenantId}::uuid AND c.business_partner_id=${input.businessPartnerId}::uuid
      AND c.status='active' AND (category.status='active' OR direct.domain_code='unspsc')
      AND c.effective_from<=${input.asOf}::date AND(c.effective_until IS NULL OR c.effective_until>${input.asOf}::date)
      AND (${input.afterId ?? null}::uuid IS NULL OR c.id>${input.afterId ?? null}::uuid)
      AND c.created_at<=${input.snapshotAt ?? new Date().toISOString()}::timestamptz
    ORDER BY c.id LIMIT ${limit + 1}`.execute(tx);
  const selected = result.rows.slice(0, limit);
  if (!selected.length) return { items: [], hasMore: false };
  const categories = [
    ...new Set(selected.map((row) => row.categoryId).filter(Boolean)),
  ];
  const codes = await sql<{
    categoryId: string;
    domainCode: string;
    code: string;
    name: string;
    mappingType: string;
    confidence: number | null;
    provenance: string;
  }>`SELECT assignment.commodity_category_id::text AS "categoryId",code.domain_code AS "domainCode",code.code,code.name,
    assignment.mapping_type::text AS "mappingType",assignment.confidence::float8 AS confidence,assignment.provenance::text
    FROM master.commodity_code_assignment assignment JOIN shared.commodity_code code
      ON code.id=assignment.commodity_code_id AND code.domain_code=assignment.commodity_domain_code AND code.is_active
    WHERE assignment.tenant_id=${input.tenantId}::uuid AND assignment.commodity_category_id=ANY(${categories}::uuid[])
      AND assignment.is_active ORDER BY assignment.commodity_category_id,code.domain_code,code.code`.execute(
    tx,
  );
  const directCodes = selected
    .filter((row) => row.commodityCodeId)
    .map((row) => ({
      categoryId: null,
      domainCode: "unspsc",
      code: row.commodityCode!,
      name: row.commodityName!,
      mappingType: "direct_declaration",
      confidence: null,
      provenance: "partner_declaration",
    }));
  const crosswalks = await readCrosswalkEvidence(tx, "commodity", [
    ...codes.rows,
    ...directCodes,
  ]);
  const mappings = selected.some((row) => row.commodityCodeId)
    ? (
        await sql<{
          commodityCodeId: string;
          categoryId: string;
          categoryCode: string;
          categoryName: string;
          mappingType: string;
          confidence: number | null;
          provenance: string;
        }>`SELECT a.commodity_code_id::text AS "commodityCodeId",c.id::text AS "categoryId",
    c.code AS "categoryCode",c.name AS "categoryName",a.mapping_type::text AS "mappingType",
    a.confidence::float8 AS confidence,a.provenance::text
    FROM master.commodity_code_assignment a JOIN master.commodity_category c
      ON c.tenant_id=a.tenant_id AND c.id=a.commodity_category_id AND c.status='active'
    WHERE a.tenant_id=${input.tenantId}::uuid AND a.is_active AND a.commodity_domain_code='unspsc'
      AND a.commodity_code_id=ANY(${selected.map((row) => row.commodityCodeId).filter(Boolean)}::uuid[])
    ORDER BY c.code`.execute(tx)
      ).rows
    : [];
  return {
    items: selected.map((row) => ({
      ...row,
      classificationBasis: row.commodityCodeId
        ? "direct_unspsc"
        : "legacy_category",
      categoryMappings: mappings.filter(
        (mapping) => mapping.commodityCodeId === row.commodityCodeId,
      ),
      mappingStatus: row.commodityCodeId
        ? mappings.some(
            (mapping) => mapping.commodityCodeId === row.commodityCodeId,
          )
          ? "mapped"
          : "not_mapped"
        : "legacy_category",
      commodityCodes: (row.commodityCodeId
        ? directCodes.filter((code) => code.code === row.commodityCode)
        : codes.rows.filter((code) => code.categoryId === row.categoryId)
      ).map((code) => ({
        ...code,
        crosswalks: crosswalks.filter(
          (mapping) =>
            (mapping.sourceDomainCode === code.domainCode &&
              mapping.sourceCode === code.code) ||
            (mapping.targetDomainCode === code.domainCode &&
              mapping.targetCode === code.code),
        ),
      })),
    })),
    hasMore: result.rows.length > limit,
  };
}
