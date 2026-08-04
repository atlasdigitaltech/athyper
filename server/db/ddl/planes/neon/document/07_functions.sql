CREATE OR REPLACE FUNCTION document.trg_stamp_status_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());
        NEW.status_changed_by := COALESCE(
            NEW.status_changed_by,
            nullif(current_setting('app.current_principal_id', true), '')::uuid,
            NEW.updated_by,
            '00000000-0000-0000-0000-000000000000'::uuid
        );
    ELSIF NEW.status_changed_at IS DISTINCT FROM OLD.status_changed_at
       OR NEW.status_changed_by IS DISTINCT FROM OLD.status_changed_by THEN
        RAISE EXCEPTION 'document.% status evidence cannot change without a status transition',
            TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_creation_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'document.% identity, tenant, and creation evidence are immutable',
            TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_reject_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    RAISE EXCEPTION 'document.% rows are append-only; delete and replace the relation',
        TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_attachment_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.attachment_id IS DISTINCT FROM OLD.attachment_id
       OR NEW.link_kind IS DISTINCT FROM OLD.link_kind
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Attachment link identity, target, kind, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_attachment_version_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_parent_version integer;
BEGIN
    IF NEW.parent_attachment_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT version_no
      INTO v_parent_version
      FROM document.attachment
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.parent_attachment_id;

    IF NOT FOUND OR NEW.version_no <> v_parent_version + 1 THEN
        RAISE EXCEPTION 'Attachment version must be exactly one greater than its parent'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_attachment_folder_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_parent document.attachment_folder%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
    ) THEN
        RAISE EXCEPTION 'Attachment folder entity coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.parent_id = NEW.id THEN
        RAISE EXCEPTION 'Attachment folder cannot be its own parent'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_parent
      FROM document.attachment_folder
     WHERE tenant_id = NEW.tenant_id AND id = NEW.parent_id;

    IF NOT FOUND
       OR v_parent.entity_type <> NEW.entity_type
       OR v_parent.entity_id <> NEW.entity_id THEN
        RAISE EXCEPTION 'Attachment folder parent must belong to the same entity'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT f.id, f.parent_id
              FROM document.attachment_folder f
             WHERE f.tenant_id = NEW.tenant_id AND f.id = NEW.parent_id
            UNION ALL
            SELECT f.id, f.parent_id
              FROM document.attachment_folder f
              JOIN ancestors a ON a.parent_id = f.id
             WHERE f.tenant_id = NEW.tenant_id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Attachment folder hierarchy cycle detected'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_attachment_link_folder_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_type text;
    v_id   text;
BEGIN
    IF NEW.folder_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT entity_type, entity_id
      INTO v_type, v_id
      FROM document.attachment_folder
     WHERE tenant_id = NEW.tenant_id AND id = NEW.folder_id;
    IF NOT FOUND OR v_type <> NEW.entity_type OR v_id <> NEW.entity_id THEN
        RAISE EXCEPTION 'Attachment link folder must belong to the same entity'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_comment_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_parent document.comment%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.context_type IS DISTINCT FROM OLD.context_type
        OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
        OR NEW.commenter_id IS DISTINCT FROM OLD.commenter_id
        OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
        OR NEW.thread_depth IS DISTINCT FROM OLD.thread_depth
    ) THEN
        RAISE EXCEPTION 'Comment context, author, parent, and thread depth are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT control.lookup_value_is_active(
        'document.comment_type', NEW.context_type, NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'Unknown or inactive comment context type %', NEW.context_type
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT control.lookup_value_is_active(
        'document.comment_intent', NEW.comment_intent, NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'Unknown or inactive comment intent %', NEW.comment_intent
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.parent_comment_id IS NULL THEN
        NEW.thread_depth := 0;
        RETURN NEW;
    END IF;

    SELECT * INTO v_parent
      FROM document.comment
     WHERE tenant_id = NEW.tenant_id AND id = NEW.parent_comment_id;
    IF NOT FOUND
       OR v_parent.context_type <> NEW.context_type
       OR v_parent.entity_type <> NEW.entity_type
       OR v_parent.entity_id <> NEW.entity_id THEN
        RAISE EXCEPTION 'Comment parent must belong to the same context and entity'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    NEW.thread_depth := v_parent.thread_depth + 1;
    IF NEW.thread_depth > 5 THEN
        RAISE EXCEPTION 'Comment nesting depth cannot exceed five'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_comment_draft_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_parent document.comment%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.principal_id IS DISTINCT FROM OLD.principal_id
        OR NEW.context_type IS DISTINCT FROM OLD.context_type
        OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
        OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
    ) THEN
        RAISE EXCEPTION 'Comment draft principal and target coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT control.lookup_value_is_active(
        'document.comment_type', NEW.context_type, NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'Unknown or inactive comment context type %', NEW.context_type
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.parent_comment_id IS NOT NULL THEN
        SELECT * INTO v_parent
          FROM document.comment
         WHERE tenant_id = NEW.tenant_id AND id = NEW.parent_comment_id;
        IF NOT FOUND
           OR v_parent.context_type <> NEW.context_type
           OR v_parent.entity_type <> NEW.entity_type
           OR v_parent.entity_id <> NEW.entity_id THEN
            RAISE EXCEPTION 'Draft parent must belong to the same context and entity'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_comment_reaction_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NOT control.lookup_value_is_active(
        'document.reaction_type', NEW.reaction_type, NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'Unknown or inactive reaction type %', NEW.reaction_type
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_content_parent_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.parent_id = NEW.id THEN
        RAISE EXCEPTION 'Content item cannot be its own parent'
            USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT c.id, c.parent_id
              FROM document.content_item c
             WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.parent_id
            UNION ALL
            SELECT c.id, c.parent_id
              FROM document.content_item c
              JOIN ancestors a ON a.parent_id = c.id
             WHERE c.tenant_id = NEW.tenant_id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Content hierarchy cycle detected'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_conversation_participant_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
       OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
        RAISE EXCEPTION 'Conversation participant identity and join evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.left_at IS NOT NULL AND (
        NEW.left_at IS DISTINCT FROM OLD.left_at
        OR NEW.left_by IS DISTINCT FROM OLD.left_by
        OR NEW.leave_reason IS DISTINCT FROM OLD.leave_reason
    ) THEN
        RAISE EXCEPTION 'Conversation participant leave evidence is immutable once recorded'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_content_current_version_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, snapshot
AS $$
BEGIN
    IF NEW.current_version_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM snapshot.content_item_version
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.current_version_id
           AND content_item_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Current content version must belong to the same content item'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_multipart_parts_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(NEW.part_etags) item
         WHERE jsonb_typeof(item) <> 'object'
            OR NOT (item ? 'part_number' AND item ? 'etag')
            OR (item->>'part_number') !~ '^[1-9][0-9]*$'
            OR btrim(item->>'etag') = ''
    ) THEN
        RAISE EXCEPTION 'part_etags must contain {part_number, etag} objects'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_content_item_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
BEGIN
    RAISE EXCEPTION 'snapshot.content_item_version rows are immutable'
        USING ERRCODE = 'check_violation';
END;
$$;
