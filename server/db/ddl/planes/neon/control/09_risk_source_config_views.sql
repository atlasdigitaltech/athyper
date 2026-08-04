CREATE VIEW control.v_risk_source_config
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    c.id,
    c.tenant_id,
    c.source_code,
    s.name AS source_name,
    s.source_type,
    s.provider_category,
    c.connector_instance_id,
    c.is_enabled,
    COALESCE(c.custom_trust_level, s.trust_level) AS effective_trust_level,
    c.risk_settings,
    c.status,
    c.status_changed_at,
    c.status_changed_by,
    c.created_at,
    c.created_by,
    c.updated_at,
    c.updated_by
FROM control.risk_source_config c
JOIN master.risk_source s ON s.code = c.source_code;

COMMENT ON VIEW control.v_risk_source_config IS
  'Tenant-safe effective risk-source configuration joined to the Neon source registry.';
