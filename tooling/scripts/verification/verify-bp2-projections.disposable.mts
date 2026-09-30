import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readCrosswalkEvidence} from '../../../server/packages/services/master-data/src/business-partner-crosswalk-evidence.ts';
import {readBusinessPartner360CommonSection,readBusinessPartner360RestrictedTaxValue} from '../../../server/packages/services/master-data/src/business-partner/record/section-readers';
import {readBusinessPartner360CommercialControlSection} from '../../../server/packages/services/master-data/src/business-partner/banking/controls-reader';
const require=createRequire(new URL('../../../server/db/package.json',import.meta.url));
const {Pool}=require('pg');
const {Kysely,PostgresDialect,sql}=createRequire(new URL('../../../server/packages/services/master-data/package.json',import.meta.url))('kysely');
const container=JSON.parse(execFileSync('docker',['inspect','athyper-bp2-acceptance-20260923'],{encoding:'utf8'}))[0];
assert.equal(container.Config.Labels['athyper.environment'],'disposable_local');
assert.equal(container.Config.Labels['athyper.purpose'],'bp2-acceptance');
const port=container.NetworkSettings.Ports['5432/tcp'][0];assert.equal(port.HostIp,'127.0.0.1');
const password=container.Config.Env.find((x:string)=>x.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
const db=new Kysely({dialect:new PostgresDialect({pool:new Pool({host:'127.0.0.1',port:Number(port.HostPort),database:'athyper_neon',user:'postgres',password})})});
const rollback=Error('intentional rollback');const checks:string[]=[];
try {
 await db.transaction().execute(async(tx:any)=>{
  const owner=(await sql`SELECT bp.id,bp.tenant_id,p.id principal_id FROM master.business_partner bp JOIN master.principal p ON p.tenant_id=bp.tenant_id AND p.code='catl.admin' WHERE bp.tenant_id='44444444-4444-4444-8444-444444444444' ORDER BY bp.id LIMIT 1`.execute(tx)).rows[0];assert.ok(owner);
  const t=owner.tenant_id,p=owner.principal_id,bp=owner.id,id=randomUUID(),tax=randomUUID(),jurisdiction=randomUUID(),token='tax:'+randomUUID();
  await sql`SELECT set_config('app.current_tenant_id',${t},true),set_config('app.current_principal_id',${p},true),set_config('app.current_actor_type','user',true)`.execute(tx);
  await sql`INSERT INTO master.tax_jurisdiction(id,tenant_id,code,name,country_code,jurisdiction_type,status,created_by) VALUES(${jurisdiction}::uuid,${t}::uuid,'BP2_PROJECTION_TEST','Synthetic projection test','MY','country','active',${p}::uuid)`.execute(tx);
  await sql`INSERT INTO master.business_partner_identifier(id,tenant_id,business_partner_id,scheme_code,identifier_value,status,metadata,created_by) VALUES(${id}::uuid,${t}::uuid,${bp}::uuid,'business_registration','SYNTHETIC-IDENTIFIER-RAW','active','{"maskedValue":"****TEST"}'::jsonb,${p}::uuid)`.execute(tx);
  await sql`INSERT INTO master.business_partner_tax_registration(id,tenant_id,business_partner_id,jurisdiction_id,registration_type_code,registration_number,status,metadata,created_by) VALUES(${tax}::uuid,${t}::uuid,${bp}::uuid,${jurisdiction}::uuid,'taxpayer_id',${'A'.repeat(64)},'active',${JSON.stringify({protected:true,protectedValueToken:token,maskedValue:'****TAX'})}::jsonb,${p}::uuid)`.execute(tx);
  const valid=randomUUID(),expired=randomUUID(),future=randomUUID();
  const related=randomUUID(),relation=randomUUID(),governance=randomUUID();
  await sql`INSERT INTO master.business_partner(id,tenant_id,code,name,category_locked_by,created_by) VALUES(${related}::uuid,${t}::uuid,'BP2.PROJECTION.RELATED','Synthetic related partner',${p}::uuid,${p}::uuid)`.execute(tx);
  await sql`INSERT INTO master.business_partner_relationship(id,tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,status,created_by,created_at) VALUES(${relation}::uuid,${t}::uuid,${bp}::uuid,${related}::uuid,'affiliate','active',${p}::uuid,clock_timestamp()-interval '10 seconds')`.execute(tx);
  await sql`INSERT INTO master.business_partner_governance_relation(id,tenant_id,business_partner_id,relation_type_code,member_name,member_type,status,created_by) VALUES(${governance}::uuid,${t}::uuid,${bp}::uuid,'director','Synthetic director','individual','active',${p}::uuid)`.execute(tx);
  for(let n=0;n<3;n++) {
    const hidden=randomUUID();
    await sql`INSERT INTO master.business_partner(id,tenant_id,code,name,category_locked_by,created_by) VALUES(${hidden}::uuid,${t}::uuid,${'BP2.HIDDEN.'+n},'Hidden pagination counterpart',${p}::uuid,${p}::uuid)`.execute(tx);
    await sql`INSERT INTO master.business_partner_relationship(tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,status,created_by) VALUES(${t}::uuid,${bp}::uuid,${hidden}::uuid,'affiliate','active',${p}::uuid)`.execute(tx);
  }
  for(const [cert,from,until] of [[valid,'2026-09-01','2026-10-01'],[expired,'2026-08-01','2026-09-23'],[future,'2026-10-01','2026-11-01']])
   await sql`INSERT INTO master.certification(id,tenant_id,owner_type,owner_id,custom_name,effective_from,effective_until,created_by) VALUES(${cert}::uuid,${t}::uuid,'business_partner',${bp}::uuid,'Synthetic projection certificate',${from}::date,${until}::date,${p}::uuid)`.execute(tx);
  const evidence=new Map<string,string>();
  for(const cert of [valid,expired]) {
   const series=randomUUID(),attachment=randomUUID();evidence.set(cert,attachment);
   await sql`INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES(${series}::uuid,${t}::uuid,${p}::uuid)`.execute(tx);
   await sql`INSERT INTO document.attachment(id,tenant_id,series_id,file_name,content_type,size_bytes,sha256,storage_bucket,storage_key,status,is_active,is_virus_scanned,uploaded_by,created_by) VALUES(${attachment}::uuid,${t}::uuid,${series}::uuid,'synthetic-certificate.pdf','application/pdf',4,repeat('b',64),'synthetic-no-object','synthetic-no-object','active',true,true,${p}::uuid,${p}::uuid)`.execute(tx);
   await sql`UPDATE document.attachment_series SET current_attachment_id=${attachment}::uuid WHERE id=${series}::uuid`.execute(tx);
   await sql`UPDATE master.certification SET document_attachment_id=${attachment}::uuid WHERE id=${cert}::uuid`.execute(tx);
  }
  await sql`SET LOCAL ROLE athyperapp`.execute(tx);
  for (const kind of ['commodity','industry'] as const) {
    const table=sql.table(`shared.${kind}_crosswalk`);
    const source=(await sql`SELECT source_domain_code,source_code FROM ${table} WHERE is_active ORDER BY id LIMIT 1`.execute(tx)).rows[0];
    assert.ok(source, `${kind} crosswalk seed required`);
    const coordinates=[{domainCode:source.source_domain_code,code:source.source_code}];
    const rows=await readCrosswalkEvidence(tx,kind,coordinates);
    assert.ok(rows.length>0);
    assert.ok(rows.every(row=>row.readOnly&&((row.sourceDomainCode===coordinates[0].domainCode&&row.sourceCode===coordinates[0].code)||(row.targetDomainCode===coordinates[0].domainCode&&row.targetCode===coordinates[0].code))&&row.targetName&&row.provenance));
    const incoming=await readCrosswalkEvidence(tx,kind,[{domainCode:rows[0].targetDomainCode,code:rows[0].targetCode}]);
    assert.deepEqual(incoming.find(row=>row.id===rows[0].id),rows[0]);
    assert.ok(rows.every(row=>row.confidence===null||typeof row.confidence==='number'));
    assert.deepEqual(await readCrosswalkEvidence(tx,kind,[{domainCode:'invalid-domain',code:source.source_code}]),[]);
    await sql`RESET ROLE`.execute(tx);
    await sql`UPDATE ${table} SET status='deprecated' WHERE id=${rows[0].id}::uuid`.execute(tx);
    await sql`SET LOCAL ROLE athyperapp`.execute(tx);
    assert.ok(!(await readCrosswalkEvidence(tx,kind,coordinates)).some(row=>row.id===rows[0].id));
    checks.push(`${kind} crosswalk evidence preserves direction/domain/confidence/provenance and excludes inactive mappings`);
  }
  const input={tenantId:t,businessPartnerId:bp,principalId:p,category:'organization' as const,sectionCode:'identifiers-tax' as const,asOf:'2026-09-23',limit:101,cursor:{snapshotAt:new Date(Date.now()+1000).toISOString()}};
  const masked=await readBusinessPartner360CommonSection({...input,taxVisible:true},tx);
  const filteredPage=await readBusinessPartner360CommonSection({...input,limit:1,sectionCode:'network',governanceVisible:false,authorizeRelatedPartner:async(id:string)=>id===related},tx);
  assert.ok(filteredPage.items.some((x:any)=>x.id===relation));
  checks.push('Network pagination scans past denied counterpart rows to return authorized older records');
  const network=await readBusinessPartner360CommonSection({...input,sectionCode:'network',governanceVisible:true,authorizeRelatedPartner:async target=>target===related},tx);
  assert.ok(network.items.some((x:any)=>x.id===relation&&x.kind==='relationship'&&x.targetBusinessPartnerId===related));
  assert.ok(network.items.some((x:any)=>x.id===governance&&x.kind==='governance'));
  const inverse=await readBusinessPartner360CommonSection({...input,businessPartnerId:related,sectionCode:'network',governanceVisible:false,authorizeRelatedPartner:async target=>target===bp},tx);
  assert.ok(inverse.items.some((x:any)=>x.id===relation&&x.direction==='incoming'&&x.readOnly===true&&x.sourceBusinessPartnerId===bp&&x.targetBusinessPartnerId===related));
  const deniedNetwork=await readBusinessPartner360CommonSection({...input,sectionCode:'network',governanceVisible:false,authorizeRelatedPartner:async()=>false},tx);
  assert.equal(deniedNetwork.items.length,0);checks.push('local directed relationships and separate governance projection respect related-parent and identity permission');
  assert.ok(masked.items.some((x:any)=>x.id===id&&x.maskedValue==='****TEST'&&!x.revealable));
  assert.ok(masked.items.some((x:any)=>x.id===tax&&x.maskedValue==='****TAX'));
  assert.ok(!JSON.stringify(masked).includes(token));assert.ok(!JSON.stringify(masked).includes('SYNTHETIC-IDENTIFIER-RAW'));
  checks.push('authorized repository masked identifier/tax reads exclude raw values and tokens');
  const deniedTax=await readBusinessPartner360CommonSection({...input,taxVisible:false},tx);
  assert.ok(!deniedTax.items.some((x:any)=>x.kind==='tax'));checks.push('tax field denial suppresses tax query/result');
  const restricted=await readBusinessPartner360RestrictedTaxValue({tenantId:t,businessPartnerId:bp,taxRegistrationId:tax},tx);
  assert.equal(restricted?.tokenOrValue,token);assert.equal(restricted?.protected,true);checks.push('restricted reader returns opaque token, not hash');
  await sql`SELECT audit.append_event(p_event_code:='business_partner.tax_registration.revealed',p_operation:='execute',p_entity_type:='business_partner_tax_registration',p_entity_id:=${tax}::uuid,p_outcome:='success',p_context:='{"purpose":"acceptance.synthetic"}'::jsonb)`.execute(tx);
  checks.push('tax reveal audit contract admitted under application role');
  const certificates=await readBusinessPartner360CommercialControlSection({tenantId:t,businessPartnerId:bp,sectionCode:'qualifications-certificates',asOf:'2026-09-23',historical:false} as any,tx);
  const list=(certificates.data as any).certifications;
  assert.ok(list.some((x:any)=>x.id===valid));assert.ok(!list.some((x:any)=>x.id===expired||x.id===future));checks.push('effective certificate included; expired/future certificates excluded');
  assert.equal(list.find((x:any)=>x.id===valid).attachment.attachmentId,evidence.get(valid));
  const files=await readBusinessPartner360CommonSection({...input,sectionCode:'attachments',certificateVisible:true},tx);
  assert.ok(files.items.some((x:any)=>x.attachmentId===evidence.get(valid)));
  assert.ok(!files.items.some((x:any)=>x.attachmentId===evidence.get(expired)));
  const noCertificate=await readBusinessPartner360CommonSection({...input,sectionCode:'attachments',certificateVisible:false},tx);
  assert.ok(!noCertificate.items.some((x:any)=>[...evidence.values()].includes(x.attachmentId)));
  const wrongParent=await readBusinessPartner360CommonSection({...input,businessPartnerId:randomUUID(),sectionCode:'attachments',certificateVisible:true},tx);
  assert.equal(wrongParent.items.length,0);
  checks.push('certificate evidence visible only for current certificate, admitted certificate permission and matching parent');
  throw rollback;
 });
} catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
console.log(JSON.stringify({checks,rolledBack:true,liveJourney:false}));
