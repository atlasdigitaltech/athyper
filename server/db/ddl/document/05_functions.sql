-- ============================================================================
-- document/05_functions.sql
-- Functions and procedures reconstructed from the live catalog; pre-constraint routines are excluded.
-- Generated from the live Neon database document schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION document.cleanup_expired_render_outputs(p_tenant_id uuid, p_retention_days integer DEFAULT 90, p_batch_size integer DEFAULT 500)
 RETURNS TABLE(archived_count integer, storage_keys jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'document', 'master', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_count  integer;
    v_keys   jsonb;
BEGIN
    WITH expired AS (
        UPDATE document.render_output
           SET archived_at = now()
         WHERE id IN (
             SELECT id FROM document.render_output
              WHERE tenant_id   = p_tenant_id
                AND archived_at IS NULL
                AND status IN ('DELIVERED', 'REVOKED', 'FAILED')
                AND created_at < now() - make_interval(days => p_retention_days)
             LIMIT p_batch_size
         )
        RETURNING id, storage_bucket, storage_key
    )
    SELECT
        count(*)::integer,
        coalesce(
            jsonb_agg(jsonb_build_object(
                'id',     e.id,
                'bucket', e.storage_bucket,
                'key',    e.storage_key
            )), '[]'::jsonb
        )
    INTO v_count, v_keys
    FROM expired e;

    archived_count := v_count;
    storage_keys   := v_keys;
    RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION "document".cleanup_expired_render_outputs(p_tenant_id uuid, p_retention_days integer, p_batch_size integer) IS 'Batch-archives expired render outputs past retention window. Returns storage_keys for caller to clean up S3. Safe for cron: only touches DELIVERED/REVOKED/FAILED rows.';

CREATE OR REPLACE FUNCTION document.commitment_derive_period()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    SELECT fp.fiscal_year, fp.period_number
      INTO NEW.fiscal_year, NEW.period_number
      FROM master.resolve_fiscal_period(
          NEW.tenant_id,
          NEW.company_code_id,
          NEW.document_date,
          false
      ) fp;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.compute_attachment_lineage(p_tenant_id uuid, p_attachment_id uuid)
 RETURNS TABLE(depth integer, attachment_id uuid, version_no smallint, file_name text, sha256 text, is_current boolean, created_at timestamp with time zone, created_by uuid)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
    WITH RECURSIVE lineage AS (
        SELECT
            0                       AS depth,
            a.id,
            a.version_no,
            a.file_name,
            a.sha256,
            a.is_current,
            a.created_at,
            a.created_by,
            a.parent_attachment_id
        FROM master.attachment a
        WHERE a.id        = p_attachment_id
          AND a.tenant_id = p_tenant_id

        UNION ALL

        SELECT
            l.depth + 1,
            p.id,
            p.version_no,
            p.file_name,
            p.sha256,
            p.is_current,
            p.created_at,
            p.created_by,
            p.parent_attachment_id
        FROM lineage l
        JOIN master.attachment p
          ON  p.id        = l.parent_attachment_id
          AND p.tenant_id = p_tenant_id
        WHERE l.depth < 500  -- safety recursion limit (raised from 50)
    )
    SELECT l.depth, l.id, l.version_no, l.file_name, l.sha256,
           l.is_current, l.created_at, l.created_by
    FROM lineage l
    ORDER BY l.depth DESC;   -- oldest ancestor first
$function$;

COMMENT ON FUNCTION "document".compute_attachment_lineage(p_tenant_id uuid, p_attachment_id uuid) IS 'Recursive walk of parent_attachment_id chain. Returns version lineage oldest-to-current. STABLE PARALLEL SAFE.';

CREATE OR REPLACE FUNCTION document.evaluate_stage_quorum(p_stage_id uuid)
 RETURNS TABLE(is_met boolean, is_rejected boolean, approved_count integer, rejected_count integer, total_count integer, pending_count integer, quorum_detail jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'document', 'event'
AS $function$
DECLARE
    v_stage     document.workflow_stage;
    v_approved  integer;
    v_rejected  integer;
    v_total     integer;
    v_required  integer;
    v_strategy  text;
BEGIN
    SELECT * INTO v_stage FROM document.workflow_stage WHERE id = p_stage_id;
    IF v_stage IS NULL THEN
        RAISE EXCEPTION 'workflow_stage % not found', p_stage_id;
    END IF;

    -- Count work_item outcomes for this stage (exclude watchers and skipped)
    SELECT
        count(*) FILTER (WHERE wi.decision IN ('approve', 'acknowledge') AND wi.status = 'completed'),
        count(*) FILTER (WHERE wi.decision IN ('reject') AND wi.status = 'completed'),
        count(*) FILTER (WHERE wi.status NOT IN ('skipped') AND wi.task_type <> 'watcher')
    INTO v_approved, v_rejected, v_total
    FROM event.work_item wi
    WHERE wi.workflow_stage_id = p_stage_id
      AND wi.tenant_id         = v_stage.tenant_id;

    -- Parse quorum rule (NULL = unanimous)
    IF v_stage.quorum IS NULL
       OR (v_stage.quorum->>'strategy') = 'unanimous'
    THEN
        v_required := v_total;
        v_strategy := 'unanimous';
    ELSIF (v_stage.quorum->>'strategy') = 'percent' THEN
        v_required := ceil(v_total * (v_stage.quorum->>'required')::numeric / 100.0);
        v_strategy := 'percent';
    ELSE
        v_required := (v_stage.quorum->>'required')::integer;
        v_strategy := 'count';
    END IF;

    approved_count := v_approved;
    rejected_count := v_rejected;
    total_count    := v_total;
    pending_count  := v_total - v_approved - v_rejected;
    -- Quorum met when approved >= required
    is_met         := v_approved >= v_required;
    -- Early rejection: remaining possible approvals < required
    is_rejected    := (v_total - v_rejected) < v_required;
    quorum_detail  := jsonb_build_object(
        'strategy',   v_strategy,
        'required',   v_required,
        'approved',   v_approved,
        'rejected',   v_rejected,
        'pending',    v_total - v_approved - v_rejected,
        'is_met',     v_approved >= v_required,
        'is_rejected', (v_total - v_rejected) < v_required
    );
    RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION "document".evaluate_stage_quorum(p_stage_id uuid) IS 'Evaluates quorum for a workflow_stage. Returns is_met (quorum achieved) and is_rejected (quorum mathematically impossible). Supports count, percent, and unanimous strategies. Excludes watcher task_types and skipped work_items from evaluation. is_rejected enables early termination without waiting for all items.';

CREATE OR REPLACE FUNCTION document.fn_ad_status_gated_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    old_parent_status text;
BEGIN
    -- Resolve OLD parent status via OLD's source_doc reference
    IF OLD.source_doc_type = 'purchase_invoice_line' THEN
        SELECT pi.status INTO old_parent_status
          FROM document.purchase_invoice_line pil
          JOIN document.purchase_invoice pi ON pi.id = pil.purchase_invoice_id
         WHERE pil.id = OLD.source_line_id
           AND pil.tenant_id = OLD.tenant_id;
    -- Other source types: pass through (until each source domain wires its own gate)
    ELSE
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Block UPDATE/DELETE only when parent is ALREADY terminal at time of write
    IF old_parent_status IN ('posted','partially_paid','fully_paid','reversed','cancelled') THEN
        RAISE EXCEPTION 'AD_LOCKED_BY_STATUS: parent invoice is %; AD frozen (Stage 4)', old_parent_status
            USING ERRCODE = 'AD003';
    END IF;

    -- For UPDATE: pass NEW; for DELETE: pass OLD
    RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON FUNCTION "document".fn_ad_status_gated_mutation() IS 'BEFORE UPDATE OR DELETE on accounting_distribution: blocks mutations when OLD parent PI status is terminal (posted/partially_paid/fully_paid/reversed/cancelled). Reads OLD (not NEW) parent status — this is critical for Decision #17: the Stage 3 final posting UPDATE succeeds because OLD parent is still ''approved'' at that moment. Posting service must order writes: AD UPDATEs BEFORE pi.status=posted UPDATE.';

CREATE OR REPLACE FUNCTION document.fn_ad_validate_polymorphic_source()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    parent_tenant uuid;
BEGIN
    -- purchase_invoice_line — primary scope, hard-validated
    IF NEW.source_doc_type = 'purchase_invoice_line' THEN
        SELECT pil.tenant_id INTO parent_tenant
          FROM document.purchase_invoice_line pil
         WHERE pil.id = NEW.source_line_id
           AND pil.tenant_id = NEW.tenant_id;

        IF parent_tenant IS NULL THEN
            RAISE EXCEPTION 'AD_SOURCE_NOT_FOUND: source_doc_type=% source_line_id=% tenant=%',
                NEW.source_doc_type, NEW.source_line_id, NEW.tenant_id
                USING ERRCODE = 'AD001';
        END IF;

        -- source_doc_id must point at the parent PI (Athyper convention from
        -- invoice-posting.service.ts): source_doc_id = parent PI.id when
        -- source_doc_type = purchase_invoice_line.
        IF NOT EXISTS (
            SELECT 1 FROM document.purchase_invoice_line pil
             WHERE pil.id = NEW.source_line_id
               AND pil.purchase_invoice_id = NEW.source_doc_id
               AND pil.tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'AD_SOURCE_HEADER_MISMATCH: source_doc_id=% does not own source_line_id=%',
                NEW.source_doc_id, NEW.source_line_id
                USING ERRCODE = 'AD002';
        END IF;

    -- Other source types — soft validation (NOTICE on missing) until wired
    ELSIF NEW.source_doc_type IN (
        'commitment_line','receipt_line',
        'service_sheet_line','purchase_requisition_line'
    ) THEN
        -- Phase 2: tighten per source domain
        NULL;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".fn_ad_validate_polymorphic_source() IS 'BEFORE INSERT/UPDATE OF source_doc_type, source_doc_id, source_line_id on accounting_distribution: validates that the parent row exists in the correct table per source_doc_type, with matching tenant_id, and that source_doc_id (header) owns source_line_id. Hard-validates purchase_invoice_line (primary AP scope); other source types soft-validated pending per-domain wiring.';

CREATE OR REPLACE FUNCTION document.fn_brcl_active_uniqueness()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_conflict_count integer;
BEGIN
    IF NEW.side = 'payment' THEN
        -- HF-3: serialize concurrent inserts for the same (tenant, payment_entry)
        PERFORM pg_advisory_xact_lock(
            hashtextextended(NEW.tenant_id::text || ':pe:' || NEW.payment_entry_id::text, 0)
        );

        SELECT COUNT(*) INTO v_conflict_count
          FROM document.bank_recon_case_line brcl
          JOIN document.bank_recon_case      brc ON brc.id        = brcl.bank_recon_case_id
                                                AND brc.tenant_id = brcl.tenant_id
         WHERE brcl.tenant_id            = NEW.tenant_id
           AND brcl.payment_entry_id     = NEW.payment_entry_id
           AND brcl.bank_recon_case_id  <> NEW.bank_recon_case_id
           AND brc.status               <> 'voided';
        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION
              'BRCL_DUPLICATE_PAYMENT: payment_entry % already attached to an active recon case',
              NEW.payment_entry_id USING ERRCODE = 'AP030';
        END IF;
    ELSIF NEW.side = 'statement' THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended(NEW.tenant_id::text || ':bsl:' || NEW.bank_statement_line_id::text, 0)
        );

        SELECT COUNT(*) INTO v_conflict_count
          FROM document.bank_recon_case_line brcl
          JOIN document.bank_recon_case      brc ON brc.id        = brcl.bank_recon_case_id
                                                AND brc.tenant_id = brcl.tenant_id
         WHERE brcl.tenant_id              = NEW.tenant_id
           AND brcl.bank_statement_line_id = NEW.bank_statement_line_id
           AND brcl.bank_recon_case_id    <> NEW.bank_recon_case_id
           AND brc.status                 <> 'voided';
        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION
              'BRCL_DUPLICATE_STATEMENT: bank_statement_line % already attached to an active recon case',
              NEW.bank_statement_line_id USING ERRCODE = 'AP031';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".fn_brcl_active_uniqueness() IS 'BEFORE INSERT on bank_recon_case_line: serializes concurrent inserts via pg_advisory_xact_lock, then rejects when the same payment_entry or bank_statement_line is already attached to a different active recon case.';

CREATE OR REPLACE FUNCTION document.fn_cl_block_delete_with_active_ad()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    active_count integer;
    sample_ids   uuid[];
BEGIN
    SELECT count(*), array_agg(ad.id ORDER BY ad.id)
      INTO active_count, sample_ids
      FROM (
          SELECT id
            FROM document.accounting_distribution
           WHERE tenant_id       = OLD.tenant_id
             AND source_doc_type = 'commitment_line'
             AND source_line_id  = OLD.id
           LIMIT 10
      ) ad;

    IF active_count > 0 THEN
        RAISE EXCEPTION
          'CL_DELETE_BLOCKED_BY_ACTIVE_AD: cannot delete commitment_line %; % active accounting_distribution row(s) reference it (sample ids: %)',
          OLD.id, active_count, sample_ids
          USING ERRCODE = 'CL011';
    END IF;
    RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION "document".fn_cl_block_delete_with_active_ad() IS 'BEFORE DELETE on document.commitment_line: blocks with CL011 when any accounting_distribution rows reference the row via (source_doc_type, source_line_id). Application layer must delete AD rows first.';

CREATE OR REPLACE FUNCTION document.fn_cl_block_delete_with_active_pc()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    active_count integer;
    sample_ids   uuid[];
BEGIN
    SELECT count(*), array_agg(pc.id ORDER BY pc.id)
      INTO active_count, sample_ids
      FROM (
          SELECT id
            FROM document.pricing_component
           WHERE tenant_id        = OLD.tenant_id
             AND source_doc_type  = 'commitment_line'
             AND source_line_id   = OLD.id
             AND superseded_by_id IS NULL
           LIMIT 10
      ) pc;

    IF active_count > 0 THEN
        RAISE EXCEPTION
          'CL_DELETE_BLOCKED_BY_ACTIVE_PC: cannot delete commitment_line %; % active pricing_component row(s) reference it (sample ids: %)',
          OLD.id, active_count, sample_ids
          USING ERRCODE = 'CL012';
    END IF;
    RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION "document".fn_cl_block_delete_with_active_pc() IS 'BEFORE DELETE on document.commitment_line: blocks with CL012 when active (superseded_by_id IS NULL) pricing_component rows reference the row via (source_doc_type, source_line_id). Application layer must DELETE PC rows first (pc_supersede_pair_chk forbids partial supersede tuple).';

CREATE OR REPLACE FUNCTION document.fn_cl_block_delete_with_active_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    active_count integer;
    sample_ids   uuid[];
BEGIN
    SELECT count(*), array_agg(sl.id ORDER BY sl.id)
      INTO active_count, sample_ids
      FROM (
          SELECT id
            FROM document.schedule_line
           WHERE tenant_id          = OLD.tenant_id
             AND source_doc_type    = 'commitment_line'
             AND source_line_id     = OLD.id
             AND is_current_version = true
             AND terminal_status    IS NULL
           LIMIT 10
      ) sl;

    IF active_count > 0 THEN
        RAISE EXCEPTION
          'CL_DELETE_BLOCKED_BY_ACTIVE_SCHEDULE: cannot delete commitment_line %; % active schedule_line row(s) reference it (sample ids: %)',
          OLD.id, active_count, sample_ids
          USING ERRCODE = 'CL010';
    END IF;
    RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION "document".fn_cl_block_delete_with_active_schedule() IS 'BEFORE DELETE on document.commitment_line: blocks with CL010 when active (is_current_version=true, terminal_status IS NULL) schedule_line rows reference the row via (source_doc_type, source_line_id). Application layer must retire schedules first (see commitment-line-delete.service.ts).';

CREATE OR REPLACE FUNCTION document.fn_imc_rollup_exceptions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_case_id uuid;
    v_tenant  uuid;
BEGIN
    v_case_id := COALESCE(NEW.invoice_match_case_id, OLD.invoice_match_case_id);
    v_tenant  := COALESCE(NEW.tenant_id, OLD.tenant_id);

    -- HF-7: only ACTIVE exceptions count toward has_exceptions / exception_count.
    UPDATE document.invoice_match_case
       SET exception_count = (
            SELECT COUNT(*)::smallint FROM document.match_exception
             WHERE invoice_match_case_id = v_case_id
               AND tenant_id             = v_tenant
               AND status IN ('open','pending_approval')
       ),
           has_exceptions = EXISTS(
              SELECT 1 FROM document.match_exception
               WHERE invoice_match_case_id = v_case_id
                 AND tenant_id             = v_tenant
                 AND status IN ('open','pending_approval')
           ),
           updated_at = now()
     WHERE id        = v_case_id
       AND tenant_id = v_tenant;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON FUNCTION "document".fn_imc_rollup_exceptions() IS 'AFTER INSERT/UPDATE/DELETE on match_exception: recomputes parent invoice_match_case.exception_count and has_exceptions (active exceptions only).';

CREATE OR REPLACE FUNCTION document.fn_payment_amount_reconciliation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_sum_net numeric(18,4);
BEGIN
    SELECT COALESCE(SUM(net_payment_amount), 0)
      INTO v_sum_net
      FROM document.payment_entry_allocation
     WHERE payment_entry_id = NEW.id
       AND tenant_id        = NEW.tenant_id;

    IF abs(NEW.payment_amount - v_sum_net) > 0.01 THEN
        RAISE EXCEPTION
          'PE_AMOUNT_DRIFT: payment_amount=% does not match SUM(net_payment_amount)=% (diff=%) at status=%',
          NEW.payment_amount, v_sum_net, NEW.payment_amount - v_sum_net, NEW.status
          USING ERRCODE = 'AP040';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".fn_payment_amount_reconciliation() IS 'Constraint trigger: asserts payment_amount = SUM(allocation.net_payment_amount) ±0.01 when the payment transitions to any cash-effective state. Uses fn_pe_cash_effective in the WHEN clause of the trigger that attaches it.';

CREATE OR REPLACE FUNCTION document.fn_pc_supersede_only_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    parent_status text;
BEGIN
    -- Resolve parent status (PI only for v1.2)
    IF OLD.source_doc_type = 'purchase_invoice_line' THEN
        IF OLD.source_line_id IS NULL THEN
            SELECT status INTO parent_status FROM document.purchase_invoice
             WHERE id = OLD.source_doc_id AND tenant_id = OLD.tenant_id;
        ELSE
            SELECT pi.status INTO parent_status
              FROM document.purchase_invoice pi
              JOIN document.purchase_invoice_line pil ON pil.purchase_invoice_id = pi.id
             WHERE pil.id = OLD.source_line_id AND pil.tenant_id = OLD.tenant_id;
        END IF;
    ELSE
        -- Other source types: allow free editing until per-domain rules wire in
        RETURN NEW;
    END IF;

    -- Unified lifecycle: editable only while the parent is authorable.
    --
    -- proforma is a pre-draft state used when a PI is created from a PO or
    -- contract before the supplier's tax invoice lands (supplier_invoice_number
    -- and date are deferred; promoted to draft via the promote_proforma flow).
    -- The PC route gates PATCH/DELETE on PC_MUTABLE_STATUSES = {draft, rejected,
    -- proforma}, and the v3.1 PC affordance matrix in
    -- @athyper/api-contracts/pc-affordance-matrix grants proforma canEdit/canDelete
    -- to match. Without proforma in this IN-list the trigger raised
    -- PC_SUPERSEDE_ONLY on every PATCH against a proforma PC, contradicting both
    -- the route and the UI — closed by v3.1 Phase 5b.
    IF parent_status IN ('draft','proforma') THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'PC_LOCKED_BY_PARENT_STATUS: parent invoice is %; request revision/reopen to draft before changing pricing components',
        parent_status
        USING ERRCODE = 'PC003';

    -- Unreachable by design. Older replacement-chain checks were removed from
    -- the active path; child history now lives in log.audit_log and lifecycle
    -- snapshots, not a business-facing PC lifecycle.

    -- Editing not allowed once parent is terminal — only supersede-write permitted
    IF parent_status IN ('posted','partially_paid','fully_paid','reversed','cancelled') THEN
        RAISE EXCEPTION 'PC_LOCKED_BY_STATUS: parent invoice is %; PC is immutable',
            parent_status
            USING ERRCODE = 'PC003';
    END IF;

    -- In approval-stream states: only supersede tuple may change
    -- (allow superseded_by_id, superseded_at, superseded_by_user, row_version, updated_at, updated_by)
    IF (NEW.term_type           IS DISTINCT FROM OLD.term_type)
       OR (NEW.condition_type_id IS DISTINCT FROM OLD.condition_type_id)
       OR (NEW.sequence          IS DISTINCT FROM OLD.sequence)
       OR (NEW.basis             IS DISTINCT FROM OLD.basis)
       OR (NEW.rate_value        IS DISTINCT FROM OLD.rate_value)
       OR (NEW.amount_value      IS DISTINCT FROM OLD.amount_value)
       OR (NEW.entry_level       IS DISTINCT FROM OLD.entry_level)
       OR (NEW.apportion_basis   IS DISTINCT FROM OLD.apportion_basis)
       OR (NEW.origin            IS DISTINCT FROM OLD.origin)
       OR (NEW.tax_group_id      IS DISTINCT FROM OLD.tax_group_id)
       OR (NEW.is_inclusive      IS DISTINCT FROM OLD.is_inclusive)
       OR (NEW.recoverable_pct   IS DISTINCT FROM OLD.recoverable_pct)
       OR (NEW.tax_section_code  IS DISTINCT FROM OLD.tax_section_code)
       OR (NEW.source_doc_type   IS DISTINCT FROM OLD.source_doc_type)
       OR (NEW.source_doc_id     IS DISTINCT FROM OLD.source_doc_id)
       OR (NEW.source_line_id    IS DISTINCT FROM OLD.source_line_id)
    THEN
        RAISE EXCEPTION 'PC_SUPERSEDE_ONLY: parent invoice is %; only supersede tuple may be set',
            parent_status
            USING ERRCODE = 'PC004';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".fn_pc_supersede_only_update() IS 'BEFORE UPDATE on document.pricing_component: while parent invoice is in draft/rejected, free edits allowed; in approval-stream states, only the supersede tuple (superseded_by_id, superseded_at, superseded_by_user) plus row_version/updated_at/updated_by may change; in terminal states, all edits blocked. PC rows are never deleted — superseded ones remain for audit.';

CREATE OR REPLACE FUNCTION document.fn_pc_validate_polymorphic_source()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    parent_tenant uuid;
    parent_header_id uuid;
BEGIN
    -- entry_level vs source_line_id discipline is already in pc_entry_level_scope_chk

    IF NEW.source_doc_type = 'purchase_invoice_line' THEN
        -- header-scope PC (source_line_id IS NULL): source_doc_id must be a purchase_invoice
        IF NEW.source_line_id IS NULL THEN
            SELECT tenant_id INTO parent_tenant
              FROM document.purchase_invoice
             WHERE id = NEW.source_doc_id
               AND tenant_id = NEW.tenant_id;

            IF parent_tenant IS NULL THEN
                RAISE EXCEPTION 'PC_SOURCE_NOT_FOUND: header-scope PC source_doc_id=% does not match a purchase_invoice in tenant %',
                    NEW.source_doc_id, NEW.tenant_id
                    USING ERRCODE = 'PC001';
            END IF;
        -- line-scope PC: source_line_id is a PIL; source_doc_id must be its parent PI
        ELSE
            SELECT pil.tenant_id, pil.purchase_invoice_id
              INTO parent_tenant, parent_header_id
              FROM document.purchase_invoice_line pil
             WHERE pil.id = NEW.source_line_id
               AND pil.tenant_id = NEW.tenant_id;

            IF parent_tenant IS NULL THEN
                RAISE EXCEPTION 'PC_SOURCE_NOT_FOUND: PIL source_line_id=% not found in tenant %',
                    NEW.source_line_id, NEW.tenant_id
                    USING ERRCODE = 'PC001';
            END IF;

            IF parent_header_id <> NEW.source_doc_id THEN
                RAISE EXCEPTION 'PC_SOURCE_HEADER_MISMATCH: source_doc_id=% does not own source_line_id=%',
                    NEW.source_doc_id, NEW.source_line_id
                    USING ERRCODE = 'PC002';
            END IF;
        END IF;

    ELSIF NEW.source_doc_type IN (
        'commitment_line','receipt_line',
        'service_sheet_line','purchase_requisition_line'
    ) THEN
        -- Phase 2 (per-domain wiring): tighten as each source domain adopts PC
        NULL;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".fn_pc_validate_polymorphic_source() IS 'BEFORE INSERT/UPDATE OF source_doc_type, source_doc_id, source_line_id on document.pricing_component: validates that the polymorphic source resolves to an existing parent (PI for header-scope, PIL for line-scope), with matching tenant_id. Hard-validates purchase_invoice_line; other source types soft-validated until per-domain wiring lands.';

CREATE OR REPLACE FUNCTION document.fn_pe_allocations_reserved(p_status text, p_is_voided boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT COALESCE(p_is_voided, false) = false
       AND p_status IN ('pending_approval','approved','posted','transmitted','printed','cleared')
$function$;

COMMENT ON FUNCTION "document".fn_pe_allocations_reserved(p_status text, p_is_voided boolean) IS 'True when this payment_entry''s allocations reserve AP exposure. Covers workflow-stream (pending_approval, approved) plus cash-effective states. Used by over-allocation guards.';

CREATE OR REPLACE FUNCTION document.fn_pe_cash_effective(p_status text, p_is_voided boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT COALESCE(p_is_voided, false) = false
       AND p_status IN ('posted','transmitted','printed','cleared')
$function$;

COMMENT ON FUNCTION "document".fn_pe_cash_effective(p_status text, p_is_voided boolean) IS 'True when this payment_entry has moved cash and JE rows are final. Used by payment_amount reconciliation and cash-out reporting. Stricter than fn_pe_allocations_reserved — excludes pending_approval/approved.';

CREATE OR REPLACE FUNCTION document.fn_pe_status_transition_overalloc_check()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_invoice_id      uuid;
    v_total_allocated numeric(18,4);
    v_invoice_payable numeric(18,4);
BEGIN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;
    -- Only run when transitioning INTO an allocations-reserved state.
    IF document.fn_pe_allocations_reserved(NEW.status, NEW.is_voided) = false THEN
        RETURN NEW;
    END IF;

    FOR v_invoice_id IN
        SELECT DISTINCT purchase_invoice_id
          FROM document.payment_entry_allocation
         WHERE payment_entry_id    = NEW.id
           AND tenant_id           = NEW.tenant_id
           AND purchase_invoice_id IS NOT NULL
    LOOP
        PERFORM 1 FROM document.purchase_invoice
         WHERE id = v_invoice_id AND tenant_id = NEW.tenant_id FOR UPDATE;

        SELECT COALESCE(SUM(pea.allocated_amount), 0) INTO v_total_allocated
          FROM document.payment_entry_allocation pea
          JOIN document.payment_entry            pe ON pe.id        = pea.payment_entry_id
                                                    AND pe.tenant_id = pea.tenant_id
         WHERE pea.purchase_invoice_id = v_invoice_id
           AND pea.tenant_id           = NEW.tenant_id
           AND (
                pe.id = NEW.id   -- this row under its NEW status (post-transition view)
             OR document.fn_pe_allocations_reserved(pe.status, pe.is_voided) = true
           );

        SELECT payable_amount INTO v_invoice_payable
          FROM document.purchase_invoice
         WHERE id = v_invoice_id AND tenant_id = NEW.tenant_id;

        IF v_invoice_payable IS NULL THEN CONTINUE; END IF;

        IF v_total_allocated > v_invoice_payable + 0.01 THEN
            RAISE EXCEPTION
              'AP_OVER_ALLOCATION_ON_TRANSITION: invoice % payable=% allocated_after_transition=% (this PE %→%)',
              v_invoice_id, v_invoice_payable, v_total_allocated, OLD.status, NEW.status
              USING ERRCODE = 'AP021';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".fn_pe_status_transition_overalloc_check() IS 'Constraint trigger: at any payment_entry status change INTO an allocations-reserved state, re-runs the over-allocation check using fn_pe_allocations_reserved as the active-payment predicate. Locks invoice row to serialize concurrent transitions; DEFERRABLE INITIALLY DEFERRED.';

CREATE OR REPLACE FUNCTION document.fn_pea_no_over_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_parent_status   text;
    v_parent_voided   boolean;
    v_total_allocated numeric(18,4);
    v_invoice_payable numeric(18,4);
BEGIN
    -- (HF2-5) Step 1 — ALWAYS check parent PE status before any other logic.
    -- Allocations must be set BEFORE the payment is settlement-effective.
    -- Posting / transmitting / clearing without this check breaks the
    -- invariant payment_amount = SUM(net_payment_amount).
    SELECT status, is_voided INTO v_parent_status, v_parent_voided
      FROM document.payment_entry
     WHERE id = NEW.payment_entry_id AND tenant_id = NEW.tenant_id;

    IF v_parent_status IS NULL THEN
        RAISE EXCEPTION
          'PEA_PARENT_NOT_FOUND: payment_entry % not found in tenant %',
          NEW.payment_entry_id, NEW.tenant_id USING ERRCODE = 'AP019';
    END IF;

    -- A payment in any cash-effective state is locked — no more PEAs.
    -- Workflow-stream states (pending_approval, approved) still allow inserts
    -- so corrections during approval are possible; the status-transition
    -- guard (06y) re-runs the over-allocation check at the transition.
    IF document.fn_pe_cash_effective(v_parent_status, v_parent_voided) THEN
        RAISE EXCEPTION
          'PEA_PARENT_ALREADY_EFFECTIVE: cannot add allocation to payment_entry % (status=%); allocations are locked once the payment moves cash',
          NEW.payment_entry_id, v_parent_status USING ERRCODE = 'AP022';
    END IF;

    -- Step 2 — Invoice-specific over-allocation check (skip for commitment-only)
    IF NEW.purchase_invoice_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Serialize concurrent allocations against the same invoice
    PERFORM 1
       FROM document.purchase_invoice
      WHERE id        = NEW.purchase_invoice_id
        AND tenant_id = NEW.tenant_id
        FOR UPDATE;

    SELECT COALESCE(SUM(pea.allocated_amount), 0)
      INTO v_total_allocated
      FROM document.payment_entry_allocation pea
      JOIN document.payment_entry            pe ON pe.id        = pea.payment_entry_id
                                                AND pe.tenant_id = pea.tenant_id
     WHERE pea.purchase_invoice_id = NEW.purchase_invoice_id
       AND pea.tenant_id           = NEW.tenant_id
       AND document.fn_pe_allocations_reserved(pe.status, pe.is_voided) = true;

    SELECT payable_amount INTO v_invoice_payable
      FROM document.purchase_invoice
     WHERE id        = NEW.purchase_invoice_id
       AND tenant_id = NEW.tenant_id;

    -- Not posted yet — skip; the status-transition guard catches it later.
    IF v_invoice_payable IS NULL THEN RETURN NEW; END IF;

    IF v_total_allocated > v_invoice_payable + 0.01 THEN
        RAISE EXCEPTION
          'AP_OVER_ALLOCATION: invoice % payable=% total_allocated=% (reserved payments only)',
          NEW.purchase_invoice_id, v_invoice_payable, v_total_allocated
          USING ERRCODE = 'AP020';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".fn_pea_no_over_allocation() IS 'BEFORE INSERT on payment_entry_allocation: (1) always block PEA inserts when parent PE is cash-effective (locked allocations); (2) for invoice-bound PEAs, also enforce SUM(allocated) ≤ payable using fn_pe_allocations_reserved as the active-payment predicate.';

CREATE OR REPLACE FUNCTION document.fn_pil_block_delete_with_active_pc()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    active_pc_count integer;
    sample_ids      uuid[];
BEGIN
    SELECT count(*), array_agg(pc.id ORDER BY pc.id)
      INTO active_pc_count, sample_ids
      FROM (
          SELECT id
            FROM document.pricing_component
           WHERE tenant_id        = OLD.tenant_id
             AND source_doc_type  = 'purchase_invoice_line'
             AND source_line_id   = OLD.id
             AND superseded_by_id IS NULL
           LIMIT 10
      ) pc;

    IF active_pc_count > 0 THEN
        RAISE EXCEPTION
          'PIL_DELETE_BLOCKED_BY_ACTIVE_PC: cannot delete purchase_invoice_line %; % active pricing_component row(s) reference it via source_line_id (sample ids: %)',
          OLD.id, active_pc_count, sample_ids
          USING ERRCODE = 'PC005';
    END IF;

    RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION "document".fn_pil_block_delete_with_active_pc() IS 'AFTER DELETE on document.purchase_invoice_line: blocks the delete when active (non-superseded) line-scope PC rows reference the row via source_line_id. Polymorphic FK substitute; pairs with the application guard in handleDeleteInvoiceLine (returns 409 LINE_HAS_ACTIVE_PRICING_COMPONENTS).';

CREATE OR REPLACE FUNCTION document.fn_pta_pc_term_clause_alignment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_pc_term text;
BEGIN
    -- Only check PC-origin rows; clause-driven rows skip the alignment check
    IF NEW.pricing_component_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT term_type INTO v_pc_term
      FROM document.pricing_component
     WHERE id        = NEW.pricing_component_id
       AND tenant_id = NEW.tenant_id;

    IF v_pc_term IS NULL THEN
        RAISE EXCEPTION 'PTA_PC_TERM_MISSING: pricing_component_id=% not found in tenant %',
            NEW.pricing_component_id, NEW.tenant_id
            USING ERRCODE = 'AP010';
    END IF;

    CASE v_pc_term
        WHEN 'retention' THEN
            IF NEW.clause_type NOT IN ('RETENTION','RETENTION_RELEASE') THEN
                RAISE EXCEPTION
                  'PTA_PC_TERM_MISMATCH: PC term_type=retention requires clause_type RETENTION or RETENTION_RELEASE, got %',
                  NEW.clause_type
                  USING ERRCODE = 'AP011';
            END IF;
        WHEN 'withholding' THEN
            -- PTA clause_type CHECK does not yet include WITHHOLDING.
            -- Reject PC-origin withholding rows until the CHECK extension lands.
            RAISE EXCEPTION
              'PTA_PC_TERM_UNSUPPORTED: PC term_type=withholding has no PTA clause_type mapping yet (PTA clause_type CHECK extension pending)'
              USING ERRCODE = 'AP012';
        ELSE
            -- discount, charge, tax, principal_marker have no PTA path
            RAISE EXCEPTION
              'PTA_PC_TERM_UNSUPPORTED: PC term_type=% does not map to any PTA clause_type',
              v_pc_term
              USING ERRCODE = 'AP013';
    END CASE;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".fn_pta_pc_term_clause_alignment() IS 'Enforces PTA clause_type semantically matches the source PC term_type when pricing_component_id is set. Today: retention → RETENTION/RETENTION_RELEASE only. Withholding and other term_types are rejected pending PTA enum extensions.';

CREATE OR REPLACE FUNCTION document.fn_purchase_invoice_proof(p_invoice_id uuid, p_tolerance numeric DEFAULT 0.0001)
 RETURNS TABLE(check_code text, check_label text, severity text, passed boolean, expected numeric, actual numeric, details jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'document', 'pg_catalog'
AS $function$
DECLARE
    v_invoice record;
    v_is_posted boolean;
    v_fx_rate numeric;
BEGIN
    SELECT *
      INTO v_invoice
      FROM document.purchase_invoice
     WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            'INVOICE_EXISTS',
            'Purchase invoice exists',
            'error',
            false,
            1::numeric,
            0::numeric,
            jsonb_build_object('invoice_id', p_invoice_id);
        RETURN;
    END IF;

    v_is_posted := COALESCE(v_invoice.is_posted, false)
                   OR v_invoice.status IN ('posted', 'partially_paid', 'fully_paid', 'reversed');
    v_fx_rate := CASE
        WHEN v_invoice.currency_code = v_invoice.base_currency_code THEN 1
        ELSE v_invoice.exchange_rate
    END;

    RETURN QUERY
    SELECT
        'INVOICE_EXISTS',
        'Purchase invoice exists',
        'info',
        true,
        1::numeric,
        1::numeric,
        jsonb_build_object(
            'invoice_id', p_invoice_id,
            'code', v_invoice.code,
            'status', v_invoice.status
        );

    RETURN QUERY
    SELECT
        'FX_RATE_PRESENT',
        'Foreign-currency invoice has a positive exchange rate',
        CASE WHEN v_invoice.currency_code = v_invoice.base_currency_code THEN 'info' ELSE 'error' END,
        CASE
            WHEN v_invoice.currency_code = v_invoice.base_currency_code THEN true
            ELSE v_invoice.exchange_rate IS NOT NULL AND v_invoice.exchange_rate > 0
        END,
        CASE WHEN v_invoice.currency_code = v_invoice.base_currency_code THEN 1::numeric ELSE NULL::numeric END,
        v_invoice.exchange_rate,
        jsonb_build_object(
            'currency_code', v_invoice.currency_code,
            'base_currency_code', v_invoice.base_currency_code,
            'exchange_rate', v_invoice.exchange_rate
        );

    RETURN QUERY
    WITH line_totals AS (
        SELECT
            COUNT(*)::numeric AS actual_line_count,
            COALESCE(SUM(pil.net_amount), 0)::numeric AS actual_subtotal_amount,
            COALESCE(SUM(pil.net_amount - COALESCE(pil.discount_amount, 0)), 0)::numeric AS actual_line_net_after_discount,
            COALESCE(SUM(pil.tax_amount), 0)::numeric AS actual_tax_amount,
            COALESCE(SUM(pil.withholding_tax_amount), 0)::numeric AS actual_withholding_tax_amount,
            COALESCE(SUM(pil.retention_amount), 0)::numeric AS actual_retention_amount
        FROM document.purchase_invoice_line pil
        WHERE pil.tenant_id = v_invoice.tenant_id
          AND pil.purchase_invoice_id = p_invoice_id
    ),
    checks AS (
        SELECT *
        FROM line_totals lt
        CROSS JOIN LATERAL (VALUES
            (
                'HEADER_LINE_COUNT',
                'Header line_count equals child line count',
                v_invoice.line_count::numeric,
                lt.actual_line_count
            ),
            (
                'HEADER_SUBTOTAL',
                'Header subtotal_amount equals sum(line net_amount)',
                v_invoice.subtotal_amount::numeric,
                lt.actual_subtotal_amount
            ),
            (
                'HEADER_TAX',
                'Header tax_amount equals sum(line tax_amount)',
                v_invoice.tax_amount::numeric,
                lt.actual_tax_amount
            ),
            (
                'HEADER_WITHHOLDING_TAX',
                'Header withholding_tax_amount equals sum(line withholding_tax_amount)',
                v_invoice.withholding_tax_amount::numeric,
                lt.actual_withholding_tax_amount
            ),
            (
                'HEADER_RETENTION',
                'Header retention_amount equals sum(line retention_amount)',
                v_invoice.retention_amount::numeric,
                lt.actual_retention_amount
            ),
            (
                'HEADER_TOTAL',
                'Header total_amount equals line net after discount plus tax, freight, misc, less header discount',
                v_invoice.total_amount::numeric,
                (
                    lt.actual_line_net_after_discount
                    + lt.actual_tax_amount
                    + COALESCE(v_invoice.freight_amount, 0)
                    + COALESCE(v_invoice.misc_charges_amount, 0)
                    - COALESCE(v_invoice.discount_amount, 0)
                )::numeric
            )
        ) AS c(code, label, expected_amount, actual_amount)
    )
    SELECT
        c.code,
        c.label,
        'error',
        ABS(COALESCE(c.expected_amount, 0) - COALESCE(c.actual_amount, 0)) <= p_tolerance,
        c.expected_amount,
        c.actual_amount,
        jsonb_build_object('invoice_id', p_invoice_id)
    FROM checks c;

    RETURN QUERY
    WITH line_distribution AS (
        SELECT
            pil.id AS line_id,
            pil.line_no,
            ABS(COALESCE(pil.net_amount, 0) - COALESCE(pil.discount_amount, 0))::numeric AS expected_assigned_amount,
            COALESCE(SUM(ad.distributed_amount), 0)::numeric AS actual_assigned_amount,
            COUNT(ad.id)::numeric AS split_count
        FROM document.purchase_invoice_line pil
        LEFT JOIN document.accounting_distribution ad
               ON ad.tenant_id = pil.tenant_id
              AND ad.source_doc_type = 'purchase_invoice_line'
              AND ad.source_doc_id = pil.purchase_invoice_id
              AND ad.source_line_id = pil.id
        WHERE pil.tenant_id = v_invoice.tenant_id
          AND pil.purchase_invoice_id = p_invoice_id
        GROUP BY pil.id, pil.line_no, pil.net_amount, pil.discount_amount
    ),
    distribution_totals AS (
        SELECT
            COUNT(*)::numeric AS line_count,
            (COUNT(*) FILTER (WHERE split_count > 0))::numeric AS assigned_line_count,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'line_id', line_id,
                        'line_no', line_no,
                        'split_count', split_count,
                        'expected_assigned_amount', expected_assigned_amount,
                        'actual_assigned_amount', actual_assigned_amount
                    )
                    ORDER BY line_no
                ) FILTER (
                    WHERE split_count = 0
                       OR ABS(expected_assigned_amount - actual_assigned_amount) > p_tolerance
                ),
                '[]'::jsonb
            ) AS exceptions
        FROM line_distribution
    )
    SELECT
        'ACCOUNT_ASSIGNMENT_EXISTS',
        'Every invoice line has at least one account assignment split',
        'error',
        dt.line_count > 0 AND dt.assigned_line_count = dt.line_count,
        dt.line_count,
        dt.assigned_line_count,
        jsonb_build_object('exceptions', dt.exceptions)
    FROM distribution_totals dt;

    RETURN QUERY
    WITH line_distribution AS (
        SELECT
            pil.id AS line_id,
            pil.line_no,
            ABS(COALESCE(pil.net_amount, 0) - COALESCE(pil.discount_amount, 0))::numeric AS expected_assigned_amount,
            COALESCE(SUM(ad.distributed_amount), 0)::numeric AS actual_assigned_amount,
            COUNT(ad.id)::numeric AS split_count
        FROM document.purchase_invoice_line pil
        LEFT JOIN document.accounting_distribution ad
               ON ad.tenant_id = pil.tenant_id
              AND ad.source_doc_type = 'purchase_invoice_line'
              AND ad.source_doc_id = pil.purchase_invoice_id
              AND ad.source_line_id = pil.id
        WHERE pil.tenant_id = v_invoice.tenant_id
          AND pil.purchase_invoice_id = p_invoice_id
        GROUP BY pil.id, pil.line_no, pil.net_amount, pil.discount_amount
    ),
    distribution_totals AS (
        SELECT
            COALESCE(SUM(expected_assigned_amount), 0)::numeric AS expected_assigned_amount,
            COALESCE(SUM(actual_assigned_amount), 0)::numeric AS actual_assigned_amount,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'line_id', line_id,
                        'line_no', line_no,
                        'expected_assigned_amount', expected_assigned_amount,
                        'actual_assigned_amount', actual_assigned_amount
                    )
                    ORDER BY line_no
                ) FILTER (
                    WHERE split_count = 0
                       OR ABS(expected_assigned_amount - actual_assigned_amount) > p_tolerance
                ),
                '[]'::jsonb
            ) AS exceptions
        FROM line_distribution
    )
    SELECT
        'ACCOUNT_ASSIGNMENT_TOTAL',
        'Split assigned amounts equal commercial line amounts after line discount',
        'error',
        ABS(dt.expected_assigned_amount - dt.actual_assigned_amount) <= p_tolerance
            AND dt.exceptions = '[]'::jsonb,
        dt.expected_assigned_amount,
        dt.actual_assigned_amount,
        jsonb_build_object('exceptions', dt.exceptions)
    FROM distribution_totals dt;

    RETURN QUERY
    SELECT
        'JOURNAL_REQUIRED_FOR_POSTED',
        'Posted invoice has an AP journal entry reference',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted) OR v_invoice.ap_je_id IS NOT NULL,
        CASE WHEN v_is_posted THEN 1::numeric ELSE NULL::numeric END,
        CASE WHEN v_invoice.ap_je_id IS NOT NULL THEN 1::numeric ELSE 0::numeric END,
        jsonb_build_object('ap_je_id', v_invoice.ap_je_id, 'status', v_invoice.status);

    RETURN QUERY
    WITH je AS (
        SELECT id, source_doc_type, source_doc_id, status
        FROM document.journal_entry
        WHERE tenant_id = v_invoice.tenant_id
          AND id = v_invoice.ap_je_id
    )
    SELECT
        'JOURNAL_SOURCE_MATCH',
        'AP journal entry source points to the purchase invoice',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted)
            OR EXISTS (
                SELECT 1
                FROM je
                WHERE source_doc_type = 'purchase_invoice'
                  AND source_doc_id = p_invoice_id
            ),
        CASE WHEN v_is_posted THEN 1::numeric ELSE NULL::numeric END,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM je
                WHERE source_doc_type = 'purchase_invoice'
                  AND source_doc_id = p_invoice_id
            ) THEN 1::numeric
            ELSE 0::numeric
        END,
        COALESCE(
            (SELECT jsonb_build_object('journal_entry_id', id, 'source_doc_type', source_doc_type, 'source_doc_id', source_doc_id, 'status', status) FROM je),
            jsonb_build_object('journal_entry_id', v_invoice.ap_je_id)
        );

    RETURN QUERY
    WITH jl_totals AS (
        SELECT
            COALESCE(SUM(transaction_debit), 0)::numeric AS transaction_debit,
            COALESCE(SUM(transaction_credit), 0)::numeric AS transaction_credit,
            COALESCE(SUM(base_debit), 0)::numeric AS base_debit,
            COALESCE(SUM(base_credit), 0)::numeric AS base_credit
        FROM document.journal_line
        WHERE tenant_id = v_invoice.tenant_id
          AND journal_entry_id = v_invoice.ap_je_id
    )
    SELECT
        'JOURNAL_BALANCED',
        'Posted journal debits equal credits',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted)
            OR (
                ABS(jt.transaction_debit - jt.transaction_credit) <= p_tolerance
                AND ABS(jt.base_debit - jt.base_credit) <= p_tolerance
            ),
        jt.transaction_debit,
        jt.transaction_credit,
        jsonb_build_object('base_debit', jt.base_debit, 'base_credit', jt.base_credit)
    FROM jl_totals jt;

    RETURN QUERY
    WITH jl_totals AS (
        SELECT
            COALESCE(SUM(transaction_debit), 0)::numeric AS transaction_debit,
            COALESCE(SUM(transaction_credit), 0)::numeric AS transaction_credit,
            COALESCE(SUM(base_debit), 0)::numeric AS base_debit,
            COALESCE(SUM(base_credit), 0)::numeric AS base_credit
        FROM document.journal_line
        WHERE tenant_id = v_invoice.tenant_id
          AND journal_entry_id = v_invoice.ap_je_id
    ),
    expected_journal AS (
        SELECT
            ABS(COALESCE(v_invoice.total_amount, 0))::numeric AS transaction_total,
            (ABS(COALESCE(v_invoice.total_amount, 0)) * COALESCE(v_fx_rate, 0))::numeric AS base_total
    )
    SELECT
        'JOURNAL_TOTAL_MATCHES_INVOICE',
        'Posted journal totals equal invoice total',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted)
            OR (
                v_fx_rate IS NOT NULL
                AND ABS(e.transaction_total - jt.transaction_debit) <= p_tolerance
                AND ABS(e.transaction_total - jt.transaction_credit) <= p_tolerance
                AND ABS(e.base_total - jt.base_debit) <= p_tolerance
                AND ABS(e.base_total - jt.base_credit) <= p_tolerance
            ),
        e.transaction_total,
        jt.transaction_debit,
        jsonb_build_object(
            'transaction_credit', jt.transaction_credit,
            'expected_base_total', e.base_total,
            'base_debit', jt.base_debit,
            'base_credit', jt.base_credit
        )
    FROM expected_journal e
    CROSS JOIN jl_totals jt;

    RETURN QUERY
    WITH invalid_links AS (
        SELECT COUNT(*)::numeric AS invalid_count
        FROM document.journal_line jl
        WHERE jl.tenant_id = v_invoice.tenant_id
          AND jl.journal_entry_id = v_invoice.ap_je_id
          AND jl.source_doc_line_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM document.purchase_invoice_line pil
              WHERE pil.tenant_id = jl.tenant_id
                AND pil.purchase_invoice_id = p_invoice_id
                AND pil.id = jl.source_doc_line_id
          )
    )
    SELECT
        'JOURNAL_LINE_SOURCE_TRACE',
        'Journal line source links point back to invoice lines',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted) OR il.invalid_count = 0,
        0::numeric,
        il.invalid_count,
        jsonb_build_object('invoice_id', p_invoice_id, 'journal_entry_id', v_invoice.ap_je_id)
    FROM invalid_links il;
