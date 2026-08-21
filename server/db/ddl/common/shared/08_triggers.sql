-- ============================================================================
-- shared/06_triggers.sql
-- Concept: Reference Triggers — audit and status-change triggers for shared tables
-- Depends on: 04_tables/001_shared.sql, 08_functions/001_shared.sql
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- ============================================================================

-- [A] updated_at (shared.trg_set_updated_at)

DROP TRIGGER IF EXISTS trg_country_updated_at ON shared.country;
CREATE TRIGGER trg_country_updated_at BEFORE UPDATE ON shared.country FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_currency_updated_at ON shared.currency;
CREATE TRIGGER trg_currency_updated_at BEFORE UPDATE ON shared.currency FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_language_updated_at ON shared.language;
CREATE TRIGGER trg_language_updated_at BEFORE UPDATE ON shared.language FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_locale_updated_at ON shared.locale;
CREATE TRIGGER trg_locale_updated_at BEFORE UPDATE ON shared.locale FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_timezone_updated_at ON shared.timezone;
CREATE TRIGGER trg_timezone_updated_at BEFORE UPDATE ON shared.timezone FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_uom_updated_at ON shared.uom;
CREATE TRIGGER trg_uom_updated_at BEFORE UPDATE ON shared.uom FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_state_region_updated_at ON shared.state_region;
CREATE TRIGGER trg_state_region_updated_at BEFORE UPDATE ON shared.state_region FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_commodity_code_updated_at ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_updated_at BEFORE UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_industry_code_updated_at ON shared.industry_code;
CREATE TRIGGER trg_industry_code_updated_at BEFORE UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_classification_scheme_updated_at
BEFORE UPDATE ON shared.classification_scheme
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_commodity_crosswalk_updated_at
BEFORE UPDATE ON shared.commodity_crosswalk
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_industry_crosswalk_updated_at
BEFORE UPDATE ON shared.industry_crosswalk
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- [B] status_changed_at (shared.trg_set_status_changed)

DROP TRIGGER IF EXISTS trg_country_status_changed ON shared.country;
CREATE TRIGGER trg_country_status_changed BEFORE UPDATE ON shared.country FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_currency_status_changed ON shared.currency;
CREATE TRIGGER trg_currency_status_changed BEFORE UPDATE ON shared.currency FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_language_status_changed ON shared.language;
CREATE TRIGGER trg_language_status_changed BEFORE UPDATE ON shared.language FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_locale_status_changed ON shared.locale;
CREATE TRIGGER trg_locale_status_changed BEFORE UPDATE ON shared.locale FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_timezone_status_changed ON shared.timezone;
CREATE TRIGGER trg_timezone_status_changed BEFORE UPDATE ON shared.timezone FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_uom_status_changed ON shared.uom;
CREATE TRIGGER trg_uom_status_changed BEFORE UPDATE ON shared.uom FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_state_region_status_changed ON shared.state_region;
CREATE TRIGGER trg_state_region_status_changed BEFORE UPDATE ON shared.state_region FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_commodity_code_status_changed ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_status_changed BEFORE UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_industry_code_status_changed ON shared.industry_code;
CREATE TRIGGER trg_industry_code_status_changed BEFORE UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_classification_scheme_status_changed
BEFORE UPDATE OF status ON shared.classification_scheme
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_commodity_crosswalk_status_changed
BEFORE UPDATE OF status ON shared.commodity_crosswalk
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_industry_crosswalk_status_changed
BEFORE UPDATE OF status ON shared.industry_crosswalk
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- [C] Immutability guards (shared.trg_immutable_code)

DROP TRIGGER IF EXISTS trg_country_immutable_code ON shared.country;
CREATE TRIGGER trg_country_immutable_code BEFORE UPDATE ON shared.country FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_currency_immutable_code ON shared.currency;
CREATE TRIGGER trg_currency_immutable_code BEFORE UPDATE ON shared.currency FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_language_immutable_code ON shared.language;
CREATE TRIGGER trg_language_immutable_code BEFORE UPDATE ON shared.language FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_locale_immutable_code ON shared.locale;
CREATE TRIGGER trg_locale_immutable_code BEFORE UPDATE ON shared.locale FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_timezone_immutable_code ON shared.timezone;
CREATE TRIGGER trg_timezone_immutable_code BEFORE UPDATE ON shared.timezone FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_uom_immutable_code ON shared.uom;
CREATE TRIGGER trg_uom_immutable_code BEFORE UPDATE ON shared.uom FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_state_region_immutable_code ON shared.state_region;
CREATE TRIGGER trg_state_region_immutable_code BEFORE UPDATE ON shared.state_region FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_commodity_code_immutable_code ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_immutable_code BEFORE UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_industry_code_immutable_code ON shared.industry_code;
CREATE TRIGGER trg_industry_code_immutable_code BEFORE UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

CREATE TRIGGER trg_classification_scheme_immutable_code
BEFORE UPDATE ON shared.classification_scheme
FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

-- [D] Hierarchy management (commodity_code & industry_code)

DROP TRIGGER IF EXISTS trg_commodity_code_hierarchy ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_hierarchy BEFORE INSERT OR UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_code_validate();

