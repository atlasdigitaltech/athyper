-- 05_pre_constraint_functions/004_document.sql
-- Depends on: 01_schemas (document schema)
-- Validation and trigger-helper functions for the Document · Print · Branding module.
-- Must be created BEFORE tables and triggers reference them.

-- =============================================================================
-- §1  document.trg_enforce_single_default
-- =============================================================================
-- Generic: auto-clears previous is_default=true row within the same tenant
-- when a new default is set.  Works for both brand_profile and letterhead
-- via TG_TABLE_NAME (both live in master schema).

CREATE OR REPLACE FUNCTION document.trg_enforce_single_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, document, shared, pg_catalog
AS $$
BEGIN
    IF NEW.is_default = true AND NEW.is_active = true THEN
        EXECUTE format(
            'UPDATE master.%I
               SET is_default = false
             WHERE tenant_id  = $1
               AND id        != $2
               AND is_default = true
               AND is_active  = true',
            TG_TABLE_NAME
        ) USING NEW.tenant_id, NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_enforce_single_default() IS
    'Generic single-default guard for master.brand_profile and master.letterhead. '
    'Clears prior is_default=true row within same tenant on INSERT/UPDATE. '
    'Uses TG_TABLE_NAME — works across both tables without modification.';


-- =============================================================================
-- §2  document.trg_comment_parent_same_attachment
-- =============================================================================
-- Ensures a reply comment's parent_id belongs to the same
-- attachment_id + tenant_id as the child.

CREATE OR REPLACE FUNCTION document.trg_comment_parent_same_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, document, shared, pg_catalog
AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM master.attachment_comment
            WHERE id            = NEW.parent_id
              AND attachment_id = NEW.attachment_id
              AND tenant_id     = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION
                'parent_id % does not belong to attachment % in tenant %',
                NEW.parent_id, NEW.attachment_id, NEW.tenant_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_comment_parent_same_attachment() IS
    'Thread guard: ensures reply parent belongs to same attachment + tenant. '
    'Fires BEFORE INSERT OR UPDATE on master.attachment_comment.';


-- =============================================================================
-- §3  document.trg_doc_validate_mentions
-- =============================================================================
-- Validates that mentions is a JSON array when present.
-- Each element must be a JSON object containing a user_id key.

CREATE OR REPLACE FUNCTION document.trg_doc_validate_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, document, shared, pg_catalog
AS $$
BEGIN
    IF NEW.mentions IS NOT NULL THEN
        IF jsonb_typeof(NEW.mentions) <> 'array' THEN
            RAISE EXCEPTION 'mentions must be a JSON array, got %',
                jsonb_typeof(NEW.mentions)
                USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(NEW.mentions) elem
            WHERE jsonb_typeof(elem) <> 'object'
               OR NOT (elem ? 'user_id')
        ) THEN
            RAISE EXCEPTION
                'each mentions element must be a JSON object with a user_id key'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_doc_validate_mentions() IS
    'Validates mentions JSONB is an array of {user_id: ...} objects. '
    'Fires BEFORE INSERT OR UPDATE on master.attachment_comment.';


-- =============================================================================
-- §4  document.trg_validate_page_margins
-- =============================================================================
-- Validates that page_margins is a JSON object with required margin keys
-- all set to non-negative numeric values.

CREATE OR REPLACE FUNCTION document.trg_validate_page_margins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, document, shared, pg_catalog
AS $$
DECLARE
    v_key  text;
    v_val  numeric;
BEGIN
    IF NEW.page_margins IS NOT NULL THEN
        IF jsonb_typeof(NEW.page_margins) <> 'object' THEN
            RAISE EXCEPTION 'page_margins must be a JSON object, got %',
                jsonb_typeof(NEW.page_margins)
                USING ERRCODE = 'check_violation';
        END IF;
        FOREACH v_key IN ARRAY ARRAY['top','right','bottom','left'] LOOP
            IF NEW.page_margins -> v_key IS NULL THEN
                RAISE EXCEPTION 'page_margins missing required key: %', v_key
                    USING ERRCODE = 'check_violation';
            END IF;
            v_val := (NEW.page_margins ->> v_key)::numeric;
            IF v_val < 0 THEN
                RAISE EXCEPTION 'page_margins.% must be >= 0, got %', v_key, v_val
                    USING ERRCODE = 'check_violation';
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_validate_page_margins() IS
    'Validates page_margins JSONB has top/right/bottom/left keys, all >= 0. '
    'Fires BEFORE INSERT OR UPDATE OF page_margins on master.letterhead.';


-- =============================================================================
-- §5  document.trg_validate_manifest_json
-- =============================================================================
-- Validates manifest_json is a JSON object containing entity_name key.

CREATE OR REPLACE FUNCTION document.trg_validate_manifest_json()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = document, shared, pg_catalog
AS $$
BEGIN
    IF jsonb_typeof(NEW.manifest_json) <> 'object' THEN
        RAISE EXCEPTION 'manifest_json must be a JSON object, got %',
            jsonb_typeof(NEW.manifest_json)
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.manifest_json ->> 'entity_name' IS NULL THEN
        RAISE EXCEPTION 'manifest_json must contain entity_name key'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_validate_manifest_json() IS
    'Validates manifest_json JSONB has required entity_name key. '
    'Fires BEFORE INSERT OR UPDATE OF manifest_json on document.render_output.';


-- =============================================================================
-- §6  document.trg_validate_variables_schema
-- =============================================================================
-- Validates variables_schema is a JSON object when present.

CREATE OR REPLACE FUNCTION document.trg_validate_variables_schema()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = snapshot, document, shared, pg_catalog
AS $$
BEGIN
    IF NEW.variables_schema IS NOT NULL THEN
        IF jsonb_typeof(NEW.variables_schema) <> 'object' THEN
            RAISE EXCEPTION 'variables_schema must be a JSON object, got %',
                jsonb_typeof(NEW.variables_schema)
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_validate_variables_schema() IS
    'Validates variables_schema JSONB is an object when present. '
    'Fires BEFORE INSERT OR UPDATE OF variables_schema on snapshot.template_version.';
