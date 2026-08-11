\if :{?fixture_tenant_id}
\else
  \quit 3
\endif
\if :{?fixture_principal_id}
\else
  \quit 3
\endif
\if :{?fixture_other_tenant_id}
\else
  \quit 3
\endif
\if :{?fixture_other_principal_id}
\else
  \quit 3
\endif

INSERT INTO master.tenant (id, code, name, display_name, realm_key, status, created_by)
VALUES
  (:'fixture_tenant_id'::uuid, 'postgres_qualification', 'PostgreSQL Qualification', 'PostgreSQL Qualification', current_setting('app.database_plane'), 'active', :'fixture_principal_id'::uuid),
  (:'fixture_other_tenant_id'::uuid, 'postgres_qualification_other', 'PostgreSQL Qualification Other', 'PostgreSQL Qualification Other', current_setting('app.database_plane'), 'active', :'fixture_other_principal_id'::uuid);

INSERT INTO master.principal (id, tenant_id, code, name, principal_type, status, created_by)
VALUES
  (:'fixture_principal_id'::uuid, :'fixture_tenant_id'::uuid, 'postgres.qualification', 'PostgreSQL Qualification', 'service_account', 'active', :'fixture_principal_id'::uuid),
  (:'fixture_other_principal_id'::uuid, :'fixture_other_tenant_id'::uuid, 'postgres.qualification.other', 'PostgreSQL Qualification Other', 'service_account', 'active', :'fixture_other_principal_id'::uuid);
