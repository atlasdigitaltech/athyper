/** Frozen release-19 → classification-only DEV publication. Preparation prints apply_patch input. */
import {readFileSync,statSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
const root=process.cwd(),secrets='/home/chandravel_natarajan/.athyper/instances/dev/secrets';
const captured=JSON.parse(execFileSync('docker',['exec','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-Atc',`SELECT json_build_object('head',row_to_json(h),'payload',p.payload_json) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=h.applied_release_id WHERE h.publication_key='metadata.compiled_entity.business_partner' AND p.artifact_kind='compiled_entity_runtime'`],{encoding:'utf8',maxBuffer:4194304}));
const displayOnly=process.argv.includes('--display-labels');
const direct=process.argv.includes('--direct-unspsc');
const registration=process.argv.includes('--role-free');
const collectionLabels=process.argv.includes('--collection-labels');
const collections=process.argv.includes('--partner-collections') || collectionLabels;
if(captured.head.source_release_no!==(collectionLabels?24:collections?23:registration?22:direct?21:displayOnly?20:19) || captured.head.artifact_hash!==(collectionLabels?'2eb35c255a8a0a9e95159e48b0feda230f5ef7a786283a205d65aeb551a69433':collections?'ff39e5c625a74594887349c50c811da45356fb52b738773dcf7edf1c55145e21':registration?'dc5213fbd483a536b99cf232ae5eef28412b474ecaa2d2c3a050c12d55538e51':direct?'403c08d2c0e7aa26127bed0e06ab52df28b5a136b811705cc1dd495199365f62':displayOnly?'5fffa12d150d95b3513cbb58865873526cae86c4b47717ea7238cd952edc1a85':'202d9e22d322d64c2fb7a802db7d16705207ea7ac2ffa57fca2089d36235a96b'))throw Error('BASELINE_CHANGED');
const candidate=collectionLabels?'/tmp/athyper-bp-classification-r25':collections?'/tmp/athyper-bp-classification-r24':registration?'/tmp/athyper-bp-classification-r23':direct?'/tmp/athyper-bp-classification-r22':displayOnly?'/tmp/athyper-bp-classification-r21':'/tmp/athyper-bp-classification-r20';
if(process.argv.includes('--prepare')){
 const documents=captured.payload.artifacts.map(a=>structuredClone(a.content));
 if(collections){
  for(const key of ['business_partner/presentation.detail','business_partner/presentation.section.identity','business_partner/presentation.section.industries','business_partner/presentation.section.commodities','business_partner_industry_classification/core','business_partner_commodity_classification/core']){
   const doc=JSON.parse(readFileSync(root+'/metadata/entities/'+key+'.json','utf8'));
   const index=documents.findIndex(a=>a.artifactKey===key);if(index<0)documents.push(doc);else documents[index]=doc;
  }
 }else if(registration){ documents.push(JSON.parse(readFileSync(root+'/metadata/entities/business_partner_request/flow.partner.new.json','utf8')));
 }else if(displayOnly||direct){
  for(const key of ['business_partner_commodity_classification/core','business_partner/presentation.section.commodities'])
   documents[documents.findIndex(a=>a.artifactKey===key)]=JSON.parse(readFileSync(root+'/metadata/entities/'+key+'.json','utf8'));
 }else{
 for(const key of ['business_partner_commodity_classification/core','business_partner/presentation.section.commodities','business_partner/presentation.section.certificates'])
  documents.push(JSON.parse(readFileSync(root+'/metadata/entities/'+key+'.json','utf8')));
 const detail=documents.find(a=>a.artifactKey==='business_partner/presentation.detail');
 const source=JSON.parse(readFileSync(root+'/metadata/entities/business_partner/presentation.detail.json','utf8'));
 for(const section of ['commodities','certificates']){
  const entry=source.sections.find(s=>s.sectionKey===section);detail.sections.splice(section==='commodities'?2:detail.sections.findIndex(s=>s.sectionKey==='qualifications-certificates')+1,0,entry);
  detail.dependencies.push(entry.presentationRef.replace(/\.json$/,''));
  const keys=detail.navigation.tabs.find(t=>t.provider==='360').sectionKeys;keys.splice(section==='commodities'?keys.indexOf('identity')+1:keys.indexOf('qualifications-certificates')+1,0,section);
 }
 detail.sections.find(s=>s.sectionKey==='qualifications-certificates').label.defaultText='Qualifications';
 const q=documents.find(a=>a.artifactKey==='business_partner/presentation.section.qualifications-certificates');
 q.childCollections=q.childCollections.filter(c=>c.key==='qualifications');q.additionalCoreRefs=[];q.dependencies=['business_partner_qualification/core','business_partner_qualification/operation'];q.authorization.fieldPermissions=[];
 q.emptyState={title:'No commercial qualifications yet',detail:'Partner classifications are independent of commercial approval.'};
 }
 const release=structuredClone(captured.payload.release);
 for(const doc of documents)if(!release.artifacts.some(a=>a.artifactKey===doc.artifactKey))release.artifacts.push({artifactKey:doc.artifactKey,artifactType:doc.artifactType,entityCode:doc.entityCode,ref:doc.artifactKey+'.json',hash:doc.artifactHash});
 const patches=documents.map(doc=>[candidate+'/entities/'+doc.artifactKey+'.json',doc]);patches.push([candidate+'/entities/release.json',release]);
 const offset=Number(process.argv.find(a=>a.startsWith('--offset='))?.split('=')[1]??0);
 const count=Number(process.argv.find(a=>a.startsWith('--count='))?.split('=')[1]??1);
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(count)||count<1)throw Error('Invalid patch window');
 if(process.argv.includes('--count-only'))console.log(patches.length);
 else process.stdout.write('*** Begin Patch\n'+patches.slice(offset,offset+count).map(([path,value])=>'*** Add File: '+path+'\n'+JSON.stringify(value,null,2).split('\n').map(line=>'+'+line).join('\n')).join('\n')+'\n*** End Patch\n');
}else{
 function privateRead(path){const s=statSync(path);if(s.mode&0o077||s.uid!==process.getuid())throw Error('PRIVATE_FILE_REQUIRED');return readFileSync(path,'utf8');}
 const credentials=JSON.parse(privateRead(secrets+'/dev-publication/client.json'));
 const inspection=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
 const databaseUrl=new URL('postgresql://postgres@'+Object.values(inspection.NetworkSettings.Networks)[0].IPAddress+':5432/athyper_neon');databaseUrl.password=privateRead(secrets+'/postgres-password').trim();
 const input={credentials,databaseUrl:databaseUrl.toString(),candidateOutput:candidate,authoringRoot:root+'/metadata/entities',sourceDefinitionReleaseId:'cf773137-0b77-48ca-89ca-3d3c24c67933',expectedActiveArtifactHash:captured.head.artifact_hash,dryRun:!process.argv.includes('--apply')};
 const result=spawnSync('docker',['exec','-i','athyper-dev-source-worker-1','node','--import','tsx',root+'/tooling/scripts/local-dev/publish-scoped-dev-candidate.mts'],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:4194304});
 process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
}
