/* ============================================================================
   Athyper v2.1 — Finance Document Header Field Dictionary

   Populates meta.field for finance document header entities that are
   registered in 300_meta_entity_registration.sql but whose field
   dictionaries were never seeded (only lines were seeded in 319).

   Infrastructure columns (id, tenant_id, entity_code, created_at, updated_at)
   are omitted — they are implicit on every entity.

   Entities covered:
     - PurchaseInvoice      (fin.purchase_invoice)
     - PaymentEntry         (fin.payment_entry)
     - ManualJournalEntry   (fin.journal_entry)
     - CreditNote           (fin.credit_note)
     - DebitNote            (fin.debit_note)
     - BankStatement        (fin.bank_statement)

   Dependencies:
     - meta.entity, meta.entity_version (from 300_meta_entity_registration.sql)
     - meta.field enhanced columns (from 043_meta_field_enhancement.sql)
   ============================================================================ */

-- Temporary helper: resolve entity_version v1 id by entity name
CREATE OR REPLACE FUNCTION pg_temp.ev_id(p_tenant uuid, p_name text)
RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT ev.id
    FROM meta.entity_version ev
    JOIN meta.entity e ON ev.entity_id = e.id AND ev.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant AND e.name = p_name AND ev.version_no = 1
    LIMIT 1;
$$;

DO $$
DECLARE
    v_tenant uuid;
    v_vid    uuid;
