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
       OR NEW.attachment_series_id IS DISTINCT FROM OLD.attachment_series_id
       OR NEW.pinned_attachment_id IS DISTINCT FROM OLD.pinned_attachment_id
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

CREATE OR REPLACE FUNCTION document.trg_increment_row_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_company_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_company uuid := (to_jsonb(NEW)->>'company_code_id')::uuid;
    v_period  uuid := nullif(to_jsonb(NEW)->>'fiscal_period_id', '')::uuid;
BEGIN
    IF v_period IS NULL THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM master.fiscal_period p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.id = v_period
           AND p.company_code_id = v_company
    ) THEN
        RAISE EXCEPTION 'Fiscal period does not belong to the document company'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_commitment_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.status IN ('closed','cancelled','expired') THEN
        RAISE EXCEPTION 'Terminal commitment cannot be modified'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_invoice_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.status IN ('posted','cancelled','rejected') THEN
        RAISE EXCEPTION 'Posted or terminal purchase invoice cannot be modified'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_journal_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted journal entry is immutable; create a reversal journal'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_payment_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.status IN ('posted','transmitted','cleared') AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.representation_evidence_id IS DISTINCT FROM OLD.representation_evidence_id
        OR NEW.payment_number IS DISTINCT FROM OLD.payment_number
        OR NEW.payment_type IS DISTINCT FROM OLD.payment_type
        OR NEW.payment_direction IS DISTINCT FROM OLD.payment_direction
        OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
        OR NEW.payment_method_code IS DISTINCT FROM OLD.payment_method_code
        OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
        OR NEW.document_date IS DISTINCT FROM OLD.document_date
        OR NEW.posting_date IS DISTINCT FROM OLD.posting_date
        OR NEW.value_date IS DISTINCT FROM OLD.value_date
        OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
        OR NEW.base_currency_code IS DISTINCT FROM OLD.base_currency_code
        OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
        OR NEW.payment_amount IS DISTINCT FROM OLD.payment_amount
        OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
        OR NEW.bank_currency_code IS DISTINCT FROM OLD.bank_currency_code
        OR NEW.bank_exchange_rate IS DISTINCT FROM OLD.bank_exchange_rate
        OR NEW.bank_currency_amount IS DISTINCT FROM OLD.bank_currency_amount
        OR NEW.fiscal_period_id IS DISTINCT FROM OLD.fiscal_period_id
        OR NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id
        OR NEW.reversal_of_payment_id IS DISTINCT FROM OLD.reversal_of_payment_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Posted payment financial identity is immutable; create a reversal payment'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_commitment_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_parent document.commitment%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO v_parent
          FROM document.commitment
         WHERE tenant_id = OLD.tenant_id AND id = OLD.commitment_id;
        IF v_parent.status NOT IN ('draft','pending_approval','rejected') THEN
            RAISE EXCEPTION 'Commitment lines are editable only before approval'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO v_parent
      FROM document.commitment
     WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown commitment' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent.company_code_id <> NEW.company_code_id
       OR v_parent.currency_code <> NEW.currency_code THEN
        RAISE EXCEPTION 'Commitment line company and currency must match its header'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.site_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.site s
         WHERE s.tenant_id = NEW.tenant_id
           AND s.id = NEW.site_id
           AND s.company_code_id = NEW.company_code_id
    ) THEN
        RAISE EXCEPTION 'Commitment line site must belong to its company code'
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.status NOT IN ('draft','pending_approval','rejected') THEN
        RAISE EXCEPTION 'Commitment lines are editable only before approval'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_sync_commitment_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_parent uuid := COALESCE(NEW.commitment_id, OLD.commitment_id);
BEGIN
    UPDATE document.commitment c
       SET total_amount = COALESCE((
               SELECT sum(l.gross_amount)
                 FROM document.commitment_line l
                WHERE l.tenant_id = v_tenant AND l.commitment_id = v_parent
           ), 0),
           updated_at = now(),
           updated_by = COALESCE(
               nullif(current_setting('app.current_principal_id', true), '')::uuid,
               c.updated_by,
               c.created_by
           )
     WHERE c.tenant_id = v_tenant AND c.id = v_parent;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_release_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM document.commitment_line parent_line
          JOIN document.commitment_line release_line
            ON release_line.tenant_id = parent_line.tenant_id
         WHERE parent_line.tenant_id = NEW.tenant_id
           AND parent_line.id = NEW.parent_line_id
           AND parent_line.commitment_id = NEW.parent_commitment_id
           AND release_line.id = NEW.release_line_id
           AND release_line.commitment_id = NEW.release_commitment_id
           AND parent_line.currency_code = NEW.currency_code
           AND release_line.currency_code = NEW.currency_code
    ) THEN
        RAISE EXCEPTION 'Release allocation lines must belong to their stated headers and currency'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.fn_address_snapshot(p_tenant_id uuid, p_address_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, document, master
AS $$
    SELECT CASE WHEN a.id IS NULL THEN NULL::jsonb ELSE jsonb_strip_nulls(jsonb_build_object(
        'address_id', a.id, 'address_kind', a.address_kind,
        'line1', a.line1, 'line2', a.line2, 'line3', a.line3,
        'dependent_locality', a.dependent_locality, 'city', a.city,
        'state_region_code', a.state_region_code, 'region', a.region,
        'postal_code', a.postal_code, 'country_code', a.country_code,
        'timezone_code', a.timezone_code, 'formatted_address', a.formatted_address,
        'normalized_hash', a.normalized_hash, 'normalization_version', a.normalization_version
    )) END
      FROM master.address a
     WHERE a.tenant_id = p_tenant_id AND a.id = p_address_id;
$$;

CREATE OR REPLACE FUNCTION document.fn_build_address_snapshot(
    p_tenant_id uuid, p_ship_to_address_id uuid, p_bill_to_address_id uuid,
    p_bill_from_address_id uuid, p_ship_from_address_id uuid, p_remit_to_address_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, document, master
AS $$
    SELECT jsonb_build_object(
        'ship_to', COALESCE(document.fn_address_snapshot(p_tenant_id, p_ship_to_address_id), '{}'::jsonb),
        'bill_to', COALESCE(document.fn_address_snapshot(p_tenant_id, p_bill_to_address_id), '{}'::jsonb),
        'bill_from', COALESCE(document.fn_address_snapshot(p_tenant_id, p_bill_from_address_id), '{}'::jsonb),
        'ship_from', COALESCE(document.fn_address_snapshot(p_tenant_id, p_ship_from_address_id), '{}'::jsonb),
        'remit_to', COALESCE(document.fn_address_snapshot(p_tenant_id, p_remit_to_address_id), '{}'::jsonb)
    );
$$;

CREATE OR REPLACE FUNCTION document.trg_capture_line_address_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE v_snapshot jsonb; v_actor uuid;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.ship_to_address_id IS NOT DISTINCT FROM OLD.ship_to_address_id
       AND NEW.bill_to_address_id IS NOT DISTINCT FROM OLD.bill_to_address_id
       AND NEW.bill_from_address_id IS NOT DISTINCT FROM OLD.bill_from_address_id
       AND NEW.ship_from_address_id IS NOT DISTINCT FROM OLD.ship_from_address_id
       AND NEW.remit_to_address_id IS NOT DISTINCT FROM OLD.remit_to_address_id
       AND (NEW.address_snapshot IS DISTINCT FROM OLD.address_snapshot OR NEW.address_snapshot_hash IS DISTINCT FROM OLD.address_snapshot_hash OR NEW.address_snapshot_captured_at IS DISTINCT FROM OLD.address_snapshot_captured_at OR NEW.address_snapshot_captured_by IS DISTINCT FROM OLD.address_snapshot_captured_by)
    THEN RAISE EXCEPTION 'Transaction address snapshot is immutable; change the source address reference in a draft document' USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'INSERT'
       OR NEW.ship_to_address_id IS DISTINCT FROM OLD.ship_to_address_id
       OR NEW.bill_to_address_id IS DISTINCT FROM OLD.bill_to_address_id
       OR NEW.bill_from_address_id IS DISTINCT FROM OLD.bill_from_address_id
       OR NEW.ship_from_address_id IS DISTINCT FROM OLD.ship_from_address_id
       OR NEW.remit_to_address_id IS DISTINCT FROM OLD.remit_to_address_id
    THEN
        v_snapshot := document.fn_build_address_snapshot(NEW.tenant_id, NEW.ship_to_address_id, NEW.bill_to_address_id, NEW.bill_from_address_id, NEW.ship_from_address_id, NEW.remit_to_address_id);
        v_actor := COALESCE(NULLIF(current_setting('app.current_principal_id', true), '')::uuid, NEW.created_by);
        NEW.address_snapshot := v_snapshot;
        NEW.address_snapshot_hash := encode(digest(v_snapshot::text, 'sha256'), 'hex')::char(64);
        NEW.address_snapshot_captured_at := clock_timestamp();
        NEW.address_snapshot_captured_by := v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_purchase_invoice_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_parent document.purchase_invoice%ROWTYPE;
    v_service_line document.service_sheet_line%ROWTYPE;
    v_service_sheet document.service_sheet%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO v_parent
          FROM document.purchase_invoice
         WHERE tenant_id = OLD.tenant_id AND id = OLD.purchase_invoice_id;
        IF v_parent.status NOT IN ('proforma','draft','pending_approval') THEN
            RAISE EXCEPTION 'Invoice lines are editable only before approval'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO v_parent
      FROM document.purchase_invoice
     WHERE tenant_id = NEW.tenant_id AND id = NEW.purchase_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown purchase invoice' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent.company_code_id <> NEW.company_code_id
       OR v_parent.currency_code <> NEW.currency_code THEN
        RAISE EXCEPTION 'Invoice line company and currency must match its header'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.site_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.site s
         WHERE s.tenant_id = NEW.tenant_id
           AND s.id = NEW.site_id
           AND s.company_code_id = NEW.company_code_id
    ) THEN
        RAISE EXCEPTION 'Invoice line site must belong to its company code'
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.status NOT IN ('proforma','draft','pending_approval') THEN
        RAISE EXCEPTION 'Invoice lines are editable only before approval'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW.commitment_line_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM document.commitment_line l
         WHERE l.tenant_id = NEW.tenant_id
           AND l.id = NEW.commitment_line_id
           AND l.commitment_id = v_parent.commitment_id
    ) THEN
        RAISE EXCEPTION 'Invoice commitment line must belong to the header commitment'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.source_entity_type IN ('service_sheet','external_service_entry','document.external_service_entry') THEN
        RAISE EXCEPTION 'Legacy external service-entry matching is disabled; bind the invoice to document.service_sheet and service_sheet_line'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW.source_entity_type = 'document.service_sheet' THEN
        IF NEW.source_line_id IS NULL THEN
            RAISE EXCEPTION 'A service-sheet invoice source requires source_line_id'
                USING ERRCODE = 'check_violation';
        END IF;
        SELECT * INTO v_service_line
          FROM document.service_sheet_line
         WHERE tenant_id = NEW.tenant_id AND id = NEW.source_line_id;
        SELECT * INTO v_service_sheet
          FROM document.service_sheet
         WHERE tenant_id = NEW.tenant_id AND id = NEW.source_entity_id;
        IF v_service_line.id IS NULL OR v_service_sheet.id IS NULL
           OR v_service_line.service_sheet_id <> v_service_sheet.id
           OR v_service_sheet.status NOT IN ('accepted','pending_approval','approved','posted')
           OR v_service_sheet.company_code_id <> v_parent.company_code_id
           OR v_service_sheet.supplier_id <> v_parent.supplier_id
           OR v_service_sheet.commitment_id IS DISTINCT FROM v_parent.commitment_id
           OR v_service_line.currency_code <> NEW.currency_code
           OR (NEW.commitment_line_id IS NOT NULL AND v_service_line.commitment_line_id <> NEW.commitment_line_id) THEN
            RAISE EXCEPTION 'Invoice service-sheet source must identify an accepted canonical line for the same company, supplier, commitment and currency'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_sync_purchase_invoice_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_parent uuid := COALESCE(NEW.purchase_invoice_id, OLD.purchase_invoice_id);
BEGIN
    UPDATE document.purchase_invoice h
       SET net_amount = COALESCE((
               SELECT sum(l.net_amount)
                 FROM document.purchase_invoice_line l
                WHERE l.tenant_id = v_tenant AND l.purchase_invoice_id = v_parent
           ), 0),
           tax_amount = COALESCE((
               SELECT sum(l.tax_amount)
                 FROM document.purchase_invoice_line l
                WHERE l.tenant_id = v_tenant AND l.purchase_invoice_id = v_parent
           ), 0),
           withholding_tax_amount = COALESCE((
               SELECT sum(l.withholding_tax_amount)
                 FROM document.purchase_invoice_line l
                WHERE l.tenant_id = v_tenant AND l.purchase_invoice_id = v_parent
           ), 0),
           updated_at = now(),
           updated_by = COALESCE(
               nullif(current_setting('app.current_principal_id', true), '')::uuid,
               h.updated_by,
               h.created_by
           )
     WHERE h.tenant_id = v_tenant AND h.id = v_parent;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_invoice_match_case()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM document.purchase_invoice i
         WHERE i.tenant_id = NEW.tenant_id
           AND i.id = NEW.purchase_invoice_id
           AND i.company_code_id = NEW.company_code_id
           AND (NEW.commitment_id IS NULL OR i.commitment_id = NEW.commitment_id)
    ) THEN
        RAISE EXCEPTION 'Match case company/commitment must match its invoice'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_distribution_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.amount_status = 'posted' THEN
        RAISE EXCEPTION 'Posted accounting distribution is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_term_application()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
BEGIN
    IF NEW.purchase_invoice_line_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM document.purchase_invoice_line l
         WHERE l.tenant_id = NEW.tenant_id
           AND l.id = NEW.purchase_invoice_line_id
           AND l.purchase_invoice_id = NEW.purchase_invoice_id
    ) THEN
        RAISE EXCEPTION 'Payment-term application line must belong to its invoice'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.payment_term_clause_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.payment_term_clause c
         WHERE c.tenant_id = NEW.tenant_id
           AND c.id = NEW.payment_term_clause_id
           AND c.payment_term_id = NEW.payment_term_id
    ) THEN
        RAISE EXCEPTION 'Payment-term clause must belong to the selected payment term'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_payment document.payment_entry%ROWTYPE;
BEGIN
    SELECT * INTO v_payment
      FROM document.payment_entry
     WHERE tenant_id = NEW.tenant_id AND id = NEW.payment_entry_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown payment entry' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_payment.status NOT IN ('draft','pending_approval','approved') THEN
        RAISE EXCEPTION 'Payment allocations are immutable after posting'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW.purchase_invoice_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM document.purchase_invoice i
         WHERE i.tenant_id = NEW.tenant_id
           AND i.id = NEW.purchase_invoice_id
           AND i.company_code_id = v_payment.company_code_id
           AND i.supplier_id = v_payment.supplier_id
           AND i.currency_code = NEW.currency_code
    ) THEN
        RAISE EXCEPTION 'Payment allocation invoice must match payment company, supplier and currency'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_journal_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_header document.journal_entry%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO v_header
          FROM document.journal_entry
         WHERE tenant_id = OLD.tenant_id AND id = OLD.journal_entry_id;
        IF v_header.status NOT IN ('draft','pending_approval','approved') THEN
            RAISE EXCEPTION 'Journal lines are immutable after posting'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO v_header
      FROM document.journal_entry
     WHERE tenant_id = NEW.tenant_id AND id = NEW.journal_entry_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown journal entry' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_header.status NOT IN ('draft','pending_approval','approved') THEN
        RAISE EXCEPTION 'Journal lines are immutable after posting'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF v_header.transaction_currency_code <> NEW.transaction_currency_code
       OR v_header.base_currency_code <> NEW.base_currency_code THEN
        RAISE EXCEPTION 'Journal-line currencies must match the journal header'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_sync_journal_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_parent uuid := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
BEGIN
    UPDATE document.journal_entry h
       SET total_debit = COALESCE((
               SELECT sum(l.base_debit) FROM document.journal_line l
                WHERE l.tenant_id = v_tenant AND l.journal_entry_id = v_parent
           ), 0),
           total_credit = COALESCE((
               SELECT sum(l.base_credit) FROM document.journal_line l
                WHERE l.tenant_id = v_tenant AND l.journal_entry_id = v_parent
           ), 0),
           line_count = (
               SELECT count(*) FROM document.journal_line l
                WHERE l.tenant_id = v_tenant AND l.journal_entry_id = v_parent
           ),
           updated_at = now(),
           updated_by = COALESCE(
               nullif(current_setting('app.current_principal_id', true), '')::uuid,
               h.updated_by,
               h.created_by
           )
     WHERE h.tenant_id = v_tenant AND h.id = v_parent;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_journal_posting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master, ledger
AS $$
DECLARE
    v_period master.fiscal_period%ROWTYPE;
BEGIN
    IF NEW.status <> 'posted' OR OLD.status = 'posted' THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_period
      FROM master.fiscal_period p
     WHERE p.tenant_id = NEW.tenant_id
       AND p.id = NEW.fiscal_period_id
       AND p.company_code_id = NEW.company_code_id;
    IF NOT FOUND OR NEW.posting_date NOT BETWEEN v_period.start_date AND v_period.end_date THEN
        RAISE EXCEPTION 'Journal posting date is outside the selected company fiscal period'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.company_code_book_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.company_code_id = NEW.company_code_id
           AND a.book_id = NEW.ledger_book_id
           AND a.status = 'active'
           AND NEW.posting_date >= a.effective_from
           AND (a.effective_to IS NULL OR NEW.posting_date <= a.effective_to)
    ) THEN
        RAISE EXCEPTION 'Ledger book is not active for the journal company and posting date'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM ledger.book_period_status gate
         WHERE gate.tenant_id = NEW.tenant_id
           AND gate.ledger_book_id = NEW.ledger_book_id
           AND gate.fiscal_period_id = NEW.fiscal_period_id
           AND gate.status IN ('open','soft_close')
    ) THEN
        RAISE EXCEPTION 'Ledger book period is not open for posting'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW.line_count < 2 OR NEW.total_debit <= 0 OR NEW.total_debit <> NEW.total_credit THEN
        RAISE EXCEPTION 'Posted journal requires at least two balanced non-zero lines'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.posted_at IS NULL OR NEW.posted_by IS NULL THEN
        RAISE EXCEPTION 'Posted journal requires posting evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_p2p_header()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_commitment document.commitment%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.code IS DISTINCT FROM OLD.code
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'P2P_HEADER_IDENTITY_IMMUTABLE';
    END IF;

    IF TG_OP IN ('UPDATE','DELETE') THEN
        IF TG_TABLE_NAME = 'purchase_requisition' AND OLD.status IN ('fully_converted','closed','cancelled')
           OR TG_TABLE_NAME = 'purchase_order_confirmation' AND OLD.status IN ('confirmed','changes_accepted','changes_rejected','rejected','cancelled')
           OR TG_TABLE_NAME = 'delivery_note' AND OLD.status IN ('fully_receipted','returned','cancelled')
           OR TG_TABLE_NAME = 'receipt' AND OLD.status IN ('posted','reversed','cancelled')
           OR TG_TABLE_NAME = 'service_sheet' AND OLD.status IN ('posted','reversed','cancelled') THEN
            IF TG_OP = 'DELETE' OR (
                to_jsonb(NEW) - ARRAY['status','status_changed_at','status_changed_by','updated_at','updated_by','row_version']::text[]
                IS DISTINCT FROM
                to_jsonb(OLD) - ARRAY['status','status_changed_at','status_changed_by','updated_at','updated_by','row_version']::text[]
            ) THEN
                RAISE EXCEPTION 'P2P_DOCUMENT_TERMINAL: document.% is immutable in status %', TG_TABLE_NAME, OLD.status;
            END IF;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    END IF;

    IF TG_TABLE_NAME IN ('purchase_order_confirmation','delivery_note','receipt','service_sheet') THEN
        IF NEW.commitment_id IS NOT NULL THEN
            SELECT * INTO v_commitment
              FROM document.commitment
             WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'P2P_COMMITMENT_NOT_FOUND';
            END IF;
            IF v_commitment.company_code_id <> NEW.company_code_id
               OR v_commitment.supplier_id IS DISTINCT FROM NEW.supplier_id
               OR v_commitment.currency_code <> NEW.currency_code THEN
                RAISE EXCEPTION 'P2P_HEADER_SOURCE_MISMATCH: company, supplier, and currency must match commitment';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_p2p_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_company uuid;
    v_currency character(3);
    v_status text;
    v_commitment_id uuid;
    v_commitment_line document.commitment_line%ROWTYPE;
    v_line_currency character(3);
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'purchase_requisition_line' THEN
            SELECT company_code_id, currency_code, status::text INTO v_company, v_currency, v_status
              FROM document.purchase_requisition WHERE tenant_id = OLD.tenant_id AND id = OLD.purchase_requisition_id;
        ELSIF TG_TABLE_NAME = 'delivery_note_line' THEN
            SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
              FROM document.delivery_note WHERE tenant_id = OLD.tenant_id AND id = OLD.delivery_note_id;
        ELSIF TG_TABLE_NAME = 'receipt_line' THEN
            SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
              FROM document.receipt WHERE tenant_id = OLD.tenant_id AND id = OLD.receipt_id;
        ELSE
            SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
              FROM document.service_sheet WHERE tenant_id = OLD.tenant_id AND id = OLD.service_sheet_id;
        END IF;
        IF (TG_TABLE_NAME = 'purchase_requisition_line' AND v_status NOT IN ('draft','pending_approval','rejected'))
           OR (TG_TABLE_NAME = 'delivery_note_line' AND v_status NOT IN ('draft','in_transit','arrived'))
           OR (TG_TABLE_NAME = 'receipt_line' AND v_status NOT IN ('draft','pending_approval','rejected'))
           OR (TG_TABLE_NAME = 'service_sheet_line' AND v_status NOT IN ('draft','pending_acceptance','rejected')) THEN
            RAISE EXCEPTION 'P2P_LINE_PARENT_LOCKED: % status is %', TG_TABLE_NAME, v_status;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_TABLE_NAME = 'purchase_requisition_line' THEN
        SELECT company_code_id, currency_code, status::text INTO v_company, v_currency, v_status
          FROM document.purchase_requisition WHERE tenant_id = NEW.tenant_id AND id = NEW.purchase_requisition_id;
    ELSIF TG_TABLE_NAME = 'delivery_note_line' THEN
        SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
          FROM document.delivery_note WHERE tenant_id = NEW.tenant_id AND id = NEW.delivery_note_id;
    ELSIF TG_TABLE_NAME = 'receipt_line' THEN
        SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
          FROM document.receipt WHERE tenant_id = NEW.tenant_id AND id = NEW.receipt_id;
    ELSE
        SELECT company_code_id, currency_code, status::text, commitment_id INTO v_company, v_currency, v_status, v_commitment_id
          FROM document.service_sheet WHERE tenant_id = NEW.tenant_id AND id = NEW.service_sheet_id;
    END IF;
    v_line_currency := nullif(to_jsonb(NEW)->>'currency_code', '')::character(3);
    IF v_company IS NULL OR v_company <> NEW.company_code_id
       OR (v_line_currency IS NOT NULL AND v_currency <> v_line_currency) THEN
        RAISE EXCEPTION 'P2P_LINE_HEADER_MISMATCH: tenant, company, or currency differs from header';
    END IF;
    IF (TG_TABLE_NAME = 'purchase_requisition_line' AND v_status NOT IN ('draft','pending_approval','rejected'))
       OR (TG_TABLE_NAME = 'delivery_note_line' AND v_status NOT IN ('draft','in_transit','arrived'))
       OR (TG_TABLE_NAME = 'receipt_line' AND v_status NOT IN ('draft','pending_approval','rejected'))
       OR (TG_TABLE_NAME = 'service_sheet_line' AND v_status NOT IN ('draft','pending_acceptance','rejected')) THEN
        RAISE EXCEPTION 'P2P_LINE_PARENT_LOCKED: % status is %', TG_TABLE_NAME, v_status;
    END IF;

    IF TG_TABLE_NAME <> 'purchase_requisition_line' THEN
        SELECT * INTO v_commitment_line
          FROM document.commitment_line
         WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_line_id;
        IF NOT FOUND OR (v_commitment_id IS NOT NULL AND v_commitment_line.commitment_id <> v_commitment_id) THEN
            RAISE EXCEPTION 'P2P_LINE_COMMITMENT_MISMATCH';
        END IF;
        IF v_commitment_line.company_code_id <> NEW.company_code_id THEN
            RAISE EXCEPTION 'P2P_LINE_COMPANY_MISMATCH';
        END IF;
        IF TG_TABLE_NAME = 'receipt_line' AND v_commitment_line.procurement_type <> 'goods' THEN
            RAISE EXCEPTION 'RECEIPT_REQUIRES_GOODS_LINE';
        END IF;
        IF TG_TABLE_NAME = 'service_sheet_line' AND v_commitment_line.procurement_type <> 'services' THEN
            RAISE EXCEPTION 'SERVICE_SHEET_REQUIRES_SERVICE_LINE';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.line_no IS DISTINCT FROM OLD.line_no
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'P2P_LINE_IDENTITY_IMMUTABLE';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_sync_p2p_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_parent uuid;
    v_actor uuid := COALESCE(
        nullif(to_jsonb(NEW)->>'updated_by', '')::uuid,
        nullif(to_jsonb(NEW)->>'created_by', '')::uuid,
        nullif(to_jsonb(OLD)->>'updated_by', '')::uuid,
        nullif(to_jsonb(OLD)->>'created_by', '')::uuid
    );
BEGIN
    IF TG_TABLE_NAME = 'purchase_requisition_line' THEN
        v_parent := COALESCE(NEW.purchase_requisition_id, OLD.purchase_requisition_id);
        UPDATE document.purchase_requisition h SET total_amount = x.total, updated_at = now(), updated_by = v_actor
          FROM (SELECT COALESCE(sum(gross_amount),0) total FROM document.purchase_requisition_line WHERE tenant_id=v_tenant AND purchase_requisition_id=v_parent) x
         WHERE h.tenant_id=v_tenant AND h.id=v_parent;
    ELSIF TG_TABLE_NAME = 'receipt_line' THEN
        v_parent := COALESCE(NEW.receipt_id, OLD.receipt_id);
        UPDATE document.receipt h SET total_amount = x.total, updated_at = now(), updated_by = v_actor
          FROM (SELECT COALESCE(sum(gross_amount),0) total FROM document.receipt_line WHERE tenant_id=v_tenant AND receipt_id=v_parent) x
         WHERE h.tenant_id=v_tenant AND h.id=v_parent;
    ELSIF TG_TABLE_NAME = 'service_sheet_line' THEN
        v_parent := COALESCE(NEW.service_sheet_id, OLD.service_sheet_id);
        UPDATE document.service_sheet h SET total_amount = x.total, updated_at = now(), updated_by = v_actor
          FROM (SELECT COALESCE(sum(gross_amount),0) total FROM document.service_sheet_line WHERE tenant_id=v_tenant AND service_sheet_id=v_parent) x
         WHERE h.tenant_id=v_tenant AND h.id=v_parent;
    ELSIF TG_TABLE_NAME = 'purchase_order_confirmation_line' THEN
        v_parent := COALESCE(NEW.confirmation_id, OLD.confirmation_id);
        UPDATE document.purchase_order_confirmation h SET confirmed_total_amount = x.total, updated_at = now(), updated_by = v_actor
          FROM (SELECT COALESCE(sum(confirmed_quantity * confirmed_unit_price),0) total FROM document.purchase_order_confirmation_line WHERE tenant_id=v_tenant AND confirmation_id=v_parent) x
         WHERE h.tenant_id=v_tenant AND h.id=v_parent;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_fulfillment_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_line uuid := COALESCE(NEW.commitment_line_id, OLD.commitment_line_id);
    v_limit numeric(18,4);
    v_used numeric(18,4);
BEGIN
    SELECT quantity INTO v_limit FROM document.commitment_line WHERE tenant_id=v_tenant AND id=v_line;
    IF v_limit IS NULL THEN RETURN NULL; END IF;
    IF TG_TABLE_NAME = 'receipt_line' THEN
        SELECT COALESCE(sum(received_quantity),0) INTO v_used FROM document.receipt_line WHERE tenant_id=v_tenant AND commitment_line_id=v_line;
    ELSE
        SELECT COALESCE(sum(quantity),0) INTO v_used FROM document.service_sheet_line WHERE tenant_id=v_tenant AND commitment_line_id=v_line;
    END IF;
    IF v_used > v_limit THEN
        RAISE EXCEPTION 'P2P_FULFILLMENT_EXCEEDED: fulfilled % exceeds commitment quantity %', v_used, v_limit;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_confirmation_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_commitment_id uuid;
    v_status text;
    v_line_commitment_id uuid;
