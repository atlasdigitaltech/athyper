-- ============================================================================
-- document/07_views_ap_improvements.sql
-- Concept: HF2-3 — AP reporting views
-- Depends on: target tables, fn_pe_cash_effective from 05_functions_ap_improvements.sql
-- Spec: Hardening Sprint H-Fix-2 §HF2-3
--
-- Views split out from 01z_ap_h4_improvements.sql so they live in phase-100
-- alongside other 07*.sql view files. Settlement-effective predicates now
-- reuse the canonical helper functions.
-- ============================================================================


-- =============================================================================
-- §A  v_ap_settlement_graph — EDGE/DETAIL graph
-- =============================================================================

CREATE OR REPLACE VIEW document.v_ap_settlement_graph AS
SELECT
    pi.id                            AS purchase_invoice_id,
    pi.tenant_id,
    pi.code,
    pi.status                        AS invoice_status,
    pi.payable_amount,
    pi.paid_amount,
    pi.outstanding_amount,
    pil.id                           AS purchase_invoice_line_id,
    pil.line_no,
    ad.id                            AS accounting_distribution_id,
    je.id                            AS journal_entry_id,
    je.je_number,
    jl.id                            AS journal_line_id,
    pea.id                           AS payment_allocation_id,
    pea.allocated_amount,
    pea.net_payment_amount,
    pe.id                            AS payment_entry_id,
    pe.payment_number,
    pe.status                        AS payment_status,
    pe.is_voided                     AS payment_is_voided,
    prm.id                           AS remittance_output_id,
    brc.id                           AS bank_recon_case_id,
    brc.status                       AS recon_status,
    brc.case_number                  AS recon_case_number
  FROM document.purchase_invoice              pi
  LEFT JOIN document.purchase_invoice_line    pil ON pil.purchase_invoice_id = pi.id
                                                  AND pil.tenant_id           = pi.tenant_id
  LEFT JOIN document.accounting_distribution  ad  ON ad.source_line_id        = pil.id
                                                  AND ad.tenant_id            = pil.tenant_id
                                                  AND ad.source_doc_type      = 'purchase_invoice_line'
  LEFT JOIN document.journal_entry            je  ON je.id                    = pi.ap_je_id
                                                  AND je.tenant_id            = pi.tenant_id
  LEFT JOIN document.journal_line             jl  ON jl.journal_entry_id      = je.id
                                                  AND jl.tenant_id            = je.tenant_id
  LEFT JOIN document.payment_entry_allocation pea ON pea.purchase_invoice_id  = pi.id
                                                  AND pea.tenant_id           = pi.tenant_id
  LEFT JOIN document.payment_entry            pe  ON pe.id                    = pea.payment_entry_id
                                                  AND pe.tenant_id            = pea.tenant_id
  LEFT JOIN document.bank_recon_case_line     brcl ON brcl.payment_entry_id   = pe.id
                                                   AND brcl.tenant_id          = pe.tenant_id
                                                   AND brcl.side               = 'payment'
  LEFT JOIN document.bank_recon_case          brc  ON brc.id                  = brcl.bank_recon_case_id
                                                   AND brc.tenant_id           = brcl.tenant_id
  LEFT JOIN document.payment_remittance_output prm ON prm.payment_entry_id    = pe.id
                                                   AND prm.tenant_id           = pe.tenant_id;

COMMENT ON VIEW document.v_ap_settlement_graph IS
    'EDGE/DETAIL graph: one row per (PI × PIL × AD × JL × PEA × recon link). '
    'Do NOT SUM PI-level columns (payable_amount, paid_amount, outstanding_amount) directly — '
    'rows are fanned out by 1:N joins and PI columns repeat across joined rows. '
    'For aggregation, use:'
    '  • v_ap_invoice_summary      (one row per invoice)'
    '  • v_ap_settlement_summary   (one row per invoice × payment, with allocated and cash-out totals)'
    'Use this graph view for support investigations, audit trails, and edge-traversal queries.';


-- =============================================================================
-- §B  v_ap_invoice_summary — one row per invoice
-- =============================================================================

CREATE OR REPLACE VIEW document.v_ap_invoice_summary AS
SELECT pi.id                AS purchase_invoice_id,
       pi.tenant_id,
       pi.code,
       pi.status            AS invoice_status,
       pi.supplier_id,
       pi.payable_amount,
       pi.paid_amount,
       pi.outstanding_amount,
       pi.due_date,
       pi.posting_date,
       pi.company_code_id
  FROM document.purchase_invoice pi;

COMMENT ON VIEW document.v_ap_invoice_summary IS
    'One row per purchase_invoice. Safe for SUM/AVG aggregation over PI columns.';


-- =============================================================================
-- §C  v_ap_settlement_summary — one row per (invoice × cash-effective payment)
-- =============================================================================
-- Uses fn_pe_cash_effective so only payments that have actually moved cash
-- contribute. This matches what bank-account reconciliation expects.
-- =============================================================================

CREATE OR REPLACE VIEW document.v_ap_settlement_summary AS
SELECT pi.id                            AS purchase_invoice_id,
       pi.tenant_id,
       pi.code,
       pe.id                            AS payment_entry_id,
       pe.payment_number,
       pe.status                        AS payment_status,
       SUM(pea.allocated_amount)        AS allocated_total,
       SUM(pea.net_payment_amount)      AS cash_out_total,
       SUM(pea.discount_amount)         AS discount_total,
       SUM(pea.withholding_tax_amount)  AS withholding_total,
       SUM(pea.advance_recovery_amount) AS advance_recovery_total,
       SUM(pea.retention_amount)        AS retention_total
  FROM document.purchase_invoice              pi
  JOIN document.payment_entry_allocation      pea ON pea.purchase_invoice_id = pi.id
                                                  AND pea.tenant_id           = pi.tenant_id
  JOIN document.payment_entry                 pe  ON pe.id        = pea.payment_entry_id
                                                  AND pe.tenant_id = pea.tenant_id
 WHERE document.fn_pe_cash_effective(pe.status, pe.is_voided) = true
 GROUP BY pi.id, pi.tenant_id, pi.code, pe.id, pe.payment_number, pe.status;

COMMENT ON VIEW document.v_ap_settlement_summary IS
    'One row per (invoice × cash-effective payment). Allocated and cash-out totals '
    'decomposed by reduction type. Safe for settlement reporting and aging dashboards. '
    'Cash-effective predicate via fn_pe_cash_effective.';


-- =============================================================================
-- End of 07_views_ap_improvements.sql
-- =============================================================================
