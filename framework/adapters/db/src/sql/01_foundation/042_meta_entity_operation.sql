/* ============================================================================
   Athyper — META: Entity Operation Capabilities

   Declares which operations are enabled per entity type.
   Two-tier resolution: system defaults (tenant_id IS NULL) + tenant overrides.

   Mental model:
     Capabilities = enabled actions on the entity type (what it supports)
     Actions      = currently allowed now (filtered by auth + lifecycle state)

   This table defines Capabilities. Actions are computed at runtime by
   EntityPageDescriptorService using capabilities + persona + state.

   Uses entity_name (text) rather than entity_id (uuid) for the entity
   reference — same pattern as meta.entity_lifecycle, meta.migration_history,
   and meta.publish_artifact. This allows system defaults (tenant_id IS NULL)
   to reference entities across all tenants by their stable logical name.

   PostgreSQL 16+
   ============================================================================ */

CREATE TABLE IF NOT EXISTS meta.entity_operation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES core.tenant(id) ON DELETE CASCADE,  -- NULL = system default
  entity_name     text NOT NULL,      -- logical entity key (matches meta.entity.name)
  operation_code  text NOT NULL REFERENCES core.operation(code) ON DELETE RESTRICT,

  -- UI surface: where the operation appears
  --   LIST         = list page only
  --   DETAIL       = detail page only
  --   BOTH         = both list and detail
  --   PALETTE_ONLY = command palette only (no visible button)
  --   HIDDEN       = disabled from all UI (still in catalog)
  surface         text NOT NULL DEFAULT 'BOTH',

  -- Placement: how the operation is rendered on its surface
  --   PRIMARY  = primary action button (prominent CTA)
  --   TOOLBAR  = toolbar button row
  --   OVERFLOW = overflow/more menu
  --   CONTEXT  = context/right-click menu
  --   COMMAND  = command palette only (keyboard shortcut)
  placement       text NOT NULL DEFAULT 'TOOLBAR',

  -- Execution dispatch: how the operation runs
  --   NAVIGATE = client-side router.push(handlerTarget)
  --   API      = POST to entity action endpoint
  --   MODAL    = open modal dialog by key
  --   INLINE   = inline component render
  handler_type    text NOT NULL DEFAULT 'API',
  handler_target  text,  -- route template | endpoint key | modal key | component key

  -- Per-entity-per-operation: does this operation need a selected record?
  requires_record boolean NOT NULL DEFAULT false,

  -- Ordering & label/icon customization
  sort_order      int NOT NULL DEFAULT 0,
  label_override  text,   -- NULL = inherit from core.operation.name
  icon_override   text,   -- NULL = inherit category default icon
  tcode_alias     text,   -- optional SAP-style numeric alias (e.g., PO01)

  -- Enablement (tenant can suppress a system default via is_enabled=false)
  is_enabled      boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text NOT NULL DEFAULT 'system',
  updated_at      timestamptz,
  updated_by      text,

  -- Enum constraints
  CONSTRAINT entity_operation_surface_chk CHECK (
    surface IN ('LIST', 'DETAIL', 'BOTH', 'PALETTE_ONLY', 'HIDDEN')
  ),
  CONSTRAINT entity_operation_placement_chk CHECK (
    placement IN ('PRIMARY', 'TOOLBAR', 'OVERFLOW', 'CONTEXT', 'COMMAND')
  ),
  CONSTRAINT entity_operation_handler_chk CHECK (
    handler_type IN ('NAVIGATE', 'API', 'MODAL', 'INLINE')
  ),

  -- Cross-check: prevent nonsensical surface x placement combos
  --   HIDDEN + PRIMARY   = invisible primary button makes no sense
  --   PALETTE_ONLY + PRIMARY/TOOLBAR = no visible button surface
  CONSTRAINT entity_operation_surface_placement_chk CHECK (
    NOT (surface = 'HIDDEN' AND placement = 'PRIMARY')
    AND NOT (surface = 'PALETTE_ONLY' AND placement IN ('PRIMARY', 'TOOLBAR'))
  ),

  -- Uniqueness: one row per (tenant, entity, operation) for non-NULL tenants
  CONSTRAINT entity_operation_uniq UNIQUE (tenant_id, entity_name, operation_code)
);

