-- ============================================================================
-- document/05_functions.sql
-- Concept: Document Logic — journal posting, invoice matching, P2P flow functions
-- Depends on: 04_tables/004_document.sql and sub-tables, 08_functions/003_master.sql
-- Merged from: 004_document.sql (base), 004c_document_finance.sql, 004i_document_p2p.sql
-- ============================================================================

-- =============================================================================
-- §8  document.user_profile_update_request — trigger functions
-- =============================================================================

-- Code sequence for UPUPR
CREATE SEQUENCE IF NOT EXISTS document.upupr_code_seq
    START 1 INCREMENT 1 NO CYCLE;

-- ── BEFORE INSERT: defaults and code generation ─────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_upupr_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;

-- ── BEFORE UPDATE: status transition + principal_snapshot capture ────────────
CREATE OR REPLACE FUNCTION document.trg_upupr_status_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, master AS $$
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
                   AND pgm.tenant_id = NEW.tenant_id), '[]'::jsonb),
            'default_company_code_id', pp.default_company_code_id
        )
        INTO NEW.principal_snapshot
        FROM master.principal_profile pp
        WHERE pp.principal_id = NEW.principal_id
          AND pp.tenant_id = NEW.tenant_id;
    END IF;

    RETURN NEW;
END;
$$;

-- ── AFTER INSERT/UPDATE: audit_log ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_upupr_audit()
RETURNS trigger LANGUAGE plpgsql SET search_path = log, document AS $$
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
$$;

-- ── AFTER UPDATE: lifecycle_log ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_upupr_lifecycle_log()
RETURNS trigger LANGUAGE plpgsql SET search_path = log, control AS $$
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
$$;


-- =============================================================================
-- §9  DOCUMENT · PRINT · BRANDING  —  utility functions
-- =============================================================================

-- ── resolve_template_binding ───────────────────────────────────────────────
-- Priority-based template resolution.
-- Given tenant + entity_name + operation + variant, returns the highest-
-- priority active binding and its associated template details.
-- Falls back from exact variant to 'default' if no exact match.

CREATE OR REPLACE FUNCTION document.resolve_template_binding(
    p_tenant_id   uuid,
    p_entity_name text,
    p_operation   text,
    p_variant     text DEFAULT 'default'
)
RETURNS TABLE (
    binding_id    uuid,
    template_id   uuid,
    template_code text,
    engine        text,
    version_id    uuid,
    variant       text,
    priority      integer
)
LANGUAGE sql
STABLE PARALLEL SAFE
SET search_path = master, document, snapshot, shared, pg_catalog
AS $$
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
$$;

COMMENT ON FUNCTION document.resolve_template_binding(uuid, text, text, text) IS
    'Priority-based template resolution: entity+operation+variant → template+version. '
    'Falls back from exact variant to ''default''. STABLE PARALLEL SAFE.';


-- ── compute_attachment_lineage ─────────────────────────────────────────────
-- Recursive CTE that walks parent_attachment_id chain to build version history.
-- Returns all ancestors from oldest to most recent.

CREATE OR REPLACE FUNCTION document.compute_attachment_lineage(
    p_tenant_id     uuid,
    p_attachment_id uuid
)
RETURNS TABLE (
    depth         integer,
    attachment_id uuid,
    version_no    smallint,
    file_name     text,
    sha256        text,
    is_current    boolean,
    created_at    timestamptz,
    created_by    uuid
)
LANGUAGE sql
STABLE PARALLEL SAFE
SET search_path = master, document, shared, pg_catalog
AS $$
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
$$;

COMMENT ON FUNCTION document.compute_attachment_lineage(uuid, uuid) IS
    'Recursive walk of parent_attachment_id chain. '
    'Returns version lineage oldest-to-current. STABLE PARALLEL SAFE.';


-- ── cleanup_expired_render_outputs ─────────────────────────────────────────
-- Batch-archives terminal render_output rows past retention window.
-- Designed for cron job execution.  Does NOT delete S3 objects.
-- Returns storage_keys so caller can clean up object storage.

CREATE OR REPLACE FUNCTION document.cleanup_expired_render_outputs(
    p_tenant_id      uuid,
    p_retention_days integer DEFAULT 90,
    p_batch_size     integer DEFAULT 500
)
RETURNS TABLE (archived_count integer, storage_keys jsonb)
LANGUAGE plpgsql
SET search_path = document, master, shared, pg_catalog
AS $$
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
$$;

COMMENT ON FUNCTION document.cleanup_expired_render_outputs(uuid, integer, integer) IS
    'Batch-archives expired render outputs past retention window. '
    'Returns storage_keys for caller to clean up S3. '
    'Safe for cron: only touches DELIVERED/REVOKED/FAILED rows.';


-- =============================================================================
-- §  Journal-entry / journal-line sync trigger functions
-- =============================================================================

-- ── trg_journal_line_sync_from_header ────────────────────────────────────
-- Denormalizes journal_entry header fields onto journal_line at INSERT time.
-- Fields: company_code_id, book_id, fiscal_period_id, fiscal_year,
--         period_number, posting_date, base_currency.

