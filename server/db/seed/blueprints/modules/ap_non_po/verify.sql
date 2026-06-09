-- ============================================================================
-- FILE: verify.sql
-- Purpose: Run-after-install verification queries. Non-destructive.
-- Usage:   psql "$DATABASE_URL" -f verify.sql
-- ============================================================================
-- Each query should return the expected result indicated in the \echo below it.
-- ============================================================================

\pset border 2

\echo ''
\echo '── CHECK 1 — Blueprint registered ───────────────────────────────────────'
\echo 'Expected: 1 row with status=active, applied_version=1.0.0 per tenant'
SELECT br.code AS blueprint, br.status AS registry_status, br.base_version,
       tba.tenant_id, tba.status AS tenant_status, tba.applied_version,
       tba.metadata->>'profiles'           AS profiles,
       tba.metadata->>'templates'          AS templates,
       tba.metadata->>'intent_profile_rules' AS rules
  FROM control.blueprint_registry br
  LEFT JOIN control.tenant_blueprint_application tba
         ON tba.blueprint_code = br.code
 WHERE br.code = 'pack_ap_non_po';

\echo ''
\echo '── CHECK 2 — Posting roles present ──────────────────────────────────────'
\echo 'Expected: 5 rows (ap_trade_payable, input_tax_recoverable, wht_payable,'
\echo '          ap_retention_payable, ap_advance_recovery)'
SELECT code, name
  FROM control.lookup_value
 WHERE domain_code = 'control.payment_settlement_posting_role'
   AND code IN ('ap_trade_payable','input_tax_recoverable','wht_payable',
                'ap_retention_payable','ap_advance_recovery')
 ORDER BY code;

\echo ''
\echo '── CHECK 3 — Accounting profiles per tenant ─────────────────────────────'
\echo 'Expected: 4 profiles per active tenant'
SELECT t.code AS tenant, ap.code AS profile_code, ap.name, ap.subledger_type
  FROM master.accounting_profile ap
  JOIN master.tenant t ON t.id = ap.tenant_id
 WHERE ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                   'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE')
 ORDER BY t.code, ap.sort_order;

\echo ''
\echo '── CHECK 4 — Active profile configs with event + template counts ────────'
\echo 'Expected: 4 configs per tenant; events 3/3/2/1; templates 4-5/4/2/2'
SELECT t.code AS tenant,
       ap.code AS profile,
       apc.version, apc.status,
       (SELECT count(*) FROM control.acct_profile_event
         WHERE profile_config_id = apc.id)  AS events,
       (SELECT count(*) FROM control.acct_profile_entry_template apet
          JOIN control.acct_profile_event ape ON ape.id = apet.profile_event_id
         WHERE ape.profile_config_id = apc.id) AS templates
  FROM control.acct_profile_config apc
  JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
  JOIN master.tenant t ON t.id = ap.tenant_id
 WHERE ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                   'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE')
 ORDER BY t.code, ap.sort_order;

\echo ''
\echo '── CHECK 5 — Intent → profile routing rules ─────────────────────────────'
\echo 'Expected: 6 rules per tenant'
SELECT t.code AS tenant,
       iprr.intent_domain, iprr.flow_code, iprr.doc_type,
       ap.code AS resolved_profile, iprr.priority
  FROM control.intent_to_accounting_profile_rule iprr
  JOIN control.acct_profile_config apc ON apc.id = iprr.resolved_profile_config_id
  JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
  JOIN master.tenant t ON t.id = iprr.tenant_id
 WHERE ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                   'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE')
   AND iprr.is_active
 ORDER BY t.code, iprr.priority, iprr.intent_domain;

\echo ''
\echo '── CHECK 6 — Entity operations complete for Non-PO ──────────────────────'
\echo 'Expected: 16+ ops for purchase_invoice, 16+ for payment_entry'
SELECT entity_name, count(*) AS operation_count,
       string_agg(permission_code, ', ' ORDER BY sort_order) AS operations
  FROM control.entity_operation
 WHERE entity_name IN ('purchase_invoice','payment_entry')
   AND tenant_id IS NULL
 GROUP BY entity_name
 ORDER BY entity_name;

