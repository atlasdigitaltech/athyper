-- 100_master/004_retire_business_partner_service_coverage.sql
-- Purpose: retire BP service coverage metadata. Geographic/service coverage
-- belongs to Business Network capability, not the BP master profile.

DO $$
BEGIN
  DELETE FROM control.entity_flow_section
   WHERE payload_key = 'service_coverage'
      OR entity_code = 'business_partner_service_coverage'
      OR section_key = 'service_coverage';

  -- Do not delete control.entity/control.entity_version rows here.
  -- They may already be referenced by immutable snapshot.entity_compiled rows
  -- through ec_version_fk. Archive the metadata instead so runtime lists stop
  -- surfacing coverage while historical compiled snapshots remain valid.
  UPDATE control.entity_version ev
     SET status = 'ARCHIVED',
         change_summary = COALESCE(change_summary, 'Retired: BP service coverage moved to Business Network capability.')
    FROM control.entity e
   WHERE ev.entity_id = e.id
     AND e.tenant_id IS NULL
     AND e.entity_code IN (
       'business_partner_service_coverage',
       'supplier_service_coverage',
       'vendor_service_coverage'
     )
     AND ev.status IS DISTINCT FROM 'ARCHIVED';

  UPDATE control.entity
     SET status = 'ARCHIVED',
         feature_flags = COALESCE(feature_flags, '{}'::jsonb)
           || jsonb_build_object(
                'retired', true,
                'retired_reason', 'BP service coverage moved to Business Network capability.'
              )
   WHERE tenant_id IS NULL
     AND entity_code IN (
       'business_partner_service_coverage',
       'supplier_service_coverage',
       'vendor_service_coverage'
     )
     AND status IS DISTINCT FROM 'ARCHIVED';
END $$;
