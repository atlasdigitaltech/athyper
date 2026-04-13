-- 04_tables/009_snapshot.sql
-- Depends on: 01_schemas, 04_tables/002_control.sql
-- Snapshot schema tables.

-- =============================================================================
-- §11  snapshot.lifecycle_version — frozen immutable compiled definition
-- =============================================================================
-- Immutable snapshot of a lifecycle at a point in time.
-- workflow_instance pins to a lifecycle_version_id — version pinning.
-- L05: UNIQUE(lifecycle_id, version) — no duplicate version numbers.
-- Append-only: no UPDATE or DELETE (enforced by trigger).

CREATE TABLE IF NOT EXISTS snapshot.lifecycle_version (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    lifecycle_id    uuid        NOT NULL,

    -- Version
    version         integer     NOT NULL,

    -- Compiled definition (denormalised from control.lifecycle + child tables)
    -- {states: [{id, code, name, is_terminal, is_initial, config}],
    --  transitions: [{id, from, to, operation_code, config}],
    --  hooks: [{id, timing, action, config, origin, contract_role, safety_level}],
    --  gates: {transition_id: {required_operations, conditions, threshold_rules}},
    --  timers: {state_code: {policy_code, rules: [...]}}}
    definition      jsonb       NOT NULL,

    -- Source hash (matches lifecycle.definition_hash at compile time)
    compiled_hash   text        NOT NULL,

    -- Audit (append-only — no updated_at)
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT lv_pkey              PRIMARY KEY (id),
    CONSTRAINT lv_tenant_id_uq     UNIQUE (tenant_id, id),
    -- L05: no duplicate version numbers per lifecycle per tenant
    CONSTRAINT lv_version_uq        UNIQUE (tenant_id, lifecycle_id, version),
    CONSTRAINT lv_version_chk       CHECK (version >= 1),
    CONSTRAINT lv_definition_chk    CHECK (jsonb_typeof(definition) = 'object'),
    CONSTRAINT lv_hash_chk          CHECK (length(compiled_hash) >= 64)
);

COMMENT ON TABLE  snapshot.lifecycle_version IS
    'Immutable compiled snapshots of lifecycle definitions. '
    'document.workflow_instance pins to lifecycle_version_id — '
    'in-flight workflows continue on the version active when they started. '
    'advance_workflow_state() reads definition jsonb (one row, no joins). '
    'Append-only: trg_lv_immutable blocks UPDATE and DELETE. '
    'L05: UNIQUE(lifecycle_id, version) added. '
    'Replaces snapshot.lifecycle_version (backup).';
COMMENT ON COLUMN snapshot.lifecycle_version.definition IS
    'Fully denormalised lifecycle definition. Structure: '
    '{states:[{id,code,name,is_terminal,is_initial,sort_order,config}], '
    'transitions:[{id,from,to,operation_code,is_active,config}], '
    'hooks:[{id,timing,action,config,origin,contract_role,safety_level,sort_order}], '
    'gates:{transition_id:{required_operations,conditions,threshold_rules}}, '
    'timers:{state_code:{policy_code,rules:[...]}}}.';


-- =============================================================================
-- §12  snapshot.lifecycle_route — full compiled route map per lifecycle
-- =============================================================================
-- Pre-computed traversal graph: which states are reachable from each state.
-- Used by UI to visualise "what can happen next" and by navigation helpers.
-- Renamed from: snapshot.entity_lifecycle_route_compiled (backup).
-- UNIQUE(tenant_id, lifecycle_id) — one route per lifecycle per tenant.

CREATE TABLE IF NOT EXISTS snapshot.lifecycle_route (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    lifecycle_id    uuid        NOT NULL,

    -- Compiled route graph
    -- {reachable_from: {state_code: [reachable_state_codes]},
    --  shortest_paths: {from_code: {to_code: [path_codes]}},
    --  terminal_states: [state_codes],
    --  initial_state: state_code}
    compiled_json   jsonb       NOT NULL,
    compiled_hash   text        NOT NULL,

    -- Audit (append-only)
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT lr_pkey          PRIMARY KEY (id),
    CONSTRAINT lr_lifecycle_uq  UNIQUE NULLS NOT DISTINCT (tenant_id, lifecycle_id),
    CONSTRAINT lr_json_chk      CHECK (jsonb_typeof(compiled_json) = 'object'),
    CONSTRAINT lr_hash_chk      CHECK (length(compiled_hash) >= 64)
);

