BEGIN;

-- Shared quota reservation state. Commercial policy remains in control;
-- current counters and idempotent holds are plane-local runtime state.
CREATE TABLE IF NOT EXISTS runtime_meta.usage_reservation (
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  usage_metric_id uuid NOT NULL, dimension_code text NOT NULL DEFAULT '*',
  resource_type text NOT NULL, resource_id uuid NOT NULL,
  reserved_value bigint NOT NULL, actual_value bigint, status text NOT NULL DEFAULT 'reserved',
  expires_at timestamptz NOT NULL, committed_at timestamptz, released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT usage_reservation_pkey PRIMARY KEY(id),
  CONSTRAINT usage_reservation_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT usage_reservation_resource_uq UNIQUE(tenant_id,usage_metric_id,dimension_code,resource_type,resource_id),
  CONSTRAINT usage_reservation_dimension_chk CHECK(dimension_code='*' OR dimension_code~'^[a-z][a-z0-9_]{1,62}$'),
  CONSTRAINT usage_reservation_resource_type_chk CHECK(resource_type~'^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  CONSTRAINT usage_reservation_values_chk CHECK(reserved_value>=0 AND(actual_value IS NULL OR actual_value>=0)),
  CONSTRAINT usage_reservation_status_chk CHECK(status IN('reserved','committed','released','expired')),
  CONSTRAINT usage_reservation_terminal_chk CHECK(
    (status='reserved' AND committed_at IS NULL AND released_at IS NULL) OR
    (status='committed' AND committed_at IS NOT NULL AND released_at IS NULL) OR
    (status IN('released','expired') AND released_at IS NOT NULL)),
  CONSTRAINT usage_reservation_expiry_chk CHECK(expires_at>created_at),
  CONSTRAINT usage_reservation_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
  CONSTRAINT usage_reservation_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
  CONSTRAINT usage_reservation_metric_fk FOREIGN KEY(usage_metric_id) REFERENCES control.usage_metric_catalog(id),
  CONSTRAINT usage_reservation_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id),
  CONSTRAINT usage_reservation_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS usage_reservation_expiry_idx ON runtime_meta.usage_reservation(tenant_id,expires_at,id) WHERE status='reserved';
CREATE INDEX IF NOT EXISTS usage_reservation_resource_idx ON runtime_meta.usage_reservation(tenant_id,resource_type,resource_id);
ALTER TABLE runtime_meta.usage_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.usage_reservation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_reservation_access ON runtime_meta.usage_reservation;
CREATE POLICY usage_reservation_access ON runtime_meta.usage_reservation FOR ALL
  USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
DROP POLICY IF EXISTS usage_reservation_seed_write ON runtime_meta.usage_reservation;
CREATE POLICY usage_reservation_seed_write ON runtime_meta.usage_reservation
  FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DROP TRIGGER IF EXISTS usage_reservation_updated_at ON runtime_meta.usage_reservation;
CREATE TRIGGER usage_reservation_updated_at BEFORE UPDATE ON runtime_meta.usage_reservation
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

INSERT INTO control.usage_metric_catalog(code,name,description,unit_code,dimension_type_code,status,created_by)
VALUES('attachment_item_count','Attachment count','Number of active tenant attachment objects.','count',NULL,'active','00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,unit_code='count',status='active';

DO $quota_backfill$
BEGIN
  IF to_regclass('document.attachment_quota_usage') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO runtime_meta.tenant_usage_counter(tenant_id,usage_metric_id,consumed_value,reserved_value,updated_at,updated_by,reconciled_at)
      SELECT usage.tenant_id,metric.id,usage.used_bytes,usage.reserved_bytes,COALESCE(usage.updated_at,usage.created_at),COALESCE(usage.updated_by,usage.created_by),clock_timestamp()
      FROM document.attachment_quota_usage usage JOIN control.usage_metric_catalog metric ON metric.code='attachment_storage_bytes'
      ON CONFLICT(tenant_id,usage_metric_id,dimension_code) DO UPDATE SET consumed_value=EXCLUDED.consumed_value,reserved_value=EXCLUDED.reserved_value,reconciled_at=clock_timestamp()
    $sql$;
    EXECUTE $sql$
      INSERT INTO runtime_meta.tenant_usage_counter(tenant_id,usage_metric_id,consumed_value,reserved_value,updated_at,updated_by,reconciled_at)
      SELECT usage.tenant_id,metric.id,usage.used_items,usage.reserved_items,COALESCE(usage.updated_at,usage.created_at),COALESCE(usage.updated_by,usage.created_by),clock_timestamp()
      FROM document.attachment_quota_usage usage JOIN control.usage_metric_catalog metric ON metric.code='attachment_item_count'
      ON CONFLICT(tenant_id,usage_metric_id,dimension_code) DO UPDATE SET consumed_value=EXCLUDED.consumed_value,reserved_value=EXCLUDED.reserved_value,reconciled_at=clock_timestamp()
    $sql$;
  END IF;
  IF to_regclass('document.content_quota_usage') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO runtime_meta.tenant_usage_counter(tenant_id,usage_metric_id,dimension_code,consumed_value,reserved_value,updated_at,updated_by,reconciled_at)
      SELECT usage.tenant_id,metric.id,regexp_replace(usage.quota_kind,'^content\.items\.',''),usage.used_items,usage.reserved_items,
             COALESCE(usage.updated_at,usage.created_at),COALESCE(usage.updated_by,usage.created_by),clock_timestamp()
      FROM document.content_quota_usage usage JOIN control.usage_metric_catalog metric ON metric.code='content_item_count'
      ON CONFLICT(tenant_id,usage_metric_id,dimension_code) DO UPDATE SET consumed_value=EXCLUDED.consumed_value,reserved_value=EXCLUDED.reserved_value,reconciled_at=clock_timestamp()
    $sql$;
  END IF;
  IF to_regclass('document.attachment_quota_reservation') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO runtime_meta.usage_reservation(id,tenant_id,usage_metric_id,resource_type,resource_id,reserved_value,actual_value,status,expires_at,committed_at,released_at,created_at,created_by,updated_at,updated_by)
      SELECT reservation.id,reservation.tenant_id,metric.id,'document.attachment',reservation.resource_id,reservation.reserved_bytes,reservation.actual_bytes,reservation.status,
             reservation.expires_at,reservation.committed_at,CASE WHEN reservation.status IN('released','expired') THEN COALESCE(reservation.released_at,reservation.updated_at,reservation.created_at) END,
             reservation.created_at,reservation.created_by,reservation.updated_at,reservation.updated_by
      FROM document.attachment_quota_reservation reservation JOIN control.usage_metric_catalog metric ON metric.code='attachment_storage_bytes'
      ON CONFLICT DO NOTHING
    $sql$;
    EXECUTE $sql$
      INSERT INTO runtime_meta.usage_reservation(tenant_id,usage_metric_id,resource_type,resource_id,reserved_value,actual_value,status,expires_at,committed_at,released_at,created_at,created_by,updated_at,updated_by)
      SELECT reservation.tenant_id,metric.id,'document.attachment',reservation.resource_id,reservation.reserved_items,CASE WHEN reservation.status='committed' THEN 1 END,reservation.status,
             reservation.expires_at,reservation.committed_at,CASE WHEN reservation.status IN('released','expired') THEN COALESCE(reservation.released_at,reservation.updated_at,reservation.created_at) END,
             reservation.created_at,reservation.created_by,reservation.updated_at,reservation.updated_by
      FROM document.attachment_quota_reservation reservation JOIN control.usage_metric_catalog metric ON metric.code='attachment_item_count'
      ON CONFLICT DO NOTHING
    $sql$;
  END IF;
  IF to_regclass('document.content_quota_reservation') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO runtime_meta.usage_reservation(id,tenant_id,usage_metric_id,dimension_code,resource_type,resource_id,reserved_value,actual_value,status,expires_at,committed_at,released_at,created_at,created_by,updated_at,updated_by)
      SELECT reservation.id,reservation.tenant_id,metric.id,regexp_replace(reservation.quota_kind,'^content\.items\.',''),'document.content_item',reservation.content_item_id,
             reservation.reserved_items,CASE WHEN reservation.status='committed' THEN reservation.reserved_items END,reservation.status,reservation.expires_at,reservation.committed_at,
             CASE WHEN reservation.status IN('released','expired') THEN COALESCE(reservation.released_at,reservation.updated_at,reservation.created_at) END,
             reservation.created_at,reservation.created_by,reservation.updated_at,reservation.updated_by
      FROM document.content_quota_reservation reservation JOIN control.usage_metric_catalog metric ON metric.code='content_item_count'
      ON CONFLICT DO NOTHING
    $sql$;
  END IF;
END
$quota_backfill$;

-- Canonical exact-record content ACL permissions.
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,is_shareable,metadata,status,created_by)
SELECT permission.id,permission.code,'entity_operation',module.id,permission.risk::authz.risk_tier_d,true,
       jsonb_build_object('content_access_level',permission.level,'content_access_rank',permission.rank),'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('9d66c90c-e450-55af-946f-4c15ef89e70e'::uuid,'document.content_item.read','read',1,'low'),
 ('f1becff1-6212-51bb-85d7-7031d536e185'::uuid,'document.content_item.write','write',2,'medium'),
 ('a93a3aaa-62cd-572d-985b-ff93b7e4aba1'::uuid,'document.content_item.publish','publish',3,'high'),
 ('a2c31ba7-51ad-5df3-a2ba-83f3f987054c'::uuid,'document.content_item.admin','admin',4,'high')
)permission(id,code,level,rank,risk) WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET is_shareable=true,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'resource','exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code LIKE 'document.content_item.%'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

