-- seed-contract-version: 1
-- seed-pack: neon.control.lookup.catalog_notification_priority
-- seed-pack-version: 1.0.0
-- seed-dataset: neon.control.lookup.catalog_notification_priority
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:4
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/control/notification_priority.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_notification_priority: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('notification.priority', 'Notification Priority', 'Dispatch and display priority for messages, notifications, delivery records, and digest items. Drives UI sort order, SLA thresholds, and retry control. is_extensible=true — tenants may define custom priority tiers with SLA targets.', 'control', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
  ('low', 'Low', 'notification.priority', 'Low-priority notification. Eligible for digest batching. Delivery may be deferred up to 24 hours.', NULL, 10, true, '{"max_retries":3,"sla_minutes":1440,"eligible_for_digest":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('normal', 'Normal', 'notification.priority', 'Standard priority. Delivered within 15 minutes. Default for all routing rules.', NULL, 20, true, '{"max_retries":5,"sla_minutes":15,"eligible_for_digest":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('high', 'High', 'notification.priority', 'High-priority notification. Delivered within 2 minutes. Not eligible for digest batching.', NULL, 30, true, '{"max_retries":7,"sla_minutes":2,"eligible_for_digest":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('urgent', 'Urgent', 'notification.priority', 'Urgent notification requiring immediate delivery (e.g. security alerts, system failures). Bypasses all batching and throttling. Retried aggressively with exponential backoff.', NULL, 40, true, '{"max_retries":10,"sla_minutes":1,"bypass_throttle":true,"eligible_for_digest":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['notification.priority'])) <> 4 THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_notification_priority: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['notification.priority']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_notification_priority: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['notification.priority']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_notification_priority: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['notification.priority']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_notification_priority: semantic assertion failed';
  END IF;
END $assertions$;
