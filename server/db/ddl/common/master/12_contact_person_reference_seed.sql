-- seed-contract-version: 1
-- seed-pack: common.master.contact-person
-- seed-pack-version: 1.0.0
-- seed-dataset: control.lookup_domain
-- seed-data-class: production_reference
-- seed-provenance: {"source":"existing-repository-reference-data","publisher":"Athyper","source_version":"1","retrieved_at":"2026-09-30","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code);control.owner_type(code);control.owner_type_purpose(owner_type_id,capability,purpose_code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: minimum:17
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $seed_plane_guard$ BEGIN
 IF COALESCE(current_setting('app.database_plane', true),'') NOT IN ('studio','neon','mesh') THEN
  RAISE EXCEPTION 'common.master.contact-person: invalid database plane';
 END IF;
END $seed_plane_guard$;

INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible,
    metadata, status, created_by
)
VALUES (
    'master.contact_role',
    'Contact Role',
    'Platform and tenant-defined business roles held by named contacts.',
    'master',
    true,
    '{"configurability":"tenant_extensible"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_schema = EXCLUDED.source_schema,
    is_extensible = true,
    metadata = EXCLUDED.metadata,
    status = 'active'
WHERE (control.lookup_domain.name, control.lookup_domain.description, control.lookup_domain.source_schema, control.lookup_domain.is_extensible, control.lookup_domain.metadata, control.lookup_domain.status)
 IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.source_schema, true, EXCLUDED.metadata, 'active');

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, description, category,
    sort_order, is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, 'master.contact_role',
       value.description, value.category, value.sort_order,
       true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('main_contact', 'Main Contact', 'Primary general business contact.', 'general', 10::smallint),
    ('commercial', 'Commercial', 'Commercial relationship contact.', 'commercial', 20::smallint),
    ('procurement', 'Procurement', 'Procurement and sourcing contact.', 'procurement', 30::smallint),
    ('sales', 'Sales', 'Sales contact.', 'sales', 40::smallint),
    ('finance', 'Finance', 'General finance contact.', 'finance', 50::smallint),
    ('accounts_payable', 'Accounts Payable', 'Payables and remittance contact.', 'finance', 60::smallint),
    ('accounts_receivable', 'Accounts Receivable', 'Receivables and collection contact.', 'finance', 70::smallint),
    ('credit_control', 'Credit Control', 'Credit-control contact.', 'finance', 80::smallint),
    ('collection', 'Collection', 'Debt collection contact.', 'finance', 90::smallint),
    ('logistics', 'Logistics', 'Shipping and logistics contact.', 'logistics', 100::smallint),
    ('tax', 'Tax', 'Tax and registration contact.', 'tax', 110::smallint),
    ('legal', 'Legal', 'Legal contact.', 'legal', 120::smallint),
    ('compliance', 'Compliance', 'Compliance and governance contact.', 'legal', 130::smallint),
    ('technical', 'Technical', 'Technical integration contact.', 'technical', 140::smallint),
    ('support', 'Support', 'Service and support contact.', 'support', 150::smallint),
    ('project_coordinator', 'Project Coordinator', 'Project delivery contact.', 'operations', 160::smallint),
    ('escalation', 'Escalation', 'Escalation contact.', 'general', 170::smallint)
) AS value(code, name, description, category, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order,
    is_system = EXCLUDED.is_system,
    metadata = EXCLUDED.metadata,
    status = 'active'
WHERE (control.lookup_value.name, control.lookup_value.description, control.lookup_value.category, control.lookup_value.sort_order, control.lookup_value.is_system, control.lookup_value.metadata, control.lookup_value.status)
 IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.category, EXCLUDED.sort_order, EXCLUDED.is_system, EXCLUDED.metadata, 'active');

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    sort_order, status, created_by
)
VALUES (
    NULL, 'contact_person', 'Contact Person',
    'Named owner-scoped business contact.',
    'party', 'platform',
    'master', 'contact_person', 'id',
    true, 'tenant_id',
    false, true, false,
    35, 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    source_type = EXCLUDED.source_type,
    target_schema = EXCLUDED.target_schema,
    target_table = EXCLUDED.target_table,
    pk_column = EXCLUDED.pk_column,
    is_tenant_scoped = EXCLUDED.is_tenant_scoped,
    tenant_column = EXCLUDED.tenant_column,
    supports_address = EXCLUDED.supports_address,
    supports_contact = true,
    supports_external_reference = EXCLUDED.supports_external_reference,
    sort_order = EXCLUDED.sort_order,
    status = 'active'
WHERE (control.owner_type.name, control.owner_type.description, control.owner_type.category, control.owner_type.source_type, control.owner_type.target_schema, control.owner_type.target_table, control.owner_type.pk_column, control.owner_type.is_tenant_scoped, control.owner_type.tenant_column, control.owner_type.supports_address, control.owner_type.supports_contact, control.owner_type.supports_external_reference, control.owner_type.sort_order, control.owner_type.status)
 IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.category, EXCLUDED.source_type, EXCLUDED.target_schema, EXCLUDED.target_table, EXCLUDED.pk_column, EXCLUDED.is_tenant_scoped, EXCLUDED.tenant_column, EXCLUDED.supports_address, true, EXCLUDED.supports_external_reference, EXCLUDED.sort_order, 'active');

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT owner.id, 'contact', purpose.code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type owner
 CROSS JOIN (VALUES
    ('default'), ('business'), ('notification'), ('escalation')
 ) AS purpose(code)
 WHERE owner.tenant_id IS NULL
   AND owner.code = 'contact_person'
