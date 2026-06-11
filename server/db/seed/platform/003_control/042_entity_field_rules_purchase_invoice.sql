-- ============================================================================
-- 042_entity_field_rules_purchase_invoice.sql
-- Field-level editability rules for purchase_invoice (Option A scope).
-- Source of truth: control.entity_field.editability JSONB column.
-- Predicate vocabulary: editable_in_status (array of allowed status values).
-- Enforced server-side by isEntityFieldWritable() in entity-mutation-guard.ts.
-- Enforced client-side by evaluateMetaEntityFieldEditability() in field-editability.ts.
--
-- Note: 'name' values match control.entity_field.name, NOT column_name.
--   document_no  ↔  invoice_number column
--   invoice_date ↔  document_date column
--   total_amount column is registered as 'total_amount' field
-- ============================================================================

-- ── PI header editability rules ────────────────────────────────────────────
WITH pi_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET editability = jsonb_build_object(
         'editable_in_status', rule.allowed_statuses,
         'reason',             rule.reason
       ),
       updated_at = now()
  FROM (VALUES
    -- Identity & supplier (locked at submit; live → snapshot transition)
    ('supplier_id',              jsonb_build_array('draft')::jsonb,
        'Supplier locks at submit; identity is frozen in invoice_party_snapshot.'),
    ('supplier_invoice_number',  jsonb_build_array('draft','rejected')::jsonb,
        'Vendor invoice number locks from submit onward to prevent duplicate-evasion.'),
    ('supplier_invoice_date',    jsonb_build_array('draft','rejected')::jsonb,
        'Vendor invoice date locks from submit onward.'),
    ('invoice_source',           jsonb_build_array('draft')::jsonb,
        'Invoice source drives matching and commitment requirements.'),
    ('invoice_type',             jsonb_build_array('draft')::jsonb,
        'Invoice type drives JE template and credit/debit handling.'),
    ('company_code_id',          jsonb_build_array('draft')::jsonb,
        'Company code drives chart of accounts and tax setup.'),
    ('commitment_id',            jsonb_build_array('draft','rejected')::jsonb,
        'Commitment link drives PO matching.'),
    -- Currency / FX
    ('currency_code',            jsonb_build_array('draft')::jsonb,
        'Currency drives FX snapshot and tax engine.'),
    ('exchange_rate',            jsonb_build_array('draft','rejected')::jsonb,
        'FX rate captured at posting; pre-post correction allowed.'),
    -- Dates (invoice_date is the field name for document_date column)
    ('invoice_date',             jsonb_build_array('draft','rejected')::jsonb,
        'Document date locks after approval.'),
    ('posting_date',             jsonb_build_array('draft','rejected')::jsonb,
        'Posting date determines period and FX; locks after approval.'),
    -- Header amount overrides (engine-computed; not patched post-submit)
    ('discount_amount',          jsonb_build_array('draft','rejected')::jsonb,
        'Discount changes the engine recomputation contract.'),
    ('freight_amount',           jsonb_build_array('draft','rejected')::jsonb,
        'Freight locks at submit; use credit-note for corrections.'),
    ('misc_charges_amount',      jsonb_build_array('draft','rejected')::jsonb,
        'Misc charges lock at submit.'),
    ('withholding_tax_amount',   jsonb_build_array('draft','rejected')::jsonb,
        'WHT is computed pre-submit and locks.'),
    -- Hold reason (Model A — only editable while on_hold)
    ('hold_reason',              jsonb_build_array('on_hold')::jsonb,
        'Hold reason is editable only while status = on_hold.')
  ) AS rule(field_name, allowed_statuses, reason)
 WHERE ef.entity_version_id = (SELECT version_id FROM pi_version)
   AND ef.name = rule.field_name;


