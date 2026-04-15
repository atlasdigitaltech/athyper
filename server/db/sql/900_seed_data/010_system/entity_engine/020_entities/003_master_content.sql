-- 020_entities/003_master_content.sql
-- Entities 30–40: Attachments & Comments (Content/Activity)
-- Depends on: shared.module rows (CMS, ACT)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_cms text;
    v_act text;
BEGIN
    SELECT id::text INTO v_cms FROM shared.module WHERE code = 'CMS';
    SELECT id::text INTO v_act FROM shared.module WHERE code = 'ACT';

    -- ── 30. attachment ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'attachment', 'ATTACH', 'attachment', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'attachment',
        'Attachment', 'Attachments', 'paperclip', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 31. multipart_upload ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'multipart_upload', 'MPU', 'multipart_upload', 'CONTROL', 'system', 'ent', 'table',
        'standard', 'operational', 'locked', 'master', 'multipart_upload',
        'Multipart Upload', 'Multipart Uploads', 'upload-cloud', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 32. attachment_acl ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'attachment_acl', 'AACL', 'attachment_acl', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'attachment_acl',
        'Attachment Access', 'Attachment Access', 'shield', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 33. comment ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment', 'CMT', 'comment', 'DOCUMENT', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'comment',
        'Comment', 'Comments', 'message-square', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 34. comment_draft ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment_draft', 'CMTD', 'comment_draft', 'DOCUMENT', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'comment_draft',
        'Comment Draft', 'Comment Drafts', 'pencil', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 35. comment_mention ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment_mention', 'CMTM', 'comment_mention', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'locked', 'master', 'comment_mention',
        'Comment Mention', 'Comment Mentions', 'at-sign', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 36. comment_reaction ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment_reaction', 'CMTR', 'comment_reaction', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'locked', 'master', 'comment_reaction',
        'Comment Reaction', 'Comment Reactions', 'smile', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 37. conversation ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'conversation', 'CONV', 'conversation', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'conversation',
        'Conversation', 'Conversations', 'messages-square', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 38. conversation_participant ─────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'conversation_participant', 'CONVP', 'conversation_participant', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'conversation_participant',
        'Conversation Participant', 'Conversation Participants', 'user-round', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 39. attachment_comment ───────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'attachment_comment', 'ACMT', 'attachment_comment', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'locked', 'master', 'attachment_comment',
        'Attachment Comment', 'Attachment Comments', 'file-text', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 40. comment_feed_cursor ──────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_act, 'comment_feed_cursor', 'CFCRS', 'comment_feed_cursor', 'CONTROL', 'system', 'ent', 'table',
        'lite', 'config', 'locked', 'master', 'comment_feed_cursor',
        'Feed Cursor', 'Feed Cursors', 'mouse-pointer', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
