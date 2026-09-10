import {execFileSync}from'node:child_process';import{readFileSync,writeFileSync}from'node:fs';import{homedir}from'node:os';
const root=homedir()+'/.athyper/instances/dev/deployments/bp-release-19-isolated-20260910';
const run=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:2000000,stdio:['pipe','pipe','pipe']});
const args=['--network','athyper-bp-r19-isolated','--env-file',root+'/runtime.env','--mount','type=bind,src='+root+'/artifact.json,dst=/release/artifact.json,readonly','--mount','type=bind,src='+root+'/public-key.der,dst=/release/public-key.der,readonly','--no-healthcheck'];
if(process.argv.includes('--stage')){
 const env=readFileSync(root+'/runtime.env','utf8').replace(/(DATABASE_URL=postgresql:\/\/)athyper_runtime:/g,'$1postgres:');
 writeFileSync(root+'/stage.env',env,{mode:0o600});
 try{console.log(run(['run','--rm',...args,'--env-file',root+'/stage.env','-e','MODE=api','-e','ISOLATED_STAGE=true','athyper-bp-r19-isolated:20260910']));}catch(e){process.stderr.write((e.stderr?.toString()??e.message).slice(-5000));process.exit(1);}
}else{
 for(const mode of ['api','worker']){
  const name='athyper-bp-r19-'+mode;
  console.log({name,id:run(['run','-d','--name',name,...args,'-e','MODE='+mode,'athyper-bp-r19-isolated:20260910']).trim()});
 }
}
