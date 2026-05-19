-- Phase 1 entity correction: normalise platform name / slug / entity_code
-- from any prior schema-prefixed values back to table-name-only convention.
-- Logical read models / shared physical tables keep their runtime entity_code.
--
-- Scope rule:
--   tenant_id IS NULL = platform standard metadata, safe for seed repair.
--   tenant_id IS NOT NULL = tenant override/customisation, never touched here.
--
-- Convention:
--   name        = {logical entity code}      (usually table_name)
--   slug        = {logical-entity-code}      (kebab-case)
--   entity_code = {logical entity code}      (usually table_name)
--   entity_short — left unchanged (set per-entity by earlier seed)
--
-- Idempotent: only touches platform rows where at least one field differs.

DO $$
DECLARE
    v_su              uuid    := '00000000-0000-0000-0000-000000000000';
    v_count           integer;
    v_duplicate_names text;
BEGIN
    SELECT string_agg(d.table_name, ', ' ORDER BY d.table_name)
      INTO v_duplicate_names
      FROM (
          SELECT table_name
          FROM control.entity
          WHERE tenant_id IS NULL
            AND table_schema IN ('control', 'document', 'master', 'shared')
          GROUP BY table_name
          HAVING count(*) > 1
      ) d;

    IF v_duplicate_names IS NOT NULL THEN
        RAISE EXCEPTION
            'Phase 1 entity correction aborted: duplicate platform table_name(s) across standard schemas: %',
            v_duplicate_names;
    END IF;

    WITH logical_aliases(table_schema, table_name, entity_code) AS (
        VALUES
          ('master', 'certification',                    'business_partner_certification'),
          ('master', 'party_identifier',                 'business_partner_identifier'),
          ('master', 'party_tax_profile',                'business_partner_tax_profile'),
          ('master', 'party_contact_person',             'business_partner_contact_person'),
          ('master', 'party_governance_relation',        'business_partner_governance'),
          ('master', 'v_business_partner_address',       'business_partner_address'),
          ('master', 'v_business_partner_app_index',     'business_partner_app_index'),
          ('master', 'v_business_partner_bank_account',  'business_partner_bank_account'),
          ('master', 'v_business_partner_role_summary',  'business_partner_role_summary')
    ),
    desired AS (
        SELECT e.id,
               COALESCE(a.entity_code, e.table_name) AS entity_code
          FROM control.entity e
          LEFT JOIN logical_aliases a
            ON a.table_schema = e.table_schema
           AND a.table_name = e.table_name
         WHERE e.tenant_id IS NULL
           AND e.table_schema IN ('control', 'document', 'master', 'shared')
    )
    UPDATE control.entity e
       SET name        = d.entity_code,
           slug        = replace(d.entity_code, '_', '-'),
           entity_code = d.entity_code,
           updated_at  = now(),
           updated_by  = v_su
      FROM desired d
     WHERE e.id = d.id
       AND (
            e.name        IS DISTINCT FROM d.entity_code
         OR e.slug        IS DISTINCT FROM replace(d.entity_code, '_', '-')
         OR e.entity_code IS DISTINCT FROM d.entity_code
       );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Phase 1 entity correction: % rows updated', v_count;
END $$;
