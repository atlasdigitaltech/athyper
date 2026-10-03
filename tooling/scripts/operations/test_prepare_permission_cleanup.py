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
 CREATE TABLE authz.group_role(group_id uuid,tenant_id uuid,role_id uuid references authz.role,id uuid DEFAULT gen_random_uuid(),status text DEFAULT 'active',scope_target_id uuid);
 CREATE TABLE authz.permission_scope_kind(permission_id uuid references authz.permission);
 CREATE TABLE authz.deny_rule(permission_id uuid references authz.permission);
 CREATE TABLE runtime_meta.applied_release(id uuid primary key, source_release_id uuid,artifact_hash text,status text,publication_key text DEFAULT 'metadata.compiled_entity.sample');
 CREATE TABLE runtime_meta.release_activation_head(applied_release_id uuid references runtime_meta.applied_release);
 CREATE TABLE runtime_meta.applied_release_payload(applied_release_id uuid references runtime_meta.applied_release,tenant_id uuid,artifact_kind text,payload_json jsonb);
 ''')
 # Install the actual lifecycle and evidence functions: a synthetic table without
 # these triggers cannot prove that a production catalog can be retired.
 root=Path(__file__).resolve().parents[3]
 authz=(root/'server/db/ddl/common/authz/07_functions.sql').read_text(encoding='utf-8-sig')
 shared=(root/'server/db/ddl/common/shared/07_functions.sql').read_text(encoding='utf-8-sig')
 sql("CREATE SCHEMA shared; ALTER TABLE authz.permission ADD created_at timestamptz DEFAULT now(), ADD created_by uuid;")
 for source,function in [(authz,'authz.trg_guard_status_transition'),(authz,'authz.trg_guard_audit_evidence'),(shared,'shared.trg_set_status_changed'),(shared,'shared.trg_set_updated_at')]:
  start=source.index('CREATE OR REPLACE FUNCTION '+function+'(');end=source.index('$$;',start)+3
  sql(source[start:end])
 sql('''CREATE TRIGGER trg_permission_30_status_transition BEFORE UPDATE OF status ON authz.permission FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('catalog');
 CREATE TRIGGER trg_permission_35_audit_evidence BEFORE UPDATE ON authz.permission FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();
 CREATE TRIGGER trg_permission_40_status_changed BEFORE UPDATE OF status ON authz.permission FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
 CREATE TRIGGER trg_permission_50_updated_at BEFORE UPDATE ON authz.permission FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();''')
 ids=[str(uuid.uuid4()) for _ in range(8)];tenant,actor,pid,role,group,grant,release,source=ids
 manifest={'schema':'permission-cleanup/1','plane':'neon','tenantIds':[tenant],'actorId':actor,'purpose':'Disposable integration fixture','permissions':[{'code':'neon.old_child.read','entityCode':'sample_child','successorReleaseId':source,'successorArtifactHash':'a'*64,'expectedParent':{'entityCode':'sample_parent','relationshipKey':'children'}}]}
 payload={'release':{'artifacts':[]},'artifacts':[{'artifactType':'runtime_contract','entityCode':'sample_child','content':{'descriptor':{'planeKey':'neon','directoryScope':{'parent':{'entityCode':'sample_parent','relationshipKey':'children'}}}}}]}
 sql(f"INSERT INTO authz.permission(id,canonical_code,status) VALUES('{pid}','neon.old_child.read','published'); INSERT INTO authz.role VALUES('{role}','{tenant}','active'); INSERT INTO authz.role_permission VALUES('{grant}','{tenant}','{role}','{pid}'); INSERT INTO authz.group_role(group_id,tenant_id,role_id) VALUES('{group}','{tenant}','{role}'); INSERT INTO runtime_meta.applied_release(id,source_release_id,artifact_hash,status) VALUES('{release}','{source}','{'a'*64}','active'); INSERT INTO runtime_meta.release_activation_head VALUES('{release}'); INSERT INTO runtime_meta.applied_release_payload VALUES('{release}',NULL,'compiled_entity_runtime','{json.dumps(payload)}');")
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
 sql("UPDATE runtime_meta.applied_release_payload SET payload_json=payload_json #- '{artifacts,0,content,descriptor,planeKey}'")
 r=sql(apply,False);assert r.returncode and 'successor' in r.stderr,r.stderr
 sql("UPDATE runtime_meta.applied_release_payload SET payload_json=jsonb_set(payload_json,'{artifacts,0,content,descriptor,planeKey}','\"neon\"'::jsonb)")
 plan=sql(m.prepare(manifest));assert 'affected_relationship' in plan.stdout
 assert sql('SELECT count(*) FROM authz.role_permission;').stdout.find('1')>=0
 r=sql(apply);assert 'retired' in r.stdout,r.stdout
 assert 't' in sql(f"SELECT status_changed_by='{actor}'::uuid AND updated_by='{actor}'::uuid FROM authz.permission WHERE id='{pid}'").stdout
 check=sql("SELECT p.status,(SELECT count(*) FROM authz.role_permission),(SELECT count(*) FROM authz.group_role),(SELECT count(*) FROM authz.role) FROM authz.permission p;").stdout
 assert 'retired' in check and re.search(r'retired\s*\|\s*0\s*\|\s*1\s*\|\s*1',check),check
 sql(apply)  # Re-running the same reviewed correction is idempotent.
 # Actual terminal lifecycle refuses re-creation by a historical seed replay.
 r=sql("UPDATE authz.permission SET status='published' WHERE canonical_code='neon.old_child.read'",False)
 assert r.returncode and 'Invalid' in r.stderr,r.stderr
 baseline=(root/'server/db/ddl/planes/neon/authz/28_retire_bp_child_reads.sql').read_text()
 rows=json.loads((root/'docs/reviews/bp-child-read-cleanup-template-20261003.json').read_text())['permissions']
 for row in rows:
  sql(f"INSERT INTO authz.permission(id,canonical_code,status,status_changed_at,status_changed_by) VALUES('{uuid.uuid4()}','{row['code']}','published',now(),'{actor}')")
 baseline="SET app.database_plane='neon';\nBEGIN;\n"+baseline+"\nCOMMIT;"
 r=sql(baseline,False);assert r.returncode and 'refuses active publications' in r.stderr,r.stderr
 sql('DELETE FROM runtime_meta.release_activation_head')
 sql(f"INSERT INTO authz.role_permission SELECT '{uuid.uuid4()}','{tenant}','{role}',id FROM authz.permission WHERE canonical_code='{rows[0]['code']}'")
 r=sql(baseline,False);assert r.returncode and 'refuses existing dependencies' in r.stderr,r.stderr
 sql('DELETE FROM authz.role_permission')
 sql(baseline);sql(baseline)
 assert sql("SELECT count(*) FROM authz.permission WHERE status='retired'").stdout.find('8')>=0
 print('PASS: PostgreSQL inventory rollback; active-role, deny, tenant, publication and successor refusal; audited retirement; group/role retention; fresh-baseline retirement and terminal replay refusal.')
finally:
 cmd('docker','rm','--force',name,check=False)