CREATE OR REPLACE FUNCTION document.trg_journal_line_sync_from_header()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
DECLARE
    v_je  document.journal_entry%ROWTYPE;
BEGIN
    SELECT *
      INTO STRICT v_je
      FROM document.journal_entry je
     WHERE je.id = NEW.journal_entry_id;

    NEW.company_code_id  := v_je.company_code_id;
    NEW.book_id          := v_je.book_id;
    NEW.fiscal_period_id := v_je.fiscal_period_id;
    NEW.fiscal_year      := v_je.fiscal_year;
    NEW.period_number    := v_je.period_number;
    NEW.posting_date     := v_je.posting_date;
    NEW.base_currency    := v_je.base_currency;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_journal_line_sync_from_header() IS
    'BEFORE INSERT trigger on document.journal_line. '
    'Copies company_code_id, book_id, fiscal_period_id, fiscal_year, '
    'period_number, posting_date, and base_currency from the parent journal_entry.';


-- ── trg_je_sync_fiscal_period ────────────────────────────────────────────
-- On INSERT or UPDATE OF fiscal_period_id, copies fiscal_year and
-- period_number from master.fiscal_period onto the journal_entry row.

CREATE OR REPLACE FUNCTION document.trg_je_sync_fiscal_period()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
DECLARE
    v_fiscal_year    smallint;
    v_period_number  smallint;
BEGIN
    IF TG_OP = 'INSERT' OR NEW.fiscal_period_id IS DISTINCT FROM OLD.fiscal_period_id THEN
        SELECT fp.fiscal_year, fp.period_number
          INTO STRICT v_fiscal_year, v_period_number
          FROM master.fiscal_period fp
         WHERE fp.id = NEW.fiscal_period_id;

        NEW.fiscal_year   := v_fiscal_year;
        NEW.period_number := v_period_number;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_je_sync_fiscal_period() IS
    'BEFORE INSERT OR UPDATE OF fiscal_period_id trigger on document.journal_entry. '
    'Syncs fiscal_year and period_number from master.fiscal_period.';


-- ── trg_je_sync_base_currency ────────────────────────────────────────────
-- On INSERT or UPDATE OF company_code_id, copies functional_currency from
-- master.company_code onto the journal_entry as base_currency.

CREATE OR REPLACE FUNCTION document.trg_je_sync_base_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
DECLARE
    v_currency text;
BEGIN
    IF TG_OP = 'INSERT' OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id THEN
        SELECT cc.functional_currency
          INTO STRICT v_currency
          FROM master.company_code cc
         WHERE cc.id = NEW.company_code_id;

        NEW.base_currency := v_currency;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_je_sync_base_currency() IS
    'BEFORE INSERT OR UPDATE OF company_code_id trigger on document.journal_entry. '
    'Syncs base_currency from master.company_code.functional_currency.';


-- =============================================================================
-- §  JE ENGINE INTEGRITY — G1 immutability + G2 cached totals + G4 party
-- =============================================================================
-- G1: JE + JL immutability guard (posted entries cannot be mutated)
-- G2: Cached totals sync (header totals recomputed from lines)
-- G4: Party polymorphic validation (party_type + party_id validated by trigger)
-- =============================================================================


-- ████████████████████████████████████████████████████████████████████████████
-- G1: JE + JL IMMUTABILITY GUARD
-- ████████████████████████████████████████████████████████████████████████████

CREATE OR REPLACE FUNCTION document.trg_je_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
BEGIN
    IF OLD.status NOT IN ('posted', 'reversed') THEN
        RETURN NEW;
    END IF;

    -- Allow: status transition posted → reversed
    IF OLD.status = 'posted' AND NEW.status = 'reversed' THEN
        IF NEW.company_code_id      IS DISTINCT FROM OLD.company_code_id
        OR NEW.book_id              IS DISTINCT FROM OLD.book_id
        OR NEW.fiscal_period_id     IS DISTINCT FROM OLD.fiscal_period_id
        OR NEW.fiscal_year          IS DISTINCT FROM OLD.fiscal_year
        OR NEW.period_number        IS DISTINCT FROM OLD.period_number
        OR NEW.je_number            IS DISTINCT FROM OLD.je_number
        OR NEW.document_date        IS DISTINCT FROM OLD.document_date
        OR NEW.posting_date         IS DISTINCT FROM OLD.posting_date
        OR NEW.source_doc_type      IS DISTINCT FROM OLD.source_doc_type
        OR NEW.source_doc_id        IS DISTINCT FROM OLD.source_doc_id
        OR NEW.transaction_currency IS DISTINCT FROM OLD.transaction_currency
        OR NEW.base_currency        IS DISTINCT FROM OLD.base_currency
        OR NEW.total_debit          IS DISTINCT FROM OLD.total_debit
        OR NEW.total_credit         IS DISTINCT FROM OLD.total_credit
        OR NEW.line_count           IS DISTINCT FROM OLD.line_count
        OR NEW.description          IS DISTINCT FROM OLD.description
        OR NEW.is_reversal          IS DISTINCT FROM OLD.is_reversal
        OR NEW.reversal_of_id       IS DISTINCT FROM OLD.reversal_of_id
        OR NEW.derived_from_je_id   IS DISTINCT FROM OLD.derived_from_je_id
        OR NEW.posting_rule_id      IS DISTINCT FROM OLD.posting_rule_id
        OR NEW.posted_at            IS DISTINCT FROM OLD.posted_at
        OR NEW.posted_by            IS DISTINCT FROM OLD.posted_by
        THEN
            RAISE EXCEPTION 'journal_entry %: only status and reversed_by_id may change on a posted JE',
                OLD.je_number USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'posted' AND NEW.status != 'reversed' THEN
        RAISE EXCEPTION 'journal_entry %: posted JE can only transition to reversed (attempted: %)',
            OLD.je_number, NEW.status USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'reversed' THEN
        RAISE EXCEPTION 'journal_entry %: reversed JE is fully immutable',
            OLD.je_number USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_je_immutability_guard IS
    'Enforces immutability on posted journal entries. After status=posted, only '
    'status→reversed and reversed_by_id may change. All other columns are frozen. '
    'Reversed JEs are fully immutable — no further changes.';


