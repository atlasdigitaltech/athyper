CREATE VIEW document.active_attachment AS
SELECT *
  FROM document.attachment
 WHERE status NOT IN ('deleted', 'expired', 'rejected');

CREATE VIEW document.active_comment AS
SELECT *
  FROM document.comment
 WHERE deleted_at IS NULL
   AND status <> 'deleted';

-- Migrated from the 2026-08-01 live Neon catalog snapshot.
-- Dependencies were checked against the active Neon foundation manifest.

-- ============================================================================
-- document/07_views.sql
-- Views and materialized views reconstructed from the live catalog.
-- Generated from the live Neon database document schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE VIEW "document"."purchase_order"
WITH (security_invoker = true, security_barrier = true) AS
SELECT id,
    tenant_id,
    company_code_id,
    code,
    name,
    order_type,
    status,
    'SUPPLIER'::text AS party_type,
    supplier_id AS party_id,
    parent_commitment_id,
    release_sequence_no,
    requested_by,
    responsible_principal_id AS responsible_person_id,
    approved_by,
    approved_at,
    workflow_request_id,
    document_date,
    effective_date,
    expiry_date,
    NULL::smallint AS fiscal_year,
    NULL::smallint AS period_number,
    currency_code,
    base_currency_code,
    exchange_rate,
    fx_rate_snapshot,
    fx_policy,
    total_amount,
    NULL::numeric(18,4) AS scheduled_amount,
    NULL::numeric(18,4) AS released_amount,
    NULL::numeric(18,4) AS fulfilled_amount,
    NULL::numeric(18,4) AS invoiced_amount,
    NULL::numeric(18,4) AS paid_amount,
    payment_term_id,
    budget_check_result,
    encumbrance_journal_entry_id AS encumbrance_je_id,
    NULL::jsonb AS renewal_terms,
    0::smallint AS renewal_count,
    NULL::uuid AS renewed_from_id,
    false AS is_provisional,
    NULL::timestamptz AS draft_expires_at,
    NULL::timestamptz AS draft_started_at,
    NULL::uuid AS draft_started_by,
    '[]'::jsonb AS tags,
    metadata,
    status NOT IN ('cancelled', 'rejected', 'closed', 'expired') AS is_active,
    status_changed_at,
    status_changed_by,
    row_version,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM document.commitment c
  WHERE commitment_type = 'purchase_order'::text;

COMMENT ON VIEW "document"."purchase_order" IS 'Read-compatible projection over document.commitment filtered to commitment_type=''purchase_order''. Removed legacy fields are explicit typed compatibility values; new writes target document.commitment.';

CREATE OR REPLACE VIEW "document"."v_ap_invoice_summary"
WITH (security_invoker = true, security_barrier = true) AS
SELECT id AS purchase_invoice_id,
    tenant_id,
    code,
    status AS invoice_status,
    supplier_id,
    payable_amount,
    paid_amount,
    outstanding_amount,
    due_date,
    posting_date,
    company_code_id
   FROM document.purchase_invoice pi;

COMMENT ON VIEW "document"."v_ap_invoice_summary" IS 'One row per purchase_invoice. Safe for SUM/AVG aggregation over PI columns.';

CREATE OR REPLACE VIEW "document"."v_ap_settlement_graph"
WITH (security_invoker = true, security_barrier = true) AS
SELECT pi.id AS purchase_invoice_id,
    pi.tenant_id,
    pi.code,
    pi.status AS invoice_status,
    pi.payable_amount,
    pi.paid_amount,
    pi.outstanding_amount,
    pil.id AS purchase_invoice_line_id,
    pil.line_no,
    ad.id AS accounting_distribution_id,
    je.id AS journal_entry_id,
    je.journal_number AS je_number,
    jl.id AS journal_line_id,
    pea.id AS payment_allocation_id,
    pea.allocated_amount,
    pea.net_payment_amount,
    pe.id AS payment_entry_id,
    pe.payment_number,
    pe.status AS payment_status,
    pe.status = 'cancelled' AS payment_is_voided,
    prm.id AS remittance_output_id,
    brc.id AS bank_recon_case_id,
    brc.status AS recon_status,
    brc.case_number AS recon_case_number
   FROM document.purchase_invoice pi
     LEFT JOIN document.purchase_invoice_line pil ON pil.purchase_invoice_id = pi.id AND pil.tenant_id = pi.tenant_id
     LEFT JOIN document.accounting_distribution ad ON ad.source_line_id = pil.id AND ad.tenant_id = pil.tenant_id AND ad.source_entity_type = 'purchase_invoice_line'::text
     LEFT JOIN document.journal_entry je ON je.id = pi.ap_journal_entry_id AND je.tenant_id = pi.tenant_id
     LEFT JOIN document.journal_line jl ON jl.journal_entry_id = je.id AND jl.tenant_id = je.tenant_id
     LEFT JOIN document.payment_entry_allocation pea ON pea.purchase_invoice_id = pi.id AND pea.tenant_id = pi.tenant_id
     LEFT JOIN document.payment_entry pe ON pe.id = pea.payment_entry_id AND pe.tenant_id = pea.tenant_id
     LEFT JOIN document.bank_recon_case_line brcl ON brcl.payment_entry_id = pe.id AND brcl.tenant_id = pe.tenant_id AND brcl.side = 'payment'::text
     LEFT JOIN document.bank_recon_case brc ON brc.id = brcl.bank_recon_case_id AND brc.tenant_id = brcl.tenant_id
     LEFT JOIN document.payment_remittance_output prm ON prm.payment_entry_id = pe.id AND prm.tenant_id = pe.tenant_id;

