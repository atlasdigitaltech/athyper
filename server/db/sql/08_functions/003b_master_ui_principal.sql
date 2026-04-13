-- 08_functions/003b_master_ui_principal.sql
-- Depends on: 04_tables/003e_master_ui_principal.sql (principal_ui_profile,
--             principal_ui_preference, saved_view, dashboard, dashboard_widget),
--             05_pre_constraint_functions/001_shared.sql (shared.current_tenant_id),
--             08_functions/003_master.sql
-- Execution order: after 04_tables, before 09_triggers.
-- Ownership + REVOKE/GRANT: 12_function_security/001_security_hardening.sql
--
-- ⚠  NULL surface_code prerequisite: fn_set_principal_ui_preference uses
--    ON CONFLICT (tenant_id, principal_id, preference_code, surface_code).
--    PostgreSQL treats NULL as distinct from NULL in unique constraints
--    (pre-PG15 behaviour). The unique index on principal_ui_preference MUST
--    use NULLS NOT DISTINCT (PG 15+) or a sentinel value (e.g. COALESCE to '')
--    for the ON CONFLICT upsert to work when surface_code IS NULL.
--    Verify in 04_tables/003e_master_ui_principal.sql before deploying.

-- ════════════════════════════════════════════════════════════════════════════
-- fn_resolve_principal_ui
-- ════════════════════════════════════════════════════════════════════════════
-- Returns effective UI settings for a single principal, applying the cascade:
--   platform defaults → tenant_profile → principal_ui_profile
-- Working-context defaults (company, OU) fall back to principal_profile.
--
-- Security gates (SECURITY DEFINER, owned by athyperadmin):
--   1. p_tenant_id must match shared.current_tenant_id() (raises if GUC unset).
--   2. Caller must be the target principal OR a member of athyperadmin.
--      Uses session_user (not current_user) because inside SECURITY DEFINER
--      current_user is the function owner, not the original caller.
-- Returns NULL if the principal is not found or is inactive.

