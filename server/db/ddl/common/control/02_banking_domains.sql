CREATE DOMAIN control.bank_validation_direction_d AS text
    CHECK (VALUE IN ('inbound', 'outbound', 'both'));

CREATE DOMAIN control.bank_validation_status_d AS text
    CHECK (VALUE IN ('active', 'deprecated'));
