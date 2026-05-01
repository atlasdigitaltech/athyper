-- entity_engine/080_display_config_natural_key.sql
-- Bulk-seeds display_config and natural_key_fields for all system entities that
-- still carry the default empty values after their primary seed files ran.
--
-- Strategy by entity_class:
--   MASTER / CONTROL / REFERENCE / DIMENSION  → natural_key=['code'], renderer='master'
--   DOCUMENT (master schema)                  → natural_key=['document_no'], renderer='document'
--   DOCUMENT_RELATION / RELATION / AGGREGATE  → natural_key=['id'], renderer='master'
--   LOG                                       → natural_key=['id'], renderer='master'
--
-- All UPDATEs are idempotent: only applied when the field still holds the
-- empty-object/empty-array default so that any explicit override is preserved.
-- Idempotent: WHERE display_config = '{}'::jsonb / natural_key_fields IS NULL OR = '{}'
--
-- Depends on: 020_entities/*, 025_entity_versions.sql (entities must exist)
-- Run AFTER: 035_version_fields/*.sql

-- =============================================================================
-- §A  display_config — MASTER / CONTROL / REFERENCE / DIMENSION entities
-- =============================================================================
-- Minimal config that satisfies RUNTIME_ROUTING_SPEC §10 check 9.
-- list_columns uses the universal fields every MASTER entity carries via
-- 000_common_fields.sql (code, name, status).

UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE tenant_id IS NULL
  AND status    = 'ACTIVE'
  AND entity_class IN ('MASTER', 'CONTROL', 'REFERENCE', 'DIMENSION')
  AND display_config = '{}'::jsonb;

-- =============================================================================
-- §B  display_config — DOCUMENT entities on master schema
--     (distinct from finance docs on document schema handled in their own files)
-- =============================================================================

UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'document',
    'list_columns',       '["document_no","status","created_at"]'::jsonb,
    'default_sort_field', 'created_at',
    'default_sort_order', 'desc'
)
WHERE tenant_id IS NULL
  AND status       = 'ACTIVE'
  AND entity_class = 'DOCUMENT'
  AND table_schema = 'master'
  AND display_config = '{}'::jsonb;

-- =============================================================================
-- §C  display_config — DOCUMENT_RELATION / RELATION / AGGREGATE / LOG entities
-- =============================================================================

UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["id","created_at"]'::jsonb,
    'default_sort_field', 'created_at',
    'default_sort_order', 'desc'
)
WHERE tenant_id IS NULL
  AND status       = 'ACTIVE'
  AND entity_class IN ('DOCUMENT_RELATION', 'RELATION', 'AGGREGATE', 'LOG')
  AND display_config = '{}'::jsonb;

-- =============================================================================
-- §D  display_config — any remaining entity without a class match
--     (safety net — should not normally fire)
-- =============================================================================

UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["id"]'::jsonb
)
WHERE tenant_id IS NULL
  AND status = 'ACTIVE'
  AND display_config = '{}'::jsonb;

-- =============================================================================
-- §E  natural_key_fields — MASTER / CONTROL / REFERENCE / DIMENSION → 'code'
-- =============================================================================

UPDATE control.entity
SET natural_key_fields = ARRAY['code']
WHERE tenant_id IS NULL
  AND status       = 'ACTIVE'
  AND entity_class IN ('MASTER', 'CONTROL', 'REFERENCE', 'DIMENSION')
  AND (natural_key_fields IS NULL OR natural_key_fields = '{}');

-- =============================================================================
-- §F  natural_key_fields — DOCUMENT → 'document_no'
-- =============================================================================

UPDATE control.entity
SET natural_key_fields = ARRAY['document_no']
WHERE tenant_id IS NULL
  AND status       = 'ACTIVE'
  AND entity_class = 'DOCUMENT'
  AND (natural_key_fields IS NULL OR natural_key_fields = '{}');

-- =============================================================================
-- §G  natural_key_fields — all remaining (DOCUMENT_RELATION, LOG, etc.) → 'id'
-- =============================================================================

UPDATE control.entity
SET natural_key_fields = ARRAY['id']
WHERE tenant_id IS NULL
  AND status = 'ACTIVE'
  AND (natural_key_fields IS NULL OR natural_key_fields = '{}');

-- =============================================================================
-- §H  Entity-specific overrides — per-entity display_config refinements
--     Applied after the bulk defaults above; only when display_config already
--     has the generic default (i.e. was set by §A–§D above or is still empty).
-- =============================================================================

-- ── asset_class ───────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","asset_nature","is_depreciable","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'asset_class' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── asset ─────────────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","asset_class_id","acquisition_date","acquisition_cost","currency_code","status"]'::jsonb,
    'default_sort_field', 'acquisition_date',
    'default_sort_order', 'desc'
)
WHERE name = 'asset' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── asset_book ────────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["asset_id","book_type","depreciation_method","cost_basis","carrying_amount","currency_code"]'::jsonb,
    'default_sort_field', 'created_at',
    'default_sort_order', 'desc'
)
WHERE name = 'asset_book' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["id","created_at"]';

-- ── asset_component ───────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["parent_asset_id","component_asset_id","component_type","allocated_cost"]'::jsonb,
    'default_sort_field', 'created_at',
    'default_sort_order', 'desc'
)
WHERE name = 'asset_component' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["id","created_at"]';

-- ── asset_assignment_history ──────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["asset_id","assignment_type","effective_from","effective_to","assigned_by"]'::jsonb,
    'default_sort_field', 'effective_from',
    'default_sort_order', 'desc'
)
WHERE name = 'asset_assignment_history' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["id","created_at"]';

-- ── dimension_type ────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","category","is_hierarchical","is_multi_allowed","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'dimension_type' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── dimension_value ───────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","dimension_type_id","level_no","is_posting_allowed","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'dimension_value' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── dimension_set_item ────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["dimension_set_id","dimension_type_id","dimension_value_id","ordinal"]'::jsonb,
    'default_sort_field', 'ordinal',
    'default_sort_order', 'asc'
)
WHERE name = 'dimension_set_item' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["id","created_at"]';

-- ── business_intent ───────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","domain","is_approval_required","visibility","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'business_intent' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── tax_jurisdiction ──────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","country_code","tax_type","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'tax_jurisdiction' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── tax_type ──────────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","rate_type","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'tax_type' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── fx_rate ───────────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["from_currency","to_currency","rate","rate_date","rate_type"]'::jsonb,
    'default_sort_field', 'rate_date',
    'default_sort_order', 'desc'
)
WHERE name = 'fx_rate' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── budget_profile ────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","fiscal_year_id","budget_type","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'budget_profile' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── budget_allocation ─────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["budget_profile_id","gl_account_id","period_number","allocated_amount","currency_code"]'::jsonb,
    'default_sort_field', 'period_number',
    'default_sort_order', 'asc'
)
WHERE name = 'budget_allocation' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["id","created_at"]';

-- ── planning_model ────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","model_type","fiscal_year_id","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'planning_model' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── bank_party ────────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","bank_code","country_code","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'bank_party' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── bank_account ──────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","bank_party_id","account_number","currency_code","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'bank_account' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── payment_method ────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","payment_type","is_active","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'payment_method' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── holiday_calendar ──────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","country_code","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'holiday_calendar' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── holiday_calendar_day ──────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["calendar_id","holiday_date","name","holiday_type"]'::jsonb,
    'default_sort_field', 'holiday_date',
    'default_sort_order', 'asc'
)
WHERE name = 'holiday_calendar_day' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["id","created_at"]';

-- ── payment_term ──────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","net_days","discount_days","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'payment_term' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── product ───────────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","item_category_id","unit_of_measure","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'product' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── item ──────────────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","item_category_id","spend_category_id","unit_of_measure","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'item' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── item_category ─────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","parent_id","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'item_category' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── spend_category ────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","name","parent_id","gl_account_id","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'spend_category' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── content_item ──────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["code","title","content_type","status"]'::jsonb,
    'default_sort_field', 'updated_at',
    'default_sort_order', 'desc'
)
WHERE name = 'content_item' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── saved_view ────────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["name","entity_code","is_pinned","is_shared","created_by"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'saved_view' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';

-- ── dashboard ─────────────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
    'detail_renderer',    'master',
    'list_columns',       '["name","is_default","layout_type","status"]'::jsonb,
    'default_sort_field', 'name',
    'default_sort_order', 'asc'
)
WHERE name = 'dashboard' AND tenant_id IS NULL
  AND display_config->>'list_columns' = '["code","name","status"]';
