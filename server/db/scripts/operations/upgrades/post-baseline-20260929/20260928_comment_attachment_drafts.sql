BEGIN;
-- Empty drafts reserve an owner-scoped attachment target before the first upload.
-- Published comment constraints and rich-text validation remain unchanged.
ALTER TABLE document.comment_draft DROP CONSTRAINT IF EXISTS comment_draft_text_chk;
ALTER TABLE document.comment_draft ADD CONSTRAINT comment_draft_text_chk
    CHECK (length(draft_text) <= 50000);
-- Edit draft scopes retain their isolation but use the registered entity comment type.
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
        'document.comment_type',
        CASE WHEN NEW.context_type ~ '^entity_edit_[0-9a-f]{32}$' THEN 'entity' ELSE NEW.context_type END,
        NEW.tenant_id
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

COMMIT;
