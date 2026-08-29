-- seed-contract-version: 1
-- seed-pack: common.control.collaboration-notification
-- seed-pack-version: 1.0.0
-- seed-dataset: control.notification_template;control.notification_routing_rule
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Athyper collaboration and workflow notification contract","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-08-28","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: control.notification_template(tenant_id,template_key,channel,locale,version);control.notification_routing_rule(tenant_id,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:25
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN
  IF current_setting('app.database_plane',true) NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Common notification seed requires an application plane';
  END IF;
END $guard$;

-- Cross-plane collaboration notification defaults. Plane/product events are
-- seeded by their own overlay so Admin, Neon, and Mesh do not inherit each
-- other's business vocabulary.
INSERT INTO control.notification_template (
    tenant_id, template_key, channel, locale, version, subject, body_text,
    variables_schema, status, created_by
) VALUES
    (NULL, 'comment_mention', 'in_app', 'en', 1,
     'You were mentioned in a comment',
     '{{excerpt}}',
     '{"excerpt":"string","entity_type":"string","entity_id":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'comment_mention', 'email', 'en', 1,
     'You were mentioned in a comment',
     E'You were mentioned in a comment:\n\n"{{excerpt}}"',
     '{"excerpt":"string","entity_type":"string","entity_id":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, template_key, channel, locale, version)
DO UPDATE SET
    subject = EXCLUDED.subject,
    body_text = EXCLUDED.body_text,
    variables_schema = EXCLUDED.variables_schema,
    status = EXCLUDED.status,
    updated_at = now(),
    updated_by = EXCLUDED.created_by
WHERE (control.notification_template.subject,control.notification_template.body_text,control.notification_template.variables_schema,control.notification_template.status)
  IS DISTINCT FROM (EXCLUDED.subject,EXCLUDED.body_text,EXCLUDED.variables_schema,EXCLUDED.status);

INSERT INTO control.notification_routing_rule (
    tenant_id, code, name, description, event_type, template_key, channels,
    priority, recipient_rules, dedup_window_ms, is_enabled, sort_order, created_by
) VALUES (
    NULL, 'collab.comment_mention', 'Comment Mention',
    'Notify a principal when they are @-mentioned in a comment.',
    'collaboration.comment.mentioned', 'comment_mention', ARRAY['in_app','email'], 'normal',
    '{}'::jsonb, 300000, true, 10,
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (tenant_id, code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    event_type = EXCLUDED.event_type,
    template_key = EXCLUDED.template_key,
    channels = EXCLUDED.channels,
    recipient_rules = EXCLUDED.recipient_rules,
    dedup_window_ms = EXCLUDED.dedup_window_ms,
    is_enabled = EXCLUDED.is_enabled,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by
WHERE (control.notification_routing_rule.name,control.notification_routing_rule.description,control.notification_routing_rule.event_type,control.notification_routing_rule.template_key,control.notification_routing_rule.channels,control.notification_routing_rule.recipient_rules,control.notification_routing_rule.dedup_window_ms,control.notification_routing_rule.is_enabled,control.notification_routing_rule.sort_order)
  IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.event_type,EXCLUDED.template_key,EXCLUDED.channels,EXCLUDED.recipient_rules,EXCLUDED.dedup_window_ms,EXCLUDED.is_enabled,EXCLUDED.sort_order);

INSERT INTO control.notification_template (
    tenant_id, template_key, channel, locale, version, subject, body_text,
    variables_schema, status, created_by
) VALUES
    (NULL, 'workflow.work_item.assigned', 'in_app', 'en', 1,
     'New work assigned: {{title}}',
     '{{title}} is ready for your attention.',
     '{"title":"string","priority":"string","entity_type":"string","entity_id":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'workflow.work_item.assigned', 'email', 'en', 1,
     'New work assigned: {{title}}',
     E'New work has been assigned to you.\n\n{{title}}\nPriority: {{priority}}',
     '{"title":"string","priority":"string","entity_type":"string","entity_id":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, template_key, channel, locale, version)
DO UPDATE SET subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,
    variables_schema=EXCLUDED.variables_schema,status=EXCLUDED.status,
    updated_at=now(),updated_by=EXCLUDED.created_by
WHERE (control.notification_template.subject,control.notification_template.body_text,control.notification_template.variables_schema,control.notification_template.status)
  IS DISTINCT FROM (EXCLUDED.subject,EXCLUDED.body_text,EXCLUDED.variables_schema,EXCLUDED.status);

INSERT INTO control.notification_routing_rule (
    tenant_id,code,name,description,event_type,entity_type,template_key,channels,
    priority,recipient_rules,dedup_window_ms,is_enabled,sort_order,created_by
) VALUES (
    NULL,'workflow.work_item.assigned','Workflow work assigned',
    'Notify the explicitly assigned principal when a workflow work item is created.',
    'workflow.work_item.created',NULL,'workflow.work_item.assigned',
    ARRAY['in_app','email'],'normal','{}'::jsonb,0,true,20,
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (tenant_id,code)
DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
    event_type=EXCLUDED.event_type,entity_type=EXCLUDED.entity_type,
    template_key=EXCLUDED.template_key,channels=EXCLUDED.channels,
    priority=EXCLUDED.priority,recipient_rules=EXCLUDED.recipient_rules,
    dedup_window_ms=EXCLUDED.dedup_window_ms,is_enabled=EXCLUDED.is_enabled,
    sort_order=EXCLUDED.sort_order,updated_at=now(),updated_by=EXCLUDED.created_by
WHERE (control.notification_routing_rule.name,control.notification_routing_rule.description,control.notification_routing_rule.event_type,control.notification_routing_rule.entity_type,control.notification_routing_rule.template_key,control.notification_routing_rule.channels,control.notification_routing_rule.priority,control.notification_routing_rule.recipient_rules,control.notification_routing_rule.dedup_window_ms,control.notification_routing_rule.is_enabled,control.notification_routing_rule.sort_order)
  IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.event_type,EXCLUDED.entity_type,EXCLUDED.template_key,EXCLUDED.channels,EXCLUDED.priority,EXCLUDED.recipient_rules,EXCLUDED.dedup_window_ms,EXCLUDED.is_enabled,EXCLUDED.sort_order);

-- SLA automation emits these canonical work-item events after delegation is resolved.
INSERT INTO control.notification_template (
    tenant_id,template_key,channel,locale,version,subject,body_text,
    variables_schema,status,created_by
) VALUES
    (NULL,'workflow.work_item.sla_attention','in_app','en',1,
     'Urgent work: {{title}}','This work item passed its due time and needs immediate attention.',
     '{"title":"string","priority":"string","due_at":"string","entity_type":"string","entity_id":"string"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000'),
    (NULL,'workflow.work_item.sla_attention','email','en',1,
     'Urgent work: {{title}}',E'{{title}} passed its due time and needs immediate attention.\n\nDue: {{due_at}}',
     '{"title":"string","priority":"string","due_at":"string","entity_type":"string","entity_id":"string"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id,template_key,channel,locale,version)
DO UPDATE SET subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,
    variables_schema=EXCLUDED.variables_schema,status=EXCLUDED.status,
    updated_at=now(),updated_by=EXCLUDED.created_by
WHERE (control.notification_template.subject,control.notification_template.body_text,control.notification_template.variables_schema,control.notification_template.status)
  IS DISTINCT FROM (EXCLUDED.subject,EXCLUDED.body_text,EXCLUDED.variables_schema,EXCLUDED.status);

INSERT INTO control.notification_routing_rule (
    tenant_id,code,name,description,event_type,entity_type,template_key,channels,
    priority,recipient_rules,dedup_window_ms,is_enabled,sort_order,created_by
) VALUES
    (NULL,'workflow.work_item.sla_breached','Workflow SLA breached',
     'Notify the current assignee when active work passes its due time.',
     'workflow.work_item.sla_breached','workflow.work_item','workflow.work_item.sla_attention',
     ARRAY['in_app','email'],'urgent','{}'::jsonb,0,true,30,'00000000-0000-0000-0000-000000000000'),
    (NULL,'workflow.work_item.escalated','Workflow work escalated',
     'Notify the resolved delegate when overdue work is escalated.',
     'workflow.work_item.escalated','workflow.work_item','workflow.work_item.sla_attention',
     ARRAY['in_app','email'],'urgent','{}'::jsonb,0,true,31,'00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id,code)
DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
    event_type=EXCLUDED.event_type,entity_type=EXCLUDED.entity_type,
    template_key=EXCLUDED.template_key,channels=EXCLUDED.channels,
    priority=EXCLUDED.priority,recipient_rules=EXCLUDED.recipient_rules,
    dedup_window_ms=EXCLUDED.dedup_window_ms,is_enabled=EXCLUDED.is_enabled,
    sort_order=EXCLUDED.sort_order,updated_at=now(),updated_by=EXCLUDED.created_by
WHERE (control.notification_routing_rule.name,control.notification_routing_rule.description,control.notification_routing_rule.event_type,control.notification_routing_rule.entity_type,control.notification_routing_rule.template_key,control.notification_routing_rule.channels,control.notification_routing_rule.priority,control.notification_routing_rule.recipient_rules,control.notification_routing_rule.dedup_window_ms,control.notification_routing_rule.is_enabled,control.notification_routing_rule.sort_order)
  IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.event_type,EXCLUDED.entity_type,EXCLUDED.template_key,EXCLUDED.channels,EXCLUDED.priority,EXCLUDED.recipient_rules,EXCLUDED.dedup_window_ms,EXCLUDED.is_enabled,EXCLUDED.sort_order);

-- Record transfers are shared platform operations. The initiating principal is
-- always the first recipient; additional channels remain preference/consent
-- controlled and can be enabled by tenant-specific rule overrides.
INSERT INTO control.notification_template (
    tenant_id,template_key,channel,locale,version,subject,body_text,body_json,
    variables_schema,status,created_by
) VALUES
    (NULL,'records.transfer.completed','in_app','en',1,
     'Data transfer completed',
     '{{entityCode}} completed successfully. {{rowCount}} rows were processed.',
     '{"action":{"label":"View transfer","href":"/operations/data-transfers?transfer={{transferId}}"}}'::jsonb,
     '{"required":["transferId","entityCode","rowCount"],"transferId":"string","entityCode":"string","rowCount":"number"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000'),
    (NULL,'records.transfer.completed','email','en',1,
     'Data transfer completed: {{entityCode}}',
     E'Your data transfer completed successfully.\n\nEntity: {{entityCode}}\nRows processed: {{rowCount}}\n\nOpen: /operations/data-transfers?transfer={{transferId}}',
     NULL,
     '{"required":["transferId","entityCode","rowCount"],"transferId":"string","entityCode":"string","rowCount":"number"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000'),
    (NULL,'records.transfer.completed','push','en',1,
     'Data transfer completed',
     '{{entityCode}} completed successfully. {{rowCount}} rows were processed.',
     '{"renderedText":"{{entityCode}} completed successfully. {{rowCount}} rows were processed.","data":{"url":"/operations/data-transfers?transfer={{transferId}}","transferId":"{{transferId}}"}}'::jsonb,
     '{"required":["transferId","entityCode","rowCount"],"transferId":"string","entityCode":"string","rowCount":"number"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000'),
    (NULL,'records.transfer.failed','in_app','en',1,
     'Data transfer failed',
     '{{entityCode}} could not be completed. Error: {{errorCode}}.',
     '{"action":{"label":"Review transfer","href":"/operations/data-transfers?transfer={{transferId}}"}}'::jsonb,
     '{"required":["transferId","entityCode","errorCode"],"transferId":"string","entityCode":"string","errorCode":"string"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000'),
    (NULL,'records.transfer.failed','email','en',1,
     'Data transfer failed: {{entityCode}}',
     E'Your data transfer could not be completed.\n\nEntity: {{entityCode}}\nError: {{errorCode}}\n\nReview: /operations/data-transfers?transfer={{transferId}}',
     NULL,
     '{"required":["transferId","entityCode","errorCode"],"transferId":"string","entityCode":"string","errorCode":"string"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000'),
    (NULL,'records.transfer.failed','push','en',1,
     'Data transfer failed',
     '{{entityCode}} could not be completed. Error: {{errorCode}}.',
     '{"renderedText":"{{entityCode}} could not be completed. Error: {{errorCode}}.","data":{"url":"/operations/data-transfers?transfer={{transferId}}","transferId":"{{transferId}}"}}'::jsonb,
     '{"required":["transferId","entityCode","errorCode"],"transferId":"string","entityCode":"string","errorCode":"string"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000'),
    (NULL,'records.transfer.cancelled','in_app','en',1,
     'Data transfer cancelled',
     '{{entityCode}} was cancelled.',
     '{"action":{"label":"View transfer","href":"/operations/data-transfers?transfer={{transferId}}"}}'::jsonb,
     '{"required":["transferId","entityCode"],"transferId":"string","entityCode":"string"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000'),
    (NULL,'records.transfer.cancelled','email','en',1,
     'Data transfer cancelled: {{entityCode}}',
     E'Your data transfer was cancelled.\n\nEntity: {{entityCode}}\n\nOpen: /operations/data-transfers?transfer={{transferId}}',
     NULL,
     '{"required":["transferId","entityCode"],"transferId":"string","entityCode":"string"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000'),
    (NULL,'records.transfer.cancelled','push','en',1,
     'Data transfer cancelled',
     '{{entityCode}} was cancelled.',
     '{"renderedText":"{{entityCode}} was cancelled.","data":{"url":"/operations/data-transfers?transfer={{transferId}}","transferId":"{{transferId}}"}}'::jsonb,
     '{"required":["transferId","entityCode"],"transferId":"string","entityCode":"string"}'::jsonb,
     'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id,template_key,channel,locale,version)
DO UPDATE SET subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,
    body_json=EXCLUDED.body_json,variables_schema=EXCLUDED.variables_schema,
    status=EXCLUDED.status,updated_at=now(),updated_by=EXCLUDED.created_by
WHERE (control.notification_template.subject,control.notification_template.body_text,control.notification_template.body_json,control.notification_template.variables_schema,control.notification_template.status)
  IS DISTINCT FROM (EXCLUDED.subject,EXCLUDED.body_text,EXCLUDED.body_json,EXCLUDED.variables_schema,EXCLUDED.status);

INSERT INTO control.notification_routing_rule (
    tenant_id,code,name,description,event_type,entity_type,template_key,channels,
    priority,recipient_rules,dedup_window_ms,is_enabled,sort_order,created_by
) VALUES
    (NULL,'records.import.completed','Import completed','Notify the initiating principal when a governed import completes.','records.import.committed',NULL,'records.transfer.completed',ARRAY['in_app','email','push'],'normal','{"actor":true}'::jsonb,0,true,100,'00000000-0000-0000-0000-000000000000'),
    (NULL,'records.export.completed','Export completed','Notify the initiating principal when a governed export completes.','records.export.completed',NULL,'records.transfer.completed',ARRAY['in_app','email','push'],'normal','{"actor":true}'::jsonb,0,true,101,'00000000-0000-0000-0000-000000000000'),
    (NULL,'records.import.failed','Import failed','Notify the initiating principal when an import exhausts automatic retries.','records.import.failed',NULL,'records.transfer.failed',ARRAY['in_app','email','push'],'high','{"actor":true}'::jsonb,0,true,102,'00000000-0000-0000-0000-000000000000'),
    (NULL,'records.export.failed','Export failed','Notify the initiating principal when an export exhausts automatic retries.','records.export.failed',NULL,'records.transfer.failed',ARRAY['in_app','email','push'],'high','{"actor":true}'::jsonb,0,true,103,'00000000-0000-0000-0000-000000000000'),
    (NULL,'records.import.cancelled','Import cancelled','Notify the initiating principal when an import is cancelled.','records.import.cancelled',NULL,'records.transfer.cancelled',ARRAY['in_app','email','push'],'low','{"actor":true}'::jsonb,0,true,104,'00000000-0000-0000-0000-000000000000'),
    (NULL,'records.export.cancelled','Export cancelled','Notify the initiating principal when an export is cancelled.','records.export.cancelled',NULL,'records.transfer.cancelled',ARRAY['in_app','email','push'],'low','{"actor":true}'::jsonb,0,true,105,'00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id,code)
DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
    event_type=EXCLUDED.event_type,entity_type=EXCLUDED.entity_type,
    template_key=EXCLUDED.template_key,channels=EXCLUDED.channels,
    priority=EXCLUDED.priority,recipient_rules=EXCLUDED.recipient_rules,
    dedup_window_ms=EXCLUDED.dedup_window_ms,is_enabled=EXCLUDED.is_enabled,
    sort_order=EXCLUDED.sort_order,updated_at=now(),updated_by=EXCLUDED.created_by
WHERE (control.notification_routing_rule.name,control.notification_routing_rule.description,control.notification_routing_rule.event_type,control.notification_routing_rule.entity_type,control.notification_routing_rule.template_key,control.notification_routing_rule.channels,control.notification_routing_rule.priority,control.notification_routing_rule.recipient_rules,control.notification_routing_rule.dedup_window_ms,control.notification_routing_rule.is_enabled,control.notification_routing_rule.sort_order)
  IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.event_type,EXCLUDED.entity_type,EXCLUDED.template_key,EXCLUDED.channels,EXCLUDED.priority,EXCLUDED.recipient_rules,EXCLUDED.dedup_window_ms,EXCLUDED.is_enabled,EXCLUDED.sort_order);

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.notification_template WHERE tenant_id IS NULL AND template_key IN ('comment_mention','workflow.work_item.assigned','workflow.work_item.sla_attention','records.transfer.completed','records.transfer.failed','records.transfer.cancelled')) <> 15
     OR (SELECT count(*) FROM control.notification_routing_rule WHERE tenant_id IS NULL AND code IN ('collab.comment_mention','workflow.work_item.assigned','workflow.work_item.sla_breached','workflow.work_item.escalated','records.import.completed','records.export.completed','records.import.failed','records.export.failed','records.import.cancelled','records.export.cancelled')) <> 10 THEN
    RAISE EXCEPTION 'Common notification expected-count mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM control.notification_routing_rule rule WHERE rule.tenant_id IS NULL AND rule.code IN ('collab.comment_mention','workflow.work_item.assigned','workflow.work_item.sla_breached','workflow.work_item.escalated','records.import.completed','records.export.completed','records.import.failed','records.export.failed','records.import.cancelled','records.export.cancelled') AND NOT EXISTS (SELECT 1 FROM control.notification_template template WHERE template.tenant_id IS NULL AND template.template_key=rule.template_key AND template.status='active')) THEN
    RAISE EXCEPTION 'Common notification orphan routing rule';
  END IF;
  IF EXISTS (SELECT template_key,channel,locale,version FROM control.notification_template WHERE tenant_id IS NULL AND template_key IN ('comment_mention','workflow.work_item.assigned','workflow.work_item.sla_attention','records.transfer.completed','records.transfer.failed','records.transfer.cancelled') GROUP BY template_key,channel,locale,version HAVING count(*)<>1) THEN
    RAISE EXCEPTION 'Common notification uniqueness mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM control.notification_template WHERE tenant_id IS NULL AND template_key IN ('comment_mention','workflow.work_item.assigned','workflow.work_item.sla_attention','records.transfer.completed','records.transfer.failed','records.transfer.cancelled') AND (status<>'active' OR jsonb_typeof(variables_schema)<>'object')) THEN
    RAISE EXCEPTION 'Common notification semantic mismatch';
  END IF;
END $assertions$;
