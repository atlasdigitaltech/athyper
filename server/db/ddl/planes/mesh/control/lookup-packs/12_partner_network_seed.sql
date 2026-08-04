-- seed-contract-version: 1
-- seed-pack: mesh.control.lookup.partner_network
-- seed-pack-version: 1.0.0
-- seed-dataset: mesh.control.lookup.partner_network
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: mesh
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:19
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/master/tenant_relationship_direction.sql,server/db/seed/platform/000_lookups/LookupDomain/master/tenant_relationship_status.sql,server/db/seed/platform/000_lookups/LookupDomain/master/tenant_relationship_type.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'mesh' THEN
    RAISE EXCEPTION 'mesh.control.lookup.partner_network: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('master.tenant_relationship_direction', 'Tenant Relationship Direction', 'Direction marker for tenant_relationship from/to semantics.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.tenant_relationship_status', 'Tenant Relationship Status', 'Lifecycle status of a tenant-to-tenant relationship or onboarding invite.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.tenant_relationship_type', 'Tenant Relationship Type', 'Explicit tenant-to-tenant relationship categories used for partner, supplier, support, and network onboarding.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
  ('outbound', 'Outbound', 'master.tenant_relationship_direction', 'from_tenant initiated or owns the relationship request.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('inbound', 'Inbound', 'master.tenant_relationship_direction', 'to_tenant initiated or owns the relationship request.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('mutual', 'Mutual', 'master.tenant_relationship_direction', 'Relationship is jointly owned or symmetrical.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pending', 'Pending', 'master.tenant_relationship_status', 'Relationship has been prepared but not yet invited or accepted.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('invited', 'Invited', 'master.tenant_relationship_status', 'Invite has been sent and is awaiting recipient action.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('active', 'Active', 'master.tenant_relationship_status', 'Relationship is active and eligible for grants/delegations.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('suspended', 'Suspended', 'master.tenant_relationship_status', 'Relationship is temporarily blocked without deleting history.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('revoked', 'Revoked', 'master.tenant_relationship_status', 'Relationship was explicitly revoked.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('rejected', 'Rejected', 'master.tenant_relationship_status', 'Invite or relationship request was rejected.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('expired', 'Expired', 'master.tenant_relationship_status', 'Invite or relationship window expired.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('archived', 'Archived', 'master.tenant_relationship_status', 'Historical relationship retained for audit only.', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('customer_partner', 'Customer Partner', 'master.tenant_relationship_type', 'Customer tenant explicitly connected to a partner tenant for Mesh collaboration.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('implementation_partner', 'Implementation Partner', 'master.tenant_relationship_type', 'Partner tenant assigned to implement, configure, or support a customer tenant.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('support_provider', 'Support Provider', 'master.tenant_relationship_type', 'Support relationship between a provider tenant and a customer tenant.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('platform_support', 'Platform Support', 'master.tenant_relationship_type', 'Athyper platform-owner support relationship to a tenant.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('customer_supplier', 'Customer Supplier', 'master.tenant_relationship_type', 'Customer tenant relationship to a supplier or supplier prospect.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('customer_invited_supplier', 'Customer Invited Supplier', 'master.tenant_relationship_type', 'Pending relationship created when a customer invites a supplier that does not yet have a Mesh account.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('affiliate', 'Affiliate', 'master.tenant_relationship_type', 'Related organization under a wider group relationship.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('intercompany', 'Intercompany', 'master.tenant_relationship_type', 'Tenant-to-tenant relationship for controlled group or intercompany collaboration.', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['master.tenant_relationship_direction', 'master.tenant_relationship_status', 'master.tenant_relationship_type'])) <> 19 THEN
    RAISE EXCEPTION 'mesh.control.lookup.partner_network: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['master.tenant_relationship_direction', 'master.tenant_relationship_status', 'master.tenant_relationship_type']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'mesh.control.lookup.partner_network: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['master.tenant_relationship_direction', 'master.tenant_relationship_status', 'master.tenant_relationship_type']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'mesh.control.lookup.partner_network: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['master.tenant_relationship_direction', 'master.tenant_relationship_status', 'master.tenant_relationship_type']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'mesh.control.lookup.partner_network: semantic assertion failed';
  END IF;
END $assertions$;