ALTER TABLE authz.record_acl DROP CONSTRAINT IF EXISTS record_acl_subject_chk;
ALTER TABLE authz.record_acl ADD CONSTRAINT record_acl_subject_chk CHECK(
  (subject_kind='tenant' AND principal_id IS NULL AND group_id IS NULL) OR
  (subject_kind='principal' AND principal_id IS NOT NULL AND group_id IS NULL) OR
  (subject_kind='group' AND group_id IS NOT NULL AND principal_id IS NULL));

DO $acl_backfill$
DECLARE unsupported bigint;
BEGIN
  IF to_regclass('document.content_item_access_grant') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM document.content_item_access_grant WHERE subject_type=''role'' OR effect<>''allow''' INTO unsupported;
    IF unsupported<>0 THEN RAISE EXCEPTION 'content ACL migration blocked: % role/deny grants require explicit disposition',unsupported; END IF;
    EXECUTE $sql$
      INSERT INTO authz.record_acl(id,tenant_id,resource_code,record_id,permission_id,subject_kind,principal_id,group_id,reason,granted_by,effective_until,created_at,created_by,metadata)
      SELECT grant_row.id,grant_row.tenant_id,'document.content_item',grant_row.content_item_id,permission.id,
             CASE grant_row.subject_type WHEN 'public' THEN 'tenant' ELSE grant_row.subject_type END::authz.subject_kind_d,
             CASE WHEN grant_row.subject_type='principal' THEN grant_row.subject_id END,
             CASE WHEN grant_row.subject_type='group' THEN grant_row.subject_id END,
             'Migrated content item share',grant_row.created_by,grant_row.expires_at,grant_row.created_at,grant_row.created_by,
             '{"migration":"20260830_document_foundation_consolidation"}'::jsonb
      FROM document.content_item_access_grant grant_row
      JOIN authz.permission permission ON permission.canonical_code='document.content_item.'||grant_row.access_level
      ON CONFLICT DO NOTHING
    $sql$;
  END IF;
END
$acl_backfill$;

-- One logical attachment series is authoritative for current-version resolution.
INSERT INTO document.attachment_series(id,tenant_id,current_attachment_id,created_at,created_by)
SELECT attachment.id,attachment.tenant_id,CASE WHEN attachment.is_current THEN attachment.id END,attachment.created_at,attachment.created_by
FROM document.attachment attachment WHERE attachment.series_id IS NULL
ON CONFLICT(tenant_id,id) DO NOTHING;
UPDATE document.attachment
   SET series_id=id,
       updated_by=COALESCE(updated_by,created_by)
 WHERE series_id IS NULL;
UPDATE document.attachment_series series SET current_attachment_id=(
  SELECT attachment.id FROM document.attachment attachment
  WHERE attachment.tenant_id=series.tenant_id AND attachment.series_id=series.id
  ORDER BY attachment.is_current DESC,attachment.version_no DESC,attachment.created_at DESC LIMIT 1
),updated_by=COALESCE(series.updated_by,series.created_by)
WHERE series.current_attachment_id IS NULL;

ALTER TABLE document.attachment_link ADD COLUMN IF NOT EXISTS pinned_attachment_id uuid;
ALTER TABLE document.attachment_link ADD COLUMN IF NOT EXISTS attachment_series_id uuid;
UPDATE document.attachment_link link SET attachment_series_id=attachment.series_id
FROM document.attachment attachment
WHERE link.tenant_id=attachment.tenant_id AND link.attachment_id=attachment.id AND link.attachment_series_id IS NULL;
ALTER TABLE document.attachment_link ALTER COLUMN attachment_series_id SET NOT NULL;
ALTER TABLE document.attachment ALTER COLUMN series_id SET NOT NULL;
ALTER TABLE document.attachment DROP CONSTRAINT IF EXISTS attachment_tenant_id_series_uq;
ALTER TABLE document.attachment ADD CONSTRAINT attachment_tenant_id_series_uq UNIQUE(tenant_id,id,series_id);
ALTER TABLE document.attachment_link DROP CONSTRAINT IF EXISTS attachment_link_owner_attachment_uq;
ALTER TABLE document.attachment_link DROP CONSTRAINT IF EXISTS attachment_link_attachment_fk;
DROP INDEX IF EXISTS document.attachment_link_attachment_idx;
ALTER TABLE document.attachment_link DROP COLUMN IF EXISTS attachment_id;
ALTER TABLE document.attachment_link ADD CONSTRAINT attachment_link_owner_attachment_uq
  UNIQUE NULLS NOT DISTINCT(tenant_id,entity_type,entity_id,attachment_series_id,pinned_attachment_id,link_kind);
ALTER TABLE document.attachment_link ADD CONSTRAINT attachment_link_pinned_attachment_fk
  FOREIGN KEY(tenant_id,pinned_attachment_id,attachment_series_id) REFERENCES document.attachment(tenant_id,id,series_id);
CREATE INDEX IF NOT EXISTS attachment_link_pinned_attachment_idx ON document.attachment_link(tenant_id,pinned_attachment_id) WHERE pinned_attachment_id IS NOT NULL;
DROP INDEX IF EXISTS document.attachment_link_series_idx;
CREATE INDEX attachment_link_series_idx ON document.attachment_link(tenant_id,attachment_series_id);

-- The legacy active-attachment view selects the preview/current columns below.
-- Recreate it after the column retirement so preserved databases can migrate
-- without requiring DROP COLUMN ... CASCADE.
DROP VIEW IF EXISTS document.active_attachment;
ALTER TABLE document.attachment DROP COLUMN IF EXISTS is_current;
ALTER TABLE document.attachment DROP COLUMN IF EXISTS thumbnail_key;
ALTER TABLE document.attachment DROP COLUMN IF EXISTS preview_key;
ALTER TABLE document.attachment DROP COLUMN IF EXISTS preview_generated_at;
ALTER TABLE document.attachment DROP COLUMN IF EXISTS is_preview_generation_failed;
CREATE VIEW document.active_attachment AS
SELECT *
  FROM document.attachment
 WHERE status NOT IN ('deleted', 'expired', 'rejected');

CREATE OR REPLACE FUNCTION document.trg_attachment_link_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.attachment_series_id IS DISTINCT FROM OLD.attachment_series_id
     OR NEW.pinned_attachment_id IS DISTINCT FROM OLD.pinned_attachment_id
     OR NEW.link_kind IS DISTINCT FROM OLD.link_kind OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Attachment link identity, target, kind, and creation evidence are immutable' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TABLE IF EXISTS document.attachment_quota_reservation;
DROP TABLE IF EXISTS document.attachment_quota_usage;
DROP TABLE IF EXISTS document.content_quota_reservation;
DROP TABLE IF EXISTS document.content_quota_usage;
DROP TABLE IF EXISTS document.content_item_access_grant;

DO $grants$
BEGIN
  REVOKE ALL ON runtime_meta.usage_reservation FROM PUBLIC;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT,INSERT,UPDATE ON runtime_meta.usage_reservation TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT ALL ON runtime_meta.usage_reservation TO athyperadmin;
  END IF;
END
$grants$;

COMMIT;