END;
$function$;

COMMENT ON FUNCTION "document".fn_purchase_invoice_proof(p_invoice_id uuid, p_tolerance numeric) IS 'Returns row-level proof checks for purchase_invoice -> purchase_invoice_line -> accounting_distribution -> journal_line. Intended for pilot posting gates and resettable local verification.';

CREATE OR REPLACE FUNCTION document.fn_refresh_pil_amounts_from_pc(p_tenant_id uuid, p_invoice_id uuid)
 RETURNS TABLE(pil_id uuid, discount_amount numeric, tax_amount numeric, withholding_amt numeric, retention_amount numeric, gross_amount numeric)
 LANGUAGE sql
AS $function$
    WITH pc_amounts AS (
        SELECT
            pc.source_line_id AS pil_id,
            COALESCE(SUM(CASE WHEN pc.term_type = 'tax' THEN pc.computed_amount END), 0) AS tax_amount,
            COALESCE(SUM(CASE WHEN pc.term_type = 'withholding' THEN pc.computed_amount END), 0) AS withholding_amt
        FROM document.pricing_component pc
        WHERE pc.tenant_id = p_tenant_id
          AND pc.source_doc_type = 'purchase_invoice_line'
          AND pc.source_doc_id = p_invoice_id
          AND pc.source_line_id IS NOT NULL
          AND pc.superseded_by_id IS NULL
        GROUP BY pc.source_line_id
    ), updated AS (
        UPDATE document.purchase_invoice_line pil
           SET tax_amount = COALESCE(a.tax_amount, 0),
               withholding_tax_amount = COALESCE(a.withholding_amt, 0),
               updated_at = now()
          FROM document.purchase_invoice_line pil_scan
          LEFT JOIN pc_amounts a ON a.pil_id = pil_scan.id
         WHERE pil.id = pil_scan.id
           AND pil_scan.tenant_id = p_tenant_id
           AND pil_scan.purchase_invoice_id = p_invoice_id
        RETURNING pil.id,
                  0::numeric(18,4) AS discount_amount,
                  pil.tax_amount,
                  pil.withholding_tax_amount,
                  0::numeric(18,4) AS retention_amount,
                  pil.gross_amount
    )
    SELECT u.id, u.discount_amount, u.tax_amount, u.withholding_tax_amount,
           u.retention_amount, u.gross_amount
      FROM updated u;