BEGIN
    SELECT commitment_id, status::text INTO v_commitment_id, v_status
      FROM document.purchase_order_confirmation
     WHERE tenant_id = NEW.tenant_id AND id = NEW.confirmation_id;
    SELECT commitment_id INTO v_line_commitment_id
      FROM document.commitment_line
     WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_line_id;
    IF v_commitment_id IS NULL OR v_line_commitment_id IS NULL OR v_commitment_id <> v_line_commitment_id THEN
        RAISE EXCEPTION 'CONFIRMATION_LINE_COMMITMENT_MISMATCH';
    END IF;
    IF v_status NOT IN ('received','changes_proposed') THEN
        RAISE EXCEPTION 'CONFIRMATION_PARENT_LOCKED: status is %', v_status;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.recompute_commitment_schedule(
    p_tenant_id uuid,
    p_commitment_line_id uuid,
    p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_consumed numeric(18,4);
    v_remaining numeric(18,4);
    v_row record;
    v_allocated numeric(18,4);
BEGIN
    SELECT COALESCE((SELECT sum(received_quantity) FROM document.receipt_line
                     WHERE tenant_id=p_tenant_id AND commitment_line_id=p_commitment_line_id),0)
         + COALESCE((SELECT sum(quantity) FROM document.service_sheet_line
                     WHERE tenant_id=p_tenant_id AND commitment_line_id=p_commitment_line_id),0)
      INTO v_consumed;
    v_remaining := v_consumed;
    FOR v_row IN
        SELECT id, scheduled_quantity
          FROM document.schedule_line
         WHERE tenant_id=p_tenant_id AND source_doc_type='commitment_line'
           AND source_line_id=p_commitment_line_id
           AND is_current_version AND terminal_status IS NULL
         ORDER BY scheduled_date, schedule_no, id
    LOOP
        v_allocated := LEAST(v_row.scheduled_quantity, GREATEST(v_remaining,0));
        UPDATE document.schedule_line
           SET fulfilled_quantity = v_allocated,
               fulfillment_status = CASE
                   WHEN v_allocated = 0 THEN 'open'::document.schedule_fulfillment_status_d
                   WHEN v_allocated = v_row.scheduled_quantity THEN 'fulfilled'::document.schedule_fulfillment_status_d
                   ELSE 'partial'::document.schedule_fulfillment_status_d
               END,
               row_version = row_version + 1,
               updated_by = p_actor_id
         WHERE id=v_row.id AND tenant_id=p_tenant_id;
        v_remaining := v_remaining - v_allocated;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_refresh_commitment_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_actor uuid := COALESCE(
        nullif(to_jsonb(NEW)->>'updated_by','')::uuid,
        nullif(to_jsonb(NEW)->>'created_by','')::uuid,
        nullif(to_jsonb(OLD)->>'updated_by','')::uuid,
        nullif(to_jsonb(OLD)->>'created_by','')::uuid
    );
BEGIN
    IF TG_OP <> 'INSERT' THEN
        PERFORM document.recompute_commitment_schedule(OLD.tenant_id, OLD.commitment_line_id, v_actor);
    END IF;
    IF TG_OP <> 'DELETE' AND (
        TG_OP = 'INSERT' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.commitment_line_id IS DISTINCT FROM OLD.commitment_line_id
        OR to_jsonb(NEW)->>'received_quantity' IS DISTINCT FROM to_jsonb(OLD)->>'received_quantity'
        OR to_jsonb(NEW)->>'quantity' IS DISTINCT FROM to_jsonb(OLD)->>'quantity'
    ) THEN
        PERFORM document.recompute_commitment_schedule(NEW.tenant_id, NEW.commitment_line_id, v_actor);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_pricing_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_company_id uuid;
    v_parent_status text;
    v_condition_term master.pricing_term_type_d;
    v_condition_status master.pricing_condition_status_d;
    v_condition_classes text[];
    v_required_class text;
    v_tax_kind control.tax_group_kind_d;
BEGIN
    IF NEW.source_doc_type = 'purchase_requisition_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text INTO v_company_id, v_parent_status
              FROM document.purchase_requisition
             WHERE tenant_id=NEW.tenant_id AND id=NEW.source_doc_id;
        ELSE
            SELECT h.company_code_id, h.status::text INTO v_company_id, v_parent_status
              FROM document.purchase_requisition_line l
              JOIN document.purchase_requisition h ON h.tenant_id=l.tenant_id AND h.id=l.purchase_requisition_id
             WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.source_line_id AND l.purchase_requisition_id=NEW.source_doc_id;
        END IF;
    ELSIF NEW.source_doc_type = 'commitment_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text
              INTO v_company_id, v_parent_status
              FROM document.commitment
             WHERE tenant_id = NEW.tenant_id AND id = NEW.source_doc_id;
        ELSE
            SELECT c.company_code_id, c.status::text
              INTO v_company_id, v_parent_status
              FROM document.commitment_line l
              JOIN document.commitment c
                ON c.tenant_id = l.tenant_id AND c.id = l.commitment_id
             WHERE l.tenant_id = NEW.tenant_id
               AND l.id = NEW.source_line_id
               AND l.commitment_id = NEW.source_doc_id;
        END IF;
    ELSIF NEW.source_doc_type = 'purchase_invoice_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text
              INTO v_company_id, v_parent_status
              FROM document.purchase_invoice
             WHERE tenant_id = NEW.tenant_id AND id = NEW.source_doc_id;
        ELSE
            SELECT i.company_code_id, i.status::text
              INTO v_company_id, v_parent_status
              FROM document.purchase_invoice_line l
              JOIN document.purchase_invoice i
                ON i.tenant_id = l.tenant_id AND i.id = l.purchase_invoice_id
             WHERE l.tenant_id = NEW.tenant_id
               AND l.id = NEW.source_line_id
               AND l.purchase_invoice_id = NEW.source_doc_id;
        END IF;
    ELSIF NEW.source_doc_type = 'receipt_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text INTO v_company_id, v_parent_status
              FROM document.receipt WHERE tenant_id=NEW.tenant_id AND id=NEW.source_doc_id;
        ELSE
            SELECT h.company_code_id, h.status::text INTO v_company_id, v_parent_status
              FROM document.receipt_line l JOIN document.receipt h ON h.tenant_id=l.tenant_id AND h.id=l.receipt_id
             WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.source_line_id AND l.receipt_id=NEW.source_doc_id;
        END IF;
    ELSIF NEW.source_doc_type = 'service_sheet_line' THEN
        IF NEW.source_line_id IS NULL THEN
            SELECT company_code_id, status::text INTO v_company_id, v_parent_status
              FROM document.service_sheet WHERE tenant_id=NEW.tenant_id AND id=NEW.source_doc_id;
        ELSE
            SELECT h.company_code_id, h.status::text INTO v_company_id, v_parent_status
              FROM document.service_sheet_line l JOIN document.service_sheet h ON h.tenant_id=l.tenant_id AND h.id=l.service_sheet_id
             WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.source_line_id AND l.service_sheet_id=NEW.source_doc_id;
        END IF;
    END IF;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'PRICING_SOURCE_NOT_FOUND: %.% in tenant %',
            NEW.source_doc_type, COALESCE(NEW.source_line_id, NEW.source_doc_id), NEW.tenant_id;
    END IF;
    IF v_company_id <> NEW.company_code_id THEN
        RAISE EXCEPTION 'PRICING_COMPANY_MISMATCH: source company % differs from component company %',
            v_company_id, NEW.company_code_id;
    END IF;

    SELECT term_type, status, applies_to_classes
      INTO v_condition_term, v_condition_status, v_condition_classes
      FROM master.condition_type
     WHERE tenant_id = NEW.tenant_id AND id = NEW.condition_type_id;
    IF v_condition_term IS NULL THEN
        RAISE EXCEPTION 'PRICING_CONDITION_NOT_FOUND: % in tenant %', NEW.condition_type_id, NEW.tenant_id;
    END IF;
    IF v_condition_status <> 'active' THEN
        RAISE EXCEPTION 'PRICING_CONDITION_NOT_ACTIVE: % has status %', NEW.condition_type_id, v_condition_status;
    END IF;
    IF v_condition_term <> NEW.term_type THEN
        RAISE EXCEPTION 'PRICING_CONDITION_TERM_MISMATCH: condition term % differs from row %',
            v_condition_term, NEW.term_type;
    END IF;
    v_required_class := CASE NEW.source_doc_type
        WHEN 'purchase_requisition_line' THEN 'purchase_requisition'
        WHEN 'commitment_line' THEN 'purchase_order'
        WHEN 'purchase_invoice_line' THEN 'purchase_invoice'
        WHEN 'receipt_line' THEN 'goods_receipt'
        WHEN 'service_sheet_line' THEN 'service_sheet'
    END;
    IF NEW.source_doc_type IN ('commitment_line','purchase_invoice_line')
       AND NOT (v_required_class = ANY(v_condition_classes)) THEN
        RAISE EXCEPTION 'PRICING_CONDITION_NOT_APPLICABLE: condition % does not apply to %',
            NEW.condition_type_id, v_required_class;
    END IF;

    IF NEW.tax_group_id IS NOT NULL THEN
        SELECT group_kind INTO v_tax_kind
          FROM control.tax_group
         WHERE tenant_id = NEW.tenant_id AND id = NEW.tax_group_id
           AND status = 'active'
           AND effective_from <= CURRENT_DATE
           AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);
        IF v_tax_kind IS NULL THEN
            RAISE EXCEPTION 'PRICING_TAX_GROUP_NOT_ACTIVE: %', NEW.tax_group_id;
        END IF;
        IF (NEW.term_type = 'withholding' AND v_tax_kind <> 'withholding')
           OR (NEW.term_type = 'tax' AND v_tax_kind = 'withholding') THEN
            RAISE EXCEPTION 'PRICING_TAX_GROUP_KIND_MISMATCH: term % cannot use group kind %',
                NEW.term_type, v_tax_kind;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.source_doc_type IS DISTINCT FROM OLD.source_doc_type
        OR NEW.source_doc_id IS DISTINCT FROM OLD.source_doc_id
        OR NEW.source_line_id IS DISTINCT FROM OLD.source_line_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'PRICING_IDENTITY_IMMUTABLE';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_pricing_component_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_row document.pricing_component%ROWTYPE;
    v_parent_status text;