CREATE OR REPLACE FUNCTION master.fn_resolve_principal_ui(
    p_tenant_id     uuid,
    p_principal_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL RESTRICTED          -- reads GUCs (session_user, current_setting); safe in
                             -- parallel workers but RESTRICTED matches project convention
                             -- for any function that touches session context.
SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
DECLARE
    v_session_tenant    uuid;
    v_session_principal uuid;
    v_is_admin          boolean;
BEGIN
    -- ── Gate 1: tenant isolation ───────────────────────────────────────────
    -- current_tenant_id() raises if GUC is unset — intentional.
    v_session_tenant := shared.current_tenant_id();

    IF v_session_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION
            'fn_resolve_principal_ui: session tenant (%) does not match requested tenant (%)',
            v_session_tenant, p_tenant_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── Gate 2: caller identity ────────────────────────────────────────────
    -- CRITICAL: must use session_user, not current_user.
    -- Inside SECURITY DEFINER, current_user is the function owner (definer),
    -- not the caller. session_user is the original login role and is unaffected
    -- by SECURITY DEFINER context.
    v_is_admin := pg_has_role(session_user, 'athyperadmin', 'MEMBER');

    IF NOT v_is_admin THEN
        v_session_principal := nullif(current_setting('app.current_principal_id', true), '')::uuid;

        IF v_session_principal IS NULL THEN
            RAISE EXCEPTION
                'fn_resolve_principal_ui: app.current_principal_id is not set'
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        IF v_session_principal IS DISTINCT FROM p_principal_id THEN
            RAISE EXCEPTION
                'fn_resolve_principal_ui: session principal (%) cannot resolve another principal (%)',
                v_session_principal, p_principal_id
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- ── Resolution query ───────────────────────────────────────────────────
    RETURN (
        SELECT jsonb_build_object(
            'principal_id',            p.id,
            'tenant_id',               p.tenant_id,

            -- Locale
            'locale_code',             COALESCE(pui.locale_code,   tp.locale_code,   'en'),
            'language_code',           COALESCE(pui.language_code, tp.language_code,  'en'),
            'timezone_code',           COALESCE(pui.timezone_code, tp.timezone_code,  'UTC'),
            'date_format',             COALESCE(pui.date_format,   tp.date_format,   '%Y-%m-%d'),
            'number_format',           COALESCE(pui.number_format, tp.number_format),
            'week_start',              COALESCE(pui.week_start,    tp.week_start,    1),

            -- Appearance
            'appearance_mode',         COALESCE(pui.appearance_mode, 'system'),
            'density_code',            COALESCE(pui.density_code,    'comfortable'),

            -- Navigation
            'home_workspace_code',     pui.home_workspace_code,
            'home_module_code',        pui.home_module_code,

            -- Working-context defaults
            'default_company_code_id', COALESCE(pui.default_company_code_id, pp.default_company_code_id),
            'default_book_id',         pui.default_book_id,
            'default_dashboard_id',    pui.default_dashboard_id
        )
        FROM master.principal p
        LEFT JOIN master.principal_profile      pp  ON pp.principal_id = p.id AND pp.tenant_id = p.tenant_id
        LEFT JOIN master.principal_ui_profile   pui ON pui.principal_id = p.id AND pui.tenant_id = p.tenant_id
        LEFT JOIN master.tenant_profile         tp  ON tp.tenant_id = p.tenant_id
        WHERE p.id        = p_principal_id
          AND p.tenant_id = p_tenant_id
          AND p.status    = 'active'
    );
END;
$$;

COMMENT ON FUNCTION master.fn_resolve_principal_ui IS
    'Returns effective UI settings for a single principal as JSONB. '
    'Applies resolution cascade: platform defaults → tenant_profile → principal_ui_profile. '
    'Working-context defaults fall back to principal_profile (HR/operational). '
    'SECURITY DEFINER — owned by athyperadmin (see 12_function_security). '
    'Gates: (1) p_tenant_id must match session tenant (current_tenant_id()); '
    '        (2) caller must be the target principal or athyperadmin. '
    'Admin check uses session_user (not current_user) — inside SECURITY DEFINER '
    'current_user resolves to the function owner, not the caller. '
    'Returns NULL if principal not found or inactive.';


-- ════════════════════════════════════════════════════════════════════════════
-- fn_set_principal_ui_preference
-- ════════════════════════════════════════════════════════════════════════════
-- Upsert a single preference key for a principal.  No admin bypass on the
-- write path — preferences may only be set by the owning principal.
-- Admin-initiated preference provisioning must use direct INSERT with the
-- system principal (00000000-…-0000) as the session principal.
--
-- ⚠  Requires the unique index on principal_ui_preference to use
--    NULLS NOT DISTINCT (or a sentinel value) for NULL surface_code.
--    See file-header note.

CREATE OR REPLACE FUNCTION master.fn_set_principal_ui_preference(
    p_tenant_id         uuid,
    p_principal_id      uuid,
    p_preference_code   text,
    p_surface_code      text,          -- NULL for global preferences
    p_preference_value  jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
DECLARE
    v_session_tenant    uuid;
    v_session_principal uuid;
    v_id                uuid;
BEGIN
    -- ── Gate 1: tenant isolation ───────────────────────────────────────────
    v_session_tenant := shared.current_tenant_id();

    IF v_session_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION
            'fn_set_principal_ui_preference: session tenant (%) does not match requested tenant (%)',
            v_session_tenant, p_tenant_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── Gate 2: principal identity ─────────────────────────────────────────
    -- No admin bypass: the write path is owner-only.
    -- Admin-initiated provisioning must set app.current_principal_id to the
    -- system principal (00000000-0000-0000-0000-000000000000) before calling.
    v_session_principal := nullif(current_setting('app.current_principal_id', true), '')::uuid;

    IF v_session_principal IS NULL THEN
        RAISE EXCEPTION
            'fn_set_principal_ui_preference: app.current_principal_id is not set'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_session_principal IS DISTINCT FROM p_principal_id THEN
        RAISE EXCEPTION
            'fn_set_principal_ui_preference: session principal (%) does not match target (%)',
            v_session_principal, p_principal_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── Upsert ─────────────────────────────────────────────────────────────
    -- created_by is stamped to v_session_principal here; trg_puipref_enforce_created_by
    -- sees current_user = athyperadmin (SECURITY DEFINER) and trusts the pre-stamped value.
    -- updated_at / updated_by on the UPDATE path are stamped by trg_puipref_updated_at
    -- (defined in 09_triggers/003b_master_ui_principal.sql).
    INSERT INTO master.principal_ui_preference (
        tenant_id, principal_id, preference_code, surface_code,
        preference_value, created_by
    ) VALUES (
        p_tenant_id, p_principal_id, p_preference_code, p_surface_code,
        p_preference_value, v_session_principal
    )
    ON CONFLICT (tenant_id, principal_id, preference_code, surface_code)
    DO UPDATE SET
        preference_value = EXCLUDED.preference_value
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION master.fn_set_principal_ui_preference IS
    'Upsert a principal UI preference row. INSERT ON CONFLICT UPDATE. '
    'SECURITY DEFINER — owned by athyperadmin (see 12_function_security). '
    'Gates: (1) p_tenant_id must match session tenant; '
    '        (2) session principal must match target principal (no admin bypass). '
    'Admin-initiated provisioning: set app.current_principal_id = system principal first. '
    'updated_at/updated_by stamped by trg_puipref_updated_at on UPDATE path. '
    'Lookup validation on preference_code/surface_code enforced by row triggers. '
    '⚠  Requires NULLS NOT DISTINCT unique index on (tenant_id, principal_id, '
    'preference_code, surface_code) for NULL surface_code upserts to work correctly.';


-- ════════════════════════════════════════════════════════════════════════════
-- trg_enforce_created_by  (trigger function)
-- ════════════════════════════════════════════════════════════════════════════
-- INSERT: stamps created_by from app.current_principal_id GUC, overwriting
--         whatever the caller passed. athyperadmin bypass trusts an explicit
--         value (seed/migration) or falls back to the system principal.
-- UPDATE: blocks any change to created_by (immutability).
--
-- Security note — current_user vs session_user:
--   This is a plain trigger function (not SECURITY DEFINER). When invoked
--   from inside a SECURITY DEFINER caller (e.g. fn_set_principal_ui_preference),
--   current_user is the definer role (athyperadmin). That is safe: the caller
--   has already validated the session and stamped created_by correctly. The
--   admin branch merely trusts the pre-stamped value rather than overwriting it.
--
-- Attach to tables where created_by has security weight (shared-scope update RLS
-- grants edit rights to the row creator — spoofing it would grant unintended access).

CREATE OR REPLACE FUNCTION master.trg_enforce_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, shared, pg_catalog
AS $$
DECLARE
    v_session_principal uuid;
BEGIN
    -- ── UPDATE: created_by is immutable ────────────────────────────────────
    IF TG_OP = 'UPDATE' THEN
        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION '%.%: created_by is immutable after insert (cannot change "%" to "%")',
                TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.created_by, NEW.created_by
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- ── INSERT: stamp created_by from session ──────────────────────────────
    -- Admin bypass: athyperadmin may set created_by explicitly (seed/migration).
    -- current_user is intentional here: when called from within a SECURITY DEFINER
    -- function the definer role is visible as current_user, which is the admin —
    -- the caller has already stamped created_by to the correct session principal.
    IF pg_has_role(current_user, 'athyperadmin', 'MEMBER') THEN
        IF NEW.created_by IS NULL THEN
            -- Fallback: system principal for admin-initiated inserts without an explicit value.
            NEW.created_by := '00000000-0000-0000-0000-000000000000'::uuid;
        END IF;
        RETURN NEW;
    END IF;

    -- Regular sessions: app.current_principal_id must be set.
    v_session_principal := nullif(current_setting('app.current_principal_id', true), '')::uuid;

    IF v_session_principal IS NULL THEN
        RAISE EXCEPTION '%.%: cannot INSERT without app.current_principal_id session context',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Overwrite whatever the caller passed — session principal is canonical.
    NEW.created_by := v_session_principal;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_enforce_created_by IS
    'Enforces created_by = session principal on INSERT; immutability on UPDATE. '
    'INSERT: overwrites created_by with app.current_principal_id GUC. '
    'Raises if GUC unset, unless current_user is athyperadmin (may set explicitly). '
    'UPDATE: raises check_violation on any change to created_by. '
    'Prevents created_by spoofing on tables where shared-scope update RLS '
    'grants edit rights to the row creator. '
    'Attach via 09_triggers/003b_master_ui_principal.sql.';
