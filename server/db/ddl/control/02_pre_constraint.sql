-- ============================================================================
-- control/02_pre_constraint.sql
-- Concept: Lookup Validation — fn_valid_lookup() and trg_validate_lookup_columns()
-- Depends on: 04_tables/002_control.sql, 05_pre_constraint_functions/001_shared.sql
-- ============================================================================
-- Execution order: 04_tables → 001_shared → THIS → 06_constraints

-- fn_valid_lookup — tenant-aware validation.
-- Global (system) rows always valid. Tenant extension rows valid only if
-- domain is_extensible=true AND row belongs to the calling tenant's session.
CREATE OR REPLACE FUNCTION control.fn_valid_lookup(p_domain_code text, p_code text)
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path = control, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM control.lookup_value  lv
    JOIN control.lookup_domain ld ON ld.code = lv.domain_code
    WHERE lv.domain_code = p_domain_code
      AND lv.code        = p_code
      AND lv.status      = 'active'
      AND (
          lv.tenant_id IS NULL
          OR (
              ld.is_extensible = true
              AND lv.tenant_id = shared.current_tenant_id()
          )
      )
  );
$$;

-- fn_valid_lookup_nullable — overload for nullable columns.
CREATE OR REPLACE FUNCTION control.fn_valid_lookup_nullable(p_domain_code text, p_code text)
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path = control, pg_catalog
AS $$
  SELECT p_code IS NULL OR control.fn_valid_lookup(p_domain_code, p_code);
$$;


-- JSON shape guard for control.entity_class_profile.field_flag_rules.
-- Kept table-free so it is safe inside CHECK constraints.
CREATE OR REPLACE FUNCTION control.is_valid_entity_field_flag_rules(p_rules jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = control, pg_catalog
AS $$
  SELECT jsonb_typeof(p_rules) = 'array'
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(p_rules) AS elem(rule)
        WHERE jsonb_typeof(elem.rule) <> 'object'
           OR COALESCE(elem.rule->>'match_mode', '') NOT IN ('name','data_type','origin','format')
           OR NULLIF(elem.rule->>'pattern', '') IS NULL
           OR (
                elem.rule ? 'priority'
                AND COALESCE(elem.rule->>'priority', '') !~ '^-?[0-9]+$'
              )
           OR (
                elem.rule ? 'cardinality'
                AND elem.rule->>'cardinality' NOT IN ('one','many','zero_or_one')
              )
           OR (
                elem.rule ? 'is_searchable'
                AND jsonb_typeof(elem.rule->'is_searchable') <> 'boolean'
              )
           OR (
                elem.rule ? 'is_filterable'
                AND jsonb_typeof(elem.rule->'is_filterable') <> 'boolean'
              )
           OR (
                elem.rule ? 'is_sortable'
                AND jsonb_typeof(elem.rule->'is_sortable') <> 'boolean'
              )
           OR (
                elem.rule ? 'is_groupable'
                AND jsonb_typeof(elem.rule->'is_groupable') <> 'boolean'
              )
           OR (
                elem.rule ? 'is_aggregatable'
                AND jsonb_typeof(elem.rule->'is_aggregatable') <> 'boolean'
              )
     );
$$;


-- JSON shape guard for control.entity_numbering_config.segments.
CREATE OR REPLACE FUNCTION control.is_valid_entity_number_segments(p_segments jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = control, pg_catalog
AS $$
  SELECT jsonb_typeof(p_segments) = 'array'
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(p_segments) AS elem(segment)
        WHERE jsonb_typeof(elem.segment) <> 'object'
           OR COALESCE(elem.segment->>'type', '') NOT IN (
                'tenant_code','company_code','branch_code',
                'year','fiscal_year','period','quarter',
                'sequence','static','literal'
              )
           OR (
                elem.segment->>'type' IN ('static','literal')
                AND NULLIF(elem.segment->>'value', '') IS NULL
              )
           OR (
                elem.segment ? 'padding'
                AND COALESCE(elem.segment->>'padding', '') !~ '^[0-9]+$'
              )
           OR (
                elem.segment ? 'optional'
                AND jsonb_typeof(elem.segment->'optional') <> 'boolean'
              )
           OR (
                elem.segment ? 'format'
                AND jsonb_typeof(elem.segment->'format') <> 'string'
              )
     );
$$;