$function$;

COMMENT ON FUNCTION "document".fn_refresh_pil_amounts_from_pc(p_tenant_id uuid, p_invoice_id uuid) IS 'Aggregates active line-scope pricing components into surviving PIL flat caches: tax_amount and withholding_tax_amount. Compatibility return columns for removed discount/retention caches are zero.';

CREATE OR REPLACE FUNCTION document.fn_refresh_purchase_invoice_totals(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
DECLARE
    v_row RECORD;
BEGIN
    SELECT
        COALESCE(SUM(net_amount), 0)               AS net_amount,
        COALESCE(SUM(tax_amount), 0)               AS tax_amount,
        COALESCE(SUM(withholding_tax_amount), 0)   AS withholding_tax_amount
    INTO v_row
    FROM document.purchase_invoice_line
    WHERE purchase_invoice_id = p_invoice_id;

    UPDATE document.purchase_invoice
       SET tax_amount             = v_row.tax_amount,
           withholding_tax_amount = v_row.withholding_tax_amount,
           total_amount           = v_row.net_amount + v_row.tax_amount,
           updated_at             = now()
     WHERE id = p_invoice_id;
END;
$function$;

COMMENT ON FUNCTION "document".fn_refresh_purchase_invoice_totals(p_invoice_id uuid) IS 'Phase 1 reset: recomputes total_amount, tax_amount, and withholding_tax_amount on purchase_invoice from current child lines.';

CREATE OR REPLACE FUNCTION document.fn_schedule_line_recompute_commitment_line(p_commitment_line_id uuid, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_total      numeric(18,4);
    v_remaining  numeric(18,4);
    v_schedule   record;
    v_assigned   numeric(18,4);
BEGIN
    -- Aggregate fulfilled quantity from downstream consumers
    SELECT
        COALESCE((
            SELECT SUM(rcpl.accepted_quantity)
              FROM document.receipt_line rcpl
             WHERE rcpl.commitment_line_id = p_commitment_line_id
               AND rcpl.tenant_id          = p_tenant_id
        ), 0)
      + COALESCE((
            SELECT SUM(sshl.quantity)
              FROM document.service_sheet_line sshl
             WHERE sshl.commitment_line_id = p_commitment_line_id
               AND sshl.tenant_id          = p_tenant_id
        ), 0)
    INTO v_total;

    v_remaining := GREATEST(v_total, 0);

    -- Walk current schedules in due-date order and consume sequentially.
    -- FOR UPDATE locks each row to prevent concurrent recomputes from
    -- racing on the same commitment_line.
    FOR v_schedule IN
        SELECT id, scheduled_quantity
          FROM document.schedule_line
         WHERE source_doc_type    = 'commitment_line'
           AND source_line_id     = p_commitment_line_id
           AND tenant_id          = p_tenant_id
           AND is_current_version = true
           AND terminal_status    IS NULL
         ORDER BY scheduled_date ASC, schedule_no ASC
         FOR UPDATE
    LOOP
        v_assigned := LEAST(v_remaining, v_schedule.scheduled_quantity);
        v_assigned := GREATEST(v_assigned, 0);

        UPDATE document.schedule_line
           SET fulfilled_quantity = v_assigned,
               fulfillment_status = CASE
                   WHEN v_assigned <= 0                                      THEN 'open'
                   WHEN v_assigned >= scheduled_quantity                     THEN 'fulfilled'
                   ELSE                                                           'partial'
               END,
               updated_at         = now(),
               updated_by         = COALESCE(updated_by, created_by),
               row_version        = row_version + 1
         WHERE id = v_schedule.id;

        v_remaining := v_remaining - v_assigned;
    END LOOP;

    -- Over-receipt is a real business condition (e.g. supplier shipped
    -- extra) — surface via NOTICE so it shows up in DB logs without
    -- aborting the upstream receipt write.
    IF v_remaining > 0 THEN
        RAISE NOTICE 'schedule_line over-receipt on commitment_line %: % surplus units after sequential allocation',
            p_commitment_line_id, v_remaining;
    END IF;
END;
$function$;

COMMENT ON FUNCTION "document".fn_schedule_line_recompute_commitment_line(p_commitment_line_id uuid, p_tenant_id uuid) IS 'Recomputes fulfilled_quantity + fulfillment_status for current-version commitment_line schedules owned by p_commitment_line_id. Aggregates receipt_line.accepted_quantity + service_sheet_line.quantity and allocates sequentially by scheduled_date ASC. Over-receipt surfaces as a NOTICE without aborting.';

CREATE OR REPLACE FUNCTION document.purchase_order_view_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    DELETE FROM document.commitment
     WHERE id = OLD.id
       AND commitment_type = 'purchase_order';
    RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION document.purchase_order_view_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO document.commitment (
        id, tenant_id, company_code_id,
        code, name,
        commitment_type, order_type,
        party_type, party_id,
        parent_commitment_id, release_sequence_no,
        requested_by, responsible_person_id, approved_by, approved_at,
        workflow_request_id,
        document_date, effective_date, expiry_date,
        currency_code, base_currency_code, exchange_rate,
        fx_rate_snapshot, fx_policy,
        total_amount, scheduled_amount, released_amount,
        fulfilled_amount, invoiced_amount, paid_amount,
        payment_term_id, budget_check_result, encumbrance_je_id,
        renewal_terms, renewal_count, renewed_from_id,
        is_provisional, draft_expires_at, draft_started_at, draft_started_by,
        tags, metadata,
        status, status_changed_at, status_changed_by,
        created_at, created_by, updated_at, updated_by
    ) VALUES (
        COALESCE(NEW.id, shared.uuidv7()),
        NEW.tenant_id, NEW.company_code_id,
        NEW.code, NEW.name,
        'purchase_order',
        COALESCE(NEW.order_type, 'standard'),
        COALESCE(NEW.party_type, 'SUPPLIER'), NEW.party_id,
        NEW.parent_commitment_id, NEW.release_sequence_no,
        NEW.requested_by, NEW.responsible_person_id, NEW.approved_by, NEW.approved_at,
        NEW.workflow_request_id,
        NEW.document_date, NEW.effective_date, NEW.expiry_date,
        NEW.currency_code, NEW.base_currency_code, NEW.exchange_rate,
        NEW.fx_rate_snapshot, COALESCE(NEW.fx_policy, 'spot_on_event'),
        COALESCE(NEW.total_amount, 0), COALESCE(NEW.scheduled_amount, 0), COALESCE(NEW.released_amount, 0),
        COALESCE(NEW.fulfilled_amount, 0), COALESCE(NEW.invoiced_amount, 0), COALESCE(NEW.paid_amount, 0),
        NEW.payment_term_id, NEW.budget_check_result, NEW.encumbrance_je_id,
        NEW.renewal_terms, COALESCE(NEW.renewal_count, 0), NEW.renewed_from_id,
        COALESCE(NEW.is_provisional, false), NEW.draft_expires_at, NEW.draft_started_at, NEW.draft_started_by,
        COALESCE(NEW.tags, '[]'::jsonb), COALESCE(NEW.metadata, '{}'::jsonb),
        COALESCE(NEW.status, 'draft'), NEW.status_changed_at, NEW.status_changed_by,
        COALESCE(NEW.created_at, now()), NEW.created_by, NEW.updated_at, NEW.updated_by
    );
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.purchase_order_view_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE document.commitment SET
        code                    = NEW.code,
        name                    = NEW.name,
        order_type              = NEW.order_type,
        party_id                = NEW.party_id,
        party_type              = COALESCE(NEW.party_type, 'SUPPLIER'),
        parent_commitment_id    = NEW.parent_commitment_id,
        release_sequence_no     = NEW.release_sequence_no,
        requested_by            = NEW.requested_by,
        responsible_person_id   = NEW.responsible_person_id,
        approved_by             = NEW.approved_by,
        approved_at             = NEW.approved_at,
        workflow_request_id     = NEW.workflow_request_id,
        document_date           = NEW.document_date,
        effective_date          = NEW.effective_date,
        expiry_date             = NEW.expiry_date,
        currency_code           = NEW.currency_code,
        base_currency_code      = NEW.base_currency_code,
        exchange_rate           = NEW.exchange_rate,
        fx_rate_snapshot        = NEW.fx_rate_snapshot,
        fx_policy               = NEW.fx_policy,
        total_amount            = NEW.total_amount,
        scheduled_amount        = NEW.scheduled_amount,
        released_amount         = NEW.released_amount,
        fulfilled_amount        = NEW.fulfilled_amount,
        invoiced_amount         = NEW.invoiced_amount,
        paid_amount             = NEW.paid_amount,
        payment_term_id         = NEW.payment_term_id,
        budget_check_result     = NEW.budget_check_result,
        encumbrance_je_id       = NEW.encumbrance_je_id,
        renewal_terms           = NEW.renewal_terms,
        renewal_count           = NEW.renewal_count,
        renewed_from_id         = NEW.renewed_from_id,
        is_provisional          = NEW.is_provisional,
        draft_expires_at        = NEW.draft_expires_at,
        draft_started_at        = NEW.draft_started_at,
        draft_started_by        = NEW.draft_started_by,
        tags                    = NEW.tags,
        metadata                = NEW.metadata,
        status                  = NEW.status,
        status_changed_at       = NEW.status_changed_at,
        status_changed_by       = NEW.status_changed_by,
        updated_at              = now(),
        updated_by              = NEW.updated_by
      WHERE id = OLD.id
        AND commitment_type = 'purchase_order';
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.refresh_invoice_amounts_from_pc(p_tenant_id uuid, p_invoice_id uuid)
 RETURNS TABLE(pil_count integer, pi_subtotal_amount numeric, pi_tax_amount numeric, pi_retention_amount numeric, pi_total_amount numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_pil_count integer;
BEGIN
    SELECT COUNT(*) INTO v_pil_count
      FROM document.fn_refresh_pil_amounts_from_pc(p_tenant_id, p_invoice_id);

    PERFORM document.fn_refresh_purchase_invoice_totals(p_tenant_id, p_invoice_id);

    RETURN QUERY
    SELECT v_pil_count,
           COALESCE((SELECT SUM(pil.net_amount)::numeric(18,4)
                       FROM document.purchase_invoice_line pil
                      WHERE pil.tenant_id = p_tenant_id
                        AND pil.purchase_invoice_id = p_invoice_id), 0::numeric(18,4)) AS pi_subtotal_amount,
           pi.tax_amount,
           pi.retention_amount,
           pi.total_amount
      FROM document.purchase_invoice pi
     WHERE pi.tenant_id = p_tenant_id
       AND pi.id = p_invoice_id;
END;
$function$;

COMMENT ON FUNCTION "document".refresh_invoice_amounts_from_pc(p_tenant_id uuid, p_invoice_id uuid) IS 'Refreshes reset-safe PI/PIL caches from pricing components: PIL tax/WHT then PI totals.';

CREATE OR REPLACE FUNCTION document.resolve_template_binding(p_tenant_id uuid, p_entity_name text, p_operation text, p_variant text DEFAULT 'default'::text)
 RETURNS TABLE(binding_id uuid, template_id uuid, template_code text, engine text, version_id uuid, variant text, priority integer)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master', 'document', 'snapshot', 'shared', 'pg_catalog'
AS $function$
    SELECT
        tb.id                       AS binding_id,
        t.id                        AS template_id,
        t.code                      AS template_code,
        t.engine,
        t.current_version_id        AS version_id,
        tb.variant,
        tb.priority
    FROM master.template_binding tb
    JOIN master.template t
        ON  t.id        = tb.template_id
        AND t.tenant_id = tb.tenant_id
    WHERE tb.tenant_id   = p_tenant_id
      AND tb.entity_name = p_entity_name
      AND tb.operation   = p_operation
      AND tb.is_active   = true
      AND t.status      <> 'ARCHIVED'
      AND tb.variant IN (p_variant, 'default')
    ORDER BY
        CASE tb.variant WHEN p_variant THEN 0 ELSE 1 END,  -- exact match first
        tb.priority DESC                                      -- highest priority wins
    LIMIT 1;
$function$;

COMMENT ON FUNCTION "document".resolve_template_binding(p_tenant_id uuid, p_entity_name text, p_operation text, p_variant text) IS 'Priority-based template resolution: entity+operation+variant → template+version. Falls back from exact variant to ''default''. STABLE PARALLEL SAFE.';

CREATE OR REPLACE FUNCTION document.trg_ad_dimension_set_hash_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.dimension_set_id := shared.fn_dimension_set_hash(
        NEW.cost_center_id,
        NEW.profit_center_id,
        NEW.project_id,
        NULL
    );
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_ad_dimension_set_hash_refresh() IS 'AD-specific dimension hash refresh. Site dimension is sourced from the P2P line, not stored on AD, so site is passed as NULL to fn_dimension_set_hash.';

CREATE OR REPLACE FUNCTION document.trg_asset_txn_book_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'master'
AS $function$
DECLARE
    v_book_asset_id uuid;
    v_book_type     text;
BEGIN
    -- If no book link, skip cross-checks (WIP-stage events)
    IF NEW.asset_book_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT ab.asset_id, ab.book_type
      INTO v_book_asset_id, v_book_type
      FROM master.asset_book ab
     WHERE ab.id = NEW.asset_book_id
       AND ab.tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset_transaction: asset_book_id % not found for tenant %',
            NEW.asset_book_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_book_asset_id != NEW.asset_id THEN
        RAISE EXCEPTION 'asset_transaction: asset_book_id % belongs to asset %, not %',
            NEW.asset_book_id, v_book_asset_id, NEW.asset_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.book_type IS NOT NULL AND v_book_type != NEW.book_type THEN
        RAISE EXCEPTION 'asset_transaction: asset_book_id % has book_type %, not %',
            NEW.asset_book_id, v_book_type, NEW.book_type
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_asset_txn_book_guard() IS 'Validates that asset_book_id belongs to the stated asset_id within the same tenant, and that book_type matches the referenced asset_book. Prevents asset/book mismatch and book_type denormalization drift at DB level.';

CREATE OR REPLACE FUNCTION document.trg_cl_derive_ship_jurisdictions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.shipto_address_id IS DISTINCT FROM
       COALESCE(OLD.shipto_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipto_address_id IS NULL THEN
            NEW.to_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.to_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.shipto_address_id;
        END IF;
    END IF;

    IF NEW.shipfrom_address_id IS DISTINCT FROM
       COALESCE(OLD.shipfrom_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipfrom_address_id IS NULL THEN
            NEW.from_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.from_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.shipfrom_address_id;
        END IF;
    END IF;

    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION document.trg_cmt_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    IF OLD.status IN ('closed','cancelled','expired')
       OR OLD.terminal_status IS NOT NULL THEN
        RAISE EXCEPTION
            'commitment % is in terminal status ''%'' and cannot be modified directly. Use an action operation.',
            OLD.id, COALESCE(OLD.terminal_status, OLD.status)
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_commitment_line_default_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_scheduled_date date;
    v_copied         integer := 0;
BEGIN
    IF EXISTS (
        SELECT 1 FROM document.schedule_line
         WHERE tenant_id          = NEW.tenant_id
           AND source_doc_type    = 'commitment_line'
           AND source_line_id     = NEW.id
           AND is_current_version = true
    ) THEN
        RETURN NEW;
    END IF;

    -- If this commitment_line was converted from a PR line, copy the
    -- PR's current-version schedules. Reset schedule_no per new line.
    IF NEW.requisition_line_id IS NOT NULL THEN
        INSERT INTO document.schedule_line (
            tenant_id, source_doc_type, source_doc_id, source_line_id,
            schedule_no, schedule_kind,
            scheduled_quantity, scheduled_amount, scheduled_date, currency_code,
            version_number, is_current_version,
            metadata, status, created_by
        )
        SELECT
            NEW.tenant_id,
            'commitment_line',
            NEW.commitment_id,
            NEW.id,
            row_number() OVER (ORDER BY pr_sl.schedule_no)::smallint,
            pr_sl.schedule_kind,
            pr_sl.scheduled_quantity,
            pr_sl.scheduled_quantity * NEW.unit_price,
            pr_sl.scheduled_date,
            NEW.currency_code,
            1,
            true,
            jsonb_build_object(
                'source', 'trigger_copy_from_pr',
                'copied_from_pr_schedule_id', pr_sl.id
            ),
            'active',
            NEW.created_by
          FROM document.schedule_line pr_sl
         WHERE pr_sl.tenant_id          = NEW.tenant_id
           AND pr_sl.source_doc_type    = 'purchase_requisition_line'
           AND pr_sl.source_line_id     = NEW.requisition_line_id
           AND pr_sl.is_current_version = true
           AND pr_sl.terminal_status    IS NULL
         ORDER BY pr_sl.schedule_no;

        GET DIAGNOSTICS v_copied = ROW_COUNT;
    END IF;

    -- Fallback when no PR or no PR schedules copied — write a single default
    IF v_copied = 0 THEN
        v_scheduled_date := COALESCE(NEW.required_by_date, CURRENT_DATE);
        INSERT INTO document.schedule_line (
            tenant_id, source_doc_type, source_doc_id, source_line_id,
            schedule_no, schedule_kind,
            scheduled_quantity, scheduled_amount, scheduled_date, currency_code,
            version_number, is_current_version,
            metadata, status, created_by
        ) VALUES (
            NEW.tenant_id,
            'commitment_line',
            NEW.commitment_id,
            NEW.id,
            1::smallint,
            'delivery',
            NEW.quantity,
            NEW.quantity * NEW.unit_price,
            v_scheduled_date,
            NEW.currency_code,
            1,
            true,
            jsonb_build_object('source', 'trigger_default'),
            'active',
            NEW.created_by
        );
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_commitment_line_default_schedule() IS 'AFTER INSERT on commitment_line — copies PR schedules on PR→PO conversion, else creates a default delivery schedule_line.';

CREATE OR REPLACE FUNCTION document.trg_commitment_line_refresh_default_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_count integer;
    v_id    uuid;
BEGIN
    SELECT count(*), max(id::text)::uuid
      INTO v_count, v_id
      FROM document.schedule_line
     WHERE tenant_id          = NEW.tenant_id
       AND source_doc_type    = 'commitment_line'
       AND source_line_id     = NEW.id
       AND is_current_version = true
       AND terminal_status    IS NULL
       AND metadata->>'source' IN ('trigger_default', 'trigger_copy_from_pr');

    IF v_count <> 1 THEN
        RETURN NEW;
    END IF;

    UPDATE document.schedule_line
       SET scheduled_quantity = NEW.quantity,
           scheduled_amount   = NEW.quantity * NEW.unit_price,
           scheduled_date     = COALESCE(NEW.required_by_date, scheduled_date),
           currency_code      = NEW.currency_code,
           updated_at         = now(),
           updated_by         = COALESCE(NEW.updated_by, NEW.created_by),
           row_version        = row_version + 1
     WHERE id = v_id;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_commitment_line_refresh_default_schedule() IS 'AFTER UPDATE on commitment_line — refreshes the single trigger-default schedule_line in place and no-ops when multiple schedules or writer-service schedules exist. User-visible schedule refresh belongs in schedule.* Meta Entity resolvers.';

CREATE OR REPLACE FUNCTION document.trg_compensation_assignment_company_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_emp_company uuid;
    v_pg_company uuid;
BEGIN
    IF NEW.employment_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT e.company_code_id
      INTO v_emp_company
      FROM master.employment e
     WHERE e.tenant_id = NEW.tenant_id
       AND e.id = NEW.employment_id;

    SELECT pg.company_code_id
      INTO v_pg_company
      FROM master.pay_group pg
     WHERE pg.tenant_id = NEW.tenant_id
       AND pg.id = NEW.pay_group_id;

    IF v_emp_company IS NOT NULL
       AND v_pg_company IS NOT NULL
       AND v_emp_company IS DISTINCT FROM v_pg_company THEN
        RAISE EXCEPTION 'COMPENSATION_COMPANY_MISMATCH: employment company does not match pay_group company';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_dn_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    IF OLD.status IN ('fully_receipted','returned','cancelled')
       OR OLD.terminal_status IS NOT NULL THEN
        RAISE EXCEPTION
            'delivery_note % is in terminal status ''%'' and cannot be modified directly. Use an action operation.',
            OLD.id, COALESCE(OLD.terminal_status, OLD.status)
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_guard_commitment_line_company()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'document', 'master', 'pg_temp'
AS $function$
DECLARE
    v_header_co uuid;
    v_resolved  uuid;
BEGIN
    SELECT company_code_id INTO v_header_co
    FROM document.commitment
    WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_id;

    IF v_header_co IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.item_id IS NOT NULL THEN
        SELECT company_code_id INTO v_resolved
        FROM master.item
        WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'Commitment line: item % belongs to company %, but commitment company is %',
                NEW.item_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.warehouse_id IS NOT NULL THEN
        SELECT s.company_code_id INTO v_resolved
        FROM master.warehouse w
        JOIN master.site s
             ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        WHERE w.tenant_id = NEW.tenant_id AND w.id = NEW.warehouse_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'Commitment line: warehouse % belongs to company %, but commitment company is %',
                NEW.warehouse_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.site_id IS NOT NULL THEN
        SELECT company_code_id INTO v_resolved
        FROM master.site
        WHERE tenant_id = NEW.tenant_id AND id = NEW.site_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'Commitment line: site % belongs to company %, but commitment company is %',
                NEW.site_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_guard_gr_header_company()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'document', 'master', 'pg_temp'
AS $function$
DECLARE
    v_resolved uuid;
BEGIN
    -- Skip no-op updates
    IF TG_OP = 'UPDATE'
       AND OLD.company_code_id        IS NOT DISTINCT FROM NEW.company_code_id
       AND OLD.receiving_warehouse_id IS NOT DISTINCT FROM NEW.receiving_warehouse_id
       AND OLD.receiving_site_id      IS NOT DISTINCT FROM NEW.receiving_site_id
    THEN
        RETURN NEW;
    END IF;

    IF NEW.receiving_warehouse_id IS NOT NULL THEN
        SELECT s.company_code_id INTO v_resolved
        FROM master.warehouse w
        JOIN master.site s
             ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        WHERE w.tenant_id = NEW.tenant_id
          AND w.id = NEW.receiving_warehouse_id;

        IF v_resolved IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION
                'GR header: receiving_warehouse % belongs to company %, but GR company is %',
                NEW.receiving_warehouse_id, v_resolved, NEW.company_code_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.receiving_site_id IS NOT NULL THEN
        SELECT company_code_id INTO v_resolved
        FROM master.site
        WHERE tenant_id = NEW.tenant_id AND id = NEW.receiving_site_id;

        IF v_resolved IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION
                'GR header: receiving_site % belongs to company %, but GR company is %',
                NEW.receiving_site_id, v_resolved, NEW.company_code_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_guard_gr_line_company()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'document', 'master', 'pg_temp'
AS $function$
DECLARE
    v_header_co uuid;
    v_resolved  uuid;
BEGIN
    SELECT company_code_id INTO v_header_co
    FROM document.receipt
    WHERE tenant_id = NEW.tenant_id AND id = NEW.receipt_id;

    IF v_header_co IS NULL THEN
        RETURN NEW;  -- parent not found yet (deferred FK); let FK catch it
    END IF;

    IF NEW.item_id IS NOT NULL THEN
        SELECT company_code_id INTO v_resolved
        FROM master.item
        WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'GR line: item % belongs to company %, but GR company is %',
                NEW.item_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.warehouse_id IS NOT NULL THEN
        SELECT s.company_code_id INTO v_resolved
        FROM master.warehouse w
        JOIN master.site s
             ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        WHERE w.tenant_id = NEW.tenant_id AND w.id = NEW.warehouse_id;

        IF v_resolved IS DISTINCT FROM v_header_co THEN
            RAISE EXCEPTION
                'GR line: warehouse % belongs to company %, but GR company is %',
                NEW.warehouse_id, v_resolved, v_header_co
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_guard_netting_allocation_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
BEGIN
    -- Check only NETTING payments touched by this statement.
    IF EXISTS (
        SELECT 1
        FROM   (SELECT DISTINCT payment_entry_id FROM new_rows) AS changed
        JOIN   document.payment_entry pe
          ON   pe.id = changed.payment_entry_id
         AND   pe.payment_type = 'netting'
        WHERE  (
                   SELECT COUNT(*)
                   FROM   document.payment_entry_allocation
                   WHERE  payment_entry_id = pe.id
               ) < 2
    ) THEN
        RAISE EXCEPTION
            'NETTING payment must have at least two allocation lines — a single-invoice netting run is meaningless; use a STANDARD payment instead'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_guard_payment_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_payment_type text;
BEGIN
    SELECT payment_type INTO v_payment_type
    FROM document.payment_entry
    WHERE id = NEW.payment_entry_id;

    IF v_payment_type = 'advance' THEN
        IF NEW.commitment_id IS NULL THEN
            RAISE EXCEPTION
                'Advance payment allocation requires commitment_id'
                USING ERRCODE = 'P0002';
        END IF;
        IF NEW.purchase_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Advance payment allocation must not reference a purchase_invoice_id'
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF v_payment_type IN ('standard','partial','final','down_payment') THEN
        IF NEW.purchase_invoice_id IS NULL THEN
            RAISE EXCEPTION
                'Payment type % allocation requires purchase_invoice_id',
                v_payment_type
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF v_payment_type = 'retention_release' THEN
        IF NEW.purchase_invoice_id IS NULL AND NEW.commitment_id IS NULL THEN
            RAISE EXCEPTION
                'Retention release allocation requires purchase_invoice_id or commitment_id'
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF v_payment_type = 'netting' THEN
        -- Netting settles existing AP invoice balances across a run; it does not
        -- operate against open commitments, recover advances, or release retention.
        -- Those adjustments must be completed on their respective payment types first.
        IF NEW.purchase_invoice_id IS NULL THEN
            RAISE EXCEPTION
                'NETTING allocation requires purchase_invoice_id'
                USING ERRCODE = 'P0002';
        END IF;
        IF NEW.commitment_id IS NOT NULL THEN
            RAISE EXCEPTION
                'NETTING allocation must not reference commitment_id; settle open commitments via ADVANCE or STANDARD payments first'
                USING ERRCODE = 'P0002';
        END IF;
        IF NEW.advance_recovery_amount <> 0 THEN
            RAISE EXCEPTION
                'NETTING allocation must not carry advance_recovery_amount; recover advances on standard invoice payments first'
                USING ERRCODE = 'P0002';
        END IF;
        IF NEW.retention_amount <> 0 THEN
            RAISE EXCEPTION
                'NETTING allocation must not carry retention_amount; use RETENTION_RELEASE payment type instead'
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_guard_ses_line_company()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'document', 'master', 'pg_temp'
AS $function$
DECLARE
    v_header_co uuid;
    v_item_co   uuid;
BEGIN
    IF NEW.item_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT company_code_id INTO v_header_co
    FROM document.service_sheet
    WHERE tenant_id = NEW.tenant_id AND id = NEW.service_sheet_id;

    IF v_header_co IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT company_code_id INTO v_item_co
    FROM master.item
    WHERE tenant_id = NEW.tenant_id AND id = NEW.item_id;

    IF v_item_co IS DISTINCT FROM v_header_co THEN
        RAISE EXCEPTION
            'SES line: item % belongs to company %, but SES company is %',
            NEW.item_id, v_item_co, v_header_co
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_je_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'control', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_prefix   text := 'JE';
    v_date_fmt text := 'DD Mon YYYY';
    v_num      text;
BEGIN
    -- code ← je_number (generated by canonical entity numbering)
    IF NEW.je_number IS NULL OR btrim(NEW.je_number) = '' THEN
        BEGIN
            v_num := control.next_entity_number(
                NEW.tenant_id,
                'journal_entry',
                'document_no',
                NEW.company_code_id,
                NEW.fiscal_year,
                NEW.period_number,
                NULL,
                COALESCE(NEW.posting_date, CURRENT_DATE)
            );
        EXCEPTION WHEN OTHERS THEN
            v_num := NULL;
        END;
        NEW.je_number := COALESCE(v_num, 'JE-' || NEW.fiscal_year::text || '-' || substring(shared.uuidv7()::text from 1 for 8));
    END IF;

    IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
        NEW.code := COALESCE(NEW.je_number, '');
    END IF;

    -- name ← description (user-entered) or meta-configured fallback
    IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
        IF NEW.description IS NOT NULL AND btrim(NEW.description) <> '' THEN
            NEW.name := btrim(NEW.description);
        ELSE
            NEW.name := v_prefix || ' – '
                || to_char(COALESCE(NEW.posting_date, CURRENT_DATE), v_date_fmt);
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_je_before_insert() IS 'BEFORE INSERT on document.journal_entry. Sets code from je_number and derives name from description or JE/date fallback.';

CREATE OR REPLACE FUNCTION document.trg_je_enqueue_cross_book_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'control', 'event', 'pg_catalog'
AS $function$
BEGIN
  IF NEW.status <> 'posted' OR OLD.status = 'posted'
     OR NEW.derived_from_je_id IS NOT NULL
     OR NEW.posting_rule_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM control.book_posting_rule rule
     WHERE rule.tenant_id = NEW.tenant_id
       AND rule.company_code_id = NEW.company_code_id
       AND rule.source_book_id = NEW.book_id
       AND rule.status = 'active'
  ) THEN
    INSERT INTO event.outbox (
      tenant_id, topic, event_type, event_key,
      entity_type, entity_id, aggregate_type, aggregate_id,
      actor_id, source, payload, created_by
    ) VALUES (
      NEW.tenant_id, 'fin', 'finance.journal.cross_book_requested',
      'cross-book:' || NEW.id::text,
      'journal_entry', NEW.id, 'journal_entry', NEW.id,
      NEW.posted_by, 'document.journal_entry',
      jsonb_build_object(
        'sourceJournalId', NEW.id,
        'companyCodeId', NEW.company_code_id,
        'sourceBookId', NEW.book_id,
        'fiscalYear', NEW.fiscal_year,
        'periodNumber', NEW.period_number
      ),
      NEW.posted_by
    )
    ON CONFLICT (tenant_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_je_enqueue_cross_book_fn() IS 'Enqueues idempotent fin-topic execution for posted root journals with active book_posting_rule rows; derived journals are excluded for loop prevention.';

CREATE OR REPLACE FUNCTION document.trg_je_field_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'log', 'pg_catalog'
AS $function$
DECLARE
    v_event_id   uuid := shared.uuidv7();
    v_old        jsonb;
    v_new        jsonb;
    v_changed    text[];
    v_actor      uuid;
    v_created_by uuid;
    v_tenant_id  uuid;
    v_entity_id  uuid;
    v_company_id uuid;
    v_operation  text;
    v_base_excluded text[] := ARRAY[
        'updated_at', 'updated_by',
        'status_changed_at', 'status_changed_by',
        'is_active', 'posted_at', 'posted_by', 'reversed_by_id',
        'total_debit', 'total_credit', 'line_count'
    ];
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW) - v_base_excluded;
        SELECT array_agg(k ORDER BY k)
          INTO v_changed
          FROM jsonb_object_keys(v_new) AS keys(k);

        v_actor      := COALESCE(NEW.created_by, NEW.updated_by);
        v_created_by := COALESCE(v_actor, NEW.created_by);
        v_tenant_id  := NEW.tenant_id;
        v_entity_id  := NEW.id;
        v_company_id := NEW.company_code_id;
        v_operation  := 'insert';
    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD) - v_base_excluded;
        SELECT array_agg(k ORDER BY k)
          INTO v_changed
          FROM jsonb_object_keys(v_old) AS keys(k);

        v_actor      := COALESCE(
            nullif(current_setting('app.current_principal_id', true), '')::uuid,
            OLD.updated_by,
            OLD.created_by
        );
        v_created_by := COALESCE(v_actor, OLD.created_by);
        v_tenant_id  := OLD.tenant_id;
        v_entity_id  := OLD.id;
        v_company_id := OLD.company_code_id;
        v_operation  := 'delete';
    ELSE
        v_old := to_jsonb(OLD) - (v_base_excluded || ARRAY['status']);
        v_new := to_jsonb(NEW) - (v_base_excluded || ARRAY['status']);

        SELECT array_agg(n.key ORDER BY n.key)
          INTO v_changed
          FROM jsonb_each(v_new) AS n(key, value)
          LEFT JOIN jsonb_each(v_old) AS o(key, value) ON o.key = n.key
         WHERE n.value IS DISTINCT FROM o.value;

        IF COALESCE(array_length(v_changed, 1), 0) = 0 THEN
            RETURN NULL;
        END IF;

        v_actor      := COALESCE(
            nullif(current_setting('app.current_principal_id', true), '')::uuid,
            NEW.updated_by,
            OLD.updated_by,
            NEW.created_by
        );
        v_created_by := COALESCE(v_actor, NEW.updated_by, NEW.created_by);
        v_tenant_id  := NEW.tenant_id;
        v_entity_id  := NEW.id;
        v_company_id := NEW.company_code_id;
        v_operation  := 'update';
    END IF;

    INSERT INTO log.audit_log (
        id, tenant_id, entity_type, entity_id, operation,
        actor_id, actor_type, company_code_id,
        old_values, new_values, changed_fields, log_type, created_by
    )
    VALUES (
        v_event_id, v_tenant_id, 'journal_entry', v_entity_id, v_operation,
        v_actor, 'principal', v_company_id,
        v_old, v_new, COALESCE(v_changed, ARRAY[]::text[]), 'business', v_created_by
    );

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_je_finance_readiness_gate_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'governance', 'master', 'control', 'pg_catalog'
AS $function$
DECLARE v_capability_enabled boolean:=false;v_rollout_mode text:='observe';v_company_code text;
BEGIN
  IF NEW.status<>'posted' OR OLD.status='posted' OR NEW.is_reversal
     OR NEW.source_doc_type IN('opening_balance','finance_setup_test','reversal') THEN RETURN NEW;END IF;

  SELECT CASE WHEN flag.tenant_overrides ? NEW.tenant_id::text
    THEN (flag.tenant_overrides->>NEW.tenant_id::text)::boolean ELSE flag.is_enabled END
    INTO v_capability_enabled FROM control.feature_flag flag
   WHERE flag.code='finance.posting_readiness_gate' AND(flag.expires_at IS NULL OR flag.expires_at>now());
  IF NOT COALESCE(v_capability_enabled,false) THEN RETURN NEW;END IF;
  v_rollout_mode:=control.resolve_finance_posting_rollout_mode(NEW.tenant_id,NEW.company_code_id,NEW.posting_date);
  IF v_rollout_mode<>'enforce' THEN RETURN NEW;END IF;

  SELECT code INTO v_company_code FROM master.company_code WHERE tenant_id=NEW.tenant_id AND id=NEW.company_code_id;
  IF NOT EXISTS(
    WITH latest_run AS(
      SELECT run.id FROM governance.cycle_run run JOIN governance.cycle_type type
        ON type.tenant_id=run.tenant_id AND type.id=run.cycle_type_id
       WHERE run.tenant_id=NEW.tenant_id AND run.entity_code=v_company_code
         AND type.type_code='FIN_SETUP_READINESS' AND run.status<>'CANCELLED'
       ORDER BY run.run_number DESC,run.created_at DESC LIMIT 1)
    SELECT 1 FROM latest_run
    JOIN governance.cycle_certification cert ON cert.tenant_id=NEW.tenant_id AND cert.cycle_run_id=latest_run.id
    WHERE cert.cert_code='FINANCE_POSTING_READY' AND cert.status='ATTESTED'
      AND cert.snapshot_payload ? 'fourDomainReadiness'
      AND COALESCE((cert.snapshot_payload->'fourDomainReadiness'->'summary'->>'readyForCertification')::boolean,false)
      AND NOT EXISTS(SELECT 1 FROM governance.cycle_task task WHERE task.tenant_id=cert.tenant_id AND task.cycle_run_id=cert.cycle_run_id AND task.is_mandatory AND task.status<>'COMPLETED')
      AND NOT EXISTS(SELECT 1 FROM governance.cycle_deviation deviation WHERE deviation.tenant_id=cert.tenant_id AND deviation.cycle_run_id=cert.cycle_run_id AND deviation.severity='CRITICAL' AND deviation.status NOT IN('RESOLVED','REJECTED','EXPIRED','REVOKED'))
  ) THEN
    RAISE EXCEPTION 'FINANCE_POSTING_READINESS_REQUIRED: company % is in enforce mode without a current four-domain FINANCE_POSTING_READY certification',COALESCE(v_company_code,NEW.company_code_id::text) USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $function$;

COMMENT ON FUNCTION "document".trg_je_finance_readiness_gate_fn() IS 'Stage F rollout-aware production posting gate. Observe is non-blocking; enforce requires an attested current four-domain snapshot.';

CREATE OR REPLACE FUNCTION document.trg_je_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_allowed text[];
BEGIN
    IF OLD.status NOT IN ('pending_approval', 'approved', 'posted', 'reversed') THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'reversed' THEN
        RAISE EXCEPTION 'journal_entry %: reversed JE is fully immutable',
            OLD.je_number USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'posted' AND NEW.status <> 'reversed' THEN
        RAISE EXCEPTION 'journal_entry %: posted JE can only transition to reversed (attempted: %)',
            OLD.je_number, NEW.status USING ERRCODE = 'check_violation';
    END IF;

    v_allowed := ARRAY[
        'status', 'is_active',
        'status_changed_at', 'status_changed_by',
        'updated_at', 'updated_by'
    ];

    IF OLD.status = 'approved' AND NEW.status = 'posted' THEN
        v_allowed := v_allowed || ARRAY['posted_at', 'posted_by'];
    ELSIF OLD.status = 'posted' AND NEW.status = 'reversed' THEN
        v_allowed := v_allowed || ARRAY['reversed_by_id'];
    END IF;

    IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
        RAISE EXCEPTION
            'journal_entry %: accounting fields are immutable once status is %',
            OLD.je_number, OLD.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_je_immutability_guard() IS 'Enforces immutability on posted journal entries. After status=posted, only status→reversed and reversed_by_id may change. All other columns are frozen. Reversed JEs are fully immutable — no further changes.';

CREATE OR REPLACE FUNCTION document.trg_je_lifecycle_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'log', 'control', 'pg_catalog'
AS $function$
DECLARE
    v_event_id     uuid := shared.uuidv7();
    v_lc_id        uuid;
    v_from_state   uuid;
    v_to_state     uuid;
    v_operation    text;
    v_actor        uuid;
    v_created_by   uuid;
    v_payload      jsonb;
BEGIN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NULL;
    END IF;

    v_actor := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.status_changed_by,
        NEW.updated_by,
        OLD.updated_by,
        NEW.created_by
    );
    v_created_by := COALESCE(v_actor, NEW.created_by, OLD.created_by);

    SELECT lc.id
      INTO v_lc_id
      FROM control.lifecycle lc
     WHERE lc.code = 'journal_entry'
       AND lc.tenant_id IS NULL
     LIMIT 1;

    IF v_lc_id IS NOT NULL THEN
        SELECT ls.id INTO v_from_state
          FROM control.lifecycle_state ls
         WHERE ls.lifecycle_id = v_lc_id
           AND ls.code = OLD.status
         LIMIT 1;

        SELECT ls.id INTO v_to_state
          FROM control.lifecycle_state ls
         WHERE ls.lifecycle_id = v_lc_id
           AND ls.code = NEW.status
         LIMIT 1;

        SELECT lt.operation_code
          INTO v_operation
          FROM control.lifecycle_transition lt
         WHERE lt.lifecycle_id = v_lc_id
           AND lt.from_state_id IS NOT DISTINCT FROM v_from_state
           AND lt.to_state_id IS NOT DISTINCT FROM v_to_state
         LIMIT 1;
    END IF;

    v_operation := COALESCE(
        v_operation,
        CASE NEW.status
            WHEN 'created'          THEN 'complete'
            WHEN 'pending_approval' THEN 'submit'
            WHEN 'approved'         THEN 'approve'
            WHEN 'rejected'         THEN 'deny'
            WHEN 'posted'           THEN 'post'
            WHEN 'reversed'         THEN 'reverse'
            WHEN 'draft'            THEN 'reopen'
            ELSE 'status_change'
        END
    );

    v_payload := jsonb_build_object(
        'je_number', NEW.je_number,
        'source_doc_type', NEW.source_doc_type,
        'is_reversal', NEW.is_reversal,
        'status_changed_at', NEW.status_changed_at,
        'status_changed_by', COALESCE(NEW.status_changed_by, v_actor),
        'before', jsonb_build_object('status', OLD.status),
        'after', jsonb_build_object('status', NEW.status)
    );

    INSERT INTO log.entity_lifecycle_log (
        id, tenant_id, entity_type, entity_id, lifecycle_id, operation_code,
        from_status, to_status, from_state_id, to_state_id,
        actor_id, actor_type, company_code_id, remarks, payload, log_type, created_by
    )
    VALUES (
        v_event_id, NEW.tenant_id, 'journal_entry', NEW.id, v_lc_id, v_operation,
        OLD.status, NEW.status, v_from_state, v_to_state,
        v_actor, 'principal', NEW.company_code_id,
        format('Journal entry status changed from %s to %s', OLD.status, NEW.status),
        v_payload, 'business', v_created_by
    );

    INSERT INTO log.audit_log (
        id, tenant_id, entity_type, entity_id, operation, actor_id, actor_type,
        company_code_id, old_values, new_values, changed_fields, log_type, created_by
    )
    VALUES (
        v_event_id, NEW.tenant_id, 'journal_entry', NEW.id, 'status_change', v_actor, 'principal',
        NEW.company_code_id,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        ARRAY['status'], 'business', v_created_by
    );

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_je_period_gate_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'master', 'governance', 'pg_catalog'
AS $function$
DECLARE
  v_fp_status   text;
  v_bps_status  text;
  v_gate_year   smallint;
  v_gate_period smallint;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' AND NEW.status = 'reversed' THEN
    RETURN NEW;
  END IF;

  SELECT fp.status, fp.fiscal_year, fp.period_number
    INTO v_fp_status, v_gate_year, v_gate_period
    FROM master.fiscal_period fp
   WHERE fp.tenant_id       = NEW.tenant_id
     AND fp.company_code_id = NEW.company_code_id
     AND fp.id              = NEW.fiscal_period_id
   LIMIT 1;

  IF v_fp_status IS NULL OR v_fp_status IN ('hard_close', 'future') THEN
    RAISE EXCEPTION
      'PERIOD_NOT_OPEN: Fiscal period %/% for company % has status "%".',
      COALESCE(v_gate_year, NEW.fiscal_year), COALESCE(v_gate_period, NEW.period_number), NEW.company_code_id, v_fp_status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT bps.status
    INTO v_bps_status
    FROM governance.book_period_status bps
   WHERE bps.tenant_id       = NEW.tenant_id
     AND bps.company_code_id = NEW.company_code_id
     AND bps.book_id         = NEW.book_id
     AND bps.fiscal_year     = COALESCE(v_gate_year, NEW.fiscal_year)
     AND bps.period_number   = COALESCE(v_gate_period, NEW.period_number)
   LIMIT 1;

  v_bps_status := COALESCE(v_bps_status, 'future');

  IF v_bps_status IN ('hard_close', 'future') THEN
    RAISE EXCEPTION
      'BOOK_PERIOD_NOT_OPEN: Book period %/% for company %/book % has status "%".',
      COALESCE(v_gate_year, NEW.fiscal_year), COALESCE(v_gate_period, NEW.period_number), NEW.company_code_id, NEW.book_id, v_bps_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_je_period_gate_fn() IS 'Forward posting requires fiscal and book period status open/soft_close. Missing book-period rows are treated as future. Updates from posted to reversed are exempt from the period gate.';

CREATE OR REPLACE FUNCTION document.trg_je_status_insert_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
BEGIN
    IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION
            'journal_entry %: insert must start in draft; use lifecycle transitions for %',
            NEW.je_number, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_je_status_transition_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_sum_debit  numeric(18,4);
    v_sum_credit numeric(18,4);
    v_count      smallint;
    v_manual     boolean;
BEGIN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;

    v_manual := NEW.source_doc_type = 'manual' AND NEW.is_reversal = false;

    IF NOT (
        (OLD.status = 'draft'            AND NEW.status = 'created')
     OR (OLD.status = 'created'          AND NEW.status = 'pending_approval')
     OR (OLD.status = 'created'          AND NEW.status = 'approved')
     OR (OLD.status = 'pending_approval' AND NEW.status = 'approved')
     OR (OLD.status = 'pending_approval' AND NEW.status = 'rejected')
     OR (OLD.status = 'pending_approval' AND NEW.status = 'created')
     OR (OLD.status = 'rejected'         AND NEW.status = 'created')
     OR (OLD.status = 'created'          AND NEW.status = 'draft')
     OR (OLD.status = 'approved'         AND NEW.status = 'posted')
     OR (OLD.status = 'created'          AND NEW.status = 'posted')
     OR (OLD.status = 'posted'           AND NEW.status = 'reversed')
    ) THEN
        RAISE EXCEPTION 'journal_entry %: invalid status transition % -> %',
            NEW.je_number, OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'created' AND NEW.status = 'posted' AND v_manual THEN
        RAISE EXCEPTION
            'journal_entry %: manual entries must be approved before posting',
            NEW.je_number
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('created', 'pending_approval', 'approved', 'posted') THEN
        SELECT COALESCE(SUM(base_debit), 0),
               COALESCE(SUM(base_credit), 0),
               COUNT(*)::smallint
        INTO   v_sum_debit, v_sum_credit, v_count
        FROM   document.journal_line
        WHERE  journal_entry_id = NEW.id
          AND  tenant_id = NEW.tenant_id;

        IF v_count < 2 THEN
            RAISE EXCEPTION 'journal_entry %: at least two lines are required',
                NEW.je_number USING ERRCODE = 'check_violation';
        END IF;

        IF ABS(v_sum_debit - v_sum_credit) > 0.005 THEN
            RAISE EXCEPTION 'journal_entry %: debits (%) != credits (%)',
                NEW.je_number, v_sum_debit, v_sum_credit
                USING ERRCODE = 'check_violation';
        END IF;

        NEW.total_debit  := v_sum_debit;
        NEW.total_credit := v_sum_credit;
        NEW.line_count   := v_count;
    END IF;

    IF NEW.status = 'posted' THEN
        NEW.posted_at := COALESCE(NEW.posted_at, now());
        NEW.posted_by := COALESCE(
            NEW.posted_by,
            nullif(current_setting('app.current_principal_id', true), '')::uuid,
            NEW.updated_by,
            OLD.updated_by,
            NEW.created_by
        );
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_je_status_transition_guard() IS 'JE status state machine. draft→created validates lines + caches totals. created→posted stamps posted_at/by. Only valid transitions allowed. created→draft permitted for revert before posting.';

CREATE OR REPLACE FUNCTION document.trg_je_sync_base_currency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_currency text;
BEGIN
    IF TG_OP = 'INSERT' OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id THEN
        SELECT cc.functional_currency
          INTO STRICT v_currency
          FROM master.company_code cc
         WHERE cc.id = NEW.company_code_id
           AND cc.tenant_id = NEW.tenant_id;

        NEW.base_currency := v_currency;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_je_sync_base_currency() IS 'BEFORE INSERT OR UPDATE OF company_code_id trigger on document.journal_entry. Syncs base_currency from master.company_code.functional_currency.';

CREATE OR REPLACE FUNCTION document.trg_je_sync_cached_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_je_id       uuid;
    v_je_status   text;
    v_sum_debit   numeric(18,4);
    v_sum_credit  numeric(18,4);
    v_count       smallint;
BEGIN
    v_je_id := CASE TG_OP
        WHEN 'DELETE' THEN OLD.journal_entry_id
        ELSE NEW.journal_entry_id
    END;

    SELECT status INTO v_je_status
    FROM document.journal_entry WHERE id = v_je_id;

    IF v_je_status NOT IN ('draft', 'created') THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    -- Only keep line_count live during draft/created phase.
    -- total_debit and total_credit are set authoritatively by the
    -- draft→created transition guard (trg_je_status_transition_guard)
    -- once all lines are present and the entry is balanced.
    -- Updating them here after every individual line insert would
    -- violate je_balanced_chk in the intermediate unbalanced state.
    SELECT COUNT(*)::smallint
    INTO   v_count
    FROM   document.journal_line
    WHERE  journal_entry_id = v_je_id;

    UPDATE document.journal_entry
    SET    line_count = v_count
    WHERE  id = v_je_id
      AND  line_count IS DISTINCT FROM v_count;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_je_sync_cached_totals() IS 'Recomputes journal_entry.total_debit, total_credit, line_count from actual journal_line rows. Fires on INSERT/UPDATE/DELETE of journal_line. Only syncs for draft/created JEs (posted are immutable).';

CREATE OR REPLACE FUNCTION document.trg_je_sync_fiscal_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_fiscal_year    smallint;
    v_period_number  smallint;
BEGIN
    IF TG_OP = 'INSERT' OR NEW.fiscal_period_id IS DISTINCT FROM OLD.fiscal_period_id THEN
        SELECT fp.fiscal_year, fp.period_number
          INTO STRICT v_fiscal_year, v_period_number
          FROM master.fiscal_period fp
         WHERE fp.id = NEW.fiscal_period_id
           AND fp.tenant_id = NEW.tenant_id;

        NEW.fiscal_year   := v_fiscal_year;
        NEW.period_number := v_period_number;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_je_sync_fiscal_period() IS 'BEFORE INSERT OR UPDATE OF fiscal_period_id trigger on document.journal_entry. Syncs fiscal_year and period_number from master.fiscal_period.';

CREATE OR REPLACE FUNCTION document.trg_je_workflow_gate_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
DECLARE
  v_blocking_status  text;
BEGIN
  SELECT wr.status
    INTO v_blocking_status
    FROM document.workflow_request wr
   WHERE wr.tenant_id   = NEW.tenant_id
     AND wr.entity_type = 'journal_entry'
     AND wr.entity_id   = NEW.id::text
     AND wr.status IN ('pending', 'rejected', 'escalated')
   ORDER BY CASE wr.status WHEN 'rejected' THEN 1 WHEN 'escalated' THEN 2 ELSE 3 END
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'WORKFLOW_GATE: journal_entry % cannot be posted because workflow status is %.',
      NEW.je_number, v_blocking_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_je_workflow_gate_fn() IS 'BEFORE UPDATE trigger function on document.journal_entry. Fires on created→posted transition. Blocks posting when any document.workflow_request for the JE has status ''pending'' or ''rejected''. No workflow_request present = no approval required = posting allowed.';

CREATE OR REPLACE FUNCTION document.trg_jl_check_budget_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'master', 'ledger', 'pg_catalog'
AS $function$
DECLARE
  v_alloc          record;
  v_period_closing numeric(18,4);
  v_available      numeric(18,4);
  v_tolerance      numeric(18,4);
  v_consume_amt    numeric(18,4);
BEGIN
  -- Only expense/cost postings (debit side) consume budget
  IF NEW.base_debit = 0 THEN
    RETURN NEW;
  END IF;

  v_consume_amt := NEW.base_debit;

  -- Find the best matching active budget allocation.
  -- NULL on an allocation dimension = wildcard (matches any JL value).
  -- Order by specificity: most non-NULL dimension filters wins.
  SELECT ba.id,
         ba.overspend_policy,
         ba.tolerance_pct,
         ba.available_amount
    INTO v_alloc
    FROM master.budget_allocation ba
   WHERE ba.tenant_id        = NEW.tenant_id
     AND ba.company_code_id  = NEW.company_code_id
     AND ba.fiscal_year      = NEW.fiscal_year
     AND ba.is_active        = true
     AND (ba.gl_account_id    IS NULL OR ba.gl_account_id    = NEW.gl_account_id)
     AND (ba.cost_center_id   IS NULL OR ba.cost_center_id   = NEW.cost_center_id)
     AND (ba.profit_center_id IS NULL OR ba.profit_center_id = NEW.profit_center_id)
     AND (ba.project_id       IS NULL OR ba.project_id       = NEW.project_id)
   ORDER BY
       (ba.gl_account_id    IS NOT NULL)::int
     + (ba.cost_center_id   IS NOT NULL)::int
     + (ba.profit_center_id IS NOT NULL)::int
     + (ba.project_id       IS NOT NULL)::int DESC
   LIMIT 1;

  -- No budget allocation found → no control for this posting
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Prefer period-level closing balance; fall back to allocation-level available
  SELECT bb.closing_amount
    INTO v_period_closing
    FROM ledger.budget_balance bb
   WHERE bb.budget_allocation_id = v_alloc.id
     AND bb.fiscal_year          = NEW.fiscal_year
     AND bb.period_number        = NEW.period_number
   LIMIT 1;

  v_available := COALESCE(v_period_closing, v_alloc.available_amount);
  v_tolerance := v_available * (v_alloc.tolerance_pct / 100.0);

  -- Enforce overspend policy only when consumption exceeds budget + tolerance
  IF v_consume_amt > (v_available + v_tolerance) THEN
    CASE v_alloc.overspend_policy
      WHEN 'BLOCK' THEN
        RAISE EXCEPTION
          'BUDGET_EXCEEDED: Cannot post % — available budget is % '
          '(with tolerance %). '
          'Set overspend_policy=ALLOW on allocation % to permit overruns.',
          v_consume_amt, v_available, v_tolerance, v_alloc.id
          USING ERRCODE = 'P0001';

      WHEN 'ESCALATE' THEN
        RAISE EXCEPTION
          'BUDGET_ESCALATE: Cannot post % — available budget is %. '
          'A budget revision or transfer must be approved before posting.',
          v_consume_amt, v_available
          USING ERRCODE = 'P0001';

      WHEN 'WARN' THEN
        RAISE WARNING
          'BUDGET_WARNING: Posting % exceeds available budget of % '
          '(tolerance: %). Proceeding — overspend_policy=WARN.',
          v_consume_amt, v_available, v_tolerance;

      ELSE
        NULL;  -- ALLOW: no restriction, fall through
    END CASE;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_jl_check_budget_fn() IS 'BEFORE INSERT trigger function for document.journal_line. Checks debit postings against the best-matching active master.budget_allocation and ledger.budget_balance for the period. Dispatches on overspend_policy: BLOCK/ESCALATE raise exceptions; WARN emits a non-blocking warning; ALLOW/no-match passes through. Credit lines are never checked (they restore budget, not consume it).';

CREATE OR REPLACE FUNCTION document.trg_jl_field_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'log', 'pg_catalog'
AS $function$
DECLARE
    v_event_id   uuid := shared.uuidv7();
    v_old        jsonb;
    v_new        jsonb;
    v_changed    text[];
    v_actor      uuid;
    v_created_by uuid;
    v_tenant_id  uuid;
    v_line_id    uuid;
    v_company_id uuid;
    v_operation  text;
    v_excluded   text[] := ARRAY['updated_at', 'updated_by'];
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW) - v_excluded;
        SELECT array_agg(k ORDER BY k)
          INTO v_changed
          FROM jsonb_object_keys(v_new) AS keys(k);

        v_actor      := COALESCE(NEW.created_by, NEW.updated_by);
        v_created_by := COALESCE(v_actor, NEW.created_by);
        v_tenant_id  := NEW.tenant_id;
        v_line_id    := NEW.id;
        v_company_id := NEW.company_code_id;
        v_operation  := 'insert';
    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD) - v_excluded;
        SELECT array_agg(k ORDER BY k)
          INTO v_changed
          FROM jsonb_object_keys(v_old) AS keys(k);

        v_actor      := COALESCE(
            nullif(current_setting('app.current_principal_id', true), '')::uuid,
            OLD.updated_by,
            OLD.created_by
        );
        v_created_by := COALESCE(v_actor, OLD.created_by);
        v_tenant_id  := OLD.tenant_id;
        v_line_id    := OLD.id;
        v_company_id := OLD.company_code_id;
        v_operation  := 'delete';
    ELSE
        v_old := to_jsonb(OLD) - v_excluded;
        v_new := to_jsonb(NEW) - v_excluded;

        SELECT array_agg(n.key ORDER BY n.key)
          INTO v_changed
          FROM jsonb_each(v_new) AS n(key, value)
          LEFT JOIN jsonb_each(v_old) AS o(key, value) ON o.key = n.key
         WHERE n.value IS DISTINCT FROM o.value;

        IF COALESCE(array_length(v_changed, 1), 0) = 0 THEN
            RETURN NULL;
        END IF;

        v_actor      := COALESCE(
            nullif(current_setting('app.current_principal_id', true), '')::uuid,
            NEW.updated_by,
            OLD.updated_by,
            NEW.created_by
        );
        v_created_by := COALESCE(v_actor, NEW.updated_by, NEW.created_by);
        v_tenant_id  := NEW.tenant_id;
        v_line_id    := NEW.id;
        v_company_id := NEW.company_code_id;
        v_operation  := 'update';
    END IF;

    INSERT INTO log.audit_log (
        id, tenant_id, entity_type, entity_id, operation,
        actor_id, actor_type, company_code_id,
        old_values, new_values, changed_fields, log_type, created_by
    )
    VALUES (
        v_event_id, v_tenant_id, 'journal_line', v_line_id, v_operation,
        v_actor, 'principal', v_company_id,
        v_old, v_new, COALESCE(v_changed, ARRAY[]::text[]), 'business', v_created_by
    );

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_jl_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_je_status text;
BEGIN
    SELECT status INTO v_je_status
    FROM document.journal_entry
    WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id)
      AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id);

    IF v_je_status IN ('pending_approval', 'approved', 'posted', 'reversed') THEN
        IF TG_OP = 'UPDATE' THEN
            RAISE EXCEPTION 'journal_line: cannot modify line of a % journal_entry',
                v_je_status USING ERRCODE = 'check_violation';
        ELSIF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'journal_line: cannot delete line of a % journal_entry',
                v_je_status USING ERRCODE = 'check_violation';
        ELSIF TG_OP = 'INSERT' THEN
            RAISE EXCEPTION 'journal_line: cannot add line to a % journal_entry',
                v_je_status USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_jl_immutability_guard() IS 'Prevents INSERT, UPDATE, or DELETE on journal_lines belonging to a posted or reversed journal_entry. Lines are frozen when the JE is posted.';

