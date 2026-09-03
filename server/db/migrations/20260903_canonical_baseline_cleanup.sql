-- Forward parity for canonical baseline cleanup shared by Studio, Neon and Mesh.
-- The global principal owner type enables notification/contact acceptance while
-- preserving tenant ownership on master.principal.
INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column, is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    sort_order, status, created_by
) VALUES (
    NULL, 'principal', 'Principal', 'Authenticated tenant principal contact owner.',
    'identity', 'platform', 'master', 'principal', 'id', true, 'tenant_id',
    false, true, true, 20, 'active', '00000000-0000-0000-0000-000000000000'::uuid
) ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO control.owner_type_purpose(owner_type_id, capability, purpose_code, created_by)
SELECT owner_type.id, purpose.capability, purpose.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type AS owner_type
 CROSS JOIN (VALUES
    ('contact', 'default'),
    ('contact', 'correspondence'),
    ('contact', 'notification'),
    ('contact', 'support')
 ) AS purpose(capability, purpose_code)
 WHERE owner_type.tenant_id IS NULL AND owner_type.code = 'principal'
ON CONFLICT DO NOTHING;

DO $grant$
BEGIN
  IF to_regprocedure('ai.fn_is_atlas_conversation(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION ai.fn_is_atlas_conversation(uuid, uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION ai.fn_is_atlas_conversation(uuid, uuid) TO athyperapp, athyperadmin;
  END IF;
END
$grant$;
