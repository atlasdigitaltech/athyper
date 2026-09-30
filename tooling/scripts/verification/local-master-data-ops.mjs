#!/usr/bin/env node
import {existsSync,readFileSync,writeFileSync,mkdirSync,statSync,renameSync,readdirSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createPlan} from '../../../deploy/stackctl/src/plan.mjs';
import {loadModel} from '../../../deploy/stackctl/src/model.mjs';
import {loadLocalMasterData,writeLocalMasterData,PRESERVED_LOCAL_ENV,preservedLocalPath,validatePreservedLocal} from '../../../deploy/stackctl/src/local-master-data.mjs';
import {inspectLocalKeys,rotateSigning} from './local-master-data-keys.mjs';
import {queueHealthSql,queueAlerts,retentionSql,PILOT_TENANT,LOCAL_TEMPLATE} from './local-master-data-retention.mjs';
const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url))),root=join(homedir(),'.athyper'),secrets=join(root,'instances/dev/secrets');
const [command='status',argument]=process.argv.slice(2),apply=process.argv.includes('--apply');
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',cwd:repo});if(r.status!==0)throw Error('Local Docker operation failed: '+(r.stderr||'').slice(0,500));return r.stdout.trim();}
function db(sql,write=false){const result=docker(['exec','-i','athyper-dev-db-1','psql','-U','postgres','-d','athyper_neon','-X','-At','-v','ON_ERROR_STOP=1'],`BEGIN ${write?'':'READ ONLY'}; ${write?"SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';":''} ${sql}; COMMIT;`);return result.split('\n').filter(v=>v&&v!=='BEGIN'&&v!=='COMMIT'&&v!=='SET').join('\n');}
function container(service){return JSON.parse(docker(['inspect','--format','{{json .}}','athyper-dev-'+service+'-1']));}
function receipt(name,value){const dir=join(root,'instances/dev/receipts');mkdirSync(dir,{recursive:true,mode:0o700});const path=join(dir,name+'.json'),temp=path+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(temp,path);}
function checkedProfile(){const profile=loadLocalMasterData(repo,root,loadModel(repo,'dev').instance);if(!profile)throw Error('Configure the persistent local profile first');for(const file of profile.secrets){const path=join(secrets,file);if((statSync(path).mode&0o077)!==0)throw Error('Local secrets must be owner-only');}return profile;}
function status(){
 const profile=checkedProfile(),keys=inspectLocalKeys(root),queue=JSON.parse(db(queueHealthSql())),alerts=queueAlerts(queue);
 const expectedRuntime=JSON.parse(docker(['image','inspect',profile.runtimeImage]))[0].Id,expectedNeon=JSON.parse(docker(['image','inspect',profile.neonImage]))[0].Id;
 const runtime=Object.fromEntries(['api','worker','scheduler','neon-web'].map(service=>{const c=container(service);return [service,{running:c.State.Running,health:c.State.Health?.Status??'unknown',image:c.Image}];}));
 if(keys.remainingDays<=14)alerts.push('signing_key_rotation_due');if(!keys.validNow)alerts.push('signing_key_not_currently_valid');
 for(const [service,state] of Object.entries(runtime)){if(!state.running||state.health!=='healthy')alerts.push(service+'_unhealthy');if(state.image!==(service==='neon-web'?expectedNeon:expectedRuntime))alerts.push(service+'_image_drift');}
 const apiEnv=container('api').Config.Env;
 if(!apiEnv.includes('LOCAL_CONTACT_CHALLENGE_KEY_ID='+keys.keyId))alerts.push('api_signer_key_id_drift');
 const value={checkedAt:new Date().toISOString(),environment:'local',keys,queue,runtime,alerts,status:alerts.length?'attention':'healthy'};receipt('local-master-data-health',value);return value;
}
if(command==='configure'){
 if(!apply)throw Error('Use configure --apply to retain the currently deployed local images and key ID');
 const api=container('api'),neon=container('neon-web'),keyId=api.Config.Env.find(v=>v.startsWith('LOCAL_CONTACT_CHALLENGE_KEY_ID='))?.split('=')[1];
 if(!api.Config.Env.includes('ATHYPER_ENV=local')||!api.Config.Env.includes('NOTIFICATION_CAPTURE=true'))throw Error('Expected running local capture API');
 const preserved={services:{},secrets:{}};
 for(const service of ['api','worker','scheduler','neon-web']){const c=container(service);preserved.services[service]={environment:Object.fromEntries(c.Config.Env.map(v=>{const at=v.indexOf('=');return [v.slice(0,at),v.slice(at+1)];}).filter(([k])=>PRESERVED_LOCAL_ENV.has(k)))};}
 if(existsSync(join(secrets,'publication-infisical-token'))){preserved.services.worker.secrets=['publication-infisical-token','publication-tls-certificate'];preserved.secrets={'publication-infisical-token':{file:join(secrets,'publication-infisical-token')},'publication-tls-certificate':{file:join(root,'platform/secrets/tls.crt')}};}
 const path=writeLocalMasterData(root,{runtimeImage:api.Image,neonImage:neon.Image,keyId,parameterRuntime:api.Config.Env.includes('WAVE0_CONTROL_ADMIN_PARAMETERS_ENABLED=true')});
 writeFileSync(preservedLocalPath(root),JSON.stringify(validatePreservedLocal(preserved,root),null,2)+'\n',{mode:0o600});
 inspectLocalKeys(root);console.log(JSON.stringify({status:'configured',path}));
} else if(command==='install-timer'){
 checkedProfile();if(!apply)throw Error('Use install-timer --apply');
 const dir=join(homedir(),'.config/systemd/user');mkdirSync(dir,{recursive:true});
 const script=fileURLToPath(import.meta.url);
 if(/[\n\r"]/.test(script+process.execPath))throw Error('Unsupported executable path');
 writeFileSync(join(dir,'athyper-local-master-data.service'),`[Unit]
Description=Local Athyper master-data retention and health
[Service]
Type=oneshot
ExecStart="${process.execPath}" "${script}" tick --apply
TimeoutStartSec=60
`);
 writeFileSync(join(dir,'athyper-local-master-data.timer'),'[Unit]\nDescription=Check local master-data every five minutes\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\nPersistent=true\n[Install]\nWantedBy=timers.target\n');
 for(const args of [['daemon-reload'],['enable','--now','athyper-local-master-data.timer'],['start','athyper-local-master-data.service']]){const r=spawnSync('systemctl',['--user',...args],{encoding:'utf8'});if(r.status)throw Error('User maintenance unit setup failed: '+r.stderr);}
 console.log(JSON.stringify({status:'installed',timer:'athyper-local-master-data.timer'}));
} else if(command==='pin-runtime'){
 const profile=checkedProfile();if(!apply||!argument||argument==='--apply')throw Error('Use pin-runtime IMAGE --apply after qualifying the image');
 const image=JSON.parse(docker(['image','inspect',argument]))[0].Id;
 writeLocalMasterData(root,{...profile,runtimeImage:image,parameterRuntime:JSON.parse(readFileSync(profile.path))['x-athyper-local-master-data'].parameterRuntime});
 console.log(JSON.stringify({status:'pinned',runtimeImage:image}));
} else if(command==='deploy-runtime'){
 checkedProfile();inspectLocalKeys(root);if(!apply)throw Error('Use deploy-runtime --apply for the four local application services');
 const plan=createPlan(repo,'dev',{runtimeRoot:root});
 const hash=createHash('sha256'),ddl=join(repo,'server/db/ddl');
 const visit=dir=>{for(const e of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(dir,e.name);if(e.isDirectory())visit(path);else if(e.isFile())hash.update(path.slice(ddl.length+1)).update('\0').update(readFileSync(path)).update('\0');}};visit(ddl);
 const env={...process.env,ATHYPER_RUNTIME_ROOT:root,ATHYPER_RUNTIME_UID:String(process.getuid()),ATHYPER_RUNTIME_GID:String(process.getgid()),ATHYPER_INSTANCE:'dev',ATHYPER_DOMAIN_SUFFIX:'dev.athyper.test',ATHYPER_DDL_SHA256:hash.digest('hex')};
 const args=['compose','--project-name','athyper-dev',...plan.sources.compose.flatMap(file=>['--file',file])];
 const check=spawnSync('docker',[...args,'config','--quiet'],{cwd:repo,env,stdio:'inherit'});if(check.status)throw Error('Compose validation failed');
 const result=spawnSync('docker',[...args,'up','--detach','--no-deps','--force-recreate','--wait','--wait-timeout','180','api','worker','scheduler','neon-web'],{cwd:repo,env,stdio:'inherit'});
 if(result.status)throw Error('Local runtime deployment failed');receipt('local-master-data-deployment',{completedAt:new Date().toISOString(),composeFiles:plan.sources.compose});
} else if(command==='status'||command==='tick'){
 checkedProfile();let maintenance;
 if(command==='tick'&&apply){maintenance=JSON.parse(db(`SELECT pg_advisory_xact_lock(hashtextextended('local-master-data-maintenance',0)); ${retentionSql()}`,true));receipt('local-master-data-retention',{completedAt:new Date().toISOString(),...maintenance});}
 const health=status();console.log(JSON.stringify({...health,...(maintenance?{maintenance}:{})}));if(health.alerts.length)process.exitCode=2;
} else if(command==='retention'){
 checkedProfile();if(!apply){console.log(JSON.stringify({policy:{challengeDays:7,encryptedLinkDays:7,rateWindowHours:24,batchSize:500},status:'dry_run',note:'Use --apply; active/leased deliveries are retained, audit/outbox untouched'}));}
 else {const result=JSON.parse(db(retentionSql(),true));receipt('local-master-data-retention',{completedAt:new Date().toISOString(),...result});console.log(JSON.stringify(result));}
} else if(command==='signing'){
 checkedProfile();if(!apply)throw Error('Signing changes require --apply');
 const api=container('api');if(argument==='retire'){const active=inspectLocalKeys(root);if(!api.State.Running||!api.Config.Env.includes('LOCAL_CONTACT_CHALLENGE_KEY_ID='+active.keyId))throw Error('The API must be running with the active signing key before retirement');}
 const result=rotateSigning(root,argument,{apiStopped:!api.State.Running});receipt('local-master-data-signing-rotation',result);console.log(JSON.stringify(result));
} else if(command==='delivery-key'){
 checkedProfile();if(!apply)throw Error('Delivery-key rotation requires --apply');
 if(container('api').State.Running||container('worker').State.Running)throw Error('Drain the queue, then stop API and worker before delivery-key rotation');
 if(JSON.parse(db(queueHealthSql())).pending!==0)throw Error('Pending deliveries still require the current encryption key');
 const backup=join(secrets,'local-contact-challenge-delivery-key.previous');if(existsSync(backup))throw Error('A previous delivery key is still retained; follow its retirement policy');
 const path=join(secrets,'local-contact-challenge-delivery-key');writeFileSync(backup,readFileSync(path),{mode:0o600,flag:'wx'});writeFileSync(path+'.tmp',randomBytes(32).toString('base64')+'\n',{mode:0o600});renameSync(path+'.tmp',path);
 const result={status:'rotated',rotatedAt:new Date().toISOString(),next:'Recreate API and worker; retain the owner-only previous key until seven-day encrypted-history retention and delivery acceptance complete'};receipt('local-master-data-delivery-key-rotation',result);console.log(JSON.stringify(result));
} else if(command==='retry'){
 checkedProfile();if(!/^[a-f0-9-]{36}$/i.test(argument??''))throw Error('A delivery UUID is required');
 const eligibility=`d.tenant_id='${PILOT_TENANT}' AND d.id='${argument}'::uuid AND d.message_id=m.id AND m.tenant_id=d.tenant_id AND m.template_key='${LOCAL_TEMPLATE}' AND c.id=m.entity_id AND c.tenant_id=m.tenant_id AND c.expires_at>now() AND c.consumed_at IS NULL AND d.status='failed' AND d.error_category='transient' AND d.attempt_count<d.max_attempts AND (d.locked_until IS NULL OR d.locked_until<=now())`;
 if(!apply)console.log(db(`SELECT jsonb_build_object('eligible',exists(SELECT 1 FROM event.notification_delivery d,event.notification_message m,master.local_contact_challenge c WHERE ${eligibility}))`));
 else {const result=db(`WITH changed AS (UPDATE event.notification_delivery d SET next_retry_at=now(),updated_at=now(),updated_by=d.created_by FROM event.notification_message m,master.local_contact_challenge c WHERE ${eligibility} RETURNING d.id) SELECT jsonb_build_object('rescheduled',count(*)) FROM changed`,true);console.log(result);}
} else throw Error('Commands: configure, install-timer, pin-runtime IMAGE, deploy-runtime, status, tick, retention, signing prepare|activate|rollback|retire, delivery-key, retry UUID');
