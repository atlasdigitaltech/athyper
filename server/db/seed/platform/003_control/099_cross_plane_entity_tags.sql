-- ============================================================================
-- seed/platform/003_control/099_cross_plane_entity_tags.sql
-- Seed: Tag existing platform entities with plane_eligibility for mesh access.
-- Schema: control | Table: entity
-- Depends on: 040_entity.sql, 01z_three_plane_tables.sql
-- Idempotent: UPDATE with array_remove + array_append idempotent guard
--
-- Reference: docs/local/architecture/three-plane-permission-stack.md  Section 8
--
-- A small set of business document entities is visible to mesh partners
-- (suppliers see purchase_invoice they issued; customers see sales_invoice
-- they were billed for). These entities keep their neon tag and gain mesh.
--
-- Meta entity registration (meta_entity, meta_entity_field, ...) is deferred
-- to Phase 4 (Studio routes); mesh-only entity registration (mesh_inbox,
-- mesh_thread, ...) is deferred to Phase 5 (mesh routes). Both require
-- entity_class_profile + entity_version + entity_field derivation that fits
-- better with the consumer surfaces.
-- ============================================================================

DO $$
BEGIN
    -- Cross-plane business documents: visible in mesh to the counter-party
    UPDATE control.entity
       SET plane_eligibility = ARRAY(
               SELECT DISTINCT unnest(plane_eligibility || ARRAY['mesh'])
           )
     WHERE tenant_id IS NULL
       AND entity_code IN (
           'purchase_invoice',
           'purchase_order',
           'sales_invoice',
           'sales_order',
           'goods_receipt_note'
       )
       AND NOT (plane_eligibility @> ARRAY['mesh']);

    RAISE NOTICE 'Cross-plane tags applied to platform business document entities';
END $$;
