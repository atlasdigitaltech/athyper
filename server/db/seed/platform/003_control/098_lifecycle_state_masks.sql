-- ============================================================================
-- seed/platform/003_control/098_lifecycle_state_masks.sql
-- Seed: control.entity_lifecycle_state_mask — 5th capability gate platform defaults.
-- Schema: control | Table: entity_lifecycle_state_mask
-- Depends on: control DDL (01z_three_plane_tables.sql)
-- Idempotent: ON CONFLICT (tenant_id, entity_name, record_status) DO NOTHING
--
-- Reference: docs/local/architecture/three-plane-permission-stack.md  D9
--
-- These masks replace the hardcoded EDITABLE_STATUSES Set in
-- packages/shared/runtime-canvas/src/surfaces/line-items-surface.tsx.
-- Each row says: for this entity in this status, what record-level capability
-- remains, and what disabled_reason to surface to the UI when blocked.
--
-- Tenants can override these by inserting rows with tenant_id set; the
-- DescriptorResolver picks tenant-scoped rows first, then falls back to
-- tenant_id IS NULL defaults.
-- ============================================================================

INSERT INTO control.entity_lifecycle_state_mask
    (tenant_id, entity_name, record_status,
     can_edit, can_delete, disabled_reason, created_by)
VALUES
    -- Journal entry: posted/reversed are immutable
    (NULL, 'journal_entry', 'posted',   false, false, 'posted_locked',       '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'journal_entry', 'reversed', false, false, 'reversed_immutable',  '00000000-0000-0000-0000-000000000000'::uuid),

    -- Purchase invoice
    (NULL, 'purchase_invoice', 'matched',   false, true,  'matched_lock',           '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_invoice', 'posted',    false, false, 'posted_locked',          '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_invoice', 'cancelled', false, false, 'cancelled_immutable',    '00000000-0000-0000-0000-000000000000'::uuid),

    -- Purchase order
    (NULL, 'purchase_order', 'cancelled', false, false, 'cancelled_immutable',     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_order', 'closed',    false, true,  'closed_lock',             '00000000-0000-0000-0000-000000000000'::uuid),

    -- Payment entry
    (NULL, 'payment_entry', 'posted',    false, false, 'posted_locked',           '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'payment_entry', 'reversed',  false, false, 'reversed_immutable',      '00000000-0000-0000-0000-000000000000'::uuid),

    -- Supplier
    (NULL, 'supplier', 'archived',   false, false, 'archived_immutable',          '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'supplier', 'blocked',    true,  false, 'blocked_no_delete',           '00000000-0000-0000-0000-000000000000'::uuid),

    -- Fiscal period
    (NULL, 'fiscal_period', 'closed', false, false, 'period_closed',              '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'fiscal_period', 'frozen', false, false, 'period_frozen',              '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (tenant_id, entity_name, record_status) DO NOTHING;