-- ── JL immutability: block all changes to lines of posted/reversed JEs ──────

CREATE OR REPLACE FUNCTION document.trg_jl_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
DECLARE
    v_je_status text;
BEGIN
    SELECT status INTO v_je_status
    FROM document.journal_entry
    WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

    IF v_je_status IN ('posted', 'reversed') THEN
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
$$;

COMMENT ON FUNCTION document.trg_jl_immutability_guard IS
    'Prevents INSERT, UPDATE, or DELETE on journal_lines belonging to a posted '
    'or reversed journal_entry. Lines are frozen when the JE is posted.';


-- ████████████████████████████████████████████████████████████████████████████
-- G2: CACHED TOTALS SYNC
-- ████████████████████████████████████████████████████████████████████████████

-- ── G2a: Line-level trigger — keep header totals in sync ────────────────────

CREATE OR REPLACE FUNCTION document.trg_je_sync_cached_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;

COMMENT ON FUNCTION document.trg_je_sync_cached_totals IS
    'Recomputes journal_entry.total_debit, total_credit, line_count from actual '
    'journal_line rows. Fires on INSERT/UPDATE/DELETE of journal_line. '
    'Only syncs for draft/created JEs (posted are immutable).';


-- ── G2b: Status transition guard — validate on draft → created ──────────────

CREATE OR REPLACE FUNCTION document.trg_je_status_transition_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
DECLARE
    v_sum_debit  numeric(18,4);
    v_sum_credit numeric(18,4);
    v_count      smallint;
BEGIN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;

    -- ── draft → created: validate + cache totals ────────────────────────
    IF OLD.status = 'draft' AND NEW.status = 'created' THEN
        SELECT COALESCE(SUM(base_debit), 0),
               COALESCE(SUM(base_credit), 0),
               COUNT(*)::smallint
        INTO   v_sum_debit, v_sum_credit, v_count
        FROM   document.journal_line
        WHERE  journal_entry_id = NEW.id;

        IF v_count = 0 THEN
            RAISE EXCEPTION 'journal_entry %: cannot move to created — no lines',
                NEW.je_number USING ERRCODE = 'check_violation';
        END IF;

        IF ABS(v_sum_debit - v_sum_credit) > 0.005 THEN
            RAISE EXCEPTION 'journal_entry %: cannot move to created — debits (%) != credits (%)',
                NEW.je_number, v_sum_debit, v_sum_credit
                USING ERRCODE = 'check_violation';
        END IF;

        NEW.total_debit  := v_sum_debit;
        NEW.total_credit := v_sum_credit;
        NEW.line_count   := v_count;

        RETURN NEW;
    END IF;

    -- ── created → posted: stamp metadata ────────────────────────────────
    IF OLD.status = 'created' AND NEW.status = 'posted' THEN
        IF NEW.posted_at IS NULL THEN
            NEW.posted_at := now();
        END IF;
        IF NEW.posted_by IS NULL THEN
            NEW.posted_by := nullif(current_setting('app.current_principal_id', true), '')::uuid;
        END IF;
        RETURN NEW;
    END IF;

    -- ── Valid transitions only ──────────────────────────────────────────
    IF NOT (
        (OLD.status = 'draft'   AND NEW.status = 'created')
     OR (OLD.status = 'created' AND NEW.status = 'posted')
     OR (OLD.status = 'created' AND NEW.status = 'draft')
     OR (OLD.status = 'posted'  AND NEW.status = 'reversed')
    ) THEN
        RAISE EXCEPTION 'journal_entry %: invalid status transition % → %',
            NEW.je_number, OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_je_status_transition_guard IS
    'JE status state machine. draft→created validates lines + caches totals. '
    'created→posted stamps posted_at/by. Only valid transitions allowed. '
    'created→draft permitted for revert before posting.';


