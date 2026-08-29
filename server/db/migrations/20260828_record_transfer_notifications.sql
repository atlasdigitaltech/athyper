-- Enable Activity Center delivery for transfer terminal states on preserved databases.
BEGIN;

INSERT INTO control.notification_template(
  tenant_id,template_key,channel,locale,version,subject,body_text,body_json,
  variables_schema,status,created_by
) VALUES
  (NULL,'records.transfer.completed','in_app','en',1,'Data transfer completed','{{entityCode}} completed successfully. {{rowCount}} rows were processed.','{"action":{"label":"View transfer","href":"/operations/data-transfers?transfer={{transferId}}"}}'::jsonb,'{"required":["transferId","entityCode","rowCount"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
  (NULL,'records.transfer.failed','in_app','en',1,'Data transfer failed','{{entityCode}} could not be completed. Error: {{errorCode}}.','{"action":{"label":"Review transfer","href":"/operations/data-transfers?transfer={{transferId}}"}}'::jsonb,'{"required":["transferId","entityCode","errorCode"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
  (NULL,'records.transfer.cancelled','in_app','en',1,'Data transfer cancelled','{{entityCode}} was cancelled.','{"action":{"label":"View transfer","href":"/operations/data-transfers?transfer={{transferId}}"}}'::jsonb,'{"required":["transferId","entityCode"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT(tenant_id,template_key,channel,locale,version) DO UPDATE SET
  subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,body_json=EXCLUDED.body_json,
  variables_schema=EXCLUDED.variables_schema,status=EXCLUDED.status,
  updated_at=now(),updated_by=EXCLUDED.created_by;

INSERT INTO control.notification_routing_rule(
  tenant_id,code,name,description,event_type,entity_type,template_key,channels,
  priority,recipient_rules,dedup_window_ms,is_enabled,sort_order,created_by
) VALUES
  (NULL,'records.import.completed','Import completed','Notify the initiating principal when a governed import completes.','records.import.committed',NULL,'records.transfer.completed',ARRAY['in_app'],'normal','{"actor":true}'::jsonb,0,true,100,'00000000-0000-0000-0000-000000000000'),
  (NULL,'records.export.completed','Export completed','Notify the initiating principal when a governed export completes.','records.export.completed',NULL,'records.transfer.completed',ARRAY['in_app'],'normal','{"actor":true}'::jsonb,0,true,101,'00000000-0000-0000-0000-000000000000'),
  (NULL,'records.import.failed','Import failed','Notify the initiating principal when an import exhausts automatic retries.','records.import.failed',NULL,'records.transfer.failed',ARRAY['in_app'],'high','{"actor":true}'::jsonb,0,true,102,'00000000-0000-0000-0000-000000000000'),
  (NULL,'records.export.failed','Export failed','Notify the initiating principal when an export exhausts automatic retries.','records.export.failed',NULL,'records.transfer.failed',ARRAY['in_app'],'high','{"actor":true}'::jsonb,0,true,103,'00000000-0000-0000-0000-000000000000'),
  (NULL,'records.import.cancelled','Import cancelled','Notify the initiating principal when an import is cancelled.','records.import.cancelled',NULL,'records.transfer.cancelled',ARRAY['in_app'],'low','{"actor":true}'::jsonb,0,true,104,'00000000-0000-0000-0000-000000000000'),
  (NULL,'records.export.cancelled','Export cancelled','Notify the initiating principal when an export is cancelled.','records.export.cancelled',NULL,'records.transfer.cancelled',ARRAY['in_app'],'low','{"actor":true}'::jsonb,0,true,105,'00000000-0000-0000-0000-000000000000')
ON CONFLICT(tenant_id,code) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,event_type=EXCLUDED.event_type,
  entity_type=EXCLUDED.entity_type,template_key=EXCLUDED.template_key,
  channels=EXCLUDED.channels,priority=EXCLUDED.priority,
  recipient_rules=EXCLUDED.recipient_rules,dedup_window_ms=EXCLUDED.dedup_window_ms,
  is_enabled=EXCLUDED.is_enabled,sort_order=EXCLUDED.sort_order,
  updated_at=now(),updated_by=EXCLUDED.created_by;

COMMIT;
