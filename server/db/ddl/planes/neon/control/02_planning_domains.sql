CREATE DOMAIN control.planning_model_type_d AS text
    CHECK (VALUE IN ('budget', 'forecast', 'capacity', 'headcount', 'scenario'));

CREATE DOMAIN control.planning_granularity_d AS text
    CHECK (VALUE IN ('annual', 'quarterly', 'monthly', 'fiscal_period'));

CREATE DOMAIN control.planning_record_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'retired'));

CREATE DOMAIN control.planning_driver_type_d AS text
    CHECK (VALUE IN ('quantity', 'rate', 'amount', 'percentage', 'index'));

CREATE DOMAIN control.planning_aggregation_d AS text
    CHECK (VALUE IN ('sum', 'average', 'minimum', 'maximum', 'last_value'));

CREATE DOMAIN control.planning_dependency_type_d AS text
    CHECK (VALUE IN ('input', 'formula', 'allocation'));