CREATE OR REPLACE FUNCTION document.trg_jl_validate_dimensions_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'master', 'pg_catalog'
AS $function$
DECLARE
  v_posting_date  date;
BEGIN
  v_posting_date := COALESCE(NEW.posting_date, CURRENT_DATE);

  -- ── cost_center_id ────────────────────────────────────────────────────────
  IF NEW.cost_center_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM master.cost_center cc
       WHERE cc.id        = NEW.cost_center_id
         AND cc.tenant_id = NEW.tenant_id
         AND cc.is_active = true
         AND (cc.valid_from IS NULL OR cc.valid_from <= v_posting_date)
         AND (cc.valid_to   IS NULL OR cc.valid_to   >= v_posting_date)
    ) THEN
      RAISE EXCEPTION
        'DIMENSION_INVALID: cost_center_id % is inactive, date-expired, '
        'or not found for tenant %.',
        NEW.cost_center_id, NEW.tenant_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── profit_center_id ──────────────────────────────────────────────────────
  IF NEW.profit_center_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM master.profit_center pc
       WHERE pc.id        = NEW.profit_center_id
         AND pc.tenant_id = NEW.tenant_id
         AND pc.is_active = true
         AND (pc.valid_from IS NULL OR pc.valid_from <= v_posting_date)
         AND (pc.valid_to   IS NULL OR pc.valid_to   >= v_posting_date)
    ) THEN
      RAISE EXCEPTION
        'DIMENSION_INVALID: profit_center_id % is inactive, date-expired, '
        'or not found for tenant %.',
        NEW.profit_center_id, NEW.tenant_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── project_id ────────────────────────────────────────────────────────────
  IF NEW.project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM master.project p
       WHERE p.id        = NEW.project_id
         AND p.tenant_id = NEW.tenant_id
         AND p.is_active = true
         AND (p.valid_from IS NULL OR p.valid_from <= v_posting_date)
         AND (p.valid_to   IS NULL OR p.valid_to   >= v_posting_date)
    ) THEN
      RAISE EXCEPTION
        'DIMENSION_INVALID: project_id % is inactive, date-expired, '
        'or not found for tenant %.',
        NEW.project_id, NEW.tenant_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_jl_validate_dimensions_fn() IS 'BEFORE INSERT trigger function for document.journal_line. Validates cost_center_id, profit_center_id, and project_id against their master tables — must be active (is_active=true) and within valid_from/valid_to window relative to the posting_date. Fires after trg_jl_sync_from_header so posting_date is already populated.';

