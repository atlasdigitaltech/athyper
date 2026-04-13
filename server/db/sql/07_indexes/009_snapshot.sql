-- 07_indexes/009_snapshot.sql

CREATE INDEX IF NOT EXISTS li_state_idx
    ON master.lifecycle_instance (tenant_id, lifecycle_id, state_id);

-- ── snapshot.lifecycle_version ───────────────────────────────────────────────
-- Latest version per lifecycle
CREATE INDEX IF NOT EXISTS lv_lifecycle_latest_idx
    ON snapshot.lifecycle_version (lifecycle_id, version DESC);

-- ── snapshot.status_route ────────────────────────────────────────────────────
-- Hash-based staleness check
CREATE INDEX IF NOT EXISTS sr_hash_idx
    ON snapshot.status_route (tenant_id, entity_name, compiled_hash);

-- ─── snapshot.entity_compiled ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ec_version_idx
    ON snapshot.entity_compiled (entity_version_id);


-- =============================================================================
-- §6  DOCUMENT · PRINT · BRANDING  —  snapshot indexes
-- =============================================================================

-- ── snapshot.template_version ──────────────────────────────────────────────
-- GiST temporal range: answers "which version was effective on date X?"
-- Requires btree_gist (already loaded in 00_extensions/001_extensions.sql)
CREATE INDEX IF NOT EXISTS template_version_effective_range_idx
    ON snapshot.template_version USING GIST (
        tenant_id,
        template_id,
        daterange(effective_from, effective_to, '[)')
    );
