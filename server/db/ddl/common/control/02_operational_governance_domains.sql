CREATE DOMAIN control.connector_instance_status_d AS text
    CHECK (VALUE IN ('draft', 'testing', 'active', 'paused', 'error', 'deprecated'));

CREATE DOMAIN control.connector_health_status_d AS text
    CHECK (VALUE IN ('unknown', 'healthy', 'degraded', 'down'));

CREATE DOMAIN control.integration_endpoint_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'paused', 'error', 'deprecated'));

CREATE DOMAIN control.http_method_d AS text
    CHECK (VALUE IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'));

CREATE DOMAIN control.webhook_subscription_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'paused', 'error', 'deprecated'));

CREATE DOMAIN control.cycle_config_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));

CREATE DOMAIN control.cycle_frequency_d AS text
    CHECK (VALUE IN (
        'daily', 'weekly', 'biweekly', 'semimonthly', 'monthly',
        'quarterly', 'semiannual', 'annual', 'adhoc'
    ));

CREATE DOMAIN control.cycle_completion_mode_d AS text
    CHECK (VALUE IN ('manual', 'system', 'hybrid'));

CREATE DOMAIN control.cycle_dependency_type_d AS text
    CHECK (VALUE IN ('finish_to_start', 'finish_to_finish'));

CREATE DOMAIN control.cycle_carryforward_action_d AS text
    CHECK (VALUE IN ('force_close', 'auto_carry', 'expire'));

CREATE DOMAIN control.cycle_deviation_type_d AS text
    CHECK (VALUE IN ('exception', 'override', 'waiver'));
