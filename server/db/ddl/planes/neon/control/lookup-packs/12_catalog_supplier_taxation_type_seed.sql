-- seed-contract-version: 1
-- seed-pack: neon.control.lookup.catalog_supplier_taxation_type
-- seed-pack-version: 1.0.0
-- seed-dataset: neon.control.lookup.catalog_supplier_taxation_type
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:6
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/master/supplier_taxation_type.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_supplier_taxation_type: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('master.supplier_taxation_type', 'Supplier Taxation Type', 'How the supplier is taxed in a given jurisdiction (standard, WHT, reverse charge, exempt).', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  ('standard', 'Standard', 'master.supplier_taxation_type', 'Standard taxation — VAT/GST charged at standard rate', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('withholding', 'Withholding Tax', 'master.supplier_taxation_type', 'Buyer deducts WHT at source before remitting', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reverse_charge', 'Reverse Charge', 'master.supplier_taxation_type', 'Tax liability reversed to buyer (cross-border services)', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('zero_rated', 'Zero-Rated', 'master.supplier_taxation_type', 'Supply taxable at 0% (exports, certain necessities)', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('exempt', 'Exempt', 'master.supplier_taxation_type', 'Supply is exempt from tax (no input credit clawback)', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('out_of_scope', 'Out of Scope', 'master.supplier_taxation_type', 'Transaction outside tax scope (e.g. salary, donation)', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
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
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['master.supplier_taxation_type'])) <> 6 THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_supplier_taxation_type: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['master.supplier_taxation_type']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_supplier_taxation_type: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['master.supplier_taxation_type']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_supplier_taxation_type: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['master.supplier_taxation_type']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_supplier_taxation_type: semantic assertion failed';
  END IF;
END $assertions$;
