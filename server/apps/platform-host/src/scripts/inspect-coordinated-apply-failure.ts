import {randomUUID} from 'node:crypto';
import {bootstrap} from '../kernel/bootstrap.js';
import {runWithRequestContext} from '@athyper/server-foundation/context';
const host=await bootstrap('worker');
try {
 const orchestrator=host.container.services.publication?.orchestrators.studio;
 if(!orchestrator)throw Error('Studio orchestrator required');
 const observed: {code?:string;message:string}[]=[];
 // Observe errors before the orchestrator's failure recorder can mask them.
 // All original calls, identities, transaction semantics and guards are retained.
 const original=(orchestrator as any).authorityDatabase;
 (orchestrator as any).authorityDatabase=new Proxy(original,{get(target,key){
  if(key==='transaction')return()=>{const builder=target.transaction();return new Proxy(builder,{get(b,k){
   if(k==='execute')return(fn:any)=>b.execute(async(tx:any)=>{try{return await fn(tx);}catch(e:any){observed.push({code:e.code,message:e.message});throw e;}});
   const v=Reflect.get(b,k);return typeof v==='function'?v.bind(b):v;
  }});};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;
 }});

 try{await runWithRequestContext({requestId:randomUUID(),planeKey:'studio',tenantId:'11111111-1111-4111-8111-111111111111',principalId:'f3736ab2-fd72-5fe4-8f6b-e12083af851d'},()=>orchestrator.deploy('01a0fe8e-6dc0-737f-9207-49db73fd985c'));
 console.log(JSON.stringify({schema:'athyper.coordinated-apply-diagnostic/1',applied:true}));}
 catch(error){const errors=[];for(let e:any=error;e;e=e.cause){errors.push({name:e.name,code:e.code,message:e.message,step:e.step});if(errors.length>6)break;}console.log(JSON.stringify({schema:'athyper.coordinated-apply-diagnostic/1',observed,errors}));}
}finally{await host.lifecycle.shutdown('apply_diagnostic_complete');}
