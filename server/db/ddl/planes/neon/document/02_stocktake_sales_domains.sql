CREATE DOMAIN document.stocktake_status_d AS text
    CHECK (VALUE IN ('planned', 'in_progress', 'completed', 'cancelled'));

CREATE DOMAIN document.stocktake_type_d AS text
    CHECK (VALUE IN ('full', 'cycle', 'spot'));

CREATE DOMAIN document.sales_opportunity_status_d AS text
    CHECK (VALUE IN ('draft', 'qualified', 'proposal', 'won', 'lost', 'cancelled'));

CREATE DOMAIN document.sales_participation_role_d AS text
    CHECK (VALUE IN ('lead_seller', 'participant', 'fulfillment'));

CREATE DOMAIN document.sales_participation_status_d AS text
    CHECK (VALUE IN ('active', 'removed'));

CREATE DOMAIN document.sales_quotation_status_d AS text
    CHECK (VALUE IN ('draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled'));

CREATE DOMAIN document.sales_quotation_allocation_status_d AS text
    CHECK (VALUE IN ('planned', 'converted', 'cancelled'));

CREATE DOMAIN document.intercompany_fulfillment_status_d AS text
    CHECK (VALUE IN ('planned', 'posted', 'cancelled'));
