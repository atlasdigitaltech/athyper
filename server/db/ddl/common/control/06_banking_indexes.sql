CREATE UNIQUE INDEX bank_account_validation_rule_applicability_uq
    ON control.bank_account_validation_rule (
        country_code, payment_rail_code, direction, COALESCE(currency_code, '***')
    )
    WHERE status = 'active';

CREATE INDEX bank_account_validation_rule_resolve_idx
    ON control.bank_account_validation_rule (
        country_code, payment_rail_code, direction, priority DESC
    )
    WHERE status = 'active';
