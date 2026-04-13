-- 09_triggers/011_cms.sql
-- Depends on: 04_tables/003f_master_cms.sql, 04_tables/009a_snapshot_cms.sql,
--             08_functions (shared.trg_set_updated_at, shared.trg_set_status_changed),
--             02_types_domains (control.trg_validate_lookup_columns)

-- ============================================================================
-- A.  master.content_item — auto-maintenance
-- ============================================================================

DROP TRIGGER IF EXISTS trg_content_item_updated_at ON master.content_item;
CREATE TRIGGER trg_content_item_updated_at
    BEFORE UPDATE ON master.content_item
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_content_item_status_changed ON master.content_item;
CREATE TRIGGER trg_content_item_status_changed
    BEFORE UPDATE ON master.content_item
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- ============================================================================
-- B.  master.content_item — lookup validation
-- ============================================================================

-- content_item.kind — extensible, governed by master.content_item_kind lookup
DROP TRIGGER IF EXISTS trg_content_item_kind_lookup ON master.content_item;
CREATE TRIGGER trg_content_item_kind_lookup
    BEFORE INSERT OR UPDATE OF kind ON master.content_item
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.content_item_kind', 'kind');

-- ============================================================================
-- C.  master.content_item_link — lookup validation
-- ============================================================================

-- content_item_link.relation_type — extensible
DROP TRIGGER IF EXISTS trg_cil_relation_type_lookup ON master.content_item_link;
CREATE TRIGGER trg_cil_relation_type_lookup
    BEFORE INSERT OR UPDATE OF relation_type ON master.content_item_link
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns(
        'master.content_item_link_relation_type', 'relation_type');

-- ============================================================================
-- D.  snapshot.content_item_version — immutability guard
-- ============================================================================
-- Mirrors snapshot.trg_template_version_immutable pattern.
-- All UPDATE and DELETE attempts raise an exception.

CREATE OR REPLACE FUNCTION snapshot.trg_content_item_version_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'snapshot.content_item_version rows are immutable — UPDATE and DELETE are not allowed';
END;
$$;

COMMENT ON FUNCTION snapshot.trg_content_item_version_immutable() IS
    'Blocks all UPDATE and DELETE on snapshot.content_item_version. '
    'Pattern mirrors snapshot.trg_template_version_immutable.';

DROP TRIGGER IF EXISTS trg_content_item_version_immutable ON snapshot.content_item_version;
CREATE TRIGGER trg_content_item_version_immutable
    BEFORE UPDATE OR DELETE ON snapshot.content_item_version
    FOR EACH ROW EXECUTE FUNCTION snapshot.trg_content_item_version_immutable();