BEGIN
    v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    IF v_row.source_doc_type = 'purchase_requisition_line' THEN
        SELECT status::text INTO v_parent_status FROM document.purchase_requisition
         WHERE tenant_id=v_row.tenant_id AND id=v_row.source_doc_id;
        IF v_parent_status NOT IN ('draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: requisition status is %', v_parent_status;
        END IF;
    ELSIF v_row.source_doc_type = 'commitment_line' THEN
        SELECT status::text INTO v_parent_status
          FROM document.commitment
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_doc_id;
        IF v_parent_status NOT IN ('draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: commitment status is %', v_parent_status;
        END IF;
    ELSIF v_row.source_doc_type = 'purchase_invoice_line' THEN
        SELECT status::text INTO v_parent_status
          FROM document.purchase_invoice
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_doc_id;
        IF v_parent_status NOT IN ('proforma','draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: invoice status is %', v_parent_status;
        END IF;
    ELSIF v_row.source_doc_type = 'receipt_line' THEN
        SELECT status::text INTO v_parent_status FROM document.receipt
         WHERE tenant_id=v_row.tenant_id AND id=v_row.source_doc_id;
        IF v_parent_status NOT IN ('draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: receipt status is %', v_parent_status;
        END IF;
    ELSE
        SELECT status::text INTO v_parent_status FROM document.service_sheet
         WHERE tenant_id=v_row.tenant_id AND id=v_row.source_doc_id;
        IF v_parent_status NOT IN ('draft','rejected') THEN
            RAISE EXCEPTION 'PRICING_PARENT_LOCKED: service sheet status is %', v_parent_status;
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_schedule_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_parent_id uuid;
    v_parent_qty numeric(18,4);
    v_parent_currency character(3);
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.is_current_version
       AND NOT NEW.is_current_version
       AND NEW.terminal_status IS NOT NULL THEN
        NEW.supersedes_at := COALESCE(NEW.supersedes_at, now());
        IF NEW.status = 'active' THEN
            NEW.status := CASE WHEN NEW.terminal_status = 'CLOSED' THEN 'retired' ELSE 'cancelled' END;
        END IF;
        NEW.status_source := 'terminal';
    END IF;

    IF NEW.source_doc_type = 'purchase_requisition_line' THEN
        SELECT purchase_requisition_id, quantity, currency_code
          INTO v_parent_id, v_parent_qty, v_parent_currency
          FROM document.purchase_requisition_line
         WHERE tenant_id = NEW.tenant_id AND id = NEW.source_line_id;
    ELSIF NEW.source_doc_type = 'commitment_line' THEN
        SELECT commitment_id, quantity, currency_code
          INTO v_parent_id, v_parent_qty, v_parent_currency
          FROM document.commitment_line
         WHERE tenant_id = NEW.tenant_id AND id = NEW.source_line_id;
    ELSE
        SELECT purchase_invoice_id, quantity, currency_code
          INTO v_parent_id, v_parent_qty, v_parent_currency
          FROM document.purchase_invoice_line
         WHERE tenant_id = NEW.tenant_id AND id = NEW.source_line_id;
    END IF;

    IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'SCHEDULE_SOURCE_NOT_FOUND: %.% in tenant %',
            NEW.source_doc_type, NEW.source_line_id, NEW.tenant_id;
    END IF;
    IF v_parent_id <> NEW.source_doc_id THEN
        RAISE EXCEPTION 'SCHEDULE_SOURCE_HEADER_MISMATCH: expected %, received %',
            v_parent_id, NEW.source_doc_id;
    END IF;
    IF NEW.currency_code IS NOT NULL AND NEW.currency_code <> v_parent_currency THEN
        RAISE EXCEPTION 'SCHEDULE_CURRENCY_MISMATCH: parent %, schedule %',
            v_parent_currency, NEW.currency_code;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.source_doc_type IS DISTINCT FROM OLD.source_doc_type
        OR NEW.source_doc_id IS DISTINCT FROM OLD.source_doc_id
        OR NEW.source_line_id IS DISTINCT FROM OLD.source_line_id
        OR NEW.schedule_no IS DISTINCT FROM OLD.schedule_no
        OR NEW.version_number IS DISTINCT FROM OLD.version_number
        OR NEW.previous_version_id IS DISTINCT FROM OLD.previous_version_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_IDENTITY_IMMUTABLE';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_schedule_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_row document.schedule_line%ROWTYPE;
    v_parent_quantity numeric(18,4);
    v_scheduled_quantity numeric(18,4);
BEGIN
    v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    IF v_row.source_doc_type = 'purchase_requisition_line' THEN
        SELECT quantity INTO v_parent_quantity
          FROM document.purchase_requisition_line
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_line_id;
    ELSIF v_row.source_doc_type = 'commitment_line' THEN
        SELECT quantity INTO v_parent_quantity
          FROM document.commitment_line
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_line_id;
    ELSE
        SELECT quantity INTO v_parent_quantity
          FROM document.purchase_invoice_line
         WHERE tenant_id = v_row.tenant_id AND id = v_row.source_line_id;
    END IF;

    IF v_parent_quantity IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT COALESCE(sum(scheduled_quantity), 0)
      INTO v_scheduled_quantity
      FROM document.schedule_line
     WHERE tenant_id = v_row.tenant_id
       AND source_doc_type = v_row.source_doc_type
       AND source_line_id = v_row.source_line_id
       AND is_current_version
       AND terminal_status IS NULL;
    IF v_scheduled_quantity > v_parent_quantity THEN
        RAISE EXCEPTION 'SCHEDULE_QUANTITY_EXCEEDED: scheduled % exceeds source-line quantity %',
            v_scheduled_quantity, v_parent_quantity;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_set_commerce_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_actor uuid := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
BEGIN
    IF current_user = 'athyperapp' AND v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_actor IS NOT NULL THEN
        NEW.created_by := v_actor;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_order_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_company  uuid;
    v_currency character(3);
    v_item_company uuid;
BEGIN
    SELECT company_code_id, currency_code
      INTO v_company, v_currency
      FROM document.sales_order
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.sales_order_id;

    SELECT company_code_id INTO v_item_company
      FROM master.item
     WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

    IF v_currency IS NOT NULL AND NEW.currency_code <> v_currency THEN
        RAISE EXCEPTION 'Sales-order line currency must match its header'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_company IS NOT NULL
       AND v_item_company IS NOT NULL
       AND v_company <> v_item_company THEN
        RAISE EXCEPTION 'Sales-order item must belong to the order company code'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_production_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, snapshot
AS $$
DECLARE
    v_company uuid;
    v_item    uuid;
    v_uom     text;
BEGIN
    SELECT company_code_id, output_item_id, uom_code
      INTO v_company, v_item, v_uom
      FROM snapshot.bom
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.bom_snapshot_id;

    IF FOUND AND (
        v_company <> NEW.company_code_id
        OR v_item <> NEW.output_item_id
        OR v_uom <> NEW.uom_code
    ) THEN
        RAISE EXCEPTION
            'Production order company, output item, and UOM must match its BOM snapshot'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_production_order_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, snapshot
AS $$
DECLARE
    v_order_snapshot uuid;
    v_component_snapshot snapshot.bom_component%ROWTYPE;
BEGIN
    IF NEW.bom_component_snapshot_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT bom_snapshot_id INTO v_order_snapshot
      FROM document.production_order
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.production_order_id;

    SELECT * INTO v_component_snapshot
      FROM snapshot.bom_component
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.bom_component_snapshot_id;

    IF FOUND AND (
        v_component_snapshot.bom_snapshot_id <> v_order_snapshot
        OR v_component_snapshot.component_item_id <> NEW.component_item_id
        OR v_component_snapshot.uom_code <> NEW.uom_code
    ) THEN
        RAISE EXCEPTION
            'Production component must match a component of the order BOM snapshot'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_stocktake_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_missing_count integer;
    v_missing_movement integer;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'cancelled') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Completed or cancelled stocktake is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required to complete a stocktake'
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        SELECT count(*) FILTER (WHERE counted_quantity IS NULL),
               count(*) FILTER (
                   WHERE counted_quantity IS NOT NULL
                     AND counted_quantity <> system_quantity
                     AND posted_inventory_movement_id IS NULL
               )
          INTO v_missing_count, v_missing_movement
          FROM document.stocktake_line
         WHERE tenant_id = NEW.tenant_id AND stocktake_id = NEW.id;

        IF NOT EXISTS (
            SELECT 1 FROM document.stocktake_line
             WHERE tenant_id = NEW.tenant_id AND stocktake_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'A stocktake cannot be completed without lines'
                USING ERRCODE = 'check_violation';
        END IF;
        IF v_missing_count > 0 THEN
            RAISE EXCEPTION 'Every stocktake line must be counted before completion'
                USING ERRCODE = 'check_violation';
        END IF;
        IF v_missing_movement > 0 THEN
            RAISE EXCEPTION 'Every non-zero stocktake variance must reference its inventory movement'
                USING ERRCODE = 'check_violation';
        END IF;

        NEW.completed_at := statement_timestamp();
        NEW.completed_by := v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_stocktake_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master, ledger
AS $$
DECLARE
    v_header document.stocktake%ROWTYPE;
    v_item_company uuid;
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_movement ledger.inventory_movement%ROWTYPE;
BEGIN
    SELECT * INTO v_header
      FROM document.stocktake
     WHERE tenant_id = NEW.tenant_id AND id = NEW.stocktake_id;

    IF FOUND AND v_header.status NOT IN ('planned', 'in_progress') THEN
        RAISE EXCEPTION 'Stocktake lines can only be changed while the stocktake is planned or in progress'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    SELECT company_code_id INTO v_item_company
      FROM master.item
     WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;
    IF FOUND AND v_item_company <> v_header.company_code_id THEN
        RAISE EXCEPTION 'Stocktake item and warehouse must belong to the same company code'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' OR NEW.counted_quantity IS DISTINCT FROM OLD.counted_quantity THEN
        IF NEW.counted_quantity IS NULL THEN
            NEW.counted_at := NULL;
            NEW.counted_by := NULL;
        ELSE
            IF v_actor IS NULL THEN
                RAISE EXCEPTION 'Current principal context is required to record a count'
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
            NEW.counted_at := statement_timestamp();
            NEW.counted_by := v_actor;
        END IF;
    END IF;

    IF NEW.posted_inventory_movement_id IS NOT NULL THEN
        SELECT * INTO v_movement
          FROM ledger.inventory_movement
         WHERE tenant_id = NEW.tenant_id AND id = NEW.posted_inventory_movement_id;
        IF FOUND AND (
            v_movement.company_code_id <> v_header.company_code_id
            OR v_movement.warehouse_id <> v_header.warehouse_id
            OR v_movement.item_id <> NEW.item_id
            OR v_movement.uom_code <> NEW.uom_code
            OR v_movement.currency_code <> NEW.currency_code
            OR v_movement.source_entity_type <> 'document.stocktake'
            OR v_movement.source_entity_id <> NEW.stocktake_id
            OR v_movement.source_line_id IS DISTINCT FROM NEW.id
            OR v_movement.quantity <> (NEW.counted_quantity - NEW.system_quantity)
        ) THEN
            RAISE EXCEPTION 'Posted inventory movement does not match the stocktake variance line'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_stocktake_line_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_status document.stocktake_status_d;
BEGIN
    SELECT status INTO v_status FROM document.stocktake
     WHERE tenant_id = OLD.tenant_id AND id = OLD.stocktake_id;
    IF v_status NOT IN ('planned', 'in_progress') THEN
        RAISE EXCEPTION 'Stocktake lines cannot be deleted after completion or cancellation'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_header()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM master.sales_organization_profile p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.operating_organization_id = NEW.operating_organization_id
    ) THEN
        RAISE EXCEPTION 'Operating organization does not have a sales profile'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.principal_seller_company_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM master.operating_organization_company_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.operating_organization_id = NEW.operating_organization_id
           AND a.company_code_id = NEW.principal_seller_company_id
           AND a.status = 'active'
           AND a.effective_from <= CURRENT_DATE
           AND (a.effective_until IS NULL OR a.effective_until > CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'Principal seller company is not active in the sales operating organization'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF TG_ARGV[0] = 'opportunity' THEN
        SELECT operating_organization_id INTO v_org
          FROM document.sales_opportunity
         WHERE tenant_id = NEW.tenant_id AND id = NEW.opportunity_id;
    ELSE
        SELECT operating_organization_id INTO v_org
          FROM document.sales_quotation
         WHERE tenant_id = NEW.tenant_id AND id = NEW.quotation_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.operating_organization_company_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.operating_organization_id = v_org
           AND a.company_code_id = NEW.company_code_id
           AND a.status = 'active'
           AND a.effective_from <= CURRENT_DATE
           AND (a.effective_until IS NULL OR a.effective_until > CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'Participating company is not active in the sales operating organization'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_quotation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_opp document.sales_opportunity%ROWTYPE;
BEGIN
    IF NEW.opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opp FROM document.sales_opportunity
         WHERE tenant_id = NEW.tenant_id AND id = NEW.opportunity_id;
        IF FOUND AND (
            v_opp.customer_id <> NEW.customer_id
            OR v_opp.operating_organization_id <> NEW.operating_organization_id
            OR v_opp.selling_model <> NEW.selling_model
            OR v_opp.principal_seller_company_id IS DISTINCT FROM NEW.principal_seller_company_id
        ) THEN
            RAISE EXCEPTION 'Quotation commercial context must match its opportunity'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_order document.sales_order%ROWTYPE;
    v_total numeric(18,6);
BEGIN
    SELECT total_amount INTO v_total FROM document.sales_quotation
     WHERE tenant_id = NEW.tenant_id AND id = NEW.quotation_id;
    IF NEW.allocation_amount IS NOT NULL AND NEW.allocation_amount > v_total THEN
        RAISE EXCEPTION 'Quotation allocation amount cannot exceed quotation total'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.output_sales_order_id IS NOT NULL THEN
        SELECT * INTO v_order FROM document.sales_order
         WHERE tenant_id = NEW.tenant_id AND id = NEW.output_sales_order_id;
        IF FOUND AND (
            v_order.quotation_id IS DISTINCT FROM NEW.quotation_id
            OR v_order.company_code_id <> NEW.company_code_id
        ) THEN
            RAISE EXCEPTION 'Converted sales order must belong to the allocation quotation and company'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_intercompany_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_order document.sales_order%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM document.sales_order
     WHERE tenant_id = NEW.tenant_id AND id = NEW.sales_order_id;
    IF FOUND AND (
        v_order.company_code_id <> NEW.selling_company_code_id
        OR v_order.currency_code <> NEW.currency_code
        OR NEW.allocation_amount > v_order.total_amount
        OR (NEW.status = 'posted' AND v_order.status NOT IN ('confirmed', 'partially_fulfilled', 'fulfilled'))
    ) THEN
        RAISE EXCEPTION 'Intercompany fulfilment must match the sales-order owner, currency, and value ceiling'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sales_order_quotation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_quote document.sales_quotation%ROWTYPE;
BEGIN
    IF NEW.quotation_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO v_quote FROM document.sales_quotation
     WHERE tenant_id = NEW.tenant_id AND id = NEW.quotation_id;
    IF FOUND AND (
        v_quote.customer_id <> NEW.customer_id
        OR v_quote.currency_code <> NEW.currency_code
        OR NOT EXISTS (
            SELECT 1 FROM document.sales_quotation_company c
             WHERE c.tenant_id = NEW.tenant_id
               AND c.quotation_id = NEW.quotation_id
               AND c.company_code_id = NEW.company_code_id
               AND c.status = 'active'
        )
    ) THEN
        RAISE EXCEPTION 'Sales order must match the originating quotation customer, currency, and active company'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.assert_intercompany_fulfillment_total(
    p_tenant_id uuid,
    p_sales_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_order_total numeric(18,6); v_allocated numeric(18,6);
BEGIN
    SELECT total_amount INTO v_order_total FROM document.sales_order
     WHERE tenant_id = p_tenant_id AND id = p_sales_order_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT coalesce(sum(allocation_amount), 0) INTO v_allocated
      FROM document.sales_order_intercompany_fulfillment
     WHERE tenant_id = p_tenant_id AND sales_order_id = p_sales_order_id
       AND status <> 'cancelled';
    IF v_allocated > v_order_total THEN
        RAISE EXCEPTION 'Active intercompany fulfilment allocations exceed sales-order total'
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_assert_intercompany_fulfillment_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    PERFORM document.assert_intercompany_fulfillment_total(
        coalesce(NEW.tenant_id, OLD.tenant_id),
        coalesce(
            (to_jsonb(NEW)->>'sales_order_id')::uuid,
            (to_jsonb(OLD)->>'sales_order_id')::uuid,
            (to_jsonb(NEW)->>'id')::uuid,
            (to_jsonb(OLD)->>'id')::uuid
        )
    );
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.assert_sales_opportunity_structure(
    p_tenant_id uuid,
    p_opportunity_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_header document.sales_opportunity%ROWTYPE;
BEGIN
    SELECT * INTO v_header FROM document.sales_opportunity
     WHERE tenant_id = p_tenant_id AND id = p_opportunity_id;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_header.status NOT IN ('draft', 'cancelled') AND NOT EXISTS (
        SELECT 1 FROM document.sales_opportunity_company c
         WHERE c.tenant_id = p_tenant_id AND c.opportunity_id = p_opportunity_id
           AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Active sales opportunity requires at least one participating company'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_header.principal_seller_company_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM document.sales_opportunity_company c
         WHERE c.tenant_id = p_tenant_id AND c.opportunity_id = p_opportunity_id
           AND c.company_code_id = v_header.principal_seller_company_id
           AND c.participation_role = 'lead_seller' AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Principal seller must be the active lead company on the opportunity'
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION document.assert_sales_quotation_structure(
    p_tenant_id uuid,
    p_quotation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_header document.sales_quotation%ROWTYPE;
    v_rows integer;
    v_percent_rows integer;
    v_amount_rows integer;
    v_percent numeric;
    v_amount numeric;
    v_unconverted integer;
BEGIN
    SELECT * INTO v_header FROM document.sales_quotation
     WHERE tenant_id = p_tenant_id AND id = p_quotation_id;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_header.status NOT IN ('draft', 'cancelled') AND NOT EXISTS (
        SELECT 1 FROM document.sales_quotation_company c
         WHERE c.tenant_id = p_tenant_id AND c.quotation_id = p_quotation_id
           AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Submitted sales quotation requires at least one participating company'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_header.principal_seller_company_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM document.sales_quotation_company c
         WHERE c.tenant_id = p_tenant_id AND c.quotation_id = p_quotation_id
           AND c.company_code_id = v_header.principal_seller_company_id
           AND c.participation_role = 'lead_seller' AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Principal seller must be the active lead company on the quotation'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), count(allocation_percent), count(allocation_amount),
           coalesce(sum(allocation_percent), 0), coalesce(sum(allocation_amount), 0),
           count(*) FILTER (WHERE status <> 'converted')
      INTO v_rows, v_percent_rows, v_amount_rows, v_percent, v_amount, v_unconverted
      FROM document.sales_quotation_allocation
     WHERE tenant_id = p_tenant_id AND quotation_id = p_quotation_id
       AND status <> 'cancelled';

    IF v_header.status IN ('submitted', 'approved', 'converted') AND v_rows > 0 THEN
        IF v_percent_rows > 0 AND (v_percent_rows <> v_rows OR v_percent <> 100) THEN
            RAISE EXCEPTION 'Active quotation percentage allocations must total exactly 100'
                USING ERRCODE = 'check_violation';
        END IF;
        IF v_amount_rows > 0 AND (v_amount_rows <> v_rows OR v_amount <> v_header.total_amount) THEN
            RAISE EXCEPTION 'Active quotation amount allocations must total the quotation amount'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF v_header.status = 'converted' AND (v_rows = 0 OR v_unconverted > 0) THEN
        RAISE EXCEPTION 'Converted quotation requires converted company allocations'
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_assert_sales_opportunity_structure()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    PERFORM document.assert_sales_opportunity_structure(
        coalesce(NEW.tenant_id, OLD.tenant_id),
        coalesce(
            (to_jsonb(NEW)->>'opportunity_id')::uuid,
            (to_jsonb(OLD)->>'opportunity_id')::uuid,
            (to_jsonb(NEW)->>'id')::uuid,
            (to_jsonb(OLD)->>'id')::uuid
        )
    );
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_assert_sales_quotation_structure()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    PERFORM document.assert_sales_quotation_structure(
        coalesce(NEW.tenant_id, OLD.tenant_id),
        coalesce(
            (to_jsonb(NEW)->>'quotation_id')::uuid,
            (to_jsonb(OLD)->>'quotation_id')::uuid,
            (to_jsonb(NEW)->>'id')::uuid,
            (to_jsonb(OLD)->>'id')::uuid
        )
    );
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_bank_statement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE v_account_currency character(3);
BEGIN
    SELECT currency_code INTO v_account_currency
      FROM master.bank_account
     WHERE tenant_id = NEW.tenant_id AND id = NEW.bank_account_id;
    IF FOUND AND v_account_currency <> NEW.currency_code THEN
        RAISE EXCEPTION 'Bank statement currency must match the bank account currency'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.bank_account_link l
         WHERE l.tenant_id = NEW.tenant_id
           AND l.bank_account_id = NEW.bank_account_id
           AND (l.company_code_id = NEW.company_code_id
                OR (l.owner_type = 'company_code' AND l.owner_id = NEW.company_code_id))
           AND l.effective_from <= NEW.period_end_date
           AND (l.effective_until IS NULL OR l.effective_until > NEW.period_start_date)
    ) THEN
        RAISE EXCEPTION 'Bank account is not linked to the statement company for this period'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_bank_statement_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_line_count integer;
    v_open_count integer;
    v_net numeric(20,4);
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'imported' THEN
        RAISE EXCEPTION 'Bank statement must be created as imported' USING ERRCODE='check_violation';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT (
        (OLD.status='imported' AND NEW.status IN ('matching','rejected')) OR
        (OLD.status='matching' AND NEW.status IN ('reconciled','rejected')) OR
        (OLD.status='reconciled' AND NEW.status IN ('matching','signed_off')) OR
        (OLD.status='signed_off' AND NEW.status='archived')
    ) THEN
        RAISE EXCEPTION 'Invalid bank statement status transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('archived', 'rejected') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Finalized bank statement is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status='signed_off' AND NEW.status='archived'
       AND (to_jsonb(NEW)-ARRAY['status','status_changed_at','status_changed_by','updated_at','updated_by'])
           IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','status_changed_at','status_changed_by','updated_at','updated_by']) THEN
        RAISE EXCEPTION 'Archiving cannot alter signed-off bank statement facts' USING ERRCODE='check_violation';
    END IF;
    IF NEW.status IN ('reconciled', 'signed_off')
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        SELECT count(*),
               count(*) FILTER (WHERE recon_status NOT IN ('matched', 'excluded')),
               coalesce(sum(amount), 0)
          INTO v_line_count, v_open_count, v_net
          FROM document.bank_statement_line
         WHERE tenant_id = NEW.tenant_id AND bank_statement_id = NEW.id;
        IF v_line_count = 0 OR v_open_count > 0 THEN
            RAISE EXCEPTION 'Reconciled bank statement requires lines and no unresolved reconciliation statuses'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.opening_balance + v_net <> NEW.closing_balance THEN
            RAISE EXCEPTION 'Bank statement opening balance plus signed line amounts must equal closing balance'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF NEW.status = 'signed_off' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required to sign off a bank statement'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.signed_off_at := statement_timestamp();
        NEW.signed_off_by := v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_bank_statement_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_header_status document.bank_statement_status_d;
BEGIN
    SELECT status INTO v_header_status FROM document.bank_statement
     WHERE tenant_id = NEW.tenant_id AND id = NEW.bank_statement_id;
    IF v_header_status IN ('signed_off', 'archived', 'rejected') THEN
        RAISE EXCEPTION 'Lines of a finalized bank statement are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id <> OLD.tenant_id OR NEW.bank_statement_id <> OLD.bank_statement_id
           OR NEW.line_no <> OLD.line_no OR NEW.transaction_date <> OLD.transaction_date
           OR NEW.value_date IS DISTINCT FROM OLD.value_date OR NEW.description <> OLD.description
           OR NEW.reference_number IS DISTINCT FROM OLD.reference_number
           OR NEW.counterparty_name IS DISTINCT FROM OLD.counterparty_name
           OR NEW.counterparty_account IS DISTINCT FROM OLD.counterparty_account
           OR NEW.amount <> OLD.amount OR NEW.running_balance IS DISTINCT FROM OLD.running_balance
           OR NEW.currency_code <> OLD.currency_code OR NEW.transaction_type <> OLD.transaction_type
           OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.raw_data <> OLD.raw_data
           OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
            RAISE EXCEPTION 'Imported bank-statement facts and creation evidence are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.recon_status IS DISTINCT FROM OLD.recon_status AND pg_trigger_depth() < 2 THEN
            IF NOT (
                NEW.recon_status IN ('excluded', 'unmatched')
                AND OLD.recon_status IN ('excluded', 'unmatched')
                AND NOT EXISTS (
                    SELECT 1 FROM document.bank_recon_case_line l
                    JOIN document.bank_recon_case c
                      ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
                   WHERE l.tenant_id=NEW.tenant_id AND l.bank_statement_line_id=NEW.id
                     AND c.status <> 'voided'
                )
            ) THEN
                RAISE EXCEPTION 'Reconciliation status is maintained from active reconciliation cases'
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    ELSE
        IF NEW.currency_code <> (
            SELECT currency_code FROM document.bank_statement
             WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_statement_id
        ) THEN
            RAISE EXCEPTION 'Bank-statement line currency must match its header'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.refresh_bank_reconciliation_projections(
    p_tenant_id uuid,
    p_case_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_book numeric(20,4); v_bank numeric(20,4); v_line record; v_alloc numeric(20,4); v_amount numeric(20,4);
BEGIN
    SELECT coalesce(sum(amount) FILTER (WHERE side='payment'),0),
           coalesce(sum(amount) FILTER (WHERE side='statement'),0)
      INTO v_book, v_bank
      FROM document.bank_recon_case_line
     WHERE tenant_id=p_tenant_id AND bank_recon_case_id=p_case_id;
    UPDATE document.bank_recon_case
       SET book_amount=v_book, bank_amount=v_bank
     WHERE tenant_id=p_tenant_id AND id=p_case_id
       AND (book_amount IS DISTINCT FROM v_book OR bank_amount IS DISTINCT FROM v_bank);

    FOR v_line IN
        SELECT DISTINCT bank_statement_line_id AS id
          FROM document.bank_recon_case_line
         WHERE tenant_id=p_tenant_id AND bank_recon_case_id=p_case_id
           AND bank_statement_line_id IS NOT NULL
    LOOP
        SELECT abs(amount) INTO v_amount FROM document.bank_statement_line
         WHERE tenant_id=p_tenant_id AND id=v_line.id;
        SELECT coalesce(sum(l.amount),0) INTO v_alloc
          FROM document.bank_recon_case_line l
          JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
         WHERE l.tenant_id=p_tenant_id AND l.bank_statement_line_id=v_line.id
           AND c.status <> 'voided';
        UPDATE document.bank_statement_line
           SET recon_status = CASE WHEN v_alloc=0 THEN 'unmatched'
                                   WHEN v_alloc<v_amount THEN 'partially_matched'
                                   ELSE 'matched' END
         WHERE tenant_id=p_tenant_id AND id=v_line.id
           AND recon_status IS DISTINCT FROM CASE WHEN v_alloc=0 THEN 'unmatched'
                                                  WHEN v_alloc<v_amount THEN 'partially_matched'
                                                  ELSE 'matched' END;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_bank_recon_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_case document.bank_recon_case%ROWTYPE;
    v_source_amount numeric(20,4);
    v_currency character(3);
    v_company uuid;
    v_existing numeric(20,4);
BEGIN
    SELECT * INTO v_case FROM document.bank_recon_case
     WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_recon_case_id;
    IF v_case.status <> 'open' THEN
        RAISE EXCEPTION 'Reconciliation lines can only be added to an open case'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.side='payment' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':payment:' || NEW.payment_entry_id::text,0));
        SELECT abs(coalesce(bank_currency_amount,payment_amount)),
               coalesce(bank_currency_code,currency_code), company_code_id
          INTO v_source_amount,v_currency,v_company
          FROM document.payment_entry
         WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_entry_id;
        SELECT coalesce(sum(l.amount),0) INTO v_existing
          FROM document.bank_recon_case_line l
          JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
         WHERE l.tenant_id=NEW.tenant_id AND l.payment_entry_id=NEW.payment_entry_id
           AND c.status <> 'voided';
        IF EXISTS (
            SELECT 1 FROM document.bank_recon_case_line l
            JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
             WHERE l.tenant_id=NEW.tenant_id AND l.payment_entry_id=NEW.payment_entry_id
               AND l.bank_recon_case_id<>NEW.bank_recon_case_id AND c.status<>'voided'
        ) THEN RAISE EXCEPTION 'Payment is already allocated to another active reconciliation case' USING ERRCODE='unique_violation'; END IF;
    ELSE
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':statement:' || NEW.bank_statement_line_id::text,0));
        SELECT abs(l.amount),l.currency_code,s.company_code_id
          INTO v_source_amount,v_currency,v_company
          FROM document.bank_statement_line l
          JOIN document.bank_statement s ON s.tenant_id=l.tenant_id AND s.id=l.bank_statement_id
         WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.bank_statement_line_id;
        SELECT coalesce(sum(l.amount),0) INTO v_existing
          FROM document.bank_recon_case_line l
          JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
         WHERE l.tenant_id=NEW.tenant_id AND l.bank_statement_line_id=NEW.bank_statement_line_id
           AND c.status <> 'voided';
        IF EXISTS (
            SELECT 1 FROM document.bank_recon_case_line l
            JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
             WHERE l.tenant_id=NEW.tenant_id AND l.bank_statement_line_id=NEW.bank_statement_line_id
               AND l.bank_recon_case_id<>NEW.bank_recon_case_id AND c.status<>'voided'
        ) THEN RAISE EXCEPTION 'Statement line is already allocated to another active reconciliation case' USING ERRCODE='unique_violation'; END IF;
    END IF;
    IF v_company <> v_case.company_code_id OR v_currency <> v_case.currency_code THEN
        RAISE EXCEPTION 'Reconciliation source company and currency must match its case'
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_existing + NEW.amount > v_source_amount THEN
        RAISE EXCEPTION 'Active reconciliation allocations exceed the source amount'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_after_bank_recon_line()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    PERFORM document.refresh_bank_reconciliation_projections(NEW.tenant_id,NEW.bank_recon_case_id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_bank_recon_case()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid; v_journal document.journal_entry%ROWTYPE;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'open' THEN RAISE EXCEPTION 'Reconciliation case must be created open' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT (
        (OLD.status='open' AND NEW.status IN ('matched','voided')) OR
        (OLD.status='matched' AND NEW.status IN ('open','signed_off','voided'))
    ) THEN RAISE EXCEPTION 'Invalid reconciliation case status transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND (NEW.book_amount IS DISTINCT FROM OLD.book_amount OR NEW.bank_amount IS DISTINCT FROM OLD.bank_amount)
       AND pg_trigger_depth()<2 THEN
        RAISE EXCEPTION 'Reconciliation totals are database-maintained from case lines'
            USING ERRCODE='check_violation';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('signed_off','voided') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Signed-off or voided reconciliation case is immutable'
            USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF NEW.status='matched' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.book_amount=0 OR NEW.bank_amount=0 THEN RAISE EXCEPTION 'Matched case requires both book and bank allocations' USING ERRCODE='check_violation'; END IF;
        IF NEW.case_type IN ('exact_match','amount_match') AND NEW.book_amount-NEW.bank_amount<>0 THEN RAISE EXCEPTION 'Exact and amount matches must balance' USING ERRCODE='check_violation'; END IF;
        NEW.matched_at:=statement_timestamp();
    END IF;
    IF NEW.status='signed_off' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'matched' OR v_actor IS NULL THEN RAISE EXCEPTION 'Only a matched case with actor context can be signed off' USING ERRCODE='check_violation'; END IF;
        IF NEW.book_amount-NEW.bank_amount<>0 AND NEW.sign_off_journal_entry_id IS NULL THEN RAISE EXCEPTION 'Non-zero reconciliation difference requires an adjustment journal' USING ERRCODE='check_violation'; END IF;
        IF NEW.sign_off_journal_entry_id IS NOT NULL THEN
            SELECT * INTO v_journal FROM document.journal_entry WHERE tenant_id=NEW.tenant_id AND id=NEW.sign_off_journal_entry_id;
            IF FOUND AND (v_journal.company_code_id<>NEW.company_code_id OR v_journal.transaction_currency_code<>NEW.currency_code OR v_journal.source_entity_type<>'document.bank_recon_case' OR v_journal.source_entity_id IS DISTINCT FROM NEW.id OR v_journal.status<>'posted') THEN
                RAISE EXCEPTION 'Adjustment journal must be posted for this reconciliation case, company, and currency' USING ERRCODE='check_violation';
            END IF;
        END IF;
        NEW.signed_off_at:=statement_timestamp(); NEW.signed_off_by:=v_actor;
    END IF;
    IF NEW.status='voided' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF OLD.status='signed_off' OR v_actor IS NULL OR NEW.void_reason IS NULL THEN RAISE EXCEPTION 'Unsigned case and actor/reason are required to void reconciliation' USING ERRCODE='check_violation'; END IF;
        NEW.voided_at:=statement_timestamp(); NEW.voided_by:=v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_depreciation_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document,master
AS $$
DECLARE v_period master.fiscal_period%ROWTYPE; v_book master.ledger_book%ROWTYPE; v_effective_currency character(3); v_original document.depreciation_run%ROWTYPE;
BEGIN
    SELECT * INTO v_period FROM master.fiscal_period WHERE tenant_id=NEW.tenant_id AND id=NEW.fiscal_period_id;
    SELECT * INTO v_book FROM master.ledger_book WHERE tenant_id=NEW.tenant_id AND id=NEW.ledger_book_id;
    IF FOUND AND v_period.company_code_id<>NEW.company_code_id THEN RAISE EXCEPTION 'Depreciation fiscal period must belong to the run company' USING ERRCODE='check_violation'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.company_code_book_assignment a
         WHERE a.tenant_id=NEW.tenant_id AND a.company_code_id=NEW.company_code_id AND a.book_id=NEW.ledger_book_id
           AND a.status='active' AND a.effective_from<=v_period.end_date
           AND (a.effective_to IS NULL OR a.effective_to>=v_period.start_date)
    ) THEN RAISE EXCEPTION 'Ledger book is not actively assigned to the run company and fiscal period' USING ERRCODE='foreign_key_violation'; END IF;
    SELECT coalesce(a.override_currency_code,v_book.base_currency_code) INTO v_effective_currency
      FROM master.company_code_book_assignment a
     WHERE a.tenant_id=NEW.tenant_id AND a.company_code_id=NEW.company_code_id AND a.book_id=NEW.ledger_book_id
       AND a.status='active' AND a.effective_from<=v_period.end_date AND (a.effective_to IS NULL OR a.effective_to>=v_period.start_date)
     ORDER BY a.priority DESC,a.effective_from DESC LIMIT 1;
    IF v_effective_currency<>NEW.currency_code THEN RAISE EXCEPTION 'Depreciation run currency must match the effective company book currency' USING ERRCODE='check_violation'; END IF;
    IF NEW.reversal_of_run_id IS NOT NULL THEN
        SELECT * INTO v_original FROM document.depreciation_run WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of_run_id;
        IF FOUND AND (v_original.status<>'posted' OR v_original.company_code_id<>NEW.company_code_id OR v_original.ledger_book_id<>NEW.ledger_book_id OR v_original.fiscal_period_id<>NEW.fiscal_period_id OR v_original.currency_code<>NEW.currency_code) THEN
            RAISE EXCEPTION 'Depreciation reversal must mirror a posted run in the same accounting coordinates' USING ERRCODE='check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_depreciation_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document,ledger
AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid; v_bad integer; v_journal document.journal_entry%ROWTYPE;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'planned' THEN RAISE EXCEPTION 'Depreciation run must be created planned' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','failed','cancelled') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Finalized depreciation run is immutable' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT (
        (OLD.status='planned' AND NEW.status IN ('running','cancelled')) OR
        (OLD.status='running' AND NEW.status IN ('calculated','failed','cancelled')) OR
        (OLD.status='calculated' AND NEW.status IN ('posted','failed','cancelled'))
    ) THEN RAISE EXCEPTION 'Invalid depreciation run status transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required for depreciation transitions' USING ERRCODE='insufficient_privilege';
    END IF;
    IF NEW.status='running' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN NEW.started_at:=statement_timestamp(); NEW.started_by:=v_actor; END IF;
    IF NEW.status IN ('calculated','failed') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.completed_at:=statement_timestamp(); NEW.completed_by:=v_actor;
    END IF;
    IF NEW.status='calculated' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        SELECT count(*) FILTER (WHERE status='error') INTO v_bad FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id;
        IF NOT EXISTS (SELECT 1 FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id) OR v_bad>0 THEN
            RAISE EXCEPTION 'Calculated depreciation run requires lines without errors' USING ERRCODE='check_violation';
        END IF;
    END IF;
    IF NEW.status='posted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.reference_journal_entry_id IS NULL THEN RAISE EXCEPTION 'Posted depreciation run requires its journal entry' USING ERRCODE='check_violation'; END IF;
        IF NOT EXISTS (SELECT 1 FROM ledger.book_period_status b WHERE b.tenant_id=NEW.tenant_id AND b.ledger_book_id=NEW.ledger_book_id AND b.fiscal_period_id=NEW.fiscal_period_id AND b.status='open') THEN
            RAISE EXCEPTION 'Depreciation can only post to an open ledger-book period' USING ERRCODE='object_not_in_prerequisite_state';
        END IF;
        SELECT * INTO v_journal FROM document.journal_entry WHERE tenant_id=NEW.tenant_id AND id=NEW.reference_journal_entry_id;
        IF FOUND AND (v_journal.company_code_id<>NEW.company_code_id OR v_journal.ledger_book_id<>NEW.ledger_book_id OR v_journal.fiscal_period_id<>NEW.fiscal_period_id OR v_journal.transaction_currency_code<>NEW.currency_code OR v_journal.source_entity_type<>'document.depreciation_run' OR v_journal.source_entity_id IS DISTINCT FROM NEW.id OR v_journal.status<>'posted') THEN
            RAISE EXCEPTION 'Depreciation journal must be posted for this run and its accounting coordinates' USING ERRCODE='check_violation';
        END IF;
        SELECT count(*) FILTER (WHERE status<>'calculated') INTO v_bad FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id;
        IF NOT EXISTS (SELECT 1 FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id) OR v_bad>0 THEN RAISE EXCEPTION 'Only a fully calculated depreciation run can post' USING ERRCODE='check_violation'; END IF;
        NEW.posted_at:=statement_timestamp(); NEW.posted_by:=v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_depreciation_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document,master
AS $$
DECLARE v_run document.depreciation_run%ROWTYPE; v_book master.asset_book%ROWTYPE; v_schedule document.depreciation_schedule%ROWTYPE; v_original document.depreciation_run_line%ROWTYPE;
BEGIN
    SELECT * INTO v_run FROM document.depreciation_run WHERE tenant_id=NEW.tenant_id AND id=NEW.run_id;
    IF TG_OP='INSERT' AND v_run.status<>'running' THEN RAISE EXCEPTION 'Depreciation lines can only be calculated while the run is running' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    SELECT * INTO v_book FROM master.asset_book WHERE tenant_id=NEW.tenant_id AND id=NEW.asset_book_id;
    IF FOUND AND (v_book.asset_id<>NEW.asset_id OR v_book.company_code_id<>v_run.company_code_id OR v_book.ledger_book_id<>v_run.ledger_book_id OR v_book.currency_code<>NEW.currency_code OR v_book.depreciation_method<>NEW.depreciation_method OR v_book.useful_life_months<>NEW.useful_life_months) THEN
        RAISE EXCEPTION 'Depreciation line must match its asset-book and run coordinates' USING ERRCODE='check_violation';
    END IF;
    IF NEW.depreciation_schedule_id IS NOT NULL THEN
        SELECT * INTO v_schedule FROM document.depreciation_schedule WHERE tenant_id=NEW.tenant_id AND id=NEW.depreciation_schedule_id;
        IF FOUND AND (v_schedule.asset_id<>NEW.asset_id OR v_schedule.asset_book_id<>NEW.asset_book_id OR v_schedule.fiscal_period_id<>v_run.fiscal_period_id OR v_schedule.currency_code<>NEW.currency_code) THEN
            RAISE EXCEPTION 'Depreciation line schedule must match its asset book, fiscal period, and currency' USING ERRCODE='check_violation';
        END IF;
    END IF;
    IF NEW.reversal_of_line_id IS NOT NULL THEN
        SELECT * INTO v_original FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of_line_id;
        IF FOUND AND (v_run.reversal_of_run_id IS DISTINCT FROM v_original.run_id OR v_original.asset_id<>NEW.asset_id OR v_original.asset_book_id<>NEW.asset_book_id OR v_original.depreciation_amount<>NEW.depreciation_amount) THEN
            RAISE EXCEPTION 'Depreciation reversal line must mirror a line of the reversed run' USING ERRCODE='check_violation';
        END IF;
    ELSIF v_run.reversal_of_run_id IS NOT NULL THEN
        RAISE EXCEPTION 'Every line in a reversal run must reference its original line' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_depreciation_line()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='DELETE' OR pg_trigger_depth()<2 OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Depreciation run lines are append-only; only posting may advance line status internally' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF NEW.status<>'posted'
       OR (to_jsonb(NEW)-ARRAY['status','posted_at','posted_by'])
          IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','posted_at','posted_by'])
       OR NEW.posted_at IS NULL OR NEW.posted_by IS NULL THEN
        RAISE EXCEPTION 'Invalid depreciation line mutation' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_depreciation_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document,master
AS $$
DECLARE v_book master.asset_book%ROWTYPE; v_period master.fiscal_period%ROWTYPE; v_line document.depreciation_run_line%ROWTYPE;
BEGIN
    SELECT * INTO v_book FROM master.asset_book WHERE tenant_id=NEW.tenant_id AND id=NEW.asset_book_id;
    SELECT * INTO v_period FROM master.fiscal_period WHERE tenant_id=NEW.tenant_id AND id=NEW.fiscal_period_id;
    IF v_book.asset_id<>NEW.asset_id OR v_book.company_code_id<>v_period.company_code_id OR v_book.currency_code<>NEW.currency_code THEN
        RAISE EXCEPTION 'Depreciation schedule must match asset-book, company fiscal period, and currency' USING ERRCODE='check_violation';
    END IF;
    IF NEW.actual_run_line_id IS NOT NULL THEN
        SELECT * INTO v_line FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND id=NEW.actual_run_line_id;
        IF FOUND AND (v_line.depreciation_schedule_id IS DISTINCT FROM NEW.id OR v_line.status<>'posted') THEN
            RAISE EXCEPTION 'Actual depreciation evidence must be a posted line for this schedule' USING ERRCODE='check_violation';
        END IF;
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','cancelled') AND pg_trigger_depth()<2 AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Posted or cancelled depreciation schedule is immutable' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_post_depreciation_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document
AS $$
DECLARE v_line document.depreciation_run_line%ROWTYPE;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='posted' THEN
        UPDATE document.depreciation_run_line
           SET status='posted', posted_at=NEW.posted_at, posted_by=NEW.posted_by
         WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id AND status='calculated';
        FOR v_line IN SELECT * FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id AND status='posted' LOOP
            IF v_line.depreciation_schedule_id IS NOT NULL THEN
                UPDATE document.depreciation_schedule
                   SET actual_amount = CASE WHEN v_line.reversal_of_line_id IS NULL THEN v_line.depreciation_amount ELSE actual_amount-v_line.depreciation_amount END,
                       actual_run_line_id=v_line.id,
                       status='posted'
                 WHERE tenant_id=NEW.tenant_id AND id=v_line.depreciation_schedule_id;
            END IF;
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_after_bank_recon_case_state()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_line record;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        FOR v_line IN SELECT DISTINCT bank_statement_line_id AS id FROM document.bank_recon_case_line WHERE tenant_id=NEW.tenant_id AND bank_recon_case_id=NEW.id AND bank_statement_line_id IS NOT NULL LOOP
            PERFORM document.refresh_bank_reconciliation_projections(NEW.tenant_id,NEW.id);
            EXIT;
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_event()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM master.procurement_organization_profile p WHERE p.tenant_id=NEW.tenant_id AND p.operating_organization_id=NEW.operating_organization_id) THEN
        RAISE EXCEPTION 'Sourcing event requires a procurement operating-organization profile' USING ERRCODE='foreign_key_violation';
    END IF;
    IF NEW.central_buyer_company_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM master.operating_organization_company_assignment a
         WHERE a.tenant_id=NEW.tenant_id AND a.operating_organization_id=NEW.operating_organization_id
           AND a.company_code_id=NEW.central_buyer_company_id AND a.status='active'
           AND a.effective_from<=CURRENT_DATE AND (a.effective_until IS NULL OR a.effective_until>CURRENT_DATE)
    ) THEN RAISE EXCEPTION 'Central buyer must actively participate in the procurement organization' USING ERRCODE='foreign_key_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_sourcing_event()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'Sourcing event must be created draft' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('closed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Closed or cancelled sourcing event is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT(
        (OLD.status='draft' AND NEW.status IN('published','cancelled')) OR
        (OLD.status='published' AND NEW.status IN('evaluation','cancelled')) OR
        (OLD.status='evaluation' AND NEW.status IN('awarded','cancelled')) OR
        (OLD.status='awarded' AND NEW.status='closed')
    ) THEN RAISE EXCEPTION 'Invalid sourcing-event transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND v_actor IS NULL THEN RAISE EXCEPTION 'Current principal context is required for sourcing transitions' USING ERRCODE='insufficient_privilege'; END IF;
    IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.evaluation_currency_code IS NULL OR NEW.open_at IS NULL OR NEW.close_at IS NULL THEN RAISE EXCEPTION 'Published event requires evaluation currency and open/close times' USING ERRCODE='check_violation'; END IF;
        IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_company c WHERE c.tenant_id=NEW.tenant_id AND c.sourcing_event_id=NEW.id AND c.status='active' AND c.participation_role='lead_buyer') THEN RAISE EXCEPTION 'Published event requires one active lead buyer company' USING ERRCODE='check_violation'; END IF;
        IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_demand d WHERE d.tenant_id=NEW.tenant_id AND d.sourcing_event_id=NEW.id AND d.status='included') THEN RAISE EXCEPTION 'Published event requires included demand' USING ERRCODE='check_violation'; END IF;
        IF EXISTS(SELECT 1 FROM document.sourcing_event_demand d WHERE d.tenant_id=NEW.tenant_id AND d.sourcing_event_id=NEW.id AND d.status='included' AND d.evaluation_currency_code<>NEW.evaluation_currency_code) THEN RAISE EXCEPTION 'All included demand must use the event evaluation currency' USING ERRCODE='check_violation'; END IF;
        IF NEW.central_buyer_company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM document.sourcing_event_company c WHERE c.tenant_id=NEW.tenant_id AND c.sourcing_event_id=NEW.id AND c.company_code_id=NEW.central_buyer_company_id AND c.status='active' AND c.participation_role='lead_buyer') THEN RAISE EXCEPTION 'Central buyer must be the active lead buyer' USING ERRCODE='check_violation'; END IF;
        NEW.published_at:=statement_timestamp(); NEW.published_by:=v_actor;
    END IF;
    IF NEW.status='evaluation' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND clock_timestamp()<NEW.close_at THEN RAISE EXCEPTION 'Evaluation cannot start before the event closes' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF NEW.status='awarded' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_award a WHERE a.tenant_id=NEW.tenant_id AND a.sourcing_event_id=NEW.id AND a.status IN('approved','converted')) THEN RAISE EXCEPTION 'Awarded event requires an approved award' USING ERRCODE='check_violation'; END IF;
        NEW.awarded_at:=statement_timestamp(); NEW.awarded_by:=v_actor;
    END IF;
    IF NEW.status='closed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN NEW.closed_at:=statement_timestamp(); NEW.closed_by:=v_actor; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_company()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_event document.sourcing_event%ROWTYPE;
BEGIN
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=NEW.sourcing_event_id;
    IF v_event.status<>'draft' THEN RAISE EXCEPTION 'Event companies are fixed after publication' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.operating_organization_company_assignment a WHERE a.tenant_id=NEW.tenant_id AND a.operating_organization_id=v_event.operating_organization_id AND a.company_code_id=NEW.company_code_id AND a.status='active' AND a.effective_from<=CURRENT_DATE AND (a.effective_until IS NULL OR a.effective_until>CURRENT_DATE)) THEN
        RAISE EXCEPTION 'Event company must actively participate in its procurement organization' USING ERRCODE='foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_demand()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_event document.sourcing_event%ROWTYPE; v_line document.purchase_requisition_line%ROWTYPE; v_used_qty numeric(20,6);
BEGIN
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=NEW.sourcing_event_id;
    IF v_event.status NOT IN('draft','published') THEN RAISE EXCEPTION 'Demand can only be assembled before evaluation' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    SELECT * INTO v_line FROM document.purchase_requisition_line WHERE tenant_id=NEW.tenant_id AND id=NEW.purchase_requisition_line_id;
    IF FOUND AND (v_line.company_code_id<>NEW.demand_company_code_id OR v_line.uom_code<>NEW.uom_code OR v_line.currency_code<>NEW.source_currency_code OR NEW.requested_quantity>v_line.quantity OR NEW.requested_amount>v_line.net_amount) THEN
        RAISE EXCEPTION 'Sourcing demand must remain within its requisition line company, UOM, currency, quantity, and amount' USING ERRCODE='check_violation';
    END IF;
    IF NEW.evaluation_currency_code IS DISTINCT FROM v_event.evaluation_currency_code AND v_event.evaluation_currency_code IS NOT NULL THEN RAISE EXCEPTION 'Demand evaluation currency must match the event' USING ERRCODE='check_violation'; END IF;
    IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_company c WHERE c.tenant_id=NEW.tenant_id AND c.sourcing_event_id=NEW.sourcing_event_id AND c.company_code_id=NEW.demand_company_code_id AND c.status='active') THEN RAISE EXCEPTION 'Demand company must actively participate in the event' USING ERRCODE='foreign_key_violation'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':sourcing-demand:'||NEW.purchase_requisition_line_id::text,0));
    SELECT coalesce(sum(d.requested_quantity),0) INTO v_used_qty FROM document.sourcing_event_demand d JOIN document.sourcing_event e ON e.tenant_id=d.tenant_id AND e.id=d.sourcing_event_id WHERE d.tenant_id=NEW.tenant_id AND d.purchase_requisition_line_id=NEW.purchase_requisition_line_id AND d.id<>NEW.id AND d.status<>'withdrawn' AND e.status<>'cancelled';
    IF v_used_qty+NEW.requested_quantity>v_line.quantity THEN RAISE EXCEPTION 'Active sourcing events exceed the requisition-line quantity' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_sourcing_award()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid; v_event document.sourcing_event%ROWTYPE; v_bad integer;