-- ████████████████████████████████████████████████████████████████████████████
-- G4: PARTY POLYMORPHIC VALIDATION
-- ████████████████████████████████████████████████████████████████████████████

CREATE OR REPLACE FUNCTION document.trg_jl_validate_party()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;

COMMENT ON FUNCTION document.trg_jl_validate_party IS
    'Polymorphic FK validation for journal_line.party_type + party_id. '
    'Dispatches to master.customer, master.supplier, master.employee, '
    'master.company_code, or master.principal based on party_type. '
    'Validates existence + tenant isolation. Same pattern as owner_type.';


-- ============================================================================
-- document.trg_asset_txn_book_guard()
-- ============================================================================
-- Validates three invariants on document.asset_transaction:
--   1. asset_book_id must exist for the same tenant
--   2. asset_book_id must belong to the stated asset_id
--   3. book_type must match the asset_book's book_type (denormalization guard)
-- Fires on INSERT and UPDATE of asset_book_id, asset_id, or book_type.
--
-- When asset_book_id IS NULL and book_type IS NULL, the row is allowed
-- (pre-book WIP-stage events). When asset_book_id IS NOT NULL, all three
-- checks are enforced. When only book_type IS NOT NULL (no book link),
-- no cross-check is possible so it passes through.

CREATE OR REPLACE FUNCTION document.trg_asset_txn_book_guard()
RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = document, master
AS $$
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
$$;

COMMENT ON FUNCTION document.trg_asset_txn_book_guard IS
    'Validates that asset_book_id belongs to the stated asset_id within the '
    'same tenant, and that book_type matches the referenced asset_book. '
    'Prevents asset/book mismatch and book_type denormalization drift at DB level.';


-- ============================================================================
-- master.trg_asset_book_type_immutable()
-- ============================================================================
-- Prevents book_type changes on master.asset_book once transactions exist.
-- This closes the denormalization drift window: if book_type were changed
-- after transactions were recorded, the denormalized book_type on historical
-- asset_transactions would become stale.

CREATE OR REPLACE FUNCTION master.trg_asset_book_type_immutable()
RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = master, document
AS $$
BEGIN
    IF OLD.book_type IS DISTINCT FROM NEW.book_type THEN
        IF EXISTS (
            SELECT 1 FROM document.asset_transaction atx
            WHERE atx.asset_book_id = NEW.id
              AND atx.tenant_id = NEW.tenant_id
            LIMIT 1
        ) THEN
            RAISE EXCEPTION
                'asset_book %: cannot change book_type from % to % — transactions exist',
                NEW.id, OLD.book_type, NEW.book_type
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_asset_book_type_immutable IS
    'Blocks book_type changes on master.asset_book when document.asset_transaction '
    'rows reference that book. Prevents denormalization drift on historical transactions.';


-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Document functions
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §INV-F2  document.trg_stocktake_line_denorm_counts
-- Maintains denormalised line counts on document.stocktake.
-- ============================================================================
CREATE OR REPLACE FUNCTION document.trg_stocktake_line_denorm_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = document, pg_temp
AS $$
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
$$;

COMMENT ON FUNCTION document.trg_stocktake_line_denorm_counts() IS
    'AFTER INSERT/UPDATE/DELETE trigger on stocktake_line. '
    'Recomputes total_line_count and variance_line_count on the parent stocktake row. '
    'Uses COALESCE(NEW.stocktake_id, OLD.stocktake_id) to handle DELETE correctly.';
-- 08_functions/004c_document_finance.sql
-- Finance enforcement trigger functions.
-- Depends on: 04_tables/004_document.sql, 04_tables/003b_master_finance.sql,
--             04_tables/008_governance.sql

-- =============================================================================
-- document.trg_jl_validate_posting_controls_fn
-- =============================================================================
-- Validates that the GL account is postable in the given company before
-- a journal_line can be inserted.
--
-- Requires:
--   - active posting GL account
--   - account metadata does not mark _journal_postable = false
--   - chart metadata does not mark _operating_coa = false
--   - active operating chart assignment for the company
--   - company-specific posting controls, when present, allow posting
--
-- A missing company_code_gl_account row means no explicit controls exist;
-- the account is allowed only after the chart/account checks pass.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_jl_validate_posting_controls_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, master, pg_catalog
AS $$
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

  -- Globally blocked
  IF NOT v_ctrl.posting_allowed THEN
    RAISE EXCEPTION
      'ACCOUNT_POSTING_BLOCKED: GL account % is blocked for posting in company %.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Get the parent JE source type to distinguish manual vs auto
  SELECT je.source_doc_type
    INTO v_je_source
    FROM document.journal_entry je
   WHERE je.id        = NEW.journal_entry_id
     AND je.tenant_id = NEW.tenant_id
   LIMIT 1;

  -- Manual posting blocked
  IF v_ctrl.blocked_for_manual AND v_je_source = 'MANUAL' THEN
    RAISE EXCEPTION
      'ACCOUNT_BLOCKED_MANUAL: GL account % is blocked for manual posting in company %.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Auto posting blocked
  IF v_ctrl.blocked_for_auto AND v_je_source != 'MANUAL' THEN
    RAISE EXCEPTION
      'ACCOUNT_BLOCKED_AUTO: GL account % is blocked for automatic posting in company %.',
      NEW.gl_account_id, NEW.company_code_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_jl_validate_posting_controls_fn IS
  'BEFORE INSERT trigger function for document.journal_line. '
  'Validates posting_allowed + blocked_for_manual/auto '
  'against master.company_code_gl_account before accepting a journal line.';


