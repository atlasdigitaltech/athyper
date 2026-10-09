BEGIN;
-- Expose head coordinates only for an active Entity descriptor already readable
-- by the control role. Descriptor RLS preserves product/tenant visibility.
CREATE POLICY release_activation_head_control_entity ON runtime_meta.release_activation_head
FOR SELECT TO athyper_control_api USING (
 EXISTS (SELECT 1 FROM runtime_meta.entity_descriptor d
 WHERE d.applied_release_id=release_activation_head.applied_release_id
   AND d.status='active'
   AND (d.tenant_id IS NULL OR d.tenant_id=shared.current_tenant_id_soft()))
);
COMMIT;