COMMENT ON TABLE  snapshot.lifecycle_route IS
    'Pre-compiled full route graph for a lifecycle. '
    'Used by UI to render ''what happens next'' state visualisation. '
    'Recompiled by fn_lifecycle_child_changed when definition changes. '
    'Renamed from snapshot.entity_lifecycle_route_compiled. '
    'UNIQUE(tenant_id, lifecycle_id) — one route map per lifecycle.';


-- =============================================================================
-- §13  snapshot.status_route — simplified route for Pattern A/B entities
-- =============================================================================
-- One row per (tenant, entity_name). Flat allowed-transitions map.
-- Used by control.validate_status_transition() for O(1) status update validation.
-- Used by control.guard_terminal_immutability() to block edits on terminal records.
-- Used by control.guard_deletable_states() to block DELETE on non-draft records.
-- Renamed from: snapshot.status_route_compiled (backup).

CREATE TABLE IF NOT EXISTS snapshot.status_route (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,
    entity_name     text        NOT NULL,

    -- Compiled route (flat map for fast O(1) lookups)
    -- {allowed_transitions: {from_status: [to_statuses]},
    --  terminal_states: [status_codes],
    --  deletable_states: [status_codes],
    --  initial_state: status_code,
    --  all_states: [status_codes]}
    compiled_json   jsonb       NOT NULL,
    compiled_hash   text        NOT NULL,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT sr_pkey              PRIMARY KEY (id),
    CONSTRAINT sr_entity_uq         UNIQUE (tenant_id, entity_name),
    CONSTRAINT sr_entity_chk        CHECK (btrim(entity_name) <> ''),
    CONSTRAINT sr_json_chk          CHECK (jsonb_typeof(compiled_json) = 'object'),
    CONSTRAINT sr_hash_chk          CHECK (length(compiled_hash) >= 64)
);

COMMENT ON TABLE  snapshot.status_route IS
    'Simplified compiled status transition map for Pattern A/B entities. '
    'One row per (tenant, entity_name) — fastest possible lookup for status validation. '
    'Read by control.validate_status_transition() on every entity status UPDATE. '
    'Read by control.guard_terminal_immutability() to block field edits. '
    'Read by control.guard_deletable_states() to block DELETE. '
    'Recompiled by snapshot.compile_status_route() when lifecycle definition changes. '
    'Renamed from snapshot.status_route_compiled. '
    'updated_at/updated_by added — mutable (recompiled in-place, not appended).';


-- =============================================================================
-- §15  snapshot.entity_compiled
-- =============================================================================
-- Pre-compiled JSON snapshot of an entity version for fast runtime serving.
-- Read-only after creation — compile function creates new rows, never updates.

CREATE TABLE IF NOT EXISTS snapshot.entity_compiled (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    entity_version_id           uuid        NOT NULL,

    -- Compiled output
    compiled_json               jsonb       NOT NULL,
    compiled_hash               text        NOT NULL,

    -- Compliance lint results
    compliance_report           jsonb       NOT NULL DEFAULT '{}',
    compliance_score            numeric(5,2),

    -- Audit (append-only)
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,

    CONSTRAINT ec_pkey              PRIMARY KEY (id),
    CONSTRAINT ec_version_uq        UNIQUE (entity_version_id),
    CONSTRAINT ec_hash_chk          CHECK (length(compiled_hash) >= 64),
    CONSTRAINT ec_score_chk         CHECK (
        compliance_score IS NULL OR compliance_score BETWEEN 0 AND 100
    ),
    CONSTRAINT ec_json_chk          CHECK (jsonb_typeof(compiled_json) = 'object'),
    CONSTRAINT ec_report_chk        CHECK (jsonb_typeof(compliance_report) = 'object')
);

