-- Unified three-plane experience rollout controls. All flags are fail-closed.
-- Cohorts are enabled through tenant_overrides or metadata.account_overrides.
WITH flags(code, name, description, allowed_planes) AS (
  VALUES
    ('unified_shell_v2','Unified shell v2','Canonical responsive shell and account experience.',ARRAY['admin','neon','mesh']),
    ('work_inbox_v2','Work Inbox v2','Common work-item Inbox with plane adapters.',ARRAY['admin','neon','mesh']),
    ('settings_workspace_v2','Settings workspace v2','Registry-driven scoped Settings workspace.',ARRAY['admin','neon','mesh']),
    ('saved_views_hub_v2','Saved Views hub v2','Canonical Saved Views manager.',ARRAY['admin','neon','mesh']),
    ('dashboard_host_v2','Dashboard host v2','Aggregated permission-aware dashboard host.',ARRAY['admin','neon','mesh']),
    ('setup_directory_v2','Setup directory v2','Registry and permission-driven setup directory.',ARRAY['admin','neon','mesh']),
    ('content_hub_v2','Content hub v2','Plane-projected common content hub.',ARRAY['admin','neon','mesh']),
    ('document_workspace_v2','Document workspace v2','Shared document object-page workspace.',ARRAY['neon','mesh'])
)
INSERT INTO control.feature_flag(
  code,name,description,flag_type,is_enabled,tenant_overrides,rollout_pct,metadata,created_by
)
SELECT
  code,name,description,'release_gate',false,'{}'::jsonb,NULL,
  jsonb_build_object(
    'owner','experience-platform',
    'allowed_planes',to_jsonb(allowed_planes),
    'internal_admin_enabled',true,
    'account_overrides','{}'::jsonb,
    'rollout_order',jsonb_build_array(
      'internal_admin','selected_neon_tenant','selected_mesh_accounts','wider_canary','default_on'
    ),
    'observation_window_days',14,
    'rollback','disable context override; retain legacy route until observation window passes',
    'legacy_removal_requires',jsonb_build_array(
      'zero_sev1_or_sev2','wcag_gate_pass','performance_gate_pass','telemetry_observation_complete'
    )
  ),
  '00000000-0000-0000-0000-000000000000'::uuid
FROM flags
ON CONFLICT(code) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  metadata=control.feature_flag.metadata || EXCLUDED.metadata,
  updated_at=now(),
  updated_by=EXCLUDED.created_by;
