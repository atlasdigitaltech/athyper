-- 08_functions/004_document.sql
-- Document schema functions.
-- Depends on: 04_tables/004_document.sql

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
    SELECT nextval('document.upupr_code_seq') INTO v_seq;
    NEW.code := 'UPUPR-' || v_year || '-' || lpad(v_seq::text, 5, '0');

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
                 FROM master.group_member pgm
                 JOIN master.principal_group g ON g.id = pgm.group_id
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

    SELECT COALESCE(SUM(base_debit), 0),
           COALESCE(SUM(base_credit), 0),
           COUNT(*)::smallint
    INTO   v_sum_debit, v_sum_credit, v_count
    FROM   document.journal_line
    WHERE  journal_entry_id = v_je_id;

    UPDATE document.journal_entry
    SET    total_debit  = v_sum_debit,
           total_credit = v_sum_credit,
           line_count   = v_count
    WHERE  id = v_je_id
      AND (total_debit  IS DISTINCT FROM v_sum_debit
        OR total_credit IS DISTINCT FROM v_sum_credit
        OR line_count   IS DISTINCT FROM v_count);

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
