-- ============================================================================
-- master/01e_tables_ui_principal.sql
-- Concept: User Experience — UI profiles, preferences, saved views, dashboards
-- Depends on: 04_tables/003a_master_identity.sql
-- Principal UI personalization family: profile, preference, saved view,
-- dashboard, dashboard widget.
--
-- Lookup domains used (seeded in 900_seed_data/010_system/000_lookups/):
--   ui.appearance_mode  → principal_ui_profile.appearance_mode
--   ui.density          → principal_ui_profile.density_code
--   ui.preference_code  → principal_ui_preference.preference_code
--   ui.surface_code     → principal_ui_preference.surface_code, saved_view.surface_code,
--                         dashboard.surface_code
--   ui.view_scope       → saved_view.scope
--   ui.dashboard_scope  → dashboard.scope
--   ui.widget_type      → dashboard_widget.widget_type_code
--   ui.breakpoint       → dashboard_widget.breakpoint_code
--
-- Triggers:    09_triggers/003b_master_ui_principal.sql (core)
--              09_triggers/003c_master_ui_principal_supplementary.sql (supplementary)
-- Functions:   08_functions/003b_master_ui_principal.sql
--              08_functions/003c_master_ui_principal_supplementary.sql
-- RLS:         11_rls_policies/003b_master_ui_principal.sql
-- Security:    12_function_security/001_security_hardening.sql
-- Views:       10_views/003b_master_ui_principal.sql
-- Idempotent:  CREATE TABLE IF NOT EXISTS, DO $$ EXCEPTION blocks, CREATE INDEX IF NOT EXISTS
--
-- Resolution order:
--   platform default
--     → master.tenant_profile
--       → master.principal_ui_profile
--         → master.principal_ui_preference
--           → artifact state (master.saved_view / master.dashboard)
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- §1  master.principal_ui_profile  — 1:1 principal-level UI defaults
-- ════════════════════════════════════════════════════════════════════════════
-- NULL on any column = "inherit from tenant_profile / platform default."
-- Does NOT store ephemeral session state (last tab, scroll, recents).

CREATE TABLE IF NOT EXISTS master.principal_ui_profile (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Link (1:1 with principal)
    principal_id            uuid        NOT NULL,

    -- Locale overrides (NULL = inherit from tenant_profile)
    locale_code             text,
    language_code           text,
    timezone_code           text,
    date_format             text,
    number_format           text,
    week_start              smallint,

    -- Appearance
    appearance_mode         text,                -- lookup: ui.appearance_mode
    density_code            text,                -- lookup: ui.density

    -- Navigation defaults
    home_workspace_code     text,                -- FK: shared.workspace(code)
    home_module_code        text,                -- FK: shared.module(code)

    -- Working-context shortcuts
    -- (UI-level defaults; may differ from principal_profile HR/operational defaults)
    default_company_code_id uuid,                -- FK: master.company_code(tenant_id, id)
    default_book_id         uuid,                -- FK: master.ledger_book(tenant_id, id)
    default_dashboard_id    uuid,                -- FK: master.dashboard(tenant_id, id)

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    -- Constraints
    CONSTRAINT puip_pkey              PRIMARY KEY (id),
    CONSTRAINT puip_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT puip_principal_uq      UNIQUE (tenant_id, principal_id),
    CONSTRAINT puip_week_start_chk    CHECK (week_start IS NULL OR week_start BETWEEN 0 AND 6),
    CONSTRAINT puip_date_format_chk   CHECK (date_format IS NULL OR btrim(date_format) <> ''),
    CONSTRAINT puip_number_format_chk CHECK (number_format IS NULL OR btrim(number_format) <> '')
    -- appearance_mode validated by trigger (ui.appearance_mode)
    -- density_code    validated by trigger (ui.density)
);

