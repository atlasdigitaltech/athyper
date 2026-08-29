-- Make verified principal contacts addressable by the shared notification planner.
BEGIN;

INSERT INTO control.owner_type (
    tenant_id,code,name,description,category,source_type,target_schema,target_table,pk_column,
    is_tenant_scoped,tenant_column,supports_address,supports_contact,supports_external_reference,
    sort_order,status,created_by
)
VALUES (
    NULL,'principal','Principal',
    'Authenticated user or service principal with governed notification contacts.',
    'identity','platform','master','principal','id',true,'tenant_id',false,true,true,
    15,'active','00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO UPDATE
SET name=EXCLUDED.name,description=EXCLUDED.description,target_schema=EXCLUDED.target_schema,
    target_table=EXCLUDED.target_table,supports_contact=true,status='active';

INSERT INTO control.owner_type_purpose (owner_type_id,capability,purpose_code,created_by)
SELECT owner.id,'contact',purpose.code,'00000000-0000-0000-0000-000000000000'::uuid
FROM control.owner_type owner
CROSS JOIN (VALUES ('default'),('notification'),('security')) AS purpose(code)
WHERE owner.tenant_id IS NULL AND owner.code='principal'
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM control.owner_type WHERE tenant_id IS NULL AND code='principal' AND status='active' AND supports_contact) THEN
    RAISE EXCEPTION 'Principal notification-contact owner type was not installed';
  END IF;
END;
$$;

COMMIT;
