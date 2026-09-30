"""Approved CirrusAtlantic DEV BP access. Default rehearses and rolls back."""
import argparse, datetime, hashlib, json, pathlib, subprocess, uuid
ROOT = pathlib.Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
tenant = '44444444-4444-4444-8444-444444444444'
ref = 'user-approved:bp-dev-operational-access:20260912:v1'
scopes = {'tenant': (tenant, 'exact'), 'operating_organization': ('a478f9c0-8226-5d22-9599-b8fb27a45180', 'subtree'), 'company_code': ('793b6cb3-3c61-57c0-9562-2cbc288bd4cf', 'exact')}
T = 'neon.relationship.bp_target.'
C = 'neon.relationship.entity_case.'
B = 'neon.relationship.business_partner'
groups = []
def group(name, members, bundles):
    groups.append({'code':'dev.bp.'+name, 'members':members, 'roles':[{'code':'dev.bp.'+name+'.'+scope, 'scope':scope, 'permissions':sorted(set(perms))} for scope, perms in bundles]})
group('readers',['catl.admin','catl.owner'],[
 ('tenant',[T+k for k in ['discover','enter','read','navigate_manage','navigate_overview','identity_read','contacts_read','addresses_read','identifier_read','tax_read','bank_read','qualification_read','certificate_read','requests_read','activity_read','comments_read','attachments_read']]),
 ('operating_organization',[B+'.read']+[B+s for s in ['_identity.read','_contact.read','_address.read','_identifier.read_masked','_tax.read_masked','_bank.read_masked','_qualification.read','_certificate.read','_activity.read']]+[C+'read'])])
group('requesters',['catl.admin'],[('operating_organization',[C+k for k in ['create','read','update','validate','submit']]),('company_code',[T+'configure_company'])])
group('approvers',['catl.owner'],[('operating_organization',[C+'read',C+'decide'])])
group('appliers',['catl.admin'],[('operating_organization',[C+'materialize'])])
group('company-users',['catl.admin','catl.owner'],[('company_code',[T+'supplier_company_read',T+'customer_company_read',T+'credit_read']),('operating_organization',[B+'_credit.read'])])
group('data-transfer',['catl.admin'],[('tenant',[T+'import',T+'export'])])
group('protected-readers',['catl.admin'],[('tenant',[T+'bank_reveal',T+'tax_reveal']),('operating_organization',[B+'_bank.reveal',B+'_tax.reveal'])])
group('finance-readers',['catl.admin'],[('company_code',['finance.ledger.business_partner_activity.read'])])
plan={'kind':'bp_dev_operational_access','environment':'dev','plane':'neon','tenantId':tenant,'approvalSource':'User approved the eight proposed DEV group/role bundles in this conversation.','sourceRef':ref,'effectiveUntil':None,'scopes':scopes,'groups':groups,'enforcementActivation':False,'legacyRetirement':False,'restoreExpiredGrants':False,'limitations':['Source read gates may also admit legacy import/export where bound to the same code; separate target enforcement remains pending.','Resource-scoped comment/attachment domain permissions are not broadened to tenant scope.','Company-owned case lifecycle and release activation remain separate deployment prerequisites.']}
serialized=json.dumps(plan,sort_keys=True); digest=hashlib.sha256(serialized.encode()).hexdigest()
def lit(value): return "'"+str(value).replace("'","''")+"'"
def uid(key): return str(uuid.uuid5(uuid.NAMESPACE_URL,ref+':'+key))
planpath=ROOT/'governance/policy/reviews/business-partner-dev-operational-access-20260912.proposal.dev.json'
if planpath.exists():
    if json.dumps(json.loads(planpath.read_text()),sort_keys=True) != serialized: raise RuntimeError('Existing proposal differs')