COMMENT ON TABLE master.principal_ui_profile IS
    'ARCHETYPE=C;SCOPE=T. 1:1 principal-level UI defaults. Mirrors master.tenant_profile at user level. '
    'All columns nullable — NULL = inherit from tenant_profile → platform default. '
    'Resolution: platform → tenant_profile → principal_ui_profile → preference → artifact. '
    'Does NOT store ephemeral session state (last tab, scroll, recents).';
COMMENT ON COLUMN master.principal_ui_profile.locale_code IS
    'BCP-47 locale. FK: shared.locale(code). Overrides tenant_profile.locale_code.';
COMMENT ON COLUMN master.principal_ui_profile.language_code IS
    'FK: shared.language(code). UI language. Overrides tenant_profile.language_code.';
COMMENT ON COLUMN master.principal_ui_profile.timezone_code IS
    'IANA timezone. FK: shared.timezone(code). Overrides tenant_profile.timezone_code.';
COMMENT ON COLUMN master.principal_ui_profile.date_format IS
    'strftime-style format string. NULL = inherit from tenant_profile.';
COMMENT ON COLUMN master.principal_ui_profile.number_format IS
    'Decimal/thousands separator style. NULL = inherit from tenant_profile.';
COMMENT ON COLUMN master.principal_ui_profile.week_start IS
    '0=Sunday … 6=Saturday. NULL = inherit from tenant_profile.';
COMMENT ON COLUMN master.principal_ui_profile.appearance_mode IS
    'Lookup: ui.appearance_mode. Visual theme mode (light, dark, system).';
COMMENT ON COLUMN master.principal_ui_profile.density_code IS
    'Lookup: ui.density. Information density (compact, comfortable, spacious).';
COMMENT ON COLUMN master.principal_ui_profile.home_workspace_code IS
    'FK: shared.workspace(code). Landing workspace after login.';
COMMENT ON COLUMN master.principal_ui_profile.home_module_code IS
    'FK: shared.module(code). Landing module within the home workspace.';
COMMENT ON COLUMN master.principal_ui_profile.default_book_id IS
    'FK: master.ledger_book(tenant_id, id). Default ledger book for journal entry creation. '
    'NULL = use primary book per company_code_book_assignment.';
COMMENT ON COLUMN master.principal_ui_profile.default_dashboard_id IS
    'FK: master.dashboard(tenant_id, id). Default dashboard shown on home screen. '
    'NULL = tenant or system default dashboard.';


-- ════════════════════════════════════════════════════════════════════════════
-- §2  master.principal_ui_preference  — narrow extension table
-- ════════════════════════════════════════════════════════════════════════════
-- Low-frequency, module-specific, or future-extensible settings.
-- NOT for: saved-view payloads, dashboard layouts, recents, search history,
--          or arbitrary caches. Small override values only (≤8 KB).

CREATE TABLE IF NOT EXISTS master.principal_ui_preference (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Link
    principal_id            uuid        NOT NULL,

    -- Key
    preference_code         text        NOT NULL,       -- lookup: ui.preference_code
    surface_code            text,                       -- lookup: ui.surface_code (NULL = global)

    -- Value
    preference_value        jsonb       NOT NULL,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    -- Constraints
    CONSTRAINT puipref_pkey           PRIMARY KEY (id),
    -- NULLS NOT DISTINCT: NULL surface_code is a defined key slot (global), not unknown
    CONSTRAINT puipref_natural_uq     UNIQUE NULLS NOT DISTINCT (tenant_id, principal_id, preference_code, surface_code),
    CONSTRAINT puipref_code_chk       CHECK (btrim(preference_code) <> ''),
    CONSTRAINT puipref_surface_chk    CHECK (surface_code IS NULL OR btrim(surface_code) <> ''),
    CONSTRAINT puipref_value_size_chk CHECK (pg_column_size(preference_value) <= 8192)
    -- preference_code validated by trigger (ui.preference_code)
    -- surface_code    validated by trigger (ui.surface_code) — NULL passes through
);

