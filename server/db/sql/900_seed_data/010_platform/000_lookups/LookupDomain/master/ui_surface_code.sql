-- LookupDomain/master/ui_surface_code.sql
-- Lookup values for domain: ui.surface_code
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- Generic runtime entity list surface. entity_key on master.saved_view
    -- differentiates simple masters, rich masters, and approvable documents.
    ('entity.list',          'Entity List',                'ui.surface_code',
     'Generic entity grid/list view used with saved_view.entity_key.',             5),

    -- ── Procurement ────────────────────────────────────────────────────────
    ('proc.po_list',           'Purchase Order List',        'ui.surface_code',
     'Purchase order grid/list view.',                                               10),
    ('proc.po_detail',         'Purchase Order Detail',      'ui.surface_code',
     'Purchase order detail/form view.',                                             11),
    ('proc.pr_list',           'Purchase Requisition List',  'ui.surface_code',
     'Purchase requisition grid/list view.',                                         12),
    ('proc.grn_list',          'Goods Receipt List',         'ui.surface_code',
     'Goods receipt note grid/list view.',                                           13),

    -- ── Accounts Payable ───────────────────────────────────────────────────
    ('ap.invoice_list',        'AP Invoice List',            'ui.surface_code',
     'Accounts payable invoice grid/list view.',                                     20),
    ('ap.invoice_detail',      'AP Invoice Detail',          'ui.surface_code',
     'Accounts payable invoice detail/form view.',                                   21),
    ('ap.payment_list',        'AP Payment List',            'ui.surface_code',
     'Accounts payable payment grid/list view.',                                     22),
    ('ap.aging_report',        'AP Aging Report',            'ui.surface_code',
     'Accounts payable aging report.',                                               23),

    -- ── Accounts Receivable ────────────────────────────────────────────────
    ('ar.invoice_list',        'AR Invoice List',            'ui.surface_code',
     'Accounts receivable invoice grid/list view.',                                  30),
    ('ar.invoice_detail',      'AR Invoice Detail',          'ui.surface_code',
     'Accounts receivable invoice detail/form view.',                                31),
    ('ar.payment_list',        'AR Payment List',            'ui.surface_code',
     'Accounts receivable payment grid/list view.',                                  32),
    ('ar.aging_report',        'AR Aging Report',            'ui.surface_code',
     'Accounts receivable aging report.',                                            33),

    -- ── General Ledger ─────────────────────────────────────────────────────
    ('gl.journal_list',        'Journal Entry List',         'ui.surface_code',
     'General ledger journal entry grid/list view.',                                 40),
    ('gl.journal_detail',      'Journal Entry Detail',       'ui.surface_code',
     'General ledger journal entry detail/form view.',                               41),
    ('gl.trial_balance',       'Trial Balance',              'ui.surface_code',
     'Trial balance report.',                                                        42),
    ('gl.coa_list',            'Chart of Accounts',          'ui.surface_code',
     'Chart of accounts browser.',                                                   43),

    -- ── Master Data ────────────────────────────────────────────────────────
    ('master.customer_list',   'Customer List',              'ui.surface_code',
     'Customer master data grid/list view.',                                         50),
    ('master.supplier_list',   'Supplier List',              'ui.surface_code',
     'Supplier master data grid/list view.',                                         51),
    ('master.item_list',       'Item List',                  'ui.surface_code',
     'Item/product master data grid/list view.',                                     52),

    -- ── Administration ─────────────────────────────────────────────────────
    ('admin.user_list',        'User List',                  'ui.surface_code',
     'Principal/user administration grid.',                                          60),
    ('admin.role_list',        'Role List',                  'ui.surface_code',
     'RBAC role administration grid.',                                               61),
    ('admin.audit_log',        'Audit Log',                  'ui.surface_code',
     'Audit log viewer.',                                                            62),

    -- ── Home / Dashboard ───────────────────────────────────────────────────
    ('home.dashboard',         'Home Dashboard',             'ui.surface_code',
     'Main landing dashboard surface.',                                              70),
    ('home.notifications',     'Notification Center',        'ui.surface_code',
     'Notification center panel.',                                                   71)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
