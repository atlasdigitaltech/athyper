CREATE DOMAIN master.partner_role_d AS text
    CHECK (VALUE IN ('supplier', 'customer'));

CREATE DOMAIN master.partner_extension_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));

CREATE DOMAIN master.governance_member_type_d AS text
    CHECK (VALUE IN (
        'individual', 'organization', 'trust', 'public_float', 'other'
    ));

CREATE DOMAIN master.intercompany_settlement_mode_d AS text
    CHECK (VALUE IN ('open_item', 'netting', 'cash', 'none'));

CREATE DOMAIN master.intercompany_mirror_mode_d AS text
    CHECK (VALUE IN ('manual', 'automatic', 'disabled'));
