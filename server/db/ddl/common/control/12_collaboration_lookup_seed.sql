-- Collaboration vocabulary: semantically document-owned, physically served by
-- the common plane-local lookup catalog.

INSERT INTO control.lookup_domain (
  code, name, description, source_schema, is_extensible, metadata, status, created_by
)
VALUES
  (
    'document.comment_type', 'Comment Context Type',
    'Surface to which a comment is attached.',
    'document', false, '{"configurability":"platform_locked"}', 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  (
    'document.comment_intent', 'Comment Intent',
    'Semantic role of a comment, such as an approval note or clarification.',
    'document', true, '{"configurability":"tenant_extensible"}', 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  (
    'document.reaction_type', 'Comment Reaction Type',
    'Emoji reaction vocabulary for collaboration comments.',
    'document', true, '{"configurability":"tenant_extensible"}', 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
  )
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_schema = EXCLUDED.source_schema,
    is_extensible = EXCLUDED.is_extensible,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
  tenant_id, code, name, domain_code, description, sort_order,
  is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, 'document.comment_type',
       value.description, value.sort_order, true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
  ('entity', 'Entity Comment', 'Comment on a business entity.', 10::smallint),
  ('attachment', 'Attachment Comment', 'Comment on a stored attachment.', 20::smallint),
  ('approval', 'Approval Comment', 'Comment on an approval workflow instance.', 30::smallint),
  ('chat_message', 'Chat Message Comment', 'Comment on a conversation message.', 40::smallint)
) value(code, name, description, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
  tenant_id, code, name, domain_code, description, sort_order,
  is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, 'document.comment_intent',
       value.description, value.sort_order, true, value.metadata::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
  ('general', 'General', 'Free-form discussion or note.', 10::smallint,
   '{"icon":"message_square","tone":"muted"}'),
  ('submission_note', 'Submission Note', 'Note recorded when submitting for approval.', 20::smallint,
   '{"icon":"send","tone":"info"}'),
  ('approval_note', 'Approval Note', 'Note recorded with an approval decision.', 30::smallint,
   '{"icon":"check_circle","tone":"success"}'),
  ('rejection_reason', 'Rejection Reason', 'Reason recorded when rejecting or returning work.', 40::smallint,
   '{"icon":"x_circle","tone":"danger"}'),
  ('query', 'Query', 'Question awaiting clarification.', 50::smallint,
   '{"icon":"help_circle","tone":"warning"}'),
  ('clarification', 'Clarification', 'Response to a query.', 60::smallint,
   '{"icon":"message_circle","tone":"info"}'),
  ('audit_note', 'Audit Note', 'Auditor or compliance-review annotation.', 70::smallint,
   '{"icon":"shield_check","tone":"muted"}'),
  ('system_event', 'System Event', 'Machine-authored collaboration event.', 80::smallint,
   '{"icon":"cpu","tone":"muted"}')
) value(code, name, description, sort_order, metadata)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
  tenant_id, code, name, domain_code, description, sort_order,
  is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, 'document.reaction_type',
       value.description, value.sort_order, true,
       jsonb_build_object('emoji', value.emoji), 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
  ('thumbs_up', 'Thumbs Up', 'Approval or agreement.', 10::smallint, U&'\+01F44D'),
  ('thumbs_down', 'Thumbs Down', 'Disagreement or rejection.', 20::smallint, U&'\+01F44E'),
  ('heart', 'Heart', 'Strong appreciation.', 30::smallint, U&'\2764\FE0F'),
  ('celebrate', 'Celebrate', 'Celebration or milestone.', 35::smallint, U&'\+01F389'),
  ('laugh', 'Laugh', 'Funny or humorous.', 40::smallint, U&'\+01F604'),
  ('eyes', 'Eyes', 'Watching or reviewing.', 50::smallint, U&'\+01F440'),
  ('rocket', 'Rocket', 'Ship it or great work.', 60::smallint, U&'\+01F680'),
  ('idea', 'Idea', 'Insight or useful idea.', 65::smallint, U&'\+01F4A1'),
  ('check', 'Check', 'Done or confirmed.', 70::smallint, U&'\2705'),
  ('thinking', 'Thinking', 'Needs thought or is uncertain.', 75::smallint, U&'\+01F914'),
  ('question', 'Question', 'Needs clarification.', 80::smallint, U&'\2753')
) value(code, name, description, sort_order, emoji)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    status = 'active';