COMMENT ON TABLE  snapshot.entity_compiled IS
    'Pre-compiled entity version snapshot for fast API serving. '
    'Append-only — trg_fn_ec_immutable blocks UPDATE/DELETE. '
    'UNIQUE(entity_version_id) — one compiled snapshot per version. '
    'compliance_score: 0-100 linting quality score.';


-- =============================================================================
-- §16  snapshot.entity_compiled_overlay
-- =============================================================================
-- Compiled overlay delta — the diff applied to entity_compiled for a specific
-- overlay set. Allows overlay rendering without re-compiling the base.

CREATE TABLE IF NOT EXISTS snapshot.entity_compiled_overlay (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    entity_version_id           uuid        NOT NULL,

    -- Which overlays are included in this compilation
    overlay_set                 jsonb       NOT NULL, -- [overlay_id, ...]

    -- Compiled delta
    compiled_json               jsonb       NOT NULL,
    compiled_hash               text        NOT NULL,

    -- Audit (append-only)
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,

    CONSTRAINT eco_pkey             PRIMARY KEY (id),
    CONSTRAINT eco_hash_chk         CHECK (length(compiled_hash) >= 64),
    CONSTRAINT eco_set_chk          CHECK (jsonb_typeof(overlay_set) = 'array'),
    CONSTRAINT eco_json_chk         CHECK (jsonb_typeof(compiled_json) = 'object')
);

COMMENT ON TABLE  snapshot.entity_compiled_overlay IS
    'Compiled overlay delta for a specific entity version + overlay set. '
    'Append-only. Applied on top of snapshot.entity_compiled at serve time. '
    'overlay_set: jsonb array of overlay_ids included in this compilation.';


-- =============================================================================
-- §6  snapshot.template_version — Document · Print · Branding
-- =============================================================================
-- Immutable frozen content snapshot per template version.
-- Created once — UPDATE and DELETE blocked by trg_fn_template_version_immutable.
-- btree_gist extension (already loaded) required for the GiST temporal index.

CREATE TABLE IF NOT EXISTS snapshot.template_version (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Parent reference
    template_id     uuid        NOT NULL,
    version         integer     NOT NULL,

    -- Content (at minimum one of html or json must be NOT NULL)
    content_html    text,
    content_json    jsonb,
    header_html     text,
    footer_html     text,
    styles_css      text,

    -- Schema & assets
    variables_schema    jsonb,
    assets_manifest     jsonb,

    -- Integrity
    checksum        text        NOT NULL,

    -- Effective date window for "which version on date X?" queries
    effective_from  date,
    effective_to    date,

    -- Immutable audit — no updated_at (snapshots never change)
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,

    CONSTRAINT template_version_pkey            PRIMARY KEY (id),
    CONSTRAINT template_version_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT template_version_checksum_uq     UNIQUE (tenant_id, template_id, checksum),
    CONSTRAINT template_version_version_pos     CHECK (version >= 1),
    CONSTRAINT template_version_has_content     CHECK (
        content_html IS NOT NULL OR content_json IS NOT NULL
    ),
    CONSTRAINT template_version_date_order      CHECK (
        effective_to IS NULL
        OR effective_from IS NULL
        OR effective_to >= effective_from
    ),
    CONSTRAINT template_version_checksum_chk    CHECK (btrim(checksum) <> '')
    -- Circular FK from master.template.current_version_id handled in 06_constraints
    -- (DEFERRABLE INITIALLY DEFERRED)
);

COMMENT ON TABLE  snapshot.template_version IS
    'Immutable point-in-time snapshot of template content per version. '
    'UPDATE and DELETE blocked by trg_fn_template_version_immutable trigger. '
    'GiST temporal index supports ''which version was effective on date X?'' queries.';
COMMENT ON COLUMN snapshot.template_version.checksum IS
    'SHA-256 or similar hash of content. Unique per (tenant, template) — prevents '
    'duplicate version content being published.';
COMMENT ON COLUMN snapshot.template_version.variables_schema IS
    'JSON Schema for template variables. Validated by fn_validate_variables_schema().';
