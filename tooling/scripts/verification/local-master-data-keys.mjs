import {createPublicKey,generateKeyPairSync} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,unlinkSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {localMasterDataPath,writeLocalMasterData} from '../../../deploy/stackctl/src/local-master-data.mjs';
import {PILOT_TENANT} from './local-master-data-retention.mjs';
const secretRoot=root=>join(root,'instances/dev/secrets');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
function atomic(path,value){const temp=path+'.tmp';writeFileSync(temp,value,{mode:0o600});renameSync(temp,path);}
export function inspectLocalKeys(root,now=Date.now()) {
 const dir=secretRoot(root),trust=json(join(dir,'local-contact-challenge-trust'));
 const publicKey=createPublicKey(readFileSync(join(dir,'local-contact-challenge-private-key'))).export({type:'spki',format:'pem'}).toString();
 if(!Array.isArray(trust)||trust.length<1||trust.length>3)throw Error('Invalid local trust set');
 if(trust.some(k=>k.provider!=='athyper-local-challenge'||JSON.stringify(k.tenantIds)!==JSON.stringify([PILOT_TENANT])||JSON.stringify(k.planeKeys)!=='["neon"]'))throw Error('Local key scope mismatch');
 const matches=trust.filter(k=>k.publicKeyPem===publicKey);if(matches.length!==1)throw Error('Signer/trust mismatch');
 const active=matches[0],profile=json(localMasterDataPath(root));if(profile['x-athyper-local-master-data'].keyId!==active.keyId)throw Error('Profile/signing key ID mismatch');
 if(!Number.isFinite(Date.parse(active.notAfter))||!Number.isFinite(Date.parse(active.notBefore)))throw Error('Invalid key validity');
 return {keyId:active.keyId,trustKeyIds:trust.map(k=>k.keyId),expiresAt:active.notAfter,remainingDays:Math.floor((Date.parse(active.notAfter)-now)/86400000),validNow:Date.parse(active.notBefore)<=now&&Date.parse(active.notAfter)>now};
}
export function rotateSigning(root,phase,{now=Date.now(),apiStopped=false}={}) {
 const dir=secretRoot(root),rotation=join(dir,'local-contact-signing-rotation'),metaPath=join(rotation,'state.json');
 const privatePath=join(dir,'local-contact-challenge-private-key'),trustPath=join(dir,'local-contact-challenge-trust');
 const save=meta=>atomic(metaPath,JSON.stringify(meta,null,2)+'\n');
 if(phase==='prepare'){
  if(existsSync(rotation))throw Error('A signing rotation is already pending');
  const active=inspectLocalKeys(root,now),trust=json(trustPath);if(trust.length!==1)throw Error('Retire previous overlapping keys first');
  const pair=generateKeyPairSync('ed25519'),nextKeyId='local-contact-'+new Date(now).toISOString().replace(/[^0-9]/g,'');
  const next={...trust[0],keyId:nextKeyId,publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),notBefore:new Date(now-60000).toISOString(),notAfter:new Date(now+90*86400000).toISOString()};
  mkdirSync(rotation,{mode:0o700});atomic(join(rotation,'previous-private.pem'),readFileSync(privatePath));atomic(join(rotation,'next-private.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}));
  const meta={phase:'prepared',previousKeyId:active.keyId,nextKeyId,preparedAt:new Date(now).toISOString()};save(meta);atomic(trustPath,JSON.stringify([...trust,next],null,2)+'\n');return meta;
 }
 if(!existsSync(metaPath))throw Error('No signing rotation is pending');const meta=json(metaPath);
 const settings=json(localMasterDataPath(root));
 const updateProfile=keyId=>writeLocalMasterData(root,{runtimeImage:settings.services.api.image,neonImage:settings.services['neon-web'].image,keyId,parameterRuntime:settings['x-athyper-local-master-data'].parameterRuntime});
 if(phase==='activate'||phase==='rollback'){
  if(!apiStopped)throw Error('Stop the local API before switching signing files and key ID');
  if(!['prepared','activated','rolled_back'].includes(meta.phase))throw Error('Invalid rotation state');
  const forward=phase==='activate';atomic(privatePath,readFileSync(join(rotation,forward?'next-private.pem':'previous-private.pem')));updateProfile(forward?meta.nextKeyId:meta.previousKeyId);
  const result={...meta,phase:forward?'activated':'rolled_back',switchedAt:new Date(now).toISOString()};save(result);return result;
 }
 if(phase==='retire'){
  if(!['activated','rolled_back'].includes(meta.phase)||now-Date.parse(meta.switchedAt)<660000)throw Error('Keep overlapping verification keys for at least eleven minutes after switching');
  const active=inspectLocalKeys(root,now);atomic(trustPath,JSON.stringify(json(trustPath).filter(k=>k.keyId===active.keyId),null,2)+'\n');
  const result={...meta,phase:'retired',retiredAt:new Date(now).toISOString(),activeKeyId:active.keyId};
  for(const file of ['previous-private.pem','next-private.pem','state.json'])if(existsSync(join(rotation,file)))unlinkSync(join(rotation,file));rmdirSync(rotation);return result;
 }
 throw Error('Unknown signing rotation phase');
}
