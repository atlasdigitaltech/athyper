/**
 * Copy line-scope pricing_component rows from a contract-typed commitment_line
 * onto a downstream commitment_line during PR/contract → PO conversion or when
 * a line is inserted with parent_contract_line_id set.
 *
 * MODELING ASSUMPTION (verified by seed assertion C21):
 *   Contract lines are commitment_line rows whose parent commitment carries
 *   commitment_type='contract'. Their pricing terms live in
 *   document.pricing_component keyed by
 *     (source_doc_type='commitment_line', source_line_id=<contract-line-id>).
 *   If contract terms are stored elsewhere (e.g. a dedicated contract_term
 *   table), this function copies nothing (hadSource=false) and the caller
 *   must fall back to a different resolver.
 *
 * Called from applyCommitmentLineDefaults when the just-inserted line carries
 * parent_contract_line_id. Not called from commitment-from-requisition
 * directly — PR-based conversions do not carry contract references.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export interface CopyPricingComponentInput {
  tenantId:             string;
  parentContractLineId: string;
  commitmentLineId:     string;
  commitmentId:         string;
  companyCodeId:        string;
  currencyCode:         string;
  baseCurrencyCode:     string;
  exchangeRate:         number;
  principalId:          string | null;
}

export async function copyPricingComponentsFromContractLine(
  db: AnyDb,
  input: CopyPricingComponentInput,
): Promise<{ copied: number; hadSource: boolean }> {
  // Guard: verify there are source rows to copy — surfaces the modeling
  // assumption early rather than returning silent zero.
  const src = await sql<{ n: number }>`
    SELECT count(*)::int AS n
      FROM document.pricing_component pc
     WHERE pc.tenant_id        = ${input.tenantId}::uuid
       AND pc.source_doc_type  = 'commitment_line'
       AND pc.source_line_id   = ${input.parentContractLineId}::uuid
       AND pc.superseded_by_id IS NULL
       AND pc.entry_level      = 'line'
  `.execute(db);
  const hadSource = (src.rows[0]?.n ?? 0) > 0;
  if (!hadSource) return { copied: 0, hadSource: false };

  const actor = input.principalId ?? SYSTEM_ACTOR;

  const result = await sql`
    INSERT INTO document.pricing_component (
        tenant_id, company_code_id,
        source_doc_type, source_doc_id, source_line_id,
        term_type, condition_type_id, sequence,
        basis, rate_value, amount_value,
        entry_level, origin,
        ref_source_doc_type, ref_source_doc_id, ref_source_line_id,
        tax_group_id, is_inclusive, recoverable_pct, tax_section_code,
        currency_code, base_currency_code, exchange_rate,
        created_by
    )
    SELECT
        ${input.tenantId}::uuid, ${input.companyCodeId}::uuid,
        'commitment_line', ${input.commitmentId}::uuid, ${input.commitmentLineId}::uuid,
        pc.term_type, pc.condition_type_id, pc.sequence,
        pc.basis, pc.rate_value, pc.amount_value,
        'line', 'inherited',
        'commitment_line', pc.source_doc_id, ${input.parentContractLineId}::uuid,
        pc.tax_group_id, pc.is_inclusive, pc.recoverable_pct, pc.tax_section_code,
        ${input.currencyCode}, ${input.baseCurrencyCode}, ${input.exchangeRate},
        ${actor}::uuid
      FROM document.pricing_component pc
     WHERE pc.tenant_id        = ${input.tenantId}::uuid
       AND pc.source_doc_type  = 'commitment_line'
       AND pc.source_line_id   = ${input.parentContractLineId}::uuid
       AND pc.superseded_by_id IS NULL
       AND pc.entry_level      = 'line'
  `.execute(db);

  return { copied: Number(result.numAffectedRows ?? 0), hadSource: true };
}
