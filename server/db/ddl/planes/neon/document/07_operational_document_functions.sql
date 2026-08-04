CREATE OR REPLACE FUNCTION document.trg_validate_asset_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_asset_id uuid;
    v_company_id uuid;
    v_book_category text;
    v_line_run_id uuid;
    v_line_asset_id uuid;
    v_line_book_id uuid;
BEGIN
    IF NEW.asset_book_id IS NOT NULL THEN
        SELECT ab.asset_id, ab.company_code_id, lb.category::text
          INTO v_asset_id, v_company_id, v_book_category
          FROM master.asset_book ab
          JOIN master.ledger_book lb
            ON lb.tenant_id=ab.tenant_id AND lb.id=ab.ledger_book_id
         WHERE ab.tenant_id=NEW.tenant_id AND ab.id=NEW.asset_book_id;
        IF NOT FOUND OR v_asset_id<>NEW.asset_id OR v_company_id<>NEW.company_code_id THEN
            RAISE EXCEPTION 'Asset book does not belong to the transaction asset and company'
                USING ERRCODE='foreign_key_violation';
        END IF;
        IF NEW.book_type IS NULL THEN
            NEW.book_type := v_book_category;
        ELSIF NEW.book_type<>v_book_category THEN
            RAISE EXCEPTION 'asset_transaction.book_type must match ledger book category'
                USING ERRCODE='check_violation';
        END IF;
    END IF;

    IF NEW.depreciation_run_line_id IS NOT NULL THEN
        SELECT l.run_id,l.asset_id,l.asset_book_id
          INTO v_line_run_id,v_line_asset_id,v_line_book_id
          FROM document.depreciation_run_line l
         WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.depreciation_run_line_id;
        IF NOT FOUND OR v_line_asset_id<>NEW.asset_id
           OR (NEW.asset_book_id IS NOT NULL AND v_line_book_id<>NEW.asset_book_id)
           OR (NEW.depreciation_run_id IS NOT NULL AND v_line_run_id<>NEW.depreciation_run_id) THEN
            RAISE EXCEPTION 'Depreciation line does not belong to the transaction coordinates'
                USING ERRCODE='foreign_key_violation';
        END IF;
        NEW.depreciation_run_id := COALESCE(NEW.depreciation_run_id,v_line_run_id);
        NEW.asset_book_id := COALESCE(NEW.asset_book_id,v_line_book_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_rollup_match_exceptions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_tenant_id uuid := COALESCE(NEW.tenant_id,OLD.tenant_id);
    v_case_id uuid := COALESCE(NEW.invoice_match_case_id,OLD.invoice_match_case_id);
    v_actor uuid;
BEGIN
    v_actor := nullif(current_setting('app.current_principal_id',true),'')::uuid;
    IF v_actor IS NULL THEN
        IF TG_OP='DELETE' THEN v_actor := COALESCE(OLD.updated_by,OLD.created_by);
        ELSE v_actor := COALESCE(NEW.updated_by,NEW.created_by); END IF;
    END IF;
    UPDATE document.invoice_match_case c
       SET exception_count=(
               SELECT count(*)::smallint
                 FROM document.match_exception e
                WHERE e.tenant_id=v_tenant_id
                  AND e.invoice_match_case_id=v_case_id
                  AND e.status IN ('open','pending_approval')
           ),
           updated_at=now(),
           updated_by=v_actor
     WHERE c.tenant_id=v_tenant_id AND c.id=v_case_id;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_import_request_chunk()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF ROW(
        NEW.id,NEW.tenant_id,NEW.import_request_id,NEW.chunk_index,
        NEW.row_start,NEW.row_end,NEW.created_at,NEW.created_by
    ) IS DISTINCT FROM ROW(
        OLD.id,OLD.tenant_id,OLD.import_request_id,OLD.chunk_index,
        OLD.row_start,OLD.row_end,OLD.created_at,OLD.created_by
    ) THEN
        RAISE EXCEPTION 'import chunk identity, row range, and creation evidence are immutable'
            USING ERRCODE='integrity_constraint_violation';
    END IF;
    IF OLD.status IN ('completed','cancelled') AND NEW.status<>OLD.status THEN
        RAISE EXCEPTION 'completed or cancelled import chunk is immutable'
            USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF (OLD.status='pending' AND NEW.status NOT IN ('pending','queued','cancelled'))
       OR (OLD.status='queued' AND NEW.status NOT IN ('queued','processing','cancelled'))
       OR (OLD.status='processing' AND NEW.status NOT IN ('processing','completed','failed','cancelled'))
       OR (OLD.status='failed' AND NEW.status NOT IN ('failed','queued','cancelled')) THEN
        RAISE EXCEPTION 'invalid import chunk transition: % -> %',OLD.status,NEW.status
            USING ERRCODE='invalid_parameter_value';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_render_output_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF OLD.status IN ('ARCHIVED','REVOKED') AND NEW.status<>OLD.status THEN
        RAISE EXCEPTION 'archived or revoked render output is immutable'
            USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF (OLD.status='QUEUED' AND NEW.status NOT IN ('QUEUED','RENDERING','FAILED','REVOKED'))
       OR (OLD.status='RENDERING' AND NEW.status NOT IN ('RENDERING','RENDERED','FAILED','REVOKED'))
       OR (OLD.status='RENDERED' AND NEW.status NOT IN ('RENDERED','DELIVERED','ARCHIVED','REVOKED'))
       OR (OLD.status='DELIVERED' AND NEW.status NOT IN ('DELIVERED','ARCHIVED','REVOKED'))
       OR (OLD.status='FAILED' AND NEW.status NOT IN ('FAILED','QUEUED','REVOKED')) THEN
        RAISE EXCEPTION 'invalid render output transition: % -> %',OLD.status,NEW.status
            USING ERRCODE='invalid_parameter_value';
    END IF;
    RETURN NEW;
END;
$$;