CREATE OR REPLACE FUNCTION document.trg_jl_validate_party()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_exists boolean;
BEGIN
    IF NEW.party_type IS NULL THEN RETURN NEW; END IF;

    CASE NEW.party_type
        WHEN 'customer' THEN
            SELECT EXISTS (
                SELECT 1 FROM master.customer
                WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id
            ) INTO v_exists;

        WHEN 'supplier' THEN
            SELECT EXISTS (
                SELECT 1 FROM master.supplier
                WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id
            ) INTO v_exists;

        WHEN 'employee' THEN
            SELECT EXISTS (
                SELECT 1 FROM master.employee
                WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id
            ) INTO v_exists;

        WHEN 'company_code' THEN
            SELECT EXISTS (
                SELECT 1 FROM master.company_code
                WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id
            ) INTO v_exists;

        WHEN 'principal' THEN
            SELECT EXISTS (
                SELECT 1 FROM master.principal
                WHERE id = NEW.party_id AND tenant_id = NEW.tenant_id
            ) INTO v_exists;

        ELSE
            RAISE EXCEPTION 'journal_line: unknown party_type "%"',
                NEW.party_type USING ERRCODE = 'check_violation';
    END CASE;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'journal_line: party_id (%) not found in %.% for tenant %',
            NEW.party_id, 'master', NEW.party_type, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_jl_validate_party() IS 'Polymorphic FK validation for journal_line.party_type + party_id. Dispatches to master.customer, master.supplier, master.employee, master.company_code, or master.principal based on party_type. Validates existence + tenant isolation. Same pattern as owner_type.';

