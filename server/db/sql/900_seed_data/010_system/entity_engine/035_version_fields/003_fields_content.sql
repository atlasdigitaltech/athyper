-- 035_version_fields/003_fields_content.sql
-- Version-bound entity_field rows for Content/Activity entities (30–40)
-- Entities: attachment, multipart_upload, attachment_acl,
--           comment, comment_draft, comment_mention, comment_reaction,
--           conversation, conversation_participant, attachment_comment,
--           comment_feed_cursor
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── attachment ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'attachment' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',      'owner_type',      'Owner Type',   'string', 'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',        'owner_id',        'Owner',        'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'file_name',       'file_name',       'File Name',    'string', 'text',     'one','standard',true, false, true,  true, 130,v_su),
            (v_ev,'file_size',       'file_size',       'File Size',    'integer','number',   'one','system',  false,false, true,  false,140,v_su),
            (v_ev,'mime_type',       'mime_type',       'MIME Type',    'string', 'text',     'one','system',  false,true,  true,  false,150,v_su),
            (v_ev,'storage_key',     'storage_key',     'Storage Key',  'string', 'text',     'one','system',  false,false, false, false,160,v_su),
            (v_ev,'is_public',       'is_public',       'Public',       'boolean','hidden',   'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'checksum',        'checksum',        'Checksum',     'string', 'text',     'one','system',  false,false, false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── multipart_upload ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'multipart_upload' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'upload_ref',  'upload_id',   'Upload ID',   'string', 'text',  'one','system',  true, false, false, false,110,v_su),
            (v_ev,'file_name',   'file_name',   'File Name',   'string', 'text',  'one','standard',true, false, true,  true, 120,v_su),
            (v_ev,'mime_type',   'mime_type',   'MIME Type',   'string', 'text',  'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'total_parts', 'total_parts', 'Total Parts', 'integer','number','one','system',  false,false, false, false,140,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At',  'timestamp','datetime','one','system',false,true,true,false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── attachment_acl ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'attachment_acl' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'attachment_id','attachment_id','Attachment',  'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id', 'principal_id', 'User',        'uuid','reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'group_id',     'group_id',     'Group',       'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'access_level', 'access_level', 'Access Level','enum','select',   'one','standard',true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type',   'entity_type',   'Entity Type', 'string', 'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',     'entity_id',     'Entity',      'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'parent_id',     'parent_id',     'Parent',      'uuid',   'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'body',          'body',          'Body',        'text',   'textarea', 'one','standard',true, false, false, true, 140,v_su),
            (v_ev,'body_format',   'body_format',   'Format',      'enum',   'select',   'one','standard',true, true,  false, false,150,v_su),
            (v_ev,'is_flagged',    'is_flagged',    'Flagged',     'boolean','hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_pinned',     'is_pinned',     'Pinned',      'boolean','hidden',   'one','standard',false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment_draft ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment_draft' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type', 'entity_type', 'Entity Type', 'string','text',     'one','standard',true, true,  false, false,110,v_su),
            (v_ev,'entity_id',   'entity_id',   'Entity',      'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'body',        'body',        'Draft Body',  'text',  'textarea', 'one','standard',false,false, false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment_mention ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment_mention' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'comment_id',  'comment_id',  'Comment',     'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id','principal_id','Mentioned User','uuid','reference','one','standard',true,true, false, false,120,v_su),
            (v_ev,'is_notified', 'is_notified', 'Notified',    'boolean','hidden','one','system',  false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── comment_reaction ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'comment_reaction' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'comment_id',  'comment_id',  'Comment',    'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id','principal_id','User',       'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'emoji',       'emoji',       'Emoji',      'string','text',   'one','standard',true, true,  true,  false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── conversation ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'conversation' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'entity_type',  'entity_type',  'Entity Type', 'string', 'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',    'entity_id',    'Entity',      'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'subject',      'subject',      'Subject',     'string', 'text',     'one','standard',false,false, true,  true, 130,v_su),
            (v_ev,'is_resolved',  'is_resolved',  'Resolved',    'boolean','hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'resolved_at',  'resolved_at',  'Resolved At', 'timestamp','datetime','one','system', false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── conversation_participant ───────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'conversation_participant' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'conversation_id','conversation_id','Conversation','uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id',   'principal_id',   'User',        'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'joined_at',      'joined_at',      'Joined At',   'timestamp','datetime','one','system',false,true,true,false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/003_fields_content: done';
END $$;
