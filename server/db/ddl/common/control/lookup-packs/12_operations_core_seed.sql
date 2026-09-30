-- seed-contract-version: 1
-- seed-pack: common.control.lookup.operations_core
-- seed-pack-version: 1.0.0
-- seed-dataset: common.control.lookup.operations_core
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:57
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/log/actor_type.sql,server/db/seed/platform/000_lookups/LookupDomain/log/ai_feedback_type.sql,server/db/seed/platform/000_lookups/LookupDomain/log/password_change_reason.sql,server/db/seed/platform/000_lookups/LookupDomain/master/comment_intent.sql,server/db/seed/platform/000_lookups/LookupDomain/master/comment_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/contact_role.sql,server/db/seed/platform/000_lookups/LookupDomain/master/reaction_type.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) NOT IN ('studio', 'neon', 'mesh') THEN
    RAISE EXCEPTION 'common.control.lookup.operations_core: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('document.comment_intent', 'Comment Intent', 'Semantic role of a comment, such as an approval note or clarification.', 'document', true, '{"configurability":"tenant_extensible"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.comment_type', 'Comment Context Type', 'Surface to which a comment is attached.', 'document', false, '{"configurability":"platform_locked"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.reaction_type', 'Comment Reaction Type', 'Emoji reaction vocabulary for collaboration comments.', 'document', true, '{"configurability":"tenant_extensible"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.actor_type', 'Log Actor Type', 'Classification of the actor who triggered a log entry. Shared across audit_log, entity_lifecycle_log, workflow_event_log. is_extensible=false — actor types are a closed platform vocabulary.', 'log', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.ai_feedback_type', 'AI Feedback Type', 'Feedback type discriminator for ai_feedback_log.feedback_type. is_extensible=false — AI feedback types are platform-defined.', 'log', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.password_change_reason', 'Password Change Reason', 'Reason for a password change recorded in password_history.change_reason. is_extensible=false — reasons are platform-defined for compliance reporting.', 'log', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.contact_role', 'Contact Role', 'Platform and tenant-defined business roles held by named contacts.', 'master', true, '{"configurability":"tenant_extensible"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  ('general', 'General', 'document.comment_intent', 'Free-form discussion or note.', NULL, 10, true, '{"icon":"message_square","tone":"muted"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('submission_note', 'Submission Note', 'document.comment_intent', 'Note recorded when submitting for approval.', NULL, 20, true, '{"icon":"send","tone":"info"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('approval_note', 'Approval Note', 'document.comment_intent', 'Note recorded with an approval decision.', NULL, 30, true, '{"icon":"check_circle","tone":"success"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('rejection_reason', 'Rejection Reason', 'document.comment_intent', 'Reason recorded when rejecting or returning work.', NULL, 40, true, '{"icon":"x_circle","tone":"danger"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('query', 'Query', 'document.comment_intent', 'Question awaiting clarification.', NULL, 50, true, '{"icon":"help_circle","tone":"warning"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('clarification', 'Clarification', 'document.comment_intent', 'Response to a query.', NULL, 60, true, '{"icon":"message_circle","tone":"info"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('audit_note', 'Audit Note', 'document.comment_intent', 'Auditor or compliance-review annotation.', NULL, 70, true, '{"icon":"shield_check","tone":"muted"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('system_event', 'System Event', 'document.comment_intent', 'Machine-authored collaboration event.', NULL, 80, true, '{"icon":"cpu","tone":"muted"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity', 'Entity Comment', 'document.comment_type', 'Comment on a business entity.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('attachment', 'Attachment Comment', 'document.comment_type', 'Comment on a stored attachment.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('approval', 'Approval Comment', 'document.comment_type', 'Comment on an approval workflow instance.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('chat_message', 'Chat Message Comment', 'document.comment_type', 'Comment on a conversation message.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('thumbs_up', 'Thumbs Up', 'document.reaction_type', 'Approval or agreement.', NULL, 10, true, '{"emoji":"—?"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('thumbs_down', 'Thumbs Down', 'document.reaction_type', 'Disagreement or rejection.', NULL, 20, true, '{"emoji":"—?"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('heart', 'Heart', 'document.reaction_type', 'Strong appreciation.', NULL, 30, true, '{"emoji":"——"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('celebrate', 'Celebrate', 'document.reaction_type', 'Celebration or milestone.', NULL, 35, true, '{"emoji":"—?"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('laugh', 'Laugh', 'document.reaction_type', 'Funny or humorous.', NULL, 40, true, '{"emoji":"—?"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('eyes', 'Eyes', 'document.reaction_type', 'Watching or reviewing.', NULL, 50, true, '{"emoji":"—?"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('rocket', 'Rocket', 'document.reaction_type', 'Ship it or great work.', NULL, 60, true, '{"emoji":"—?"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('idea', 'Idea', 'document.reaction_type', 'Insight or useful idea.', NULL, 65, true, '{"emoji":"—?"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('check', 'Check', 'document.reaction_type', 'Done or confirmed.', NULL, 70, true, '{"emoji":"—"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('thinking', 'Thinking', 'document.reaction_type', 'Needs thought or is uncertain.', NULL, 75, true, '{"emoji":"—?"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('question', 'Question', 'document.reaction_type', 'Needs clarification.', NULL, 80, true, '{"emoji":"—"}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('principal', 'Principal', 'log.actor_type', 'Human user or service account authenticated via Keycloak session.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('service', 'Service', 'log.actor_type', 'Non-interactive service or integration calling the platform API.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('system', 'System', 'log.actor_type', 'Platform-internal automated actor (scheduler, migration, background worker).', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('migration', 'Migration', 'log.actor_type', 'Data migration script. Used to tag bulk-migrated rows in audit_log.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('atlas', 'Atlas Anomaly Feedback', 'log.ai_feedback_type', 'User feedback on an Atlas anomaly detection result. Migrated from log.atlas_feedback. detail: {anomaly_type, anomaly_severity, account_code, fiscal_year, period_number}.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('classification', 'Classification Feedback', 'log.ai_feedback_type', 'User correction of an AI classification result. Migrated from log.classification_feedback. detail: {class_label, confidence_before, confidence_after}.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('atlas_agent', 'Atlas Agent Response Feedback', 'log.ai_feedback_type', 'User feedback on an Atlas Agent response. target_id is log.ai_agent_run.id; detail: {agent_run_id, message_id}.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('voluntary', 'Voluntary Change', 'log.password_change_reason', 'Principal chose to change their password.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('admin_reset', 'Admin Reset', 'log.password_change_reason', 'Password reset initiated by a tenant admin or platform admin.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('policy_expiry', 'Policy Expiry', 'log.password_change_reason', 'Password expired per tenant password control.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('compromise_suspected', 'Compromise Suspected', 'log.password_change_reason', 'Forced reset triggered by suspected credential compromise or breach alert.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('initial_set', 'Initial Set', 'log.password_change_reason', 'First password set after account creation or invitation acceptance.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('mfa_upgrade', 'MFA Upgrade', 'log.password_change_reason', 'Password re-set as part of MFA enrollment or method upgrade.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('main_contact', 'Main Contact', 'master.contact_role', 'Primary general business contact.', 'general', 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('primary', 'Primary Contact', 'master.contact_role', 'Default contact for general communication with this party.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('billing', 'Billing', 'master.contact_role', 'Receives invoices, payment confirmations, and AP/AR correspondence.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('commercial', 'Commercial', 'master.contact_role', 'Commercial relationship contact.', 'commercial', 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('delivery', 'Delivery / Logistics', 'master.contact_role', 'Handles shipping notifications, delivery confirmations, and logistics coordination.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('procurement', 'Procurement', 'master.contact_role', 'Procurement and sourcing contact.', 'procurement', 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sales', 'Sales', 'master.contact_role', 'Sales contact.', 'sales', 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance', 'Finance', 'master.contact_role', 'General finance contact.', 'finance', 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('accounts_payable', 'Accounts Payable', 'master.contact_role', 'Payables and remittance contact.', 'finance', 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('accounts_receivable', 'Accounts Receivable', 'master.contact_role', 'Receivables and collection contact.', 'finance', 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('general', 'General', 'master.contact_role', 'General-purpose contact with no specific routing function.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('credit_control', 'Credit Control', 'master.contact_role', 'Credit-control contact.', 'finance', 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('collection', 'Collection', 'master.contact_role', 'Debt collection contact.', 'finance', 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('logistics', 'Logistics', 'master.contact_role', 'Shipping and logistics contact.', 'logistics', 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tax', 'Tax', 'master.contact_role', 'Tax and registration contact.', 'tax', 110, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('legal', 'Legal', 'master.contact_role', 'Legal contact.', 'legal', 120, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('compliance', 'Compliance', 'master.contact_role', 'Compliance and governance contact.', 'legal', 130, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('technical', 'Technical', 'master.contact_role', 'Technical integration contact.', 'technical', 140, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('support', 'Support', 'master.contact_role', 'Service and support contact.', 'support', 150, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('project_coordinator', 'Project Coordinator', 'master.contact_role', 'Project delivery contact.', 'operations', 160, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('escalation', 'Escalation', 'master.contact_role', 'Escalation contact.', 'general', 170, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['document.comment_intent', 'document.comment_type', 'document.reaction_type', 'log.actor_type', 'log.ai_feedback_type', 'log.password_change_reason', 'master.contact_role'])) <> 57 THEN
    RAISE EXCEPTION 'common.control.lookup.operations_core: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['document.comment_intent', 'document.comment_type', 'document.reaction_type', 'log.actor_type', 'log.ai_feedback_type', 'log.password_change_reason', 'master.contact_role']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'common.control.lookup.operations_core: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['document.comment_intent', 'document.comment_type', 'document.reaction_type', 'log.actor_type', 'log.ai_feedback_type', 'log.password_change_reason', 'master.contact_role']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'common.control.lookup.operations_core: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['document.comment_intent', 'document.comment_type', 'document.reaction_type', 'log.actor_type', 'log.ai_feedback_type', 'log.password_change_reason', 'master.contact_role']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'common.control.lookup.operations_core: semantic assertion failed';
  END IF;
END $assertions$;