COMMENT ON VIEW "document"."v_ap_settlement_graph" IS 'EDGE/DETAIL graph: one row per (PI × PIL × AD × JL × PEA × recon link). Do NOT SUM PI-level columns (payable_amount, paid_amount, outstanding_amount) directly — rows are fanned out by 1:N joins and PI columns repeat across joined rows. For aggregation, use:  • v_ap_invoice_summary      (one row per invoice)  • v_ap_settlement_summary   (one row per invoice × payment, with allocated and cash-out totals)Use this graph view for support investigations, audit trails, and edge-traversal queries.';

CREATE OR REPLACE VIEW "document"."v_ap_settlement_summary"
WITH (security_invoker = true, security_barrier = true) AS
SELECT pi.id AS purchase_invoice_id,
    pi.tenant_id,
    pi.code,
    pe.id AS payment_entry_id,
    pe.payment_number,
    pe.status AS payment_status,
    sum(pea.allocated_amount) AS allocated_total,
    sum(pea.net_payment_amount) AS cash_out_total,
    sum(pea.discount_amount) AS discount_total,
    sum(pea.withholding_tax_amount) AS withholding_total,
    sum(pea.advance_recovery_amount) AS advance_recovery_total,
    sum(pea.retention_amount) AS retention_total
   FROM document.purchase_invoice pi
     JOIN document.payment_entry_allocation pea ON pea.purchase_invoice_id = pi.id AND pea.tenant_id = pi.tenant_id
     JOIN document.payment_entry pe ON pe.id = pea.payment_entry_id AND pe.tenant_id = pea.tenant_id
  WHERE pe.status IN ('posted', 'transmitted', 'cleared')
  GROUP BY pi.id, pi.tenant_id, pi.code, pe.id, pe.payment_number, pe.status;

COMMENT ON VIEW "document"."v_ap_settlement_summary" IS 'One row per (invoice × cash-effective payment). Allocated and cash-out totals decomposed by reduction type. Safe for settlement reporting and aging dashboards. Cash-effective predicate via fn_pe_cash_effective.';