BEGIN
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=NEW.sourcing_event_id;
    IF TG_OP='INSERT' AND (NEW.status<>'recommended' OR v_event.status<>'evaluation') THEN RAISE EXCEPTION 'Awards must be recommended during event evaluation' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF NEW.currency_code<>v_event.evaluation_currency_code THEN RAISE EXCEPTION 'Award currency must match the event evaluation currency' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM master.supplier s WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.supplier_id AND s.status='active') THEN RAISE EXCEPTION 'Sourcing award requires an active supplier' USING ERRCODE='foreign_key_violation'; END IF;
    IF TG_OP='UPDATE' AND NEW.award_amount IS DISTINCT FROM OLD.award_amount AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Award amount is maintained from active demand allocations' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('rejected','converted','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Finalized sourcing award is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT((OLD.status='recommended' AND NEW.status IN('approved','rejected','cancelled')) OR (OLD.status='approved' AND NEW.status IN('converted','cancelled'))) THEN RAISE EXCEPTION 'Invalid sourcing-award transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND v_actor IS NULL THEN RAISE EXCEPTION 'Current principal context is required for award transitions' USING ERRCODE='insufficient_privilege'; END IF;
    IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.award_amount<=0 OR NOT EXISTS(SELECT 1 FROM document.sourcing_event_award_allocation x WHERE x.tenant_id=NEW.tenant_id AND x.award_id=NEW.id AND x.status='planned') THEN RAISE EXCEPTION 'Approved award requires positive planned demand allocations' USING ERRCODE='check_violation'; END IF;
        NEW.approved_at:=statement_timestamp(); NEW.approved_by:=v_actor;
    END IF;
    IF NEW.status='converted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        SELECT count(*) FILTER(WHERE status<>'converted') INTO v_bad FROM document.sourcing_event_award_allocation WHERE tenant_id=NEW.tenant_id AND award_id=NEW.id AND status<>'cancelled';
        IF NOT EXISTS(SELECT 1 FROM document.sourcing_event_award_allocation WHERE tenant_id=NEW.tenant_id AND award_id=NEW.id AND status='converted') OR v_bad>0 THEN RAISE EXCEPTION 'Converted award requires all active allocations converted' USING ERRCODE='check_violation'; END IF;
        IF v_event.buying_model='central_buyer' AND EXISTS(
            SELECT 1 FROM document.sourcing_event_award_allocation x
             WHERE x.tenant_id=NEW.tenant_id AND x.award_id=NEW.id AND x.status='converted'
               AND x.company_code_id<>v_event.central_buyer_company_id
               AND NOT EXISTS(SELECT 1 FROM document.sourcing_event_intercompany_allocation i WHERE i.tenant_id=x.tenant_id AND i.award_allocation_id=x.id AND i.status<>'cancelled')
        ) THEN RAISE EXCEPTION 'Converted central-buyer award requires an intercompany allocation for every beneficiary company' USING ERRCODE='check_violation'; END IF;
        NEW.converted_at:=statement_timestamp(); NEW.converted_by:=v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_award_allocation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_award document.sourcing_event_award%ROWTYPE; v_event document.sourcing_event%ROWTYPE; v_demand document.sourcing_event_demand%ROWTYPE; v_commitment document.commitment%ROWTYPE; v_qty numeric(20,6); v_amount numeric(20,4);
BEGIN
    SELECT * INTO v_award FROM document.sourcing_event_award WHERE tenant_id=NEW.tenant_id AND id=NEW.award_id;
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=v_award.sourcing_event_id;
    SELECT * INTO v_demand FROM document.sourcing_event_demand WHERE tenant_id=NEW.tenant_id AND id=NEW.sourcing_event_demand_id;
    IF v_award.status NOT IN('recommended','approved') THEN RAISE EXCEPTION 'Award allocations are fixed after award finalization' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF v_demand.sourcing_event_id<>v_award.sourcing_event_id OR v_demand.demand_company_code_id<>NEW.company_code_id OR v_demand.evaluation_currency_code<>NEW.currency_code OR (NEW.awarded_quantity IS NOT NULL AND (v_demand.uom_code<>NEW.uom_code OR NEW.awarded_quantity>v_demand.requested_quantity)) THEN
        RAISE EXCEPTION 'Award allocation must match its event demand, beneficiary company, currency, UOM, and quantity' USING ERRCODE='check_violation';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':sourcing-award-demand:'||NEW.sourcing_event_demand_id::text,0));
    SELECT coalesce(sum(x.awarded_quantity),0),coalesce(sum(x.awarded_amount),0) INTO v_qty,v_amount FROM document.sourcing_event_award_allocation x JOIN document.sourcing_event_award a ON a.tenant_id=x.tenant_id AND a.id=x.award_id WHERE x.tenant_id=NEW.tenant_id AND x.sourcing_event_demand_id=NEW.sourcing_event_demand_id AND x.id<>NEW.id AND x.status<>'cancelled' AND a.status NOT IN('rejected','cancelled');
    IF (NEW.awarded_quantity IS NOT NULL AND v_qty+NEW.awarded_quantity>v_demand.requested_quantity) OR v_amount+NEW.awarded_amount>v_demand.evaluation_amount THEN RAISE EXCEPTION 'Active awards exceed demand quantity or evaluation amount' USING ERRCODE='check_violation'; END IF;
    IF NEW.output_commitment_id IS NOT NULL THEN
        SELECT * INTO v_commitment FROM document.commitment WHERE tenant_id=NEW.tenant_id AND id=NEW.output_commitment_id;
        IF FOUND AND (v_commitment.supplier_id<>v_award.supplier_id OR v_commitment.currency_code<>NEW.currency_code OR v_commitment.company_code_id<>CASE WHEN v_event.buying_model='central_buyer' THEN v_event.central_buyer_company_id ELSE NEW.company_code_id END) THEN RAISE EXCEPTION 'Output commitment must match award supplier, currency, and buying company' USING ERRCODE='check_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.refresh_sourcing_award_projections(p_tenant_id uuid,p_award_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_total numeric(20,4); v_event uuid; v_demand record; v_qty numeric(20,6); v_amount numeric(20,4); v_converted integer; v_active integer;
BEGIN
    SELECT coalesce(sum(awarded_amount),0) INTO v_total FROM document.sourcing_event_award_allocation WHERE tenant_id=p_tenant_id AND award_id=p_award_id AND status<>'cancelled';
    UPDATE document.sourcing_event_award SET award_amount=v_total WHERE tenant_id=p_tenant_id AND id=p_award_id AND award_amount IS DISTINCT FROM v_total;
    SELECT sourcing_event_id INTO v_event FROM document.sourcing_event_award WHERE tenant_id=p_tenant_id AND id=p_award_id;
    FOR v_demand IN SELECT id,requested_quantity,evaluation_amount FROM document.sourcing_event_demand WHERE tenant_id=p_tenant_id AND sourcing_event_id=v_event LOOP
        SELECT coalesce(sum(x.awarded_quantity),0),coalesce(sum(x.awarded_amount),0),count(*) FILTER(WHERE x.status='converted'),count(*)
          INTO v_qty,v_amount,v_converted,v_active
          FROM document.sourcing_event_award_allocation x JOIN document.sourcing_event_award a ON a.tenant_id=x.tenant_id AND a.id=x.award_id
         WHERE x.tenant_id=p_tenant_id AND x.sourcing_event_demand_id=v_demand.id AND x.status<>'cancelled' AND a.status NOT IN('rejected','cancelled');
        UPDATE document.sourcing_event_demand SET status=CASE WHEN v_active=0 THEN 'included' WHEN v_converted=v_active AND (v_qty>=v_demand.requested_quantity OR v_amount>=v_demand.evaluation_amount) THEN 'converted' WHEN v_qty>=v_demand.requested_quantity OR v_amount>=v_demand.evaluation_amount THEN 'awarded' ELSE 'partially_awarded' END
         WHERE tenant_id=p_tenant_id AND id=v_demand.id AND status<>'withdrawn' AND status IS DISTINCT FROM CASE WHEN v_active=0 THEN 'included' WHEN v_converted=v_active AND (v_qty>=v_demand.requested_quantity OR v_amount>=v_demand.evaluation_amount) THEN 'converted' WHEN v_qty>=v_demand.requested_quantity OR v_amount>=v_demand.evaluation_amount THEN 'awarded' ELSE 'partially_awarded' END;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_refresh_sourcing_award()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_new jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
        v_old jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
        v_tenant uuid; v_award uuid;
BEGIN
    v_tenant:=coalesce(nullif(v_new->>'tenant_id','')::uuid,nullif(v_old->>'tenant_id','')::uuid);
    v_award:=coalesce(nullif(v_new->>'award_id','')::uuid,nullif(v_old->>'award_id','')::uuid,nullif(v_new->>'id','')::uuid,nullif(v_old->>'id','')::uuid);
    PERFORM document.refresh_sourcing_award_projections(v_tenant,v_award);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_sourcing_intercompany()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_alloc document.sourcing_event_award_allocation%ROWTYPE; v_award document.sourcing_event_award%ROWTYPE; v_event document.sourcing_event%ROWTYPE; v_journal document.journal_entry%ROWTYPE;
BEGIN
    SELECT * INTO v_alloc FROM document.sourcing_event_award_allocation WHERE tenant_id=NEW.tenant_id AND id=NEW.award_allocation_id;
    SELECT * INTO v_award FROM document.sourcing_event_award WHERE tenant_id=NEW.tenant_id AND id=v_alloc.award_id;
    SELECT * INTO v_event FROM document.sourcing_event WHERE tenant_id=NEW.tenant_id AND id=v_award.sourcing_event_id;
    IF v_event.buying_model<>'central_buyer' OR NEW.source_company_code_id<>v_event.central_buyer_company_id OR NEW.beneficiary_company_code_id<>v_alloc.company_code_id OR NEW.commitment_id<>v_alloc.output_commitment_id OR NEW.allocation_amount<>v_alloc.awarded_amount OR NEW.currency_code<>v_alloc.currency_code THEN
        RAISE EXCEPTION 'Intercompany sourcing allocation must mirror its central-buyer award allocation' USING ERRCODE='check_violation';
    END IF;
    IF NEW.status='posted' THEN
        SELECT * INTO v_journal FROM document.journal_entry WHERE tenant_id=NEW.tenant_id AND id=NEW.posting_journal_entry_id;
        IF FOUND AND (v_journal.company_code_id<>NEW.source_company_code_id OR v_journal.transaction_currency_code<>NEW.currency_code OR v_journal.source_entity_type<>'document.sourcing_event_intercompany_allocation' OR v_journal.source_entity_id IS DISTINCT FROM NEW.id OR v_journal.status<>'posted') THEN RAISE EXCEPTION 'Intercompany journal must be posted for this allocation, source company, and currency' USING ERRCODE='check_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_sourcing_intercompany()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'planned' THEN RAISE EXCEPTION 'Intercompany sourcing allocation must be created planned' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('posted','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Posted or cancelled intercompany sourcing allocation is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT(OLD.status='planned' AND NEW.status IN('posted','cancelled')) THEN RAISE EXCEPTION 'Invalid intercompany sourcing-allocation transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_hr_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'HR approval document must be created draft' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF v_actor IS NULL THEN RAISE EXCEPTION 'Current principal context is required for HR approval transitions' USING ERRCODE='insufficient_privilege'; END IF;
        IF NOT(
            (OLD.status='draft' AND NEW.status IN('submitted','cancelled')) OR
            (OLD.status='submitted' AND NEW.status IN('approved','rejected','withdrawn','cancelled')) OR
            (TG_TABLE_NAME='employee_tax_declaration' AND OLD.status='approved' AND NEW.status='superseded')
        ) THEN RAISE EXCEPTION 'Invalid % transition: % -> %',TG_TABLE_NAME,OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
        IF NEW.status='submitted' THEN NEW.submitted_at:=statement_timestamp(); NEW.submitted_by:=v_actor; END IF;
        IF NEW.status='approved' THEN
            IF TG_TABLE_NAME='employee_tax_declaration' AND NOT EXISTS(SELECT 1 FROM document.employee_tax_declaration_line l WHERE l.tenant_id=NEW.tenant_id AND l.employee_tax_declaration_id=NEW.id) THEN RAISE EXCEPTION 'Approved tax declaration requires at least one line' USING ERRCODE='check_violation'; END IF;
            IF TG_TABLE_NAME='leave_request' AND (NEW.approved_quantity IS NULL OR NEW.approved_quantity>NEW.requested_quantity) THEN RAISE EXCEPTION 'Approved leave quantity is required and cannot exceed requested quantity' USING ERRCODE='check_violation'; END IF;
            IF TG_TABLE_NAME='attendance_adjustment_request' AND NEW.approved_values='{}'::jsonb THEN RAISE EXCEPTION 'Approved attendance adjustment requires approved values' USING ERRCODE='check_violation'; END IF;
            NEW.approved_at:=statement_timestamp(); NEW.approved_by:=v_actor;
        END IF;
        IF NEW.status IN('rejected','cancelled') AND nullif(btrim(NEW.decision_reason),'') IS NULL THEN RAISE EXCEPTION 'Rejected or cancelled HR request requires a decision reason' USING ERRCODE='check_violation'; END IF;
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN('rejected','cancelled','withdrawn','superseded') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Final HR approval document is immutable' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.fn_workforce_request_payload_has_restricted_key(p_value jsonb)
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
                'firstname', 'middlename', 'lastname', 'preferredname', 'displayname',
                'email', 'emailaddress', 'phone', 'phonenumber', 'dateofbirth',
                'gender', 'maritalstatus', 'nationality', 'nationalid',
                'nationalidentifier', 'taxidentifier', 'passport', 'passportnumber',
                'bankaccount', 'iban', 'compensation', 'salary'
            ) THEN
                RETURN true;
            END IF;
            IF document.fn_workforce_request_payload_has_restricted_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_value) = 'array' THEN
        FOR v_child IN SELECT value FROM jsonb_array_elements(p_value)
        LOOP
            IF document.fn_workforce_request_payload_has_restricted_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    END IF;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_workforce_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_valid_transition boolean := false;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Workforce requests cannot be deleted; cancel or supersede the request'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF document.fn_workforce_request_payload_has_restricted_key(NEW.requested_changes) THEN
        RAISE EXCEPTION 'Restricted person values belong in protected profile content, not workforce request JSON'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft'
           OR NEW.workflow_request_id IS NOT NULL
           OR NEW.decision_fingerprint IS NOT NULL
           OR NEW.application_fingerprint IS NOT NULL
           OR num_nonnulls(
                NEW.materialized_person_id, NEW.materialized_employee_id,
                NEW.materialized_employment_id, NEW.materialized_work_assignment_id,
                NEW.materialized_principal_id, NEW.materialized_onboarding_case_id,
                NEW.materialization_snapshot_id
           ) > 0
           OR NEW.submitted_at IS NOT NULL OR NEW.submitted_by IS NOT NULL
           OR NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL
           OR NEW.applied_at IS NOT NULL OR NEW.applied_by IS NOT NULL THEN
            RAISE EXCEPTION 'New workforce requests must start as evidence-free drafts'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF (NEW.id, NEW.tenant_id, NEW.request_no, NEW.request_kind, NEW.source_kind,
        NEW.target_person_id, NEW.target_employee_id, NEW.target_employment_id,
        NEW.idempotency_key, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       (OLD.id, OLD.tenant_id, OLD.request_no, OLD.request_kind, OLD.source_kind,
        OLD.target_person_id, OLD.target_employee_id, OLD.target_employment_id,
        OLD.idempotency_key, OLD.created_at, OLD.created_by) THEN
        RAISE EXCEPTION 'Workforce request identity, target, kind, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status IN ('applied','rejected','cancelled','superseded') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Final workforce request evidence is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status NOT IN ('draft','validating','validation_failed','returned') AND (
        NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id
        OR NEW.position_id IS DISTINCT FROM OLD.position_id
        OR NEW.protected_profile_content_item_id IS DISTINCT FROM OLD.protected_profile_content_item_id
        OR NEW.payload_schema_code IS DISTINCT FROM OLD.payload_schema_code
        OR NEW.payload_schema_version IS DISTINCT FROM OLD.payload_schema_version
        OR NEW.payload_schema_hash IS DISTINCT FROM OLD.payload_schema_hash
        OR NEW.requested_changes IS DISTINCT FROM OLD.requested_changes
        OR NEW.workflow_request_id IS DISTINCT FROM OLD.workflow_request_id
        OR NEW.decision_fingerprint IS DISTINCT FROM OLD.decision_fingerprint
    ) THEN
        RAISE EXCEPTION 'Submitted workforce request scope, payload, workflow, and decision evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_valid_transition := CASE OLD.status
            WHEN 'draft' THEN NEW.status IN ('validating','cancelled')
            WHEN 'validating' THEN NEW.status IN ('draft','validation_failed','pending_approval','cancelled')
            WHEN 'validation_failed' THEN NEW.status IN ('draft','validating','cancelled')
            WHEN 'pending_approval' THEN NEW.status IN ('returned','approved','rejected','cancelled')
            WHEN 'returned' THEN NEW.status IN ('validating','cancelled','superseded')
            WHEN 'approved' THEN NEW.status = 'applying'
            WHEN 'applying' THEN NEW.status IN ('applied','failed')
            WHEN 'failed' THEN NEW.status IN ('applying','superseded')
            ELSE false
        END;
        IF NOT v_valid_transition THEN
            RAISE EXCEPTION 'Invalid workforce request transition: % -> %', OLD.status, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status IN ('pending_approval','returned','approved','rejected','applying','applied','failed')
       AND (NEW.submitted_at IS NULL OR NEW.submitted_by IS NULL
            OR NEW.workflow_request_id IS NULL OR NEW.decision_fingerprint IS NULL) THEN
        RAISE EXCEPTION 'Reviewed workforce request requires submission, workflow, and fingerprint evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('approved','applying','applied','failed')
       AND (NEW.approved_at IS NULL OR NEW.approved_by IS NULL) THEN
        RAISE EXCEPTION 'Approved workforce request requires approval evidence'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_compensation_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_group master.pay_group%ROWTYPE; v_structure master.pay_structure%ROWTYPE; v_current master.compensation_assignment%ROWTYPE; v_approved master.compensation_assignment%ROWTYPE;
BEGIN
    SELECT * INTO v_group FROM master.pay_group WHERE tenant_id=NEW.tenant_id AND id=NEW.proposed_pay_group_id;
    IF v_group.currency_code<>NEW.proposed_currency_code THEN RAISE EXCEPTION 'Proposed compensation currency must match pay group' USING ERRCODE='check_violation'; END IF;
    IF NEW.proposed_pay_structure_id IS NOT NULL THEN
        SELECT * INTO v_structure FROM master.pay_structure WHERE tenant_id=NEW.tenant_id AND id=NEW.proposed_pay_structure_id;
        IF v_structure.currency_code<>NEW.proposed_currency_code OR (v_structure.pay_group_id IS NOT NULL AND v_structure.pay_group_id<>NEW.proposed_pay_group_id) THEN RAISE EXCEPTION 'Proposed pay structure must match pay group and currency' USING ERRCODE='check_violation'; END IF;
    END IF;
    IF NEW.current_assignment_id IS NOT NULL THEN
        SELECT * INTO v_current FROM master.compensation_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.current_assignment_id;
        IF v_current.employee_id<>NEW.employee_id OR (v_current.status<>'active' AND NOT(NEW.status='approved' AND v_current.status='superseded')) THEN RAISE EXCEPTION 'Current compensation assignment must be active (or just superseded by this approval) and belong to the employee' USING ERRCODE='check_violation'; END IF;
    END IF;
    IF NEW.approved_assignment_id IS NOT NULL THEN
        SELECT * INTO v_approved FROM master.compensation_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.approved_assignment_id;
        IF v_approved.source_compensation_change_id<>NEW.id OR v_approved.employee_id<>NEW.employee_id THEN RAISE EXCEPTION 'Approved compensation assignment must materialize this change' USING ERRCODE='check_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.fn_workforce_request_approvers(p_tenant_id uuid,p_legal_entity_id uuid,p_company_code_id uuid,p_excluded_principal_id uuid)
RETURNS TABLE(principal_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,document,authz,master,shared AS $$
 SELECT DISTINCT member.principal_id FROM authz.group_member member
 JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id AND principal.status='active'
 JOIN authz.plane_membership membership ON membership.tenant_id=member.tenant_id AND membership.principal_id=member.principal_id AND membership.status='active' AND membership.effective_from<=now() AND(membership.effective_until IS NULL OR membership.effective_until>now())
 JOIN authz.group_role grant_row ON grant_row.tenant_id=member.tenant_id AND grant_row.group_id=member.group_id AND grant_row.status='active' AND grant_row.effective_from<=now() AND(grant_row.effective_until IS NULL OR grant_row.effective_until>now())
 JOIN authz.role role_row ON role_row.tenant_id=grant_row.tenant_id AND role_row.id=grant_row.role_id AND role_row.status='active'
 JOIN authz.role_permission rp ON rp.tenant_id=role_row.tenant_id AND rp.role_id=role_row.id
 JOIN authz.permission permission ON permission.id=rp.permission_id AND permission.canonical_code='neon.workforce.request.decide' AND permission.status='published'
 JOIN authz.scope_target target ON target.tenant_id=grant_row.tenant_id AND target.id=grant_row.scope_target_id AND target.status='active'
 WHERE p_tenant_id=shared.current_tenant_id() AND member.tenant_id=p_tenant_id AND member.status='active' AND member.effective_from<=now() AND(member.effective_until IS NULL OR member.effective_until>now()) AND member.principal_id IS DISTINCT FROM p_excluded_principal_id
 AND((target.scope_kind='tenant' AND target.target_id=p_tenant_id) OR(target.scope_kind='legal_entity' AND target.target_id=p_legal_entity_id) OR(p_company_code_id IS NOT NULL AND target.scope_kind='company_code' AND target.target_id=p_company_code_id))
 ORDER BY member.principal_id LIMIT 200
$$;
REVOKE ALL ON FUNCTION document.fn_workforce_request_approvers(uuid,uuid,uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION document.trg_validate_tax_declaration()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM master.employment e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.employment_id AND e.employee_id=NEW.employee_id) THEN RAISE EXCEPTION 'Tax declaration employment must belong to employee' USING ERRCODE='foreign_key_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_tax_declaration_line()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='DELETE' OR NOT EXISTS(SELECT 1 FROM document.employee_tax_declaration d WHERE d.tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id) AND d.id=coalesce(NEW.employee_tax_declaration_id,OLD.employee_tax_declaration_id) AND d.status='draft') THEN
        RAISE EXCEPTION 'Tax declaration lines can only change while the declaration is draft' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.employee_tax_declaration_id IS DISTINCT FROM OLD.employee_tax_declaration_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN RAISE EXCEPTION 'Tax declaration line identity and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_leave_contract()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_plan master.leave_plan%ROWTYPE; v_type master.leave_type%ROWTYPE;
BEGIN
    SELECT * INTO v_plan FROM master.leave_plan WHERE tenant_id=NEW.tenant_id AND id=NEW.leave_plan_id;
    SELECT * INTO v_type FROM master.leave_type WHERE tenant_id=NEW.tenant_id AND id=NEW.leave_type_id;
    IF v_plan.leave_type_id<>NEW.leave_type_id OR v_type.unit<>NEW.quantity_unit THEN RAISE EXCEPTION 'Leave plan, type and quantity unit must agree' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_shift_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM master.shift_type s WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.shift_type_id AND s.status='active') THEN RAISE EXCEPTION 'Shift assignment requires an active shift type' USING ERRCODE='foreign_key_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_attendance_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_shift document.shift_assignment%ROWTYPE;
BEGIN
    IF NEW.shift_assignment_id IS NOT NULL THEN
        SELECT * INTO v_shift FROM document.shift_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.shift_assignment_id;
        IF v_shift.employee_id<>NEW.employee_id OR (TG_TABLE_NAME='attendance_day' AND v_shift.work_date<>NEW.attendance_date) THEN RAISE EXCEPTION 'Attendance record must match shift employee and work date' USING ERRCODE='check_violation'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_hr_operational_state()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_ok boolean:=false;
BEGIN
    IF TG_OP='INSERT' THEN RETURN NEW; END IF;
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    v_ok:=CASE TG_TABLE_NAME
        WHEN 'shift_assignment' THEN (OLD.status='scheduled' AND NEW.status IN('worked','adjusted','cancelled')) OR (OLD.status='worked' AND NEW.status='adjusted')
        WHEN 'time_punch' THEN OLD.status='accepted' AND NEW.status='voided'
        WHEN 'attendance_day' THEN (OLD.status='open' AND NEW.status IN('approved','voided')) OR (OLD.status='approved' AND NEW.status IN('locked','voided'))
        WHEN 'payroll_period' THEN (OLD.status='open' AND NEW.status='processing') OR (OLD.status='processing' AND NEW.status IN('open','closed')) OR (OLD.status='closed' AND NEW.status='locked')
        WHEN 'payroll_run_employee' THEN (OLD.status='included' AND NEW.status IN('excluded','calculated','error')) OR (OLD.status='error' AND NEW.status IN('included','excluded','calculated'))
        WHEN 'payroll_result' THEN (OLD.status='calculating' AND NEW.status='calculated') OR (OLD.status='calculated' AND NEW.status IN('approved','voided')) OR (OLD.status='approved' AND NEW.status IN('posted','voided'))
        ELSE false END;
    IF NOT v_ok THEN RAISE EXCEPTION 'Invalid % transition: % -> %',TG_TABLE_NAME,OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_time_punch()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.employee_id,NEW.shift_assignment_id,NEW.punch_at,NEW.punch_type,NEW.source_type,NEW.device_ref,NEW.idempotency_key,NEW.geo_payload,NEW.raw_payload,NEW.created_at,NEW.created_by)
        IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.employee_id,OLD.shift_assignment_id,OLD.punch_at,OLD.punch_type,OLD.source_type,OLD.device_ref,OLD.idempotency_key,OLD.geo_payload,OLD.raw_payload,OLD.created_at,OLD.created_by) THEN
        RAISE EXCEPTION 'Accepted punch evidence is immutable; void it and append a replacement' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_people_case()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'People case must be created draft' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT((OLD.status='draft' AND NEW.status IN('active','cancelled')) OR (OLD.status='active' AND NEW.status IN('completed','cancelled'))) THEN RAISE EXCEPTION 'Invalid % transition: % -> %',TG_TABLE_NAME,OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
        IF NEW.status='active' THEN NEW.activated_at:=statement_timestamp(); END IF;
        IF NEW.status='completed' THEN NEW.completed_at:=statement_timestamp(); END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_hr_case()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'open' THEN RAISE EXCEPTION 'HR case must be created open' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT(
        (OLD.status='open' AND NEW.status IN('in_progress','pending','resolved','cancelled')) OR
        (OLD.status IN('in_progress','pending') AND NEW.status IN('in_progress','pending','resolved','cancelled')) OR
        (OLD.status='resolved' AND NEW.status IN('closed','in_progress'))
    ) THEN RAISE EXCEPTION 'Invalid HR case transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status='resolved' THEN NEW.resolved_at:=statement_timestamp(); END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status='closed' THEN NEW.closed_at:=statement_timestamp(); END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_payroll_run()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'Payroll run must be created draft' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF v_actor IS NULL THEN RAISE EXCEPTION 'Current principal context is required for payroll transitions' USING ERRCODE='insufficient_privilege'; END IF;
        IF NOT((OLD.status='draft' AND NEW.status IN('calculating','cancelled')) OR (OLD.status='calculating' AND NEW.status IN('calculated','cancelled')) OR (OLD.status='calculated' AND NEW.status IN('draft','approved','cancelled')) OR (OLD.status='approved' AND NEW.status IN('posted','cancelled')) OR (OLD.status='posted' AND NEW.status='reversed')) THEN RAISE EXCEPTION 'Invalid payroll run transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
        IF NEW.status='calculating' THEN NEW.calculation_started_at:=statement_timestamp(); END IF;
        IF NEW.status='calculated' THEN NEW.calculation_completed_at:=statement_timestamp(); END IF;
        IF NEW.status='approved' THEN NEW.approved_at:=statement_timestamp(); NEW.approved_by:=v_actor; END IF;
        IF NEW.status='posted' THEN NEW.posted_at:=statement_timestamp(); NEW.posted_by:=v_actor; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_payroll_run_employee()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_period document.payroll_period%ROWTYPE; v_assignment master.compensation_assignment%ROWTYPE;
BEGIN
    SELECT p.* INTO v_period FROM document.payroll_period p JOIN document.payroll_run r ON r.tenant_id=p.tenant_id AND r.payroll_period_id=p.id WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.payroll_run_id;
    SELECT * INTO v_assignment FROM master.compensation_assignment WHERE tenant_id=NEW.tenant_id AND id=NEW.compensation_assignment_id;
    IF v_assignment.employee_id<>NEW.employee_id OR v_assignment.status<>'active' OR v_assignment.effective_from>v_period.period_end OR (v_assignment.effective_until IS NOT NULL AND v_assignment.effective_until<v_period.period_start) THEN RAISE EXCEPTION 'Payroll employee requires an active compensation assignment effective in the period' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_payroll_result()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_run_employee document.payroll_run_employee%ROWTYPE; v_assignment master.compensation_assignment%ROWTYPE;
BEGIN
    SELECT * INTO v_run_employee FROM document.payroll_run_employee WHERE tenant_id=NEW.tenant_id AND id=NEW.payroll_run_employee_id;
    SELECT * INTO v_assignment FROM master.compensation_assignment WHERE tenant_id=NEW.tenant_id AND id=v_run_employee.compensation_assignment_id;
    IF v_run_employee.payroll_run_id<>NEW.payroll_run_id OR v_run_employee.employee_id<>NEW.employee_id OR v_assignment.currency_code<>NEW.currency_code THEN RAISE EXCEPTION 'Payroll result must match run employee and compensation currency' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND pg_trigger_depth()<2 AND (NEW.gross_amount,NEW.employee_deduction_amount,NEW.employer_contribution_amount,NEW.net_amount) IS DISTINCT FROM (OLD.gross_amount,OLD.employee_deduction_amount,OLD.employer_contribution_amount,OLD.net_amount) THEN RAISE EXCEPTION 'Payroll result totals are maintained from result lines' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status='calculated' AND NOT EXISTS(SELECT 1 FROM document.payroll_result_line l WHERE l.tenant_id=NEW.tenant_id AND l.payroll_result_id=NEW.id) THEN RAISE EXCEPTION 'Calculated payroll result requires result lines' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_payroll_result_line()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_result document.payroll_result%ROWTYPE; v_component master.pay_component%ROWTYPE;
