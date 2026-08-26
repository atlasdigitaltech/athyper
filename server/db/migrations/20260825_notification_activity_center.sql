-- Align deployed notification catalogs with canonical collaboration/workflow
-- producers used by the shared three-plane Activity Center.
BEGIN;

UPDATE control.notification_template
SET subject='You were mentioned in a comment',body_text=CASE channel WHEN 'email' THEN E'You were mentioned in a comment:\n\n"{{excerpt}}"' ELSE '{{excerpt}}' END,
    variables_schema='{"excerpt":"string","entity_type":"string","entity_id":"string"}'::jsonb,
    updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL AND template_key='comment_mention' AND channel IN ('in_app','email') AND locale='en';

UPDATE control.notification_routing_rule
SET event_type='collaboration.comment.mentioned',recipient_rules='{}'::jsonb,is_enabled=true,
    updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL AND code='collab.comment_mention';

INSERT INTO control.notification_template(tenant_id,template_key,channel,locale,version,subject,body_text,variables_schema,status,created_by)
VALUES
 (NULL,'workflow.work_item.assigned','in_app','en',1,'New work assigned: {{title}}','{{title}} is ready for your attention.','{"title":"string","priority":"string","entity_type":"string","entity_id":"string"}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
 (NULL,'workflow.work_item.assigned','email','en',1,'New work assigned: {{title}}',E'New work has been assigned to you.\n\n{{title}}\nPriority: {{priority}}','{"title":"string","priority":"string","entity_type":"string","entity_id":"string"}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
 (NULL,'workflow.work_item.sla_attention','in_app','en',1,'Urgent work: {{title}}','This work item passed its due time and needs immediate attention.','{"title":"string","priority":"string","due_at":"string","entity_type":"string","entity_id":"string"}'::jsonb,'active','00000000-0000-0000-0000-000000000000'),
 (NULL,'workflow.work_item.sla_attention','email','en',1,'Urgent work: {{title}}',E'{{title}} passed its due time and needs immediate attention.\n\nDue: {{due_at}}','{"title":"string","priority":"string","due_at":"string","entity_type":"string","entity_id":"string"}'::jsonb,'active','00000000-0000-0000-0000-000000000000')
ON CONFLICT(tenant_id,template_key,channel,locale,version) DO UPDATE SET subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,variables_schema=EXCLUDED.variables_schema,status=EXCLUDED.status,updated_at=now(),updated_by=EXCLUDED.created_by;

INSERT INTO control.notification_routing_rule(tenant_id,code,name,description,event_type,entity_type,template_key,channels,priority,recipient_rules,dedup_window_ms,is_enabled,sort_order,created_by)
VALUES
 (NULL,'workflow.work_item.assigned','Workflow work assigned','Notify the explicitly assigned principal when a workflow work item is created.','workflow.work_item.created',NULL,'workflow.work_item.assigned',ARRAY['in_app','email'],'normal','{}'::jsonb,0,true,20,'00000000-0000-0000-0000-000000000000'),
 (NULL,'workflow.work_item.sla_breached','Workflow SLA breached','Notify the current assignee when active work passes its due time.','workflow.work_item.sla_breached','workflow.work_item','workflow.work_item.sla_attention',ARRAY['in_app','email'],'urgent','{}'::jsonb,0,true,30,'00000000-0000-0000-0000-000000000000'),
 (NULL,'workflow.work_item.escalated','Workflow work escalated','Notify the resolved delegate when overdue work is escalated.','workflow.work_item.escalated','workflow.work_item','workflow.work_item.sla_attention',ARRAY['in_app','email'],'urgent','{}'::jsonb,0,true,31,'00000000-0000-0000-0000-000000000000')
ON CONFLICT(tenant_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,event_type=EXCLUDED.event_type,entity_type=EXCLUDED.entity_type,template_key=EXCLUDED.template_key,channels=EXCLUDED.channels,priority=EXCLUDED.priority,recipient_rules=EXCLUDED.recipient_rules,dedup_window_ms=EXCLUDED.dedup_window_ms,is_enabled=EXCLUDED.is_enabled,sort_order=EXCLUDED.sort_order,updated_at=now(),updated_by=EXCLUDED.created_by;

UPDATE control.notification_routing_rule
SET is_enabled=false,updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL AND code=ANY(ARRAY['document.purchase_invoice_lifecycle_changed','document.purchase_requisition_lifecycle_changed','document.purchase_order_confirmation_lifecycle_changed','document.delivery_note_lifecycle_changed','document.receipt_lifecycle_changed','document.service_sheet_lifecycle_changed','document.payment_entry_lifecycle_changed','workflow.sla_reminder','workflow.sla_breach','workflow.sla_auto_reject','workflow.sla_auto_cancel']);

COMMIT;
