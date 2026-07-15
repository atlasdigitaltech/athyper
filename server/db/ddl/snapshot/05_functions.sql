-- ============================================================================
-- snapshot/05_functions.sql
-- Concept: Snapshot Logic — entity version compilation functions
-- Depends on: 04_tables/009_snapshot.sql, 04_tables/002_control.sql
-- ============================================================================

-- ─── C. Immutability guards for snapshot tables ──────────────────────────────

CREATE OR REPLACE FUNCTION snapshot.trg_compiled_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'snapshot.% is append-only. Create a new compiled snapshot instead.',
        TG_TABLE_NAME USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

COMMENT ON FUNCTION snapshot.trg_compiled_immutable() IS
    'Blocks UPDATE/DELETE on snapshot.entity_compiled and snapshot.entity_compiled_overlay. '
    'These tables are append-only — new compiled snapshots are created, never modified.';


-- =============================================================================
-- §D. document_snapshot — append-only immutability guard
-- =============================================================================

CREATE OR REPLACE FUNCTION snapshot.trg_document_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'snapshot.document_snapshot is append-only — capture a new snapshot instead.'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

COMMENT ON FUNCTION snapshot.trg_document_snapshot_immutable() IS
    'Blocks UPDATE/DELETE on snapshot.document_snapshot. Capture a new snapshot via '
    'snapshot.fn_capture_full() to record a state change.';


-- =============================================================================
-- §E. snapshot.fn_capture_full — write a document snapshot row
-- =============================================================================
-- Called from the snapshot.capture hook action (or imperatively from posting
-- services in transitional code paths). Stamps payload_hash, links into the
-- previous-snapshot chain, and returns the new snapshot id.
--
-- Payload assembly is the caller's responsibility — this function does NOT
-- query the entity tables (callers know which children to include and have
-- already serialized them under load). That keeps the function generic
-- across entity types and avoids embedding entity-shape logic here.
-- =============================================================================