CREATE OR REPLACE FUNCTION document.trg_jl_validate_posting_controls_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'master', 'pg_catalog'
AS $function$
DECLARE
  v_ctrl       record;
  v_je_source  text;
BEGIN
  SELECT ga.status AS account_status,
         ga.node_type,
         COALESCE((ga.metadata->>'_journal_postable')::boolean, true) AS journal_postable,
         COALESCE((coa.metadata->>'_operating_coa')::boolean, true) AS operating_coa,
         cca.id AS assignment_id,
         COALESCE(cga.posting_allowed, true) AS posting_allowed,
         COALESCE(cga.blocked_for_manual, false) AS blocked_for_manual,
         COALESCE(cga.blocked_for_auto, false) AS blocked_for_auto
    INTO v_ctrl
    FROM master.gl_account ga
    JOIN master.chart_of_account coa
      ON coa.tenant_id = ga.tenant_id
     AND coa.id = ga.chart_of_account_id
    LEFT JOIN master.company_code_chart_assignment cca
      ON cca.tenant_id = ga.tenant_id
     AND cca.company_code_id = NEW.company_code_id
     AND cca.chart_of_account_id = ga.chart_of_account_id
     AND cca.assignment_type = 'operating'
     AND cca.status = 'active'
    LEFT JOIN master.company_code_gl_account cga
      ON cga.tenant_id = NEW.tenant_id
     AND cga.company_code_id = NEW.company_code_id
     AND cga.gl_account_id = NEW.gl_account_id
   WHERE ga.tenant_id = NEW.tenant_id
     AND ga.id = NEW.gl_account_id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'ACCOUNT_NOT_FOUND: GL account % was not found for tenant %.',
      NEW.gl_account_id, NEW.tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_ctrl.account_status <> 'active'
     OR v_ctrl.node_type <> 'posting'
     OR NOT v_ctrl.journal_postable
     OR NOT v_ctrl.operating_coa
     OR v_ctrl.assignment_id IS NULL THEN
    RAISE EXCEPTION
      'ACCOUNT_NOT_POSTABLE: GL account % is not postable for company %. Use an active posting account from the company operating COA.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_ctrl.posting_allowed THEN
    RAISE EXCEPTION
      'ACCOUNT_POSTING_BLOCKED: GL account % is blocked for posting in company %.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT lower(je.source_doc_type)
    INTO v_je_source
    FROM document.journal_entry je
   WHERE je.id        = NEW.journal_entry_id
     AND je.tenant_id = NEW.tenant_id
   LIMIT 1;

  IF v_ctrl.blocked_for_manual AND v_je_source = 'manual' THEN
    RAISE EXCEPTION
      'ACCOUNT_BLOCKED_MANUAL: GL account % is blocked for manual posting in company %.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_ctrl.blocked_for_auto AND COALESCE(v_je_source, '') <> 'manual' THEN
    RAISE EXCEPTION
      'ACCOUNT_BLOCKED_AUTO: GL account % is blocked for automatic posting in company %.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_jl_validate_posting_controls_fn() IS 'BEFORE INSERT trigger function for document.journal_line. Validates posting_allowed + blocked_for_manual/auto against master.company_code_gl_account before accepting a journal line.';

