-- ============================================================================
-- control/07_views.sql
-- Concept: Governance Views — transaction flow templates, blueprint catalogue, entity catalogue
-- Depends on: 04_tables/002_control.sql
-- ============================================================================

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================


-- ============================================================================
-- §V1  control.v_active_flow_templates
-- Effective flow template rows: platform-global rows union tenant overrides.
-- When a tenant has an override for (flow_code, event_code) the tenant row
-- takes precedence (DISTINCT ON ordered by tenant_id NULLS LAST).
-- Read-only diagnostic / seed-validation view.
-- ============================================================================
CREATE OR REPLACE VIEW control.v_active_flow_templates AS
SELECT DISTINCT ON (COALESCE(t.tenant_id, '00000000-0000-0000-0000-000000000000'),
                    t.flow_code,
                    t.event_code)
    t.id,
    t.tenant_id,
    t.flow_code,
    t.direction,
    t.event_code,
    t.event_name,
    t.event_seq,
    t.is_mandatory,
    t.creates_je,
    t.reverses_prior,
    t.commitment_action,
    t.description,
    CASE WHEN t.tenant_id IS NULL THEN 'PLATFORM' ELSE 'TENANT' END AS scope
FROM control.transaction_flow_template t
WHERE t.is_active = true
ORDER BY
    COALESCE(t.tenant_id, '00000000-0000-0000-0000-000000000000'),
    t.flow_code,
    t.event_code,
    t.tenant_id NULLS LAST;    -- platform rows yield to tenant overrides

COMMENT ON VIEW control.v_active_flow_templates IS
    'Engine 4.13: effective active flow template rows. '
    'Tenant overrides shadow platform-global rows on (flow_code, event_code). '
    'scope: PLATFORM (tenant_id IS NULL) | TENANT (tenant-specific override).';


-- ============================================================================
-- §V2  control.v_acct_profile_full
-- Full profile configuration: core config + all optional child configs
-- (commitment, revenue, settlement) as lateral left joins.
-- Exposes only ACTIVE profiles. Intended for runtime resolution and admin UI.
-- ============================================================================
CREATE OR REPLACE VIEW control.v_acct_profile_full AS
SELECT
    -- Core identity
    apc.id                          AS profile_config_id,
    apc.tenant_id,
    apc.accounting_profile_id,
    apc.version,
    apc.status,
    apc.direction,
    apc.profile_type,
    apc.subledger_type,
    apc.applicable_flow_codes,
    apc.applicable_doc_types,

    -- Recognition
    apc.recognition_timing,
    apc.deferral_schedule_type,
    apc.deferral_periods,
    apc.auto_reverse,
    apc.reversal_period_offset,

    -- Tax
    apc.tax_treatment,
    apc.default_tax_code,
    apc.default_tax_group_id,
    tg.code                         AS default_tax_group_code,
    tg.name                         AS default_tax_group_name,
    apc.is_reverse_charge,

    -- Matching
    apc.matching_type,

    -- Effectivity
    apc.effective_from,
    apc.effective_to,
    apc.supersedes_id,

    -- Commitment child (NULL if none)
    apcc.creates_commitment,
    apcc.commitment_type,
    apcc.releases_commitment_on,
    apcc.encumbrance_behavior,
    apcc.multi_year_strategy,
    apcc.advance_pct,
    apcc.advance_recovery_method,
    apcc.retention_pct              AS commitment_retention_pct,
    apcc.retention_release_event,

    -- Revenue child (NULL if none)
    aprc.revenue_recognition_method,
    aprc.variable_consideration,
    aprc.standalone_selling_price_method,
    aprc.paired_profile_id,
    aprc.fires_paired_on_event,
    aprc.deferral_account_code,
    aprc.unbilled_ar_account_code,

    -- Settlement child (NULL if none)
    apsc.settlement_method,
    apsc.settlement_tolerance,
    apsc.discount_model,
    apsc.discount_curve_type,
    apsc.discount_apr,
    apsc.discount_min_days,
    apsc.discount_min_amount,
    apsc.scf_financier_id,
    apsc.scf_split_pct,

    -- Derived flags
    (apcc.id IS NOT NULL)           AS has_commitment_config,
    (aprc.id IS NOT NULL)           AS has_revenue_config,
    (apsc.id IS NOT NULL)           AS has_settlement_config,

    -- Audit
    apc.created_at,
    apc.updated_at

FROM control.acct_profile_config apc
LEFT JOIN control.tax_group tg
       ON tg.id = apc.default_tax_group_id AND tg.tenant_id = apc.tenant_id
LEFT JOIN control.acct_profile_commitment_config apcc
       ON apcc.profile_config_id = apc.id
LEFT JOIN control.acct_profile_revenue_config    aprc
       ON aprc.profile_config_id = apc.id
LEFT JOIN control.acct_profile_settlement_config apsc
       ON apsc.profile_config_id = apc.id
WHERE apc.is_active = true;

COMMENT ON VIEW control.v_acct_profile_full IS
    'Engine 4.13: full profile configuration view. '
    'Core config (acct_profile_config) left-joined with optional children '
    '(commitment, revenue, settlement). Active profiles only. '
    'Now exposes default_tax_group_id + default_tax_group_code/name from control.tax_group. '
    'Legacy default_tax_code retained for backward compatibility. '
    'has_commitment_config / has_revenue_config / has_settlement_config derived flags.';