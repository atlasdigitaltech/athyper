-- Table-owned seed for control.entity_numbering_config
-- Consolidated from platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/platform/005_domain_registrations/999_entity_numbering_configs.sql
-- ============================================================

-- 005_domain_registrations/999_entity_numbering_configs.sql
-- Purpose: canonical entity numbering configs for core numbered entities.
-- Idempotent: ON CONFLICT on platform default config per entity/number_field.

WITH configs AS (
    SELECT *
    FROM (VALUES
        (
            'journal_entry',
            'document_no',
            'JE',
            true,
            '-',
            jsonb_build_array(
                jsonb_build_object('type', 'year', 'format', 'YYYY'),
                jsonb_build_object('type', 'sequence', 'padding', 6)
            ),
            'yearly',
            'company',
            50,
            'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'je_number')
        ),
        (
            'user_profile_update_request',
            'code',
            'UPUPR',
            true,
            '-',
            jsonb_build_array(
                jsonb_build_object('type', 'year', 'format', 'YYYY'),
                jsonb_build_object('type', 'sequence', 'padding', 5)
            ),
            'yearly',
            'tenant',
            50,
            'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'code')
        ),
        (
            'purchase_invoice',
            'document_no',
            'PINV',
            true,
            '-',
            jsonb_build_array(
                jsonb_build_object('type', 'tenant_code'),
                jsonb_build_object('type', 'year', 'format', 'YYYY'),
                jsonb_build_object('type', 'sequence', 'padding', 5)
            ),
            'yearly',
            'company',
            50,
            'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'invoice_number')
        ),
        (
            'payment_entry',
            'document_no',
            'PAY',
            true,
            '-',
            jsonb_build_array(
                jsonb_build_object('type', 'year', 'format', 'YYYY'),
                jsonb_build_object('type', 'sequence', 'padding', 6)
            ),
            'yearly',
            'company',
            50,
            'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'payment_number')
        ),
        (
            'business_partner',
            'code',
            'BP',
            true,
            '-',
            jsonb_build_array(
                jsonb_build_object('type', 'sequence', 'padding', 6)
            ),
            'never',
            'tenant',
            30,
            'upper_alnum_dash',
            jsonb_build_object('source', 'platform_default', 'physical_column', 'code')
        )
    ) AS v(
        entity_code, number_field, prefix, prefix_configurable, separator,
        segments, reset_strategy, uniqueness_scope, max_length, allowed_chars, metadata
    )
)
INSERT INTO control.entity_numbering_config (
    tenant_id, entity_id, number_field, company_code_id,
    prefix, prefix_configurable, separator, segments,
    reset_strategy, uniqueness_scope, max_length, allowed_chars,
    metadata, status, created_by
)
SELECT
    NULL,
    e.id,
    c.number_field,
    NULL,
    c.prefix,
    c.prefix_configurable,
    c.separator,
    c.segments,
    c.reset_strategy,
    c.uniqueness_scope,
    c.max_length,
    c.allowed_chars,
    c.metadata,
    'active',
    '00000000-0000-0000-0000-000000000000'
FROM configs c
JOIN control.entity e
  ON e.entity_code = c.entity_code
 AND e.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT encfg_natural_uq DO UPDATE
SET prefix              = EXCLUDED.prefix,
    prefix_configurable = EXCLUDED.prefix_configurable,
    separator           = EXCLUDED.separator,
    segments            = EXCLUDED.segments,
    reset_strategy      = EXCLUDED.reset_strategy,
    uniqueness_scope    = EXCLUDED.uniqueness_scope,
    max_length          = EXCLUDED.max_length,
    allowed_chars       = EXCLUDED.allowed_chars,
    metadata            = control.entity_numbering_config.metadata || EXCLUDED.metadata,
    status              = 'active',
    updated_at          = now(),
    updated_by          = '00000000-0000-0000-0000-000000000000';
