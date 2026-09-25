import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

export function configureDevProtectedValues(config, root=join(homedir(),'.athyper/instances/dev/secrets')) {
 const path=join(root,'protected-values-environment.json');
 if(!existsSync(path))return;
 const refs=JSON.parse(readFileSync(path,'utf8'));
 if(refs.PROTECTED_VALUES_INFISICAL_ENVIRONMENT!=='dev'||refs.PROTECTED_VALUES_INFISICAL_URL!=='https://secrets.dev.athyper.test:8443'||refs.PROTECTED_VALUES_INFISICAL_SECRET_PATH!=='/')throw Error('Invalid DEV protected-value coordinates');
 const service=config.services.api;
 if(!service)return;
 service.environment??={};
 for(const key of ['URL','WORKSPACE_ID','ENVIRONMENT','SECRET_PATH']){
   const name='PROTECTED_VALUES_INFISICAL_'+key;
   if(typeof refs[name]!=='string'||!refs[name])throw Error('Incomplete DEV protected-value coordinates');
   service.environment[name]=refs[name];
 }
 service.environment.PROTECTED_VALUES_INFISICAL_TOKEN_FILE='/run/secrets/protected-values-infisical-token';
 service.volumes=(service.volumes??[]).filter(m=>m.target!=='/run/secrets/protected-values-infisical-token');
 service.volumes.push({type:'bind',source:join(root,'protected-values-infisical-token'),target:'/run/secrets/protected-values-infisical-token',read_only:true});
}
