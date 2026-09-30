-- seed-contract-version: 1
-- seed-pack: neon.control.supplier-communications
-- seed-pack-version: 1.0.0
-- seed-dataset: control.notification_template;control.notification_routing_rule
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Increment A supplier communications","publisher":"Athyper","source_version":"1","retrieved_at":"2026-09-14","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.notification_template(tenant_id,template_key,channel,locale,version);control.notification_routing_rule(tenant_id,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:41
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
DO $guard$ BEGIN
 IF current_setting('app.database_plane',true)<>'neon' THEN RAISE EXCEPTION 'Supplier communications require NEON'; END IF;
END $guard$;

INSERT INTO control.notification_template(tenant_id,template_key,channel,locale,version,subject,body_text,body_json,variables_schema,status,created_by)
SELECT NULL,'supplier.onboarding.'||milestone||'.v1',channel,'en',1,subject||' — {{caseNo}}',
 body||E'\n\nOpen the authenticated request: {{caseUrl}}',
 '{"entityUrl":"{{caseUrl}}","actionUrl":"{{caseUrl}}"}'::jsonb,
 '{"required":["caseNo","caseUrl","status","milestone","communication"]}'::jsonb,'active','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
 ('submitted','Supplier submission accepted','Your submission has been accepted. Review-pack preparation is tracked in the request.'),
 ('assignment','Supplier review ready','A supplier review or approval level is ready for your action.'),
 ('reminder','Supplier review reminder','Your assigned supplier review is still awaiting action.'),
 ('escalation','Supplier review escalation','A current supplier review requires attention.'),
 ('information_requested','Supplier clarification requested','A reviewer has requested clarification. Open the request to respond; changes to business data require return and resubmission.'),
 ('information_escalated','Supplier response requires supervisor attention','The requester has not answered a clarification. Review the escalation reason and follow up; this notice does not transfer approval authority.'),
 ('information_answered','Supplier clarification received','The requester has responded. Review the answer and explicitly resume the assigned review.'),
 ('supervisor','Supplier supervisor attention requested','A supplier task requires your attention. Open the request to see the assignment and escalation reason.'),
 ('returned','Supplier request returned','The request needs correction. Open the authorized request to review the reason and resubmit within the selected profile.'),
 ('decision','Supplier decision available','The final decision is {{status}}. Its pinned document is available in the request.'),
 ('activation','Supplier activation confirmed','Supplier activation is complete and its pinned confirmation is available.'),
 ('attention','Supplier processing needs attention','A document or communication could not be delivered. Review the operational evidence; the business decision is unchanged.')
) AS notices(milestone,subject,body) CROSS JOIN (VALUES('in_app'),('email')) channels(channel)
ON CONFLICT(tenant_id,template_key,channel,locale,version) DO UPDATE SET subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,body_json=EXCLUDED.body_json,variables_schema=EXCLUDED.variables_schema,status=EXCLUDED.status,updated_at=now(),updated_by=EXCLUDED.created_by;

INSERT INTO control.notification_routing_rule(tenant_id,code,name,event_type,entity_type,template_key,channels,priority,recipient_rules,condition_expr,is_enabled,metadata,created_by)
SELECT NULL,'supplier.onboarding.notice.'||milestone,'Supplier onboarding '||milestone,'supplier.onboarding.notice.'||milestone,'business_partner_case','supplier.onboarding.'||milestone||'.v1',ARRAY['in_app','email'],'normal','{"principal_paths":["recipient_principal_ids"]}'::jsonb,'{"path":"communication.schema","eq":"athyper.supplier-communication/1"}'::jsonb,true,
 '{"owner":"supplier-onboarding","preferencePolicy":"respect_channel_enablement","frequencyPolicy":"immediate_process_bound_milestones","consentPolicy":"required_for_external_channels","emailReplyActions":false,"documentDisposition":"authenticated_pinned_link"}'::jsonb,'00000000-0000-0000-0000-000000000000'::uuid
FROM unnest(ARRAY['submitted','assignment','reminder','escalation','returned','decision','activation','attention','information_requested','information_escalated','information_answered','supervisor']) milestone
ON CONFLICT(tenant_id,code) DO UPDATE SET event_type=EXCLUDED.event_type,entity_type=EXCLUDED.entity_type,template_key=EXCLUDED.template_key,channels=EXCLUDED.channels,recipient_rules=EXCLUDED.recipient_rules,condition_expr=EXCLUDED.condition_expr,is_enabled=EXCLUDED.is_enabled,metadata=EXCLUDED.metadata,updated_at=now(),updated_by=EXCLUDED.created_by;

-- These ingress rows make committed events discoverable. Only the scoped adapter
-- can turn them into a canonical notice; unmatched events cannot render a notice.
INSERT INTO control.notification_routing_rule(tenant_id,code,name,event_type,template_key,channels,priority,recipient_rules,condition_expr,is_enabled,created_by)
SELECT NULL,'supplier.onboarding.ingress.'||replace(event_type,'.','_'),'Supplier onboarding committed event',event_type,'supplier.onboarding.submitted.v1',ARRAY['in_app'],'normal','{}'::jsonb,'{"path":"communication.schema","eq":"athyper.supplier-communication/1"}'::jsonb,true,'00000000-0000-0000-0000-000000000000'::uuid
FROM unnest(ARRAY['entity.case.submitted','entity.case.return','process.document.ready','process.document.failed','process.document.gate_failed','workflow.task.information_request','workflow.task.information_respond','workflow.task.information_escalate','workflow.task.supervisor_escalated']) event_type
ON CONFLICT(tenant_id,code) DO UPDATE SET condition_expr=EXCLUDED.condition_expr,is_enabled=EXCLUDED.is_enabled,updated_at=now(),updated_by=EXCLUDED.created_by;