-- ── PI header — remaining editable_in_status rules (Sprint 2) ───────────────
WITH pi_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET editability = jsonb_build_object(
         'editable_in_status', rule.allowed_statuses,
         'reason',             rule.reason
       ),
       updated_at = now()
  FROM (VALUES
    -- Identity / reference fields
    ('fiscal_document_number', jsonb_build_array('draft','rejected')::jsonb,
        'Fiscal document reference is part of the legal invoice once submitted.'),
    ('description',            jsonb_build_array('draft','rejected','pending_approval')::jsonb,
        'Invoice name/description can be refined during approval.'),
    -- Payment terms & method
    ('payment_term_id',        jsonb_build_array('draft','rejected')::jsonb,
        'Payment terms drive due_date and clauses; locked at submit.'),
    ('payment_method_id',      jsonb_build_array('draft','rejected')::jsonb,
        'Payment method drives bank/rail selection; locked at submit.'),
    -- FX
    ('base_currency_code',     jsonb_build_array('draft')::jsonb,
        'Base currency comes from the company code — only draft edits via re-scope.'),
    -- Operational dates
    ('received_date',          jsonb_build_array('draft','rejected')::jsonb,
        'Received date is part of the operational audit trail.'),
    ('baseline_date',          jsonb_build_array('draft','rejected')::jsonb,
        'Baseline date drives payment-term scheduling.'),
    ('due_date',               jsonb_build_array('draft','rejected','pending_approval')::jsonb,
        'Due date can be deferred during approval; locked after approval.'),
    -- Tax mode
    ('tax_mode',               jsonb_build_array('draft','rejected')::jsonb,
        'Tax mode drives tax engine behavior; locked at submit.'),
    ('tax_mode_source',        jsonb_build_array('draft','rejected')::jsonb,
        'Tax mode source explains derivation; locked at submit.'),
    -- Amount adjustments
    ('advance_deduction_amount', jsonb_build_array('draft','rejected')::jsonb,
        'Advance deduction changes payable; locked at submit.'),
    ('retention_amount',       jsonb_build_array('draft','rejected')::jsonb,
        'Retention amount creates AP Retention Payable; locked at submit.'),
    ('retention_pct',          jsonb_build_array('draft','rejected')::jsonb,
        'Retention percent drives retention calculation; locked at submit.'),
    -- Matching
    ('match_type',             jsonb_build_array('draft','rejected')::jsonb,
        'Match type controls 2-way/3-way matching; locked at submit.'),
    -- Reversal flags
    ('is_reversal',            jsonb_build_array('draft')::jsonb,
        'Reversal flag drives JE construction; immutable after submit.'),
    ('reversal_of_id',         jsonb_build_array('draft')::jsonb,
        'Reversal target is part of audit trail; immutable after submit.'),
    -- Dimensions (header defaults)
    ('cost_center_id',         jsonb_build_array('draft','rejected')::jsonb,
        'Cost centre is the default for line postings.'),
    ('profit_center_id',       jsonb_build_array('draft','rejected')::jsonb,
        'Profit centre is the default for line postings.'),
    ('project_id',             jsonb_build_array('draft','rejected')::jsonb,
        'Project is the default for line postings.'),
    ('site_id',                jsonb_build_array('draft','rejected')::jsonb,
        'Site is the default for line postings.'),
    ('budget_allocation_id',   jsonb_build_array('draft','rejected')::jsonb,
        'Budget allocation drives budget consumption; locked at submit.'),
    -- Fiscal scope
    ('fiscal_year',            jsonb_build_array('draft','rejected')::jsonb,
        'Fiscal year is derived from posting_date; corrections via re-date.'),
    ('period_number',          jsonb_build_array('draft','rejected')::jsonb,
        'Period is derived from posting_date; corrections via re-date.'),
    -- Operational annotations (broader edit window)
    ('notes',                  jsonb_build_array('draft','rejected','pending_approval','approved','on_hold')::jsonb,
        'Operational notes can be appended through the entire active lifecycle.'),
    ('tags',                   jsonb_build_array('draft','rejected','pending_approval','approved','on_hold')::jsonb,
        'Tags can be applied through the entire active lifecycle.')
  ) AS rule(field_name, allowed_statuses, reason)
 WHERE ef.entity_version_id = (SELECT version_id FROM pi_version)
   AND ef.name = rule.field_name;


