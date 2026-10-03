import importlib.util,json,subprocess,uuid,re
from pathlib import Path
spec=importlib.util.spec_from_file_location('cleanup',str(Path(__file__).with_name('prepare-permission-cleanup.py')));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
name='athyper-permission-cleanup-test-'+uuid.uuid4().hex[:8]
def cmd(*args,input=None,check=True):return subprocess.run(args,input=input,text=True,capture_output=True,check=check)
def sql(text,check=True):return cmd('docker','exec','-i',name,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1',input=text,check=check)
try:
 cmd('docker','run','--detach','--rm','--network','none','--name',name,'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16.15-bookworm')
 # The database readiness probe runs only inside this disposable network-isolated container.
 cmd('docker','exec',name,'sh','-c','until pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do sleep 0.1; done')
 sql('''CREATE SCHEMA authz; CREATE SCHEMA runtime_meta;
 CREATE TABLE authz.permission(id uuid primary key,canonical_code text,status text,status_changed_at timestamptz,status_changed_by uuid,updated_at timestamptz,updated_by uuid);
 CREATE TABLE authz.role(id uuid primary key,tenant_id uuid,status text);
 CREATE TABLE authz.role_permission(id uuid primary key,tenant_id uuid,role_id uuid references authz.role,permission_id uuid references authz.permission);
 CREATE TABLE authz.group_role(group_id uuid,tenant_id uuid,role_id uuid references authz.role);
 CREATE TABLE authz.permission_scope_kind(permission_id uuid references authz.permission);
 CREATE TABLE authz.deny_rule(permission_id uuid references authz.permission);
 CREATE TABLE runtime_meta.applied_release(id uuid primary key, source_release_id uuid,artifact_hash text,status text);
 CREATE TABLE runtime_meta.release_activation_head(applied_release_id uuid references runtime_meta.applied_release);
 CREATE TABLE runtime_meta.applied_release_payload(applied_release_id uuid references runtime_meta.applied_release,tenant_id uuid,artifact_kind text,payload_json jsonb);
 ''')
 ids=[str(uuid.uuid4()) for _ in range(8)];tenant,actor,pid,role,group,grant,release,source=ids
 manifest={'schema':'permission-cleanup/1','plane':'neon','tenantIds':[tenant],'actorId':actor,'purpose':'Disposable integration fixture','permissions':[{'code':'neon.old_child.read','entityCode':'sample_child','successorReleaseId':source,'successorArtifactHash':'a'*64,'expectedParent':{'entityCode':'sample_parent','relationshipKey':'children'}}]}
 payload={'release':{'artifacts':[{'artifactType':'runtime_contract','entityCode':'sample_child','content':{'descriptor':{'planeKey':'neon','directoryScope':{'parent':{'entityCode':'sample_parent','relationshipKey':'children'}}}}}]}}
 sql(f"INSERT INTO authz.permission(id,canonical_code,status) VALUES('{pid}','neon.old_child.read','published'); INSERT INTO authz.role VALUES('{role}','{tenant}','active'); INSERT INTO authz.role_permission VALUES('{grant}','{tenant}','{role}','{pid}'); INSERT INTO authz.group_role VALUES('{group}','{tenant}','{role}'); INSERT INTO runtime_meta.applied_release VALUES('{release}','{source}','{'a'*64}','active'); INSERT INTO runtime_meta.release_activation_head VALUES('{release}'); INSERT INTO runtime_meta.applied_release_payload VALUES('{release}',NULL,'compiled_entity_runtime','{json.dumps(payload)}');")
 apply="SET app.database_plane='neon';\n"+m.prepare(manifest,True)
 r=sql(apply,False);assert r.returncode and 'Roles must' in r.stderr,r.stderr
 sql(f"UPDATE authz.role SET status='suspended'; INSERT INTO authz.deny_rule VALUES('{pid}')")
 r=sql(apply,False);assert r.returncode and 'Unresolved permission dependency' in r.stderr,r.stderr
 sql('DELETE FROM authz.deny_rule;')
 wrong = dict(manifest, tenantIds=[str(uuid.uuid4())])
 r=sql("SET app.database_plane='neon';\n"+m.prepare(wrong,True),False)
 assert r.returncode and 'outside explicit tenant scope' in r.stderr,r.stderr
 sql("UPDATE runtime_meta.applied_release_payload SET payload_json=jsonb_set(payload_json,'{oldPermission}','\"neon.old_child.read\"'::jsonb)")
 r=sql(apply,False);assert r.returncode and 'still referenced' in r.stderr,r.stderr
 sql("UPDATE runtime_meta.applied_release_payload SET payload_json=payload_json-'oldPermission'")
 sql("UPDATE runtime_meta.applied_release SET status='staged'")
 r=sql(apply,False);assert r.returncode and 'successor' in r.stderr,r.stderr
 sql("UPDATE runtime_meta.applied_release SET status='active'")
 wrong_parent=json.loads(json.dumps(manifest));wrong_parent['permissions'][0]['expectedParent']['entityCode']='unrelated'
 r=sql("SET app.database_plane='neon';\n"+m.prepare(wrong_parent,True),False)
 assert r.returncode and 'successor' in r.stderr,r.stderr
 plan=sql(m.prepare(manifest));assert 'affected_relationship' in plan.stdout
 assert sql('SELECT count(*) FROM authz.role_permission;').stdout.find('1')>=0
 r=sql(apply);assert 'retired' in r.stdout,r.stdout
 check=sql("SELECT p.status,(SELECT count(*) FROM authz.role_permission),(SELECT count(*) FROM authz.group_role),(SELECT count(*) FROM authz.role) FROM authz.permission p;").stdout
 assert 'retired' in check and re.search(r'retired\s*\|\s*0\s*\|\s*1\s*\|\s*1',check),check
 sql(apply)  # Re-running the same reviewed correction is idempotent.
 print('PASS: disposable PostgreSQL plan rollback; active-role, deny, out-of-scope tenant, old-active-reference and missing-successor blocks; guarded retirement; group/role retention.')
finally:
 cmd('docker','rm','--force',name,check=False)
