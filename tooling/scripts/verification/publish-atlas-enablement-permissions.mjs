import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(x => x !== '--apply')) throw Error('Use --apply or no arguments for rollback rehearsal');
const packetPath='docs/examples/atlas-f5/cirrus-permission-publication.json';
const packet=JSON.parse(readFileSync(packetPath,'utf8'));
if(packet.environment!=='dev'||packet.kind!=='atlas_permission_catalogue'||packet.grants.length)throw Error('Unexpected publication scope');
const packetSha256=createHash('sha256').update(JSON.stringify(packet)).digest('hex');
const literal=x=>"'"+String(x).replaceAll("'","''")+"'";
const receipts=[];
for(const plane of ['studio','neon']) {
 const definitions=packet.definitions.filter(d=>d.plane===plane);
 const sql=`BEGIN;
CREATE TEMP TABLE protected_before ON COMMIT DROP AS SELECT tablename AS name,NULL::text AS fingerprint FROM pg_tables WHERE schemaname='authz' AND tablename NOT IN ('permission','permission_scope_kind');
DO $capture$ DECLARE t record; f text; BEGIN FOR t IN SELECT * FROM protected_before LOOP EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text),'''')) FROM authz.%I r',t.name) INTO f; UPDATE protected_before SET fingerprint=f WHERE name=t.name; END LOOP; END $capture$;
CREATE TEMP TABLE definitions ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset(${literal(JSON.stringify(definitions))}::jsonb) AS d(id uuid,code text,module text,kind text,risk text,mfa boolean,sod boolean,scope text);
DO $modules$ BEGIN IF EXISTS(SELECT 1 FROM definitions d LEFT JOIN control.module m ON m.code=d.module AND m.status='active' WHERE m.id IS NULL) THEN RAISE EXCEPTION 'Missing active module'; END IF; END $modules$;
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT d.id,d.code,d.kind,m.id,d.risk,d.mfa,d.sod,false,false,false,jsonb_build_object('atlasEnablementPacketSha256',${literal(packetSha256)},'authorizationSource','operator instruction in task conversation; not an authenticated release review'),'published','00000000-0000-0000-0000-000000000000'::uuid FROM definitions d JOIN control.module m ON m.code=d.module ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT p.id,d.scope,'exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM definitions d JOIN authz.permission p ON p.canonical_code=d.code ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
SET CONSTRAINTS ALL IMMEDIATE;
DO $verify$ DECLARE t record; f text; BEGIN
IF EXISTS(SELECT 1 FROM definitions d JOIN authz.permission p ON p.canonical_code=d.code JOIN control.module m ON m.id=p.module_id WHERE p.id<>d.id OR m.code<>d.module OR p.permission_kind<>d.kind OR p.status<>'published' OR p.risk_tier<>d.risk OR p.requires_mfa<>d.mfa OR p.requires_sod<>d.sod OR p.is_shareable OR p.is_delegable OR p.is_overridable OR EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND (s.scope_kind<>d.scope OR s.propagation_mode<>'exact' OR s.status<>'active'))) THEN RAISE EXCEPTION 'Catalogue conflict; no overwrite permitted'; END IF;
FOR t IN SELECT * FROM protected_before LOOP EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text),'''')) FROM authz.%I r',t.name) INTO f; IF f IS DISTINCT FROM t.fingerprint THEN RAISE EXCEPTION 'Protected authorization table changed: %',t.name; END IF; END LOOP; END $verify$;
SELECT jsonb_build_object('plane',${literal(plane)},'count',(SELECT count(*) FROM definitions),'protectedTables',(SELECT count(*) FROM protected_before),'grantsUnchanged',true);
${apply?'COMMIT':'ROLLBACK'};`;
 const output=execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_'+plane,'-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:2e6});
 const line=output.split('\n').find(x=>x.startsWith('{'));if(!line)throw Error('Missing publication receipt');receipts.push(JSON.parse(line));
}
const receipt={observedAt:new Date().toISOString(),environment:'dev',applied:apply,packetSha256,receipts,metadataReleasePublished:false,writerEnabled:false};
writeFileSync(`docs/examples/atlas-f5/cirrus-permission-publication.${apply?'applied':'rehearsal'}.json`,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
