-- ============================================================================
-- Stage 2 posting-role canonicalization, validation and resolution trace
-- ============================================================================

CREATE OR REPLACE FUNCTION control.canonical_posting_role_code(
    p_tenant_id uuid,
    p_role_code text
) RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = control, shared, pg_temp
AS $$
DECLARE
    v_input text := lower(btrim(COALESCE(p_role_code, '')));
    v_code text;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Posting-role tenant does not match the active tenant session'
            USING ERRCODE = '42501';
    END IF;
    IF v_input = '' THEN RETURN NULL; END IF;

    SELECT lv.code INTO v_code
      FROM control.lookup_value lv
     WHERE lv.domain_code = 'finance.posting_role'
       AND lv.code = v_input
       AND lv.status = 'active'
       AND (lv.tenant_id = p_tenant_id OR lv.tenant_id IS NULL)
     ORDER BY (lv.tenant_id IS NOT NULL) DESC
     LIMIT 1;
    IF v_code IS NOT NULL THEN RETURN v_code; END IF;

    SELECT a.canonical_role_code INTO v_code
      FROM control.posting_role_alias a
     WHERE a.alias_code = v_input
       AND a.status = 'active'
       AND (a.tenant_id = p_tenant_id OR a.tenant_id IS NULL)
     ORDER BY (a.tenant_id IS NOT NULL) DESC,
              (a.source_domain_code IS NULL) DESC
     LIMIT 1;
    RETURN v_code;
END;
$$;

COMMENT ON FUNCTION control.canonical_posting_role_code(uuid, text) IS
    'Normalizes a role code and resolves tenant/global compatibility aliases into finance.posting_role.';

CREATE OR REPLACE FUNCTION control.trg_validate_posting_role_account_map()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = control, master, shared, pg_temp
AS $$
DECLARE
    v_canonical text;
    v_expected_normal text;
    v_account_normal text;