BEGIN
    SELECT * INTO v_result FROM document.payroll_result WHERE tenant_id=NEW.tenant_id AND id=NEW.payroll_result_id;
    SELECT * INTO v_component FROM master.pay_component WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_component_id;
    IF v_result.status<>'calculating' OR NEW.currency_code<>v_result.currency_code OR NEW.component_code_snapshot<>v_component.code OR NEW.component_type_snapshot<>v_component.component_type OR NEW.is_employer_cost_snapshot<>v_component.is_employer_cost THEN RAISE EXCEPTION 'Payroll result line must freeze its active component and result currency while calculating' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.refresh_payroll_result_totals(p_tenant_id uuid,p_result_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_gross numeric(18,4); v_deduction numeric(18,4); v_employer numeric(18,4);
BEGIN
    SELECT coalesce(sum(amount) FILTER(WHERE component_type_snapshot='earning'),0),
           coalesce(sum(amount) FILTER(WHERE component_type_snapshot IN('deduction','statutory') AND NOT is_employer_cost_snapshot),0),
           coalesce(sum(amount) FILTER(WHERE component_type_snapshot='employer_contribution' OR is_employer_cost_snapshot),0)
      INTO v_gross,v_deduction,v_employer FROM document.payroll_result_line WHERE tenant_id=p_tenant_id AND payroll_result_id=p_result_id;
    UPDATE document.payroll_result SET gross_amount=v_gross,employee_deduction_amount=v_deduction,employer_contribution_amount=v_employer,net_amount=v_gross-v_deduction
     WHERE tenant_id=p_tenant_id AND id=p_result_id;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_refresh_payroll_result()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN PERFORM document.refresh_payroll_result_totals(NEW.tenant_id,NEW.payroll_result_id); RETURN NULL; END;
$$;
CREATE OR REPLACE FUNCTION document.trg_validate_policy_acknowledgment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_policy_tenant uuid;
    v_policy_code text;
    v_policy_name text;
    v_policy_version integer;
BEGIN
    SELECT tenant_id,entity_type,name,version_no
      INTO v_policy_tenant,v_policy_code,v_policy_name,v_policy_version
      FROM control.policy_definition
     WHERE id=NEW.policy_definition_id
       AND status='active';
    IF NOT FOUND OR (v_policy_tenant IS NOT NULL AND v_policy_tenant<>NEW.tenant_id) THEN
        RAISE EXCEPTION 'active acknowledgment policy does not belong to the tenant'
            USING ERRCODE='foreign_key_violation';
    END IF;
    IF NEW.policy_code_snapshot<>v_policy_code
       OR NEW.policy_name_snapshot<>v_policy_name
       OR NEW.policy_version_snapshot<>v_policy_version THEN
        RAISE EXCEPTION 'policy acknowledgment snapshot does not match the active policy definition'
            USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_project_task()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_wbs master.project_wbs%ROWTYPE;
BEGIN
    SELECT * INTO v_wbs
      FROM master.project_wbs
     WHERE tenant_id = NEW.tenant_id
       AND project_id = NEW.project_id
       AND id = NEW.project_wbs_id;
    IF FOUND AND (
        NOT v_wbs.is_postable
        OR v_wbs.wbs_type <> 'work_package'
        OR EXISTS (
            SELECT 1 FROM master.project_wbs c
             WHERE c.tenant_id = v_wbs.tenant_id
               AND c.project_id = v_wbs.project_id
               AND c.parent_wbs_id = v_wbs.id
        )
    ) THEN
        RAISE EXCEPTION 'Project tasks require a postable leaf work-package WBS'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_project_task_requirement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_uom text;
BEGIN
    SELECT uom_code INTO v_uom
      FROM master.project_item
     WHERE tenant_id = NEW.tenant_id
       AND project_id = NEW.project_id
       AND id = NEW.project_item_id;
    IF FOUND AND v_uom <> NEW.uom_code THEN
        RAISE EXCEPTION 'Task requirement UOM must match its project item UOM'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_budget_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_currency character(3);
BEGIN
    SELECT currency_code INTO v_currency
      FROM master.project
     WHERE tenant_id = NEW.tenant_id
       AND company_code_id = NEW.company_code_id
       AND id = NEW.project_id;
    IF FOUND AND v_currency <> NEW.currency_code THEN
        RAISE EXCEPTION 'Budget currency must match the project currency'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.company_code_book_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.company_code_id = NEW.company_code_id
           AND a.book_id = NEW.ledger_book_id
           AND a.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Budget ledger book must be actively assigned to the project company'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_budget_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_profile document.budget_profile%ROWTYPE;
    v_postable boolean;
    v_existing_allocated numeric(18,4);
    v_proposed_allocated numeric(18,4);
BEGIN
    SELECT * INTO v_profile
      FROM document.budget_profile
     WHERE tenant_id = NEW.tenant_id
       AND project_id = NEW.project_id
       AND id = NEW.budget_profile_id
     FOR UPDATE;

    IF FOUND AND NEW.fiscal_year NOT BETWEEN
       v_profile.fiscal_year_from AND v_profile.fiscal_year_to THEN
        RAISE EXCEPTION 'Allocation fiscal year falls outside the budget profile'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT is_postable INTO v_postable
      FROM master.project_wbs
     WHERE tenant_id = NEW.tenant_id
       AND project_id = NEW.project_id
       AND id = NEW.project_wbs_id;
    IF FOUND AND NOT v_postable THEN
        RAISE EXCEPTION 'Budget allocations require a postable WBS'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(sum(a.allocated_amount), 0)
      INTO v_existing_allocated
      FROM document.budget_allocation a
    WHERE a.tenant_id = NEW.tenant_id
       AND a.budget_profile_id = NEW.budget_profile_id
       AND a.status <> 'cancelled'
       AND a.id <> NEW.id;

    v_proposed_allocated := v_existing_allocated;
    IF NEW.status <> 'cancelled' THEN
        v_proposed_allocated := v_proposed_allocated + NEW.allocated_amount;
    END IF;

    IF v_profile.id IS NOT NULL
       AND v_proposed_allocated > v_profile.authorized_amount THEN
        RAISE EXCEPTION 'Active allocations exceed the budget authorized amount'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_planning_scenario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_base document.planning_scenario%ROWTYPE;
BEGIN
    IF NEW.based_on_scenario_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A planning scenario lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_base
          FROM document.planning_scenario
         WHERE tenant_id = NEW.tenant_id
           AND planning_model_id = NEW.planning_model_id
           AND id = NEW.based_on_scenario_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Base planning scenario is outside the model or tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF v_base.status NOT IN ('approved', 'superseded')
           OR v_base.code <> NEW.code
           OR NEW.version_no <> v_base.version_no + 1 THEN
            RAISE EXCEPTION 'Planning scenario replacement requires an approved prior version and sequential version number'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status IN ('approved', 'superseded') AND NOT EXISTS (
        SELECT 1 FROM document.planning_scenario_line AS line
         WHERE line.tenant_id = NEW.tenant_id
           AND line.planning_scenario_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'An approved planning scenario requires at least one line'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_planning_scenario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Submitted planning scenarios cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.planning_model_id IS DISTINCT FROM OLD.planning_model_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.based_on_scenario_id IS DISTINCT FROM OLD.based_on_scenario_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Planning scenario identity, lineage and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status IN ('approved', 'superseded', 'cancelled') AND (
        NEW.name IS DISTINCT FROM OLD.name
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.probability_weight IS DISTINCT FROM OLD.probability_weight
        OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
        OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Approved, superseded and cancelled planning scenarios are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        OLD.status = 'draft' AND NEW.status IN ('in_review', 'cancelled')
        OR OLD.status = 'in_review' AND NEW.status IN ('draft', 'approved', 'cancelled')
        OR OLD.status = 'approved' AND NEW.status = 'superseded'
    ) THEN
        RAISE EXCEPTION 'Invalid planning scenario status transition'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_planning_scenario_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_scenario_id uuid;
    v_status document.planning_scenario_status_d;
BEGIN
    v_scenario_id := CASE WHEN TG_OP = 'DELETE'
                          THEN OLD.planning_scenario_id
                          ELSE NEW.planning_scenario_id END;
    SELECT status INTO v_status
      FROM document.planning_scenario
     WHERE tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
       AND id = v_scenario_id
     FOR UPDATE;
    IF NOT FOUND OR v_status <> 'draft' THEN
        RAISE EXCEPTION 'Planning scenario lines can only change while the scenario is draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.planning_scenario_id IS DISTINCT FROM OLD.planning_scenario_id
        OR NEW.planning_model_id IS DISTINCT FROM OLD.planning_model_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Planning scenario line ownership and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION document.planning_scenario_input_hash(
    p_tenant_id uuid,
    p_planning_scenario_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, document, public
AS $$
    SELECT encode(
        digest(
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'line_no', line.line_no,
                        'planning_driver_id', line.planning_driver_id,
                        'gl_account_id', line.gl_account_id,
                        'cost_center_id', line.cost_center_id,
                        'profit_center_id', line.profit_center_id,
                        'project_id', line.project_id,
                        'project_wbs_id', line.project_wbs_id,
                        'fiscal_year', line.fiscal_year,
                        'period_number', line.period_number,
                        'currency_code', line.currency_code,
                        'planned_amount', line.planned_amount,
                        'baseline_amount', line.baseline_amount,
                        'source_type', line.source_type,
                        'source_reference_id', line.source_reference_id,
                        'confidence', line.confidence,
                        'metadata', line.metadata
                    ) ORDER BY line.line_no
                )::text,
                '[]'
            ),
            'sha256'
        ),
        'hex'
    )
      FROM document.planning_scenario_line AS line
     WHERE line.tenant_id = p_tenant_id
       AND line.planning_scenario_id = p_planning_scenario_id
$$;

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

CREATE OR REPLACE FUNCTION document.trg_legal_hold_placement_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.attachment_series_id IS DISTINCT FROM OLD.attachment_series_id
       OR NEW.placed_at IS DISTINCT FROM OLD.placed_at
       OR NEW.placed_by IS DISTINCT FROM OLD.placed_by
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Legal hold placement evidence is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_legal_hold_release_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.released_at IS NOT NULL AND (
        NEW.released_at IS DISTINCT FROM OLD.released_at
        OR NEW.released_by IS DISTINCT FROM OLD.released_by
        OR NEW.release_reason IS DISTINCT FROM OLD.release_reason
    ) THEN
        RAISE EXCEPTION 'Legal hold release evidence is immutable once recorded'
            USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.released_at IS NULL) <> (NEW.released_by IS NULL)
       OR (NEW.released_at IS NULL) <> (NEW.release_reason IS NULL) THEN
        RAISE EXCEPTION 'Legal hold release requires released_at, released_by, and release_reason together'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_legal_hold_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    RAISE EXCEPTION 'Legal hold rows cannot be deleted through the application role; use the release workflow'
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_legal_hold_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    RAISE EXCEPTION 'Legal hold event rows are append-only'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_multipart_upload_part_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    RAISE EXCEPTION 'Multipart upload part rows are append-only; re-upload the part if needed'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_attachment_series_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Attachment series identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.current_attachment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM document.attachment
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.current_attachment_id
    ) THEN
        RAISE EXCEPTION 'current_attachment_id must reference an attachment in the same tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_attachment_derivative_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.attachment_id IS DISTINCT FROM OLD.attachment_id
       OR NEW.derivative_type IS DISTINCT FROM OLD.derivative_type
       OR NEW.rendition_code IS DISTINCT FROM OLD.rendition_code
       OR NEW.source_sha256 IS DISTINCT FROM OLD.source_sha256
       OR NEW.specification_hash IS DISTINCT FROM OLD.specification_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Derivative identity and source evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.fn_business_partner_request_approvers(
    p_tenant_id uuid,
    p_operating_organization_id uuid,
    p_company_code_id uuid,
    p_excluded_principal_id uuid
)
RETURNS TABLE(principal_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, document, authz, master, shared
AS $$
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id()
       OR p_operating_organization_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM master.operating_organization organization WHERE organization.tenant_id=p_tenant_id AND organization.id=p_operating_organization_id)
       OR (p_company_code_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.company_code company WHERE company.tenant_id=p_tenant_id AND company.id=p_company_code_id)) THEN
        RAISE EXCEPTION 'Business Partner approver scope is invalid' USING ERRCODE='insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT DISTINCT member.principal_id
      FROM authz.group_member member
      JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id AND principal.status='active'
      JOIN authz.plane_membership membership ON membership.tenant_id=member.tenant_id AND membership.principal_id=member.principal_id AND membership.status='active' AND membership.effective_from<=now() AND (membership.effective_until IS NULL OR membership.effective_until>now())
      JOIN authz.group_role grant_row ON grant_row.tenant_id=member.tenant_id AND grant_row.group_id=member.group_id AND grant_row.status='active' AND grant_row.effective_from<=now() AND (grant_row.effective_until IS NULL OR grant_row.effective_until>now())
      JOIN authz.role role_row ON role_row.tenant_id=grant_row.tenant_id AND role_row.id=grant_row.role_id AND role_row.status='active'
      JOIN authz.role_permission role_permission ON role_permission.tenant_id=role_row.tenant_id AND role_permission.role_id=role_row.id
      JOIN authz.permission permission ON permission.id=role_permission.permission_id AND permission.canonical_code='neon.relationship.entity_case.decide' AND permission.status='published'
      JOIN authz.scope_target target ON target.tenant_id=grant_row.tenant_id AND target.id=grant_row.scope_target_id AND target.status='active'
     WHERE member.tenant_id=p_tenant_id AND member.status='active' AND member.effective_from<=now() AND (member.effective_until IS NULL OR member.effective_until>now())
       AND member.principal_id IS DISTINCT FROM p_excluded_principal_id
       AND ((target.scope_kind='tenant' AND target.target_id=p_tenant_id) OR (target.scope_kind='operating_organization' AND target.target_id=p_operating_organization_id) OR (p_company_code_id IS NOT NULL AND target.scope_kind='company_code' AND target.target_id=p_company_code_id))
       AND NOT EXISTS (SELECT 1 FROM authz.deny_rule deny WHERE deny.tenant_id=member.tenant_id AND deny.permission_id=permission.id AND deny.status='active' AND deny.effective_from<=now() AND (deny.effective_until IS NULL OR deny.effective_until>now()) AND (deny.subject_kind='tenant' OR (deny.subject_kind='principal' AND deny.principal_id=member.principal_id) OR (deny.subject_kind='group' AND deny.group_id=member.group_id)))
     ORDER BY member.principal_id LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION document.fn_business_partner_request_approvers(uuid, uuid, uuid, uuid) FROM PUBLIC;

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

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_valid_transition boolean := false;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Business Partner requests cannot be deleted; cancel or supersede the request'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft'
           OR NEW.workflow_request_id IS NOT NULL
           OR NEW.materialized_business_partner_id IS NOT NULL
           OR NEW.materialized_supplier_id IS NOT NULL
           OR NEW.materialized_customer_id IS NOT NULL
           OR NEW.materialized_person_id IS NOT NULL
           OR NEW.materialized_employee_id IS NOT NULL
           OR NEW.materialized_employment_id IS NOT NULL
           OR NEW.materialized_work_assignment_id IS NOT NULL
           OR NEW.materialized_principal_id IS NOT NULL
           OR NEW.materialized_supplier_company_profile_id IS NOT NULL
           OR NEW.materialized_customer_company_profile_id IS NOT NULL
           OR NEW.materialized_operating_organization_assignment_id IS NOT NULL
           OR NEW.materialization_snapshot_id IS NOT NULL
           OR NEW.application_idempotency_key IS NOT NULL
           OR NEW.application_fingerprint IS NOT NULL
           OR NEW.submitted_at IS NOT NULL OR NEW.submitted_by IS NOT NULL
           OR NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL
           OR NEW.applied_at IS NOT NULL OR NEW.applied_by IS NOT NULL THEN
            RAISE EXCEPTION 'New Business Partner requests must start as evidence-free drafts'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.request_no IS DISTINCT FROM OLD.request_no
       OR NEW.request_kind IS DISTINCT FROM OLD.request_kind
       OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
       OR NEW.registration_mode IS DISTINCT FROM OLD.registration_mode
       OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id
       OR NEW.applicant_principal_id IS DISTINCT FROM OLD.applicant_principal_id
       OR NEW.represented_party_name IS DISTINCT FROM OLD.represented_party_name
       OR NEW.target_business_partner_id IS DISTINCT FROM OLD.target_business_partner_id
       OR NEW.source_system_code IS DISTINCT FROM OLD.source_system_code
       OR NEW.source_entity_code IS DISTINCT FROM OLD.source_entity_code
       OR NEW.source_entity_id IS DISTINCT FROM OLD.source_entity_id
       OR NEW.source_entity_code_value IS DISTINCT FROM OLD.source_entity_code_value
       OR NEW.source_projection_id IS DISTINCT FROM OLD.source_projection_id
       OR NEW.source_version IS DISTINCT FROM OLD.source_version
       OR NEW.source_payload_hash IS DISTINCT FROM OLD.source_payload_hash
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Business Partner request identity, target, kind, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.workflow_request_id IS NOT NULL
       AND NEW.workflow_request_id IS DISTINCT FROM OLD.workflow_request_id THEN
        RAISE EXCEPTION 'Business Partner request workflow binding is immutable once assigned'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.approved_at IS NOT NULL AND (
        NEW.approved_at IS DISTINCT FROM OLD.approved_at
        OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    ) THEN
        RAISE EXCEPTION 'Business Partner request approval evidence is immutable once recorded'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.applied_at IS NOT NULL AND (
        NEW.applied_at IS DISTINCT FROM OLD.applied_at
        OR NEW.applied_by IS DISTINCT FROM OLD.applied_by
        OR NEW.materialized_business_partner_id IS DISTINCT FROM OLD.materialized_business_partner_id
        OR NEW.materialized_supplier_id IS DISTINCT FROM OLD.materialized_supplier_id
        OR NEW.materialized_customer_id IS DISTINCT FROM OLD.materialized_customer_id
        OR NEW.materialized_person_id IS DISTINCT FROM OLD.materialized_person_id
        OR NEW.materialized_employee_id IS DISTINCT FROM OLD.materialized_employee_id
        OR NEW.materialized_employment_id IS DISTINCT FROM OLD.materialized_employment_id
        OR NEW.materialized_work_assignment_id IS DISTINCT FROM OLD.materialized_work_assignment_id
        OR NEW.materialized_principal_id IS DISTINCT FROM OLD.materialized_principal_id
        OR NEW.materialized_supplier_company_profile_id IS DISTINCT FROM OLD.materialized_supplier_company_profile_id
        OR NEW.materialized_customer_company_profile_id IS DISTINCT FROM OLD.materialized_customer_company_profile_id
        OR NEW.materialized_operating_organization_assignment_id IS DISTINCT FROM OLD.materialized_operating_organization_assignment_id
        OR NEW.materialization_snapshot_id IS DISTINCT FROM OLD.materialization_snapshot_id
        OR NEW.application_idempotency_key IS DISTINCT FROM OLD.application_idempotency_key
        OR NEW.application_fingerprint IS DISTINCT FROM OLD.application_fingerprint
    ) THEN
        RAISE EXCEPTION 'Business Partner request application evidence is immutable once recorded'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status NOT IN ('draft', 'validating', 'validation_failed', 'returned') AND (
        NEW.base_record_version IS DISTINCT FROM OLD.base_record_version
        OR NEW.base_snapshot_id IS DISTINCT FROM OLD.base_snapshot_id
        OR NEW.base_payload_hash IS DISTINCT FROM OLD.base_payload_hash
        OR NEW.requested_role IS DISTINCT FROM OLD.requested_role
        OR NEW.operating_organization_id IS DISTINCT FROM OLD.operating_organization_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id
        OR NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id
        OR NEW.position_id IS DISTINCT FROM OLD.position_id
        OR NEW.payload_schema_code IS DISTINCT FROM OLD.payload_schema_code
        OR NEW.payload_schema_version IS DISTINCT FROM OLD.payload_schema_version
        OR NEW.payload_schema_hash IS DISTINCT FROM OLD.payload_schema_hash
        OR NEW.proposed_payload IS DISTINCT FROM OLD.proposed_payload
        OR NEW.validation_summary IS DISTINCT FROM OLD.validation_summary
        OR NEW.duplicate_summary IS DISTINCT FROM OLD.duplicate_summary
        OR NEW.change_impact IS DISTINCT FROM OLD.change_impact
        OR NEW.decision_fingerprint IS DISTINCT FROM OLD.decision_fingerprint
    ) THEN
        RAISE EXCEPTION 'Submitted Business Partner request review coordinates and payload are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    v_valid_transition := CASE OLD.status
        WHEN 'draft' THEN NEW.status IN ('validating', 'cancelled')
        WHEN 'validating' THEN NEW.status IN ('draft', 'validation_failed', 'pending_approval', 'cancelled')
        WHEN 'validation_failed' THEN NEW.status IN ('draft', 'validating', 'cancelled')
        WHEN 'pending_approval' THEN NEW.status IN ('returned', 'approved', 'rejected', 'cancelled')
        WHEN 'returned' THEN NEW.status IN ('validating', 'cancelled', 'superseded')
        WHEN 'approved' THEN NEW.status = 'applying'
        WHEN 'applying' THEN NEW.status IN ('applied', 'failed')
        WHEN 'failed' THEN NEW.status IN ('applying', 'superseded')
        ELSE false
    END;

    IF NOT v_valid_transition THEN
        RAISE EXCEPTION 'Invalid Business Partner request transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN (
        'pending_approval', 'returned', 'approved', 'rejected',
        'applying', 'applied', 'failed'
    ) AND (
        NEW.submitted_at IS NULL
        OR NEW.submitted_by IS NULL
        OR NEW.workflow_request_id IS NULL
        OR NEW.decision_fingerprint IS NULL
    ) THEN
        RAISE EXCEPTION 'Submitted Business Partner request requires submission, workflow, and fingerprint evidence'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('pending_approval', 'returned', 'approved', 'rejected', 'applying', 'applied', 'failed')
       AND NEW.registration_mode = 'on_behalf'
       AND NEW.representation_evidence_id IS NULL THEN
        RAISE EXCEPTION 'Submitted on-behalf registration requires representation evidence'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('approved', 'applying', 'applied', 'failed')
       AND (NEW.approved_at IS NULL OR NEW.approved_by IS NULL) THEN
        RAISE EXCEPTION 'Approved Business Partner request requires approval evidence'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'applied' AND (
        NEW.applied_at IS NULL
        OR NEW.applied_by IS NULL
        OR NEW.materialized_business_partner_id IS NULL
        OR NEW.materialization_snapshot_id IS NULL
        OR NEW.application_idempotency_key IS NULL
        OR NEW.application_fingerprint IS NULL
        OR NEW.application_result_kind IS NULL
    ) THEN
        RAISE EXCEPTION 'Applied Business Partner request requires application evidence and materialized partner'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_registration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.registration_mode, NEW.invitation_id, NEW.applicant_principal_id, NEW.represented_party_name
    ) IS DISTINCT FROM (
        OLD.registration_mode, OLD.invitation_id, OLD.applicant_principal_id, OLD.represented_party_name
    ) THEN
        RAISE EXCEPTION 'Business Partner registration channel identity is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('draft', 'validating', 'validation_failed', 'returned')
       AND NEW.representation_evidence_id IS DISTINCT FROM OLD.representation_evidence_id THEN
        RAISE EXCEPTION 'Submitted Business Partner representation evidence is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('pending_approval', 'returned', 'approved', 'rejected', 'applying', 'applied', 'failed')
       AND NEW.registration_mode = 'on_behalf' AND NEW.representation_evidence_id IS NULL THEN
        RAISE EXCEPTION 'Submitted on-behalf registration requires representation evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('pending_approval', 'returned', 'approved', 'rejected', 'applying', 'applied', 'failed')
       AND NEW.registration_mode = 'self_service' AND NOT EXISTS (
           SELECT 1 FROM document.business_partner_invitation invitation
           WHERE invitation.tenant_id = NEW.tenant_id AND invitation.id = NEW.invitation_id
             AND invitation.status = 'accepted'
             AND invitation.journey_kind IN ('supplier','customer','candidate')
             AND invitation.requested_role = NEW.requested_role
             AND invitation.business_partner_request_id = NEW.id
             AND invitation.applicant_principal_id = NEW.applicant_principal_id
       ) THEN
        RAISE EXCEPTION 'Submitted self-service registration requires its accepted invitation binding'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_invitation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business Partner invitations cannot be deleted' USING ERRCODE='check_violation'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.invitation_no,NEW.journey_kind,NEW.registration_mode,NEW.requested_role,NEW.scope_kind,NEW.requested_operating_organization_id,NEW.company_code_id,NEW.legal_entity_id,NEW.org_unit_id,NEW.position_id,NEW.intended_party_name,NEW.invitee_email_hash,NEW.idempotency_key,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.invitation_no,OLD.journey_kind,OLD.registration_mode,OLD.requested_role,OLD.scope_kind,OLD.requested_operating_organization_id,OLD.company_code_id,OLD.legal_entity_id,OLD.org_unit_id,OLD.position_id,OLD.intended_party_name,OLD.invitee_email_hash,OLD.idempotency_key,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'Invitation journey, authority, scope, recipient, and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
 IF OLD.status<>'pending' AND NOT (
   OLD.status='accepted' AND NEW.status='accepted'
   AND OLD.applicant_access_revoked_at IS NULL
   AND NEW.applicant_access_revoked_at IS NOT NULL
   AND NEW.applicant_access_revoked_by IS NOT NULL
   AND (to_jsonb(NEW)-ARRAY['applicant_access_revoked_at','applicant_access_revoked_by','row_version','updated_at','updated_by'])
       = (to_jsonb(OLD)-ARRAY['applicant_access_revoked_at','applicant_access_revoked_by','row_version','updated_at','updated_by'])
 ) THEN RAISE EXCEPTION 'Terminal Business Partner invitations are immutable except for one applicant-access revocation' USING ERRCODE='check_violation'; END IF;
 IF NEW.status='accepted' AND NEW.expires_at<=statement_timestamp() THEN RAISE EXCEPTION 'An expired invitation cannot be accepted' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF NEW.status='pending' AND (NEW.token_hash=OLD.token_hash OR NEW.resend_count<>OLD.resend_count+1) AND (NEW.token_hash,NEW.expires_at,NEW.resend_count) IS DISTINCT FROM (OLD.token_hash,OLD.expires_at,OLD.resend_count) THEN RAISE EXCEPTION 'Resend must atomically rotate the token hash' USING ERRCODE='check_violation'; END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Business Partner request evidence cannot be deleted' USING ERRCODE='restrict_violation';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.request_id, NEW.evidence_kind, NEW.attachment_id,
      NEW.snapshot_id, NEW.source_reference, NEW.content_hash, NEW.classification_code,
      NEW.metadata, NEW.created_at, NEW.created_by)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.request_id, OLD.evidence_kind, OLD.attachment_id,
      OLD.snapshot_id, OLD.source_reference, OLD.content_hash, OLD.classification_code,
      OLD.metadata, OLD.created_at, OLD.created_by) THEN
    RAISE EXCEPTION 'Business Partner request evidence identity and payload are immutable' USING ERRCODE='restrict_violation';
  END IF;
  IF OLD.verification_status <> 'pending'
     OR NEW.verification_status NOT IN ('verified','rejected','expired')
     OR NEW.verified_at IS NULL OR NEW.verified_by IS NULL THEN
    RAISE EXCEPTION 'Evidence verification permits one pending-to-terminal transition' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_duplicate_resolution() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_duplicate master.business_partner%ROWTYPE; v_survivor master.business_partner%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Business Partner duplicate resolutions are immutable' USING ERRCODE='restrict_violation'; END IF;
  SELECT * INTO v_duplicate FROM master.business_partner WHERE tenant_id=NEW.tenant_id AND id=NEW.duplicate_business_partner_id FOR UPDATE;
  SELECT * INTO v_survivor FROM master.business_partner WHERE tenant_id=NEW.tenant_id AND id=NEW.surviving_business_partner_id FOR UPDATE;
  IF v_duplicate.id IS NULL OR v_survivor.id IS NULL OR v_duplicate.partner_category<>v_survivor.partner_category OR v_survivor.status='archived' THEN
    RAISE EXCEPTION 'Duplicate resolution requires two same-category partners and an available survivor' USING ERRCODE='check_violation';
  END IF;
  IF v_duplicate.status<>'inactive' THEN RAISE EXCEPTION 'Duplicate must be inactive after dependency review before supersession' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  IF NEW.resolution_kind IN('merge','rekey') AND COALESCE((NEW.dependency_evidence->>'rekeyComplete')::boolean,false)<>true THEN RAISE EXCEPTION 'Merge and re-key require completed dependency evidence' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION document.fn_resolve_business_partner_duplicate(p_tenant_id uuid,p_duplicate_id uuid,p_survivor_id uuid,p_resolution_kind text,p_reason_code text,p_dependency_evidence jsonb,p_rekey_manifest jsonb,p_snapshot_id uuid,p_resolved_by uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,document,master,shared AS $$ DECLARE v_id uuid; BEGIN
  IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id()
     OR p_resolved_by IS DISTINCT FROM master.current_principal_id_soft() THEN
    RAISE EXCEPTION 'Tenant or actor context mismatch' USING ERRCODE='insufficient_privilege';
  END IF;
  INSERT INTO document.business_partner_duplicate_resolution(tenant_id,duplicate_business_partner_id,surviving_business_partner_id,resolution_kind,reason_code,dependency_evidence,rekey_manifest,snapshot_id,resolved_by)
  VALUES(p_tenant_id,p_duplicate_id,p_survivor_id,p_resolution_kind,p_reason_code,p_dependency_evidence,p_rekey_manifest,p_snapshot_id,p_resolved_by) RETURNING id INTO v_id;
  UPDATE master.business_partner SET status='archived',status_changed_at=now(),status_changed_by=p_resolved_by,updated_by=p_resolved_by WHERE tenant_id=p_tenant_id AND id=p_duplicate_id AND status='inactive';
  IF NOT FOUND THEN RAISE EXCEPTION 'Duplicate supersession lost its lifecycle precondition' USING ERRCODE='serialization_failure'; END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_application_result() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$ BEGIN
  IF TG_OP='INSERT' AND num_nonnulls(NEW.application_result_kind,NEW.application_reason_code,NEW.materialized_bank_verification_id)>0 THEN
    RAISE EXCEPTION 'New Business Partner requests cannot contain application results' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='UPDATE' AND OLD.applied_at IS NOT NULL AND
    (NEW.application_result_kind,NEW.application_reason_code,NEW.materialized_bank_verification_id)
      IS DISTINCT FROM (OLD.application_result_kind,OLD.application_reason_code,OLD.materialized_bank_verification_id) THEN
    RAISE EXCEPTION 'Business Partner application result is immutable' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_bank_verification() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business Partner bank verification cannot be deleted' USING ERRCODE='restrict_violation'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.bank_projection_id,NEW.business_partner_id,NEW.supplier_company_profile_id,NEW.company_code_id,NEW.prior_bank_account_link_id,NEW.expected_account_fingerprint,NEW.idempotency_key,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.bank_projection_id,OLD.business_partner_id,OLD.supplier_company_profile_id,OLD.company_code_id,OLD.prior_bank_account_link_id,OLD.expected_account_fingerprint,OLD.idempotency_key,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'Business Partner bank verification coordinates are immutable' USING ERRCODE='check_violation'; END IF;
 IF TG_OP='UPDATE' AND OLD.decision_fingerprint IS NOT NULL AND (NEW.candidate_bank_account_link_id,NEW.verification_method,NEW.verification_evidence,NEW.decision_fingerprint,NEW.verified_at,NEW.verified_by,NEW.rejected_at,NEW.rejected_by,NEW.rejection_reason) IS DISTINCT FROM (OLD.candidate_bank_account_link_id,OLD.verification_method,OLD.verification_evidence,OLD.decision_fingerprint,OLD.verified_at,OLD.verified_by,OLD.rejected_at,OLD.rejected_by,OLD.rejection_reason) THEN RAISE EXCEPTION 'Business Partner bank verification decision evidence is immutable' USING ERRCODE='check_violation'; END IF;
 IF TG_OP='UPDATE' AND OLD.applied_at IS NOT NULL AND (NEW.application_fingerprint,NEW.applied_at,NEW.applied_by) IS DISTINCT FROM (OLD.application_fingerprint,OLD.applied_at,OLD.applied_by) THEN RAISE EXCEPTION 'Business Partner bank application evidence is immutable' USING ERRCODE='check_violation'; END IF;
 IF TG_OP='UPDATE' THEN NEW.row_version:=OLD.row_version+1; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION document.trg_guard_supplier_activation_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Supplier activation readiness evidence is immutable'; END $$;

CREATE OR REPLACE FUNCTION document.trg_reject_external_workforce_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'External workforce historical evidence is append-only'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_external_claim_header()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document, control AS $$
DECLARE
    v_engagement document.worker_engagement%ROWTYPE;
    v_inbox_kind text;
BEGIN
    SELECT * INTO v_engagement
      FROM document.worker_engagement
     WHERE tenant_id = NEW.tenant_id AND id = NEW.worker_engagement_id;
    IF NOT FOUND OR NEW.period_start < v_engagement.start_date OR NEW.period_end >= v_engagement.end_date THEN
        RAISE EXCEPTION 'External claim period must be contained by the worker engagement'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NEW.source_inbox_id IS NOT NULL THEN
        SELECT document_kind INTO v_inbox_kind
          FROM control.mesh_workforce_claim_inbox
         WHERE tenant_id = NEW.tenant_id AND id = NEW.source_inbox_id;
        IF v_inbox_kind IS DISTINCT FROM TG_TABLE_NAME THEN
            RAISE EXCEPTION 'MESH inbox document kind does not match external claim aggregate'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF (NEW.id,NEW.tenant_id,NEW.created_at,NEW.created_by)
           IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.created_at,OLD.created_by) THEN
            RAISE EXCEPTION 'External claim identity and creation evidence are immutable'
                USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status <> 'draft' AND
           (NEW.worker_engagement_id,NEW.period_start,NEW.period_end)
           IS DISTINCT FROM (OLD.worker_engagement_id,OLD.period_start,OLD.period_end) THEN
            RAISE EXCEPTION 'Submitted external claim engagement and period are immutable'
                USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.source_inbox_id IS DISTINCT FROM OLD.source_inbox_id THEN
            RAISE EXCEPTION 'External claim ingress evidence is immutable'
                USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
            (OLD.status = 'draft' AND NEW.status IN ('submitted','cancelled')) OR
            (OLD.status = 'submitted' AND NEW.status IN ('pending_approval','rejected','cancelled')) OR
            (OLD.status = 'pending_approval' AND NEW.status IN ('approved','rejected','cancelled')) OR
            (OLD.status = 'rejected' AND NEW.status IN ('draft','cancelled')) OR
            (OLD.status = 'approved' AND NEW.status = 'reversed')
        ) THEN
            RAISE EXCEPTION 'Invalid external claim status transition from % to %', OLD.status, NEW.status
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        IF OLD.status IN ('approved','reversed','cancelled') AND (
            to_jsonb(NEW) - ARRAY['status','status_changed_at','status_changed_by','row_version','updated_at','updated_by']
        ) IS DISTINCT FROM (
            to_jsonb(OLD) - ARRAY['status','status_changed_at','status_changed_by','row_version','updated_at','updated_by']
        ) THEN
            RAISE EXCEPTION 'Approved or terminal external claim evidence is immutable'
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_external_claim_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
DECLARE
    v_parent_id uuid;
    v_line_date date;
    v_period_start date;
    v_period_end date;
    v_status text;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.line_no IS DISTINCT FROM OLD.line_no OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR (TG_TABLE_NAME='external_time_entry' AND NEW.time_sheet_id IS DISTINCT FROM OLD.time_sheet_id)
        OR (TG_TABLE_NAME='external_expense_item' AND NEW.expense_sheet_id IS DISTINCT FROM OLD.expense_sheet_id)
    ) THEN
        RAISE EXCEPTION 'External claim line identity and parent are immutable'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_TABLE_NAME = 'external_time_entry' THEN
        v_parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.time_sheet_id ELSE NEW.time_sheet_id END;
        v_line_date := CASE WHEN TG_OP = 'DELETE' THEN OLD.work_date ELSE NEW.work_date END;
        SELECT period_start, period_end, status INTO v_period_start, v_period_end, v_status
          FROM document.external_time_sheet
         WHERE tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
           AND id = v_parent_id FOR SHARE;
    ELSE
        v_parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.expense_sheet_id ELSE NEW.expense_sheet_id END;
        v_line_date := CASE WHEN TG_OP = 'DELETE' THEN OLD.expense_date ELSE NEW.expense_date END;
        SELECT period_start, period_end, status INTO v_period_start, v_period_end, v_status
          FROM document.external_expense_sheet
         WHERE tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
           AND id = v_parent_id FOR SHARE;
    END IF;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'External claim line requires an existing parent'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_status NOT IN ('draft','rejected') THEN
        RAISE EXCEPTION 'External claim lines are mutable only while the parent is draft or rejected'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP <> 'DELETE' AND (v_line_date < v_period_start OR v_line_date > v_period_end) THEN
        RAISE EXCEPTION 'External claim line date must fall inside the claim period'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_service_sheet_source_allocation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
