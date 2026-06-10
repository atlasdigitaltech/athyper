-- ============================================================================
-- seed/platform/003_control/095_permission_alias.sql
-- Seed: control.permission_alias — register edit → update legacy alias.
-- Schema: control | Table: permission_alias
-- Depends on: control DDL (01z_three_plane_tables.sql), shared.permission seed
-- Idempotent: ON CONFLICT (alias_code) DO NOTHING
--
-- Reference: docs/local/architecture/three-plane-permission-stack.md  D6
--
-- Decision recap: canonical action code is `update`; `edit` is the deprecated
-- legacy synonym. Both rows remain in shared.permission during the warn phase
-- so the compiler can resolve either. Once hard_fail_after is set on this
-- alias row, server/scripts/verify/permission-aliases.ts (Phase 6) will
-- reject any entity_operation row still referencing 'edit' as permission_code.
-- ============================================================================

INSERT INTO control.permission_alias
    (canonical_code, alias_code, hard_fail_after, notes, created_by)
VALUES
    ('update', 'edit', NULL,
     'D6: collapsed `edit` into `update`. Warn-first; hard_fail_after will be set when CI gate (verify-permission-aliases.ts) lands.',
     '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (alias_code) DO NOTHING;