CREATE OR REPLACE VIEW "document"."v_commitment_line_pricing_summary"
WITH (security_invoker = true, security_barrier = true) AS
WITH component_rollup AS (
         SELECT pc.tenant_id,
            pc.source_doc_id AS commitment_id,
            pc.source_line_id AS commitment_line_id,
            COALESCE(sum(
                CASE
                    WHEN pc.term_type = 'discount'::text THEN pc.computed_amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(18,4) AS pricing_discount_amount,
            COALESCE(sum(
                CASE
                    WHEN pc.term_type = 'charge'::text THEN pc.computed_amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(18,4) AS pricing_charge_amount,
            COALESCE(sum(
                CASE
                    WHEN pc.term_type = 'tax'::text THEN pc.computed_amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(18,4) AS pricing_component_tax_amount,
            COALESCE(sum(
                CASE
                    WHEN pc.term_type = 'withholding'::text THEN pc.computed_amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(18,4) AS pricing_component_withholding_amount
           FROM document.pricing_component pc
          WHERE pc.source_doc_type = 'commitment_line'::text AND pc.source_line_id IS NOT NULL AND pc.superseded_by_id IS NULL
          GROUP BY pc.tenant_id, pc.source_doc_id, pc.source_line_id
        )
 SELECT cl.tenant_id,
    cl.commitment_id,
    cl.id AS commitment_line_id,
    cl.net_amount AS pricing_base_amount,
    COALESCE(cr.pricing_discount_amount, 0::numeric)::numeric(18,4) AS pricing_discount_amount,
    COALESCE(cr.pricing_charge_amount, 0::numeric)::numeric(18,4) AS pricing_charge_amount,
    (cl.net_amount - COALESCE(cr.pricing_discount_amount, 0::numeric) + COALESCE(cr.pricing_charge_amount, 0::numeric))::numeric(18,4) AS pricing_net_amount,
        CASE
            WHEN cr.commitment_line_id IS NULL THEN cl.tax_amount
            ELSE cr.pricing_component_tax_amount
        END AS pricing_tax_amount,
        CASE
            WHEN cr.commitment_line_id IS NULL THEN cl.withholding_tax_amount
            ELSE cr.pricing_component_withholding_amount
        END AS pricing_withholding_amount,
    (cl.net_amount - COALESCE(cr.pricing_discount_amount, 0::numeric) + COALESCE(cr.pricing_charge_amount, 0::numeric) +
        CASE
            WHEN cr.commitment_line_id IS NULL THEN cl.tax_amount
            ELSE cr.pricing_component_tax_amount
        END -
        CASE
            WHEN cr.commitment_line_id IS NULL THEN cl.withholding_tax_amount
            ELSE cr.pricing_component_withholding_amount
        END)::numeric(18,4) AS pricing_total_amount
   FROM document.commitment_line cl
     LEFT JOIN component_rollup cr ON cr.tenant_id = cl.tenant_id AND cr.commitment_line_id = cl.id AND cr.commitment_id = cl.commitment_id;

CREATE OR REPLACE VIEW "document"."v_current_accounting_distribution"
WITH (security_invoker = true, security_barrier = true) AS
SELECT id,
    tenant_id,
    source_entity_type AS source_doc_type,
    source_entity_id AS source_doc_id,
    source_line_id,
    distribution_no,
    distribution_basis,
    split_percent AS split_pct,
    split_amount,
    split_quantity,
    distributed_amount,
    currency_code,
    amount_status,
    NULL::timestamptz AS amount_calculated_at,
    calculation_hash AS amount_calculation_hash,
    account_source,
    gl_account_id,
    cost_center_id,
    profit_center_id,
    project_id,
    dimension_set_id,
    asset_id,
    budget_allocation_id,
    budget_check_result,
    NULL::uuid AS encumbrance_je_id,
    description,
    '[]'::jsonb AS tags,
    metadata,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM document.accounting_distribution;

COMMENT ON VIEW "document"."v_current_accounting_distribution" IS 'Current accounting distribution rows. Parent document lifecycle controls editability/freeze.';

CREATE OR REPLACE VIEW "document"."v_current_pricing_component"
WITH (security_invoker = true, security_barrier = true) AS
SELECT id,
    tenant_id,
    company_code_id,
    source_doc_type,
    source_doc_id,
    source_line_id,
    term_type,
    condition_type_id,
    sequence,
    basis,
    rate_value,
    amount_value,
    base_for_calculation,
    computed_amount,
    computed_base_amount,
    entry_level,
    apportion_basis,
    is_apportioned,
    is_apportioned_from_id,
    origin,
    ref_source_doc_type,
    ref_source_doc_id,
    ref_source_line_id,
    ref_value,
    tax_group_id,
    is_inclusive,
    recoverable_pct,
    tax_section_code,
    currency_code,
    base_currency_code,
    exchange_rate,
    superseded_by_id,
    superseded_at,
    superseded_by_user,
    row_version,
    tags,
    metadata,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM document.pricing_component
  WHERE superseded_by_id IS NULL;

COMMENT ON VIEW "document"."v_current_pricing_component" IS 'Current pricing component rows. Compatibility filter hides legacy replacement-chain rows; new writes should use parent-gated replace/save and generic audit.';

CREATE OR REPLACE VIEW "document"."v_current_schedule_line"
WITH (security_invoker = true, security_barrier = true) AS
SELECT id,
    tenant_id,
    source_doc_type,
    source_doc_id,
    source_line_id,
    schedule_no,
    schedule_kind,
    scheduled_quantity,
    scheduled_amount,
    scheduled_date,
    currency_code,
    fulfilled_quantity,
    fulfilled_amount,
    remaining_quantity,
    fulfillment_status,
    row_version,
    version_number,
    previous_version_id,
    is_current_version,
    supersedes_at,
    terminal_status,
    status_source,
    status,
    tags,
    metadata,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM document.schedule_line
  WHERE is_current_version = true AND terminal_status IS NULL;

COMMENT ON VIEW "document"."v_current_schedule_line" IS 'Current schedule lines. Hides prior schedule revisions and terminal schedule rows from normal consumers.';

CREATE OR REPLACE VIEW "document"."v_invoice_retention_release_schedule"
WITH (security_invoker = true, security_barrier = true) AS
SELECT pta.tenant_id,
    pta.purchase_invoice_id AS invoice_id,
    pta.purchase_invoice_line_id AS invoice_line_id,
    pta.evaluation_sequence_no AS milestone_seq,
    pta.payment_term_clause_id AS clause_id,
    COALESCE(ptc.clause_code, pta.clause_snapshot ->> 'clause_code') AS clause_code,
    NULLIF(pta.clause_snapshot ->> 'pricing_component_id', '')::uuid AS pricing_component_id,
    ptc.release_event,
    ptc.release_delay_days,
    pta.resolved_due_date AS scheduled_release_date,
    pta.calculated_basis_amount AS basis_amount,
    pta.default_amount AS scheduled_amount,
    pta.applied_amount,
    pta.running_total_amount AS running_total,
    pta.remaining_balance_amount AS remaining_amount,
    pta.application_status AS status,
    pta.application_status IN ('applied', 'clamped', 'exhausted') AS is_effective,
    pta.reverses_application_id AS reversed_by_id,
    pta.supersedes_application_id AS superseded_by_id,
    NULL::uuid AS release_workflow_request_id,
    pta.created_at
   FROM document.payment_term_application pta
     LEFT JOIN master.payment_term_clause ptc ON ptc.id = pta.payment_term_clause_id AND ptc.tenant_id = pta.tenant_id
  WHERE pta.application_type = 'retention_release'::text;

COMMENT ON VIEW "document"."v_invoice_retention_release_schedule" IS 'Retention release milestone calendar per invoice. Joins payment_term_application (RETENTION_RELEASE rows) with payment_term_clause to surface release_event + delay + scheduled / applied / remaining amounts. Replaces the proposed document.retention_schedule table — see docs/specs/pta_pab_retention_advance_overlap.md.';

CREATE OR REPLACE VIEW document.v_party_advance_balance
WITH (security_invoker = true, security_barrier = true) AS
WITH invoice_balance AS (
    SELECT
        tenant_id,
        company_code_id,
        supplier_id,
        currency_code,
        sum(payable_amount) FILTER (WHERE invoice_type='advance') AS advance_issued_amount,
        sum(retention_amount) AS retention_withheld_amount,
        count(*) FILTER (WHERE invoice_type='advance')::bigint AS advance_invoice_count,
        count(*) FILTER (WHERE retention_amount>0)::bigint AS retention_invoice_count
    FROM document.purchase_invoice
    WHERE status='posted' AND supplier_id IS NOT NULL
    GROUP BY tenant_id,company_code_id,supplier_id,currency_code
), settlement_balance AS (
    SELECT
        pi.tenant_id,
        pi.company_code_id,
        pi.supplier_id,
        pea.currency_code,
        sum(CASE WHEN pea.allocation_kind='reversal' THEN -pea.advance_recovery_amount ELSE pea.advance_recovery_amount END)
            AS advance_recovered_amount,
        sum(CASE WHEN pea.allocation_kind='reversal' THEN -pea.retention_amount ELSE pea.retention_amount END)
            AS retention_settled_amount
    FROM document.payment_entry_allocation pea
    JOIN document.payment_entry pe
      ON pe.tenant_id=pea.tenant_id AND pe.id=pea.payment_entry_id
    JOIN document.purchase_invoice pi
      ON pi.tenant_id=pea.tenant_id AND pi.id=pea.purchase_invoice_id
    WHERE pe.status IN ('posted','transmitted','cleared')
    GROUP BY pi.tenant_id,pi.company_code_id,pi.supplier_id,pea.currency_code
)
SELECT
    i.tenant_id,
    i.company_code_id,
    i.supplier_id,
    i.currency_code,
    coalesce(i.advance_issued_amount,0) AS advance_issued_amount,
    coalesce(s.advance_recovered_amount,0) AS advance_recovered_amount,
    coalesce(i.advance_issued_amount,0)-coalesce(s.advance_recovered_amount,0) AS advance_balance,
    coalesce(i.retention_withheld_amount,0) AS retention_withheld_amount,
    coalesce(s.retention_settled_amount,0) AS retention_settled_amount,
    coalesce(i.retention_withheld_amount,0)-coalesce(s.retention_settled_amount,0) AS retention_balance,
    i.advance_invoice_count,
    i.retention_invoice_count
FROM invoice_balance i
LEFT JOIN settlement_balance s
  ON s.tenant_id=i.tenant_id
 AND s.company_code_id=i.company_code_id
 AND s.supplier_id=i.supplier_id
 AND s.currency_code=i.currency_code;

COMMENT ON VIEW document.v_party_advance_balance IS
  'Tenant-safe supplier advance and retention projection derived from posted invoices and cash-effective payment allocations. Replaces mutable document.party_advance_balance.';
