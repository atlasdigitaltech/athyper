-- Mutable, plane-local enforcement state. It is updated only by the local
-- content/attachment services; commercial limits remain in control.
CREATE TABLE runtime_meta.tenant_usage_counter (
    tenant_id       uuid        NOT NULL,
    usage_metric_id uuid        NOT NULL,
    dimension_code  text        NOT NULL DEFAULT '*',
    consumed_value  bigint      NOT NULL DEFAULT 0,
    reserved_value  bigint      NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    reconciled_at   timestamptz,

    CONSTRAINT tenant_usage_counter_pkey
        PRIMARY KEY (tenant_id, usage_metric_id, dimension_code),
    CONSTRAINT tenant_usage_counter_dimension_chk
        CHECK (dimension_code = '*' OR dimension_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT tenant_usage_counter_consumed_chk CHECK (consumed_value >= 0),
    CONSTRAINT tenant_usage_counter_reserved_chk CHECK (reserved_value >= 0),
    CONSTRAINT tenant_usage_counter_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE runtime_meta.tenant_usage_counter IS
  'Plane-local current usage and short-lived reservations. It is not the commercial entitlement source of truth.';