BEGIN
    IF NEW.tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Posting-role map tenant does not match the active tenant session'
            USING ERRCODE = '42501';
    END IF;

    v_canonical := control.canonical_posting_role_code(NEW.tenant_id, NEW.posting_role_code);
    IF v_canonical IS NULL THEN
        RAISE EXCEPTION 'Unknown or inactive posting role: %', NEW.posting_role_code
            USING ERRCODE = '23514';
    END IF;
    NEW.posting_role_code := v_canonical;

    SELECT lower(COALESCE(lv.metadata->>'normal_balance', 'either'))
      INTO v_expected_normal
      FROM control.lookup_value lv
     WHERE lv.domain_code = 'finance.posting_role' AND lv.code = v_canonical
       AND lv.status = 'active' AND (lv.tenant_id = NEW.tenant_id OR lv.tenant_id IS NULL)
     ORDER BY (lv.tenant_id IS NOT NULL) DESC LIMIT 1;

    IF NOT EXISTS (
        SELECT 1
          FROM master.company_code_book_assignment ba
         WHERE ba.tenant_id = NEW.tenant_id
           AND ba.company_code_id = NEW.company_code_id
           AND ba.book_id = NEW.ledger_book_id
           AND ba.status = 'active'
           AND ba.effective_from <= COALESCE(NEW.effective_to, NEW.effective_from)
           AND (ba.effective_to IS NULL OR ba.effective_to >= NEW.effective_from)
    ) THEN
        RAISE EXCEPTION 'Ledger book is not actively assigned to the company for the mapping range'
            USING ERRCODE = '23514';
    END IF;

    SELECT lower(ga.normal_balance) INTO v_account_normal
      FROM master.gl_account ga
     WHERE ga.tenant_id = NEW.tenant_id AND ga.id = NEW.gl_account_id;
    IF COALESCE(v_expected_normal, 'either') IN ('debit','credit')
       AND v_account_normal IS DISTINCT FROM v_expected_normal THEN
        RAISE EXCEPTION 'GL account normal balance % is incompatible with posting role % (%)',
            v_account_normal, v_canonical, v_expected_normal
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.gl_account ga
          JOIN master.company_code_chart_assignment ca
            ON ca.tenant_id = ga.tenant_id
           AND ca.chart_of_account_id = ga.chart_of_account_id
           AND ca.company_code_id = NEW.company_code_id
           AND ca.status = 'active'
         WHERE ga.tenant_id = NEW.tenant_id
           AND ga.id = NEW.gl_account_id
           AND ga.status = 'active'
           AND ga.node_type = 'posting'
           AND (ca.effective_from IS NULL OR ca.effective_from <= COALESCE(NEW.effective_to, NEW.effective_from))
           AND (ca.effective_to IS NULL OR ca.effective_to >= NEW.effective_from)
    ) THEN
        RAISE EXCEPTION 'GL account is not an active posting account in a company-assigned chart'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.company_code_gl_account ccga
         WHERE ccga.tenant_id = NEW.tenant_id
           AND ccga.company_code_id = NEW.company_code_id
           AND ccga.gl_account_id = NEW.gl_account_id
           AND (ccga.status <> 'active' OR ccga.posting_allowed = false OR ccga.blocked_for_auto = true)
    ) THEN
        RAISE EXCEPTION 'GL account is blocked for automatic posting in this company'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_posting_role_account_trace(
    p_tenant_id       uuid,
    p_role_code       text,
    p_company_code_id uuid,
    p_book_code       text,
    p_as_of_date      date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = control, master, shared, pg_temp
AS $$
DECLARE
    v_normalized text := lower(btrim(COALESCE(p_role_code, '')));
    v_canonical text;
    v_book master.ledger_book%ROWTYPE;
    v_map control.posting_role_account_map%ROWTYPE;
    v_account record;
    v_candidate_count integer := 0;
    v_steps jsonb := '[]'::jsonb;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Posting-role resolution tenant does not match the active tenant session'
            USING ERRCODE = '42501';
    END IF;

    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'normalize_role', 'input', p_role_code, 'normalized', v_normalized,
        'matched', v_normalized <> ''
    ));
    v_canonical := control.canonical_posting_role_code(p_tenant_id, v_normalized);
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'canonical_role', 'input', v_normalized, 'canonicalRoleCode', v_canonical,
        'matched', v_canonical IS NOT NULL
    ));
    IF v_canonical IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'unknown_role', 'reasonCode', 'posting_role_unknown',
            'inputRoleCode', p_role_code, 'canonicalRoleCode', NULL, 'steps', v_steps
        );
    END IF;

    SELECT lb.* INTO v_book
      FROM master.ledger_book lb
      JOIN master.company_code_book_assignment ba
        ON ba.tenant_id = lb.tenant_id AND ba.book_id = lb.id
     WHERE lb.tenant_id = p_tenant_id
       AND ba.company_code_id = p_company_code_id
       AND lower(lb.code) = lower(btrim(p_book_code))
       AND lb.status = 'active'
       AND ba.status = 'active'
       AND ba.effective_from <= p_as_of_date
       AND (ba.effective_to IS NULL OR ba.effective_to >= p_as_of_date)
     ORDER BY ba.priority DESC
     LIMIT 1;
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'resolve_book', 'bookCode', p_book_code, 'ledgerBookId', v_book.id,
        'matched', v_book.id IS NOT NULL
    ));
    IF v_book.id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'book_not_assigned', 'reasonCode', 'posting_role_book_not_assigned',
            'inputRoleCode', p_role_code, 'canonicalRoleCode', v_canonical,
            'bookCode', p_book_code, 'asOfDate', p_as_of_date, 'steps', v_steps
        );
    END IF;

    SELECT count(*)::integer INTO v_candidate_count
      FROM control.posting_role_account_map m
     WHERE m.tenant_id = p_tenant_id
       AND m.company_code_id = p_company_code_id
       AND m.ledger_book_id = v_book.id
       AND m.posting_role_code = v_canonical
       AND m.status = 'active'
       AND m.effective_from <= p_as_of_date
       AND (m.effective_to IS NULL OR m.effective_to >= p_as_of_date);

    SELECT m.* INTO v_map
      FROM control.posting_role_account_map m
     WHERE m.tenant_id = p_tenant_id
       AND m.company_code_id = p_company_code_id
       AND m.ledger_book_id = v_book.id
       AND m.posting_role_code = v_canonical
       AND m.status = 'active'
       AND m.effective_from <= p_as_of_date
       AND (m.effective_to IS NULL OR m.effective_to >= p_as_of_date)
     ORDER BY m.priority DESC, m.effective_from DESC, m.id
     LIMIT 1;
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'select_mapping', 'candidateCount', v_candidate_count,
        'mappingId', v_map.id, 'priority', v_map.priority, 'matched', v_map.id IS NOT NULL
    ));
    IF v_map.id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'missing_mapping', 'reasonCode', 'posting_role_mapping_missing',
            'inputRoleCode', p_role_code, 'canonicalRoleCode', v_canonical,
            'ledgerBookId', v_book.id, 'bookCode', v_book.code,
            'asOfDate', p_as_of_date, 'candidateCount', 0, 'steps', v_steps
        );
    END IF;

    SELECT ga.id, ga.code, ga.name, ga.status, ga.node_type, ga.normal_balance,
           COALESCE(ccga.posting_allowed, true) AS posting_allowed,
           COALESCE(ccga.blocked_for_auto, false) AS blocked_for_auto
      INTO v_account
      FROM master.gl_account ga
      LEFT JOIN master.company_code_gl_account ccga
        ON ccga.tenant_id = ga.tenant_id
       AND ccga.company_code_id = p_company_code_id
       AND ccga.gl_account_id = ga.id
     WHERE ga.tenant_id = p_tenant_id AND ga.id = v_map.gl_account_id;
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step', 'validate_account', 'glAccountId', v_account.id,
        'accountCode', v_account.code,
        'activePostingAccount', v_account.status = 'active' AND v_account.node_type = 'posting',
        'postingAllowed', v_account.posting_allowed,
        'blockedForAuto', v_account.blocked_for_auto
    ));
    IF v_account.id IS NULL OR v_account.status <> 'active' OR v_account.node_type <> 'posting'
       OR NOT v_account.posting_allowed OR v_account.blocked_for_auto THEN
        RETURN jsonb_build_object(
            'status', 'invalid_account', 'reasonCode', 'posting_role_account_not_postable',
            'inputRoleCode', p_role_code, 'canonicalRoleCode', v_canonical,
            'mappingId', v_map.id, 'ledgerBookId', v_book.id, 'bookCode', v_book.code,
            'asOfDate', p_as_of_date, 'steps', v_steps
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'resolved', 'reasonCode', 'posting_role_resolved',
        'inputRoleCode', p_role_code, 'canonicalRoleCode', v_canonical,
        'mappingId', v_map.id, 'ledgerBookId', v_book.id, 'bookCode', v_book.code,
        'glAccountId', v_account.id, 'glAccountCode', v_account.code,
        'glAccountName', v_account.name, 'normalBalance', v_account.normal_balance,
        'priority', v_map.priority, 'effectiveFrom', v_map.effective_from,
        'effectiveTo', v_map.effective_to, 'asOfDate', p_as_of_date,
        'candidateCount', v_candidate_count, 'steps', v_steps
    );
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_posting_role_account(
    p_tenant_id       uuid,
    p_role_code       text,
    p_company_code_id uuid,
    p_book_code       text,
    p_as_of_date      date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = control, master, shared, pg_temp
AS $$
DECLARE
    v_trace jsonb;
BEGIN
    v_trace := control.resolve_posting_role_account_trace(
        p_tenant_id, p_role_code, p_company_code_id, p_book_code, p_as_of_date
    );
    IF v_trace->>'status' <> 'resolved' THEN RETURN NULL; END IF;
    RETURN (v_trace->>'glAccountId')::uuid;
END;
$$;

COMMENT ON FUNCTION control.resolve_posting_role_account(uuid, text, uuid, text, date) IS
    'Canonical tenant-hardened posting-role resolver. Preserves the original signature and returns NULL when trace status is not resolved.';