-- ── PI header — visible_when rules (Sprint 2) ─────────────────────────────────
-- Cross-field visibility: fields that only make sense in specific contexts.
-- The visibility evaluator (field-visibility.ts) currently reads from
-- `visibility.when` (legacy location). The contract-registry phase-4 target is
-- `ui_hint.display.visible_when`. Until the evaluator migrates, we write to
-- BOTH so authoring intent stays in the forward-aligned location AND today's
-- runtime picks it up.
WITH pi_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET ui_hint = jsonb_set(
                   COALESCE(ef.ui_hint, '{}'::jsonb),
                   '{display}',
                   COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                     || jsonb_build_object('visible_when', rule.predicate),
                   true),
       visibility = jsonb_set(
                      COALESCE(ef.visibility, '{}'::jsonb),
                      '{when}',
                      rule.predicate,
                      true),
       updated_at = now()
  FROM (VALUES
    -- reversal_of_id only meaningful when this invoice is a reversal
    ('reversal_of_id',
        jsonb_build_object('field', 'is_reversal', 'eq', true)),
    -- tax_mode_source only meaningful when tax_mode is set
    ('tax_mode_source',
        jsonb_build_object('field', 'tax_mode', 'notNull', true)),
    -- hold_reason only meaningful when on hold (status='on_hold')
    ('hold_reason',
        jsonb_build_object('field', 'status', 'eq', 'on_hold')),
    -- retention_pct only meaningful when retention_amount > 0 or has value itself
    ('retention_pct',
        jsonb_build_object('field', 'retention_amount', 'notNull', true)),
    -- advance_deduction_amount only meaningful when invoice_source = po_based or contract_based
    -- (against an advance commitment) — keep visible during edit, hide on detail when zero
    ('advance_deduction_amount',
        jsonb_build_object('field', 'commitment_id', 'notNull', true)),
    -- exchange_rate: visible_when not supported for cross-field comparison;
    -- form UX hides when currency == base_currency. Skip metadata rule here.
    ('budget_check_result',
        jsonb_build_object('field', 'budget_allocation_id', 'notNull', true))
  ) AS rule(field_name, predicate)
 WHERE ef.entity_version_id = (SELECT version_id FROM pi_version)
   AND ef.name = rule.field_name;


-- ── PI line — visible_when rules (Sprint 2) ─────────────────────────────────
WITH pil_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice_line'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET ui_hint = jsonb_set(
                   COALESCE(ef.ui_hint, '{}'::jsonb),
                   '{display}',
                   COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                     || jsonb_build_object('visible_when', rule.predicate),
                   true),
       visibility = jsonb_set(
                      COALESCE(ef.visibility, '{}'::jsonb),
                      '{when}',
                      rule.predicate,
                      true),
       updated_at = now()
  FROM (VALUES
    -- asset_category_id only relevant for asset lines
    ('asset_category_id',
        jsonb_build_object('field', 'is_asset', 'eq', true)),
    -- retention_pct only relevant when there's retention
    ('retention_pct',
        jsonb_build_object('field', 'retention_amount', 'notNull', true))
  ) AS rule(field_name, predicate)
 WHERE ef.entity_version_id = (SELECT version_id FROM pil_version)
   AND ef.name = rule.field_name;


-- ── AD — visible_when rules (Sprint 2) ──────────────────────────────────────
WITH ad_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'accounting_distribution'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET ui_hint = jsonb_set(
                   COALESCE(ef.ui_hint, '{}'::jsonb),
                   '{display}',
                   COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                     || jsonb_build_object('visible_when', rule.predicate),
                   true),
       visibility = jsonb_set(
                      COALESCE(ef.visibility, '{}'::jsonb),
                      '{when}',
                      rule.predicate,
                      true),
       updated_at = now()
  FROM (VALUES
    -- Account-source-conditional fields
    ('posting_role_code',
        jsonb_build_object('field', 'account_source', 'eq', 'POSTING_ROLE')),
    ('gl_account_id',
        jsonb_build_object('field', 'account_source', 'eq', 'FIXED')),
    ('account_code',
        jsonb_build_object('field', 'account_source', 'eq', 'FIXED')),
    -- business_intent_id is visible when FROM_INTENT; other source types may
    -- also reference it as classification metadata. Use 'eq' to keep gate tight.
    ('asset_class_id',
        jsonb_build_object('field', 'is_capex', 'eq', true)),
    ('budget_check_result',
        jsonb_build_object('field', 'budget_allocation_id', 'notNull', true))
  ) AS rule(field_name, predicate)
 WHERE ef.entity_version_id = (SELECT version_id FROM ad_version)
   AND ef.name = rule.field_name;


