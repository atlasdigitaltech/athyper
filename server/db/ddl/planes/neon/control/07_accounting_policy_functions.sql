CREATE OR REPLACE FUNCTION control.trg_guard_accounting_policy_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_old_business jsonb;
    v_new_business jsonb;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Only draft % rows may be deleted', TG_TABLE_NAME
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION '% identity and creation evidence are immutable', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' THEN
        v_old_business := to_jsonb(OLD) - ARRAY[
            'status', 'is_active', 'status_changed_at', 'status_changed_by',
            'updated_at', 'updated_by', 'effective_to'
        ];
        v_new_business := to_jsonb(NEW) - ARRAY[
            'status', 'is_active', 'status_changed_at', 'status_changed_by',
            'updated_at', 'updated_by', 'effective_to'
        ];

        IF v_new_business IS DISTINCT FROM v_old_business THEN
            RAISE EXCEPTION 'Activated % policy is immutable; create an effective-dated successor', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.effective_to IS DISTINCT FROM OLD.effective_to
           AND (NEW.effective_to IS NULL
                OR NEW.effective_to < OLD.effective_from
                OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
            RAISE EXCEPTION 'An activated % period may only be shortened', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'draft' AND NEW.status IN ('scheduled', 'active', 'retired'))
        OR (OLD.status = 'scheduled' AND NEW.status IN ('active', 'retired'))
        OR (OLD.status = 'active' AND NEW.status IN ('expired', 'retired'))
        OR (OLD.status = 'expired' AND NEW.status = 'retired')
    ) THEN
        RAISE EXCEPTION 'Invalid % status transition: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_accounting_profile_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_previous control.accounting_profile_policy%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Accounting-profile policies must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.supersedes_policy_id IS NOT NULL THEN
        SELECT * INTO v_previous FROM control.accounting_profile_policy
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_policy_id;
        IF FOUND AND (
            v_previous.accounting_profile_id <> NEW.accounting_profile_id
            OR v_previous.effective_from >= NEW.effective_from
            OR v_previous.effective_to IS NULL
            OR v_previous.effective_to >= NEW.effective_from
        ) THEN
            RAISE EXCEPTION 'Profile-policy successor must retain profile identity and begin after its closed predecessor'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM control.accounting_profile_policy p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.accounting_profile_id = NEW.accounting_profile_id
    ) THEN
        RAISE EXCEPTION 'A later accounting-profile policy must identify supersedes_policy_id'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('scheduled', 'active') THEN
        IF NOT EXISTS (
            SELECT 1 FROM master.accounting_profile p
             WHERE p.tenant_id = NEW.tenant_id
               AND p.id = NEW.accounting_profile_id
               AND p.status = 'active'
        ) THEN
            RAISE EXCEPTION 'Activated policy requires an active accounting-profile identity'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM control.accounting_profile_event e
             WHERE e.tenant_id = NEW.tenant_id
               AND e.accounting_profile_policy_id = NEW.id
               AND e.journal_action = 'post'
        ) THEN
            RAISE EXCEPTION 'Activated profile policy requires at least one posting event'
                USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM control.accounting_profile_event e
              LEFT JOIN control.accounting_profile_entry l
                ON l.tenant_id = e.tenant_id
               AND l.accounting_profile_event_id = e.id
             WHERE e.tenant_id = NEW.tenant_id
               AND e.accounting_profile_policy_id = NEW.id
               AND e.journal_action = 'post'
             GROUP BY e.id
            HAVING count(l.id) < 2
                OR count(l.id) FILTER (WHERE l.is_balancing_line) <> 1
                OR count(l.id) FILTER (WHERE l.posting_side = 'debit') = 0
                OR count(l.id) FILTER (WHERE l.posting_side = 'credit') = 0
        ) THEN
            RAISE EXCEPTION 'Every posting event requires at least two entries, both sides, and exactly one balancing line'
                USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM control.accounting_profile_event e
              JOIN control.accounting_profile_entry l
                ON l.tenant_id = e.tenant_id
               AND l.accounting_profile_event_id = e.id
             WHERE e.tenant_id = NEW.tenant_id
               AND e.accounting_profile_policy_id = NEW.id
               AND NOT EXISTS (
                    SELECT 1 FROM control.lookup_value v
                     WHERE v.domain_code = 'finance.posting_role'
                       AND v.code = l.posting_role_code
                       AND v.status = 'active'
                       AND (v.tenant_id IS NULL OR v.tenant_id = NEW.tenant_id)
               )
        ) THEN
            RAISE EXCEPTION 'Every accounting entry must use an active canonical finance.posting_role value'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_accounting_profile_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_policy_id uuid;
