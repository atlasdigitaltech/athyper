/** Credentials travel privately on stdin, never command arguments, logs or reports. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const c=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(c.Config.Labels['com.docker.compose.project'],'athyper-dev');assert.equal(c.State.Running,true);
const env=Object.fromEntries(c.Config.Env.map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
const file=c.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;assert.ok(file?.includes('/.athyper/instances/dev/secrets/'));
const url=new URL(`postgresql://${Object.values(c.NetworkSettings.Networks)[0].IPAddress}/athyper_studio`);url.username=env.POSTGRES_USER;url.password=readFileSync(file,'utf8').trim();
const script=`const fs=require('fs'),cp=require('child_process');
const pid=fs.readdirSync('/proc').find(p=>/^\\d+$/.test(p)&&(()=>{try{const c=fs.readFileSync('/proc/'+p+'/cmdline','utf8');return c.includes('src/main.ts')&&!c.includes('/bin/sh')}catch{return false}})());
const env=Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]}));
env.QUALIFICATION_DATABASE_URL=${JSON.stringify(url.toString())};
const r=cp.spawnSync('node',['--import','tsx','server/apps/platform-host/scripts/operations/rehearse-recovery-compiler.ts'],{cwd:'/home/chandravel_natarajan/src/athyper',env,encoding:'utf8'});
for(const line of r.stdout.split('\\n'))if(line.includes('athyper.recovery-compiler-rehearsal/1'))console.log(line);
if(r.status)console.log(JSON.stringify({exit:r.status}));process.exitCode=r.status;`;
const result=spawnSync('docker',['exec','-i','athyper-dev-source-worker-1','node'],{input:script,encoding:'utf8'});process.stdout.write(result.stdout);if(result.status)process.exitCode=result.status;
