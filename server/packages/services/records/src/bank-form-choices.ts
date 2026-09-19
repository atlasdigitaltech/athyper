import { sql, type Kysely } from "kysely";
export const bankFormSources = [
  "shared.bank_institution",
  "shared.bank_branch",
  "control.bank_account_type",
  "control.bank_country",
] as const;
/** Shared published reference data only. Called after entity form access has been authorized. */
export async function bankFormChoices(database: Kysely<any>, source: string) {
  if (source === "control.bank_country") {
    const result = await sql<{
      code: string;
      name: string;
      capture: Record<string, any> | null;
    }>`
      SELECT c.code,c.name,r.validation_schema->'capture' capture FROM shared.country c
      LEFT JOIN LATERAL (SELECT validation_schema FROM control.bank_account_validation_rule
        WHERE country_code=c.code AND status='active' AND validation_schema ? 'capture'
        ORDER BY priority DESC,code LIMIT 1) r ON true ORDER BY c.name`.execute(
      database,
    );
    return result.rows.map((r) => ({
      value: r.code.trim(),
      label: r.name,
      data: r.capture ?? {},
    }));
  }
  if (source === "control.bank_account_type") {
    const result = await sql<{
      kind: string;
      countries: string[];
    }>`SELECT account_identifier_type kind,array_agg(DISTINCT country_code::text) countries FROM control.bank_account_validation_rule WHERE status='active' AND account_identifier_type IN ('local','iban') GROUP BY account_identifier_type ORDER BY account_identifier_type`.execute(
      database,
    );
    return result.rows.map((row) => ({
      value: row.kind === "local" ? "local_account" : "iban",
      label: row.kind === "local" ? "Local account" : "IBAN",
      data: { countries: row.countries.map((c) => c.trim()) },
    }));
  }
  if (source !== "shared.bank_institution" && source !== "shared.bank_branch")
    throw Error("INTAKE_LOOKUP_SOURCE_UNREGISTERED");
  const result = await sql<{
    id: string;
    branch_id: string | null;
    release_id: string;
    name: string;
    country_code: string;
    branch_name: string | null;
    bic: string | null;
    branch_code: string | null;
  }>`SELECT d.* FROM shared.v_bank_directory d JOIN shared.v_bank_institution i ON i.institution_id=d.id WHERE i.status='active' AND i.effective_from<=CURRENT_DATE AND (i.effective_until IS NULL OR i.effective_until>CURRENT_DATE) AND (${source === "shared.bank_institution"} AND d.branch_id IS NULL OR ${source === "shared.bank_branch"} AND EXISTS(SELECT 1 FROM shared.v_bank_branch b WHERE b.branch_id=d.branch_id AND b.status='active' AND b.effective_from<=CURRENT_DATE AND (b.effective_until IS NULL OR b.effective_until>CURRENT_DATE))) ORDER BY d.name,d.branch_name,d.id LIMIT 2001`.execute(
    database,
  );
  if (result.rows.length > 2000)
    throw Error("INTAKE_LOOKUP_REQUIRES_PAGED_SOURCE");
  return result.rows.map((row) => ({
    value: row.branch_id ?? row.id,
    label: row.branch_id ? row.branch_name! : row.name,
    data: {
      institutionId: row.id,
      releaseId: row.release_id,
      countryCode: row.country_code.trim(),
      name: row.name,
      branch: row.branch_name ?? "",
      bic: row.bic ?? "",
      branchCode: row.branch_code ?? "",
    },
  }));
}
