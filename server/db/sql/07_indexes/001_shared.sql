-- 07_indexes/001_shared.sql
-- Depends on: 04_tables/001_shared.sql
-- Naming: <table>_<cols>_idx | _uq (unique) | _pidx (partial WHERE).

-- country
CREATE UNIQUE INDEX IF NOT EXISTS country_code3_uq ON shared.country (code3) WHERE code3 IS NOT NULL;
CREATE INDEX IF NOT EXISTS country_active_pidx ON shared.country (code) WHERE status = 'active';

-- currency
CREATE INDEX IF NOT EXISTS currency_active_pidx ON shared.currency (code) WHERE status = 'active';

-- language
CREATE INDEX IF NOT EXISTS language_active_pidx ON shared.language (code) WHERE status = 'active';

-- locale
CREATE INDEX IF NOT EXISTS locale_language_code_idx ON shared.locale (language_code);
CREATE INDEX IF NOT EXISTS locale_active_pidx ON shared.locale (code) WHERE status = 'active';

-- timezone
CREATE INDEX IF NOT EXISTS timezone_canonical_idx ON shared.timezone (canonical_code) WHERE canonical_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS timezone_active_pidx ON shared.timezone (code) WHERE status = 'active';

-- uom
CREATE INDEX IF NOT EXISTS uom_active_pidx ON shared.uom (code) WHERE status = 'active';

-- state_region
CREATE INDEX IF NOT EXISTS state_region_parent_idx ON shared.state_region (country_code, parent_code) WHERE parent_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS state_region_active_pidx ON shared.state_region (country_code, code) WHERE status = 'active';

-- commodity_code
CREATE INDEX IF NOT EXISTS commodity_code_parent_idx ON shared.commodity_code (domain_code, parent_code) WHERE parent_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS commodity_code_leaf_pidx ON shared.commodity_code (domain_code, code) WHERE is_leaf = true AND is_active = true;
CREATE INDEX IF NOT EXISTS commodity_code_active_pidx ON shared.commodity_code (domain_code, code) WHERE status = 'active';
-- GIN on keywords: powers term = ANY(keywords) in taxonomy search (UNSPSC 77K rows)
CREATE INDEX IF NOT EXISTS commodity_code_keywords_gin ON shared.commodity_code USING GIN (keywords);

-- industry_code
CREATE INDEX IF NOT EXISTS industry_code_parent_idx ON shared.industry_code (domain_code, parent_code) WHERE parent_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS industry_code_leaf_pidx ON shared.industry_code (domain_code, code) WHERE is_leaf = true AND is_active = true;
CREATE INDEX IF NOT EXISTS industry_code_active_pidx ON shared.industry_code (domain_code, code) WHERE status = 'active';
-- GIN on keywords: powers term = ANY(keywords) in taxonomy search
CREATE INDEX IF NOT EXISTS industry_code_keywords_gin ON shared.industry_code USING GIN (keywords);

-- module
CREATE INDEX IF NOT EXISTS module_workspace_idx ON shared.module (workspace_id) WHERE workspace_id IS NOT NULL;

-- persona
CREATE INDEX IF NOT EXISTS persona_scope_mode_idx ON shared.persona (scope_mode);
CREATE INDEX IF NOT EXISTS persona_system_pidx ON shared.persona (is_system) WHERE is_system = true;

-- enterprise_feature
CREATE INDEX IF NOT EXISTS enterprise_feature_active_pidx ON shared.enterprise_feature (code) WHERE status = 'active';

-- subscription_plan
CREATE INDEX IF NOT EXISTS subscription_plan_active_pidx ON shared.subscription_plan (code) WHERE status = 'active';

-- permission_category
CREATE INDEX IF NOT EXISTS permission_category_active_pidx ON shared.permission_category (code) WHERE status = 'active';

-- permission
CREATE INDEX IF NOT EXISTS permission_category_idx ON shared.permission (category_id);
CREATE INDEX IF NOT EXISTS permission_active_pidx ON shared.permission (code) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS permission_plan_restricted_pidx ON shared.permission (id) WHERE is_plan_restricted = true;

-- persona_permission
CREATE INDEX IF NOT EXISTS persona_permission_persona_idx ON shared.persona_permission (persona_id);
CREATE INDEX IF NOT EXISTS persona_permission_granted_pidx ON shared.persona_permission (persona_id, permission_id) WHERE is_granted = true;

-- ou_type — REMOVED: migrated to control.lookup_domain / control.lookup_value

-- plan_module_access
CREATE INDEX IF NOT EXISTS pma_plan_idx ON shared.plan_module_access (plan_id);
CREATE INDEX IF NOT EXISTS pma_included_pidx ON shared.plan_module_access (plan_id, module_id) WHERE is_included = true;

-- plan_permission_access
CREATE INDEX IF NOT EXISTS ppa_plan_idx ON shared.plan_permission_access (plan_id);
CREATE INDEX IF NOT EXISTS ppa_included_pidx ON shared.plan_permission_access (plan_id, permission_id) WHERE is_included = true;

-- plan_feature_access
CREATE INDEX IF NOT EXISTS pfa_plan_idx ON shared.plan_feature_access (plan_id);
CREATE INDEX IF NOT EXISTS pfa_included_pidx ON shared.plan_feature_access (plan_id, feature_id) WHERE is_included = true;


-- ── §CCW  shared.commodity_crosswalk ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ccw_source_idx
    ON shared.commodity_crosswalk (source_domain_code, source_code);

CREATE INDEX IF NOT EXISTS ccw_target_idx
    ON shared.commodity_crosswalk (target_domain_code, target_code);

CREATE INDEX IF NOT EXISTS ccw_active_pidx
    ON shared.commodity_crosswalk (source_domain_code, source_code)
    WHERE is_active = true;


-- ── §ICW  shared.industry_crosswalk ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS icw_source_idx
    ON shared.industry_crosswalk (source_domain_code, source_code);

CREATE INDEX IF NOT EXISTS icw_target_idx
    ON shared.industry_crosswalk (target_domain_code, target_code);

CREATE INDEX IF NOT EXISTS icw_active_pidx
    ON shared.industry_crosswalk (source_domain_code, source_code)
    WHERE is_active = true;
