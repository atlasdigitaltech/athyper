-- seed-contract-version: 1
-- seed-pack: neon.control.business-notification
-- seed-pack-version: 1.2.0
-- seed-dataset: control.notification_template;control.notification_routing_rule
-- seed-data-class: production_reference
-- seed-provenance: {"source":"NEON document and workflow notification contract","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-08-28","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.notification_template(tenant_id,template_key,channel,locale,version);control.notification_routing_rule(tenant_id,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:50
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN
  IF current_setting('app.database_plane',true)<>'neon' THEN RAISE EXCEPTION 'NEON notification seed requires app.database_plane=neon'; END IF;
END $guard$;

-- Neon business-event notification defaults.
INSERT INTO control.notification_template (
    tenant_id, template_key, channel, locale, version, subject, body_text,
    variables_schema, status, created_by
) VALUES
    (NULL, 'purchase_invoice.lifecycle.changed', 'in_app', 'en', 1,
     'Purchase invoice {{code}} moved to {{to_status}}',
     '{{actor_name}} changed purchase invoice {{code}} from {{from_status}} to {{to_status}}.',
     '{"code":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_invoice.lifecycle.changed', 'push', 'en', 1,
     'Purchase invoice updated', '{{code}} is now {{to_status}}.',
     '{"code":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, template_key, channel, locale, version)
DO UPDATE SET subject = EXCLUDED.subject, body_text = EXCLUDED.body_text,
    variables_schema = EXCLUDED.variables_schema, status = EXCLUDED.status,
    updated_at = now(), updated_by = EXCLUDED.created_by
WHERE (control.notification_template.subject,control.notification_template.body_text,control.notification_template.variables_schema,control.notification_template.status)
  IS DISTINCT FROM (EXCLUDED.subject,EXCLUDED.body_text,EXCLUDED.variables_schema,EXCLUDED.status);

-- BP-V1 reference-only lifecycle templates. These variables are deliberately
-- limited to the safe primitive templateData contract.
INSERT INTO control.notification_template (
    tenant_id, template_key, channel, locale, version, subject, body_text,
    variables_schema, status, created_by
) VALUES
    (NULL, 'business_partner.case.submitted.v1', 'in_app', 'en', 1,
     'Business Partner request {{caseNo}} needs review',
     '{{caseNo}} was submitted and is ready for an authorized decision.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.submitted.v1', 'email', 'en', 1,
     'Business Partner request {{caseNo}} needs review',
     E'{{caseNo}} was submitted and is ready for an authorized decision.\n\nOpen the in-app task to review the current case version.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.returned.v1', 'in_app', 'en', 1,
     'Business Partner request {{caseNo}} was returned',
     '{{caseNo}} was returned for correction. Open the case to review the decision reason.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.returned.v1', 'email', 'en', 1,
     'Business Partner request {{caseNo}} was returned',
     E'{{caseNo}} was returned for correction.\n\nOpen the authorized case to review the decision reason.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.approved.v1', 'in_app', 'en', 1,
     'Business Partner request {{caseNo}} was approved',
     '{{caseNo}} is approved and ready for governed materialization.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.rejected.v1', 'in_app', 'en', 1,
     'Business Partner request {{caseNo}} was rejected',
     '{{caseNo}} was rejected. The decision remains available as read-only case evidence.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.rejected.v1', 'email', 'en', 1,
     'Business Partner request {{caseNo}} was rejected',
     '{{caseNo}} was rejected. Open the authorized case to review the outcome.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.materialized.v1', 'in_app', 'en', 1,
     'Business Partner request {{caseNo}} was materialized',
     '{{caseNo}} completed successfully. Open the governed result to view its reference coordinates.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.workflow.stage.activated.v1', 'in_app', 'en', 1,
     'Approval stage ready for {{caseNo}}',
     'A Business Partner approval stage is ready for your decision.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.workflow.stage.activated.v1', 'email', 'en', 1,
     'Approval stage ready for {{caseNo}}',
     E'A Business Partner approval stage is ready for your decision.\n\nCase: {{caseNo}}',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.workflow.stage.activated.v1', 'push', 'en', 1,
     'Approval stage ready for {{caseNo}}',
     'A Business Partner approval stage is ready for your decision.',
     '{"required":["caseNo","status","rowVersion"]}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, template_key, channel, locale, version)
DO UPDATE SET subject = EXCLUDED.subject, body_text = EXCLUDED.body_text,
    variables_schema = EXCLUDED.variables_schema, status = EXCLUDED.status,
    updated_at = now(), updated_by = EXCLUDED.created_by
WHERE (control.notification_template.subject,control.notification_template.body_text,control.notification_template.variables_schema,control.notification_template.status)
  IS DISTINCT FROM (EXCLUDED.subject,EXCLUDED.body_text,EXCLUDED.variables_schema,EXCLUDED.status);

UPDATE control.notification_template
SET body_json='{"renderedText":"A Business Partner approval stage is ready for your decision.","data":{"caseNo":"{{caseNo}}"}}'::jsonb,
    updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL
  AND template_key='business_partner.workflow.stage.activated.v1'
  AND channel='push'
  AND body_json IS DISTINCT FROM '{"renderedText":"A Business Partner approval stage is ready for your decision.","data":{"caseNo":"{{caseNo}}"}}'::jsonb;

INSERT INTO control.notification_routing_rule (
    tenant_id, code, name, description, event_type, entity_type, template_key,
    channels, priority, recipient_rules, dedup_window_ms, is_enabled, sort_order, created_by
) VALUES
    (NULL, 'business_partner.case.submitted', 'Business Partner Case Submitted',
     'Notify the current approver references for a submitted governed case.',
     'business_partner.case.submitted', 'entity_case', 'business_partner.case.submitted.v1',
     ARRAY['in_app','email'], 'normal', '{"principal_paths":["recipient_principal_ids"]}'::jsonb, 0, true, 100, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.returned', 'Business Partner Case Returned',
     'Notify requester/applicant references when a governed case is returned.',
     'business_partner.case.returned', 'entity_case', 'business_partner.case.returned.v1',
     ARRAY['in_app','email'], 'normal', '{"principal_paths":["recipient_principal_ids"]}'::jsonb, 0, true, 110, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.approved', 'Business Partner Case Approved',
     'Notify requester/relationship-owner references when a governed case is approved.',
     'business_partner.case.approved', 'entity_case', 'business_partner.case.approved.v1',
     ARRAY['in_app'], 'normal', '{"principal_paths":["recipient_principal_ids"]}'::jsonb, 0, true, 120, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.rejected', 'Business Partner Case Rejected',
     'Notify requester/applicant references when a governed case is rejected.',
     'business_partner.case.rejected', 'entity_case', 'business_partner.case.rejected.v1',
     ARRAY['in_app','email'], 'normal', '{"principal_paths":["recipient_principal_ids"]}'::jsonb, 0, true, 130, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.case.materialized', 'Business Partner Case Materialized',
     'Notify requester/relationship-owner references when materialization completes.',
     'business_partner.case.materialized', 'entity_case', 'business_partner.case.materialized.v1',
     ARRAY['in_app'], 'normal', '{"principal_paths":["recipient_principal_ids"]}'::jsonb, 0, true, 140, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'business_partner.workflow.stage.activated', 'Business Partner Approval Stage Ready',
     'Notify eligible approvers when the next configured Business Partner workflow stage activates.',
     'business_partner.workflow.stage.activated', 'entity_case', 'business_partner.workflow.stage.activated.v1',
     ARRAY['in_app','email','push'], 'high', '{"principal_paths":["recipient_principal_ids"]}'::jsonb, 0, true, 150, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code)
DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
    event_type = EXCLUDED.event_type, entity_type = EXCLUDED.entity_type,
    template_key = EXCLUDED.template_key, channels = EXCLUDED.channels,
    priority = EXCLUDED.priority, recipient_rules = EXCLUDED.recipient_rules,
    dedup_window_ms = EXCLUDED.dedup_window_ms, is_enabled = EXCLUDED.is_enabled,
    sort_order = EXCLUDED.sort_order, updated_at = now(), updated_by = EXCLUDED.created_by
WHERE (control.notification_routing_rule.name,control.notification_routing_rule.description,control.notification_routing_rule.event_type,control.notification_routing_rule.entity_type,control.notification_routing_rule.template_key,control.notification_routing_rule.channels,control.notification_routing_rule.priority,control.notification_routing_rule.recipient_rules,control.notification_routing_rule.dedup_window_ms,control.notification_routing_rule.is_enabled,control.notification_routing_rule.sort_order)
  IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.event_type,EXCLUDED.entity_type,EXCLUDED.template_key,EXCLUDED.channels,EXCLUDED.priority,EXCLUDED.recipient_rules,EXCLUDED.dedup_window_ms,EXCLUDED.is_enabled,EXCLUDED.sort_order);

-- Neon document lifecycle and workflow-SLA contracts retained from the live
-- platform seed. IDs are deliberately omitted so target environments allocate
-- their own identities while the semantic coordinates remain deterministic.
INSERT INTO control.notification_template (
    tenant_id, template_key, channel, locale, version, subject, body_text,
    variables_schema, status, created_by
) VALUES
    (NULL, 'purchase_requisition.lifecycle.changed', 'in_app', 'en', 1,
     'Requisition {{requisition_number}} moved to {{to_status}}',
     '{{actor_name}} moved requisition {{requisition_number}} from {{from_status}} to {{to_status}}.',
     '{"requisition_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_requisition.lifecycle.changed', 'email', 'en', 1,
     'Requisition {{requisition_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved requisition {{requisition_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"requisition_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order_confirmation.lifecycle.changed', 'in_app', 'en', 1,
     'PO Confirmation {{confirmation_number}} moved to {{to_status}}',
     '{{actor_name}} moved PO confirmation {{confirmation_number}} from {{from_status}} to {{to_status}}.',
     '{"confirmation_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'purchase_order_confirmation.lifecycle.changed', 'email', 'en', 1,
     'PO Confirmation {{confirmation_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved PO confirmation {{confirmation_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"confirmation_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'delivery_note.lifecycle.changed', 'in_app', 'en', 1,
     'Delivery Note {{delivery_note_number}} moved to {{to_status}}',
     '{{actor_name}} moved delivery note {{delivery_note_number}} from {{from_status}} to {{to_status}}.',
     '{"delivery_note_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'delivery_note.lifecycle.changed', 'email', 'en', 1,
     'Delivery Note {{delivery_note_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved delivery note {{delivery_note_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"delivery_note_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt.lifecycle.changed', 'in_app', 'en', 1,
     'Receipt {{code}} moved to {{to_status}}',
     '{{actor_name}} moved receipt {{code}} from {{from_status}} to {{to_status}}.',
     '{"code":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'receipt.lifecycle.changed', 'email', 'en', 1,
     'Receipt {{code}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved receipt {{code}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"code":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet.lifecycle.changed', 'in_app', 'en', 1,
     'Service Sheet {{service_sheet_number}} moved to {{to_status}}',
     '{{actor_name}} moved service sheet {{service_sheet_number}} from {{from_status}} to {{to_status}}.',
     '{"service_sheet_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'service_sheet.lifecycle.changed', 'email', 'en', 1,
     'Service Sheet {{service_sheet_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved service sheet {{service_sheet_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"service_sheet_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry.lifecycle.changed', 'in_app', 'en', 1,
     'Payment {{payment_number}} moved to {{to_status}}',
     '{{actor_name}} moved payment {{payment_number}} from {{from_status}} to {{to_status}}.',
     '{"payment_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'payment_entry.lifecycle.changed', 'email', 'en', 1,
     'Payment {{payment_number}} moved to {{to_status}}',
     E'Hi,\n\n{{actor_name}} moved payment {{payment_number}} from {{from_status}} to {{to_status}}.\n\nView it: {{entity_url}}',
     '{"payment_number":"string","from_status":"string","to_status":"string","actor_name":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'wfl.sla_reminder', 'in_app', 'en', 1,
     'Reminder: {{entity_label}} {{entity_code}} awaiting approval',
     '{{entity_label}} {{entity_code}} has been pending approval for {{elapsed_hours}}h. SLA target: {{sla_target_hours}}h.',
     '{"entity_label":"string","entity_code":"string","elapsed_hours":"number","sla_target_hours":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'wfl.sla_reminder', 'email', 'en', 1,
     'Reminder: {{entity_label}} {{entity_code}} awaiting your approval',
     E'Hi,\n\n{{entity_label}} {{entity_code}} has been awaiting your approval for {{elapsed_hours}}h ({{percent_of_sla}}% of SLA).\n\nReview it: {{entity_url}}',
     '{"entity_label":"string","entity_code":"string","elapsed_hours":"number","sla_target_hours":"number","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'wfl.sla_breach', 'in_app', 'en', 1,
     'SLA breached: {{entity_label}} {{entity_code}} escalated',
     '{{entity_label}} {{entity_code}} breached its {{sla_target_hours}}h SLA. Escalated to {{escalated_to}}.',
     '{"entity_label":"string","entity_code":"string","sla_target_hours":"number","escalated_to":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'wfl.sla_breach', 'email', 'en', 1,
     'SLA breached: {{entity_label}} {{entity_code}}',
     E'SLA breached.\n\n{{entity_label}} {{entity_code}} has exceeded its {{sla_target_hours}}h approval SLA and is now escalated to {{escalated_to}}.\n\nReview it: {{entity_url}}',
     '{"entity_label":"string","entity_code":"string","sla_target_hours":"number","escalated_to":"string","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'wfl.sla_auto_reject', 'in_app', 'en', 1,
     'Auto-rejected: {{entity_label}} {{entity_code}}',
     '{{entity_label}} {{entity_code}} was auto-rejected after exceeding {{percent_of_sla}}% of its SLA. Resubmit if still needed.',
     '{"entity_label":"string","entity_code":"string","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'wfl.sla_auto_reject', 'email', 'en', 1,
     'Auto-rejected: {{entity_label}} {{entity_code}}',
     E'{{entity_label}} {{entity_code}} was automatically rejected after the SLA was exceeded by {{percent_of_sla}}% with no decision.\n\nResubmit if still needed: {{entity_url}}',
     '{"entity_label":"string","entity_code":"string","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'wfl.sla_auto_cancel', 'in_app', 'en', 1,
     'Auto-cancelled: {{entity_label}} {{entity_code}}',
     '{{entity_label}} {{entity_code}} was auto-cancelled after exceeding {{percent_of_sla}}% of its SLA.',
     '{"entity_label":"string","entity_code":"string","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000'),
    (NULL, 'wfl.sla_auto_cancel', 'email', 'en', 1,
     'Auto-cancelled: {{entity_label}} {{entity_code}}',
     E'{{entity_label}} {{entity_code}} was automatically cancelled after the SLA was exceeded by {{percent_of_sla}}% with no decision.\n\nThe operational window has closed.',
     '{"entity_label":"string","entity_code":"string","percent_of_sla":"number","entity_type":"string","entity_id":"string","entity_url":"string"}'::jsonb,
     'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, template_key, channel, locale, version)
DO UPDATE SET subject = EXCLUDED.subject, body_text = EXCLUDED.body_text,
    variables_schema = EXCLUDED.variables_schema, status = EXCLUDED.status,
    updated_at = now(), updated_by = EXCLUDED.created_by
WHERE (control.notification_template.subject,control.notification_template.body_text,control.notification_template.variables_schema,control.notification_template.status)
  IS DISTINCT FROM (EXCLUDED.subject,EXCLUDED.body_text,EXCLUDED.variables_schema,EXCLUDED.status);

INSERT INTO control.notification_routing_rule (
    tenant_id, code, name, description, event_type, entity_type, template_key,
    channels, priority, recipient_rules, dedup_window_ms, is_enabled, sort_order, created_by
) VALUES (
    NULL, 'document.purchase_invoice_lifecycle_changed',
    'Purchase Invoice Lifecycle Changed',
    'Notify the acting principal when a purchase invoice lifecycle status changes.',
    'purchase_invoice.lifecycle.changed', 'purchase_invoice',
    'purchase_invoice.lifecycle.changed', ARRAY['in_app','push'], 'normal',
    '{"actor":true,"explicit_ids":[]}'::jsonb, 300000, true, 20,
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (tenant_id, code)
DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
    event_type = EXCLUDED.event_type, entity_type = EXCLUDED.entity_type,
    template_key = EXCLUDED.template_key, channels = EXCLUDED.channels,
    priority = EXCLUDED.priority, recipient_rules = EXCLUDED.recipient_rules,
    dedup_window_ms = EXCLUDED.dedup_window_ms,
    is_enabled = EXCLUDED.is_enabled, sort_order = EXCLUDED.sort_order,
    updated_at = now(), updated_by = EXCLUDED.created_by
WHERE (control.notification_routing_rule.name,control.notification_routing_rule.description,control.notification_routing_rule.event_type,control.notification_routing_rule.entity_type,control.notification_routing_rule.template_key,control.notification_routing_rule.channels,control.notification_routing_rule.priority,control.notification_routing_rule.recipient_rules,control.notification_routing_rule.dedup_window_ms,control.notification_routing_rule.is_enabled,control.notification_routing_rule.sort_order)
  IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.event_type,EXCLUDED.entity_type,EXCLUDED.template_key,EXCLUDED.channels,EXCLUDED.priority,EXCLUDED.recipient_rules,EXCLUDED.dedup_window_ms,EXCLUDED.is_enabled,EXCLUDED.sort_order);

INSERT INTO control.notification_routing_rule (
    tenant_id, code, name, description, event_type, entity_type, template_key,
    channels, priority, recipient_rules, dedup_window_ms, is_enabled, sort_order, created_by
) VALUES
    (NULL, 'document.purchase_requisition_lifecycle_changed',
     'Purchase Requisition Lifecycle Changed',
     'Notify requester and current assignee when a requisition transitions.',
     'purchase_requisition.lifecycle.changed', 'purchase_requisition',
     'purchase_requisition.lifecycle.changed', ARRAY['in_app','email'], 'normal',
     '{"actor":true,"workflow_phase":"in_workflow","roles":["requester","approver"]}'::jsonb,
     300000, true, 10, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'document.purchase_order_confirmation_lifecycle_changed',
     'PO Confirmation Lifecycle Changed',
     'Notify buyer when a supplier confirms, disputes, or amends a PO.',
     'purchase_order_confirmation.lifecycle.changed', 'purchase_order_confirmation',
     'purchase_order_confirmation.lifecycle.changed', ARRAY['in_app','email'], 'normal',
     '{"actor":true,"roles":["buyer","procurement_manager"]}'::jsonb,
     300000, true, 20, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'document.delivery_note_lifecycle_changed',
     'Delivery Note Lifecycle Changed',
     'Notify warehouse and buyer when a delivery transitions.',
     'delivery_note.lifecycle.changed', 'delivery_note',
     'delivery_note.lifecycle.changed', ARRAY['in_app'], 'normal',
     '{"actor":true,"roles":["warehouse_manager","buyer"]}'::jsonb,
     300000, true, 30, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'document.receipt_lifecycle_changed', 'Receipt Lifecycle Changed',
     'Notify warehouse and AP when a receipt is approved, posted, or reversed.',
     'receipt.lifecycle.changed', 'receipt', 'receipt.lifecycle.changed',
     ARRAY['in_app','email'], 'normal',
     '{"actor":true,"workflow_phase":"post_workflow","roles":["warehouse_manager","ap_clerk"]}'::jsonb,
     300000, true, 40, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'document.service_sheet_lifecycle_changed',
     'Service Sheet Lifecycle Changed',
     'Notify project owner, requester, and finance when a service sheet transitions.',
     'service_sheet.lifecycle.changed', 'service_sheet',
     'service_sheet.lifecycle.changed', ARRAY['in_app','email'], 'normal',
     '{"actor":true,"workflow_phase":"in_workflow","roles":["project_owner","requester","finance_controller"]}'::jsonb,
     300000, true, 50, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'document.payment_entry_lifecycle_changed',
     'Payment Entry Lifecycle Changed',
     'Notify treasury and AP when a payment lifecycle changes.',
     'payment_entry.lifecycle.changed', 'payment_entry',
     'payment_entry.lifecycle.changed', ARRAY['in_app','email'], 'high',
     '{"actor":true,"workflow_phase":"post_workflow","roles":["treasury_manager","finance_controller","ap_clerk"]}'::jsonb,
     300000, true, 55, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'workflow.sla_reminder', 'Workflow SLA Reminder',
     'Notify the assignee at 75 percent of the SLA window.',
     'workflow.sla_reminder', NULL, 'wfl.sla_reminder',
     ARRAY['in_app','email'], 'normal',
     '{"workflow_phase":"in_workflow","assignees_only":true}'::jsonb,
     86400000, true, 60, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'workflow.sla_breach', 'Workflow SLA Breach',
     'Notify the escalation chain when the SLA is breached.',
     'workflow.sla_breach', NULL, 'wfl.sla_breach',
     ARRAY['in_app','email'], 'high',
     '{"workflow_phase":"in_workflow","escalation_chain":true}'::jsonb,
     86400000, true, 70, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'workflow.sla_auto_reject', 'Workflow SLA Auto-Reject',
     'Notify requester and assignees when the workflow auto-rejects on SLA.',
     'workflow.sla_auto_reject', NULL, 'wfl.sla_auto_reject',
     ARRAY['in_app','email'], 'high',
     '{"requester":true,"workflow_phase":"in_workflow"}'::jsonb,
     0, true, 80, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'workflow.sla_auto_cancel', 'Workflow SLA Auto-Cancel',
     'Notify operations when a time-bound workflow auto-cancels on SLA.',
     'workflow.sla_auto_cancel', NULL, 'wfl.sla_auto_cancel',
     ARRAY['in_app','email'], 'high',
     '{"requester":true,"roles":["operations_manager"]}'::jsonb,
     0, true, 90, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code)
DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
    event_type = EXCLUDED.event_type, entity_type = EXCLUDED.entity_type,
    template_key = EXCLUDED.template_key, channels = EXCLUDED.channels,
    priority = EXCLUDED.priority, recipient_rules = EXCLUDED.recipient_rules,
    dedup_window_ms = EXCLUDED.dedup_window_ms, is_enabled = EXCLUDED.is_enabled,
    sort_order = EXCLUDED.sort_order, updated_at = now(), updated_by = EXCLUDED.created_by
WHERE (control.notification_routing_rule.name,control.notification_routing_rule.description,control.notification_routing_rule.event_type,control.notification_routing_rule.entity_type,control.notification_routing_rule.template_key,control.notification_routing_rule.channels,control.notification_routing_rule.priority,control.notification_routing_rule.recipient_rules,control.notification_routing_rule.dedup_window_ms,control.notification_routing_rule.is_enabled,control.notification_routing_rule.sort_order)
  IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.event_type,EXCLUDED.entity_type,EXCLUDED.template_key,EXCLUDED.channels,EXCLUDED.priority,EXCLUDED.recipient_rules,EXCLUDED.dedup_window_ms,EXCLUDED.is_enabled,EXCLUDED.sort_order);

-- Keep catalog drafts inert until their owning modules publish the documented
-- canonical event and recipient payload. This prevents false production
-- confidence and accidental empty-recipient notification messages.
UPDATE control.notification_routing_rule
SET is_enabled = false,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL
  AND code = ANY (ARRAY[
    'document.purchase_invoice_lifecycle_changed',
    'document.purchase_requisition_lifecycle_changed',
    'document.purchase_order_confirmation_lifecycle_changed',
    'document.delivery_note_lifecycle_changed',
    'document.receipt_lifecycle_changed',
    'document.service_sheet_lifecycle_changed',
    'document.payment_entry_lifecycle_changed',
    'workflow.sla_reminder',
    'workflow.sla_breach',
    'workflow.sla_auto_reject',
    'workflow.sla_auto_cancel'
  ]);

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.notification_template WHERE tenant_id IS NULL AND template_key IN ('purchase_invoice.lifecycle.changed','purchase_requisition.lifecycle.changed','purchase_order_confirmation.lifecycle.changed','delivery_note.lifecycle.changed','receipt.lifecycle.changed','service_sheet.lifecycle.changed','payment_entry.lifecycle.changed','wfl.sla_reminder','wfl.sla_breach','wfl.sla_auto_reject','wfl.sla_auto_cancel')) <> 22
     OR (SELECT count(*) FROM control.notification_routing_rule WHERE tenant_id IS NULL AND code IN ('document.purchase_invoice_lifecycle_changed','document.purchase_requisition_lifecycle_changed','document.purchase_order_confirmation_lifecycle_changed','document.delivery_note_lifecycle_changed','document.receipt_lifecycle_changed','document.service_sheet_lifecycle_changed','document.payment_entry_lifecycle_changed','workflow.sla_reminder','workflow.sla_breach','workflow.sla_auto_reject','workflow.sla_auto_cancel')) <> 11 THEN
    RAISE EXCEPTION 'NEON notification expected-count mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM control.notification_routing_rule rule WHERE rule.tenant_id IS NULL AND rule.code IN ('document.purchase_invoice_lifecycle_changed','document.purchase_requisition_lifecycle_changed','document.purchase_order_confirmation_lifecycle_changed','document.delivery_note_lifecycle_changed','document.receipt_lifecycle_changed','document.service_sheet_lifecycle_changed','document.payment_entry_lifecycle_changed','workflow.sla_reminder','workflow.sla_breach','workflow.sla_auto_reject','workflow.sla_auto_cancel') AND NOT EXISTS (SELECT 1 FROM control.notification_template template WHERE template.tenant_id IS NULL AND template.template_key=rule.template_key AND template.status='active')) THEN
    RAISE EXCEPTION 'NEON notification orphan routing rule';
  END IF;
  IF EXISTS (SELECT template_key,channel,locale,version FROM control.notification_template WHERE tenant_id IS NULL AND template_key IN ('purchase_invoice.lifecycle.changed','purchase_requisition.lifecycle.changed','purchase_order_confirmation.lifecycle.changed','delivery_note.lifecycle.changed','receipt.lifecycle.changed','service_sheet.lifecycle.changed','payment_entry.lifecycle.changed','wfl.sla_reminder','wfl.sla_breach','wfl.sla_auto_reject','wfl.sla_auto_cancel') GROUP BY template_key,channel,locale,version HAVING count(*)<>1) THEN
    RAISE EXCEPTION 'NEON notification uniqueness mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM control.notification_template WHERE tenant_id IS NULL AND template_key IN ('purchase_invoice.lifecycle.changed','purchase_requisition.lifecycle.changed','purchase_order_confirmation.lifecycle.changed','delivery_note.lifecycle.changed','receipt.lifecycle.changed','service_sheet.lifecycle.changed','payment_entry.lifecycle.changed','wfl.sla_reminder','wfl.sla_breach','wfl.sla_auto_reject','wfl.sla_auto_cancel') AND (status<>'active' OR jsonb_typeof(variables_schema)<>'object')) THEN
    RAISE EXCEPTION 'NEON notification semantic mismatch';
  END IF;
END $assertions$;

DO $business_partner_assertions$ BEGIN
  IF (SELECT count(*) FROM control.notification_template WHERE tenant_id IS NULL AND template_key IN ('business_partner.case.submitted.v1','business_partner.case.returned.v1','business_partner.case.approved.v1','business_partner.case.rejected.v1','business_partner.case.materialized.v1','business_partner.workflow.stage.activated.v1')) <> 11
     OR (SELECT count(*) FROM control.notification_routing_rule WHERE tenant_id IS NULL AND code IN ('business_partner.case.submitted','business_partner.case.returned','business_partner.case.approved','business_partner.case.rejected','business_partner.case.materialized','business_partner.workflow.stage.activated')) <> 6 THEN
    RAISE EXCEPTION 'Business Partner notification expected-count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM control.notification_routing_rule rule
    WHERE rule.tenant_id IS NULL
      AND rule.code IN ('business_partner.case.submitted','business_partner.case.returned','business_partner.case.approved','business_partner.case.rejected','business_partner.case.materialized','business_partner.workflow.stage.activated')
      AND (NOT rule.is_enabled OR NOT EXISTS (
        SELECT 1 FROM control.notification_template template
        WHERE template.tenant_id IS NULL AND template.template_key=rule.template_key AND template.status='active'
      ))
  ) THEN
    RAISE EXCEPTION 'Business Partner notification route is disabled or orphaned';
  END IF;
  IF EXISTS (
    SELECT 1 FROM control.notification_template
    WHERE tenant_id IS NULL
      AND template_key IN ('business_partner.case.submitted.v1','business_partner.case.returned.v1','business_partner.case.approved.v1','business_partner.case.rejected.v1','business_partner.case.materialized.v1','business_partner.workflow.stage.activated.v1')
      AND variables_schema <> '{"required":["caseNo","status","rowVersion"]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'Business Partner notification template variable boundary mismatch';
  END IF;
END $business_partner_assertions$;

-- Customer lifecycle operator receipts use the existing durable in-app pipeline.
INSERT INTO control.notification_template(tenant_id,template_key,channel,locale,version,subject,body_text,variables_schema,status,created_by)
SELECT NULL,'business_partner.customer.'||action||'.v1','in_app','en',1,
       'Customer lifecycle completed','Customer {{customerId}} is now {{status}} (version {{resultingVersion}}).',
       '{"required":["customerId","status","resultingVersion"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000'::uuid
FROM pg_catalog.unnest(ARRAY['activated','suspended','reactivated','deactivated','archived']) action
ON CONFLICT(tenant_id,template_key,channel,locale,version) DO UPDATE SET
 subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,variables_schema=EXCLUDED.variables_schema,
 status=EXCLUDED.status,updated_at=now(),updated_by=EXCLUDED.created_by
WHERE (control.notification_template.subject,control.notification_template.body_text,control.notification_template.variables_schema,control.notification_template.status)
  IS DISTINCT FROM (EXCLUDED.subject,EXCLUDED.body_text,EXCLUDED.variables_schema,EXCLUDED.status);
INSERT INTO control.notification_routing_rule(tenant_id,code,name,description,event_type,entity_type,template_key,channels,priority,recipient_rules,dedup_window_ms,is_enabled,sort_order,created_by)
SELECT NULL,'business_partner.customer.'||action,'Customer '||action,
       'Durable lifecycle receipt for the authorized command operator.',
       'business_partner.customer.'||action,'customer','business_partner.customer.'||action||'.v1',
       ARRAY['in_app'],'normal','{"principal_paths":["recipient_principal_ids"]}'::jsonb,0,true,150,
       '00000000-0000-0000-0000-000000000000'::uuid
FROM pg_catalog.unnest(ARRAY['activated','suspended','reactivated','deactivated','archived']) action
ON CONFLICT(tenant_id,code) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,event_type=EXCLUDED.event_type,
 entity_type=EXCLUDED.entity_type,template_key=EXCLUDED.template_key,channels=EXCLUDED.channels,
 priority=EXCLUDED.priority,recipient_rules=EXCLUDED.recipient_rules,
 dedup_window_ms=EXCLUDED.dedup_window_ms,is_enabled=EXCLUDED.is_enabled,
 sort_order=EXCLUDED.sort_order,updated_at=now(),updated_by=EXCLUDED.created_by
WHERE (control.notification_routing_rule.name,control.notification_routing_rule.description,control.notification_routing_rule.event_type,control.notification_routing_rule.entity_type,control.notification_routing_rule.template_key,control.notification_routing_rule.channels,control.notification_routing_rule.priority,control.notification_routing_rule.recipient_rules,control.notification_routing_rule.dedup_window_ms,control.notification_routing_rule.is_enabled,control.notification_routing_rule.sort_order)
  IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.event_type,EXCLUDED.entity_type,EXCLUDED.template_key,EXCLUDED.channels,EXCLUDED.priority,EXCLUDED.recipient_rules,EXCLUDED.dedup_window_ms,EXCLUDED.is_enabled,EXCLUDED.sort_order);
