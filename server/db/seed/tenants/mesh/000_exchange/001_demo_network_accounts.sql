-- ============================================================================
-- MESH EXCHANGE — FULL-RESET DEMO TOPOLOGY
-- ============================================================================
-- Every Neon legal entity has a buyer BNA (BNA-1xxxxxxxxx) and a supplier BNA
-- (BNA-2xxxxxxxxx).  A Mesh operator is granted only to accounts owned by its
-- own legal entity.  Exchange with counterparties is represented by a network
-- relationship, never by a counterparty account grant.
-- ============================================================================

-- Account topology: 22 internal buyer/supplier pairs and two external suppliers.
WITH legal_rows (tenant_code, tenant_hex, le_hex, cc, legal_entity_code, bna_suffix, display_name) AS (
    VALUES
        ('athyper','01','01','athq','LE-ATHQ','0000000001','Athyper Group Holdings'),
        ('athyper','01','02','acfb','LE-ACFB','0000000011','Athyper Canada Food and Beverage Mfg'),
        ('athyper','01','03','adpm','LE-ADPM','0000000012','Athyper Germany Pharmaceutical Mfg'),
        ('athyper','01','04','aitm','LE-AITM','0000000010','Athyper India Textile and Leather Mfg'),
        ('athyper','01','05','ajed','LE-AJED','0000000016','Athyper Japan Education Services'),
        ('athyper','01','06','amre','LE-AMRE','0000000002','Athyper Malaysia Real Estate'),
        ('athyper','01','07','aphs','LE-APHS','0000000017','Athyper Philippines Hospital Services'),
        ('athyper','01','08','aqts','LE-AQTS','0000000005','Athyper Qatar Transport and Storage'),
        ('athyper','01','09','aqtu','LE-AQTU','0000000003','Athyper Qatar Utilities'),
        ('athyper','01','0a','asac','LE-ASAC','0000000004','Athyper Saudi Construction'),
        ('athyper','01','0b','asah','LE-ASAH','0000000007','Athyper Saudi Hospitality'),
        ('athyper','01','0c','asgf','LE-ASGF','0000000009','Athyper Singapore Financial Services'),
        ('athyper','01','0d','aspe','LE-ASPE','0000000014','Athyper South Africa Petroleum Extraction'),
        ('athyper','01','0e','atem','LE-ATEM','0000000013','Athyper Taiwan Electronics Mfg'),
        ('athyper','01','0f','auet','LE-AUET','0000000006','Athyper UAE Trading'),
        ('athyper','01','10','auic','LE-AUIC','0000000008','Athyper US Information and Communication'),
        ('athyper','01','11','auka','LE-AUKA','0000000015','Athyper UK Agriculture'),
        ('technostat','02','01','tksa','LE-TKSA','0000000018','Technostat Group'),
        ('technostat','02','02','ssk','LE-SSK','0000000019','SSK Saudi'),
        ('technostat','02','03','tegy','LE-TEGY','0000000020','Technostat Egypt'),
        ('technostat','02','04','sdtx','LE-SDTX','0000000021','Satellites for Digital Transformation'),
        ('cirrusatlantic','03','01','catl','CATL','0000000022','CirrusAtlantic Ltd')
), account_rows AS (
    SELECT
        'BNA-1' || right(bna_suffix, 9) AS account_code, display_name, 'buyer'::text AS network_role,
        tenant_code, legal_entity_code, cc
    FROM legal_rows
    UNION ALL
    SELECT
        'BNA-2' || right(bna_suffix, 9), display_name || ' Supplier', 'supplier'::text,
        tenant_code, legal_entity_code, cc
    FROM legal_rows
    UNION ALL SELECT 'BNA-3000000001', 'Nimubus Solutions', 'supplier', NULL, NULL, 'nim'
    UNION ALL SELECT 'BNA-3000000002', 'Stratus Commerce', 'supplier', NULL, NULL, 'str'
)
INSERT INTO mesh.network_account (
    account_code, provider_code, display_name, participant_type, source_plane,
    source_ref, legal_name, network_role, capabilities, status, metadata, created_by
)
SELECT
    account_code,
    'athyper_mesh',
    display_name,
    CASE WHEN tenant_code IS NULL THEN 'partner_org' ELSE 'tenant_legal_entity' END,
    CASE WHEN tenant_code IS NULL THEN 'mesh' ELSE 'neon' END,
    CASE WHEN tenant_code IS NULL THEN cc ELSE tenant_code || ':' || legal_entity_code END,
    display_name,
    network_role,
    CASE network_role
        WHEN 'buyer' THEN '{"can_send":["purchase_order","remittance_advice"],"can_receive":["invoice","credit_note","debit_note","acknowledgement"]}'::jsonb
        ELSE '{"can_send":["invoice","credit_note","debit_note","acknowledgement"],"can_receive":["purchase_order","remittance_advice"]}'::jsonb
    END,
    'active',
    jsonb_strip_nulls(jsonb_build_object(
        'tenant_code', tenant_code, 'legal_entity_code', legal_entity_code,
        'principal_prefix', cc, 'seed', 'mesh_full_reset'
    )),
    'system'
