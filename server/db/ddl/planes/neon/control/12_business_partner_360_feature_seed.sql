-- seed-contract-version: 1
-- seed-pack: neon.business-partner-360-rollout
-- seed-pack-version: 1.0.0
-- seed-dataset: platform.feature-flag
-- seed-data-class: production_reference
-- seed-provenance: {"source":"BS360-10 release plan","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-08-30","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.feature_flag_catalog(code)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:neon-business-partner-360-rollout-v1
-- seed-expected-row-count: exact:1
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Business Partner 360 rollout flag requires the NEON plane';
  END IF;
END $guard$;

INSERT INTO control.feature_flag_catalog
  (id, code, name, description, flag_kind, default_enabled, rollout_pct, metadata, status, created_by)
VALUES
  (md5('neon:feature:business-partner-360')::uuid,
   'neon.business_partner.view_360',
   'Business Partner 360',
   'Measured tenant-stable rollout gate for the governed Business Partner 360 view.',
   'experiment', true, 0,
   '{"_seed":{"pack":"neon.business-partner-360-rollout","version":"1.0.0"},"promotionOrder":["internal","canary","broad"],"slo":{"summaryP95Ms":500,"sectionP95Ms":750,"errorRateMax":0.01,"meshFallbackRateMax":0.05},"retirementSignal":"bp360_legacy_aggregate_consumers_zero","rollback":"set rollout_pct to 0 and invalidate experience feature caches"}'::jsonb,
   'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  metadata = EXCLUDED.metadata,
  status = 'active',
  updated_at = now(),
  updated_by = EXCLUDED.created_by
WHERE (control.feature_flag_catalog.name, control.feature_flag_catalog.description,
       control.feature_flag_catalog.metadata, control.feature_flag_catalog.status)
  IS DISTINCT FROM
      (EXCLUDED.name, EXCLUDED.description, EXCLUDED.metadata, EXCLUDED.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.feature_flag_catalog
      WHERE code = 'neon.business_partner.view_360' AND flag_kind = 'experiment'
        AND rollout_pct BETWEEN 0 AND 100 AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'Business Partner 360 rollout flag assertion failed';
  END IF;
  IF EXISTS (
      SELECT 1 FROM control.feature_flag_catalog flag
      LEFT JOIN control.module module ON module.id = flag.module_id
      WHERE flag.code = 'neon.business_partner.view_360'
        AND flag.module_id IS NOT NULL AND module.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Business Partner 360 rollout flag orphan assertion failed';
  END IF;
  IF EXISTS (
      SELECT code FROM control.feature_flag_catalog
      WHERE code = 'neon.business_partner.view_360'
      GROUP BY code HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Business Partner 360 rollout flag uniqueness assertion failed';
  END IF;
  IF EXISTS (
      SELECT 1 FROM control.feature_flag_catalog
      WHERE code = 'neon.business_partner.view_360'
        AND (flag_kind <> 'experiment' OR NOT default_enabled
             OR rollout_pct <> 0 OR status <> 'active')
  ) THEN
    RAISE EXCEPTION 'Business Partner 360 rollout flag semantic assertion failed';
  END IF;
END $assertions$;