-- =============================================================================
-- document.trg_jl_validate_dimensions_fn                            [GAP-3]
-- =============================================================================
-- Validates that cost_center_id, profit_center_id, and project_id on a
-- journal_line (when set) are:
--   1. Active  — master record has is_active = true  (status = 'active')
--   2. In-date — posting_date falls within [valid_from, valid_to] (NULL = open)
--   3. Tenant-isolated — same tenant_id
--
-- Fires BEFORE INSERT, after trg_jl_sync_from_header ('s' < 'v') so
-- NEW.posting_date is already populated from the parent journal_entry.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_jl_validate_dimensions_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, master, pg_catalog
AS $$
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
$$;

COMMENT ON FUNCTION document.trg_jl_validate_dimensions_fn IS
  'BEFORE INSERT trigger function for document.journal_line. '
  'Validates cost_center_id, profit_center_id, and project_id against their '
  'master tables — must be active (is_active=true) and within valid_from/valid_to '
  'window relative to the posting_date. Fires after trg_jl_sync_from_header so '
  'posting_date is already populated.';


-- =============================================================================
-- document.trg_je_workflow_gate_fn                                  [GAP-4]
-- =============================================================================
-- Blocks transition created → posted when any workflow_request for the JE
-- has status 'pending' (awaiting decision) or 'rejected' (decision was no).
--
-- Absence of a workflow_request means no approval workflow was configured
-- for this JE — posting is allowed without one.
--
-- Alphabetically fires after trg_je_status_transition_guard ('s' < 'w'),
-- so state-machine validation + posted_at stamping have already occurred
-- in the same BEFORE chain before this check runs.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_je_workflow_gate_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, pg_catalog
AS $$
DECLARE
  v_blocking_status  text;
BEGIN
  -- Look for any open or rejected workflow request for this JE
  SELECT wr.status
    INTO v_blocking_status
    FROM document.workflow_request wr
   WHERE wr.tenant_id   = NEW.tenant_id
     AND wr.entity_type = 'journal_entry'
     AND wr.entity_id   = NEW.id::text
     AND wr.status IN ('pending', 'rejected')
   ORDER BY wr.status = 'rejected' DESC  -- surface rejected over pending
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'WORKFLOW_GATE: journal_entry % cannot be posted — '
      'a workflow_request exists with status ''%''. '
      'All approval workflows must reach status ''approved'' or ''canceled'' '
      'before posting is allowed.',
      NEW.je_number, v_blocking_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_je_workflow_gate_fn IS
  'BEFORE UPDATE trigger function on document.journal_entry. '
  'Fires on created→posted transition. Blocks posting when any '
  'document.workflow_request for the JE has status ''pending'' or ''rejected''. '
  'No workflow_request present = no approval required = posting allowed.';


-- =============================================================================
-- document.trg_jl_check_budget_fn                                   [GAP-5]
-- =============================================================================
-- Checks budget availability before a debit journal_line is inserted.
--
-- Lookup strategy (most-specific-wins):
--   1. Find active master.budget_allocation for company + fiscal_year whose
--      dimension filters (gl_account_id, cost_center_id, profit_center_id,
--      project_id) are NULL-or-match relative to the JL being posted.
--   2. Prefer period-level ledger.budget_balance.closing_amount; fall back to
--      allocation-level available_amount.
--   3. Apply tolerance_pct, then dispatch on overspend_policy:
--        BLOCK     → hard exception
--        ESCALATE  → hard exception (escalation via workflow must be done first)
--        WARN      → non-blocking RAISE WARNING
--        ALLOW     → pass through
--
-- Credit lines are never checked (they restore budget, not consume it).
-- Lines with no matching allocation pass through (no control configured).
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_jl_check_budget_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, master, ledger, pg_catalog
AS $$
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
$$;

COMMENT ON FUNCTION document.trg_jl_check_budget_fn IS
  'BEFORE INSERT trigger function for document.journal_line. '
  'Checks debit postings against the best-matching active master.budget_allocation '
  'and ledger.budget_balance for the period. '
  'Dispatches on overspend_policy: BLOCK/ESCALATE raise exceptions; '
  'WARN emits a non-blocking warning; ALLOW/no-match passes through. '
  'Credit lines are never checked (they restore budget, not consume it).';
