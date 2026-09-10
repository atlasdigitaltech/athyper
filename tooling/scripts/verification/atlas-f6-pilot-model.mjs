const liveGates=['personas','model-studio','model-neon','model-mesh','grounded','database','rollback','accessibility','second-entity'];
export function evaluateAtlasF6({receipts,currentImages,now=Date.now(),maxAgeMs=24*60*60*1000}){
 const blockers=[];const required=[...liveGates,'disposable-database'];
 const expected=new Map(currentImages.map(i=>[i.name,i.digest]));
 if(!currentImages.length)blockers.push('Current deployment bindings missing');
 for(const i of currentImages)if(i.health!=='healthy')blockers.push(`${i.name}: current service is not healthy`);
 for(const gate of required){
  const receipt=receipts[gate];
  if(!receipt){blockers.push(`${gate}: evidence missing`);continue;}
  if(receipt.passed!==true)blockers.push(`${gate}: ${receipt.blocker??receipt.blockers?.map(b=>b.message).join('; ')??'qualification incomplete'}`);
  const captured=Date.parse(receipt.observedAt);
  if(!Number.isFinite(captured)||captured>now+60_000||now-captured>maxAgeMs)blockers.push(`${gate}: evidence timestamp is stale or invalid`);
  if(liveGates.includes(gate)&&receipt.passed===true)for(const snapshot of [receipt.images,receipt.finalImages,receipt.restoredImages].filter(Boolean)){
   const actual=new Map(snapshot.map(i=>[i.name,i.digest]));
   if(snapshot.some(i=>i.health!=="healthy"))blockers.push(`${gate}: recorded service was not healthy`);
   for(const [name,digest]of expected)if(actual.get(name)!==digest)blockers.push(`${gate}: ${name} release binding changed`);
  }
  if(liveGates.includes(gate)&&receipt.passed===true&&!receipt.images)blockers.push(`${gate}: deployment bindings missing`);
 }
 if(receipts.database?.secondEntityReady!==true)blockers.push('second-entity: active Mesh network_relationship has no AI-enabled publication');
 if(receipts.rollback?.restored!==true)blockers.push('rollback: restoration not demonstrated');
 const policies=[receipts['model-studio']?.policyRevision,receipts['model-neon']?.policyRevision,receipts['model-mesh']?.policyRevision].filter(Boolean);
 if(new Set(policies).size>1)blockers.push('model policy bindings differ across planes');
 return {phase:'F6',scope:'DEV CirrusAtlantic Atlas pilot: BP and second-entity vertical',buildStatus:'implemented',status:blockers.length?'qualification_blocked':'qualified',passed:blockers.length===0,blockers:[...new Set(blockers)],gates:Object.fromEntries(required.map(g=>[g,receipts[g]?.passed===true?(blockers.some(b=>b.startsWith(g+':'))?'requalification_required':'passed'):'pending']))};
}
