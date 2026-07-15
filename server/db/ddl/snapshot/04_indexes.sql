-- ============================================================================
-- snapshot/04_indexes.sql
-- Concept: Snapshot Indexes — version and compiled entity lookup performance
-- Depends on: 04_tables/009_snapshot.sql
-- ============================================================================

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

-- ── snapshot.content_item_version ───────────────────────────────────────────
-- Latest version per content item (DESC for most-recent-first queries)
CREATE INDEX IF NOT EXISTS civ_item_version_desc_idx
    ON snapshot.content_item_version (content_item_id, version DESC);

-- ── snapshot.template_version ──────────────────────────────────────────────
-- GiST temporal range: answers "which version was effective on date X?"
-- Requires btree_gist (already loaded in 00_extensions/001_extensions.sql)
CREATE INDEX IF NOT EXISTS template_version_effective_range_idx
    ON snapshot.template_version USING GIST (
        tenant_id,
        template_id,
        daterange(effective_from, effective_to, '[)')
    );


-- =============================================================================
-- §8  snapshot.document_snapshot — generic document snapshot indexes
-- =============================================================================

-- Primary read: latest snapshot per entity, most-recent-first
CREATE INDEX IF NOT EXISTS ds_entity_recent_idx
    ON snapshot.document_snapshot (tenant_id, entity_type, entity_id, captured_at DESC);

-- Audit-by-activity-log: drives v_p2p_audit_timeline join
CREATE INDEX IF NOT EXISTS ds_activity_log_idx
    ON snapshot.document_snapshot (tenant_id, activity_log_id)
    WHERE activity_log_id IS NOT NULL;

-- Chain traversal: walk backwards from a snapshot
CREATE INDEX IF NOT EXISTS ds_chain_idx
    ON snapshot.document_snapshot (tenant_id, entity_id, chain_seq DESC);

-- Gate-event filtering: e.g. all financial_post snapshots in a tenant
CREATE INDEX IF NOT EXISTS ds_gate_kind_idx
    ON snapshot.document_snapshot (tenant_id, gate_event_kind, captured_at DESC);
