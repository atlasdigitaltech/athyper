CREATE DOMAIN control.valuation_method_d AS text
    CHECK (VALUE IN (
        'standard_cost', 'weighted_average', 'fifo',
        'moving_average', 'specific_identification'
    ));

CREATE DOMAIN control.stocking_status_d AS text
    CHECK (VALUE IN ('stocked', 'non_stock', 'consumable', 'consignment'));

CREATE DOMAIN control.inventory_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));

CREATE DOMAIN control.commodity_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));
