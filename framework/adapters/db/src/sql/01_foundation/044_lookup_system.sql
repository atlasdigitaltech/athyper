-- ============================================================================
-- Lookup System: Identity Config + Lookup Profile
-- ============================================================================
-- Adds first-class lookup/typeahead support for reference fields:
--   - identity_config on meta.entity: how an entity identifies itself
--   - lookup_profile on meta.field: per-field search/display behavior
--
-- All columns nullable — fully backward-compatible.
-- ============================================================================

-- ── Entity Identity Config ──
-- Defines primary label, code, alternate keys, and display template
-- for entities frequently used as lookup targets (Supplier, GL Account, etc.)
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS identity_config jsonb;

COMMENT ON COLUMN meta.entity.identity_config IS
  'Entity identity config: { primaryLabelField, primaryCodeField, alternateKeys[], searchAliases[], displayTemplate }';

-- ── Field Lookup Profile ──
-- Per-field override for search/display behavior when this reference field
-- is rendered as a typeahead picker. Merged with target entity identity at runtime.
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS lookup_profile jsonb;

COMMENT ON COLUMN meta.field.lookup_profile IS
  'Lookup search profile: { displayTemplate, searchFields[], matchMode, filters, filtersByContext, orderBy, minChars, debounceMs, pageSize, cacheMode, securityScope }';