COMMENT ON TABLE master.principal_ui_preference IS
    'ARCHETYPE=C;SCOPE=T. Narrow extension table for low-frequency, module-specific principal settings. '
    'Controlled key-value overlay — preference_code registered in ui.preference_code domain. '
    'Natural key (tenant_id, principal_id, preference_code, surface_code) UNIQUE NULLS NOT DISTINCT. '
    'Must NOT store saved-view payloads, dashboard layouts, recents, or search history. '
    'Small override values only (≤8 KB per row).';
COMMENT ON COLUMN master.principal_ui_preference.preference_code IS
    'Lookup: ui.preference_code. Registered preference key. '
    'Prevents uncatalogued key proliferation.';
COMMENT ON COLUMN master.principal_ui_preference.surface_code IS
    'Lookup: ui.surface_code. NULL = global (not surface-scoped). '
    'When set, the preference applies only to that UI surface.';
COMMENT ON COLUMN master.principal_ui_preference.preference_value IS
    'JSONB payload. Size-capped at 8 KB to prevent misuse as a document store.';


-- ════════════════════════════════════════════════════════════════════════════
-- §3  master.saved_view  — named grid/list/query presets
-- ════════════════════════════════════════════════════════════════════════════
-- Scope: personal (owner only), shared (tenant), system (platform-seeded).
-- Status lifecycle: active → archived.

CREATE TABLE IF NOT EXISTS master.saved_view (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Ownership
    owner_principal_id      uuid,                       -- NULL for system scope
    scope                   text        NOT NULL,       -- lookup: ui.view_scope

    -- Target surface
    surface_code            text        NOT NULL,       -- lookup: ui.surface_code
    entity_key              text,                       -- optional entity discriminator

    -- Display
    code                    text        NOT NULL,       -- machine-stable key (immutable)
    name                    text        NOT NULL,       -- human label
    description             text,

    -- Flags
    is_pinned               boolean     NOT NULL DEFAULT false,
    is_default              boolean     NOT NULL DEFAULT false,

    -- State
    state_json              jsonb       NOT NULL,
    state_hash              text,                       -- SHA-256 of state_json for dedup
    version                 integer     NOT NULL DEFAULT 1,

    -- Lifecycle
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    deleted_at              timestamptz,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    -- Constraints
    CONSTRAINT sv_pkey                PRIMARY KEY (id),
    CONSTRAINT sv_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT sv_code_chk            CHECK (btrim(code) <> ''),
    CONSTRAINT sv_name_chk            CHECK (btrim(name) <> ''),
    CONSTRAINT sv_surface_chk         CHECK (btrim(surface_code) <> ''),
    CONSTRAINT sv_version_chk         CHECK (version >= 1),
    CONSTRAINT sv_status_chk          CHECK (status IN ('active', 'archived')),
    CONSTRAINT sv_deleted_status_chk  CHECK (deleted_at IS NULL OR status = 'archived'),
    CONSTRAINT sv_scope_owner_chk     CHECK (
        CASE scope
            WHEN 'personal' THEN owner_principal_id IS NOT NULL
            WHEN 'system'   THEN owner_principal_id IS NULL
            WHEN 'shared'   THEN true   -- owner optional: records creator when set
            ELSE false
        END
    )
    -- scope        validated by trigger (ui.view_scope)
    -- surface_code validated by trigger (ui.surface_code)
);

COMMENT ON TABLE master.saved_view IS
    'ARCHETYPE=B;SCOPE=T. Named grid/list/query presets. Durable artifact in master. '
    'Scope: personal (owner only), shared (all tenant users), system (platform-seeded). '
    'state_json holds filter/sort/column state; state_hash enables dedup. '
    'version supports optimistic concurrency. '
    'Lifecycle: active → archived. deleted_at only set when status = archived. '
    'Phase 1: single mutable row per view — no version history table yet.';