DECLARE
    v_line document.service_sheet_line%ROWTYPE;
    v_sheet document.service_sheet%ROWTYPE;
    v_original document.service_sheet_source_allocation%ROWTYPE;
    v_source_status text;
    v_supplier_id uuid;
    v_company_code_id uuid;
    v_commitment_id uuid;
    v_period_start date;
    v_period_end date;
    v_source_amount numeric(18,4);
    v_source_quantity numeric(18,4);
    v_currency_min character(3);
    v_currency_max character(3);
    v_source_net numeric(18,4);
    v_line_net numeric(18,4);
    v_delta numeric(18,4);
    v_source_quantity_net numeric(18,4);
    v_line_quantity_net numeric(18,4);
    v_quantity_delta numeric(18,4);
BEGIN
    SELECT * INTO v_line FROM document.service_sheet_line
     WHERE tenant_id = NEW.tenant_id AND id = NEW.service_sheet_line_id FOR UPDATE;
    SELECT * INTO v_sheet FROM document.service_sheet
     WHERE tenant_id = NEW.tenant_id AND id = v_line.service_sheet_id FOR UPDATE;
    IF v_line.id IS NULL OR v_sheet.id IS NULL OR v_sheet.status NOT IN ('draft','pending_acceptance','rejected') THEN
        RAISE EXCEPTION 'External claim allocation requires a mutable canonical service sheet line'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.external_time_sheet_id IS NOT NULL THEN
        SELECT s.status, e.supplier_id, e.company_code_id, COALESCE(c.commitment_id, w.commitment_id), s.period_start, s.period_end
          INTO v_source_status, v_supplier_id, v_company_code_id, v_commitment_id, v_period_start, v_period_end
          FROM document.external_time_sheet s
          JOIN document.worker_engagement e ON e.tenant_id=s.tenant_id AND e.id=s.worker_engagement_id
          LEFT JOIN document.contingent_work_order c ON c.tenant_id=e.tenant_id AND c.id=e.contingent_work_order_id
          LEFT JOIN document.statement_of_work w ON w.tenant_id=e.tenant_id AND w.id=e.statement_of_work_id
         WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.external_time_sheet_id FOR UPDATE OF s;
        SELECT COALESCE(sum(amount),0), COALESCE(sum(hours),0), min(currency_code), max(currency_code)
          INTO v_source_amount, v_source_quantity, v_currency_min, v_currency_max
          FROM document.external_time_entry WHERE tenant_id=NEW.tenant_id AND time_sheet_id=NEW.external_time_sheet_id;
    ELSIF NEW.external_expense_sheet_id IS NOT NULL THEN
        SELECT s.status, e.supplier_id, e.company_code_id, COALESCE(c.commitment_id, w.commitment_id), s.period_start, s.period_end
          INTO v_source_status, v_supplier_id, v_company_code_id, v_commitment_id, v_period_start, v_period_end
          FROM document.external_expense_sheet s
          JOIN document.worker_engagement e ON e.tenant_id=s.tenant_id AND e.id=s.worker_engagement_id
          LEFT JOIN document.contingent_work_order c ON c.tenant_id=e.tenant_id AND c.id=e.contingent_work_order_id
          LEFT JOIN document.statement_of_work w ON w.tenant_id=e.tenant_id AND w.id=e.statement_of_work_id
         WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.external_expense_sheet_id FOR UPDATE OF s;
        SELECT COALESCE(sum(amount),0), NULL::numeric, min(currency_code), max(currency_code)
          INTO v_source_amount, v_source_quantity, v_currency_min, v_currency_max
          FROM document.external_expense_item WHERE tenant_id=NEW.tenant_id AND expense_sheet_id=NEW.external_expense_sheet_id;
    ELSE
        SELECT i.status, w.supplier_id, w.company_code_id, w.commitment_id, r.start_date, r.end_date,
               i.amount, i.quantity, r.currency_code, r.currency_code
          INTO v_source_status, v_supplier_id, v_company_code_id, v_commitment_id, v_period_start, v_period_end,
               v_source_amount, v_source_quantity, v_currency_min, v_currency_max
          FROM document.statement_of_work_item i
          JOIN document.statement_of_work_revision r ON r.tenant_id=i.tenant_id AND r.id=i.statement_of_work_revision_id
          JOIN document.statement_of_work w ON w.tenant_id=r.tenant_id AND w.id=r.statement_of_work_id
         WHERE i.tenant_id=NEW.tenant_id AND i.id=NEW.statement_of_work_item_id FOR UPDATE OF i;
    END IF;

    IF v_source_status IS NULL OR (NEW.allocation_kind='acceptance' AND v_source_status NOT IN ('approved','accepted')) THEN
        RAISE EXCEPTION 'Only approved external claims or accepted SOW items may be allocated'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF v_supplier_id IS DISTINCT FROM v_sheet.supplier_id
       OR v_company_code_id IS DISTINCT FROM v_sheet.company_code_id
       OR v_commitment_id IS DISTINCT FROM v_sheet.commitment_id
       OR v_currency_min IS DISTINCT FROM v_currency_max
       OR v_currency_min IS DISTINCT FROM NEW.currency_code
       OR v_line.currency_code IS DISTINCT FROM NEW.currency_code
       OR v_sheet.currency_code IS DISTINCT FROM NEW.currency_code
       OR v_period_start < v_sheet.service_period_from
       OR v_period_end > v_sheet.service_period_to THEN
        RAISE EXCEPTION 'External claim, commitment, supplier, company, period and currency must match the service sheet'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NEW.allocation_kind = 'reversal' THEN
        SELECT * INTO v_original FROM document.service_sheet_source_allocation
         WHERE tenant_id=NEW.tenant_id AND id=NEW.reverses_allocation_id FOR UPDATE;
        IF v_original.id IS NULL OR v_original.allocation_kind <> 'acceptance'
           OR (NEW.service_sheet_line_id,NEW.external_time_sheet_id,NEW.external_expense_sheet_id,NEW.statement_of_work_item_id,NEW.accepted_quantity,NEW.accepted_amount,NEW.currency_code)
              IS DISTINCT FROM
              (v_original.service_sheet_line_id,v_original.external_time_sheet_id,v_original.external_expense_sheet_id,v_original.statement_of_work_item_id,v_original.accepted_quantity,v_original.accepted_amount,v_original.currency_code) THEN
            RAISE EXCEPTION 'Service-sheet allocation reversal must exactly match one original acceptance'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        v_delta := -NEW.accepted_amount;
        v_quantity_delta := -COALESCE(NEW.accepted_quantity, 0);
    ELSE
        v_delta := NEW.accepted_amount;
        v_quantity_delta := COALESCE(NEW.accepted_quantity, 0);
    END IF;

    SELECT COALESCE(sum(CASE WHEN allocation_kind='acceptance' THEN accepted_amount ELSE -accepted_amount END),0)
      INTO v_source_net FROM document.service_sheet_source_allocation
     WHERE tenant_id=NEW.tenant_id
       AND external_time_sheet_id IS NOT DISTINCT FROM NEW.external_time_sheet_id
       AND external_expense_sheet_id IS NOT DISTINCT FROM NEW.external_expense_sheet_id
       AND statement_of_work_item_id IS NOT DISTINCT FROM NEW.statement_of_work_item_id;
    SELECT COALESCE(sum(CASE WHEN allocation_kind='acceptance' THEN accepted_amount ELSE -accepted_amount END),0)
      INTO v_line_net FROM document.service_sheet_source_allocation
     WHERE tenant_id=NEW.tenant_id AND service_sheet_line_id=NEW.service_sheet_line_id;
    SELECT COALESCE(sum(CASE WHEN allocation_kind='acceptance' THEN COALESCE(accepted_quantity,0) ELSE -COALESCE(accepted_quantity,0) END),0)
      INTO v_source_quantity_net FROM document.service_sheet_source_allocation
     WHERE tenant_id=NEW.tenant_id
       AND external_time_sheet_id IS NOT DISTINCT FROM NEW.external_time_sheet_id
       AND external_expense_sheet_id IS NOT DISTINCT FROM NEW.external_expense_sheet_id
       AND statement_of_work_item_id IS NOT DISTINCT FROM NEW.statement_of_work_item_id;
    SELECT COALESCE(sum(CASE WHEN allocation_kind='acceptance' THEN COALESCE(accepted_quantity,0) ELSE -COALESCE(accepted_quantity,0) END),0)
      INTO v_line_quantity_net FROM document.service_sheet_source_allocation
     WHERE tenant_id=NEW.tenant_id AND service_sheet_line_id=NEW.service_sheet_line_id;
    IF v_source_net + v_delta < 0 OR v_source_net + v_delta > v_source_amount
       OR v_line_net + v_delta < 0 OR v_line_net + v_delta > v_line.net_amount THEN
        RAISE EXCEPTION 'Service-sheet allocation would over-accept or over-reverse source or line value'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.accepted_quantity IS NOT NULL AND (
        (v_source_quantity IS NOT NULL AND (v_source_quantity_net + v_quantity_delta < 0 OR v_source_quantity_net + v_quantity_delta > v_source_quantity))
        OR v_line_quantity_net + v_quantity_delta < 0
        OR v_line_quantity_net + v_quantity_delta > v_line.quantity
    ) THEN
        RAISE EXCEPTION 'Service-sheet allocation would over-accept or over-reverse source or line quantity'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_reject_deprecated_external_acceptance_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'Legacy external service-entry path is read-only; use document.service_sheet and service_sheet_source_allocation'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_external_candidate_submission()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM document.workforce_requisition_supplier distribution
        WHERE distribution.tenant_id = NEW.tenant_id
          AND distribution.id = NEW.requisition_supplier_id
          AND distribution.workforce_requisition_id = NEW.workforce_requisition_id
          AND distribution.supplier_id = NEW.supplier_id
          AND distribution.status IN ('distributed','acknowledged')
    ) THEN
        RAISE EXCEPTION 'Candidate submission must use an open distribution for the same requisition and supplier'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_contingent_work_order()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM document.external_candidate_submission submission
        WHERE submission.tenant_id = NEW.tenant_id
          AND submission.id = NEW.candidate_submission_id
          AND submission.supplier_id = NEW.supplier_id
          AND submission.status = 'selected'
    ) THEN
        RAISE EXCEPTION 'Contingent work order requires a selected submission from the same supplier'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_worker_engagement()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document, master AS $$
DECLARE
    v_source_matches boolean;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM master.external_worker worker
        WHERE worker.tenant_id = NEW.tenant_id AND worker.id = NEW.external_worker_id
          AND worker.status IN ('prospect','active')
    ) THEN
        RAISE EXCEPTION 'Worker engagement requires an available external-worker role'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NEW.contingent_work_order_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM document.contingent_work_order work_order
            WHERE work_order.tenant_id = NEW.tenant_id AND work_order.id = NEW.contingent_work_order_id
              AND work_order.supplier_id = NEW.supplier_id
              AND work_order.company_code_id = NEW.company_code_id
              AND work_order.legal_entity_id = NEW.legal_entity_id
              AND work_order.status IN ('pending_supplier_acceptance','active','suspended','completed')
        ) INTO v_source_matches;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM document.statement_of_work sow
            WHERE sow.tenant_id = NEW.tenant_id AND sow.id = NEW.statement_of_work_id
              AND sow.supplier_id = NEW.supplier_id
              AND sow.company_code_id = NEW.company_code_id
              AND sow.legal_entity_id = NEW.legal_entity_id
              AND sow.status IN ('pending_supplier_acceptance','active','suspended','completed')
        ) INTO v_source_matches;
    END IF;
    IF NOT v_source_matches THEN
        RAISE EXCEPTION 'Worker engagement supplier, buyer company, legal entity and source contract must agree'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_worker_engagement_iam_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, event
AS $$
DECLARE
    v_command_execution_id uuid;
BEGIN
    IF NEW.access_status IS NOT DISTINCT FROM OLD.access_status THEN
        RETURN NEW;
    END IF;
    v_command_execution_id := NULLIF(
        current_setting('app.worker_engagement_iam_command_execution_id', true), ''
    )::uuid;
    IF v_command_execution_id IS NULL OR NOT EXISTS (
        SELECT 1
          FROM event.command_execution command
         WHERE command.id = v_command_execution_id
           AND command.tenant_id = NEW.tenant_id
           AND command.command_code = 'workforce.external_worker.iam.project'
           AND command.status = 'processing'
    ) THEN
        RAISE EXCEPTION 'Worker engagement IAM access state is command-owned'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_worker_engagement_lifecycle_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,event AS $$
DECLARE v_execution_id uuid;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW;END IF;
 v_execution_id:=NULLIF(current_setting('app.worker_engagement_lifecycle_command_execution_id',true),'')::uuid;
 IF v_execution_id IS NULL OR NOT EXISTS(SELECT 1 FROM event.command_execution command WHERE command.id=v_execution_id AND command.tenant_id=NEW.tenant_id AND command.actor_principal_id=NULLIF(current_setting('app.current_principal_id',true),'')::uuid AND command.source_service='neon.worker-engagement-lifecycle' AND command.command_code IN('workforce.external_worker.engagement.terminate') AND command.status='processing') THEN
  RAISE EXCEPTION 'Worker engagement lifecycle state is command-owned' USING ERRCODE='insufficient_privilege';
 END IF;RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION document.trg_guard_worker_operational_placement_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,event AS $$
DECLARE v_execution_id uuid;v_tenant_id uuid;
BEGIN
 v_tenant_id:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
 v_execution_id:=NULLIF(current_setting('app.worker_engagement_lifecycle_command_execution_id',true),'')::uuid;
 IF v_execution_id IS NULL OR NOT EXISTS(SELECT 1 FROM event.command_execution command WHERE command.id=v_execution_id AND command.tenant_id=v_tenant_id AND command.actor_principal_id=NULLIF(current_setting('app.current_principal_id',true),'')::uuid AND command.source_service='neon.worker-engagement-lifecycle' AND command.command_code IN('workforce.external_worker.placement.activate','workforce.external_worker.engagement.terminate') AND command.status='processing') THEN
  RAISE EXCEPTION 'Worker operational placement is command-owned' USING ERRCODE='insufficient_privilege';
 END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION document.command_worker_engagement_iam_projection(
    p_tenant_id uuid,
    p_worker_engagement_id uuid,
    p_expected_version bigint,
    p_idempotency_key text,
    p_actor_id uuid,
    p_correlation_id uuid DEFAULT NULL
) RETURNS TABLE(
    worker_engagement_id uuid,
    desired_status text,
    desired_version bigint,
    desired_hash text,
    outbox_id uuid,
    replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, document, master, event, shared
AS $$
DECLARE
    v_fingerprint text;
    v_existing event.command_execution%ROWTYPE;
    v_engagement_status text;
    v_engagement_version bigint;
    v_onboarding_status text;
    v_readiness_evidence jsonb;
    v_legal_entity_id uuid;
    v_person_id uuid;
    v_person_status text;
    v_worker_status text;
    v_identifier text;
    v_display_name text;
    v_desired_status text;
    v_access_status text;
    v_desired_version bigint;
    v_desired_hash text;
    v_outbox_id uuid;
    v_execution_id uuid;
    v_payload jsonb;
BEGIN
    IF current_setting('app.database_plane', true) IS DISTINCT FROM 'neon'
       OR NULLIF(current_setting('app.current_tenant_id', true), '')::uuid IS DISTINCT FROM p_tenant_id
       OR NULLIF(current_setting('app.current_principal_id', true), '')::uuid IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'Worker engagement IAM command context does not match plane, tenant and actor'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_expected_version < 1
       OR btrim(p_idempotency_key) <> p_idempotency_key
       OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
        RAISE EXCEPTION 'Invalid worker engagement IAM command'
            USING ERRCODE = 'check_violation';
    END IF;

    v_fingerprint := encode(public.digest(convert_to(jsonb_build_object(
        'tenantId', p_tenant_id,
        'workerEngagementId', p_worker_engagement_id,
        'expectedVersion', p_expected_version,
        'idempotencyKey', p_idempotency_key,
        'actorId', p_actor_id
    )::text, 'UTF8'), 'sha256'), 'hex');

    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text || ':external-worker-iam:' || p_idempotency_key, 0
    ));
    SELECT command.* INTO v_existing
      FROM event.command_execution command
     WHERE command.tenant_id = p_tenant_id
       AND command.command_code = 'workforce.external_worker.iam.project'
       AND command.idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN
            RAISE EXCEPTION 'Worker engagement IAM idempotency key was reused for another command'
                USING ERRCODE = 'unique_violation';
        END IF;
        IF v_existing.status <> 'succeeded' THEN
            RAISE EXCEPTION 'Prior worker engagement IAM command is not replayable in status %', v_existing.status
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN QUERY SELECT
            (v_existing.result_payload->>'workerEngagementId')::uuid,
            v_existing.result_payload->>'desiredStatus',
            (v_existing.result_payload->>'desiredVersion')::bigint,
            v_existing.result_payload->>'desiredHash',
            (v_existing.result_payload->>'outboxId')::uuid,
            true;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text || ':worker-engagement:' || p_worker_engagement_id::text, 0
    ));
    SELECT engagement.status::text, engagement.row_version,
           engagement.onboarding_status, engagement.readiness_evidence,
           engagement.legal_entity_id,
           worker.person_id, person.status::text, worker.status::text,
           lower(btrim(person.primary_email)),
           COALESCE(NULLIF(btrim(person.display_name), ''),
                    NULLIF(btrim(person.preferred_name), ''),
                    btrim(concat_ws(' ', person.first_name, person.last_name)))
      INTO v_engagement_status, v_engagement_version, v_onboarding_status,
           v_readiness_evidence, v_legal_entity_id,
           v_person_id, v_person_status, v_worker_status,
           v_identifier, v_display_name
      FROM document.worker_engagement engagement
      JOIN master.external_worker worker
        ON worker.tenant_id = engagement.tenant_id
       AND worker.id = engagement.external_worker_id
      JOIN master.person person
        ON person.tenant_id = worker.tenant_id
       AND person.id = worker.person_id
     WHERE engagement.tenant_id = p_tenant_id
       AND engagement.id = p_worker_engagement_id
     FOR UPDATE OF engagement;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Worker engagement was not found in command tenant'
            USING ERRCODE = 'no_data_found';
    END IF;
    IF v_engagement_version <> p_expected_version THEN
        RAISE EXCEPTION 'Worker engagement version is stale'
            USING ERRCODE = 'serialization_failure';
    END IF;
    IF v_engagement_status = 'active' THEN
        IF v_person_status <> 'active' OR v_worker_status <> 'active'
           OR v_identifier IS NULL OR v_identifier = ''
           OR v_onboarding_status <> 'completed'
           OR NOT (v_readiness_evidence @> '{"eligible":true}'::jsonb) THEN
            RAISE EXCEPTION 'Active worker engagement is not eligible for IAM provisioning'
                USING ERRCODE = 'check_violation';
        END IF;
        v_desired_status := 'active';
        v_access_status := 'requested';
    ELSIF v_engagement_status = 'suspended' THEN
        v_desired_status := 'suspended';
        v_access_status := 'deprovision_requested';
    ELSIF v_engagement_status IN ('completed', 'terminated', 'cancelled', 'closed') THEN
        v_desired_status := 'deprovisioned';
        v_access_status := 'deprovision_requested';
    ELSE
        RAISE EXCEPTION 'Worker engagement lifecycle state % cannot project IAM access', v_engagement_status
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    INSERT INTO event.command_execution(
        tenant_id, command_code, idempotency_key, request_fingerprint, status,
        actor_principal_id, source_service, correlation_id, started_at,
        status_changed_at, status_changed_by, created_by
    ) VALUES (
        p_tenant_id, 'workforce.external_worker.iam.project', p_idempotency_key,
        v_fingerprint, 'processing', p_actor_id, 'neon.worker-engagement-iam',
        p_correlation_id, clock_timestamp(), clock_timestamp(), p_actor_id, p_actor_id
    ) RETURNING id INTO v_execution_id;

    PERFORM set_config('app.worker_engagement_iam_command_execution_id', v_execution_id::text, true);
    UPDATE document.worker_engagement engagement
       SET access_status = v_access_status,
           updated_by = p_actor_id
     WHERE engagement.tenant_id = p_tenant_id
       AND engagement.id = p_worker_engagement_id
       AND engagement.row_version = p_expected_version
    RETURNING engagement.row_version INTO v_desired_version;
    PERFORM set_config('app.worker_engagement_iam_command_execution_id', '', true);
    IF v_desired_version IS NULL THEN
        RAISE EXCEPTION 'Worker engagement version changed during IAM command'
            USING ERRCODE = 'serialization_failure';
    END IF;

    v_payload := jsonb_build_object(
        'schema', 'athyper.trustiam.identity-projection-intent/1',
        'sourcePlane', 'neon',
        'sourceTenantId', p_tenant_id,
        'authorityTenantId', p_tenant_id,
        'targetTenantId', p_tenant_id,
        'personId', v_person_id,
        'identifier', v_identifier,
        'displayName', v_display_name,
        'realmKey', 'neon',
        'organizationId', v_legal_entity_id,
        'relationship', 'external_worker',
        'sourceRef', 'worker_engagement:' || p_worker_engagement_id::text,
        'commandExecutionId', v_execution_id,
        'desiredVersion', v_desired_version,
        'desiredStatus', v_desired_status,
        'applications', jsonb_build_array(jsonb_build_object(
            'plane', 'neon',
            'targetTenantId', p_tenant_id,
            'roles', jsonb_build_array(jsonb_build_object(
                'roleCode', 'workforce.external_worker',
                'scopeKind', 'legal_entity',
                'scopeTargetId', v_legal_entity_id
            ))
        ))
    );
    v_desired_hash := encode(public.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');
    v_payload := v_payload || jsonb_build_object('desiredHash', v_desired_hash);

    INSERT INTO event.outbox(
        tenant_id, topic, event_type, event_key, entity_type, entity_id,
        aggregate_type, aggregate_id, event_version, actor_id, source,
        correlation_id, partition_key, payload, created_by
    ) VALUES (
        p_tenant_id, 'neon-workforce-iam',
        'workforce.external_worker.identity_projection.requested',
        'external-worker-iam:' || p_worker_engagement_id::text || ':v' || v_desired_version::text,
        'worker_engagement', p_worker_engagement_id,
        'worker_engagement', p_worker_engagement_id,
        LEAST(v_desired_version, 2147483647)::integer, p_actor_id,
        'neon.worker-engagement-iam', p_correlation_id, p_tenant_id::text,
        v_payload, p_actor_id
    ) RETURNING id INTO v_outbox_id;

    UPDATE event.command_execution
       SET status = 'succeeded',
           result_payload = jsonb_build_object(
               'workerEngagementId', p_worker_engagement_id,
               'desiredStatus', v_desired_status,
               'desiredVersion', v_desired_version,
               'desiredHash', v_desired_hash,
               'outboxId', v_outbox_id
           ),
           completed_at = clock_timestamp(),
           status_changed_at = clock_timestamp(),
           status_changed_by = p_actor_id,
           updated_by = p_actor_id
     WHERE id = v_execution_id AND status = 'processing';

    RETURN QUERY SELECT p_worker_engagement_id, v_desired_status,
                        v_desired_version, v_desired_hash, v_outbox_id, false;
END;
$$;

-- R7 guarded product entrypoint. The legacy six-argument function remains an
-- internal implementation detail and is not executable by application roles.
CREATE OR REPLACE FUNCTION document.command_worker_engagement_iam_projection(
    p_tenant_id uuid,
    p_worker_engagement_id uuid,
    p_expected_version bigint,
    p_idempotency_key text,
    p_actor_id uuid,
    p_correlation_id uuid,
    p_policy_evidence jsonb
) RETURNS TABLE(
    worker_engagement_id uuid,
    desired_status text,
    desired_version bigint,
    desired_hash text,
    outbox_id uuid,
    replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, document, event, shared
AS $$
DECLARE
    v_policy_evidence jsonb;
    v_existing_policy jsonb;
    v_result record;
BEGIN
    IF p_policy_evidence IS NULL
       OR jsonb_typeof(p_policy_evidence) <> 'object'
       OR p_policy_evidence->>'boundary' <> 'iam_project'
       OR jsonb_typeof(p_policy_evidence->'coordinates') <> 'array'
       OR jsonb_array_length(p_policy_evidence->'coordinates') <> 2
       OR (SELECT count(DISTINCT coordinate->>'decisionId')
             FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate) <> 2
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate WHERE coordinate->>'decisionId'='BP-Q004')
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate WHERE coordinate->>'decisionId'='BP-Q006')
       OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate
            WHERE COALESCE(coordinate->>'version','') !~ '^[1-9][0-9]*$'
               OR COALESCE(coordinate->>'hash','') !~ '^[a-f0-9]{64}$'
               OR COALESCE(coordinate->>'approvalEvidenceId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       ) THEN
        RAISE EXCEPTION 'Worker engagement IAM requires approved BP-Q004 and BP-Q006 evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    v_policy_evidence := jsonb_build_object(
        'boundary', 'iam_project',
        'coordinates', (
            SELECT jsonb_agg(jsonb_build_object(
                'decisionId', coordinate->>'decisionId',
                'version', (coordinate->>'version')::bigint,
                'hash', coordinate->>'hash',
                'approvalEvidenceId', coordinate->>'approvalEvidenceId'
            ) ORDER BY coordinate->>'decisionId')
              FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate
        )
    );
    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text || ':external-worker-iam:' || p_idempotency_key, 0
    ));
    SELECT command.result_payload->'policyEvidence' INTO v_existing_policy
      FROM event.command_execution command
     WHERE command.tenant_id=p_tenant_id
       AND command.command_code='workforce.external_worker.iam.project'
       AND command.idempotency_key=p_idempotency_key;
    IF FOUND AND v_existing_policy IS DISTINCT FROM v_policy_evidence THEN
        RAISE EXCEPTION 'Worker engagement IAM idempotency key was reused with different policy evidence'
            USING ERRCODE = 'unique_violation';
    END IF;
    SELECT * INTO v_result
      FROM document.command_worker_engagement_iam_projection(
        p_tenant_id,p_worker_engagement_id,p_expected_version,p_idempotency_key,
        p_actor_id,p_correlation_id
      );
    IF NOT v_result.replayed THEN
        UPDATE event.command_execution command
           SET result_payload=command.result_payload||jsonb_build_object('policyEvidence',v_policy_evidence),
               updated_by=p_actor_id
         WHERE command.tenant_id=p_tenant_id
           AND command.command_code='workforce.external_worker.iam.project'
           AND command.idempotency_key=p_idempotency_key;
        UPDATE event.outbox outbox
           SET payload=outbox.payload||jsonb_build_object('policyEvidence',v_policy_evidence)
         WHERE outbox.tenant_id=p_tenant_id AND outbox.id=v_result.outbox_id;
    END IF;
    RETURN QUERY SELECT v_result.worker_engagement_id,v_result.desired_status,
                        v_result.desired_version,v_result.desired_hash,
                        v_result.outbox_id,v_result.replayed;