-- ── Mark is_on_hold inactive (Model A — column dropped in 01z_drop_is_on_hold.sql) ──
-- Keeps the row so any tenant overrides are not orphaned; runtime queries
-- filter on is_active=true so this row disappears from compiled descriptors.
UPDATE control.entity_field
   SET is_active  = false,
       updated_at = now()
 WHERE name = 'is_on_hold'
   AND entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'purchase_invoice'
          AND e.tenant_id IS NULL
   );


-- ── Mark is_credit_note inactive ────────────────────────────────────────────
-- The canonical control for credit notes is invoice_type = 'credit_note'
-- (DDL enum). The legacy is_credit_note boolean is retained as a column for
-- back-compat with existing services, but the form should not expose it.
UPDATE control.entity_field
   SET is_active  = false,
       updated_at = now()
 WHERE name = 'is_credit_note'
   AND entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'purchase_invoice'
          AND e.tenant_id IS NULL
   );


-- ── Type-conditional fields — visibility.when (Sprint 2 form-filter fix) ────
-- 21 metadata-backed / relabelled fields seeded by 046_entity_flow.sql:2840-2893.
-- These already have ui_hint.visible_when in JSONLogic shape; the form's
-- field-visibility evaluator reads field.visibility.when with the simpler
-- {field, eq, value} shape. Mirror the same predicate to visibility.when so
-- the form actually hides them by default.
WITH pi_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET visibility = jsonb_set(
                      COALESCE(ef.visibility, '{}'::jsonb),
                      '{when}',
                      rule.predicate,
                      true),
       updated_at = now()
  FROM (VALUES
    -- Credit note fields
    ('credited_invoice_id',       jsonb_build_object('field', 'invoice_type', 'eq', 'credit_note')),
    ('credit_reason',             jsonb_build_object('field', 'invoice_type', 'eq', 'credit_note')),
    ('credit_reference',          jsonb_build_object('field', 'invoice_type', 'eq', 'credit_note')),
    ('credit_note_date',          jsonb_build_object('field', 'invoice_type', 'eq', 'credit_note')),
    ('credit_note_name',          jsonb_build_object('field', 'invoice_type', 'eq', 'credit_note')),
    -- Debit note fields
    ('debited_invoice_id',        jsonb_build_object('field', 'invoice_type', 'eq', 'debit_note')),
    ('debit_reason',              jsonb_build_object('field', 'invoice_type', 'eq', 'debit_note')),
    ('debit_note_number',         jsonb_build_object('field', 'invoice_type', 'eq', 'debit_note')),
    ('debit_note_date',           jsonb_build_object('field', 'invoice_type', 'eq', 'debit_note')),
    ('debit_note_name',           jsonb_build_object('field', 'invoice_type', 'eq', 'debit_note')),
    -- Advance fields
    ('advance_type',              jsonb_build_object('field', 'invoice_type', 'eq', 'advance')),
    ('recovery_method',           jsonb_build_object('field', 'invoice_type', 'eq', 'advance')),
    ('advance_request_reference', jsonb_build_object('field', 'invoice_type', 'eq', 'advance')),
    ('advance_request_date',      jsonb_build_object('field', 'invoice_type', 'eq', 'advance')),
    ('advance_name',              jsonb_build_object('field', 'invoice_type', 'eq', 'advance')),
    -- Retention release fields
    ('retention_invoice_id',      jsonb_build_object('field', 'invoice_type', 'eq', 'retention_release')),
    ('release_type',              jsonb_build_object('field', 'invoice_type', 'eq', 'retention_release')),
    ('application_strategy',      jsonb_build_object('field', 'invoice_type', 'eq', 'retention_release')),
    ('release_request_reference', jsonb_build_object('field', 'invoice_type', 'eq', 'retention_release')),
    ('release_date',              jsonb_build_object('field', 'invoice_type', 'eq', 'retention_release')),
    ('release_name',              jsonb_build_object('field', 'invoice_type', 'eq', 'retention_release'))
  ) AS rule(field_name, predicate)
 WHERE ef.entity_version_id = (SELECT version_id FROM pi_version)
   AND ef.name = rule.field_name;


