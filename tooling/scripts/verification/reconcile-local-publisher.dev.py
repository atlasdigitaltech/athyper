#!/usr/bin/env python3
"""Copy the enrolled DEV publisher identity to its admitted target planes.

Default is rollback rehearsal. No credentials, grants or approvals are created.
"""
import argparse
import json
import re
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--request', required=True)
p.add_argument('--apply', action='store_true')
a = p.parse_args()
assert re.fullmatch('[0-9a-f]{64}', a.request)

def sql(plane, query):
    assert plane in ('studio', 'neon', 'mesh')
    r = subprocess.run(['docker','exec','-i','athyper-dev-db-1','psql','-XqAt','-U','postgres','-d','athyper_'+plane,'-v','ON_ERROR_STOP=1'], input=query,text=True,capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()

def literal(x):
    return "'" + str(x).replace("'", "''") + "'"

source = json.loads(sql('studio', f"""
SELECT json_build_object('actor',to_jsonb(p),'targets',q.request_json#>'{{inputs,targets}}')
FROM publication.local_publication_request q JOIN master.principal p ON p.id=q.publisher_id AND p.tenant_id=q.tenant_id
JOIN publication.local_publication_host h ON h.singleton
WHERE q.request_hash={literal(a.request)} AND q.execution_status='published'
AND p.status='active' AND p.principal_type='service_account' AND p.provisioning_source='internal'
AND q.request_json#>>'{{admission,publisherWorkloadId}}'=p.id::text
AND h.identity='{{"environment":"local","instance":"dev","domainSuffix":"dev.athyper.test"}}'::jsonb;
"""))
actor=source['actor']
planes=sorted({x['plane'] for x in source['targets']})
report=[]
for plane in planes:
    body=f"""BEGIN; SET LOCAL lock_timeout='5s';
DO $body$
DECLARE a jsonb:={literal(json.dumps(actor))}::jsonb; seed uuid; found_row master.principal%ROWTYPE;
BEGIN
 IF current_database()<>{literal('athyper_'+plane)} THEN RAISE EXCEPTION 'LOCAL_DATABASE_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('local-publisher:'||(a->>'id'),0));
 SELECT id INTO STRICT seed FROM master.principal WHERE tenant_id=(a->>'tenant_id')::uuid
 AND code='seed.three-plane-provisioner' AND status='active' AND principal_type='service_account';
 PERFORM set_config('app.current_tenant_id',a->>'tenant_id',true);
 PERFORM set_config('app.current_principal_id',seed::text,true);
 PERFORM set_config('app.database_plane',{literal(plane)},true);
 SELECT * INTO found_row FROM master.principal WHERE id=(a->>'id')::uuid OR (tenant_id=(a->>'tenant_id')::uuid AND code=a->>'code');
 IF FOUND THEN
  IF found_row.id::text<>a->>'id' OR found_row.tenant_id::text<>a->>'tenant_id'
  OR found_row.code<>a->>'code' OR found_row.status<>'active'
  OR found_row.principal_type<>'service_account' OR found_row.provisioning_source<>'internal'
  OR found_row.auth_epoch::text<>a->>'auth_epoch' OR found_row.metadata IS DISTINCT FROM a->'metadata'
  THEN RAISE EXCEPTION 'PUBLISHER_IDENTITY_DRIFT'; END IF;
 ELSE
  INSERT INTO master.principal(id,tenant_id,code,name,principal_type,provisioning_source,status,auth_epoch,metadata,created_by)
  VALUES((a->>'id')::uuid,(a->>'tenant_id')::uuid,a->>'code',a->>'name','service_account','internal','active',(a->>'auth_epoch')::bigint,a->'metadata',seed);
 END IF;
END $body$;
SET CONSTRAINTS ALL IMMEDIATE;
"""
    sql(plane, body+'ROLLBACK;')
    if a.apply:
        sql(plane, body+'COMMIT;')
    report.append({'plane':plane,'publisherId':actor['id'],'rehearsed':True,'applied':a.apply})
print(json.dumps(report))