END;
$$;

CREATE OR REPLACE FUNCTION document.normalize_supplier_workforce_policy_evidence(
    p_boundary text,
    p_policy_evidence jsonb
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
    IF p_boundary NOT IN ('placement_change','engagement_end')
       OR p_policy_evidence IS NULL
       OR jsonb_typeof(p_policy_evidence) <> 'object'
       OR p_policy_evidence->>'boundary' <> p_boundary
       OR jsonb_typeof(p_policy_evidence->'coordinates') <> 'array'
       OR jsonb_array_length(p_policy_evidence->'coordinates') <> 2
       OR (SELECT count(DISTINCT coordinate->>'decisionId') FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate) <> 2
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate WHERE coordinate->>'decisionId'='BP-Q004')
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate WHERE coordinate->>'decisionId'='BP-Q006')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate
                   WHERE COALESCE(coordinate->>'version','') !~ '^[1-9][0-9]*$'
                      OR COALESCE(coordinate->>'hash','') !~ '^[a-f0-9]{64}$'
                      OR COALESCE(coordinate->>'approvalEvidenceId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
        RAISE EXCEPTION 'Worker engagement lifecycle command requires approved BP-Q004 and BP-Q006 evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN jsonb_build_object('boundary',p_boundary,'coordinates',(
        SELECT jsonb_agg(jsonb_build_object('decisionId',coordinate->>'decisionId','version',(coordinate->>'version')::bigint,'hash',coordinate->>'hash','approvalEvidenceId',coordinate->>'approvalEvidenceId') ORDER BY coordinate->>'decisionId')
          FROM jsonb_array_elements(p_policy_evidence->'coordinates') coordinate
    ));
END;
$$;

CREATE OR REPLACE FUNCTION document.command_worker_operational_placement_activate(
    p_tenant_id uuid,p_worker_engagement_id uuid,p_expected_version bigint,
    p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid,
    p_effective_from date,p_effective_until date,p_company_code_id uuid,
    p_position_id uuid,p_org_unit_id uuid,p_manager_employee_id uuid,
    p_cost_center_id uuid,p_profit_center_id uuid,p_project_id uuid,p_site_id uuid,
    p_allocation_percent numeric,p_is_primary boolean,p_metadata jsonb,p_policy_evidence jsonb
) RETURNS TABLE(worker_engagement_id uuid,placement_id uuid,engagement_version bigint,outbox_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,document,event,shared
AS $$
DECLARE v_policy jsonb;v_fingerprint text;v_existing event.command_execution%ROWTYPE;v_engagement document.worker_engagement%ROWTYPE;v_placement_id uuid;v_version bigint;v_outbox uuid;v_execution uuid;v_payload jsonb;v_effective_until date;
BEGIN
 IF current_setting('app.database_plane',true) IS DISTINCT FROM 'neon' OR NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Placement command context mismatch' USING ERRCODE='insufficient_privilege';END IF;
 IF p_expected_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 180 OR p_effective_until IS NOT NULL AND p_effective_until<=p_effective_from OR p_allocation_percent<=0 OR p_allocation_percent>100 OR jsonb_typeof(p_metadata)<>'object' THEN RAISE EXCEPTION 'Invalid placement activation command' USING ERRCODE='check_violation';END IF;
 v_policy:=document.normalize_supplier_workforce_policy_evidence('placement_change',p_policy_evidence);
 v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object('engagement',p_worker_engagement_id,'version',p_expected_version,'from',p_effective_from,'until',p_effective_until,'company',p_company_code_id,'position',p_position_id,'orgUnit',p_org_unit_id,'manager',p_manager_employee_id,'costCenter',p_cost_center_id,'profitCenter',p_profit_center_id,'project',p_project_id,'site',p_site_id,'allocation',p_allocation_percent,'primary',p_is_primary,'metadata',p_metadata,'policy',v_policy)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':placement:'||p_idempotency_key,0));
 SELECT * INTO v_existing FROM event.command_execution WHERE tenant_id=p_tenant_id AND command_code='workforce.external_worker.placement.activate' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF v_existing.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'Placement idempotency key reused' USING ERRCODE='unique_violation';END IF;
  IF v_existing.status<>'succeeded' THEN RAISE EXCEPTION 'Prior placement command is not replayable' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  RETURN QUERY SELECT (v_existing.result_payload->>'workerEngagementId')::uuid,(v_existing.result_payload->>'placementId')::uuid,(v_existing.result_payload->>'engagementVersion')::bigint,(v_existing.result_payload->>'outboxId')::uuid,true;RETURN;
 END IF;
 SELECT * INTO v_engagement FROM document.worker_engagement WHERE tenant_id=p_tenant_id AND id=p_worker_engagement_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Worker engagement not found' USING ERRCODE='no_data_found';END IF;
 IF v_engagement.row_version<>p_expected_version THEN RAISE EXCEPTION 'Worker engagement version is stale' USING ERRCODE='serialization_failure';END IF;
 IF v_engagement.status<>'active' OR v_engagement.company_code_id<>p_company_code_id OR p_effective_from<v_engagement.start_date OR p_effective_from>=v_engagement.end_date OR p_effective_until IS NOT NULL AND p_effective_until>v_engagement.end_date THEN RAISE EXCEPTION 'Placement must be within an active engagement and its buyer company/date scope' USING ERRCODE='check_violation';END IF;
 v_effective_until:=COALESCE(p_effective_until,v_engagement.end_date);
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by) VALUES(p_tenant_id,'workforce.external_worker.placement.activate',p_idempotency_key,v_fingerprint,'processing',p_actor_id,'neon.worker-engagement-lifecycle',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO v_execution;
 PERFORM set_config('app.worker_engagement_lifecycle_command_execution_id',v_execution::text,true);
 IF p_is_primary THEN UPDATE document.worker_operational_placement placement SET effective_until=CASE WHEN placement.effective_from<p_effective_from THEN p_effective_from ELSE placement.effective_until END,status='superseded',updated_at=clock_timestamp(),updated_by=p_actor_id WHERE placement.tenant_id=p_tenant_id AND placement.worker_engagement_id=p_worker_engagement_id AND placement.is_primary AND placement.status='active' AND daterange(placement.effective_from,COALESCE(placement.effective_until,'infinity'::date),'[)')&&daterange(p_effective_from,v_effective_until,'[)');END IF;
 INSERT INTO document.worker_operational_placement(tenant_id,worker_engagement_id,position_id,org_unit_id,manager_employee_id,company_code_id,cost_center_id,profit_center_id,project_id,site_id,allocation_percent,effective_from,effective_until,is_primary,metadata,status,created_by) VALUES(p_tenant_id,p_worker_engagement_id,p_position_id,p_org_unit_id,p_manager_employee_id,p_company_code_id,p_cost_center_id,p_profit_center_id,p_project_id,p_site_id,p_allocation_percent,p_effective_from,v_effective_until,p_is_primary,p_metadata,'active',p_actor_id) RETURNING id INTO v_placement_id;
 UPDATE document.worker_engagement SET updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_worker_engagement_id AND row_version=p_expected_version RETURNING row_version INTO v_version;
 PERFORM set_config('app.worker_engagement_lifecycle_command_execution_id','',true);
 v_payload:=jsonb_build_object('workerEngagementId',p_worker_engagement_id,'placementId',v_placement_id,'engagementVersion',v_version,'effectiveFrom',p_effective_from,'effectiveUntil',v_effective_until,'policyEvidence',v_policy,'commandExecutionId',v_execution);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by) VALUES(p_tenant_id,'neon-workforce','workforce.external_worker.placement.activated','worker-placement:'||v_placement_id::text,'worker_operational_placement',v_placement_id,'worker_engagement',p_worker_engagement_id,LEAST(v_version,2147483647)::integer,p_actor_id,'neon.worker-engagement-lifecycle',p_correlation_id,p_tenant_id::text,v_payload,p_actor_id) RETURNING id INTO v_outbox;
 UPDATE event.command_execution SET status='succeeded',result_payload=v_payload||jsonb_build_object('outboxId',v_outbox),completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=v_execution;
 RETURN QUERY SELECT p_worker_engagement_id,v_placement_id,v_version,v_outbox,false;
END;$$;

CREATE OR REPLACE FUNCTION document.command_worker_engagement_terminate(
 p_tenant_id uuid,p_worker_engagement_id uuid,p_expected_version bigint,p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid,p_reason_code text,p_effective_at timestamptz,p_policy_evidence jsonb
) RETURNS TABLE(worker_engagement_id uuid,engagement_version bigint,iam_outbox_id uuid,iam_desired_hash text,outbox_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,document,event,shared AS $$
DECLARE v_policy jsonb;v_iam_policy jsonb;v_fingerprint text;v_existing event.command_execution%ROWTYPE;v_engagement document.worker_engagement%ROWTYPE;v_after_version bigint;v_iam record;v_outbox uuid;v_execution uuid;v_payload jsonb;
BEGIN
 IF current_setting('app.database_plane',true) IS DISTINCT FROM 'neon' OR NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Engagement termination context mismatch' USING ERRCODE='insufficient_privilege';END IF;
 IF p_expected_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 180 OR p_reason_code!~'^[A-Z][A-Z0-9_.-]{1,126}$' OR p_effective_at IS NULL THEN RAISE EXCEPTION 'Invalid engagement termination command' USING ERRCODE='check_violation';END IF;
 v_policy:=document.normalize_supplier_workforce_policy_evidence('engagement_end',p_policy_evidence);v_iam_policy:=jsonb_set(v_policy,'{boundary}','"iam_project"'::jsonb);
 v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object('engagement',p_worker_engagement_id,'version',p_expected_version,'reason',p_reason_code,'effectiveAt',p_effective_at,'policy',v_policy)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':engagement-end:'||p_idempotency_key,0));SELECT * INTO v_existing FROM event.command_execution WHERE tenant_id=p_tenant_id AND command_code='workforce.external_worker.engagement.terminate' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF v_existing.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'Termination idempotency key reused' USING ERRCODE='unique_violation';END IF;IF v_existing.status<>'succeeded' THEN RAISE EXCEPTION 'Prior termination command is not replayable' USING ERRCODE='object_not_in_prerequisite_state';END IF;RETURN QUERY SELECT (v_existing.result_payload->>'workerEngagementId')::uuid,(v_existing.result_payload->>'engagementVersion')::bigint,(v_existing.result_payload->>'iamOutboxId')::uuid,v_existing.result_payload->>'iamDesiredHash',(v_existing.result_payload->>'outboxId')::uuid,true;RETURN;END IF;
 SELECT * INTO v_engagement FROM document.worker_engagement WHERE tenant_id=p_tenant_id AND id=p_worker_engagement_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Worker engagement not found' USING ERRCODE='no_data_found';END IF;IF v_engagement.row_version<>p_expected_version THEN RAISE EXCEPTION 'Worker engagement version is stale' USING ERRCODE='serialization_failure';END IF;IF v_engagement.status NOT IN('active','suspended') THEN RAISE EXCEPTION 'Only active or suspended engagements may be terminated' USING ERRCODE='invalid_parameter_value';END IF;IF p_effective_at>clock_timestamp()+interval '5 minutes' OR p_effective_at<v_engagement.activated_at THEN RAISE EXCEPTION 'Termination effective time must be current and after activation' USING ERRCODE='check_violation';END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by) VALUES(p_tenant_id,'workforce.external_worker.engagement.terminate',p_idempotency_key,v_fingerprint,'processing',p_actor_id,'neon.worker-engagement-lifecycle',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO v_execution;
 PERFORM set_config('app.worker_engagement_lifecycle_command_execution_id',v_execution::text,true);
 UPDATE document.worker_engagement SET status='terminated',status_changed_at=p_effective_at,status_changed_by=p_actor_id,closed_at=p_effective_at,closed_by=p_actor_id,metadata=metadata||jsonb_build_object('terminationReasonCode',p_reason_code),updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_worker_engagement_id AND row_version=p_expected_version RETURNING row_version INTO v_after_version;
 UPDATE document.worker_operational_placement placement SET effective_until=CASE WHEN placement.effective_from<p_effective_at::date THEN LEAST(COALESCE(placement.effective_until,p_effective_at::date),p_effective_at::date) ELSE placement.effective_until END,status='inactive',updated_at=clock_timestamp(),updated_by=p_actor_id WHERE placement.tenant_id=p_tenant_id AND placement.worker_engagement_id=p_worker_engagement_id AND placement.status='active';
 PERFORM set_config('app.worker_engagement_lifecycle_command_execution_id','',true);
 SELECT * INTO v_iam FROM document.command_worker_engagement_iam_projection(p_tenant_id,p_worker_engagement_id,v_after_version,p_idempotency_key||':iam',p_actor_id,p_correlation_id,v_iam_policy);
 v_payload:=jsonb_build_object('workerEngagementId',p_worker_engagement_id,'engagementVersion',v_iam.desired_version,'reasonCode',p_reason_code,'effectiveAt',p_effective_at,'iamOutboxId',v_iam.outbox_id,'iamDesiredHash',v_iam.desired_hash,'policyEvidence',v_policy,'commandExecutionId',v_execution);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by) VALUES(p_tenant_id,'neon-workforce','workforce.external_worker.engagement.terminated','worker-engagement:'||p_worker_engagement_id::text||':v'||v_iam.desired_version::text,'worker_engagement',p_worker_engagement_id,'worker_engagement',p_worker_engagement_id,LEAST(v_iam.desired_version,2147483647)::integer,p_actor_id,'neon.worker-engagement-lifecycle',p_correlation_id,p_tenant_id::text,v_payload,p_actor_id) RETURNING id INTO v_outbox;
 UPDATE event.command_execution SET status='succeeded',result_payload=v_payload||jsonb_build_object('outboxId',v_outbox),completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=v_execution;
 RETURN QUERY SELECT p_worker_engagement_id,v_iam.desired_version,v_iam.outbox_id,v_iam.desired_hash,v_outbox,false;
END;$$;

CREATE OR REPLACE FUNCTION document.trg_guard_external_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Commercial revisions cannot be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('effective','superseded','rejected','cancelled') THEN
        RAISE EXCEPTION 'Terminal commercial revisions are immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status <> 'draft' AND (
        to_jsonb(NEW) - ARRAY['status','supplier_accepted_at','supplier_accepted_by','effective_at']
    ) IS DISTINCT FROM (
        to_jsonb(OLD) - ARRAY['status','supplier_accepted_at','supplier_accepted_by','effective_at']
    ) THEN
        RAISE EXCEPTION 'Approved commercial revision terms and approval evidence are immutable'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_worker_compliance_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Worker compliance evidence cannot be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.decision <> 'pending' THEN
        RAISE EXCEPTION 'Worker compliance decision evidence is immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF (NEW.id,NEW.tenant_id,NEW.worker_engagement_id,NEW.requirement_code,NEW.requirement_version,NEW.category,NEW.required_before,NEW.created_at,NEW.created_by)
       IS DISTINCT FROM
       (OLD.id,OLD.tenant_id,OLD.worker_engagement_id,OLD.requirement_code,OLD.requirement_version,OLD.category,OLD.required_before,OLD.created_at,OLD.created_by) THEN
        RAISE EXCEPTION 'Worker compliance requirement identity is immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION document.command_workforce_iam_projection(
  p_tenant_id uuid,p_projection_id uuid,p_expected_version bigint,
  p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL
) RETURNS TABLE(employment_id uuid,desired_status text,desired_version bigint,desired_hash text,outbox_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,document,master,event,shared
AS $$
DECLARE
  v_fingerprint text;v_existing event.command_execution%ROWTYPE;v_projection document.workforce_iam_projection%ROWTYPE;
  v_employment_id uuid;v_person_id uuid;v_person_status text;v_employee_status text;v_employment_status text;
  v_identifier text;v_display_name text;v_status text;v_hash text;v_outbox uuid;v_execution uuid;v_payload jsonb;
BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon'
     OR NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id
     OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Internal-workforce IAM command context does not match plane, tenant and actor' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_expected_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid internal-workforce IAM command' USING ERRCODE='check_violation';
  END IF;
  v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object('tenantId',p_tenant_id,'projectionId',p_projection_id,'expectedVersion',p_expected_version,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':internal-workforce-iam:'||p_idempotency_key,0));
  SELECT command.* INTO v_existing FROM event.command_execution command WHERE command.tenant_id=p_tenant_id AND command.command_code='workforce.employee.iam.project' AND command.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'Internal-workforce IAM idempotency key was reused for another command' USING ERRCODE='unique_violation'; END IF;
    IF v_existing.status<>'succeeded' THEN RAISE EXCEPTION 'Prior internal-workforce IAM command is not replayable in status %',v_existing.status USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    RETURN QUERY SELECT (v_existing.result_payload->>'employmentId')::uuid,v_existing.result_payload->>'desiredStatus',(v_existing.result_payload->>'desiredVersion')::bigint,v_existing.result_payload->>'desiredHash',(v_existing.result_payload->>'outboxId')::uuid,true;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':workforce-iam-projection:'||p_projection_id::text,0));
  SELECT projection.* INTO v_projection FROM document.workforce_iam_projection projection WHERE projection.tenant_id=p_tenant_id AND projection.id=p_projection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Internal-workforce IAM projection was not found in command tenant' USING ERRCODE='no_data_found'; END IF;
  IF v_projection.row_version<>p_expected_version THEN RAISE EXCEPTION 'Internal-workforce IAM projection version is stale' USING ERRCODE='serialization_failure'; END IF;
  SELECT employment.id,person.id,person.status::text,employee.status::text,employment.employment_status,
         lower(btrim(COALESCE(NULLIF(person.primary_email,''),NULLIF(employee.email,'')))),
         COALESCE(NULLIF(btrim(person.display_name),''),NULLIF(btrim(employee.display_name),''),btrim(concat_ws(' ',person.first_name,person.last_name)))
    INTO v_employment_id,v_person_id,v_person_status,v_employee_status,v_employment_status,v_identifier,v_display_name
    FROM master.employee employee JOIN master.person person ON person.tenant_id=employee.tenant_id AND person.id=employee.person_id
    JOIN master.employment employment ON employment.tenant_id=employee.tenant_id AND employment.employee_id=employee.id AND employment.legal_entity_id=v_projection.employer_organization_id
   WHERE employee.tenant_id=p_tenant_id AND employee.id=v_projection.employee_id
   ORDER BY employment.is_primary DESC,employment.hire_date DESC,employment.id DESC LIMIT 1 FOR UPDATE OF employment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Internal-workforce employment was not found for projection' USING ERRCODE='no_data_found'; END IF;
  IF v_projection.desired_state='member' THEN
    IF NOT v_projection.requested_principal_creation OR v_person_status<>'active' OR v_employee_status<>'active' OR v_employment_status<>'active' OR v_identifier IS NULL OR v_identifier='' THEN
      RAISE EXCEPTION 'Internal workforce is not eligible for IAM provisioning' USING ERRCODE='check_violation';
    END IF;
    v_status:='active';
  ELSIF v_projection.desired_state='suspended' THEN v_status:='suspended';
  ELSE v_status:='deprovisioned'; END IF;
  INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
  VALUES(p_tenant_id,'workforce.employee.iam.project',p_idempotency_key,v_fingerprint,'processing',p_actor_id,'neon.internal-workforce-iam',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO v_execution;
  v_payload:=jsonb_build_object('schema','athyper.trustiam.identity-projection-intent/1','sourcePlane','neon','sourceTenantId',p_tenant_id,'authorityTenantId',p_tenant_id,'targetTenantId',p_tenant_id,'personId',v_person_id,'identifier',v_identifier,'displayName',v_display_name,'realmKey','neon','organizationId',v_projection.employer_organization_id,'relationship','employer','sourceRef','employment:'||v_employment_id::text,'commandExecutionId',v_execution,'desiredVersion',v_projection.row_version,'desiredStatus',v_status,'applications',jsonb_build_array(jsonb_build_object('plane','neon','targetTenantId',p_tenant_id,'roles',jsonb_build_array(jsonb_build_object('roleCode','workforce.employee','scopeKind','legal_entity','scopeTargetId',v_projection.employer_organization_id)))));
  v_hash:=encode(public.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');v_payload:=v_payload||jsonb_build_object('desiredHash',v_hash);
  INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
  VALUES(p_tenant_id,'neon-workforce-iam','workforce.employee.identity_projection.requested','internal-workforce-iam:'||v_employment_id::text||':v'||v_projection.row_version::text,'employment',v_employment_id,'employment',v_employment_id,LEAST(v_projection.row_version,2147483647)::integer,p_actor_id,'neon.internal-workforce-iam',p_correlation_id,p_tenant_id::text,v_payload,p_actor_id) RETURNING id INTO v_outbox;
  UPDATE event.command_execution SET status='succeeded',result_payload=jsonb_build_object('employmentId',v_employment_id,'desiredStatus',v_status,'desiredVersion',v_projection.row_version,'desiredHash',v_hash,'outboxId',v_outbox),completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=v_execution AND status='processing';
  RETURN QUERY SELECT v_employment_id,v_status,v_projection.row_version,v_hash,v_outbox,false;
END $$;

-- Canonical G6 internal-workforce identity intent.  The employment aggregate is
-- the source authority; the retained workforce_iam_projection relation is not
-- consulted or mutated by this command.
CREATE OR REPLACE FUNCTION document.command_internal_workforce_identity_intent(
  p_tenant_id uuid,p_employment_id uuid,p_desired_status text,
  p_create_principal boolean,p_idempotency_key text,p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS TABLE(employment_id uuid,desired_status text,desired_version bigint,
  desired_hash text,outbox_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,document,master,event,shared
AS $$
DECLARE
  v_fingerprint text;v_existing event.command_execution%ROWTYPE;
  v_employment master.employment%ROWTYPE;v_employee master.employee%ROWTYPE;
  v_person master.person%ROWTYPE;v_version bigint;v_hash text;v_outbox uuid;
  v_execution uuid;v_payload jsonb;v_identifier text;
BEGIN
  IF current_setting('app.database_plane',true) IS DISTINCT FROM 'neon'
     OR NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id
     OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Internal-workforce identity intent context does not match plane, tenant and actor' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_desired_status NOT IN('active','suspended','deprovisioned')
     OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid internal-workforce identity intent' USING ERRCODE='check_violation';
  END IF;
  v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
    'tenantId',p_tenant_id,'employmentId',p_employment_id,'desiredStatus',p_desired_status,
    'createPrincipal',p_create_principal,'idempotencyKey',p_idempotency_key,'actorId',p_actor_id
  )::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':internal-workforce-identity:'||p_idempotency_key,0));
  SELECT command.* INTO v_existing FROM event.command_execution command
   WHERE command.tenant_id=p_tenant_id AND command.command_code='workforce.employee.identity.request'
     AND command.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'Internal-workforce identity idempotency key was reused' USING ERRCODE='unique_violation';
    END IF;
    IF v_existing.status<>'succeeded' THEN
      RAISE EXCEPTION 'Prior internal-workforce identity command is not replayable' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    RETURN QUERY SELECT (v_existing.result_payload->>'employmentId')::uuid,
      v_existing.result_payload->>'desiredStatus',(v_existing.result_payload->>'desiredVersion')::bigint,
      v_existing.result_payload->>'desiredHash',(v_existing.result_payload->>'outboxId')::uuid,true;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':internal-workforce-identity:'||p_employment_id::text,0));
  SELECT value.* INTO v_employment FROM master.employment value
   WHERE value.tenant_id=p_tenant_id AND value.id=p_employment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Internal-workforce employment was not found' USING ERRCODE='no_data_found'; END IF;
  SELECT value.* INTO v_employee FROM master.employee value
   WHERE value.tenant_id=p_tenant_id AND value.id=v_employment.employee_id;
  SELECT value.* INTO v_person FROM master.person value
   WHERE value.tenant_id=p_tenant_id AND value.id=v_employment.person_id;
  IF v_employee.id IS NULL OR v_person.id IS NULL THEN
    RAISE EXCEPTION 'Internal-workforce identity authority is incomplete' USING ERRCODE='data_corrupted';
  END IF;
  v_identifier:=lower(btrim(COALESCE(NULLIF(v_person.primary_email,''),NULLIF(v_employee.email,''))));
  IF p_desired_status='active' AND (NOT p_create_principal OR v_person.status<>'active'
     OR v_employee.status<>'active' OR v_employment.employment_status<>'active'
     OR v_identifier IS NULL OR v_identifier='') THEN
    RAISE EXCEPTION 'Internal workforce is not eligible for IAM provisioning' USING ERRCODE='check_violation';
  END IF;
  SELECT COALESCE(max((command.result_payload->>'desiredVersion')::bigint),0)+1 INTO v_version
    FROM event.command_execution command
   WHERE command.tenant_id=p_tenant_id AND command.command_code='workforce.employee.identity.request'
     AND command.status='succeeded' AND command.result_payload->>'employmentId'=p_employment_id::text;
  INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
    actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
  VALUES(p_tenant_id,'workforce.employee.identity.request',p_idempotency_key,v_fingerprint,'processing',
    p_actor_id,'neon.internal-workforce-iam',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id)
  RETURNING id INTO v_execution;
  v_payload:=jsonb_build_object('schema','athyper.trustiam.identity-projection-intent/1','sourcePlane','neon',
    'sourceTenantId',p_tenant_id,'authorityTenantId',p_tenant_id,'targetTenantId',p_tenant_id,
    'personId',v_person.id,'identifier',v_identifier,
    'displayName',COALESCE(NULLIF(btrim(v_person.display_name),''),NULLIF(btrim(v_employee.display_name),''),btrim(concat_ws(' ',v_person.first_name,v_person.last_name))),
    'realmKey','neon','organizationId',v_employment.legal_entity_id,'relationship','employer',
    'sourceRef','employment:'||v_employment.id::text,'commandExecutionId',v_execution,
    'desiredVersion',v_version,'desiredStatus',p_desired_status,
    'applications',jsonb_build_array(jsonb_build_object('plane','neon','targetTenantId',p_tenant_id,
      'roles',CASE WHEN p_desired_status='deprovisioned' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
        'roleCode','workforce.employee','scopeKind','legal_entity','scopeTargetId',v_employment.legal_entity_id)) END)));
  v_hash:=encode(public.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  v_payload:=v_payload||jsonb_build_object('desiredHash',v_hash);
  INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,
    event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
  VALUES(p_tenant_id,'neon-workforce-iam','workforce.employee.identity_projection.requested',
    'internal-workforce-identity:'||v_employment.id::text||':v'||v_version::text,'employment',v_employment.id,
    'employment',v_employment.id,LEAST(v_version,2147483647)::integer,p_actor_id,'neon.internal-workforce-iam',
    p_correlation_id,p_tenant_id::text,v_payload,p_actor_id) RETURNING id INTO v_outbox;
  UPDATE event.command_execution SET status='succeeded',result_payload=jsonb_build_object(
    'employmentId',v_employment.id,'desiredStatus',p_desired_status,'desiredVersion',v_version,
    'desiredHash',v_hash,'outboxId',v_outbox),completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),
    status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=v_execution AND status='processing';
  RETURN QUERY SELECT v_employment.id,p_desired_status,v_version,v_hash,v_outbox,false;
END $$;
-- Case-native Business Partner runtime. This definition supersedes the generic
-- lifecycle function with optional external cycle coordinates for local/API use.
ALTER TABLE document.business_partner_invitation ADD COLUMN IF NOT EXISTS entity_case_id uuid;
ALTER TABLE document.business_partner_invitation_recovery ADD COLUMN IF NOT EXISTS entity_case_id uuid;
ALTER TABLE document.mesh_business_partner_acceptance_event ADD COLUMN IF NOT EXISTS entity_case_id uuid;

ALTER TABLE document.business_partner_invitation DROP CONSTRAINT IF EXISTS business_partner_invitation_lifecycle_chk;
ALTER TABLE document.business_partner_invitation ADD CONSTRAINT business_partner_invitation_lifecycle_chk CHECK(
 (status='pending' AND applicant_principal_id IS NULL AND entity_case_id IS NULL AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NULL)
 OR (status='accepted' AND applicant_principal_id IS NOT NULL AND entity_case_id IS NOT NULL AND accepted_at IS NOT NULL AND cancelled_at IS NULL AND superseded_at IS NULL)
 OR (status='cancelled' AND accepted_at IS NULL AND cancelled_at IS NOT NULL AND superseded_at IS NULL)
 OR (status='expired' AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NULL)
 OR (status='superseded' AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NOT NULL));