COMMENT ON COLUMN master.saved_view.entity_key IS
    'Optional discriminator when a surface hosts multiple entity types. '
    'e.g. surface=document_list, entity_key=purchase_order.';
COMMENT ON COLUMN master.saved_view.state_hash IS
    'SHA-256 of canonical state_json. Enables dedup and change detection. '
    'Computed by application layer on write.';
COMMENT ON COLUMN master.saved_view.version IS
    'Optimistic concurrency version. Incremented on every write. '
    'Client sends current version; server rejects stale updates.';

-- Active name uniqueness per owner+surface+entity+scope
DROP INDEX IF EXISTS master.sv_name_uq;
CREATE UNIQUE INDEX IF NOT EXISTS sv_name_uq
    ON master.saved_view (tenant_id, scope, owner_principal_id, surface_code, entity_key, name)
    NULLS NOT DISTINCT
    WHERE status = 'active';

-- At most one active default per owner+surface+entity+scope
DROP INDEX IF EXISTS master.sv_one_default_uq;
CREATE UNIQUE INDEX IF NOT EXISTS sv_one_default_uq
    ON master.saved_view (tenant_id, scope, owner_principal_id, surface_code, entity_key)
    NULLS NOT DISTINCT
    WHERE is_default = true AND status = 'active';

-- Surface lookup (active only)
CREATE INDEX IF NOT EXISTS sv_surface_idx
    ON master.saved_view (tenant_id, surface_code)
    WHERE status = 'active';

-- Owner lookup (personal views)
CREATE INDEX IF NOT EXISTS sv_owner_idx
    ON master.saved_view (tenant_id, owner_principal_id, surface_code)
    WHERE status = 'active' AND owner_principal_id IS NOT NULL;

-- State dedup
CREATE INDEX IF NOT EXISTS sv_hash_idx
    ON master.saved_view (tenant_id, surface_code, state_hash)
    WHERE state_hash IS NOT NULL AND status = 'active';


-- ════════════════════════════════════════════════════════════════════════════
-- §4  master.dashboard  — named dashboard container / header
-- ════════════════════════════════════════════════════════════════════════════
-- Widgets belong to dashboards, not directly to principals.
-- Status lifecycle: active → archived.

CREATE TABLE IF NOT EXISTS master.dashboard (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Ownership
    owner_principal_id      uuid,                       -- NULL for system scope
    scope                   text        NOT NULL,       -- lookup: ui.dashboard_scope

    -- Display
    code                    text        NOT NULL,       -- machine-stable key (immutable)
    name                    text        NOT NULL,       -- human label
    description             text,
    surface_code            text,                       -- optional surface binding

    -- Flags
    is_default              boolean     NOT NULL DEFAULT false,
    is_home                 boolean     NOT NULL DEFAULT false,

    -- Lifecycle
    status                  text        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    deleted_at              timestamptz,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    -- Constraints
    CONSTRAINT dash_pkey                PRIMARY KEY (id),
    CONSTRAINT dash_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT dash_code_chk            CHECK (btrim(code) <> ''),
    CONSTRAINT dash_name_chk            CHECK (btrim(name) <> ''),
    CONSTRAINT dash_status_chk          CHECK (status IN ('active', 'archived')),
    CONSTRAINT dash_deleted_status_chk  CHECK (deleted_at IS NULL OR status = 'archived'),
    CONSTRAINT dash_scope_owner_chk     CHECK (
        CASE scope
            WHEN 'personal' THEN owner_principal_id IS NOT NULL
            WHEN 'system'   THEN owner_principal_id IS NULL
            WHEN 'shared'   THEN true
            ELSE false
        END
    )
    -- scope        validated by trigger (ui.dashboard_scope)
    -- surface_code validated by trigger (ui.surface_code) when NOT NULL
);