\echo ''
\echo '── CHECK 7 — Payment settlement rules ───────────────────────────────────'
\echo 'Expected: 1 row per (company × OUTBOUND payment_method × STAT book)'
SELECT cc.code AS company,
       pm.code AS method,
       psr.book_code, psr.direction,
       psr.clearing_posting_role_code   AS dr_role,
       psr.settlement_posting_role_code AS cr_role
  FROM control.payment_settlement_rule psr
  JOIN master.company_code cc   ON cc.id = psr.company_code_id
  JOIN master.payment_method pm ON pm.id = psr.payment_method_id
 WHERE psr.metadata->>'auto_created_by' = 'pack_ap_non_po'
   AND psr.is_active
 ORDER BY cc.code, pm.code;

\echo ''
\echo '── CHECK 8 — Demo scenario documents ────────────────────────────────────'
\echo 'Expected: 5 invoices + 2 payments (requires app.seed_tenant_id to be set)'
SELECT 'invoice' AS kind, invoice_number AS doc, pi.status, total_amount AS amount
  FROM document.purchase_invoice pi
 WHERE pi.tenant_id = nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid
   AND pi.invoice_number LIKE 'INV-A%'
UNION ALL
SELECT 'payment' AS kind, payment_number AS doc, pe.status, payment_amount AS amount
  FROM document.payment_entry pe
 WHERE pe.tenant_id = nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid
   AND pe.payment_number LIKE 'ADV-%'
 ORDER BY kind, doc;

\echo ''
\echo '── CHECK 9 — Engine resolution dry-run (OPEX Non-PO STANDARD) ───────────'
\echo 'Expected: method=RULE_MATCH, subledger_type=AP, non-null profile_config_id'
-- Requires control.resolve_accounting_profile to be installed (runtime engine).
-- Skipped: function not yet deployed. Verify manually once Engine 4.13 is live.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'control' AND p.proname = 'resolve_accounting_profile'
    ) THEN
        RAISE NOTICE 'CHECK 9: resolve_accounting_profile exists — run engine dry-run manually';
    ELSE
        RAISE NOTICE 'CHECK 9: SKIPPED — control.resolve_accounting_profile not yet deployed (pending Engine 4.13)';
    END IF;
END $$;

\echo ''
\echo '── CHECK 10 — Classification rule leaf coverage ─────────────────────────'
\echo 'Expected: ≥90 distinct leaf commodity categories covered per tenant'
\echo '          (95 base-pack leaves × 100% = 95; ≥90 accounts for optional categories)'
SELECT t.code AS tenant,
       count(DISTINCT sc.id) AS leaves_with_rules,
       count(DISTINCT r.id)  AS total_rules
  FROM master.commodity_category sc
  JOIN control.commodity_classification_to_intent_rule r
       ON  r.classification_id = sc.id
       AND r.is_active = true
  JOIN master.tenant t ON t.id = sc.tenant_id
 WHERE sc.parent_id IS NOT NULL   -- only leaf categories (not root containers)
   AND t.status = 'active'
 GROUP BY t.code
 ORDER BY t.code;

\echo ''
\echo '── CHECK 11 — Intent → profile domain wildcard rules ────────────────────'
\echo 'Expected: 6 wildcard rows per tenant (OPEX/CAPEX/ADMIN/COST_OF_SALES/REGULATORY/TRANSFER)'
SELECT t.code AS tenant,
       iprr.intent_domain,
       ap.code AS resolved_profile,
       iprr.priority
  FROM control.intent_to_accounting_profile_rule iprr
  JOIN control.acct_profile_config apc ON apc.id = iprr.resolved_profile_config_id
  JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
  JOIN master.tenant t ON t.id = iprr.tenant_id
 WHERE iprr.intent_id IS NULL    -- wildcard rules only
   AND iprr.is_active
   AND ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX')
 ORDER BY t.code, iprr.priority, iprr.intent_domain;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo ' VERIFICATION COMPLETE'
\echo '════════════════════════════════════════════════════════════════'