-- =============================================================================
-- 08_functions/004i_document_p2p.sql  –  Guard functions for P2P tables
-- =============================================================================
-- Modelled after ledger.trg_guard_inventory_company_consistency() (line 35787).
-- Four company-consistency functions (one per distinct column-shape) plus two
-- business-rule guards for payment allocation semantics.
--
-- Why four company-consistency functions not one:
--   receipt header        – has company_code_id directly; checks warehouse + site
--   receipt line          – no company_code_id; reads from parent receipt header
--   commitment_line       – no company_code_id; reads from parent commitment
--   service_sheet line    – no company_code_id; reads from parent service_sheet; item only
--
-- master.warehouse has no company_code_id; resolved via warehouse → site → company.
--
-- Payment allocation guards (§16):
--   trg_guard_payment_allocation()       – BEFORE ROW  – type-specific field rules
--   trg_guard_netting_allocation_count() – AFTER STMT  – NETTING minimum line count
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.1  GR HEADER: receiving_warehouse_id + receiving_site_id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_gr_header_company()
RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = document, master, pg_temp AS $$
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.2  GR LINE: item_id + warehouse_id (company from parent GR header)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_gr_line_company()
RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = document, master, pg_temp AS $$
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.3  COMMITMENT LINE: item_id + warehouse_id + site_id
--        (company from parent document.commitment)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_commitment_line_company()
RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = document, master, pg_temp AS $$
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.4  SES LINE: item_id only (optional catalogued services)
--        (company from parent document.service_sheet)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_ses_line_company()
RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = document, master, pg_temp AS $$
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §16  PAYMENT ALLOCATION BUSINESS RULE GUARD  (BEFORE ROW)
-- ─────────────────────────────────────────────────────────────────────────────
-- Rules:
--   ADVANCE          → must have commitment_id; must NOT have purchase_invoice_id
--   STANDARD / PARTIAL / FINAL / DOWN_PAYMENT → must have purchase_invoice_id
--   RETENTION_RELEASE → must have invoice OR commitment
--   NETTING          → must have purchase_invoice_id; no commitment_id;
--                      no advance_recovery_amount; no retention_amount
--                      (minimum line-count enforced by the companion AFTER STMT
--                      trigger trg_guard_netting_allocation_count below)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_payment_allocation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = document AS $$
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §16b  NETTING ALLOCATION COUNT GUARD  (AFTER STATEMENT)
-- ─────────────────────────────────────────────────────────────────────────────
-- A per-row BEFORE trigger cannot count sibling rows that have not yet been
-- committed, so the minimum-two-lines rule requires a separate AFTER STATEMENT
-- trigger.  Uses a transition table (new_rows) so the scan is limited to
-- payment_entry_ids actually touched by the current statement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_guard_netting_allocation_count()
RETURNS trigger LANGUAGE plpgsql
SET search_path = document AS $$
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
$$;


-- ============================================================================
-- §PI-FN  Purchase Invoice functions (Phase 1+2 AP write engine)
-- ============================================================================


-- ── fn_refresh_purchase_invoice_totals ─────────────────────────────────────
-- Callable aggregate sync: recomputes all writable numeric aggregates on the
-- purchase_invoice header from its child lines.
-- Called from the AFTER trigger on purchase_invoice_line.
-- Also callable directly from application code after bulk line operations.

