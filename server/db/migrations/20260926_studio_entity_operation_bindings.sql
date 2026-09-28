-- Studio also consumes read-only reference entity apps. This extends allowed
-- metadata coordinates only; it creates no permissions, grants or active releases.
ALTER TABLE metadata.entity_operation_permission
  DROP CONSTRAINT entity_operation_permission_plane_chk,
  ADD CONSTRAINT entity_operation_permission_plane_chk
    CHECK (target_plane IN ('studio', 'neon', 'mesh'));
ALTER TABLE metadata.entity_operation_scope_binding
  DROP CONSTRAINT entity_operation_scope_binding_plane_chk,
  ADD CONSTRAINT entity_operation_scope_binding_plane_chk
    CHECK (target_plane IN ('studio', 'neon', 'mesh'));