FROM account_rows
ON CONFLICT (account_code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    participant_type = EXCLUDED.participant_type,
    source_plane = EXCLUDED.source_plane,
    source_ref = EXCLUDED.source_ref,
    legal_name = EXCLUDED.legal_name,
    network_role = EXCLUDED.network_role,
    capabilities = EXCLUDED.capabilities,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata,
    updated_at = now(), updated_by = 'system';

-- 66 internal operators mirror their Neon Keycloak subject IDs; supplier users
-- remain Mesh-only principals with their established deterministic IDs.
WITH legal_rows (tenant_hex, le_hex, cc) AS (
    VALUES
        ('01','01','athq'),('01','02','acfb'),('01','03','adpm'),('01','04','aitm'),('01','05','ajed'),('01','06','amre'),('01','07','aphs'),('01','08','aqts'),('01','09','aqtu'),('01','0a','asac'),('01','0b','asah'),('01','0c','asgf'),('01','0d','aspe'),('01','0e','atem'),('01','0f','auet'),('01','10','auic'),('01','11','auka'),
        ('02','01','tksa'),('02','02','ssk'),('02','03','tegy'),('02','04','sdtx'),('03','01','catl')
), principal_rows (id, principal_code, display_name, principal_type) AS (
    SELECT
        format('aa%s%s%s-0000-0000-0000-000000000000', tenant_hex, le_hex, persona_hex)::uuid,
        cc || '.' || persona,
        upper(cc) || ' ' || initcap(persona),
        'participant_user'
    FROM legal_rows
    CROSS JOIN (VALUES ('04','agent'),('06','owner'),('07','admin')) AS p(persona_hex, persona)
    UNION ALL VALUES
        ('ee001000-0000-0000-0000-000000000011'::uuid, 'nim.owner', 'Nimubus Owner', 'participant_user'),
        ('ee001000-0000-0000-0000-000000000012'::uuid, 'nim.manager', 'Nimubus Relationship Manager', 'participant_user'),
        ('ee001000-0000-0000-0000-000000000013'::uuid, 'nim.agent', 'Nimubus Operations Agent', 'participant_user'),
        ('ee001000-0000-0000-0000-000000000014'::uuid, 'nim.finance', 'Nimubus Finance Contact', 'participant_user'),
        ('ee002000-0000-0000-0000-000000000011'::uuid, 'str.owner', 'Stratus Owner', 'participant_user'),
        ('ee002000-0000-0000-0000-000000000012'::uuid, 'str.manager', 'Stratus Account Manager', 'participant_user'),
        ('ee002000-0000-0000-0000-000000000013'::uuid, 'str.agent', 'Stratus Procurement Agent', 'participant_user')
)
INSERT INTO mesh.principal (id, principal_code, display_name, principal_type, metadata, status, created_by)
SELECT id, principal_code, display_name, principal_type, '{"seed":"mesh_full_reset"}', 'active', 'system'
FROM principal_rows
ON CONFLICT (principal_code) DO UPDATE SET
    display_name = EXCLUDED.display_name, principal_type = EXCLUDED.principal_type,
    metadata = EXCLUDED.metadata, status = EXCLUDED.status, updated_at = now(), updated_by = 'system';

WITH binding_rows (principal_code, subject_id, username) AS (
    SELECT cc || '.' || persona,
           format('aa%s%s%s-0000-0000-0000-000000000000', tenant_hex, le_hex, persona_hex),
           cc || '.' || persona
    FROM (VALUES
        ('01','01','athq'),('01','02','acfb'),('01','03','adpm'),('01','04','aitm'),('01','05','ajed'),('01','06','amre'),('01','07','aphs'),('01','08','aqts'),('01','09','aqtu'),('01','0a','asac'),('01','0b','asah'),('01','0c','asgf'),('01','0d','aspe'),('01','0e','atem'),('01','0f','auet'),('01','10','auic'),('01','11','auka'),('02','01','tksa'),('02','02','ssk'),('02','03','tegy'),('02','04','sdtx'),('03','01','catl')
    ) AS le(tenant_hex, le_hex, cc)
    CROSS JOIN (VALUES ('04','agent'),('06','owner'),('07','admin')) AS p(persona_hex, persona)
    UNION ALL VALUES
        ('nim.owner','ee001000-0000-0000-0000-000000000011','nim.owner'),('nim.manager','ee001000-0000-0000-0000-000000000012','nim.manager'),('nim.agent','ee001000-0000-0000-0000-000000000013','nim.agent'),('nim.finance','ee001000-0000-0000-0000-000000000014','nim.finance'),('str.owner','ee002000-0000-0000-0000-000000000011','str.owner'),('str.manager','ee002000-0000-0000-0000-000000000012','str.manager'),('str.agent','ee002000-0000-0000-0000-000000000013','str.agent')
)
INSERT INTO mesh.principal_identity_binding (principal_id, realm_key, provider_code, subject_id, username, sync_status, synced_at, metadata, created_by)
SELECT p.id, 'athyper', 'keycloak', b.subject_id, b.username, 'synced', now(), '{"seed":"mesh_full_reset"}', 'system'
FROM binding_rows b JOIN mesh.principal p ON p.principal_code = b.principal_code
ON CONFLICT (principal_id, realm_key, provider_code) DO UPDATE SET
    subject_id = EXCLUDED.subject_id, username = EXCLUDED.username, sync_status = EXCLUDED.sync_status,
    synced_at = EXCLUDED.synced_at, metadata = EXCLUDED.metadata, updated_at = now(), updated_by = 'system';

-- Internal users receive two grants only: their own buyer and supplier BNA.
WITH grant_rows (principal_code, account_code, role_code) AS (
    SELECT le.cc || '.' || persona,
           'BNA-' || account_prefix || right(le.bna_suffix, 9),
           CASE persona WHEN 'agent' THEN 'account_user' WHEN 'owner' THEN 'account_owner' ELSE 'account_admin' END
    FROM (VALUES
        ('athq','0000000001'),('acfb','0000000011'),('adpm','0000000012'),('aitm','0000000010'),('ajed','0000000016'),('amre','0000000002'),('aphs','0000000017'),('aqts','0000000005'),('aqtu','0000000003'),('asac','0000000004'),('asah','0000000007'),('asgf','0000000009'),('aspe','0000000014'),('atem','0000000013'),('auet','0000000006'),('auic','0000000008'),('auka','0000000015'),('tksa','0000000018'),('ssk','0000000019'),('tegy','0000000020'),('sdtx','0000000021'),('catl','0000000022')
    ) AS le(cc, bna_suffix)
    CROSS JOIN (VALUES ('1'),('2')) AS a(account_prefix)
    CROSS JOIN (VALUES ('agent'),('owner'),('admin')) AS p(persona)
    UNION ALL VALUES
        ('nim.owner','BNA-3000000001','account_owner'),('nim.manager','BNA-3000000001','account_admin'),('nim.agent','BNA-3000000001','account_user'),('nim.finance','BNA-3000000001','account_user'),('str.owner','BNA-3000000002','account_owner'),('str.manager','BNA-3000000002','account_admin'),('str.agent','BNA-3000000002','account_user')
)
INSERT INTO mesh.account_grant (account_id, principal_id, role_code, status, metadata, created_by)
SELECT a.id, p.id, g.role_code, 'active', '{"seed":"mesh_full_reset"}', 'system'
FROM grant_rows g JOIN mesh.principal p ON p.principal_code = g.principal_code
JOIN mesh.network_account a ON a.account_code = g.account_code
ON CONFLICT (account_id, principal_id, role_code) WHERE status = 'active' DO UPDATE SET
    metadata = EXCLUDED.metadata, updated_at = now(), updated_by = 'system';

-- All buyer accounts relate to every other internal supplier plus the two external suppliers.
INSERT INTO mesh.network_relationship (
    buyer_account_code, supplier_account_code, relationship_code, status,
    capability_set, terms_snapshot, metadata, activated_at, created_by
)
SELECT
    buyer.account_code,
    supplier.account_code,
    'BNR-' || substr(buyer.account_code, 5) || '-' || substr(supplier.account_code, 5),
    'active',
    '{"documents":["purchase_order","acknowledgement","invoice","credit_note","debit_note","remittance_advice"]}'::jsonb,
    '{}'::jsonb,
    '{"seed":"mesh_full_reset"}'::jsonb,
    now(),
    'system'
FROM mesh.network_account buyer
JOIN mesh.network_account supplier ON supplier.network_role = 'supplier' AND supplier.status = 'active'
WHERE buyer.network_role = 'buyer'
  AND buyer.status = 'active'
  AND buyer.source_ref IS DISTINCT FROM supplier.source_ref
ON CONFLICT (buyer_account_code, supplier_account_code) DO UPDATE SET
    status = EXCLUDED.status, capability_set = EXCLUDED.capability_set,
    metadata = EXCLUDED.metadata, activated_at = EXCLUDED.activated_at,
    updated_at = now(), updated_by = 'system';