BEGIN
    v_policy_id := CASE WHEN TG_OP = 'DELETE'
        THEN OLD.accounting_profile_policy_id ELSE NEW.accounting_profile_policy_id END;
    IF NOT EXISTS (
        SELECT 1 FROM control.accounting_profile_policy p
         WHERE p.tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
           AND p.id = v_policy_id AND p.status = 'draft'
    ) THEN
        RAISE EXCEPTION 'Accounting-profile events may only change while the parent policy is draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.accounting_profile_policy_id IS DISTINCT FROM OLD.accounting_profile_policy_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Accounting-profile event identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_accounting_profile_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_event_id uuid;
    v_tenant_id uuid;
BEGIN
    v_event_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.accounting_profile_event_id ELSE NEW.accounting_profile_event_id END;
    v_tenant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    IF NOT EXISTS (
        SELECT 1
          FROM control.accounting_profile_event e
          JOIN control.accounting_profile_policy p
            ON p.tenant_id = e.tenant_id AND p.id = e.accounting_profile_policy_id
         WHERE e.tenant_id = v_tenant_id AND e.id = v_event_id AND p.status = 'draft'
    ) THEN
        RAISE EXCEPTION 'Accounting-profile entries may only change while the parent policy is draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.accounting_profile_event_id IS DISTINCT FROM OLD.accounting_profile_event_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Accounting-profile entry identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_accounting_profile_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Accounting-profile assignments must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('scheduled', 'active') AND NOT EXISTS (
        SELECT 1 FROM control.accounting_profile_policy p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.id = NEW.accounting_profile_policy_id
           AND p.status IN ('scheduled', 'active')
           AND p.effective_from <= NEW.effective_from
           AND ((NEW.effective_to IS NULL AND p.effective_to IS NULL)
                OR (NEW.effective_to IS NOT NULL
                    AND (p.effective_to IS NULL OR p.effective_to >= NEW.effective_to)))
    ) THEN
        RAISE EXCEPTION 'Assigned accounting-profile policy must cover the complete assignment period'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_posting_role_account_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_previous control.posting_role_account_assignment%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Posting-role account assignments must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.supersedes_assignment_id IS NOT NULL THEN
        SELECT * INTO v_previous FROM control.posting_role_account_assignment
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_assignment_id;
        IF FOUND AND (
            v_previous.company_code_id <> NEW.company_code_id
            OR v_previous.ledger_book_id <> NEW.ledger_book_id
            OR v_previous.posting_role_code <> NEW.posting_role_code
            OR v_previous.effective_from >= NEW.effective_from
            OR v_previous.effective_to IS NULL
            OR v_previous.effective_to >= NEW.effective_from
        ) THEN
            RAISE EXCEPTION 'Posting-role successor must retain company, book and role and begin after its closed predecessor'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM control.posting_role_account_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.company_code_id = NEW.company_code_id
           AND a.ledger_book_id = NEW.ledger_book_id
           AND a.posting_role_code = NEW.posting_role_code
    ) THEN
        RAISE EXCEPTION 'A later posting-role assignment must identify supersedes_assignment_id'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('scheduled', 'active') THEN
        IF NOT EXISTS (
            SELECT 1 FROM control.lookup_value v
             WHERE v.domain_code = 'finance.posting_role'
               AND v.code = NEW.posting_role_code AND v.status = 'active'
               AND (v.tenant_id IS NULL OR v.tenant_id = NEW.tenant_id)
        ) THEN
            RAISE EXCEPTION 'Posting-role assignment requires an active canonical role'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM master.company_code_book_assignment a
             WHERE a.tenant_id = NEW.tenant_id AND a.company_code_id = NEW.company_code_id
               AND a.book_id = NEW.ledger_book_id AND a.status = 'active'
               AND a.effective_from <= NEW.effective_from
               AND ((NEW.effective_to IS NULL AND a.effective_to IS NULL)
                    OR (NEW.effective_to IS NOT NULL
                        AND (a.effective_to IS NULL OR a.effective_to >= NEW.effective_to)))
        ) THEN
            RAISE EXCEPTION 'Ledger book must be assigned to the company for the complete role-assignment period'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM master.gl_account g
              JOIN master.company_code_chart_assignment c
                ON c.tenant_id = g.tenant_id AND c.chart_of_account_id = g.chart_of_account_id
               AND c.company_code_id = NEW.company_code_id AND c.status = 'active'
             WHERE g.tenant_id = NEW.tenant_id AND g.id = NEW.gl_account_id
               AND g.status = 'active' AND g.node_type = 'posting' AND NOT g.is_blocked
               AND (c.effective_from IS NULL OR c.effective_from <= NEW.effective_from)
               AND ((NEW.effective_to IS NULL AND c.effective_to IS NULL)
                    OR NEW.effective_to IS NOT NULL
                       AND (c.effective_to IS NULL OR c.effective_to >= NEW.effective_to))
               AND NOT EXISTS (
                    SELECT 1 FROM master.company_code_gl_account x
                     WHERE x.tenant_id = NEW.tenant_id AND x.company_code_id = NEW.company_code_id
                       AND x.gl_account_id = NEW.gl_account_id
                       AND (x.status <> 'active' OR NOT x.posting_allowed OR x.blocked_for_auto)
               )
        ) THEN
            RAISE EXCEPTION 'Assigned GL account is not an active auto-postable company account'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_cross_book_posting_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_book_id uuid;
    v_previous control.cross_book_posting_policy%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Cross-book posting policies must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.supersedes_policy_id IS NOT NULL THEN
        SELECT * INTO v_previous FROM control.cross_book_posting_policy
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_policy_id;
        IF FOUND AND (
            v_previous.company_code_id <> NEW.company_code_id OR v_previous.code <> NEW.code
            OR v_previous.source_book_id <> NEW.source_book_id OR v_previous.target_book_id <> NEW.target_book_id
            OR v_previous.scope_document_type_code IS DISTINCT FROM NEW.scope_document_type_code
            OR v_previous.scope_business_intent_id IS DISTINCT FROM NEW.scope_business_intent_id
            OR v_previous.effective_from >= NEW.effective_from OR v_previous.effective_to IS NULL
            OR v_previous.effective_to >= NEW.effective_from
        ) THEN
            RAISE EXCEPTION 'Cross-book successor must retain identity/scope and begin after its closed predecessor'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM control.cross_book_posting_policy p
         WHERE p.tenant_id = NEW.tenant_id AND p.company_code_id = NEW.company_code_id
           AND p.code = NEW.code
    ) THEN
        RAISE EXCEPTION 'A later cross-book policy must identify supersedes_policy_id'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('scheduled', 'active') THEN
        FOREACH v_book_id IN ARRAY ARRAY[NEW.source_book_id, NEW.target_book_id] LOOP
            IF NOT EXISTS (
                SELECT 1 FROM master.company_code_book_assignment a
                 WHERE a.tenant_id = NEW.tenant_id AND a.company_code_id = NEW.company_code_id
                   AND a.book_id = v_book_id AND a.status = 'active'
                   AND a.effective_from <= NEW.effective_from
                   AND ((NEW.effective_to IS NULL AND a.effective_to IS NULL)
                        OR (NEW.effective_to IS NOT NULL
                            AND (a.effective_to IS NULL OR a.effective_to >= NEW.effective_to)))
            ) THEN
                RAISE EXCEPTION 'Both cross-book ledgers must be assigned to the company for the complete policy period'
                    USING ERRCODE = 'check_violation';
            END IF;
        END LOOP;
        IF NEW.posting_mode = 'translate' AND NOT EXISTS (
            SELECT 1 FROM control.cross_book_account_assignment a
             WHERE a.tenant_id = NEW.tenant_id AND a.cross_book_posting_policy_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Translate-mode cross-book policy requires explicit account assignments'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.posting_mode = 'mirror' AND EXISTS (
            SELECT 1 FROM control.cross_book_account_assignment a
             WHERE a.tenant_id = NEW.tenant_id AND a.cross_book_posting_policy_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Mirror-mode cross-book policy must not contain account translations'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.posting_mode = 'translate' AND EXISTS (
            SELECT 1
              FROM control.cross_book_account_assignment a
              JOIN master.gl_account source_account
                ON source_account.tenant_id = a.tenant_id
               AND source_account.id = a.source_gl_account_id
              JOIN master.gl_account target_account
                ON target_account.tenant_id = a.tenant_id
               AND target_account.id = a.target_gl_account_id
             WHERE a.tenant_id = NEW.tenant_id
               AND a.cross_book_posting_policy_id = NEW.id
               AND (source_account.status <> 'active' OR source_account.node_type <> 'posting'
                    OR source_account.is_blocked OR target_account.status <> 'active'
                    OR target_account.node_type <> 'posting' OR target_account.is_blocked)
        ) THEN
            RAISE EXCEPTION 'Cross-book translation accounts must be active, postable and unblocked'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_cross_book_account_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_policy_id uuid;
    v_tenant_id uuid;