CREATE OR REPLACE FUNCTION document.trg_jlr_append_only_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_je_status text;
BEGIN
    SELECT je.status
      INTO v_je_status
      FROM document.journal_line jl
      JOIN document.journal_entry je
        ON je.tenant_id = jl.tenant_id
       AND je.id = jl.journal_entry_id
     WHERE jl.tenant_id = OLD.tenant_id
       AND jl.id = OLD.journal_line_id;

    IF v_je_status IN ('draft', 'created') THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'journal_line_reference is append-only after journal entry submission; create a compensating reference instead'
        USING ERRCODE = 'check_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_journal_line_sync_from_header()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_je  document.journal_entry%ROWTYPE;
BEGIN
    SELECT *
      INTO STRICT v_je
      FROM document.journal_entry je
     WHERE je.id = NEW.journal_entry_id
       AND je.tenant_id = NEW.tenant_id;

    NEW.company_code_id       := v_je.company_code_id;
    NEW.book_id               := v_je.book_id;
    NEW.fiscal_period_id      := v_je.fiscal_period_id;
    NEW.fiscal_year           := v_je.fiscal_year;
    NEW.period_number         := v_je.period_number;
    NEW.posting_date          := v_je.posting_date;
    NEW.base_currency         := v_je.base_currency;
    NEW.transaction_currency  := COALESCE(NEW.transaction_currency, v_je.transaction_currency);

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_journal_line_sync_from_header() IS 'BEFORE INSERT trigger on document.journal_line. Copies company_code_id, book_id, fiscal_period_id, fiscal_year, period_number, posting_date, and base_currency from the parent journal_entry.';

CREATE OR REPLACE FUNCTION document.trg_pe_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'control', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_actor uuid;
    v_num   text;
BEGIN
    v_actor := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    NEW.created_by := COALESCE(v_actor, NEW.created_by);

    IF NEW.payment_number IS NULL OR btrim(NEW.payment_number) = '' THEN
        BEGIN
            v_num := control.next_entity_number(
                NEW.tenant_id,
                'payment_entry',
                'document_no',
                NEW.company_code_id,
                NEW.fiscal_year,
                NEW.period_number,
                NULL,
                COALESCE(NEW.posting_date, CURRENT_DATE)
            );
        EXCEPTION WHEN OTHERS THEN
            v_num := NULL;
        END;

        NEW.payment_number := COALESCE(
            v_num,
            'PAY-' || NEW.fiscal_year::text || '-' || substring(shared.uuidv7()::text from 1 for 8)
        );
    END IF;

    IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
        NEW.code := NEW.payment_number;
    END IF;
    IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
        NEW.name := NEW.payment_number;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_people_leave_balance_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'LEAVE_BALANCE_APPEND_ONLY: create an offsetting leave_balance_entry instead of modifying or deleting an existing entry';
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_people_leave_request_no_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
BEGIN
    IF NEW.status IN ('submitted', 'approved')
       AND EXISTS (
           SELECT 1
             FROM document.leave_request lr
            WHERE lr.tenant_id = NEW.tenant_id
              AND lr.employee_id = NEW.employee_id
              AND lr.status IN ('submitted', 'approved')
              AND lr.id IS DISTINCT FROM NEW.id
              AND daterange(lr.start_date, lr.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
       ) THEN
        RAISE EXCEPTION 'LEAVE_REQUEST_OVERLAP: employee % already has an overlapping submitted or approved leave request', NEW.employee_id;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_people_payroll_period_one_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_pay_frequency text;
BEGIN
    SELECT pg.pay_frequency
      INTO v_pay_frequency
      FROM master.pay_group pg
     WHERE pg.tenant_id = NEW.tenant_id
       AND pg.id = NEW.pay_group_id;

    IF v_pay_frequency = 'monthly' AND NEW.period_number > 12 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: monthly pay groups allow periods 1-12';
    ELSIF v_pay_frequency = 'semi_monthly' AND NEW.period_number > 24 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: semi_monthly pay groups allow periods 1-24';
    ELSIF v_pay_frequency = 'bi_weekly' AND NEW.period_number > 27 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: bi_weekly pay groups allow periods 1-27';
    ELSIF v_pay_frequency = 'weekly' AND NEW.period_number > 53 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: weekly pay groups allow periods 1-53';
    ELSIF v_pay_frequency = 'quarterly' AND NEW.period_number > 4 THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_INVALID_NUMBER: quarterly pay groups allow periods 1-4';
    END IF;

    IF NEW.status IN ('open', 'processing')
       AND EXISTS (
           SELECT 1
             FROM document.payroll_period pp
            WHERE pp.tenant_id = NEW.tenant_id
              AND pp.pay_group_id = NEW.pay_group_id
              AND pp.status IN ('open', 'processing')
              AND pp.id IS DISTINCT FROM NEW.id
       ) THEN
        RAISE EXCEPTION 'PAYROLL_PERIOD_OPEN_EXISTS: pay_group % already has an open or processing payroll period', NEW.pay_group_id;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_people_payroll_result_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.status = 'posted' THEN
        RAISE EXCEPTION 'PAYROLL_RESULT_POSTED_IMMUTABLE: posted payroll_result rows cannot be deleted';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status = 'posted'
       AND NEW.status IS DISTINCT FROM 'voided' THEN
        RAISE EXCEPTION 'PAYROLL_RESULT_POSTED_IMMUTABLE: posted payroll_result rows can only transition to voided';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_people_payroll_result_line_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_status text;
    v_tenant_id uuid;
    v_payroll_result_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_tenant_id := OLD.tenant_id;
        v_payroll_result_id := OLD.payroll_result_id;
    ELSE
        v_tenant_id := NEW.tenant_id;
        v_payroll_result_id := NEW.payroll_result_id;
    END IF;

    SELECT pr.status
      INTO v_status
      FROM document.payroll_result pr
     WHERE pr.tenant_id = v_tenant_id
       AND pr.id = v_payroll_result_id;

    IF v_status = 'posted' THEN
        RAISE EXCEPTION 'PAYROLL_RESULT_LINE_POSTED_IMMUTABLE: lines for a posted payroll_result cannot be modified';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_pi_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'master', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_actor    uuid;
    v_fy       smallint;
    v_num      text;
BEGIN
    -- 1. created_by from session GUC
    v_actor := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    NEW.created_by := COALESCE(v_actor, NEW.created_by);

    -- 2. Auto-generate code if blank
    IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
        -- Determine fiscal year for the number series
        v_fy := EXTRACT(YEAR FROM COALESCE(NEW.posting_date, CURRENT_DATE))::smallint;

        BEGIN
            v_num := control.next_entity_number(
                NEW.tenant_id,
                'purchase_invoice',
                'code',
                NEW.company_code_id,
                v_fy,
                NEW.period_number,
                NULL,
                COALESCE(NEW.posting_date, CURRENT_DATE)
            );
        EXCEPTION WHEN OTHERS THEN
            v_num := NULL;
        END;

        -- Fallback if entity numbering config is not available yet
        IF v_num IS NULL THEN
            v_num := 'PI-' || to_char(now(), 'YYYY') || '-'
                     || lpad(nextval('document.upupr_code_seq')::text, 6, '0');
        END IF;

        NEW.code := v_num;
    END IF;

    -- 3. code mirrors code for entity-engine display
    NEW.code := NEW.code;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_pi_derive_dates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_due_rule    text;
    v_due_days    integer;
    v_grace_days  integer;
    v_resolved_fiscal_year smallint;
    v_resolved_period_number smallint;
BEGIN
    -- ─── 1. received_date defaults to today ──────────────────────────────
    IF NEW.received_date IS NULL THEN
        NEW.received_date := CURRENT_DATE;
    END IF;

    -- ─── 3. baseline_date defaults to document_date ──────────────────────
    --     Credit-term clock starts at the document/invoice date by convention
    IF NEW.baseline_date IS NULL AND NEW.supplier_invoice_date IS NOT NULL THEN
        NEW.baseline_date := NEW.supplier_invoice_date;
    END IF;

    -- ─── 4. posting_date defaults to document_date ───────────────────────
    --     Period-gate trigger may bump forward if document_date falls in a
    --     closed period — that runs after this trigger.
    IF NEW.posting_date IS NULL AND NEW.supplier_invoice_date IS NOT NULL THEN
        NEW.posting_date := NEW.supplier_invoice_date;
    END IF;

    -- ─── 5. due_date = baseline + payment_term.due_days (NET_DAYS only) ──
    --     Handles the dominant payment-term shape. EOM / FIXED_DAY / COD /
    --     PREPAID rules need richer math (next month-end, specific DOM,
    --     immediate, pre-payment) — service layer / payment-term resolver
    --     will own those when the AP module gets advanced terms support.
    IF NEW.due_date IS NULL
       AND NEW.payment_term_id IS NOT NULL
       AND NEW.baseline_date IS NOT NULL
    THEN
        SELECT pt.due_rule_type, pt.due_days, pt.grace_days
          INTO v_due_rule, v_due_days, v_grace_days
          FROM master.payment_term pt
         WHERE pt.id = NEW.payment_term_id
           AND pt.tenant_id = NEW.tenant_id
         LIMIT 1;

        IF v_due_rule = 'NET_DAYS' AND v_due_days IS NOT NULL THEN
            NEW.due_date := NEW.baseline_date
                            + v_due_days
                            + COALESCE(v_grace_days, 0);
        ELSIF v_due_rule = 'COD' OR v_due_rule = 'PREPAID' THEN
            -- Due immediately on baseline date (no payment-term days)
            NEW.due_date := NEW.baseline_date;
        END IF;
        -- EOM / FIXED_DAY left unset — service-layer/UI must compute these
    END IF;

    -- ─── 6. fiscal scope from generated company periods ─────────────────
    -- Special periods are excluded because adjustment/closing periods can
    -- share a date with the final normal period and require explicit choice.
    IF NEW.posting_date IS NOT NULL
       AND NEW.company_code_id IS NOT NULL
       AND (NEW.fiscal_year IS NULL OR NEW.period_number IS NULL)
    THEN
        SELECT p.fiscal_year, p.period_number
          INTO v_resolved_fiscal_year, v_resolved_period_number
          FROM master.resolve_fiscal_period(
              NEW.tenant_id,
              NEW.company_code_id,
              NEW.posting_date,
              false
          ) p;

        NEW.fiscal_year := COALESCE(NEW.fiscal_year, v_resolved_fiscal_year);
        NEW.period_number := COALESCE(NEW.period_number, v_resolved_period_number);
    END IF;

    RETURN NEW;
END $function$;

COMMENT ON FUNCTION "document".trg_pi_derive_dates() IS 'Phase 4 P1c: BEFORE INSERT/UPDATE on document.purchase_invoice. Fills NULL derived dates (document_date, baseline_date, posting_date, due_date, received_date) and fiscal scope (fiscal_year, period_number) from supplier_invoice_date + payment_term + generated company fiscal periods. document_date is the canonical "invoice date" column (UI alias "invoice_date" maps to it). Only fills NULLs; explicit user values are preserved.';

CREATE OR REPLACE FUNCTION document.trg_pi_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
BEGIN
    -- Allow status changes by the action dispatcher (status column only)
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;
    -- Block all other mutations once posted/reversed/cancelled/fully_paid
    IF OLD.status IN ('posted','reversed','cancelled','fully_paid','rejected') THEN
        RAISE EXCEPTION
            'purchase_invoice % is in status ''%'' and cannot be modified directly. '
            'Use an action operation to change its state.',
            OLD.id, OLD.status
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_pi_lifecycle_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'log', 'control', 'pg_catalog'
AS $function$
DECLARE
    v_event_id      uuid     := shared.uuidv7();
    v_lc_id         uuid;
    v_from_state    uuid;
    v_to_state      uuid;
    v_operation     text;
    v_actor         uuid;
    v_created_by    uuid;
    v_prev_revision smallint;
    v_revision_no   smallint;
    v_revision_lbl  text;
    v_change_type   text;
    v_payload       jsonb;
BEGIN
    -- Only fire when status actually changes
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NULL; END IF;

    v_actor := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.status_changed_by,
        NEW.updated_by,
        OLD.updated_by,
        NEW.created_by
    );
    v_created_by := COALESCE(v_actor, NEW.created_by, OLD.created_by);

    -- Resolve lifecycle + state ids for FK integrity
    SELECT lc.id INTO v_lc_id
      FROM control.lifecycle lc
     WHERE lc.code = 'purchase_invoice'
       AND lc.tenant_id IS NULL
     LIMIT 1;

    IF v_lc_id IS NOT NULL THEN
        SELECT ls.id INTO v_from_state
          FROM control.lifecycle_state ls
         WHERE ls.lifecycle_id = v_lc_id AND ls.code = OLD.status LIMIT 1;

        SELECT ls.id INTO v_to_state
          FROM control.lifecycle_state ls
         WHERE ls.lifecycle_id = v_lc_id AND ls.code = NEW.status LIMIT 1;

        SELECT lt.operation_code INTO v_operation
          FROM control.lifecycle_transition lt
         WHERE lt.lifecycle_id = v_lc_id
           AND lt.from_state_id IS NOT DISTINCT FROM v_from_state
           AND lt.to_state_id   IS NOT DISTINCT FROM v_to_state
         LIMIT 1;
    END IF;

    v_operation := COALESCE(v_operation, CASE NEW.status
        WHEN 'pending_approval' THEN 'submit'
        WHEN 'approved'         THEN 'approve'
        WHEN 'rejected'         THEN 'deny'
        WHEN 'posted'           THEN 'post'
        WHEN 'reversed'         THEN 'reverse'
        WHEN 'cancelled'        THEN 'cancel'
        WHEN 'amending'         THEN 'amend'
        WHEN 'on_hold'          THEN 'hold'
        WHEN 'draft'            THEN 'reopen'
        ELSE                         'status_change'
    END);

    -- Revision counter: 0 = original creation flow.
    -- Increments only when entering 'amending' (each new amendment cycle).
    SELECT COALESCE(MAX(ell.revision_no), 0) INTO v_prev_revision
      FROM log.entity_lifecycle_log ell
     WHERE ell.entity_type = 'purchase_invoice'
       AND ell.entity_id   = NEW.id;

    v_revision_no  := CASE WHEN NEW.status = 'amending'
                           THEN v_prev_revision + 1
                           ELSE v_prev_revision
                      END;
    v_revision_lbl := CASE WHEN v_revision_no = 0 THEN 'Original'
                           ELSE 'Amendment ' || v_revision_no
                      END;

    -- change_type: amendment cycle rows = 'amendment', reversal terminal = 'reversal', else 'original'
    v_change_type := CASE
        WHEN v_revision_no > 0                THEN 'amendment'
        WHEN NEW.status = 'reversed'          THEN 'reversal'
        ELSE                                       'original'
    END;

    v_payload := jsonb_build_object(
        'snapshot', jsonb_build_object(
            'code',  NEW.code,
            'status',          NEW.status,
            'total_amount',    NEW.total_amount,
            'currency_code',   NEW.currency_code,
            'company_code_id', NEW.company_code_id
        ),
        'change_summary',  format('Status changed from %s to %s',
                               replace(OLD.status, '_', ' '),
                               replace(NEW.status, '_', ' ')),
        'changed_fields',  jsonb_build_array('status'),
        'change_type',     v_change_type,
        'before',          jsonb_build_object('status', OLD.status),
        'after',           jsonb_build_object('status', NEW.status)
    );

    INSERT INTO log.entity_lifecycle_log (
        id, tenant_id, entity_type, entity_id,
        lifecycle_id, operation_code,
        from_status, to_status, from_state_id, to_state_id,
        actor_id, actor_type, company_code_id,
        remarks, payload,
        revision_no, revision_label,
        log_type, created_by
    ) VALUES (
        v_event_id, NEW.tenant_id, 'purchase_invoice', NEW.id,
        v_lc_id, v_operation,
        OLD.status, NEW.status, v_from_state, v_to_state,
        v_actor, 'principal', NEW.company_code_id,
        format('Invoice %s status changed from %s to %s',
               COALESCE(NEW.code, NEW.id::text), OLD.status, NEW.status),
        v_payload,
        v_revision_no, v_revision_lbl,
        'business', v_created_by
    );

    -- Dual-write: same event id used as correlation_id in audit_log
    INSERT INTO log.audit_log (
        id, tenant_id, entity_type, entity_id,
        operation, actor_id, actor_type, company_code_id,
        old_values, new_values, changed_fields,
        log_type, created_by
    ) VALUES (
        v_event_id, NEW.tenant_id, 'purchase_invoice', NEW.id,
        'status_change', v_actor, 'principal', NEW.company_code_id,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        ARRAY['status'],
        'business', v_created_by
    );

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_pi_status_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'control', 'pg_catalog'
AS $function$
DECLARE
    v_allowed_transitions text[];
