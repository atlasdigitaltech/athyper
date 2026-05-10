-- ============================================================================
-- control/03_people_meta_constraints.sql
-- Entity-field constraint hardening needed by People metadata.
-- ============================================================================

ALTER TABLE control.entity_field DROP CONSTRAINT IF EXISTS ef_id_suffix_chk;
ALTER TABLE control.entity_field
    ADD CONSTRAINT ef_id_suffix_chk
    CHECK (name NOT LIKE '%\_id' ESCAPE '\' OR data_type = ANY (ARRAY['uuid','reference','uuid_array','uuid[]']));
