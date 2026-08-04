-- Polymorphic pricing and schedule child-carrier vocabularies.

CREATE DOMAIN document.pricing_source_type_d AS text
    CHECK (VALUE IN (
        'purchase_requisition_line','commitment_line','purchase_invoice_line',
        'receipt_line','service_sheet_line'
    ));

CREATE DOMAIN document.pricing_entry_level_d AS text
    CHECK (VALUE IN ('header', 'line'));

CREATE DOMAIN document.pricing_origin_d AS text
    CHECK (VALUE IN ('manual', 'inherited', 'vendor_default', 'system_resolved'));

CREATE DOMAIN document.schedule_source_type_d AS text
    CHECK (VALUE IN ('purchase_requisition_line','commitment_line','purchase_invoice_line'));

CREATE DOMAIN document.schedule_kind_d AS text
    CHECK (VALUE IN ('delivery', 'billing_milestone', 'release_window'));

CREATE DOMAIN document.schedule_fulfillment_status_d AS text
    CHECK (VALUE IN ('open', 'partial', 'fulfilled', 'closed', 'cancelled'));

CREATE DOMAIN document.schedule_status_d AS text
    CHECK (VALUE IN ('active', 'superseded', 'retired', 'cancelled'));

CREATE DOMAIN document.schedule_status_source_d AS text
    CHECK (VALUE IN ('manual', 'derived', 'system', 'terminal'));

CREATE DOMAIN document.schedule_terminal_status_d AS text
    CHECK (VALUE IN ('CANCELED', 'CLOSED', 'REJECTED'));