ALTER TABLE document.business_partner_invitation DROP CONSTRAINT IF EXISTS business_partner_invitation_entity_case_fk;
ALTER TABLE document.business_partner_invitation ADD CONSTRAINT business_partner_invitation_entity_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.business_partner_invitation_recovery DROP CONSTRAINT IF EXISTS business_partner_invitation_recovery_subject_chk;
ALTER TABLE document.business_partner_invitation_recovery ADD CONSTRAINT business_partner_invitation_recovery_subject_chk CHECK(entity_case_id IS NOT NULL);
ALTER TABLE document.business_partner_invitation_recovery DROP CONSTRAINT IF EXISTS business_partner_invitation_recovery_entity_case_fk;
ALTER TABLE document.business_partner_invitation_recovery ADD CONSTRAINT business_partner_invitation_recovery_entity_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.mesh_business_partner_acceptance_event DROP CONSTRAINT IF EXISTS mesh_business_partner_acceptance_event_kind_chk;
ALTER TABLE document.mesh_business_partner_acceptance_event DROP CONSTRAINT IF EXISTS mesh_business_partner_acceptance_event_request_chk;
ALTER TABLE document.mesh_business_partner_acceptance_event DROP CONSTRAINT IF EXISTS mesh_business_partner_acceptance_event_case_chk;
ALTER TABLE document.mesh_business_partner_acceptance_event ADD CONSTRAINT mesh_business_partner_acceptance_event_kind_chk CHECK(event_kind IN('prepared','case_created'));
ALTER TABLE document.mesh_business_partner_acceptance_event ADD CONSTRAINT mesh_business_partner_acceptance_event_case_chk CHECK((event_kind='prepared' AND entity_case_id IS NULL AND lifecycle_version=1) OR (event_kind='case_created' AND entity_case_id IS NOT NULL AND lifecycle_version=2));
ALTER TABLE document.mesh_business_partner_acceptance_event DROP CONSTRAINT IF EXISTS mesh_business_partner_acceptance_event_case_fk;
ALTER TABLE document.mesh_business_partner_acceptance_event ADD CONSTRAINT mesh_business_partner_acceptance_event_case_fk FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS mesh_business_partner_acceptance_event_case_global_uq ON document.mesh_business_partner_acceptance_event(tenant_id,entity_case_id) WHERE entity_case_id IS NOT NULL;

CREATE OR REPLACE FUNCTION document.fn_entity_case_approvers(p_tenant_id uuid,p_operating_organization_id uuid,p_company_code_id uuid,p_excluded_principal_id uuid)
RETURNS TABLE(principal_id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,authz AS $$
 SELECT DISTINCT member.principal_id FROM authz.group_member member
 JOIN authz.plane_membership membership ON membership.tenant_id=member.tenant_id AND membership.principal_id=member.principal_id AND membership.status='active' AND membership.effective_from<=now() AND (membership.effective_until IS NULL OR membership.effective_until>now())
 JOIN authz.group_role grant_row ON grant_row.tenant_id=member.tenant_id AND grant_row.group_id=member.group_id AND grant_row.status='active' AND grant_row.effective_from<=now() AND (grant_row.effective_until IS NULL OR grant_row.effective_until>now())
 JOIN authz.role role_row ON role_row.tenant_id=grant_row.tenant_id AND role_row.id=grant_row.role_id AND role_row.status='active'
 JOIN authz.role_permission role_permission ON role_permission.tenant_id=role_row.tenant_id AND role_permission.role_id=role_row.id
 JOIN authz.permission permission ON permission.id=role_permission.permission_id AND permission.canonical_code='neon.relationship.entity_case.decide' AND permission.status='published'
 JOIN authz.scope_target target ON target.tenant_id=grant_row.tenant_id AND target.id=grant_row.scope_target_id AND target.status='active'
 WHERE member.tenant_id=p_tenant_id AND member.status='active' AND member.effective_from<=now() AND (member.effective_until IS NULL OR member.effective_until>now()) AND member.principal_id IS DISTINCT FROM p_excluded_principal_id
   AND ((target.scope_kind='tenant' AND target.target_id=p_tenant_id) OR (target.scope_kind='operating_organization' AND target.target_id=p_operating_organization_id) OR (p_company_code_id IS NOT NULL AND target.scope_kind='company_code' AND target.target_id=p_company_code_id));
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_entity_case_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,event AS $$
DECLARE execution uuid:=NULLIF(current_setting('app.entity_case_command_execution_id',true),'')::uuid;tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id);
BEGIN
 IF execution IS NULL OR NOT EXISTS(SELECT 1 FROM event.command_execution e WHERE e.id=execution AND e.tenant_id=tenant AND e.command_code IN('entity.case.draft.write','entity.case.validation','entity.case.lifecycle','entity.case.materialize.internal_business_partner','entity.case.materialize.business_partner_role','entity.case.materialize.business_partner_company','entity.case.materialize.business_partner_change','entity.case.materialize.mesh_profile_change') AND e.status='processing' AND e.actor_principal_id=master.current_principal_id_soft()) THEN RAISE EXCEPTION 'Entity case mutations require the governed command' USING ERRCODE='insufficient_privilege';END IF;RETURN COALESCE(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION document.command_entity_case_validation(
 p_tenant_id uuid,p_case_id uuid,p_expected_version bigint,p_evaluation_id uuid,
 p_ruleset_code text,p_ruleset_release text,p_ruleset_hash text,p_findings jsonb,
 p_validation_summary jsonb,p_duplicate_summary jsonb,p_change_impact jsonb,
 p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,snapshot_id uuid,row_version bigint,status text,replayed boolean,outbox_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,document,snapshot,event,shared,master SET row_security=on AS $$
DECLARE fingerprint text;prior event.command_execution%ROWTYPE;execution uuid;current document.entity_case%ROWTYPE;payload jsonb;next_snapshot uuid;next_version bigint;outbox uuid;result jsonb;item jsonb;ordinal integer:=0;lineage_hash text;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' OR shared.current_tenant_id()<>p_tenant_id OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Entity case validation context mismatch' USING ERRCODE='insufficient_privilege';END IF;
 IF p_expected_version<1 OR jsonb_typeof(p_findings)<>'array' OR jsonb_typeof(p_validation_summary)<>'object' OR jsonb_typeof(p_duplicate_summary)<>'object' OR jsonb_typeof(p_change_impact)<>'object' OR p_ruleset_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Entity case validation arguments are invalid' USING ERRCODE='check_violation';END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'expectedVersion',p_expected_version,'evaluationId',p_evaluation_id,'ruleset',p_ruleset_code,'rulesetHash',p_ruleset_hash,'findings',p_findings,'validationSummary',p_validation_summary,'duplicateSummary',p_duplicate_summary,'changeImpact',p_change_impact,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-validation:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.validation' AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN IF prior.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Entity case validation idempotency conflict' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,(prior.result_payload->>'snapshotId')::uuid,(prior.result_payload->>'rowVersion')::bigint,prior.result_payload->>'status',true,(prior.result_payload->>'outboxId')::uuid;RETURN;END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by) VALUES(p_tenant_id,'entity.case.validation',p_idempotency_key,fingerprint,'processing',p_actor_id,'neon-business-partner',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current FROM document.entity_case c WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Entity case was not found' USING ERRCODE='no_data_found';END IF;
 IF current.row_version<>p_expected_version THEN RAISE EXCEPTION 'Entity case version is stale' USING ERRCODE='serialization_failure';END IF;
 IF current.status<>'draft' THEN RAISE EXCEPTION 'Only a draft entity case can be validated' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current.current_snapshot_id;
 next_version:=current.row_version+1;next_snapshot:=snapshot.fn_capture_entity('document.entity_case',p_case_id,current.case_code,1,current.entity_contract_hash,next_version,'entity.case.validated','version',payload,p_correlation_id,NULL,NULL,NULL,'legal','neon-business-partner');
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'sourceSnapshotId',current.current_snapshot_id,'targetSnapshotId',next_snapshot,'evaluationId',p_evaluation_id,'version',next_version)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,lineage_role,transformation_code,transformation_version,evidence_hash,created_by) VALUES(p_tenant_id,p_case_id,current.current_snapshot_id,next_snapshot,'validated_from','entity.case.validation','1',lineage_hash,p_actor_id);
 FOR item IN SELECT value FROM jsonb_array_elements(p_findings) LOOP
  INSERT INTO document.entity_case_validation(tenant_id,entity_case_id,evaluation_id,ordinal,evaluated_snapshot_id,ruleset_code,ruleset_release,ruleset_hash,finding_code,field_path,severity,message,details,evaluated_by)
  VALUES(p_tenant_id,p_case_id,p_evaluation_id,ordinal,next_snapshot,p_ruleset_code,p_ruleset_release,p_ruleset_hash,item->>'messageCode',NULLIF(item->>'fieldPath',''),item->>'severity',item->>'messageCode',jsonb_build_object('ruleCode',item->>'ruleCode','outcome',item->>'outcome','evidenceReference',COALESCE(item->'evidenceReference','{}'::jsonb),'validationSummary',p_validation_summary,'duplicateSummary',p_duplicate_summary,'changeImpact',p_change_impact),p_actor_id);ordinal:=ordinal+1;
 END LOOP;
 UPDATE document.entity_case SET current_snapshot_id=next_snapshot,row_version=next_version,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_case_id;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,result_code,result_snapshot_id,result_evidence,recorded_by) VALUES(p_tenant_id,p_case_id,'entity.case.validation',p_idempotency_key,fingerprint,p_expected_version,current.row_version,next_version,'draft','draft','accepted',CASE WHEN p_validation_summary->>'outcome'='passed' THEN 'ENTITY_CASE_VALIDATION_PASSED' ELSE 'ENTITY_CASE_VALIDATION_FAILED' END,next_snapshot,jsonb_build_object('evaluationId',p_evaluation_id,'validationSummary',p_validation_summary,'duplicateSummary',p_duplicate_summary,'changeImpact',p_change_impact),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by) VALUES(p_tenant_id,'governed-entity-case','entity.case.validated','entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,'neon-business-partner',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,'snapshotId',next_snapshot,'rowVersion',next_version,'status','draft','evaluationId',p_evaluation_id,'valid',p_validation_summary->>'outcome'='passed'),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'snapshotId',next_snapshot,'rowVersion',next_version,'status','draft','outboxId',outbox);UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,next_snapshot,next_version,'draft',false,outbox;
END $$;

CREATE OR REPLACE FUNCTION document.command_entity_case_lifecycle(
 p_tenant_id uuid,p_case_id uuid,p_action text,p_expected_version bigint,p_cycle_run_id uuid,p_cycle_task_id uuid,p_reason text,p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,snapshot_id uuid,row_version bigint,status text,replayed boolean,outbox_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,document,snapshot,runtime_meta,event,governance,shared,master SET row_security=on AS $$
DECLARE fingerprint text;prior event.command_execution%ROWTYPE;execution uuid;current document.entity_case%ROWTYPE;task governance.cycle_task%ROWTYPE;payload jsonb;next_snapshot uuid;next_version bigint;next_status text;outbox uuid;result jsonb;command_code text;lineage_hash text;
BEGIN
 IF current_database()<>'athyper_'||current_setting('app.database_plane',true) OR shared.current_tenant_id()<>p_tenant_id OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Entity case lifecycle context mismatch' USING ERRCODE='insufficient_privilege';END IF;
 IF p_action NOT IN('submit','approve','reject','return') OR p_expected_version<1 OR (p_cycle_run_id IS NULL)<>(p_cycle_task_id IS NULL) OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 OR (p_action IN('reject','return') AND NULLIF(btrim(p_reason),'') IS NULL) OR length(COALESCE(p_reason,''))>2000 THEN RAISE EXCEPTION 'Entity case lifecycle arguments are invalid' USING ERRCODE='check_violation';END IF;
 command_code:=CASE WHEN p_action='submit' THEN 'entity.case.submit' ELSE 'entity.case.decision' END;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'action',p_action,'expectedVersion',p_expected_version,'cycleRunId',p_cycle_run_id,'cycleTaskId',p_cycle_task_id,'reason',p_reason,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-lifecycle:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.lifecycle' AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN IF prior.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Entity case lifecycle idempotency conflict' USING ERRCODE='unique_violation';END IF;RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,(prior.result_payload->>'snapshotId')::uuid,(prior.result_payload->>'rowVersion')::bigint,prior.result_payload->>'status',true,(prior.result_payload->>'outboxId')::uuid;RETURN;END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by) VALUES(p_tenant_id,'entity.case.lifecycle',p_idempotency_key,fingerprint,'processing',p_actor_id,'governed-entity-case',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current FROM document.entity_case c WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Entity case was not found' USING ERRCODE='no_data_found';END IF;
 IF current.row_version<>p_expected_version THEN RAISE EXCEPTION 'Entity case version is stale' USING ERRCODE='serialization_failure';END IF;
 IF p_cycle_task_id IS NOT NULL THEN SELECT t.* INTO task FROM governance.cycle_task t JOIN governance.cycle_run r ON r.tenant_id=t.tenant_id AND r.id=t.cycle_run_id WHERE t.tenant_id=p_tenant_id AND t.id=p_cycle_task_id AND t.cycle_run_id=p_cycle_run_id FOR UPDATE OF t;IF NOT FOUND THEN RAISE EXCEPTION 'Cycle run and task binding was not found' USING ERRCODE='foreign_key_violation';END IF;END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current.current_snapshot_id;IF NOT FOUND THEN RAISE EXCEPTION 'Current entity case snapshot was not found' USING ERRCODE='data_corrupted';END IF;
 next_version:=current.row_version+1;
 IF p_action='submit' THEN
  IF current.status<>'draft' OR (p_cycle_task_id IS NOT NULL AND task.status NOT IN('pending','ready','in_progress')) THEN RAISE EXCEPTION 'Entity case is not submittable' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  IF NOT EXISTS(SELECT 1 FROM document.entity_case_validation v WHERE v.tenant_id=p_tenant_id AND v.entity_case_id=p_case_id AND v.evaluated_snapshot_id=current.current_snapshot_id AND v.details->'validationSummary'->>'outcome'='passed') THEN RAISE EXCEPTION 'Entity case requires successful validation of the current snapshot' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c WHERE c.tenant_id=p_tenant_id AND c.id=current.entity_contract_id AND c.entity_contract_hash=current.entity_contract_hash AND c.status IN('published','superseded')),payload))>0 THEN RAISE EXCEPTION 'Entity case submission failed pinned contract validation' USING ERRCODE='check_violation';END IF;
  next_status:='submitted';
 ELSE
  IF current.status NOT IN('submitted','in_review') OR p_actor_id=current.created_by OR (p_cycle_task_id IS NOT NULL AND (task.status NOT IN('in_progress','ready') OR (task.owner_principal_id IS NOT NULL AND task.owner_principal_id<>p_actor_id) OR NOT EXISTS(SELECT 1 FROM governance.cycle_subject s WHERE s.tenant_id=p_tenant_id AND s.cycle_run_id=p_cycle_run_id AND s.cycle_task_id=p_cycle_task_id AND s.entity_case_id=p_case_id AND s.is_primary))) THEN RAISE EXCEPTION 'Entity case decision violates maker-checker authority' USING ERRCODE='insufficient_privilege';END IF;
  IF p_action='approve' AND current.operation_code='amend_partner' THEN
   PERFORM 1 FROM document.mesh_profile_change_resolution resolution
    JOIN document.mesh_profile_change_case link ON link.tenant_id=resolution.tenant_id AND link.resolution_id=resolution.id
    JOIN master.business_partner bp ON bp.tenant_id=resolution.tenant_id AND bp.id=resolution.business_partner_id
    JOIN control.mesh_business_partner_profile_projection projection ON projection.tenant_id=resolution.tenant_id AND projection.id=resolution.projection_id
    WHERE link.tenant_id=p_tenant_id AND link.entity_case_id=p_case_id AND bp.status='active'
     AND bp.record_version=resolution.expected_target_version AND projection.projection_status='active' AND projection.current_snapshot_id=resolution.incoming_snapshot_id
    FOR SHARE OF bp,projection;
   IF NOT FOUND THEN RAISE EXCEPTION 'Profile source or target changed before approval' USING ERRCODE='serialization_failure'; END IF;
  END IF;
  next_status:=CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'draft' END;
 END IF;
 next_snapshot:=snapshot.fn_capture_entity('document.entity_case',p_case_id,current.case_code,1,current.entity_contract_hash,next_version,'entity.case.'||p_action,'version',payload,p_correlation_id,NULL,NULL,NULL,'legal','governed-entity-case');
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'sourceSnapshotId',current.current_snapshot_id,'targetSnapshotId',next_snapshot,'action',p_action,'version',next_version)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,lineage_role,transformation_code,transformation_version,evidence_hash,created_by) VALUES(p_tenant_id,p_case_id,current.current_snapshot_id,next_snapshot,CASE WHEN p_action='submit' THEN 'submitted_from' ELSE 'decided_from' END,'entity.case.'||p_action,'1',lineage_hash,p_actor_id);
 IF p_cycle_task_id IS NOT NULL THEN
  IF p_action='submit' THEN INSERT INTO governance.cycle_subject(tenant_id,cycle_run_id,cycle_task_id,subject_role,entity_case_id,is_primary,created_by) VALUES(p_tenant_id,p_cycle_run_id,p_cycle_task_id,'governed_case',p_case_id,true,p_actor_id) ON CONFLICT DO NOTHING;UPDATE governance.cycle_task SET status='in_progress',started_at=COALESCE(started_at,clock_timestamp()),updated_by=p_actor_id,version=version+1 WHERE tenant_id=p_tenant_id AND id=p_cycle_task_id;UPDATE governance.cycle_run run SET status='running',started_at=COALESCE(run.started_at,clock_timestamp()),updated_by=p_actor_id,version=run.version+1 WHERE run.tenant_id=p_tenant_id AND run.id=p_cycle_run_id AND run.status IN('draft','scheduled');
  ELSIF p_action='return' THEN UPDATE governance.cycle_task SET status='ready',started_at=NULL,completed_at=NULL,completion_evidence=jsonb_build_object('caseId',p_case_id,'decision','return','snapshotId',next_snapshot,'reason',p_reason),updated_by=p_actor_id,version=version+1 WHERE tenant_id=p_tenant_id AND id=p_cycle_task_id;
  ELSE UPDATE governance.cycle_task SET status='completed',completed_at=clock_timestamp(),completion_evidence=jsonb_build_object('caseId',p_case_id,'decision',p_action,'snapshotId',next_snapshot,'reason',p_reason),updated_by=p_actor_id,version=version+1 WHERE tenant_id=p_tenant_id AND id=p_cycle_task_id;UPDATE governance.cycle_run SET status='completed',completed_at=clock_timestamp(),updated_by=p_actor_id,version=version+1 WHERE tenant_id=p_tenant_id AND id=p_cycle_run_id;END IF;
 END IF;
 UPDATE document.entity_case SET current_snapshot_id=next_snapshot,submitted_snapshot_id=CASE WHEN p_action='submit' THEN next_snapshot ELSE submitted_snapshot_id END,decision_snapshot_id=CASE WHEN p_action IN('approve','reject') THEN next_snapshot WHEN p_action='return' THEN NULL ELSE decision_snapshot_id END,status=next_status,row_version=next_version,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_case_id;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,result_code,result_snapshot_id,result_evidence,recorded_by) VALUES(p_tenant_id,p_case_id,command_code,p_idempotency_key,fingerprint,p_expected_version,current.row_version,next_version,current.status,next_status,'accepted',CASE p_action WHEN 'submit' THEN 'ENTITY_CASE_SUBMITTED' WHEN 'approve' THEN 'ENTITY_CASE_APPROVED' WHEN 'reject' THEN 'ENTITY_CASE_REJECTED' ELSE 'ENTITY_CASE_RETURNED' END,next_snapshot,jsonb_build_object('cycleRunId',p_cycle_run_id,'cycleTaskId',p_cycle_task_id,'reason',p_reason),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by) VALUES(p_tenant_id,'governed-entity-case','entity.case.'||CASE WHEN p_action='submit' THEN 'submitted' ELSE p_action END,'entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,'governed-entity-case',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,'snapshotId',next_snapshot,'rowVersion',next_version,'status',next_status,'action',p_action,'cycleRunId',p_cycle_run_id,'cycleTaskId',p_cycle_task_id),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'snapshotId',next_snapshot,'rowVersion',next_version,'status',CASE WHEN p_action='return' THEN 'returned' ELSE next_status END,'outboxId',outbox);UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,next_snapshot,next_version,CASE WHEN p_action='return' THEN 'returned' ELSE next_status END,false,outbox;
END $$;

CREATE OR REPLACE FUNCTION document.command_entity_case_attachment(p_tenant_id uuid,p_case_id uuid,p_evidence_kind text,p_attachment_id uuid,p_content_hash text,p_classification_code text,p_actor_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,document,shared,master AS $$
DECLARE current document.entity_case%ROWTYPE;evidence_id uuid:=shared.uuidv7();fingerprint text;
BEGIN
 IF current_database()<>'athyper_neon' OR shared.current_tenant_id()<>p_tenant_id OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Entity case attachment context mismatch' USING ERRCODE='insufficient_privilege';END IF;
 SELECT * INTO current FROM document.entity_case WHERE tenant_id=p_tenant_id AND id=p_case_id AND status='draft';IF NOT FOUND THEN RETURN NULL;END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,'kind',p_evidence_kind,'attachmentId',p_attachment_id,'contentHash',p_content_hash,'classification',p_classification_code)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO document.entity_case_command_evidence(id,tenant_id,entity_case_id,command_code,idempotency_key,request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,result_code,result_snapshot_id,result_evidence,recorded_by) VALUES(evidence_id,p_tenant_id,p_case_id,'entity.case.attachment','attachment:'||fingerprint,fingerprint,current.row_version,current.row_version,current.row_version,current.status,current.status,'accepted','ENTITY_CASE_ATTACHMENT_RECORDED',current.current_snapshot_id,jsonb_build_object('evidenceKind',p_evidence_kind,'attachmentId',p_attachment_id,'contentHash',p_content_hash,'classificationCode',p_classification_code),p_actor_id) ON CONFLICT(tenant_id,entity_case_id,command_code,idempotency_key) DO NOTHING RETURNING id INTO evidence_id;
 IF evidence_id IS NULL THEN SELECT id INTO evidence_id FROM document.entity_case_command_evidence WHERE tenant_id=p_tenant_id AND entity_case_id=p_case_id AND command_code='entity.case.attachment' AND idempotency_key='attachment:'||fingerprint;END IF;
 RETURN evidence_id;
END $$;

REVOKE ALL ON FUNCTION document.fn_entity_case_approvers(uuid,uuid,uuid,uuid),document.command_entity_case_validation(uuid,uuid,bigint,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid),document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid),document.command_entity_case_attachment(uuid,uuid,text,uuid,text,text,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT EXECUTE ON FUNCTION document.fn_entity_case_approvers(uuid,uuid,uuid,uuid),document.command_entity_case_validation(uuid,uuid,bigint,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid),document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid),document.command_entity_case_attachment(uuid,uuid,text,uuid,text,text,uuid) TO athyperapp;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT EXECUTE ON FUNCTION document.fn_entity_case_approvers(uuid,uuid,uuid,uuid),document.command_entity_case_validation(uuid,uuid,bigint,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid),document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid),document.command_entity_case_attachment(uuid,uuid,text,uuid,text,text,uuid) TO athyperadmin;END IF;
END $$;
-- BP-WRK-001: publish one approved requisition to an externally verified set
-- of qualified Supplier/capability coordinates. No candidate, Person,
-- engagement, placement, or IAM authority is created by this command.
CREATE OR REPLACE FUNCTION document.command_publish_workforce_requisition(
    p_tenant_id uuid,
    p_requisition_id uuid,
    p_expected_version bigint,
    p_distributions jsonb,
    p_idempotency_key text,
    p_actor_id uuid
) RETURNS TABLE(requisition_id uuid,status text,row_version bigint,distribution_ids uuid[],outbox_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,document,event,shared
AS $$
DECLARE
    v_requisition document.workforce_requisition%ROWTYPE;
    v_prior event.command_execution%ROWTYPE;
    v_execution_id uuid;
    v_outbox_id uuid;
    v_distribution_ids uuid[] := ARRAY[]::uuid[];
    v_distribution jsonb;
    v_distribution_id uuid;
    v_fingerprint text;
BEGIN
    IF current_database()<>'athyper_neon'
       OR shared.current_tenant_id() IS DISTINCT FROM p_tenant_id
       OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'Workforce requisition publication context mismatch' USING ERRCODE='insufficient_privilege';
    END IF;
    IF p_expected_version<1 OR jsonb_typeof(p_distributions)<>'array'
       OR jsonb_array_length(p_distributions) NOT BETWEEN 1 AND 100
       OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
      RAISE EXCEPTION 'Invalid workforce requisition publication command' USING ERRCODE='check_violation';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_distributions) item
      WHERE jsonb_typeof(item)<>'object'
         OR (SELECT count(*) FROM jsonb_object_keys(item))<>6 + CASE WHEN item?'responseDueAt' THEN 1 ELSE 0 END
         OR NOT(item?'supplierId' AND item?'networkRelationshipId' AND item?'capabilityId' AND item?'qualificationId' AND item?'evidenceHash' AND item?'evaluatedAt')
         OR item->>'evidenceHash' !~ '^[a-f0-9]{64}$'
         OR NULLIF(item->>'evaluatedAt','')::timestamptz IS NULL
         OR (item?'responseDueAt' AND NULLIF(item->>'responseDueAt','')::timestamptz IS NULL)
    ) OR (SELECT count(DISTINCT item->>'supplierId') FROM jsonb_array_elements(p_distributions) item)<>jsonb_array_length(p_distributions) THEN
      RAISE EXCEPTION 'Workforce requisition distributions require distinct, complete eligibility proof' USING ERRCODE='check_violation';
    END IF;
    v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object('tenantId',p_tenant_id,'requisitionId',p_requisition_id,'expectedVersion',p_expected_version,'distributions',p_distributions,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':workforce-requisition-publish:'||p_idempotency_key,0));
    SELECT command.* INTO v_prior FROM event.command_execution command WHERE command.tenant_id=p_tenant_id AND command.command_code='workforce.requisition.publish' AND command.idempotency_key=p_idempotency_key;
    IF FOUND THEN
      IF v_prior.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'Workforce requisition publication idempotency conflict' USING ERRCODE='unique_violation'; END IF;
      RETURN QUERY SELECT (v_prior.result_payload->>'requisitionId')::uuid,v_prior.result_payload->>'status',(v_prior.result_payload->>'rowVersion')::bigint,ARRAY(SELECT jsonb_array_elements_text(v_prior.result_payload->'distributionIds')::uuid),(v_prior.result_payload->>'outboxId')::uuid,true; RETURN;
    END IF;
    SELECT * INTO v_requisition FROM document.workforce_requisition WHERE tenant_id=p_tenant_id AND id=p_requisition_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Workforce requisition not found' USING ERRCODE='no_data_found'; END IF;
    IF v_requisition.row_version<>p_expected_version THEN RAISE EXCEPTION 'Workforce requisition publication version conflict' USING ERRCODE='serialization_failure'; END IF;
    IF v_requisition.status<>'approved' OR v_requisition.approved_at IS NULL THEN RAISE EXCEPTION 'Only an approved workforce requisition can be published' USING ERRCODE='check_violation'; END IF;
    INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,started_at,status_changed_at,status_changed_by,created_by)
    VALUES(p_tenant_id,'workforce.requisition.publish',p_idempotency_key,v_fingerprint,'processing',p_actor_id,'neon-supplier-workforce',clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO v_execution_id;
    FOR v_distribution IN SELECT value FROM jsonb_array_elements(p_distributions) value LOOP
      v_distribution_id:=shared.uuidv7();
      INSERT INTO document.workforce_requisition_supplier(id,tenant_id,workforce_requisition_id,supplier_id,distributed_at,distributed_by,response_due_at,distribution_snapshot,status,created_by)
      VALUES(v_distribution_id,p_tenant_id,p_requisition_id,(v_distribution->>'supplierId')::uuid,clock_timestamp(),p_actor_id,NULLIF(v_distribution->>'responseDueAt','')::timestamptz,jsonb_build_object('networkRelationshipId',v_distribution->>'networkRelationshipId','capabilityId',v_distribution->>'capabilityId','qualificationId',v_distribution->>'qualificationId','eligibilityEvidenceHash',v_distribution->>'evidenceHash','evaluatedAt',v_distribution->>'evaluatedAt'),'distributed',p_actor_id);
      v_distribution_ids:=array_append(v_distribution_ids,v_distribution_id);
    END LOOP;
    UPDATE document.workforce_requisition SET status='released',status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,row_version=row_version+1,updated_at=clock_timestamp(),updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_requisition_id RETURNING * INTO v_requisition;
    INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,partition_key,payload,created_by)
    VALUES(p_tenant_id,'neon-supplier-workforce','workforce.requisition.published','workforce-requisition:'||p_requisition_id::text||':v'||v_requisition.row_version::text,'document.workforce_requisition',p_requisition_id,'workforce_requisition',p_requisition_id,LEAST(v_requisition.row_version,2147483647)::integer,p_actor_id,'neon-supplier-workforce',p_tenant_id::text,jsonb_build_object('requisitionId',p_requisition_id,'rowVersion',v_requisition.row_version,'status','released','distributionCount',cardinality(v_distribution_ids),'commandExecutionId',v_execution_id),p_actor_id) RETURNING id INTO v_outbox_id;
    UPDATE event.command_execution SET status='succeeded',result_payload=jsonb_build_object('requisitionId',p_requisition_id,'status','released','rowVersion',v_requisition.row_version,'expectedVersion',p_expected_version,'supplierTargets',(SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('supplierId',item->>'supplierId','responseDueAt',item->>'responseDueAt')) ORDER BY item->>'supplierId') FROM jsonb_array_elements(p_distributions) item),'distributionIds',to_jsonb(v_distribution_ids),'outboxId',v_outbox_id),completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=v_execution_id;
    RETURN QUERY SELECT p_requisition_id,'released',v_requisition.row_version,v_distribution_ids,v_outbox_id,false;
END $$;

CREATE FUNCTION document.trg_mesh_profile_resolution_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Profile resolution evidence is immutable'
        USING ERRCODE = 'integrity_constraint_violation';
END
$$;
