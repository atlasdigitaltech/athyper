-- =============================================================================
-- pc_origin_ownership.sql — pricing_component origin ownership classification
--
-- Answers "which PC origins may the system auto-refresh vs. which must stay
-- frozen as user intent?" without hardcoding origin literals in triggers or
-- services. New origins (e.g. 'ai_resolved') can be added by registering a
-- row here rather than touching trigger/service code.
--
-- Consumed by:
--   server/packages/services/business/p2p/purchase_order/
--     commitment-line-defaults.service.ts → refreshCommitmentLineChildren()
--   Filters `pc.origin` against
--     lookup_value(domain_code='pricing_component.origin_ownership')
--                 WHERE metadata->>'ownership' = 'system_owned'
--
-- ownership values:
--   system_owned — auto-refresh permitted; recomputed on parent line change
--   user_owned   — frozen; only user action can change values
-- =============================================================================


INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'pricing_component.origin_ownership',
       'Pricing Component Origin Ownership',
       'Classifies pricing_component.origin values as system_owned (writer service may auto-refresh) vs user_owned (frozen). Consumed by commitment-line-defaults.service.ts.',
       'document', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'pricing_component.origin_ownership'
);


INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, metadata, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, jsonb_build_object('ownership', v.ownership), 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('inherited',       'Inherited from source',        'pricing_component.origin_ownership',
     'PC inherited from PR/PO/contract during conversion — system may refresh on parent change.',                     10, 'system_owned'),
    ('system_resolved', 'System resolved',              'pricing_component.origin_ownership',
     'PC resolved by tax engine / condition-type resolver — system may refresh on parent change.',                    20, 'system_owned'),
    ('vendor_default',  'Vendor default',               'pricing_component.origin_ownership',
     'PC seeded from vendor default at line creation — user intent; frozen after insert.',                            30, 'user_owned'),
    ('manual',          'Manually entered',             'pricing_component.origin_ownership',
     'PC entered manually by the user — always frozen.',                                                              40, 'user_owned')
) AS v(code, name, domain_code, description, sort_order, ownership)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
