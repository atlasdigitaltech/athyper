-- Unified audit protocol values installed independently in every plane.
-- Reason codes remain tenant master rows; these sealed values are interpreted
-- directly by audit writers, reports, and policy enforcement.

CREATE DOMAIN audit.reason_category_d AS text
    CHECK (VALUE IN (
        'workflow',
        'accounting',
        'financial',
        'snapshot',
        'security',
        'authorization',
        'configuration',
        'integration',
        'data_correction'
    ));

CREATE DOMAIN audit.reason_severity_d AS text
    CHECK (VALUE IN ('normal', 'elevated', 'critical'));

CREATE DOMAIN audit.reason_origin_d AS text
    CHECK (VALUE IN ('platform_seed', 'tenant'));

CREATE DOMAIN audit.reason_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'retired'));

CREATE DOMAIN audit.operation_d AS text
    CHECK (VALUE IN (
        'create',
        'update',
        'delete',
        'restore',
        'execute',
        'approve',
        'reject',
        'grant',
        'revoke',
        'import',
        'export',
        'login',
        'logout'
    ));

CREATE DOMAIN audit.actor_type_d AS text
    CHECK (VALUE IN (
        'user',
        'service_account',
        'bot',
        'integration',
        'support',
        'system',
        'anonymous'
    ));

-- Locked cross-plane evidence and telemetry vocabulary. These values are
-- deliberately small and stable so they can also be used as low-cardinality
-- Prometheus dimensions and Grafana filters.
CREATE DOMAIN audit.plane_code_d AS text
    CHECK (VALUE IN ('athyper', 'neon', 'mesh'));

CREATE DOMAIN audit.outcome_d AS text
    CHECK (VALUE IN (
        'success',
        'failure',
        'denied',
        'error',
        'partial',
        'unknown'
    ));

CREATE DOMAIN audit.event_severity_d AS text
    CHECK (VALUE IN ('info', 'warning', 'error', 'critical'));

CREATE DOMAIN audit.authorization_decision_d AS text
    CHECK (VALUE IN ('allow', 'deny', 'error'));

CREATE DOMAIN audit.security_category_d AS text
    CHECK (VALUE IN (
        'authentication',
        'authorization',
        'data_access',
        'configuration',
        'credential',
        'integration',
        'malware',
        'privacy',
        'threat',
        'integrity',
        'availability',
        'other'
    ));

CREATE DOMAIN audit.capture_mode_d AS text
    CHECK (VALUE IN ('metadata','changed_fields','safe_values'));

CREATE DOMAIN audit.event_scope_d AS text
    CHECK (VALUE IN ('tenant','platform','either'));