ON CONFLICT (owner_type_id, capability, purpose_code) DO NOTHING;

-- Generic address association can own a site's communication channels. This is
-- not a new person/contact copy and is shared by all consuming planes.
INSERT INTO control.owner_type (
 tenant_id,code,name,description,category,source_type,target_schema,target_table,
 pk_column,is_tenant_scoped,tenant_column,supports_address,supports_contact,
 supports_external_reference,sort_order,status,created_by
) VALUES (
 NULL,'address_link','Address association','Communication channels for an owner-specific address.',
 'party','platform','master','address_link','id',true,'tenant_id',false,true,false,36,'active',
 '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    source_type = EXCLUDED.source_type,
    target_schema = EXCLUDED.target_schema,
    target_table = EXCLUDED.target_table,
    pk_column = EXCLUDED.pk_column,
    is_tenant_scoped = EXCLUDED.is_tenant_scoped,
    tenant_column = EXCLUDED.tenant_column,
    supports_address = EXCLUDED.supports_address,
    supports_contact = EXCLUDED.supports_contact,
    supports_external_reference = EXCLUDED.supports_external_reference,
    sort_order = EXCLUDED.sort_order,
    status = EXCLUDED.status
WHERE (control.owner_type.name, control.owner_type.description, control.owner_type.category, control.owner_type.source_type, control.owner_type.target_schema, control.owner_type.target_table, control.owner_type.pk_column, control.owner_type.is_tenant_scoped, control.owner_type.tenant_column, control.owner_type.supports_address, control.owner_type.supports_contact, control.owner_type.supports_external_reference, control.owner_type.sort_order, control.owner_type.status)
 IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.category, EXCLUDED.source_type, EXCLUDED.target_schema, EXCLUDED.target_table, EXCLUDED.pk_column, EXCLUDED.is_tenant_scoped, EXCLUDED.tenant_column, EXCLUDED.supports_address, EXCLUDED.supports_contact, EXCLUDED.supports_external_reference, EXCLUDED.sort_order, EXCLUDED.status);
INSERT INTO control.owner_type_purpose(owner_type_id,capability,purpose_code,created_by)
 SELECT id,'contact',purpose.code,'00000000-0000-0000-0000-000000000000'::uuid
 FROM control.owner_type CROSS JOIN (VALUES('default'),('business'),('notification'),('escalation')) purpose(code)
 WHERE tenant_id IS NULL AND control.owner_type.code='address_link'
ON CONFLICT (owner_type_id, capability, purpose_code) DO NOTHING;

DO $seed_assertions$ BEGIN
 -- seed-assertion: expected-count
 IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code='master.contact_role')<17 THEN RAISE EXCEPTION 'common.master.contact-person: expected-count failed'; END IF;
 -- seed-assertion: orphan
 IF EXISTS(SELECT 1 FROM control.owner_type_purpose p LEFT JOIN control.owner_type o ON o.id=p.owner_type_id WHERE o.id IS NULL) THEN RAISE EXCEPTION 'common.master.contact-person: orphan failed'; END IF;
 -- seed-assertion: uniqueness
 IF EXISTS(SELECT domain_code,code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code='master.contact_role' GROUP BY domain_code,code HAVING count(*)>1) THEN RAISE EXCEPTION 'common.master.contact-person: uniqueness failed'; END IF;
 -- seed-assertion: semantic
 IF (SELECT count(*) FROM control.owner_type WHERE tenant_id IS NULL AND code IN ('contact_person','address_link') AND supports_contact AND status='active')<>2 THEN RAISE EXCEPTION 'common.master.contact-person: semantic failed'; END IF;
END $seed_assertions$;