CREATE OR REPLACE FUNCTION snapshot.fn_capture_full(
    p_tenant_id          uuid,
    p_entity_type        text,
    p_entity_id          uuid,
    p_document_code      text,
    p_version_number     int,
    p_gate_event         text,
    p_gate_event_kind    text,
    p_activity_log_id    uuid,
    p_header_json        jsonb,
    p_lines_json         jsonb,
    p_components_json    jsonb,
    p_distributions_json jsonb,
    p_schedules_json     jsonb,
    p_related_json       jsonb,
    p_captured_by        uuid,
    p_capture_source     text DEFAULT 'transition_hook'
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_prev_id   uuid;
    v_prev_seq  int;
    v_payload   jsonb;
    v_hash      text;
    v_new_id    uuid;
BEGIN
    -- Find previous snapshot in this entity's chain (latest captured)
    SELECT id, chain_seq
      INTO v_prev_id, v_prev_seq
      FROM snapshot.document_snapshot
     WHERE tenant_id = p_tenant_id
       AND entity_type = p_entity_type
       AND entity_id = p_entity_id
     ORDER BY chain_seq DESC, captured_at DESC
     LIMIT 1;

    -- Canonical payload for hashing: ordered keys via jsonb_build_object
    v_payload := jsonb_build_object(
        'entity_type',        p_entity_type,
        'entity_id',          p_entity_id,
        'version_number',     COALESCE(p_version_number, 1),
        'gate_event',         p_gate_event,
        'gate_event_kind',    p_gate_event_kind,
        'header',             COALESCE(p_header_json,        '{}'::jsonb),
        'lines',              COALESCE(p_lines_json,         '[]'::jsonb),
        'components',         COALESCE(p_components_json,    '[]'::jsonb),
        'distributions',      COALESCE(p_distributions_json, '[]'::jsonb),
        'schedules',          COALESCE(p_schedules_json,     '[]'::jsonb),
        'related',            COALESCE(p_related_json,       '{}'::jsonb),
        'previous_snapshot_id', v_prev_id
    );

    v_hash := encode(digest(v_payload::text, 'sha256'), 'hex');

    INSERT INTO snapshot.document_snapshot (
        tenant_id, entity_type, entity_id, document_code, version_number,
        gate_event, gate_event_kind, activity_log_id,
        header_json, lines_json, components_json, distributions_json,
        schedules_json, related_json,
        payload_hash, previous_snapshot_id, chain_seq,
        captured_by, capture_source
    ) VALUES (
        p_tenant_id, p_entity_type, p_entity_id, p_document_code, COALESCE(p_version_number, 1),
        p_gate_event, p_gate_event_kind, p_activity_log_id,
        p_header_json, p_lines_json, p_components_json, p_distributions_json,
        p_schedules_json, p_related_json,
        v_hash, v_prev_id, COALESCE(v_prev_seq, 0) + 1,
        p_captured_by, p_capture_source
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION snapshot.fn_capture_full(
    uuid, text, uuid, text, int, text, text, uuid,
    jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
    uuid, text
) IS
    'Writes one snapshot.document_snapshot row. Looks up the previous snapshot for the '
    'entity to link the hash chain (previous_snapshot_id + chain_seq), stamps a SHA-256 '
    'payload_hash, and returns the new snapshot id. Caller supplies the serialised '
    'header / lines / components / distributions / schedules / related payloads — this '
    'function is entity-agnostic.';


-- =============================================================================
-- §F. snapshot.fn_get_doc_at — find the snapshot active at a point in time
-- =============================================================================

CREATE OR REPLACE FUNCTION snapshot.fn_get_doc_at(
    p_tenant_id    uuid,
    p_entity_type  text,
    p_entity_id    uuid,
    p_at           timestamptz
)
RETURNS snapshot.document_snapshot LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_row snapshot.document_snapshot;
BEGIN
    SELECT *
      INTO v_row
      FROM snapshot.document_snapshot
     WHERE tenant_id = p_tenant_id
       AND entity_type = p_entity_type
       AND entity_id = p_entity_id
       AND captured_at <= p_at
     ORDER BY captured_at DESC
     LIMIT 1;

    RETURN v_row;
END;
$$;

COMMENT ON FUNCTION snapshot.fn_get_doc_at(uuid, text, uuid, timestamptz) IS
    'Returns the document_snapshot row for (entity_type, entity_id) that was current '
    'at the supplied timestamp. If no snapshot existed before p_at, returns NULL row. '
    'STABLE so the planner can fold it into reporting queries.';


-- =============================================================================
-- §G. snapshot.fn_verify_chain — assert hash continuity for one entity
-- =============================================================================

CREATE OR REPLACE FUNCTION snapshot.fn_verify_chain(
    p_tenant_id   uuid,
    p_entity_type text,
    p_entity_id   uuid
)
RETURNS TABLE (
    snapshot_id        uuid,
    chain_seq          int,
    captured_at        timestamptz,
    expected_prev_id   uuid,
    actual_prev_id     uuid,
    chain_ok           boolean
) LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH chain AS (
        SELECT id, chain_seq, captured_at, previous_snapshot_id,
               LAG(id) OVER (ORDER BY chain_seq) AS prev_chain_id
          FROM snapshot.document_snapshot
         WHERE tenant_id = p_tenant_id
           AND entity_type = p_entity_type
           AND entity_id = p_entity_id
    )
    SELECT c.id,
           c.chain_seq,
           c.captured_at,
           c.prev_chain_id              AS expected_prev_id,
           c.previous_snapshot_id       AS actual_prev_id,
           (c.prev_chain_id IS NOT DISTINCT FROM c.previous_snapshot_id) AS chain_ok
      FROM chain c
     ORDER BY c.chain_seq;
END;
$$;

COMMENT ON FUNCTION snapshot.fn_verify_chain(uuid, text, uuid) IS
    'Walks the snapshot chain for (entity_type, entity_id) and yields one row per '
    'snapshot with chain_ok=false where previous_snapshot_id does not match the prior '
    'chain_seq''s id. Used by server/scripts/verify-snapshot-chain.ts.';


-- =============================================================================
-- §G.1 snapshot.fn_verify_snapshot_hash — recompute + compare payload hash
-- =============================================================================
-- Returns TRUE when the stored payload_hash matches a fresh recompute from
-- the row's *_json columns; FALSE when the JSON has been tampered with or
-- the storage has corrupted; NULL when the snapshot id doesn't exist.
--
-- Canonicalization MUST match fn_capture_full §E exactly — same
-- jsonb_build_object key order, same COALESCE defaults, same digest call.
-- Drift between the writer and the verifier silently breaks tamper
-- detection.
--
-- Called from server/packages/services/business/p2p/snapshot-restore.service.ts
-- before applying the restore. SQL-side recompute avoids porting Postgres'
-- jsonb-to-text canonicalization to TypeScript (a drift risk we deliberately
-- chose to avoid in Phase 13).

CREATE OR REPLACE FUNCTION snapshot.fn_verify_snapshot_hash(
    p_snapshot_id uuid
)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_row              snapshot.document_snapshot%ROWTYPE;
    v_payload          jsonb;
    v_recomputed_hash  text;
BEGIN
    SELECT * INTO v_row
      FROM snapshot.document_snapshot
     WHERE id = p_snapshot_id
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Mirror fn_capture_full §E key order and COALESCE defaults exactly.
    v_payload := jsonb_build_object(
        'entity_type',          v_row.entity_type,
        'entity_id',            v_row.entity_id,
        'version_number',       COALESCE(v_row.version_number, 1),
        'gate_event',           v_row.gate_event,
        'gate_event_kind',      v_row.gate_event_kind,
        'header',               COALESCE(v_row.header_json,        '{}'::jsonb),
        'lines',                COALESCE(v_row.lines_json,         '[]'::jsonb),
        'components',           COALESCE(v_row.components_json,    '[]'::jsonb),
        'distributions',        COALESCE(v_row.distributions_json, '[]'::jsonb),
        'schedules',            COALESCE(v_row.schedules_json,     '[]'::jsonb),
        'related',              COALESCE(v_row.related_json,       '{}'::jsonb),
        'previous_snapshot_id', v_row.previous_snapshot_id
    );

    v_recomputed_hash := encode(digest(v_payload::text, 'sha256'), 'hex');
    RETURN v_recomputed_hash = v_row.payload_hash;
END;
$$;

COMMENT ON FUNCTION snapshot.fn_verify_snapshot_hash(uuid) IS
    'Returns TRUE when stored payload_hash matches a fresh recompute; FALSE on '
    'tamper/corruption; NULL when the snapshot id does not exist. Canonicalization '
    'MUST match fn_capture_full §E exactly. Called from snapshot-restore.service '
    'before applying a restore.';


-- =============================================================================
-- §H. snapshot.fn_diff_snapshots — JSON-level diff between two snapshots
-- =============================================================================
-- Returns a flat row-per-changed-path. Intended for audit UIs; not a structural
-- merge.

CREATE OR REPLACE FUNCTION snapshot.fn_diff_snapshots(
    p_snapshot_a_id uuid,
    p_snapshot_b_id uuid
)
RETURNS TABLE (
    section text,
    path    text,
    a_value jsonb,
    b_value jsonb
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_a snapshot.document_snapshot;
    v_b snapshot.document_snapshot;
BEGIN
    SELECT * INTO v_a FROM snapshot.document_snapshot WHERE id = p_snapshot_a_id LIMIT 1;
    SELECT * INTO v_b FROM snapshot.document_snapshot WHERE id = p_snapshot_b_id LIMIT 1;

    IF v_a.id IS NULL OR v_b.id IS NULL THEN
        RETURN;
    END IF;

    -- Top-level section diff: emit one row per section whose payload differs.
    -- Path-granular diff is deferred to the client (renderer has shape knowledge).
    RETURN QUERY
    SELECT s.section, s.section AS path, s.a_val, s.b_val
      FROM (VALUES
        ('header',        v_a.header_json,        v_b.header_json),
        ('lines',         v_a.lines_json,         v_b.lines_json),
        ('components',    v_a.components_json,    v_b.components_json),
        ('distributions', v_a.distributions_json, v_b.distributions_json),
        ('schedules',     v_a.schedules_json,     v_b.schedules_json),
        ('related',       v_a.related_json,       v_b.related_json)
      ) AS s(section, a_val, b_val)
     WHERE s.a_val IS DISTINCT FROM s.b_val;
END;
$$;

COMMENT ON FUNCTION snapshot.fn_diff_snapshots(uuid, uuid) IS
    'Emits one row per top-level section (header / lines / components / distributions / '
    'schedules / related) whose payload differs between two snapshots. Path-granular '
    'diff is the renderer''s responsibility — it knows the entity-specific shape.';
