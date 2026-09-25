import { sql, type Transaction } from "kysely";

/** Reference evidence only: never substitutes the owner's selected classification. */
export async function readCrosswalkEvidence(
  tx: Transaction<Record<string, never>>,
  kind: "commodity" | "industry",
  sources: readonly { domainCode: string; code: string }[],
) {
  if (!sources.length) return [];
  const crosswalk = sql.table(`shared.${kind}_crosswalk`);
  const catalog = sql.table(`shared.${kind}_code`);
  const result = await sql<{
    id: string;
    sourceDomainCode: string;
    sourceCode: string;
    targetDomainCode: string;
    targetCode: string;
    targetName: string;
    mappingType: string;
    confidence: number | null;
    provenance: string;
    verified: boolean;
  }>`SELECT x.id::text, x.source_domain_code AS "sourceDomainCode", x.source_code AS "sourceCode",
      x.target_domain_code AS "targetDomainCode", x.target_code AS "targetCode", target.name AS "targetName",
      x.mapping_type::text AS "mappingType", x.confidence::float8 AS confidence,
      x.provenance::text AS provenance, x.is_verified AS verified
    FROM ${crosswalk} x
    JOIN ${catalog} source ON source.domain_code=x.source_domain_code AND source.code=x.source_code AND source.is_active
    JOIN ${catalog} target ON target.domain_code=x.target_domain_code AND target.code=x.target_code AND target.is_active
    WHERE x.is_active AND EXISTS (
      SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(sources)}::jsonb) requested("domainCode" text, code text)
      WHERE (requested."domainCode"=x.source_domain_code AND requested.code=x.source_code)
        OR (requested."domainCode"=x.target_domain_code AND requested.code=x.target_code)
    ) ORDER BY x.source_domain_code,x.source_code,x.target_domain_code,x.target_code,x.id`.execute(
    tx,
  );
  return result.rows.map((row) => ({ ...row, readOnly: true as const }));
}
