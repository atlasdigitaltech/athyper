CREATE INDEX commodity_code_classification_policy_primary_domain_idx
    ON control.commodity_code_classification_policy (
        primary_commodity_domain_code, tenant_id
    )
    WHERE status = 'active';

CREATE INDEX commodity_code_classification_policy_trade_domain_idx
    ON control.commodity_code_classification_policy (
        trade_commodity_domain_code, tenant_id
    )
    WHERE trade_commodity_domain_code IS NOT NULL AND status = 'active';
