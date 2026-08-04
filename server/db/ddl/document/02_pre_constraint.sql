-- ============================================================================
-- document/02_pre_constraint.sql
-- Order-sensitive routines reconstructed from the live catalog.
-- Generated from the live Neon database document schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION document.trg_comment_parent_same_attachment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION "document".trg_comment_parent_same_attachment() IS 'Thread guard: ensures reply parent belongs to same attachment + tenant. Fires BEFORE INSERT OR UPDATE on master.attachment_comment.';

CREATE OR REPLACE FUNCTION document.trg_doc_validate_mentions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION "document".trg_doc_validate_mentions() IS 'Validates mentions JSONB is an array of {user_id: ...} objects. Fires BEFORE INSERT OR UPDATE on master.attachment_comment.';

CREATE OR REPLACE FUNCTION document.trg_enforce_single_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION "document".trg_enforce_single_default() IS 'Generic single-default guard for master.brand_profile and master.letterhead. Clears prior is_default=true row within same tenant on INSERT/UPDATE. Uses TG_TABLE_NAME — works across both tables without modification.';

CREATE OR REPLACE FUNCTION document.trg_validate_manifest_json()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'document', 'shared', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION "document".trg_validate_manifest_json() IS 'Validates manifest_json JSONB has required entity_name key. Fires BEFORE INSERT OR UPDATE OF manifest_json on document.render_output.';

CREATE OR REPLACE FUNCTION document.trg_validate_page_margins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION "document".trg_validate_page_margins() IS 'Validates page_margins JSONB has top/right/bottom/left keys, all >= 0. Fires BEFORE INSERT OR UPDATE OF page_margins on master.letterhead.';

CREATE OR REPLACE FUNCTION document.trg_validate_variables_schema()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'snapshot', 'document', 'shared', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION "document".trg_validate_variables_schema() IS 'Validates variables_schema JSONB is an object when present. Fires BEFORE INSERT OR UPDATE OF variables_schema on snapshot.template_version.';