else: planpath.write_text(json.dumps(plan,indent=2)+'\n')
migration=ROOT/'server/db/scripts/operations/repair/reference-permissions/20260912_finance_journal_activity_permission.sql'
sql=f"""BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s';
SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',{lit(tenant)},true),set_config('app.current_actor_type','service_account',true);
SELECT set_config('app.current_principal_id',id::text,true) FROM master.principal WHERE tenant_id={lit(tenant)}::uuid AND code='seed.three-plane-provisioner' AND status='active';
SELECT pg_advisory_xact_lock(hashtextextended({lit(ref)},0));
CREATE TEMP TABLE prior_authority(table_name text,id uuid,row_data jsonb) ON COMMIT DROP;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['role','role_permission','principal_group','group_member','group_role','scope_target','permission','permission_scope_kind','deny_rule','delegation','override','record_acl'] LOOP EXECUTE format('INSERT INTO prior_authority SELECT %L,id,to_jsonb(r) FROM authz.%I r',t,t); END LOOP; END $$;
"""+migration.read_text()
sql+=f"""DO $$ DECLARE actor uuid; parent uuid; t uuid:={lit(tenant)}; BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
SELECT s.id INTO STRICT parent FROM authz.scope_target s JOIN master.company_code c ON c.legal_entity_id=s.target_id AND c.tenant_id=s.tenant_id WHERE s.tenant_id=t AND s.scope_kind='legal_entity' AND s.status='active' AND c.id='793b6cb3-3c61-57c0-9562-2cbc288bd4cf' AND c.code='catl' AND c.status='active';
INSERT INTO authz.scope_target(tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,status,created_by) SELECT t,'company_code','catl','793b6cb3-3c61-57c0-9562-2cbc288bd4cf',parent,'CirrusAtlantic company catl','active',actor WHERE NOT EXISTS(SELECT 1 FROM authz.scope_target WHERE tenant_id=t AND scope_kind='company_code' AND target_id='793b6cb3-3c61-57c0-9562-2cbc288bd4cf');
END $$;
"""
for g in groups:
    gid=uid(g['code']); gc=lit(g['code'])
    sql+=f"""DO $$ DECLARE actor uuid; t uuid:={lit(tenant)}; principal uuid; BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
IF EXISTS(SELECT 1 FROM authz.principal_group WHERE tenant_id=t AND code={gc}) THEN RAISE EXCEPTION 'Group already exists; do not restore or duplicate'; END IF;
INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,status,created_by) VALUES({lit(gid)},t,{gc},{gc},'custom','manual',{lit(ref)},'active',actor);
"""
    for member in g['members']:
        sql+=f"""SELECT p.id INTO STRICT principal FROM master.principal p JOIN authz.plane_membership pm ON pm.tenant_id=p.tenant_id AND pm.principal_id=p.id WHERE p.tenant_id=t AND p.code={lit(member)} AND p.status='active' AND pm.status='active' AND pm.effective_from<=now() AND (pm.effective_until IS NULL OR pm.effective_until>now());
INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,created_by) VALUES(t,{lit(gid)},principal,'manual',{lit(ref)},'active',now(),actor);
"""
    sql+='END $$;\n'
    for r in g['roles']:
        rid=uid(r['code']); target,prop=scopes[r['scope']]; codes='ARRAY['+','.join(lit(p) for p in r['permissions'])+']::text[]'
        sql+=f"""DO $$ DECLARE actor uuid; t uuid:={lit(tenant)}; scope uuid; n integer; BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
SELECT id INTO STRICT scope FROM authz.scope_target WHERE tenant_id=t AND scope_kind={lit(r['scope'])} AND target_id={lit(target)}::uuid AND status='active';
SELECT count(*) INTO n FROM authz.permission p WHERE canonical_code=ANY({codes}) AND p.status='published' AND EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.scope_kind={lit(r['scope'])} AND s.propagation_mode={lit(prop)} AND s.status='active');
IF n<>{len(r['permissions'])} THEN RAISE EXCEPTION 'Missing permission or incompatible scope for {r['code']}'; END IF;
INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,status,created_by) VALUES({lit(rid)},t,{lit(r['code'])},{lit(r['code'])},'custom','manual',{lit(ref)},'draft',actor);
INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT t,{lit(rid)},id,actor FROM authz.permission WHERE canonical_code=ANY({codes}) AND status='published';
UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id={lit(rid)}::uuid;
INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_from,created_by) VALUES(t,{lit(gid)},{lit(rid)},scope,{lit(prop)},'manual',{lit(ref)},'active',now(),actor);
END $$;
"""
sql+="""SET CONSTRAINTS ALL IMMEDIATE;
DO $$ DECLARE r record; current_row jsonb; BEGIN FOR r IN SELECT * FROM prior_authority LOOP EXECUTE format('SELECT to_jsonb(x) FROM authz.%I x WHERE id=$1',r.table_name) INTO current_row USING r.id; IF current_row IS DISTINCT FROM r.row_data THEN RAISE EXCEPTION 'Existing authority changed'; END IF; END LOOP; END $$;
"""
sql+='COMMIT;' if args.apply else 'ROLLBACK;'
reportpath=ROOT/f'governance/policy/reports/business-partner-dev-operational-access-{ "applied" if args.apply else "rehearsal"}-20260912.dev.json'
if reportpath.exists():raise RuntimeError('Receipt already exists; inspect before rerunning')
if args.apply:
    rehearsal=json.loads((ROOT/'governance/policy/reports/business-partner-dev-operational-access-rehearsal-20260912.dev.json').read_text())
    if not rehearsal['passed'] or rehearsal['proposalSha256']!=digest: raise RuntimeError('Matching successful rehearsal required')
result=subprocess.run(['docker','exec','-i','athyper-dev-db-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],input=sql,text=True,capture_output=True)
if result.returncode: raise RuntimeError(result.stderr)
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'applied':args.apply,'proposalSha256':digest,'groups':len(groups),'roles':sum(len(g['roles']) for g in groups),'rolePermissions':sum(len(r['permissions']) for g in groups for r in g['roles']),'priorAuthorityUnchanged':True,'enforcementChanged':False,'financeMigrationSha256':hashlib.sha256(migration.read_bytes()).hexdigest()}
reportpath.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