BEGIN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;

    -- Fetch allowed transitions from compiled snapshot
    SELECT ARRAY(
        SELECT jsonb_array_elements_text(
            compiled_json->'allowed_transitions'->OLD.status
        )
    )
    INTO v_allowed_transitions
    FROM snapshot.status_route
    WHERE entity_name = 'purchase_invoice'
    ORDER BY updated_at DESC
    LIMIT 1;

    -- If snapshot compiled, validate; otherwise allow (fallback path)
    IF v_allowed_transitions IS NOT NULL
       AND NEW.status <> ALL(v_allowed_transitions) THEN
        RAISE EXCEPTION
            'Status transition % → % is not permitted for purchase_invoice %',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_pil_derive_ship_jurisdictions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Ship-to
    IF NEW.shipto_address_id IS DISTINCT FROM
       COALESCE(OLD.shipto_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipto_address_id IS NULL THEN
            NEW.to_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.to_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id
               AND a.id        = NEW.shipto_address_id;
        END IF;
    END IF;

    -- Ship-from (symmetric)
    IF NEW.shipfrom_address_id IS DISTINCT FROM
       COALESCE(OLD.shipfrom_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipfrom_address_id IS NULL THEN
            NEW.from_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.from_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id
               AND a.id        = NEW.shipfrom_address_id;
        END IF;
    END IF;

    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION document.trg_pil_freeze_jurisdiction_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_parent_status text;
BEGIN
    SELECT status INTO v_parent_status
      FROM document.purchase_invoice
     WHERE id = NEW.purchase_invoice_id;

    IF v_parent_status IS DISTINCT FROM 'draft' AND v_parent_status IS DISTINCT FROM 'rejected' THEN
        IF (NEW.to_tax_jurisdiction_id   IS DISTINCT FROM OLD.to_tax_jurisdiction_id)
        OR (NEW.from_tax_jurisdiction_id IS DISTINCT FROM OLD.from_tax_jurisdiction_id)
        OR (NEW.site_id                  IS DISTINCT FROM OLD.site_id)
        OR (NEW.shipto_address_id        IS DISTINCT FROM OLD.shipto_address_id)
        OR (NEW.shipfrom_address_id      IS DISTINCT FROM OLD.shipfrom_address_id)
        OR (NEW.tax_group_id             IS DISTINCT FROM OLD.tax_group_id)
        THEN
            RAISE EXCEPTION 'PIL_SNAPSHOT_FROZEN: line jurisdiction/tax snapshot is immutable when parent status=% (line id=%)',
                v_parent_status, OLD.id
            USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION document.trg_pil_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status
    FROM document.purchase_invoice
    WHERE id = COALESCE(NEW.purchase_invoice_id, OLD.purchase_invoice_id);

    IF v_status NOT IN ('draft', 'proforma') THEN
        RAISE EXCEPTION
            'Cannot modify lines of purchase_invoice in status ''%''. '
            'Invoice must be in draft or proforma status.',
            v_status
            USING ERRCODE = 'P0001';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_pil_sync_header()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
DECLARE
    v_invoice_id uuid;
BEGIN
    v_invoice_id := COALESCE(NEW.purchase_invoice_id, OLD.purchase_invoice_id);
    PERFORM document.fn_refresh_purchase_invoice_totals(v_invoice_id);
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_poc_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    IF OLD.status IN ('rejected','cancelled','changes_rejected')
       OR OLD.terminal_status IS NOT NULL THEN
        RAISE EXCEPTION
            'purchase_order_confirmation % is in terminal status ''%'' and cannot be modified directly. Use an action operation.',
            OLD.id, COALESCE(OLD.terminal_status, OLD.status)
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_pr_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    IF OLD.status IN ('rejected','fully_converted','closed','cancelled')
       OR OLD.terminal_status IS NOT NULL THEN
        RAISE EXCEPTION
            'purchase_requisition % is in terminal status ''%'' and cannot be modified directly. Use an action operation.',
            OLD.id, COALESCE(OLD.terminal_status, OLD.status)
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_pr_line_default_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_scheduled_date date;
BEGIN
    -- Skip if a schedule already exists for this line (writer service ran first)
    IF EXISTS (
        SELECT 1 FROM document.schedule_line
         WHERE tenant_id          = NEW.tenant_id
           AND source_doc_type    = 'purchase_requisition_line'
           AND source_line_id     = NEW.id
           AND is_current_version = true
    ) THEN
        RETURN NEW;
    END IF;

    v_scheduled_date := COALESCE(NEW.required_by_date, CURRENT_DATE);

    INSERT INTO document.schedule_line (
        tenant_id, source_doc_type, source_doc_id, source_line_id,
        schedule_no, schedule_kind,
        scheduled_quantity, scheduled_date, currency_code,
        version_number, is_current_version,
        metadata, status, created_by
    ) VALUES (
        NEW.tenant_id,
        'purchase_requisition_line',
        NEW.purchase_requisition_id,
        NEW.id,
        1::smallint,
        'delivery',
        NEW.quantity,
        v_scheduled_date,
        NEW.currency_code,
        1,
        true,
        jsonb_build_object('source', 'trigger_default'),
        'active',
        NEW.created_by
    );

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_pr_line_default_schedule() IS 'AFTER INSERT on purchase_requisition_line — creates default delivery schedule_line if not already present.';

CREATE OR REPLACE FUNCTION document.trg_pr_line_refresh_default_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_count integer;
    v_id    uuid;
BEGIN
    SELECT count(*), max(id::text)::uuid
      INTO v_count, v_id
      FROM document.schedule_line
     WHERE tenant_id          = NEW.tenant_id
       AND source_doc_type    = 'purchase_requisition_line'
       AND source_line_id     = NEW.id
       AND is_current_version = true
       AND terminal_status    IS NULL
       AND metadata->>'source' IN ('trigger_default', 'trigger_copy_from_pr');

    IF v_count <> 1 THEN
        RETURN NEW;
    END IF;

    UPDATE document.schedule_line
       SET scheduled_quantity = NEW.quantity,
           scheduled_date     = COALESCE(NEW.required_by_date, scheduled_date),
           currency_code      = NEW.currency_code,
           updated_at         = now(),
           updated_by         = COALESCE(NEW.updated_by, NEW.created_by),
           row_version        = row_version + 1
     WHERE id = v_id;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_pr_line_refresh_default_schedule() IS 'AFTER UPDATE on PR line — refreshes the single trigger-default schedule_line in place and no-ops when multiple schedules or writer-service schedules exist.';

CREATE OR REPLACE FUNCTION document.trg_rcp_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    IF OLD.status IN ('posted','reversed','cancelled')
       OR OLD.terminal_status IS NOT NULL THEN
        RAISE EXCEPTION
            'receipt % is in terminal status ''%'' and cannot be modified directly. Use an action operation.',
            OLD.id, COALESCE(OLD.terminal_status, OLD.status)
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_schedule_line_fulfilled_from_rcpl()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Recompute against the NEW commitment_line on INSERT/UPDATE
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.commitment_line_id IS NOT NULL THEN
        PERFORM document.fn_schedule_line_recompute_commitment_line(
            NEW.commitment_line_id,
            NEW.tenant_id
        );
    END IF;

    -- Also recompute the OLD commitment_line on UPDATE (if it changed) or DELETE
    IF TG_OP IN ('UPDATE', 'DELETE')
       AND OLD.commitment_line_id IS NOT NULL
       AND (TG_OP = 'DELETE' OR OLD.commitment_line_id IS DISTINCT FROM NEW.commitment_line_id)
    THEN
        PERFORM document.fn_schedule_line_recompute_commitment_line(
            OLD.commitment_line_id,
            OLD.tenant_id
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_schedule_line_fulfilled_from_sshl()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.commitment_line_id IS NOT NULL THEN
        PERFORM document.fn_schedule_line_recompute_commitment_line(
            NEW.commitment_line_id,
            NEW.tenant_id
        );
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE')
       AND OLD.commitment_line_id IS NOT NULL
       AND (TG_OP = 'DELETE' OR OLD.commitment_line_id IS DISTINCT FROM NEW.commitment_line_id)
    THEN
        PERFORM document.fn_schedule_line_recompute_commitment_line(
            OLD.commitment_line_id,
            OLD.tenant_id
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_seed_gift_athq_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_company_code text;
    v_company_code_id uuid;
BEGIN
    IF NEW.company_code_id IS NULL THEN
        SELECT cc.id INTO v_company_code_id
          FROM master.company_code cc
         WHERE cc.tenant_id = NEW.tenant_id
           AND cc.code = 'ATHQ';

        IF v_company_code_id IS NULL THEN
            RAISE EXCEPTION 'SEED_GIFT_SCOPE: company_code ATHQ was not found for tenant %', NEW.tenant_id
                USING ERRCODE = 'SG001';
        END IF;

        NEW.company_code_id := v_company_code_id;
    END IF;

    SELECT cc.code INTO v_company_code
      FROM master.company_code cc
     WHERE cc.tenant_id = NEW.tenant_id
       AND cc.id = NEW.company_code_id;

    IF v_company_code IS DISTINCT FROM 'ATHQ' THEN
        RAISE EXCEPTION 'SEED_GIFT_SCOPE: prototype rows are restricted to company_code ATHQ'
            USING ERRCODE = 'SG001';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "document".trg_seed_gift_athq_only() IS 'Prototype guard: document.seed_gift accepts rows only for company_code ATHQ.';

CREATE OR REPLACE FUNCTION document.trg_ssh_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'pg_catalog'
AS $function$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    IF OLD.status IN ('posted','reversed','cancelled')
       OR OLD.terminal_status IS NOT NULL THEN
        RAISE EXCEPTION
            'service_sheet % is in terminal status ''%'' and cannot be modified directly. Use an action operation.',
            OLD.id, COALESCE(OLD.terminal_status, OLD.status)
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_sshl_derive_ship_jurisdictions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.shipto_address_id IS DISTINCT FROM
       COALESCE(OLD.shipto_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipto_address_id IS NULL THEN
            NEW.to_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.to_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.shipto_address_id;
        END IF;
    END IF;

    IF NEW.shipfrom_address_id IS DISTINCT FROM
       COALESCE(OLD.shipfrom_address_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
        IF NEW.shipfrom_address_id IS NULL THEN
            NEW.from_tax_jurisdiction_id := NULL;
        ELSE
            SELECT a.tax_jurisdiction_id
              INTO NEW.from_tax_jurisdiction_id
              FROM master.address a
             WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.shipfrom_address_id;
        END IF;
    END IF;

    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION document.trg_stocktake_line_denorm_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'document', 'pg_temp'
AS $function$
DECLARE
    v_stocktake_id uuid;
BEGIN
    v_stocktake_id := COALESCE(NEW.stocktake_id, OLD.stocktake_id);

    UPDATE document.stocktake
       SET total_line_count    = (
               SELECT count(*)
                 FROM document.stocktake_line
                WHERE stocktake_id = v_stocktake_id
           ),
           variance_line_count = (
               SELECT count(*)
                 FROM document.stocktake_line
                WHERE stocktake_id = v_stocktake_id
                  AND (counted_qty - system_qty) <> 0
           )
     WHERE id = v_stocktake_id;

    RETURN NULL; -- AFTER trigger; return value ignored
END;
$function$;

COMMENT ON FUNCTION "document".trg_stocktake_line_denorm_counts() IS 'AFTER INSERT/UPDATE/DELETE trigger on stocktake_line. Recomputes total_line_count and variance_line_count on the parent stocktake row. Uses COALESCE(NEW.stocktake_id, OLD.stocktake_id) to handle DELETE correctly.';

CREATE OR REPLACE FUNCTION document.trg_upupr_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'log', 'document'
AS $function$
DECLARE
    v_op        text;
    v_actor     uuid;
    v_fields    text[];
BEGIN
    v_actor := nullif(current_setting('app.current_principal_id', true), '')::uuid;

    IF TG_OP = 'INSERT' THEN
        v_op := 'insert';
        INSERT INTO log.audit_log
            (entity_type, entity_id, operation, actor_id, new_values, log_type, created_by)
        VALUES ('user_profile_update_request', NEW.id, v_op, v_actor,
                to_jsonb(NEW), 'business', COALESCE(v_actor, NEW.created_by));

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            v_op := 'status_change';
        ELSE
            v_op := 'update';
        END IF;
        SELECT array_agg(key) INTO v_fields
        FROM jsonb_each(to_jsonb(NEW)) n
        JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
        WHERE n.value IS DISTINCT FROM o.value;

        INSERT INTO log.audit_log
            (entity_type, entity_id, operation, actor_id,
             old_values, new_values, changed_fields, log_type, created_by)
        VALUES ('user_profile_update_request', NEW.id, v_op, v_actor,
                to_jsonb(OLD), to_jsonb(NEW), v_fields, 'business',
                COALESCE(v_actor, NEW.updated_by));
    END IF;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_upupr_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document'
AS $function$
DECLARE
    v_principal_name  text;
    v_year            text := to_char(now(), 'YYYY');
    v_seq             bigint;
BEGIN
    -- 1. created_by from session
    NEW.created_by  := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.created_by
    );

    -- 2. requested_by defaults to created_by (allow_on_behalf_of=false for UPUPR)
    NEW.requested_by := NEW.created_by;

    -- 3. principal_id defaults to created_by
    NEW.principal_id := COALESCE(NEW.principal_id, NEW.created_by);

    -- 4. code — sequence-based UPUPR-YYYY-NNNNN
    IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
        BEGIN
            NEW.code := control.next_entity_number(
                NEW.tenant_id,
                'user_profile_update_request',
                'code',
                NULL,
                EXTRACT(YEAR FROM CURRENT_DATE)::smallint,
                EXTRACT(MONTH FROM CURRENT_DATE)::smallint,
                NULL,
                CURRENT_DATE
            );
        EXCEPTION WHEN OTHERS THEN
            SELECT nextval('document.upupr_code_seq') INTO v_seq;
            NEW.code := 'UPUPR-' || v_year || '-' || lpad(v_seq::text, 5, '0');
        END;
    END IF;

    -- 5. name — derived from principal display name + date
    SELECT COALESCE(pp.display_name, p.name)
      INTO v_principal_name
      FROM master.principal p
 LEFT JOIN master.principal_profile pp ON pp.principal_id = p.id
     WHERE p.id = NEW.requested_by AND p.tenant_id = NEW.tenant_id;
    NEW.name := COALESCE(v_principal_name, 'Unknown')
        || ' — Profile Update — ' || to_char(now(), 'YYYY-MM-DD');

    -- 6. principal_snapshot NULL on insert (populated on draft→submitted)
    NEW.principal_snapshot := NULL;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_upupr_lifecycle_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'log', 'control'
AS $function$
DECLARE
    v_lc_id  uuid;
    v_actor  uuid;
BEGIN
    IF OLD.status = NEW.status THEN RETURN NULL; END IF;
    v_actor := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'upupr';

    INSERT INTO log.entity_lifecycle_log
        (entity_type, entity_id, lifecycle_id,
         from_status, to_status, actor_id, log_type, created_by)
    VALUES
        ('user_profile_update_request', NEW.id, v_lc_id,
         OLD.status, NEW.status, v_actor, 'business',
         COALESCE(v_actor, NEW.status_changed_by));
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION document.trg_upupr_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'document', 'master'
AS $function$
DECLARE
    v_actor uuid;
BEGIN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;

    v_actor := nullif(current_setting('app.current_principal_id', true), '')::uuid;

    -- Always set status change metadata
    NEW.status_changed_at := now();
    NEW.status_changed_by := v_actor;

    -- draft → submitted: capture principal_snapshot
    IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
        SELECT jsonb_build_object(
            'captured_at',  now(),
            'profile',      to_jsonb(pp.*),
            'groups',       COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                    'group_id', g.id, 'group_code', g.code, 'group_name', g.name))
                 FROM master.auth_group_member pgm
                 JOIN master.auth_group g ON g.id = pgm.group_id
                 WHERE pgm.principal_id = NEW.principal_id
                   AND pgm.tenant_id = NEW.tenant_id
                   AND pgm.status = 'active'
                   AND pgm.effective_from <= now()
                   AND (pgm.effective_until IS NULL OR pgm.effective_until > now())
                   AND g.status = 'active'), '[]'::jsonb),
            'default_company_code_id', pp.default_company_code_id
        )
        INTO NEW.principal_snapshot
        FROM master.principal_profile pp
        WHERE pp.principal_id = NEW.principal_id
          AND pp.tenant_id = NEW.tenant_id;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION document.validate_purchase_invoice_waterfall(p_invoice_id uuid, p_jurisdiction text DEFAULT 'NEUTRAL'::text, p_tolerance numeric DEFAULT 0.01)
 RETURNS TABLE(violation_code text, detail jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    r record;
    computed_total  numeric(18,4);
    drift           numeric(18,4);
BEGIN
    SELECT COALESCE((
               SELECT SUM(pil.net_amount)
                 FROM document.purchase_invoice_line pil
                WHERE pil.purchase_invoice_id = pi.id
                  AND pil.tenant_id = pi.tenant_id
           ), 0) AS subtotal_amount,
           pi.tax_amount,
           coalesce(pi.withholding_tax_amount, 0) AS wht,
           coalesce(pi.retention_amount,       0) AS ret,
           pi.total_amount,
           pi.currency_code,
           pi.base_currency_code,
           pi.exchange_rate
      INTO r
      FROM document.purchase_invoice pi
     WHERE pi.id = p_invoice_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            'INVOICE_NOT_FOUND'::text,
            jsonb_build_object('invoice_id', p_invoice_id);
        RETURN;
    END IF;

    IF p_jurisdiction = 'NEUTRAL' THEN
        -- NEUTRAL waterfall: total ≈ subtotal + tax - withholding - retention
        computed_total := r.subtotal_amount + r.tax_amount - r.wht - r.ret;
        drift := abs(r.total_amount - computed_total);

        IF drift > p_tolerance THEN
            RETURN QUERY SELECT
                'WATERFALL_NEUTRAL_DRIFT'::text,
                jsonb_build_object(
                    'invoice_id',      p_invoice_id,
                    'subtotal_amount', r.subtotal_amount,
                    'tax_amount',      r.tax_amount,
                    'withholding',     r.wht,
                    'retention',       r.ret,
                    'total_amount',    r.total_amount,
                    'expected_total',  computed_total,
                    'drift',           drift,
                    'tolerance',       p_tolerance
                );
        END IF;

        -- Currency triad consistency
        IF r.currency_code = r.base_currency_code AND r.exchange_rate <> 1.0 THEN
            RETURN QUERY SELECT
                'CURRENCY_TRIAD_INCONSISTENT'::text,
                jsonb_build_object(
                    'currency_code',      r.currency_code,
                    'base_currency_code', r.base_currency_code,
                    'exchange_rate',      r.exchange_rate
                );
        END IF;
    ELSE
        -- Unknown jurisdiction → soft violation pointing at config registry
        RETURN QUERY SELECT
            'WATERFALL_JURISDICTION_UNKNOWN'::text,
            jsonb_build_object(
                'jurisdiction',     p_jurisdiction,
                'available',        jsonb_build_array('NEUTRAL'),
                'fallback_applied', 'NEUTRAL'
            );
    END IF;

    RETURN;
END;
$function$;

COMMENT ON FUNCTION "document".validate_purchase_invoice_waterfall(p_invoice_id uuid, p_jurisdiction text, p_tolerance numeric) IS 'Returns waterfall + currency-triad violations for a purchase invoice. NEUTRAL ruleset is the initial implementation; jurisdiction-specific rules (US, IN, UK, ...) plug in via tenant config lookup in subsequent phases. Called from invoice-invariants.service.ts at submit and post phases. A CHECK constraint on the table is deferred until Decision #1 (jurisdiction model) locks.';
