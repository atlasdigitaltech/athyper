-- Finance FX Entity navigation rollout.
--
-- This flag changes links only. It never changes, rewrites, or removes FX
-- rates or policy versions, so disabling it is a data-neutral rollback.
INSERT INTO control.feature_flag (
    code,
    name,
    description,
    flag_type,
    is_enabled,
    metadata,
    created_by
)
VALUES (
    'finance.fx_entity_navigation',
    'Finance FX Entity Navigation',
    'Routes Finance FX rate-maintenance links to the governed fx_rate Entity surface.',
    'release_gate',
    true,
    '{
      "owner":"finance-platform",
      "rollout_intent":"entity_rate_maintenance_after_slice_4_parity",
      "rollback":"disable globally or by tenant override; no data rollback required",
      "legacy_destination":"tenant_currency_fx_settings",
      "new_destination":"/app/fx_rate"
    }'::jsonb,
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) DO UPDATE
SET
    name=EXCLUDED.name,
    description=EXCLUDED.description,
    flag_type=EXCLUDED.flag_type,
    metadata=control.feature_flag.metadata || EXCLUDED.metadata,
    updated_at=now(),
    updated_by=EXCLUDED.created_by;