COMMENT ON TABLE master.dashboard IS
    'ARCHETYPE=B;SCOPE=T. Dashboard header/container. Similar to saved_view but for named landing pages. '
    'Widgets belong to dashboards (via dashboard_widget), not directly to principals. '
    'Scope: personal, shared, system. is_home = landing dashboard when no explicit default. '
    'Lifecycle: active → archived. deleted_at only set when status = archived.';
COMMENT ON COLUMN master.dashboard.surface_code IS
    'Optional surface binding. NULL = dashboard is surface-agnostic (home screen). '
    'When set, dashboard appears only on that surface.';
COMMENT ON COLUMN master.dashboard.is_home IS
    'Landing dashboard shown after login when principal_ui_profile.default_dashboard_id is NULL. '
    'Partial unique index enforces at most one active home per owner+scope.';

-- Code uniqueness per owner+scope (active only)
CREATE UNIQUE INDEX IF NOT EXISTS dash_code_uq
    ON master.dashboard (tenant_id, scope, owner_principal_id, code)
    NULLS NOT DISTINCT
    WHERE status = 'active';

-- At most one active default per owner+surface+scope
CREATE UNIQUE INDEX IF NOT EXISTS dash_one_default_uq
    ON master.dashboard (tenant_id, scope, owner_principal_id, surface_code)
    NULLS NOT DISTINCT
    WHERE is_default = true AND status = 'active';

-- At most one active home per owner+scope
CREATE UNIQUE INDEX IF NOT EXISTS dash_one_home_uq
    ON master.dashboard (tenant_id, scope, owner_principal_id)
    NULLS NOT DISTINCT
    WHERE is_home = true AND status = 'active';

-- Owner lookup
CREATE INDEX IF NOT EXISTS dash_owner_idx
    ON master.dashboard (tenant_id, owner_principal_id)
    WHERE status = 'active' AND owner_principal_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- §5  master.dashboard_widget  — child of master.dashboard
-- ════════════════════════════════════════════════════════════════════════════
-- Grid-layout widget instances. Natural key includes breakpoint_code so the
-- same widget can have per-breakpoint layout overrides (responsive grid).
-- breakpoint_code NULL = layout applies at all breakpoints.

CREATE TABLE IF NOT EXISTS master.dashboard_widget (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Parent link
    dashboard_id            uuid        NOT NULL,       -- FK: master.dashboard(tenant_id, id)

    -- Widget identity
    widget_code             text        NOT NULL,       -- stable within dashboard
    widget_type_code        text        NOT NULL,       -- lookup: ui.widget_type

    -- Display
    title                   text,
    description             text,

    -- Grid layout (CSS Grid / react-grid-layout compatible)
    x_pos                   smallint    NOT NULL DEFAULT 0,
    y_pos                   smallint    NOT NULL DEFAULT 0,
    width_units             smallint    NOT NULL DEFAULT 4,
    height_units            smallint    NOT NULL DEFAULT 3,
    breakpoint_code         text,                       -- lookup: ui.breakpoint (NULL = all)
    ordinal_no              smallint    NOT NULL DEFAULT 0,

    -- Configuration
    config_json             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    data_source_json        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Visibility
    is_visible              boolean     NOT NULL DEFAULT true,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    -- Constraints
    CONSTRAINT dw_pkey                  PRIMARY KEY (id),
    -- NULLS NOT DISTINCT: NULL breakpoint = universal layout, distinct from named breakpoints
    CONSTRAINT dw_widget_bp_uq          UNIQUE NULLS NOT DISTINCT (dashboard_id, widget_code, breakpoint_code),
    CONSTRAINT dw_ordinal_bp_uq         UNIQUE NULLS NOT DISTINCT (dashboard_id, breakpoint_code, ordinal_no),
    CONSTRAINT dw_widget_code_chk       CHECK (btrim(widget_code) <> ''),
    CONSTRAINT dw_x_pos_chk             CHECK (x_pos >= 0),
    CONSTRAINT dw_y_pos_chk             CHECK (y_pos >= 0),
    CONSTRAINT dw_width_chk             CHECK (width_units BETWEEN 1 AND 24),
    CONSTRAINT dw_height_chk            CHECK (height_units BETWEEN 1 AND 24),
    CONSTRAINT dw_ordinal_chk           CHECK (ordinal_no >= 0)
    -- widget_type_code validated by trigger (ui.widget_type)
    -- breakpoint_code  validated by trigger (ui.breakpoint) — NULL passes through
);

