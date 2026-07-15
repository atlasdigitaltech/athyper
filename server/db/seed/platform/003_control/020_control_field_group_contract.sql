-- columns:   FieldsRenderer / EntityPrintTemplate grid column count (1=single, 2=two-col, 3=three-col).
-- page_span: print two-column layout â€” 'half' joins left/right split, 'full' spans the page above.

INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    -- Â§1 identity
    ('identity',
     'Identity',
     'Primary identifier, business code, display name, and tenant ownership.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     100, 2, 'half'),

    -- Â§2 profile
    ('profile',
     'Profile',
     'Descriptive fields: description, classification type, display overrides.',
     ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'],
     200, 2, 'half'),

    -- Â§3 contact
    ('contact',
     'Contact',
     'Contact information: email addresses, phone numbers, linked addresses.',
     ARRAY['MASTER'],
     300, 2, 'half'),

    -- Â§4 reference
    ('reference',
     'References',
     'Foreign-key references to related entities (parent org, owner, assignee).',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','DIMENSION'],
     400, 3, 'half'),

    -- Â§5 dates
    ('dates',
     'Dates',
     'Business-critical date fields: validity periods, due dates, effective dates.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DIMENSION'],
     500, 3, 'half'),

    -- Â§6 financial
    ('financial',
     'Financial',
     'Monetary values, currency codes, exchange rates, amount fields.',
     ARRAY['MASTER','DOCUMENT','LEDGER'],
     600, 2, 'half'),

    -- Â§7 classification
    ('classification',
     'Classification',
     'Taxonomy fields: category, segment, intent, commodity, spend class.',
     ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'],
     700, 3, 'half'),

    -- Â§8 config
    ('config',
     'Configuration',
     'Policy settings, JSONB configuration bags, system-controlled flags.',
     ARRAY['CONTROL'],
     800, 1, 'full'),

    -- Â§9 metadata
    ('metadata',
     'Metadata',
     'Lifecycle status, active flag, extensible JSONB metadata bag, tag array.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     900, 2, 'half'),

    -- Â§10 audit
    ('audit',
     'Audit',
     'Row-level audit trail: created/updated timestamps and actor identifiers.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     950, 3, 'half'),

    -- Â§11 workflow
    ('workflow',
     'Workflow',
     'Lifecycle and workflow fields: current state, approval status, deadline.',
     ARRAY['MASTER','DOCUMENT'],
     990, 2, 'half')

ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;


-- Production P2P line/component groups. These are intentionally global group
-- keys so line, pricing, accounting and schedule metadata can share one stable
-- section vocabulary across Purchase Requisition -> PO -> Receipt/SES -> AP.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    ('source',        'Source',        'Polymorphic source document and line references.',          ARRAY['DOCUMENT','DOCUMENT_RELATION'], 120, 3, 'half'),
    ('quantities',    'Quantities',    'Ordered, shipped, received, accepted and matched quantities.', ARRAY['DOCUMENT_RELATION'], 150, 3, 'half'),
    ('pricing',       'Pricing',       'Unit price, price unit, rates and price-derived amounts.',  ARRAY['DOCUMENT','DOCUMENT_RELATION'], 590, 3, 'half'),
    ('currency',      'Currency',      'Transaction, base currency and exchange-rate fields.',      ARRAY['DOCUMENT','DOCUMENT_RELATION'], 605, 3, 'half'),
    ('accounting',    'Accounting',    'Posting, account-source and general-ledger assignment fields.', ARRAY['DOCUMENT','DOCUMENT_RELATION'], 620, 3, 'half'),
    ('allocation',    'Allocation',    'Accounting distribution basis, split and distributed amount fields.', ARRAY['DOCUMENT_RELATION'], 625, 3, 'half'),
    ('apportionment', 'Apportionment', 'Pricing component apportionment basis and generated split lineage.', ARRAY['DOCUMENT_RELATION'], 635, 3, 'half'),
    ('lineage',       'Lineage',       'Inherited/defaulted value provenance and reference value lineage.', ARRAY['DOCUMENT_RELATION'], 640, 3, 'half'),
    ('supersede',     'Supersede',     'Supersession chain fields for immutable pricing component edits.', ARRAY['DOCUMENT_RELATION'], 645, 3, 'half'),
    ('asset',         'Asset',         'Asset class and capitalisation references.',                ARRAY['DOCUMENT','DOCUMENT_RELATION'], 675, 2, 'half'),
    ('schedule',      'Schedule',      'Delivery, service and payment schedule fields.',            ARRAY['DOCUMENT_RELATION'], 680, 3, 'half'),
    ('fulfillment',   'Fulfillment',   'Fulfilled and remaining quantity/amount status fields.',    ARRAY['DOCUMENT_RELATION'], 685, 3, 'half'),
    ('tolerances',    'Tolerances',    'Quantity and price variance tolerance controls.',           ARRAY['DOCUMENT_RELATION'], 695, 3, 'half'),
    ('system',        'System',        'System-maintained technical and concurrency-control fields.', ARRAY['DOCUMENT','DOCUMENT_RELATION'], 910, 2, 'half'),
    ('annotation',    'Annotation',    'Tags, comments and extensible metadata captured with the row.', ARRAY['DOCUMENT','DOCUMENT_RELATION'], 920, 2, 'half')
ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;

UPDATE control.field_group SET ui_intent = 'reference_links'  WHERE group_key = 'source';
UPDATE control.field_group SET ui_intent = 'how_much'         WHERE group_key IN ('quantities','pricing','currency','allocation','apportionment');
UPDATE control.field_group SET ui_intent = 'where_it_costs'   WHERE group_key IN ('accounting','asset');
UPDATE control.field_group SET ui_intent = 'delivery'         WHERE group_key IN ('dates','logistics','addresses','parties');
UPDATE control.field_group SET ui_intent = 'budget'           WHERE group_key = 'budget';
UPDATE control.field_group SET ui_intent = 'reference_links'  WHERE group_key IN ('lineage','supersede','schedule','fulfillment');


-- Supplier profile groups: keep Profile business-readable; header/child tabs own duplicated data.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    ('supplier_core_identity',   'Core Identity',   'Supplier legal and display identity fields.',                  ARRAY['MASTER'], 110, 2, 'half'),
    ('supplier_registration',    'Registration',    'Supplier registration jurisdiction and references.',            ARRAY['MASTER'], 120, 2, 'half'),
    ('supplier_classification',  'Classification',  'Supplier classifications used for sourcing and segmentation.', ARRAY['MASTER'], 130, 3, 'half'),
    ('supplier_company_profile', 'Company Profile', 'Company size and public profile fields.',                      ARRAY['MASTER'], 140, 2, 'half'),
    ('supplier_descriptions',    'Description',     'Short and long business descriptions.',                        ARRAY['MASTER'], 150, 1, 'half')
ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;


-- Document detail/edit groups by entity_field.ui_hint.group_key; ui_type='hidden' suppresses fields.
-- 'header' carries the primary business identifiers so totals/technical fields stay out of the top card stack.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES (
    'header',
    'Header',
    'Primary business header fields shown on document detail/edit pages.',
    ARRAY['DOCUMENT'],
    20, 2, 'half'
)
ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;


INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    ('item',       'Item',       'Item identification, quantity and unit pricing fields.',      ARRAY['DOCUMENT_RELATION'], 155, 3, 'half'),
    ('tax',        'Tax',        'Tax and withholding tax amount fields.',                      ARRAY['DOCUMENT','DOCUMENT_RELATION'], 610, 3, 'half'),
    ('discount',   'Discount',   'Discount percentage and amount fields.',                      ARRAY['DOCUMENT','DOCUMENT_RELATION'], 630, 3, 'half'),
    ('retention',  'Retention',  'Retention percentage and retention amount fields.',           ARRAY['DOCUMENT','DOCUMENT_RELATION'], 650, 3, 'half'),
    ('dimensions', 'Dimensions', 'Cost centre, profit centre, project and site dimensions.',   ARRAY['DOCUMENT','DOCUMENT_RELATION'], 670, 2, 'half'),
    ('matching',   'Matching',   'Source document references: PO line, GR line, SES line.',    ARRAY['DOCUMENT_RELATION'], 690, 3, 'half')
ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;

-- Canonical header-level Procurement contracts (PI/PO families): keep here to avoid
-- order-dependent conflict updates when domain seeds run.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    ('general', 'General', 'Document identity, classification, and source.', ARRAY['DOCUMENT'], 50, 2, 'half'),
    ('parties', 'Parties', 'Company code, supplier, requester and responsible person.', ARRAY['DOCUMENT'], 60, 2, 'half'),
    ('billing', 'Billing Addresses', 'Header-level bill-to / bill-from / remit-to. Snapshot-frozen at submit.', ARRAY['DOCUMENT'], 70, 2, 'half'),
    ('amounts', 'Amounts', 'Header amounts: subtotal, discount, freight, misc, tax, WHT, advance, retention, totals.', ARRAY['DOCUMENT'], 600, 3, 'half'),
    ('hold', 'Hold', 'Operational hold reason.', ARRAY['DOCUMENT'], 695, 1, 'full'),
    ('fiscal', 'Fiscal Scope', 'Fiscal year and posting period.', ARRAY['DOCUMENT'], 710, 2, 'half'),
    ('payment', 'Payment Terms', 'Payment terms and method for settlement.', ARRAY['DOCUMENT'], 720, 2, 'half'),
    ('credit_note', 'Credit Note Details', 'Fields specific to credit-note invoices.', ARRAY['DOCUMENT'], 750, 2, 'half'),
    ('debit_note', 'Debit Note Details', 'Fields specific to debit-note invoices.', ARRAY['DOCUMENT'], 760, 2, 'half'),
    ('advance', 'Advance Payment Details', 'Fields specific to advance-payment invoices.', ARRAY['DOCUMENT'], 770, 2, 'half'),
    ('retention_release', 'Retention Release Details', 'Fields specific to retention-release invoices.', ARRAY['DOCUMENT'], 780, 2, 'half'),

    -- Table-scoped procurement header groups: preserves existing generic vocabulary
    -- while preventing cross-entity collisions for PI/PO-specific UI surfaces.
    ('purchase_invoice_general', 'General', 'Document identity, classification, and source.', ARRAY['DOCUMENT'], 50, 2, 'half'),
    ('purchase_invoice_parties', 'Parties', 'Company code, supplier, requester and responsible person.', ARRAY['DOCUMENT'], 60, 2, 'half'),
    ('purchase_invoice_billing', 'Billing Addresses', 'Header-level bill-to / bill-from / remit-to. Snapshot-frozen at submit.', ARRAY['DOCUMENT'], 70, 2, 'half'),
    ('purchase_invoice_amounts', 'Amounts', 'Header amounts: subtotal, discount, freight, misc, tax, WHT, advance, retention, totals.', ARRAY['DOCUMENT'], 600, 3, 'half'),
    ('purchase_invoice_hold', 'Hold', 'Operational hold reason.', ARRAY['DOCUMENT'], 695, 1, 'full'),
    ('purchase_invoice_fiscal', 'Fiscal Scope', 'Fiscal year and posting period.', ARRAY['DOCUMENT'], 710, 2, 'half'),
    ('purchase_invoice_payment', 'Payment Terms', 'Payment terms and method for settlement.', ARRAY['DOCUMENT'], 720, 2, 'half'),
    ('purchase_invoice_credit_note', 'Credit Note Details', 'Fields specific to credit-note invoices.', ARRAY['DOCUMENT'], 750, 2, 'half'),
    ('purchase_invoice_debit_note', 'Debit Note Details', 'Fields specific to debit-note invoices.', ARRAY['DOCUMENT'], 760, 2, 'half'),
    ('purchase_invoice_advance', 'Advance Payment Details', 'Fields specific to advance-payment invoices.', ARRAY['DOCUMENT'], 770, 2, 'half'),
    ('purchase_invoice_retention_release', 'Retention Release Details', 'Fields specific to retention-release invoices.', ARRAY['DOCUMENT'], 780, 2, 'half'),

    ('purchase_order_general', 'General', 'Document identity, classification, and source.', ARRAY['DOCUMENT'], 50, 2, 'half')
ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;


-- ============================================================================
-- P5 â€” assign ui_intent to line-item groups so the shared line-item runtime
-- (packages/shared/runtime-line-item/src/variants/procure.ts) can derive
-- section / tab types from metadata instead of a hardcoded convention table.
-- ============================================================================
UPDATE control.field_group SET ui_intent = 'what'             WHERE group_key IN ('item','profile');
UPDATE control.field_group SET ui_intent = 'how_much'         WHERE group_key IN ('financial','pricing');
UPDATE control.field_group SET ui_intent = 'where_it_costs'   WHERE group_key IN ('dimensions','allocation');
UPDATE control.field_group SET ui_intent = 'classify'         WHERE group_key IN ('classification','taxonomy');
UPDATE control.field_group SET ui_intent = 'tax'              WHERE group_key = 'tax';
UPDATE control.field_group SET ui_intent = 'delivery'         WHERE group_key IN ('dates','logistics','addresses','parties');
UPDATE control.field_group SET ui_intent = 'budget'           WHERE group_key = 'budget';
UPDATE control.field_group SET ui_intent = 'discount'         WHERE group_key = 'discount';
UPDATE control.field_group SET ui_intent = 'retention'        WHERE group_key = 'retention';
UPDATE control.field_group SET ui_intent = 'charges'          WHERE group_key = 'charges';
UPDATE control.field_group SET ui_intent = 'reference_links'  WHERE group_key IN ('reference','matching');
UPDATE control.field_group SET ui_intent = 'accounting'       WHERE group_key = 'accounting';


UPDATE control.field_group
SET applies_to_classes = applies_to_classes || ARRAY['DOCUMENT_RELATION']
WHERE group_key IN ('financial', 'classification', 'dates', 'logistics', 'addresses')
  AND NOT ('DOCUMENT_RELATION' = ANY(applies_to_classes));


-- Shared P2P groups (Receipt / SES / POC / DN / PR). Group keys are global â€” there is no
-- per-entity scoping beyond applies_to_classes. Hidden fields must use NULL group_key, and
-- never widen applies_to_classes onto a class whose semantics don't match (add a new key instead).
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    ('receiving', 'Receiving', 'Receiving site and warehouse for inbound documents.',          ARRAY['DOCUMENT'], 200, 2, 'half'),
    ('delivery_fulfillment', 'Fulfillment', 'Line required date, site, warehouse, and storage location.', ARRAY['DOCUMENT_RELATION'], 210, 2, 'half'),
    ('delivery_supplier_source', 'Supplier & Source', 'Line supplier, ship-from, and remit-to defaults or overrides.', ARRAY['DOCUMENT_RELATION'], 220, 2, 'half'),
    ('delivery_addresses', 'Destination & Billing', 'Line ship-to, bill-to, and bill-from address defaults or overrides.', ARRAY['DOCUMENT_RELATION'], 230, 2, 'half'),
    ('logistics', 'Logistics', 'Carrier, tracking, and delivery logistics fields.',            ARRAY['DOCUMENT','DOCUMENT_RELATION'], 220, 2, 'half'),
    ('addresses', 'Addresses', 'Bill-to, bill-from, and remit-to address references.',         ARRAY['DOCUMENT','DOCUMENT_RELATION'], 240, 3, 'half'),
    ('period',    'Period',    'Service or accrual period boundaries.',                        ARRAY['DOCUMENT'], 260, 2, 'half'),
    ('notes',     'Notes',     'Free-form notes captured on the document header.',             ARRAY['DOCUMENT'], 900, 1, 'full')
ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;

UPDATE control.field_group
SET ui_intent = 'delivery'
WHERE group_key IN ('delivery_fulfillment', 'delivery_supplier_source', 'delivery_addresses');

