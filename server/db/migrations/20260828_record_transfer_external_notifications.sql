-- Add email and web-push delivery to the already-ledgered transfer notifications.
BEGIN;

INSERT INTO control.notification_template(
  tenant_id,template_key,channel,locale,version,subject,body_text,body_json,
  variables_schema,status,created_by
) VALUES
  (NULL,'records.transfer.completed','email','en',1,'Data transfer completed: {{entityCode}}',E'Your data transfer completed successfully.\n\nEntity: {{entityCode}}\nRows processed: {{rowCount}}\n\nOpen: /operations/data-transfers?transfer={{transferId}}',NULL,'{"required":["transferId","entityCode","rowCount"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
  (NULL,'records.transfer.completed','push','en',1,'Data transfer completed','{{entityCode}} completed successfully. {{rowCount}} rows were processed.','{"renderedText":"{{entityCode}} completed successfully. {{rowCount}} rows were processed.","data":{"url":"/operations/data-transfers?transfer={{transferId}}","transferId":"{{transferId}}"}}'::jsonb,'{"required":["transferId","entityCode","rowCount"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
  (NULL,'records.transfer.failed','email','en',1,'Data transfer failed: {{entityCode}}',E'Your data transfer could not be completed.\n\nEntity: {{entityCode}}\nError: {{errorCode}}\n\nReview: /operations/data-transfers?transfer={{transferId}}',NULL,'{"required":["transferId","entityCode","errorCode"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
  (NULL,'records.transfer.failed','push','en',1,'Data transfer failed','{{entityCode}} could not be completed. Error: {{errorCode}}.','{"renderedText":"{{entityCode}} could not be completed. Error: {{errorCode}}.","data":{"url":"/operations/data-transfers?transfer={{transferId}}","transferId":"{{transferId}}"}}'::jsonb,'{"required":["transferId","entityCode","errorCode"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
  (NULL,'records.transfer.cancelled','email','en',1,'Data transfer cancelled: {{entityCode}}',E'Your data transfer was cancelled.\n\nEntity: {{entityCode}}\n\nOpen: /operations/data-transfers?transfer={{transferId}}',NULL,'{"required":["transferId","entityCode"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
  (NULL,'records.transfer.cancelled','push','en',1,'Data transfer cancelled','{{entityCode}} was cancelled.','{"renderedText":"{{entityCode}} was cancelled.","data":{"url":"/operations/data-transfers?transfer={{transferId}}","transferId":"{{transferId}}"}}'::jsonb,'{"required":["transferId","entityCode"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT(tenant_id,template_key,channel,locale,version) DO UPDATE SET
  subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,body_json=EXCLUDED.body_json,
  variables_schema=EXCLUDED.variables_schema,status=EXCLUDED.status,
  updated_at=now(),updated_by=EXCLUDED.created_by;

UPDATE control.notification_routing_rule
SET channels = ARRAY['in_app','email','push'],
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL
  AND code IN (
    'records.import.completed',
    'records.export.completed',
    'records.import.failed',
    'records.export.failed',
    'records.import.cancelled',
    'records.export.cancelled'
  );

DO $$
DECLARE
  template_count integer;
  routing_count integer;
BEGIN
  SELECT count(*) INTO template_count
  FROM control.notification_template
  WHERE tenant_id IS NULL
    AND template_key IN (
      'records.transfer.completed',
      'records.transfer.failed',
      'records.transfer.cancelled'
    )
    AND channel IN ('in_app','email','push')
    AND locale = 'en'
    AND version = 1
    AND status = 'active';

  IF template_count <> 9 THEN
    RAISE EXCEPTION 'Expected 9 active transfer notification templates, found %', template_count;
  END IF;

  SELECT count(*) INTO routing_count
  FROM control.notification_routing_rule
  WHERE tenant_id IS NULL
    AND code IN (
      'records.import.completed',
      'records.export.completed',
      'records.import.failed',
      'records.export.failed',
      'records.import.cancelled',
      'records.export.cancelled'
    )
    AND channels @> ARRAY['in_app','email','push']::text[]
    AND is_enabled;

  IF routing_count <> 6 THEN
    RAISE EXCEPTION 'Expected 6 transfer routing rules with in-app, email, and push channels, found %', routing_count;
  END IF;
END;
$$;

COMMIT;
