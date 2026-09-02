-- S0/S1: converge upgraded typed-request functions and audit triggers with clean DDL.
BEGIN;

DO $$
BEGIN
    IF current_database() <> 'athyper_neon'
       OR current_setting('app.database_plane', true) <> 'neon' THEN
        RAISE EXCEPTION 'Business Partner typed request catalog parity requires the NEON plane';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION document.fn_business_partner_payload_has_restricted_key(
    p_value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
    v_key text;
    v_child jsonb;
    v_normalized text;
BEGIN
    IF jsonb_typeof(p_value) = 'object' THEN
        FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
        LOOP
            v_normalized := regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g');
            IF v_normalized IN (
                'address', 'addresses', 'contact', 'contacts',
                'contactperson', 'contactpersons', 'contactchannel', 'contactchannels',
                'identifier', 'identifiers', 'taxregistration', 'taxregistrations',
                'classification', 'classifications', 'certification', 'certifications',
                'taxidentifier', 'taxid', 'nationalidentifier', 'nationalid'
            ) THEN
                RETURN true;
            END IF;

            IF document.fn_business_partner_payload_has_restricted_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_value) = 'array' THEN
        FOR v_child IN SELECT value FROM jsonb_array_elements(p_value)
        LOOP
            IF document.fn_business_partner_payload_has_restricted_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    END IF;

    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_payload_boundary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.extension_mode IS DISTINCT FROM OLD.extension_mode THEN
        RAISE EXCEPTION 'Business Partner request extension mode is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status NOT IN ('draft', 'returned', 'validation_failed')
       AND (
           NEW.extension_fingerprint IS DISTINCT FROM OLD.extension_fingerprint
           OR NEW.extension_counts IS DISTINCT FROM OLD.extension_counts
       ) THEN
        RAISE EXCEPTION 'Reviewed Business Partner request extension summary is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF document.fn_business_partner_payload_has_restricted_key(NEW.proposed_payload) THEN
        RAISE EXCEPTION 'Typed identity extensions are not permitted in proposed_payload'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_extension()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_tenant uuid;
    v_request uuid;
BEGIN
    IF TG_TABLE_NAME = 'business_partner_request_materialization_item' THEN
        IF TG_OP <> 'INSERT' THEN
            RAISE EXCEPTION 'Business Partner request materialization evidence is immutable'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;

    v_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    v_request := CASE WHEN TG_OP = 'DELETE' THEN OLD.request_id ELSE NEW.request_id END;

    IF NOT EXISTS (
        SELECT 1
        FROM document.business_partner_request request
        WHERE request.tenant_id = v_tenant
          AND request.id = v_request
          AND request.extension_mode = 'typed_v1'
          AND request.status IN ('draft', 'returned', 'validation_failed')
          AND (TG_OP = 'DELETE' OR request.source_kind = NEW.source_kind)
    ) THEN
        RAISE EXCEPTION 'Typed request extensions are editable only before submission'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'business_partner_request_address',
        'business_partner_request_contact_person',
        'business_partner_request_contact_channel',
        'business_partner_request_identifier',
        'business_partner_request_tax_registration',
        'business_partner_request_classification',
        'business_partner_request_certification',
        'business_partner_request_materialization_item'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_trigger trigger_row
            JOIN pg_catalog.pg_class relation ON relation.oid = trigger_row.tgrelid
            JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'document'
              AND relation.relname = v_table
              AND trigger_row.tgname = 'trg_zz_audit_row_change'
              AND NOT trigger_row.tgisinternal
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER trg_zz_audit_row_change '
                'AFTER INSERT OR UPDATE OR DELETE ON document.%I '
                'FOR EACH ROW EXECUTE FUNCTION audit.trg_capture_row_change()',
                v_table
            );
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION document.fn_business_partner_payload_has_restricted_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION document.trg_guard_business_partner_request_payload_boundary() FROM PUBLIC;
REVOKE ALL ON FUNCTION document.trg_guard_business_partner_request_extension() FROM PUBLIC;

COMMIT;
