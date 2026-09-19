import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { proposalHash } from './entity-authorization/named-role-review.mjs';
const apply = process.argv.slice(2);
if (apply.length > 1 || (apply.length && apply[0] !== '--apply')) throw Error('Use no arguments for rollback dry run, or --apply for catalog-only installation');
execFileSync('pnpm',['exec','tsx','tooling/scripts/verification/prepare-business-partner-accepted-operations.mts'],{stdio:'inherit'});
const selection = JSON.parse(readFileSync('governance/policy/reports/business-partner-accepted-operations.dev.json'));
const packet = JSON.parse(readFileSync('governance/policy/reviews/business-partner-operation-workflow.dev.json'));
const { selectionSha256, ...body } = selection;
if (proposalHash(body)!==selectionSha256 || selection.packetRevision!==packet.packetRevision || selection.permissionDefinitions.length!==27 || selection.grantChanges.length) throw Error('Invalid exact catalog selection');
const rows=selection.permissionDefinitions.map(d=>({code:d.canonicalCode,existing:packet.rows.find(r=>r.operation===d.operation).proposal.permission.existingCode,proposal:d.proposalSha256,scopes:d.scopeBindings.map(b=>b.scopeKind)}));
const literal = value => "'"+value.replaceAll("'","''")+"'";
const sql=`BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL app.database_plane='neon';
SELECT pg_advisory_xact_lock(hashtext('bp-target-catalog-v1'));
CREATE TEMP TABLE expected AS SELECT value->>'code' code,value->>'existing' existing,value->>'proposal' proposal,value->'scopes' scopes FROM jsonb_array_elements(${literal(JSON.stringify(rows))}::jsonb);
CREATE TEMP TABLE protected_before (name text PRIMARY KEY, fingerprint text);
DO $guard$ DECLARE t record; fingerprint text; BEGIN
 IF current_database()<>'athyper_neon' OR NOT EXISTS(SELECT 1 FROM control.module WHERE code='fnd' AND status='active') THEN RAISE EXCEPTION 'Wrong catalog plane/module'; END IF;
 IF NOT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head WHERE publication_key=${literal(selection.base.publicationKey)} AND row_version=${Number(selection.base.headVersion)} AND applied_release_id=${literal(selection.base.appliedReleaseId)}::uuid) THEN RAISE EXCEPTION 'Activation head changed'; END IF;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='authz' AND tablename NOT IN ('permission','permission_scope_kind') ORDER BY tablename LOOP
 EXECUTE format('LOCK TABLE authz.%I IN SHARE MODE',t.tablename);
 EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text),'''')) FROM authz.%I r',t.tablename) INTO fingerprint;
 INSERT INTO protected_before VALUES(t.tablename,fingerprint);
 END LOOP;
END $guard$;
CREATE TEMP TABLE definitions AS SELECT e.*,coalesce(p.module_id,m.id) module_id,coalesce(p.risk_tier,'low') risk_tier,coalesce(p.requires_mfa,false) requires_mfa,coalesce(p.requires_sod,false) requires_sod
FROM expected e JOIN control.module m ON m.code='fnd' AND m.status='active' LEFT JOIN authz.permission p ON p.canonical_code=e.existing;
INSERT INTO authz.permission(canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT code,'entity_operation',module_id,risk_tier,requires_mfa,requires_sod,false,false,false,
jsonb_build_object('_seed',jsonb_build_object('pack','neon.bp-target-permissions','version','1.0.0'),'proposalSha256',proposal,'packetRevision',${literal(selection.packetRevision)}),'published','00000000-0000-0000-0000-000000000000'::uuid FROM definitions ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT p.id,s.value,'exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM definitions d JOIN authz.permission p ON p.canonical_code=d.code CROSS JOIN LATERAL jsonb_array_elements_text(d.scopes) s(value)
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
SET CONSTRAINTS ALL IMMEDIATE;
DO $verify$ DECLARE t record; fingerprint text; BEGIN
 IF EXISTS(SELECT 1 FROM definitions d JOIN authz.permission p ON p.canonical_code=d.code WHERE p.status<>'published' OR p.permission_kind<>'entity_operation' OR p.module_id<>d.module_id OR p.risk_tier<>d.risk_tier OR p.requires_mfa<>d.requires_mfa OR p.requires_sod<>d.requires_sod OR p.is_shareable OR p.is_delegable OR p.is_overridable OR p.metadata->>'proposalSha256' IS DISTINCT FROM d.proposal OR (SELECT jsonb_agg(s.scope_kind ORDER BY s.scope_kind) FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.status='active' AND s.propagation_mode='exact') IS DISTINCT FROM (SELECT jsonb_agg(v ORDER BY v) FROM jsonb_array_elements_text(d.scopes) v) OR EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND (s.propagation_mode<>'exact' OR s.status<>'active'))) THEN RAISE EXCEPTION 'Existing catalog definition conflicts; no overwrite permitted'; END IF;
 FOR t IN SELECT * FROM protected_before LOOP
 EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text),'''')) FROM authz.%I r',t.name) INTO fingerprint;
 IF fingerprint IS DISTINCT FROM t.fingerprint THEN RAISE EXCEPTION 'Protected authorization table changed: %',t.name; END IF;
 END LOOP;
END $verify$;
SELECT jsonb_build_object('schemaVersion',1,'kind','bp_target_catalog_installation','applied',${apply.length?'true':'false'},'packetRevision',${literal(selection.packetRevision)},'selectionSha256',${literal(selectionSha256)},'capturedAt',clock_timestamp(),'protectedAuthorizationTables',(SELECT count(*) FROM protected_before),'grantsUnchanged',true,'activationChanged',false,'permissions',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.canonical_code,'status',p.status,'requiresMfa',p.requires_mfa,'requiresSod',p.requires_sod) ORDER BY p.canonical_code) FROM authz.permission p JOIN expected e ON e.code=p.canonical_code));
${apply.length?'COMMIT':'ROLLBACK'};
`;
writeFileSync('governance/policy/reports/business-partner-target-catalog.dev.sql',sql);
const output=execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon','-At'],{input:sql,encoding:'utf8',maxBuffer:4000000});
const line=output.split('\n').filter(l=>l.startsWith('{'));
if(line.length!==1)throw Error('Missing catalog receipt');
const receipt=JSON.parse(line[0]);
writeFileSync(`governance/policy/reports/business-partner-target-catalog.${apply.length?'installed':'dry-run'}.dev.json`,JSON.stringify(receipt,null,2)+'\n');
console.log({applied:receipt.applied,permissions:receipt.permissions.length,protectedAuthorizationTables:receipt.protectedAuthorizationTables,grantsUnchanged:true,activationChanged:false});