COMMENT ON TABLE master.dashboard_widget IS
    'ARCHETYPE=C;SCOPE=T. Dashboard widget instances. Child of master.dashboard. '
    'Layout normalized: x_pos, y_pos, width_units, height_units for CSS Grid / react-grid-layout. '
    'Natural key = (dashboard_id, widget_code, breakpoint_code) NULLS NOT DISTINCT — '
    'same widget_code appears once per breakpoint for responsive layout. '
    'breakpoint_code NULL = layout applies at all breakpoints.';
COMMENT ON COLUMN master.dashboard_widget.widget_code IS
    'Machine-stable key unique within parent dashboard per breakpoint. '
    'Used for client-side reconciliation and update targeting.';
COMMENT ON COLUMN master.dashboard_widget.config_json IS
    'Widget-specific configuration. Schema varies by widget_type_code.';
COMMENT ON COLUMN master.dashboard_widget.data_source_json IS
    'Data source binding (API endpoint, saved_view ref, query params). '
    'Schema varies by widget_type_code.';
COMMENT ON COLUMN master.dashboard_widget.breakpoint_code IS
    'Lookup: ui.breakpoint. NULL = applies at all breakpoints. '
    'Same widget_code may have rows for each breakpoint_code value.';

-- Dashboard children lookup
CREATE INDEX IF NOT EXISTS dw_dashboard_idx
    ON master.dashboard_widget (tenant_id, dashboard_id);


-- ════════════════════════════════════════════════════════════════════════════
-- §6  FOREIGN KEY CONSTRAINTS
-- ════════════════════════════════════════════════════════════════════════════
-- All cross-table FKs use tenant-composite (tenant_id, id) pattern.
-- Idempotent: DO $$ EXCEPTION WHEN duplicate_object THEN NULL blocks.

