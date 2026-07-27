-- Finance Settings directory navigation rollout.
--
-- This release gate changes only the company-root presentation. Both branches
-- continue to use the existing Finance setup read models and domain commands.
-- Disabling the flag restores the legacy Company Hub without changing data.
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
    'finance.settings_directory',
    'Finance Settings Directory',
    'Renders the settings-first Finance company directory instead of the legacy readiness Hub.',
    'release_gate',
    true,
    '{
      "owner":"finance-platform",
      "rollout_intent":"settings_first_company_navigation",
      "enabled_surface":"finance_settings_directory",
      "disabled_surface":"legacy_company_hub",
      "rollback":"disable globally or by tenant override; navigation only",
      "rollback_requires_data_change":false
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