CREATE OR REPLACE FUNCTION document.fn_refresh_purchase_invoice_totals(
    p_invoice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = document, pg_catalog
AS $$
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
$$;

COMMENT ON FUNCTION document.fn_refresh_purchase_invoice_totals(uuid) IS
    'Phase 1 reset: recomputes total_amount, tax_amount, and withholding_tax_amount on purchase_invoice from current child lines.';

-- ── trg_pi_before_insert ────────────────────────────────────────────────────
-- BEFORE INSERT on document.purchase_invoice:
--   1. Sets created_by from session if not explicitly provided
--   2. Auto-generates code from control.entity_numbering_config if empty
--   3. Sets code = code (display code)

CREATE OR REPLACE FUNCTION document.trg_pi_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, master, shared, pg_catalog AS $$
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
$$;


-- ── trg_pe_before_insert ────────────────────────────────────────────────────
-- BEFORE INSERT on document.payment_entry:
--   1. Sets created_by from session if not explicitly provided
--   2. Auto-generates payment_number from control.entity_numbering_config if empty
--   3. Sets code = payment_number

CREATE OR REPLACE FUNCTION document.trg_pe_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, control, shared, pg_catalog AS $$
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
$$;


-- ── trg_pil_sync_header ─────────────────────────────────────────────────────
-- AFTER INSERT/UPDATE/DELETE on document.purchase_invoice_line:
-- Calls fn_refresh_purchase_invoice_totals to keep header aggregates in sync.

CREATE OR REPLACE FUNCTION document.trg_pil_sync_header()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, pg_catalog AS $$
DECLARE
    v_invoice_id uuid;
BEGIN
    v_invoice_id := COALESCE(NEW.purchase_invoice_id, OLD.purchase_invoice_id);
    PERFORM document.fn_refresh_purchase_invoice_totals(v_invoice_id);
    RETURN NULL;
END;
$$;


-- ── trg_pi_immutability_guard ───────────────────────────────────────────────
-- Blocks direct field edits on purchase_invoices in terminal or posted states.
-- Application code should use the action-dispatcher flow handlers instead.

CREATE OR REPLACE FUNCTION document.trg_pi_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, pg_catalog AS $$
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
$$;


-- ── trg_pil_immutability_guard ──────────────────────────────────────────────
-- Blocks line mutations when the parent invoice is in a non-editable state.

CREATE OR REPLACE FUNCTION document.trg_pil_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, pg_catalog AS $$
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
$$;


-- ── trg_pi_status_guard ─────────────────────────────────────────────────────
-- Validates status transitions against the lifecycle engine.
-- Prevents direct status assignments that bypass the action dispatcher.

CREATE OR REPLACE FUNCTION document.trg_pi_status_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, control, pg_catalog AS $$
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
$$;


-- ============================================================================
-- Journal Entry hardening overrides
-- ============================================================================
-- These CREATE OR REPLACE definitions intentionally appear after the original
-- JE functions so the latest business-control contract wins without disturbing
-- unrelated document functions in this dirty worktree.

CREATE OR REPLACE FUNCTION document.trg_journal_line_sync_from_header()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;

CREATE OR REPLACE FUNCTION document.trg_je_sync_fiscal_period()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;

CREATE OR REPLACE FUNCTION document.trg_je_sync_base_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;

CREATE OR REPLACE FUNCTION document.trg_je_status_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
BEGIN
    IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION
            'journal_entry %: insert must start in draft; use lifecycle transitions for %',
            NEW.je_number, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_je_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;

CREATE OR REPLACE FUNCTION document.trg_jl_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;

CREATE OR REPLACE FUNCTION document.trg_je_status_transition_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;

CREATE OR REPLACE FUNCTION document.trg_je_lifecycle_log()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, log, control, pg_catalog
AS $$
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- purchase_invoice lifecycle log trigger function
-- Fires AFTER UPDATE OF status on document.purchase_invoice.
-- Writes one row to log.entity_lifecycle_log per status transition, carrying a
-- compact header snapshot in payload so the Versions tab can render without
-- joining back to the live invoice row.
-- Dual-writes to log.audit_log using the same event id (= correlation_id).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_pi_lifecycle_log()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, log, control, pg_catalog
AS $$
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
$$;


CREATE OR REPLACE FUNCTION document.trg_je_field_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, log, pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION document.trg_jl_field_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, log, pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION document.trg_jl_validate_posting_controls_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, master, pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION document.trg_je_workflow_gate_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, pg_catalog
AS $$
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
$$;

-- =============================================================================
-- document.trg_je_period_gate_fn
-- =============================================================================
-- Forward posting is allowed only when:
--   1. master.fiscal_period.status is open or soft_close
--   2. governance.book_period_status.status is open or soft_close
--
-- The fiscal period is resolved from NEW.fiscal_period_id. The book-period row
-- is resolved from that fiscal period's year/period; a missing book row is
-- treated as future and blocks posting. The posted -> reversed transition is
-- exempt so reversals can be recorded after close.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.trg_je_period_gate_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, master, governance, pg_catalog
AS $$
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
$$;

-- =============================================================================
-- §JE  document.journal_entry — BEFORE INSERT: code + name auto-population
-- =============================================================================
-- code  ? je_number
-- name  ? description when non-empty; else JE + posting date fallback
-- =============================================================================

COMMENT ON FUNCTION document.trg_je_period_gate_fn IS
  'Forward posting requires fiscal and book period status open/soft_close. '
  'Missing book-period rows are treated as future. '
  'Updates from posted to reversed are exempt from the period gate.';

CREATE OR REPLACE FUNCTION document.trg_je_before_insert()
RETURNS trigger LANGUAGE plpgsql
SET search_path = document, control, shared, pg_catalog AS $$
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
$$;

COMMENT ON FUNCTION document.trg_je_before_insert() IS
    'BEFORE INSERT on document.journal_entry. Sets code from je_number and '
    'derives name from description or JE/date fallback.';

CREATE OR REPLACE FUNCTION document.trg_jlr_append_only_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document AS $$
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
$$;


-- ============================================================================
-- P2P chain immutability guards (Plan 5 — terminal-state mutation block)
-- ============================================================================
-- Mirrors document.trg_pi_immutability_guard for the remaining P2P
-- documents. Once a row is in a terminal state, generic UPDATE paths
-- (records.route.ts, raw SQL via admin tools) cannot rewrite fields —
-- the only acceptable mutation is a status change driven by the action
-- dispatcher. Lifecycle-driven transitions stay allowed via the
-- `IF OLD.status IS DISTINCT FROM NEW.status THEN RETURN NEW` short-circuit.
--
-- Terminal vocabulary per entity (read from each table's status CHECK):
--   commitment                     closed, cancelled, expired
--   purchase_requisition           rejected, fully_converted, closed, cancelled
--   purchase_order_confirmation    rejected, cancelled, changes_rejected
--   delivery_note                  fully_receipted, returned, cancelled
--   receipt                        posted, reversed, cancelled
--   service_sheet                  posted, reversed, cancelled
--
-- The universal `terminal_status IS NOT NULL` (set when the lifecycle
-- engine marks CANCELED / REJECTED) is also treated as terminal — that
-- column is the single-source flag for cross-entity audit queries.

-- ── §CMT  commitment ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_cmt_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, pg_catalog AS $$
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
$$;

-- ── §PR  purchase_requisition ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_pr_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, pg_catalog AS $$
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
$$;

-- ── §POC  purchase_order_confirmation ──────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_poc_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, pg_catalog AS $$
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
$$;

-- ── §DN  delivery_note ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_dn_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, pg_catalog AS $$
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
$$;

-- ── §RCP  receipt ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_rcp_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, pg_catalog AS $$
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
$$;

-- ── §SES  service_sheet ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document.trg_ssh_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = document, pg_catalog AS $$
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
$$;

-- Release-gated company readiness check. Trigger-level enforcement covers all
-- posting producers while remaining disabled until a tenant is enrolled.
CREATE OR REPLACE FUNCTION document.trg_je_finance_readiness_gate_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, governance, master, control, pg_catalog
AS $$
DECLARE
  v_enabled boolean := false;
  v_company_code text;
BEGIN
  IF NEW.status <> 'posted' OR OLD.status = 'posted' OR NEW.is_reversal
     OR NEW.source_doc_type IN ('opening_balance', 'finance_setup_test', 'reversal') THEN
    RETURN NEW;
  END IF;

  SELECT CASE
           WHEN ff.tenant_overrides ? NEW.tenant_id::text
             THEN (ff.tenant_overrides ->> NEW.tenant_id::text)::boolean
           ELSE ff.is_enabled
         END
    INTO v_enabled
    FROM control.feature_flag ff
   WHERE ff.code = 'finance.posting_readiness_gate'
     AND (ff.expires_at IS NULL OR ff.expires_at > now());

  IF NOT coalesce(v_enabled, false) THEN RETURN NEW; END IF;

  SELECT code INTO v_company_code
    FROM master.company_code
   WHERE tenant_id = NEW.tenant_id AND id = NEW.company_code_id;

  IF NOT EXISTS (
    WITH latest_run AS (
      SELECT run.id
        FROM governance.cycle_run run
        JOIN governance.cycle_type typ
          ON typ.tenant_id = run.tenant_id AND typ.id = run.cycle_type_id
       WHERE run.tenant_id = NEW.tenant_id
         AND run.entity_code = v_company_code
         AND typ.type_code = 'FIN_SETUP_READINESS'
         AND run.status <> 'CANCELLED'
       ORDER BY run.run_number DESC, run.created_at DESC
       LIMIT 1
    )
    SELECT 1
      FROM latest_run lr
      JOIN governance.cycle_certification cert
        ON cert.tenant_id = NEW.tenant_id AND cert.cycle_run_id = lr.id
     WHERE cert.cert_code = 'FINANCE_POSTING_READY'
       AND cert.status = 'ATTESTED'
       AND NOT EXISTS (
         SELECT 1 FROM governance.cycle_task task
          WHERE task.tenant_id = cert.tenant_id AND task.cycle_run_id = cert.cycle_run_id
            AND task.is_mandatory AND task.status <> 'COMPLETED'
       )
       AND NOT EXISTS (
         SELECT 1 FROM governance.cycle_deviation dev
          WHERE dev.tenant_id = cert.tenant_id AND dev.cycle_run_id = cert.cycle_run_id
            AND dev.severity = 'CRITICAL'
            AND dev.status NOT IN ('RESOLVED','REJECTED','EXPIRED','REVOKED')
       )
  ) THEN
    RAISE EXCEPTION
      'FINANCE_POSTING_READINESS_REQUIRED: company % has no active FINANCE_POSTING_READY certification',
      coalesce(v_company_code, NEW.company_code_id::text)
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.trg_je_finance_readiness_gate_fn IS
  'Release-gated production posting control, resolved from control.feature_flag finance.posting_readiness_gate.';

-- Publish one durable execution request when a root journal posts into a book
-- that has active cross-book rules. Derived journals never publish another
-- request: Stage 6 deliberately supports one-hop fan-out to make loops
-- impossible even when administrators configure A->B and B->A rules.
CREATE OR REPLACE FUNCTION document.trg_je_enqueue_cross_book_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = document, control, event, pg_catalog
AS $$
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
$$;

COMMENT ON FUNCTION document.trg_je_enqueue_cross_book_fn IS
  'Enqueues idempotent fin-topic execution for posted root journals with active book_posting_rule rows; derived journals are excluded for loop prevention.';