-- ── principal_ui_profile ─────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_locale_fk
    FOREIGN KEY (locale_code) REFERENCES shared.locale (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_language_fk
    FOREIGN KEY (language_code) REFERENCES shared.language (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_timezone_fk
    FOREIGN KEY (timezone_code) REFERENCES shared.timezone (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_home_workspace_fk
    FOREIGN KEY (home_workspace_code) REFERENCES shared.workspace (code) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_home_module_fk
    FOREIGN KEY (home_module_code) REFERENCES shared.module (code) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_default_company_fk
    FOREIGN KEY (tenant_id, default_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- puip_default_ou_fk removed: default_ou_id column dropped in company_code migration

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_default_book_fk
    FOREIGN KEY (tenant_id, default_book_id)
    REFERENCES master.ledger_book (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_default_dashboard_fk
    FOREIGN KEY (tenant_id, default_dashboard_id)
    REFERENCES master.dashboard (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_profile ADD CONSTRAINT puip_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── principal_ui_preference ───────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE master.principal_ui_preference ADD CONSTRAINT puipref_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_preference ADD CONSTRAINT puipref_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_preference ADD CONSTRAINT puipref_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_ui_preference ADD CONSTRAINT puipref_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── saved_view ────────────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE master.saved_view ADD CONSTRAINT sv_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.saved_view ADD CONSTRAINT sv_owner_fk
    FOREIGN KEY (tenant_id, owner_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.saved_view ADD CONSTRAINT sv_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.saved_view ADD CONSTRAINT sv_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── dashboard ─────────────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE master.dashboard ADD CONSTRAINT dash_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.dashboard ADD CONSTRAINT dash_owner_fk
    FOREIGN KEY (tenant_id, owner_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.dashboard ADD CONSTRAINT dash_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.dashboard ADD CONSTRAINT dash_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── dashboard_widget ──────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE master.dashboard_widget ADD CONSTRAINT dw_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.dashboard_widget ADD CONSTRAINT dw_dashboard_fk
    FOREIGN KEY (tenant_id, dashboard_id)
    REFERENCES master.dashboard (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.dashboard_widget ADD CONSTRAINT dw_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.dashboard_widget ADD CONSTRAINT dw_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- §N  master.principal_notification_preference  — per-user notification opt-in
-- ════════════════════════════════════════════════════════════════════════════
-- One row per (tenant, principal, event_code, channel).
-- NULL is_enabled = inherit routing rule default.
-- NULL frequency_code = no digest batching (deliver immediately).
-- Precedence: routing rule → principal preference → digest frequency override.
-- high/urgent priorities (as defined in notification.priority seed) are never
-- downshifted to digest regardless of frequency_code.
--
-- Lookup domains (seeded in 900_seed_data/010_system/000_lookups/):
--   notification.channel   → channel
--   notification.digest_frequency → frequency_code

CREATE TABLE IF NOT EXISTS master.principal_notification_preference (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Owner
    principal_id    uuid        NOT NULL,

    -- Scope — what event + channel this preference applies to
    event_code      text        NOT NULL,   -- matches notification_routing_rule.event_type
    channel         text        NOT NULL,   -- lookup: notification.channel

    -- Opt-in/out  (NULL = inherit routing rule default)
    is_enabled      boolean,

    -- Digest batching (NULL = deliver immediately; only applies to digest-eligible priorities)
    frequency_code  text,                   -- lookup: notification.digest_frequency

    -- Metadata
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT pnp_pkey                PRIMARY KEY (id),
    CONSTRAINT pnp_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT pnp_natural_key_uq      UNIQUE (tenant_id, principal_id, event_code, channel),
    CONSTRAINT pnp_status_chk          CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT pnp_event_code_nonempty CHECK (btrim(event_code) <> ''),
    CONSTRAINT pnp_channel_nonempty    CHECK (btrim(channel) <> '')
    -- channel validated by trigger (notification.channel)
    -- frequency_code validated by trigger (notification.digest_frequency)
);

COMMENT ON TABLE master.principal_notification_preference IS
    'ARCHETYPE=B;SCOPE=T. Per-user notification opt-in/out by event_code + channel. '
    'NULL is_enabled = inherit routing rule default. '
    'NULL frequency_code = immediate delivery (no digest batching). '
    'high/urgent priorities are never downshifted to digest. '
    'Precedence: routing rule → principal preference → digest frequency.';

COMMENT ON COLUMN master.principal_notification_preference.event_code IS
    'Matches control.notification_routing_rule.event_type. Identifies the notification trigger.';
COMMENT ON COLUMN master.principal_notification_preference.channel IS
    'Lookup: notification.channel (in_app, email, sms, push, webhook).';
COMMENT ON COLUMN master.principal_notification_preference.is_enabled IS
    'NULL = inherit routing rule. false = suppress all deliveries for this event+channel.';
COMMENT ON COLUMN master.principal_notification_preference.frequency_code IS
    'Lookup: notification.digest_frequency. NULL = immediate. Only honoured for digest-eligible priorities.';

-- Foreign keys
DO $$ BEGIN ALTER TABLE master.principal_notification_preference ADD CONSTRAINT pnp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_notification_preference ADD CONSTRAINT pnp_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_notification_preference ADD CONSTRAINT pnp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_notification_preference ADD CONSTRAINT pnp_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index: lookups by principal
CREATE INDEX IF NOT EXISTS pnp_principal_idx
    ON master.principal_notification_preference (tenant_id, principal_id)
    WHERE is_active = true;
