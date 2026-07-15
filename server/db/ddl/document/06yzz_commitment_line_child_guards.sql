-- ============================================================================
-- document/06yzz_commitment_line_child_guards.sql
-- Concept: BLOCK-delete guards on document.commitment_line to prevent
--          orphaning polymorphic children (schedule_line, accounting_distribution,
--          pricing_component) that reference the line via
--          (source_doc_type='commitment_line', source_line_id).
--
-- Depends on: 01c_tables_commitment.sql, 01v_tables_schedule_line.sql,
--             01u_tables_pricing_component.sql, 01b_tables_journal.sql (AD).
--
-- Precedent: fn_pil_block_delete_with_active_pc in 06u_pricing_component_triggers.sql
--            (application-managed cascade; DB triggers block orphans).
--
-- Error codes (SQLSTATE):
--   CL010 — active schedule_line rows reference this commitment_line
--   CL011 — active accounting_distribution rows reference this commitment_line
--   CL012 — active pricing_component rows reference this commitment_line
--
-- Application layer responsibilities (see commitment-line-delete.service.ts):
--   1. Route guard verifies commitment.status='draft' AND received/invoiced/
--      released quantities are 0.
--   2. Service supersedes/deletes children in a single transaction:
--        a. schedule_line   → is_current_version=false, terminal_status='CANCELED'
--        b. accounting_distribution → DELETE (never posted for draft commitment)
--        c. pricing_component → DELETE (pc_supersede_pair_chk forbids partial
--                                        supersede tuple; no downstream refs)
--        d. THEN DELETE commitment_line
--   3. Any DB path that bypasses the service (bulk import, migration) is caught
--      by these triggers.
-- ============================================================================


-- =============================================================================
-- §CLG.1  schedule_line block-delete guard  (SQLSTATE CL010)
-- =============================================================================
CREATE OR REPLACE FUNCTION document.fn_cl_block_delete_with_active_schedule()
RETURNS trigger LANGUAGE plpgsql AS $$
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
$$;

COMMENT ON FUNCTION document.fn_cl_block_delete_with_active_schedule() IS
    'BEFORE DELETE on document.commitment_line: blocks with CL010 when active '
    '(is_current_version=true, terminal_status IS NULL) schedule_line rows '
    'reference the row via (source_doc_type, source_line_id). Application layer '
    'must retire schedules first (see commitment-line-delete.service.ts).';

DROP TRIGGER IF EXISTS trg_cl_block_delete_with_active_schedule ON document.commitment_line;
CREATE TRIGGER trg_cl_block_delete_with_active_schedule
    BEFORE DELETE ON document.commitment_line
    FOR EACH ROW EXECUTE FUNCTION document.fn_cl_block_delete_with_active_schedule();

COMMENT ON TRIGGER trg_cl_block_delete_with_active_schedule ON document.commitment_line IS
    'Belt-and-suspenders DB-side guard against orphaning schedule_line rows on '
    'commitment_line delete. Raises CL010 with sample schedule ids when violated.';


-- =============================================================================
-- §CLG.2  accounting_distribution block-delete guard  (SQLSTATE CL011)
-- =============================================================================
CREATE OR REPLACE FUNCTION document.fn_cl_block_delete_with_active_ad()
RETURNS trigger LANGUAGE plpgsql AS $$
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
$$;

COMMENT ON FUNCTION document.fn_cl_block_delete_with_active_ad() IS
    'BEFORE DELETE on document.commitment_line: blocks with CL011 when any '
    'accounting_distribution rows reference the row via (source_doc_type, '
    'source_line_id). Application layer must delete AD rows first.';

DROP TRIGGER IF EXISTS trg_cl_block_delete_with_active_ad ON document.commitment_line;
CREATE TRIGGER trg_cl_block_delete_with_active_ad
    BEFORE DELETE ON document.commitment_line
    FOR EACH ROW EXECUTE FUNCTION document.fn_cl_block_delete_with_active_ad();

COMMENT ON TRIGGER trg_cl_block_delete_with_active_ad ON document.commitment_line IS
    'Belt-and-suspenders DB-side guard against orphaning accounting_distribution '
    'rows on commitment_line delete. Raises CL011 with sample AD ids when violated.';


-- =============================================================================
-- §CLG.3  pricing_component block-delete guard  (SQLSTATE CL012)
-- =============================================================================
CREATE OR REPLACE FUNCTION document.fn_cl_block_delete_with_active_pc()
RETURNS trigger LANGUAGE plpgsql AS $$
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
$$;

COMMENT ON FUNCTION document.fn_cl_block_delete_with_active_pc() IS
    'BEFORE DELETE on document.commitment_line: blocks with CL012 when active '
    '(superseded_by_id IS NULL) pricing_component rows reference the row via '
    '(source_doc_type, source_line_id). Application layer must DELETE PC rows '
    'first (pc_supersede_pair_chk forbids partial supersede tuple).';

DROP TRIGGER IF EXISTS trg_cl_block_delete_with_active_pc ON document.commitment_line;
CREATE TRIGGER trg_cl_block_delete_with_active_pc
    BEFORE DELETE ON document.commitment_line
    FOR EACH ROW EXECUTE FUNCTION document.fn_cl_block_delete_with_active_pc();

COMMENT ON TRIGGER trg_cl_block_delete_with_active_pc ON document.commitment_line IS
    'Belt-and-suspenders DB-side guard against orphaning pricing_component rows '
    'on commitment_line delete. Raises CL012 with sample PC ids when violated.';


-- =============================================================================
-- End of 06yzz_commitment_line_child_guards.sql
-- =============================================================================