DROP TRIGGER IF EXISTS trg_industry_code_hierarchy ON shared.industry_code;
CREATE TRIGGER trg_industry_code_hierarchy BEFORE INSERT OR UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_code_validate();

DROP TRIGGER IF EXISTS trg_commodity_code_cycle ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_cycle BEFORE INSERT OR UPDATE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_cycle_detect();

DROP TRIGGER IF EXISTS trg_industry_code_cycle ON shared.industry_code;
CREATE TRIGGER trg_industry_code_cycle BEFORE INSERT OR UPDATE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_cycle_detect();

-- Deferred cycle triggers removed: the BEFORE trigger's recursive CTE walks
-- the full parent chain in one query — no bulk-reparenting bypass window exists.

DROP TRIGGER IF EXISTS trg_commodity_code_leaf_maintain ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_leaf_maintain AFTER INSERT OR UPDATE OF parent_code, status OR DELETE ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_recompute_parent_leaf();

DROP TRIGGER IF EXISTS trg_industry_code_leaf_maintain ON shared.industry_code;
CREATE TRIGGER trg_industry_code_leaf_maintain AFTER INSERT OR UPDATE OF parent_code, status OR DELETE ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_recompute_parent_leaf();

DROP TRIGGER IF EXISTS trg_commodity_code_leaf_guard ON shared.commodity_code;
CREATE TRIGGER trg_commodity_code_leaf_guard BEFORE UPDATE OF is_leaf ON shared.commodity_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_guard_is_leaf();

DROP TRIGGER IF EXISTS trg_industry_code_leaf_guard ON shared.industry_code;
CREATE TRIGGER trg_industry_code_leaf_guard BEFORE UPDATE OF is_leaf ON shared.industry_code FOR EACH ROW EXECUTE FUNCTION shared.trg_hierarchy_guard_is_leaf();

-- [E] Locale / Region consistency

DROP TRIGGER IF EXISTS trg_locale_consistency ON shared.locale;
CREATE TRIGGER trg_locale_consistency BEFORE INSERT OR UPDATE ON shared.locale FOR EACH ROW EXECUTE FUNCTION shared.trg_locale_consistency_validate();

DROP TRIGGER IF EXISTS trg_state_region_code_check ON shared.state_region;
CREATE TRIGGER trg_state_region_code_check BEFORE INSERT OR UPDATE ON shared.state_region FOR EACH ROW EXECUTE FUNCTION shared.trg_state_region_code_consistency();

CREATE TRIGGER trg_country_profile_validate
BEFORE INSERT OR UPDATE OF phone_national_pattern, postal_code_pattern
ON shared.country
FOR EACH ROW EXECUTE FUNCTION shared.trg_country_profile_validate();

CREATE TRIGGER trg_timezone_alias_validate
BEFORE INSERT OR UPDATE OF canonical_code, status
ON shared.timezone
FOR EACH ROW EXECUTE FUNCTION shared.trg_timezone_alias_validate();

CREATE TRIGGER trg_state_region_hierarchy_validate
BEFORE INSERT OR UPDATE OF country_code, parent_code, status
ON shared.state_region
FOR EACH ROW EXECUTE FUNCTION shared.trg_state_region_hierarchy_validate();

CREATE TRIGGER trg_commodity_code_scheme_validate
BEFORE INSERT OR UPDATE OF domain_code, parent_code, status
ON shared.commodity_code
FOR EACH ROW EXECUTE FUNCTION shared.trg_classification_code_validate();

CREATE TRIGGER trg_industry_code_scheme_validate
BEFORE INSERT OR UPDATE OF domain_code, parent_code, status
ON shared.industry_code
FOR EACH ROW EXECUTE FUNCTION shared.trg_classification_code_validate();

CREATE TRIGGER trg_commodity_crosswalk_validate
BEFORE INSERT OR UPDATE OF
    source_domain_code, source_code, target_domain_code, target_code, status
ON shared.commodity_crosswalk
FOR EACH ROW EXECUTE FUNCTION shared.trg_crosswalk_validate();

CREATE TRIGGER trg_industry_crosswalk_validate
BEFORE INSERT OR UPDATE OF
    source_domain_code, source_code, target_domain_code, target_code, status
ON shared.industry_crosswalk
FOR EACH ROW EXECUTE FUNCTION shared.trg_crosswalk_validate();

CREATE TRIGGER trg_commodity_crosswalk_identity_guard
BEFORE UPDATE ON shared.commodity_crosswalk
FOR EACH ROW EXECUTE FUNCTION shared.trg_crosswalk_identity_guard();

CREATE TRIGGER trg_industry_crosswalk_identity_guard
BEFORE UPDATE ON shared.industry_crosswalk
FOR EACH ROW EXECUTE FUNCTION shared.trg_crosswalk_identity_guard();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'country',
        'currency',
        'language',
        'locale',
        'timezone',
        'uom',
        'state_region',
        'classification_scheme',
        'commodity_code',
        'industry_code',
        'commodity_crosswalk',
        'industry_crosswalk'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON shared.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_reference_evidence_guard()',
            'trg_' || v_table || '_reference_guard',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE DELETE ON shared.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_reference_delete_guard()',
            'trg_' || v_table || '_delete_guard',
            v_table
        );
    END LOOP;
END;
$$;
