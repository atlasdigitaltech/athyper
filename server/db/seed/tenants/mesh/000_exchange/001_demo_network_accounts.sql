-- ============================================================================
-- MESH EXCHANGE - DEMO ACCOUNTS, MEMBERSHIPS, GRANTS, RELATIONSHIPS
-- ============================================================================
-- Seeds the standalone Mesh DB with buyer/supplier exchange data.
--
-- Lookup chain exercised by this file:
--   principal_identity_binding.subject_id = KC sub
--     -> principal_id
--     -> account_grant
--     -> network_account (network_role inline)
--
-- participant and participant_profile tables removed — all profile data is
-- stored directly on mesh.network_account (merged by 09_streamline.sql).
-- ============================================================================

-- ── Network accounts (profile data inline) ───────────────────────────────────
WITH account_rows (
    account_code, display_name, participant_type, source_plane, source_ref,
    legal_name, tax_country, profile_hash, profile_snapshot,
    network_role, capabilities, metadata
) AS (
    VALUES
        ('BNA-1000000001', 'Athyper Group Holdings',                     'tenant_legal_entity', 'neon', 'athyper:LE-ATHQ',        'Athyper Group Holdings',                  'MY', md5('BNA-1000000001:Athyper Group Holdings'),           '{"type":"buyer","industry":"holding"}'::jsonb,            'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-ATHQ","kc_org_alias":"ORG-1000000001","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000002', 'Athyper Malaysia Real Estate',               'tenant_legal_entity', 'neon', 'athyper:LE-AMRE',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-AMRE","kc_org_alias":"ORG-1000000002","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000003', 'Athyper Qatar Utilities',                    'tenant_legal_entity', 'neon', 'athyper:LE-AQTU',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-AQTU","kc_org_alias":"ORG-1000000003","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000004', 'Athyper Saudi Construction',                 'tenant_legal_entity', 'neon', 'athyper:LE-ASAC',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-ASAC","kc_org_alias":"ORG-1000000004","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000005', 'Athyper Qatar Transport and Storage',        'tenant_legal_entity', 'neon', 'athyper:LE-AQTS',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-AQTS","kc_org_alias":"ORG-1000000005","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000006', 'Athyper UAE Trading',                        'tenant_legal_entity', 'neon', 'athyper:LE-AUET',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-AUET","kc_org_alias":"ORG-1000000006","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000007', 'Athyper Saudi Hospitality',                  'tenant_legal_entity', 'neon', 'athyper:LE-ASAH',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-ASAH","kc_org_alias":"ORG-1000000007","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000008', 'Athyper US Information and Communication',   'tenant_legal_entity', 'neon', 'athyper:LE-AUIC',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-AUIC","kc_org_alias":"ORG-1000000008","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000009', 'Athyper Singapore Financial Services',       'tenant_legal_entity', 'neon', 'athyper:LE-ASGF',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-ASGF","kc_org_alias":"ORG-1000000009","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000010', 'Athyper India Textile and Leather Mfg',      'tenant_legal_entity', 'neon', 'athyper:LE-AITM',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-AITM","kc_org_alias":"ORG-1000000010","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000011', 'Athyper Canada Food and Beverage Mfg',       'tenant_legal_entity', 'neon', 'athyper:LE-ACFB',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-ACFB","kc_org_alias":"ORG-1000000011","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000012', 'Athyper Germany Pharmaceutical Mfg',         'tenant_legal_entity', 'neon', 'athyper:LE-ADPM',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-ADPM","kc_org_alias":"ORG-1000000012","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000013', 'Athyper Taiwan Electronics Mfg',             'tenant_legal_entity', 'neon', 'athyper:LE-ATEM',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-ATEM","kc_org_alias":"ORG-1000000013","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000014', 'Athyper South Africa Petroleum Extraction',  'tenant_legal_entity', 'neon', 'athyper:LE-ASPE',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-ASPE","kc_org_alias":"ORG-1000000014","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000015', 'Athyper UK Agriculture',                     'tenant_legal_entity', 'neon', 'athyper:LE-AUKA',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-AUKA","kc_org_alias":"ORG-1000000015","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000016', 'Athyper Japan Education Services',           'tenant_legal_entity', 'neon', 'athyper:LE-AJED',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-AJED","kc_org_alias":"ORG-1000000016","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000017', 'Athyper Philippines Hospital Services',      'tenant_legal_entity', 'neon', 'athyper:LE-APHS',        NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"athyper","legal_entity_code":"LE-APHS","kc_org_alias":"ORG-1000000017","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000018', 'Technostat Group',                           'tenant_legal_entity', 'neon', 'technostat:LE-TKSA',     'Technostat Group',                        'SA', md5('BNA-1000000018:Technostat Group'),                  '{"type":"buyer","industry":"technology"}'::jsonb,          'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"technostat","legal_entity_code":"LE-TKSA","kc_org_alias":"ORG-1000000018","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000019', 'SSK Saudi',                                  'tenant_legal_entity', 'neon', 'technostat:LE-SSK',      NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"technostat","legal_entity_code":"LE-SSK","kc_org_alias":"ORG-1000000019","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000020', 'Technostat Egypt',                           'tenant_legal_entity', 'neon', 'technostat:LE-TEGY',     NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"technostat","legal_entity_code":"LE-TEGY","kc_org_alias":"ORG-1000000020","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000021', 'Satellites for Digital Transformation',      'tenant_legal_entity', 'neon', 'technostat:LE-SDTX',     NULL,                                      NULL, NULL,                                                       NULL,                                                       'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"technostat","legal_entity_code":"LE-SDTX","kc_org_alias":"ORG-1000000021","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-1000000022', 'CirrusAtlantic Ltd',                         'tenant_legal_entity', 'neon', 'cirrusatlantic:CATL',    'CirrusAtlantic Ltd',                      'AE', md5('BNA-1000000022:CirrusAtlantic Ltd'),                '{"type":"buyer","industry":"logistics"}'::jsonb,           'buyer',    '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{"tenant_code":"cirrusatlantic","legal_entity_code":"CATL","kc_org_alias":"ORG-1000000022","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-3000000001', 'Nimubus Solutions',                          'partner_org',         'mesh', 'nimubus',               'Nimubus Solutions Ltd',                   'AE', md5('BNA-3000000001:Nimubus Solutions Ltd'),             '{"type":"supplier","industry":"technology_services"}'::jsonb, 'supplier', '{"can_send":["invoice","credit_note","debit_note","acknowledgement"],"can_receive":["purchase_order","remittance_advice"]}'::jsonb, '{"kc_org_alias":"ORG-3000000001","seed":"mesh_demo_exchange"}'::jsonb),
        ('BNA-3000000002', 'Stratus Commerce',                           'partner_org',         'mesh', 'stratus',               'Stratus Commerce Holdings',               'AE', md5('BNA-3000000002:Stratus Commerce Holdings'),         '{"type":"supplier","industry":"retail_trading"}'::jsonb,   'supplier', '{"can_send":["invoice","credit_note","debit_note","acknowledgement"],"can_receive":["purchase_order","remittance_advice"]}'::jsonb, '{"kc_org_alias":"ORG-3000000002","seed":"mesh_demo_exchange"}'::jsonb)
)
INSERT INTO mesh.network_account (
    account_code, provider_code, display_name,
    participant_type, source_plane, source_ref,
    legal_name, tax_country, profile_hash, profile_snapshot,
    network_role, capabilities, status, metadata, created_by
)
SELECT
    account_code, 'athyper_mesh', display_name,
    participant_type, source_plane, source_ref,
    legal_name, tax_country::character(2), profile_hash,
    COALESCE(profile_snapshot, '{}'::jsonb),
    network_role, capabilities, 'active', metadata, 'system'
FROM account_rows
ON CONFLICT (account_code) DO UPDATE SET
    display_name        = EXCLUDED.display_name,
    participant_type    = EXCLUDED.participant_type,
    source_plane        = EXCLUDED.source_plane,
    source_ref          = EXCLUDED.source_ref,
    legal_name          = COALESCE(EXCLUDED.legal_name, mesh.network_account.legal_name),
    tax_country         = COALESCE(EXCLUDED.tax_country, mesh.network_account.tax_country),
    profile_hash        = COALESCE(EXCLUDED.profile_hash, mesh.network_account.profile_hash),
    profile_snapshot    = COALESCE(EXCLUDED.profile_snapshot, mesh.network_account.profile_snapshot),
    network_role        = EXCLUDED.network_role,
    capabilities        = EXCLUDED.capabilities,
    status              = EXCLUDED.status,
    metadata            = mesh.network_account.metadata || EXCLUDED.metadata,
    updated_at          = now(),
    updated_by          = 'system';

-- ── Mesh principals ───────────────────────────────────────────────────────────
WITH principal_rows (id, principal_code, display_name, principal_type) AS (
    VALUES
        ('aa100000-0000-0000-0000-000000000011'::uuid, 'athq.mesh.owner', 'Athyper Mesh Owner',          'participant_user'),
        ('aa100000-0000-0000-0000-000000000012'::uuid, 'tksa.mesh.owner', 'Technostat Mesh Owner',       'participant_user'),
        ('aa100000-0000-0000-0000-000000000013'::uuid, 'catl.mesh.owner', 'CirrusAtlantic Mesh Owner',   'participant_user'),
        ('ee001000-0000-0000-0000-000000000011'::uuid, 'nim.owner',       'Nimubus Owner',               'participant_user'),
        ('ee001000-0000-0000-0000-000000000012'::uuid, 'nim.manager',     'Nimubus Relationship Manager','participant_user'),
        ('ee001000-0000-0000-0000-000000000013'::uuid, 'nim.agent',       'Nimubus Operations Agent',    'participant_user'),
        ('ee001000-0000-0000-0000-000000000014'::uuid, 'nim.finance',     'Nimubus Finance Contact',     'participant_user'),
        ('ee002000-0000-0000-0000-000000000011'::uuid, 'str.owner',       'Stratus Owner',               'participant_user'),
        ('ee002000-0000-0000-0000-000000000012'::uuid, 'str.manager',     'Stratus Account Manager',     'participant_user'),
        ('ee002000-0000-0000-0000-000000000013'::uuid, 'str.agent',       'Stratus Procurement Agent',   'participant_user')
)
INSERT INTO mesh.principal (
    id, principal_code, display_name, principal_type, metadata, status, created_by
)
SELECT
    id, principal_code, display_name, principal_type,
    '{"seed":"mesh_demo_exchange"}'::jsonb, 'active', 'system'
FROM principal_rows
ON CONFLICT (principal_code) DO UPDATE SET
    display_name   = EXCLUDED.display_name,
    principal_type = EXCLUDED.principal_type,
    metadata       = mesh.principal.metadata || EXCLUDED.metadata,
    status         = EXCLUDED.status,
    updated_at     = now(),
    updated_by     = 'system';

-- ── Identity bindings ─────────────────────────────────────────────────────────
WITH binding_rows (principal_code, subject_id, username) AS (
    VALUES
        ('athq.mesh.owner', 'aa100000-0000-0000-0000-000000000011', 'athq.mesh.owner'),
        ('tksa.mesh.owner', 'aa100000-0000-0000-0000-000000000012', 'tksa.mesh.owner'),
        ('catl.mesh.owner', 'aa100000-0000-0000-0000-000000000013', 'catl.mesh.owner'),
        ('nim.owner',       'ee001000-0000-0000-0000-000000000011', 'nim.owner'),
        ('nim.manager',     'ee001000-0000-0000-0000-000000000012', 'nim.manager'),
        ('nim.agent',       'ee001000-0000-0000-0000-000000000013', 'nim.agent'),
        ('nim.finance',     'ee001000-0000-0000-0000-000000000014', 'nim.finance'),
        ('str.owner',       'ee002000-0000-0000-0000-000000000011', 'str.owner'),
        ('str.manager',     'ee002000-0000-0000-0000-000000000012', 'str.manager'),
        ('str.agent',       'ee002000-0000-0000-0000-000000000013', 'str.agent')
)
INSERT INTO mesh.principal_identity_binding (
    principal_id, realm_key, provider_code, subject_id, username,
    issuer, client_id, synced_at, sync_status, metadata, created_by
)
SELECT
    p.id, 'athyper', 'keycloak', br.subject_id, br.username,
    'keycloak:athyper', 'mesh-web', now(), 'synced',
    '{"seed":"mesh_demo_exchange"}'::jsonb, 'system'
FROM binding_rows br
JOIN mesh.principal p ON p.principal_code = br.principal_code
ON CONFLICT (realm_key, provider_code, subject_id) DO UPDATE SET
    principal_id = EXCLUDED.principal_id,
    username     = EXCLUDED.username,
    issuer       = EXCLUDED.issuer,
    client_id    = EXCLUDED.client_id,
    synced_at    = EXCLUDED.synced_at,
    sync_status  = EXCLUDED.sync_status,
    metadata     = mesh.principal_identity_binding.metadata || EXCLUDED.metadata,
    updated_at   = now(),
    updated_by   = 'system';

-- ── Account grants ────────────────────────────────────────────────────────────
WITH grant_rows (account_code, principal_code, role_code) AS (
    VALUES
        ('BNA-1000000001', 'athq.mesh.owner', 'account_owner'),
        ('BNA-1000000018', 'tksa.mesh.owner', 'account_owner'),
        ('BNA-1000000022', 'catl.mesh.owner', 'account_owner'),
        ('BNA-3000000001', 'nim.owner',       'account_owner'),
        ('BNA-3000000001', 'nim.manager',     'account_admin'),
        ('BNA-3000000001', 'nim.agent',       'account_user'),
        ('BNA-3000000001', 'nim.finance',     'account_user'),
        ('BNA-3000000002', 'str.owner',       'account_owner'),
        ('BNA-3000000002', 'str.manager',     'account_admin'),
        ('BNA-3000000002', 'str.agent',       'account_user')
)
INSERT INTO mesh.account_grant (
    account_id, principal_id, role_code, status, granted_at, granted_by,
    metadata, created_by
)
SELECT
    na.id, p.id, gr.role_code, 'active', now(), 'system',
    '{"seed":"mesh_demo_exchange"}'::jsonb, 'system'
FROM grant_rows gr
JOIN mesh.network_account na ON na.account_code = gr.account_code
JOIN mesh.principal p ON p.principal_code = gr.principal_code
WHERE NOT EXISTS (
    SELECT 1
    FROM mesh.account_grant ag
    WHERE ag.account_id  = na.id
      AND ag.principal_id = p.id
      AND ag.role_code    = gr.role_code
      AND ag.status       = 'active'
);

-- ── Network relationships (formerly network_connection) ───────────────────────
INSERT INTO mesh.network_relationship (
    buyer_account_code, supplier_account_code, relationship_code,
    status, capability_set, terms_snapshot, metadata, activated_at, created_by
)
VALUES
    ('BNA-1000000001', 'BNA-3000000001', 'BNR-1000000001-3000000001', 'active', '{"documents":["purchase_order","invoice","credit_note","debit_note","remittance_advice","acknowledgement"],"buyer_to_supplier":["purchase_order","remittance_advice"],"supplier_to_buyer":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{}'::jsonb, '{"seed":"mesh_demo_exchange"}'::jsonb, now(), 'system'),
    ('BNA-1000000018', 'BNA-3000000001', 'BNR-1000000018-3000000001', 'active', '{"documents":["purchase_order","invoice","credit_note","debit_note","remittance_advice","acknowledgement"],"buyer_to_supplier":["purchase_order","remittance_advice"],"supplier_to_buyer":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{}'::jsonb, '{"seed":"mesh_demo_exchange"}'::jsonb, now(), 'system'),
    ('BNA-1000000022', 'BNA-3000000001', 'BNR-1000000022-3000000001', 'active', '{"documents":["purchase_order","invoice","credit_note","debit_note","remittance_advice","acknowledgement"],"buyer_to_supplier":["purchase_order","remittance_advice"],"supplier_to_buyer":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{}'::jsonb, '{"seed":"mesh_demo_exchange"}'::jsonb, now(), 'system'),
    ('BNA-1000000001', 'BNA-3000000002', 'BNR-1000000001-3000000002', 'active', '{"documents":["purchase_order","invoice","credit_note","debit_note","remittance_advice","acknowledgement"],"buyer_to_supplier":["purchase_order","remittance_advice"],"supplier_to_buyer":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{}'::jsonb, '{"seed":"mesh_demo_exchange"}'::jsonb, now(), 'system'),
    ('BNA-1000000018', 'BNA-3000000002', 'BNR-1000000018-3000000002', 'active', '{"documents":["purchase_order","invoice","credit_note","debit_note","remittance_advice","acknowledgement"],"buyer_to_supplier":["purchase_order","remittance_advice"],"supplier_to_buyer":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{}'::jsonb, '{"seed":"mesh_demo_exchange"}'::jsonb, now(), 'system'),
    ('BNA-1000000022', 'BNA-3000000002', 'BNR-1000000022-3000000002', 'active', '{"documents":["purchase_order","invoice","credit_note","debit_note","remittance_advice","acknowledgement"],"buyer_to_supplier":["purchase_order","remittance_advice"],"supplier_to_buyer":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb, '{}'::jsonb, '{"seed":"mesh_demo_exchange"}'::jsonb, now(), 'system')
ON CONFLICT ON CONSTRAINT mesh_network_relationship_pair_uq DO UPDATE SET
    relationship_code = EXCLUDED.relationship_code,
    status            = EXCLUDED.status,
    capability_set    = EXCLUDED.capability_set,
    terms_snapshot    = EXCLUDED.terms_snapshot,
    metadata          = mesh.network_relationship.metadata || EXCLUDED.metadata,
    activated_at      = COALESCE(mesh.network_relationship.activated_at, EXCLUDED.activated_at),
    updated_at        = now(),
    updated_by        = 'system';