-- ── Hide system/audit/posting fields from create + edit surfaces ─────────────
-- These are written by the lifecycle engine, workflow handler, or posting
-- service. They have no business being inputs on the form. We use visibility.hide_in
-- as defense-in-depth even when origin='system' is set (resolveEditableFields
-- in runtime-canvas/index.tsx filters system origins, but until that package
-- ships the seed hides them at the metadata layer too).
UPDATE control.entity_field ef
   SET visibility = jsonb_set(
                      COALESCE(ef.visibility, '{}'::jsonb),
                      '{hide_in}',
                      to_jsonb(ARRAY['create','edit']),
                      true),
       updated_at = now()
  FROM (VALUES
    ('workflow_request_id'),
    ('approved_at'),
    ('approved_by'),
    ('posted_at'),
    ('posted_by'),
    ('status_changed_at'),
    ('status_changed_by'),
    ('is_posted'),
    ('ap_je_id'),
    ('line_count'),
    ('term_snapshot'),
    ('dimension_set_id'),
    ('row_version')
  ) AS f(field_name)
 WHERE ef.entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'purchase_invoice'
          AND e.tenant_id IS NULL
          AND ev.version_no  = 1
   )
   AND ef.name = f.field_name;


-- ── Hide metadata jsonb blob from create/edit (advanced authoring only) ─────
UPDATE control.entity_field ef
   SET visibility = jsonb_set(
                      COALESCE(ef.visibility, '{}'::jsonb),
                      '{hide_in}',
                      to_jsonb(ARRAY['create','edit']),
                      true),
       updated_at = now()
 WHERE ef.name = 'metadata'
   AND ef.entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'purchase_invoice'
          AND e.tenant_id IS NULL
          AND ev.version_no  = 1
   );


-- ── Suppress legacy 'invoice_number' duplicate entity_field row ──────────────
-- The canonical registration is name='document_no' with column_name='invoice_number'
-- (label "Invoice No."). If a legacy row with name='invoice_number' exists in
-- the live DB from an earlier seed iteration, deactivate it so the form
-- doesn't render two Invoice Number fields.
UPDATE control.entity_field
   SET is_active  = false,
       updated_at = now()
 WHERE name = 'invoice_number'
   AND entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'purchase_invoice'
          AND e.tenant_id IS NULL
   );


-- ── Suppress generic 'code' field on purchase_invoice ───────────────────────
-- Some entity scaffolding seeds emit a generic 'code' entity_field. For
-- purchase_invoice the natural-key field is document_no (column invoice_number),
-- not a separate code column. Mark inactive so it doesn't appear on the form.
UPDATE control.entity_field
   SET is_active  = false,
       updated_at = now()
 WHERE name = 'code'
   AND entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'purchase_invoice'
          AND e.tenant_id IS NULL
   );


-- ── Hide system-managed status from the create form ─────────────────────────
-- The status column is set by the lifecycle engine (action-dispatcher.route.ts).
-- entity-mutation-guard.ts permits the system origin specifically for status,
-- but the form should never offer a Status dropdown on Create. The same is
-- enforced server-side via origin='system' filter when ef.name <> 'status'.
--
-- Use visibility.hide_in (legacy location consumed by field-visibility.ts and
-- by resolveEditableFields in runtime-canvas/index.tsx).
UPDATE control.entity_field
   SET visibility = jsonb_set(
                      COALESCE(visibility, '{}'::jsonb),
                      '{hide_in}',
                      to_jsonb(ARRAY['create','edit']),
                      true),
       updated_at = now()
 WHERE name = 'status'
   AND entity_version_id IN (
       SELECT ev.id
         FROM control.entity_version ev
         JOIN control.entity e ON e.id = ev.entity_id
        WHERE e.table_schema = 'document'
          AND e.table_name   = 'purchase_invoice'
          AND e.tenant_id IS NULL
   );
