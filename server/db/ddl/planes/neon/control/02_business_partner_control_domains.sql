CREATE DOMAIN control.partner_role_scope_d AS text
    CHECK (VALUE IN ('supplier', 'customer', 'all'));

CREATE DOMAIN control.qualification_decision_d AS text
    CHECK (VALUE IN (
        'pending', 'approved', 'conditional', 'rejected',
        'suspended', 'expired'
    ));

CREATE DOMAIN control.partner_block_status_d AS text
    CHECK (VALUE IN ('active', 'lifted', 'cancelled', 'expired'));