BEGIN
    SELECT id INTO v_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_tenant IS NULL THEN
        RAISE NOTICE 'No tenant — skipping finance document header field seeding';
        RETURN;
    END IF;

    -- ====================================================================
    -- §1  PurchaseInvoice  (fin.purchase_invoice)
    -- ====================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'PurchaseInvoice');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- Document identity
        (v_tenant, v_vid, 'Invoice Number',       'invoice_number',       'text',        'code',    true,   1,  'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Invoice Type',          'invoice_type',         'text',        'select',  true,   2,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Supplier',              'supplier_id',          'uuid',        'lookup',  true,   3,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Supplier Invoice Ref',  'supplier_invoice_ref', 'text',        'text',    false,  4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Description',           'description',          'text',        'textarea',false,  5,  'business', false, false, false, 'system'),
        -- OU + Intent context
        (v_tenant, v_vid, 'Operating Unit',        'ou_id',                'uuid',        'lookup',  true,   6,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Business Intent',       'intent_id',            'uuid',        'lookup',  false,  7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Spend Category',        'spend_category_id',    'uuid',        'lookup',  false,  8,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Funding Profile',       'fp_id',                'uuid',        'lookup',  false,  9,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Accounting Profile',    'accounting_profile_id','uuid',        'lookup',  false,  10, 'business', false, false, false, 'system'),
        -- Dates
        (v_tenant, v_vid, 'Invoice Date',          'invoice_date',         'date',        'date',    true,   11, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Received Date',         'received_date',        'date',        'date',    false,  12, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Due Date',              'due_date',             'date',        'date',    false,  13, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Posting Date',          'posting_date',         'date',        'date',    false,  14, 'business', false, false, false, 'system'),
        -- Amounts (MC-4: DECIMAL only)
        (v_tenant, v_vid, 'Subtotal',              'subtotal',             'decimal',     'money',   true,   15, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Tax Amount',            'tax_amount',           'decimal',     'money',   true,   16, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Total Amount',          'total_amount',         'decimal',     'money',   true,   17, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Paid Amount',           'paid_amount',          'decimal',     'money',   false,  18, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Currency',              'currency_code',        'text',        'lookup',  true,   19, 'business', false, false, false, 'system'),
        -- FX
        (v_tenant, v_vid, 'Functional Currency',   'functional_currency_code','text',     'lookup',  false,  20, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Exchange Rate',         'exchange_rate',        'decimal',     'number',  false,  21, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Functional Amount',     'functional_amount',    'decimal',     'money',   false,  22, 'system',   true,  false, false, 'system'),
        -- Status
        (v_tenant, v_vid, 'Status',                'status',               'text',        'select',  true,   23, 'system',   true,  false, false, 'system'),
        -- System / audit fields (hidden from edit forms)
        (v_tenant, v_vid, 'Transaction ID',        'txn_id',               'uuid',        'hidden',  true,   90, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Decision Score',        'decision_score',       'decimal',     'hidden',  false,  91, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Route',        'approval_route',       'text',        'hidden',  false,  92, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Instance',     'approval_instance_id', 'uuid',        'hidden',  false,  93, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Journal Entry',         'je_id',                'uuid',        'hidden',  false,  94, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted At',             'posted_at',            'timestamptz', 'hidden',  false,  95, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted By',             'posted_by',            'uuid',        'hidden',  false,  96, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'IC Transaction',        'ic_transaction_id',    'uuid',        'hidden',  false,  97, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Idempotency Key',       'idempotency_key',      'text',        'hidden',  false,  98, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Version',               'version',              'integer',     'hidden',  true,   99, 'system',   true,  false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §2  PaymentEntry  (fin.payment_entry)
    -- ====================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'PaymentEntry');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- Document identity
        (v_tenant, v_vid, 'Payment Number',    'payment_number',    'text',        'code',    true,   1,  'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Supplier',          'supplier_id',       'uuid',        'lookup',  true,   2,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Description',       'description',       'text',        'textarea',false,  3,  'business', false, false, false, 'system'),
        -- OU context
        (v_tenant, v_vid, 'Operating Unit',    'ou_id',             'uuid',        'lookup',  false,  4,  'business', false, false, false, 'system'),
        -- Payment method & bank
        (v_tenant, v_vid, 'Payment Method',    'payment_method',    'text',        'select',  true,   5,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Bank Account',      'bank_account_id',   'uuid',        'lookup',  false,  6,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Clearing Account',  'clearing_account_id','uuid',       'lookup',  false,  7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Bank Reference',    'bank_reference',    'text',        'text',    false,  8,  'business', false, false, false, 'system'),
        -- Dates
        (v_tenant, v_vid, 'Payment Date',      'payment_date',      'date',        'date',    true,   9,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Value Date',        'value_date',        'date',        'date',    false,  10, 'business', false, false, false, 'system'),
        -- Amounts
        (v_tenant, v_vid, 'Total Amount',      'total_amount',      'decimal',     'money',   true,   11, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Currency',          'currency_code',     'text',        'lookup',  true,   12, 'business', false, false, false, 'system'),
        -- FX
        (v_tenant, v_vid, 'Functional Currency','functional_currency_code','text',  'lookup',  false,  13, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Exchange Rate',     'exchange_rate',     'decimal',     'number',  false,  14, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Functional Amount', 'functional_amount', 'decimal',     'money',   false,  15, 'system',   true,  false, false, 'system'),
        -- Status
        (v_tenant, v_vid, 'Status',            'status',            'text',        'select',  true,   16, 'system',   true,  false, false, 'system'),
        -- System / audit fields
        (v_tenant, v_vid, 'Transaction ID',    'txn_id',            'uuid',        'hidden',  true,   90, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Decision Score',    'decision_score',    'decimal',     'hidden',  false,  91, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Route',    'approval_route',    'text',        'hidden',  false,  92, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Instance', 'approval_instance_id','uuid',      'hidden',  false,  93, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Journal Entry',     'je_id',             'uuid',        'hidden',  false,  94, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted At',         'posted_at',         'timestamptz', 'hidden',  false,  95, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted By',         'posted_by',         'uuid',        'hidden',  false,  96, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Reconciled At',     'reconciled_at',     'timestamptz', 'hidden',  false,  97, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Reconciled By',     'reconciled_by',     'uuid',        'hidden',  false,  98, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Idempotency Key',   'idempotency_key',   'text',        'hidden',  false,  99, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Version',           'version',           'integer',     'hidden',  true,  100, 'system',   true,  false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §3  ManualJournalEntry  (fin.journal_entry)
    -- ====================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'ManualJournalEntry');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- Document identity
        (v_tenant, v_vid, 'JE Number',            'je_number',            'text',        'code',    true,   1,  'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Document Type',         'doc_type',             'text',        'select',  true,   2,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Accounting Profile',    'accounting_profile_id','uuid',        'lookup',  false,  3,  'business', false, false, false, 'system'),
        -- Period
        (v_tenant, v_vid, 'Fiscal Year',           'fiscal_year',          'integer',     'number',  true,   4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Period Number',         'period_number',        'integer',     'number',  true,   5,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Posting Date',          'posting_date',         'date',        'date',    true,   6,  'business', false, false, false, 'system'),
        -- Description
        (v_tenant, v_vid, 'Description',           'description',          'text',        'textarea',false,  7,  'business', false, false, false, 'system'),
        -- Totals
        (v_tenant, v_vid, 'Total Debit',           'total_debit',          'decimal',     'money',   true,   8,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Total Credit',          'total_credit',         'decimal',     'money',   true,   9,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Currency',              'currency_code',        'text',        'lookup',  true,   10, 'business', false, false, false, 'system'),
        -- Status & reversal
        (v_tenant, v_vid, 'Status',                'status',               'text',        'select',  true,   11, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Is Reversal',           'is_reversal',          'boolean',     'toggle',  true,   12, 'system',   true,  false, false, 'system'),
        -- System fields
        (v_tenant, v_vid, 'Transaction ID',        'txn_id',               'uuid',        'hidden',  true,   90, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Source Document',        'doc_id',               'uuid',        'hidden',  true,   91, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Reversal Of',           'reversal_of_id',       'uuid',        'hidden',  false,  92, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Reversed By',           'reversed_by_id',       'uuid',        'hidden',  false,  93, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted By',             'posted_by',            'uuid',        'hidden',  false,  94, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted At',             'posted_at',            'timestamptz', 'hidden',  false,  95, 'system',   true,  false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §4  CreditNote  (fin.credit_note)
    -- ====================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'CreditNote');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- Document identity
        (v_tenant, v_vid, 'Credit Note Number',  'credit_note_number',  'text',        'code',    true,   1,  'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Supplier',            'supplier_id',         'uuid',        'lookup',  true,   2,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Invoice',             'invoice_id',          'uuid',        'lookup',  false,  3,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Reason Code',         'reason_code',         'text',        'select',  true,   4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Description',         'description',         'text',        'textarea',false,  5,  'business', false, false, false, 'system'),
        -- OU context
        (v_tenant, v_vid, 'Operating Unit',      'ou_id',               'uuid',        'lookup',  true,   6,  'business', false, false, false, 'system'),
        -- Dates
        (v_tenant, v_vid, 'Credit Note Date',    'credit_note_date',    'date',        'date',    true,   7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Posting Date',        'posting_date',        'date',        'date',    false,  8,  'business', false, false, false, 'system'),
        -- Amounts
        (v_tenant, v_vid, 'Credit Amount',       'credit_amount',       'decimal',     'money',   true,   9,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Tax Amount',          'tax_amount',          'decimal',     'money',   true,   10, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Total Amount',        'total_amount',        'decimal',     'money',   true,   11, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Applied Amount',      'applied_amount',      'decimal',     'money',   false,  12, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Currency',            'currency_code',       'text',        'lookup',  true,   13, 'business', false, false, false, 'system'),
        -- FX
        (v_tenant, v_vid, 'Functional Currency', 'functional_currency_code','text',     'lookup',  false,  14, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Exchange Rate',       'exchange_rate',       'decimal',     'number',  false,  15, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Functional Amount',   'functional_amount',   'decimal',     'money',   false,  16, 'system',   true,  false, false, 'system'),
        -- Status
        (v_tenant, v_vid, 'Status',              'status',              'text',        'select',  true,   17, 'system',   true,  false, false, 'system'),
        -- System / audit fields
        (v_tenant, v_vid, 'Transaction ID',      'txn_id',              'uuid',        'hidden',  true,   90, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Decision Score',      'decision_score',      'decimal',     'hidden',  false,  91, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Route',      'approval_route',      'text',        'hidden',  false,  92, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Instance',   'approval_instance_id','uuid',        'hidden',  false,  93, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Journal Entry',       'je_id',               'uuid',        'hidden',  false,  94, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted At',           'posted_at',           'timestamptz', 'hidden',  false,  95, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted By',           'posted_by',           'uuid',        'hidden',  false,  96, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Idempotency Key',     'idempotency_key',     'text',        'hidden',  false,  97, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Version',             'version',             'integer',     'hidden',  true,   98, 'system',   true,  false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §5  DebitNote  (fin.debit_note)
    -- ====================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'DebitNote');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- Document identity
        (v_tenant, v_vid, 'Debit Note Number',   'debit_note_number',   'text',        'code',    true,   1,  'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Supplier',            'supplier_id',         'uuid',        'lookup',  true,   2,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Invoice',             'invoice_id',          'uuid',        'lookup',  false,  3,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Reason Code',         'reason_code',         'text',        'select',  true,   4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Description',         'description',         'text',        'textarea',false,  5,  'business', false, false, false, 'system'),
        -- OU context
        (v_tenant, v_vid, 'Operating Unit',      'ou_id',               'uuid',        'lookup',  true,   6,  'business', false, false, false, 'system'),
        -- Dates
        (v_tenant, v_vid, 'Debit Note Date',     'debit_note_date',     'date',        'date',    true,   7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Posting Date',        'posting_date',        'date',        'date',    false,  8,  'business', false, false, false, 'system'),
        -- Amounts
        (v_tenant, v_vid, 'Debit Amount',        'debit_amount',        'decimal',     'money',   true,   9,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Tax Amount',          'tax_amount',          'decimal',     'money',   true,   10, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Total Amount',        'total_amount',        'decimal',     'money',   true,   11, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Currency',            'currency_code',       'text',        'lookup',  true,   12, 'business', false, false, false, 'system'),
        -- FX
        (v_tenant, v_vid, 'Functional Currency', 'functional_currency_code','text',     'lookup',  false,  13, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Exchange Rate',       'exchange_rate',       'decimal',     'number',  false,  14, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Functional Amount',   'functional_amount',   'decimal',     'money',   false,  15, 'system',   true,  false, false, 'system'),
        -- Status
        (v_tenant, v_vid, 'Status',              'status',              'text',        'select',  true,   16, 'system',   true,  false, false, 'system'),
        -- System / audit fields
        (v_tenant, v_vid, 'Transaction ID',      'txn_id',              'uuid',        'hidden',  true,   90, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Decision Score',      'decision_score',      'decimal',     'hidden',  false,  91, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Route',      'approval_route',      'text',        'hidden',  false,  92, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Instance',   'approval_instance_id','uuid',        'hidden',  false,  93, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Journal Entry',       'je_id',               'uuid',        'hidden',  false,  94, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted At',           'posted_at',           'timestamptz', 'hidden',  false,  95, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted By',           'posted_by',           'uuid',        'hidden',  false,  96, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Idempotency Key',     'idempotency_key',     'text',        'hidden',  false,  97, 'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Version',             'version',             'integer',     'hidden',  true,   98, 'system',   true,  false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §6  BankStatement  (fin.bank_statement)
    -- ====================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'BankStatement');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- Identity
        (v_tenant, v_vid, 'Statement Number',  'statement_number',  'text',        'code',    true,   1,  'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Bank Account',      'bank_account_id',   'uuid',        'lookup',  true,   2,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Bank Name',         'bank_name',         'text',        'text',    false,  3,  'business', false, false, false, 'system'),
        -- Period
        (v_tenant, v_vid, 'Statement Date',    'statement_date',    'date',        'date',    true,   4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Period Start',      'period_start',      'date',        'date',    true,   5,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Period End',        'period_end',        'date',        'date',    true,   6,  'business', false, false, false, 'system'),
        -- Balances
        (v_tenant, v_vid, 'Opening Balance',   'opening_balance',   'decimal',     'money',   true,   7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Closing Balance',   'closing_balance',   'decimal',     'money',   true,   8,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Currency',          'currency_code',     'text',        'lookup',  true,   9,  'business', false, false, false, 'system'),
        -- Import metadata
        (v_tenant, v_vid, 'Source',            'source',            'text',        'select',  true,   10, 'business', false, false, true,  'system'),
        -- Status
        (v_tenant, v_vid, 'Status',            'status',            'text',        'select',  true,   11, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Line Count',        'line_count',        'integer',     'number',  false,  12, 'system',   true,  false, false, 'system'),
        -- System fields
        (v_tenant, v_vid, 'Imported By',       'imported_by',       'uuid',        'hidden',  false,  90, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Imported At',       'imported_at',       'timestamptz', 'hidden',  false,  91, 'system',   true,  false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    RAISE NOTICE 'Finance document header field dictionary seeded for PurchaseInvoice, PaymentEntry, ManualJournalEntry, CreditNote, DebitNote, BankStatement';
END;
$$;

-- ============================================================================
-- Replicate finance document header fields to all other demo tenants
-- ============================================================================
DO $$
DECLARE
    v_source_tenant uuid;
    v_target_tenant uuid;
    v_source_vid    uuid;
    v_target_vid    uuid;
    v_entity_name   text;
BEGIN
    SELECT id INTO v_source_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_source_tenant IS NULL THEN RETURN; END IF;

    FOR v_target_tenant IN
        SELECT id FROM core.tenant WHERE id != v_source_tenant
    LOOP
        FOREACH v_entity_name IN ARRAY ARRAY[
            'PurchaseInvoice', 'PaymentEntry', 'ManualJournalEntry',
            'CreditNote', 'DebitNote', 'BankStatement'
        ]
        LOOP
            v_source_vid := pg_temp.ev_id(v_source_tenant, v_entity_name);
            v_target_vid := pg_temp.ev_id(v_target_tenant, v_entity_name);

            IF v_source_vid IS NOT NULL AND v_target_vid IS NOT NULL THEN
                INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                        is_required, sort_order, origin, is_read_only, is_computed, write_once,
                                        is_unique, is_searchable, is_filterable,
                                        default_value, validation, lookup_config, is_active, created_by)
                SELECT v_target_tenant, v_target_vid, f.name, f.column_name, f.data_type, f.ui_type,
                       f.is_required, f.sort_order, f.origin, f.is_read_only, f.is_computed, f.write_once,
                       f.is_unique, f.is_searchable, f.is_filterable,
                       f.default_value, f.validation, f.lookup_config, f.is_active, 'system'
                FROM meta.field f
                WHERE f.tenant_id = v_source_tenant AND f.entity_version_id = v_source_vid
                ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Finance document header fields replicated to all tenants';
END $$;