-- Migration: remove duplicate system-default rows accumulated from prior seed runs.
-- Keeps the earliest row (min id) per (entity_name, operation_code) group.
-- Must run BEFORE the unique index creation.
DELETE FROM meta.entity_operation
WHERE tenant_id IS NULL
  AND id NOT IN (
    SELECT DISTINCT ON (entity_name, operation_code) id
    FROM meta.entity_operation
    WHERE tenant_id IS NULL
    ORDER BY entity_name, operation_code, created_at ASC
  );

-- Partial unique index: ensures one system-default row per (entity, operation).
-- Standard UNIQUE treats NULL ≠ NULL, so this partial index covers the NULL case.
-- The seed function's ON CONFLICT references this index to skip duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_operation_system_uniq
  ON meta.entity_operation (entity_name, operation_code)
  WHERE tenant_id IS NULL;

COMMENT ON TABLE meta.entity_operation IS
  'Entity capability declarations. System defaults (tenant_id NULL) + tenant overrides. Resolution: overlay tenant rows on system defaults by (entity_name, operation_code).';

-- Indexes for the two-tier query pattern
CREATE INDEX IF NOT EXISTS idx_entity_operation_entity
  ON meta.entity_operation (entity_name);

CREATE INDEX IF NOT EXISTS idx_entity_operation_tenant
  ON meta.entity_operation (tenant_id, entity_name) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_operation_system
  ON meta.entity_operation (entity_name) WHERE tenant_id IS NULL;


-- ============================================================================
-- Resolved View: materializes the system-default + tenant-override overlay
--
-- Usage:  SELECT * FROM meta.entity_operation_resolved
--         WHERE tenant_id = '<uuid>';
--
-- Resolution rule:
--   For each system default row, if a tenant override exists for the same
--   (entity_name, operation_code), use the tenant values. Otherwise use system.
--   The is_tenant_override flag indicates which rows are customized.
-- ============================================================================

CREATE OR REPLACE VIEW meta.entity_operation_resolved AS
  SELECT
    COALESCE(t.id, s.id)                             AS id,
    t.tenant_id                                       AS tenant_id,
    COALESCE(t.entity_name, s.entity_name)            AS entity_name,
    COALESCE(t.operation_code, s.operation_code)      AS operation_code,
    COALESCE(t.surface, s.surface)                    AS surface,
    COALESCE(t.placement, s.placement)                AS placement,
    COALESCE(t.handler_type, s.handler_type)          AS handler_type,
    COALESCE(t.handler_target, s.handler_target)      AS handler_target,
    COALESCE(t.requires_record, s.requires_record)    AS requires_record,
    COALESCE(t.sort_order, s.sort_order)              AS sort_order,
    COALESCE(t.label_override, s.label_override)      AS label_override,
    COALESCE(t.icon_override, s.icon_override)        AS icon_override,
    COALESCE(t.tcode_alias, s.tcode_alias)            AS tcode_alias,
    COALESCE(t.is_enabled, s.is_enabled)              AS is_enabled,
    (t.id IS NOT NULL)                                AS is_tenant_override
  FROM meta.entity_operation s
  LEFT JOIN meta.entity_operation t
    ON  t.entity_name = s.entity_name
    AND t.operation_code = s.operation_code
    AND t.tenant_id IS NOT NULL
  WHERE s.tenant_id IS NULL;

COMMENT ON VIEW meta.entity_operation_resolved IS
  'Materialized overlay: system defaults with tenant overrides applied. Filter with WHERE tenant_id = ? for tenant-specific resolution.';