BEGIN
    v_policy_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cross_book_posting_policy_id ELSE NEW.cross_book_posting_policy_id END;
    v_tenant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    IF NOT EXISTS (
        SELECT 1 FROM control.cross_book_posting_policy p
         WHERE p.tenant_id = v_tenant_id AND p.id = v_policy_id AND p.status = 'draft'
    ) THEN
        RAISE EXCEPTION 'Cross-book account assignments may only change while the parent policy is draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.cross_book_posting_policy_id IS DISTINCT FROM OLD.cross_book_posting_policy_id
        OR NEW.source_gl_account_id IS DISTINCT FROM OLD.source_gl_account_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Cross-book account-assignment identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_accounting_profile_policy(
    p_company_code_id uuid,
    p_business_intent_id uuid DEFAULT NULL,
    p_flow_code text DEFAULT NULL,
    p_document_type_code text DEFAULT NULL,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_tenant_id uuid := shared.current_tenant_id();
    v_policy_id uuid;
    v_top_count integer;
BEGIN
    WITH candidates AS (
        SELECT a.accounting_profile_policy_id,
               ((a.company_code_id IS NOT NULL)::integer * 8
                + (a.business_intent_id IS NOT NULL)::integer * 4
                + (a.flow_code IS NOT NULL)::integer * 2
                + (a.document_type_code IS NOT NULL)::integer) AS specificity,
               a.effective_from
          FROM control.accounting_profile_assignment a
          JOIN control.accounting_profile_policy p
            ON p.tenant_id = a.tenant_id AND p.id = a.accounting_profile_policy_id
         WHERE a.tenant_id = v_tenant_id
           AND a.status = 'active' AND p.status = 'active'
           AND (a.company_code_id IS NULL OR a.company_code_id = p_company_code_id)
           AND (a.business_intent_id IS NULL OR a.business_intent_id = p_business_intent_id)
           AND (a.flow_code IS NULL OR a.flow_code = upper(p_flow_code))
           AND (a.document_type_code IS NULL OR a.document_type_code = upper(p_document_type_code))
           AND a.effective_from <= p_as_of_date
           AND (a.effective_to IS NULL OR a.effective_to >= p_as_of_date)
           AND p.effective_from <= p_as_of_date
           AND (p.effective_to IS NULL OR p.effective_to >= p_as_of_date)
    ), ranked AS (
        SELECT *, dense_rank() OVER (ORDER BY specificity DESC, effective_from DESC) AS rank_no
          FROM candidates
    )
    SELECT (array_agg(accounting_profile_policy_id))[1], count(*)::integer
      INTO v_policy_id, v_top_count FROM ranked WHERE rank_no = 1;

    IF v_top_count > 1 THEN
        RAISE EXCEPTION 'Ambiguous accounting-profile assignment for current tenant/context'
            USING ERRCODE = 'cardinality_violation';
    END IF;
    RETURN v_policy_id;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_posting_role_account(
    p_company_code_id uuid,
    p_ledger_book_id uuid,
    p_posting_role_code text,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
    SELECT a.gl_account_id
      FROM control.posting_role_account_assignment a
     WHERE a.tenant_id = shared.current_tenant_id()
       AND a.company_code_id = p_company_code_id
       AND a.ledger_book_id = p_ledger_book_id
       AND a.posting_role_code = lower(p_posting_role_code)
       AND a.status = 'active'
       AND a.effective_from <= p_as_of_date
       AND (a.effective_to IS NULL OR a.effective_to >= p_as_of_date)
     LIMIT 1;
$$;
