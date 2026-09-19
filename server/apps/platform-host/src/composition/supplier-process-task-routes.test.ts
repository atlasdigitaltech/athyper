import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {it,expect,vi} from 'vitest';
import {mountSupplierProcessTasks} from './supplier-process-task-routes.js';
it('authenticates task routes and validates distinct command coordinates before dispatch',async()=>{
 const app=express();app.use(express.json());const decide=vi.fn(async()=>({receipt:{outcome:'pending'},replayed:false}));
 mountSupplierProcessTasks(app,{authenticate:(req,res,next)=>{if(req.headers.authorization!=='test-session'){res.status(401).end();return;}next();},readContext:()=>({tenantId:randomUUID(),principalId:randomUUID(),planeKey:'neon'}) as never,transactions:{run:async(_plane:unknown,_actor:unknown,work:(tx:never)=>Promise<unknown>)=>work({} as never)} as never,service:{view:async()=>({executions:[]}),start:async()=>({replayed:false}),decide} as never});
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{const address=server.address();if(!address||typeof address==='string')throw Error('Missing address');const path=`http://127.0.0.1:${address.port}/api/governance/process-tasks/cases/${randomUUID()}`;
 expect((await fetch(path+'/view')).status).toBe(401);
 const headers={authorization:'test-session','content-type':'application/json','Idempotency-Key':randomUUID()};
 const command={attemptId:randomUUID(),cycleTaskId:randomUUID(),workflowRequestId:randomUUID(),workflowStageId:randomUUID(),workItemId:randomUUID(),expectedWorkItemVersion:1,idempotencyKey:headers['Idempotency-Key'],action:'accept_review'};
 for(const invalid of [{...command,attemptId:'not-an-id'},{...command,expectedWorkItemVersion:0},{...command,action:'reject'},{...command,idempotencyKey:randomUUID()},{...command,profile:'simple'}])expect((await fetch(path+'/decide',{method:'POST',headers,body:JSON.stringify(invalid)})).status).toBe(400);
 expect(decide).not.toHaveBeenCalled();const accepted=await fetch(path+'/decide',{method:'POST',headers,body:JSON.stringify(command)});expect(accepted.status).toBe(200);expect(accepted.headers.get('cache-control')).toBe('no-store');expect(decide.mock.calls[0]?.[2]).toEqual(command);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
it('rejects forged interaction authority and dispatches only validated owning commands',async()=>{
 const app=express();app.use(express.json());
 const information=vi.fn(async()=>({state:'open'})),escalate=vi.fn(async()=>({mode:'reassign'})),editPreview=vi.fn(async()=>({status:'legacy'}));
 mountSupplierProcessTasks(app,{authenticate:(_req,_res,next)=>next(),readContext:()=>({tenantId:randomUUID(),principalId:randomUUID(),planeKey:'neon'}) as never,transactions:{run:async(_plane:unknown,_actor:unknown,work:(tx:never)=>Promise<unknown>)=>work({} as never)} as never,service:{information,escalate,editPreview} as never});
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{
  const address=server.address();if(!address||typeof address==='string')throw Error('Missing address');
  const path=`http://127.0.0.1:${address.port}/api/governance/process-tasks/cases/${randomUUID()}`;
  const headers={'content-type':'application/json','Idempotency-Key':randomUUID()};
  const base={attemptId:randomUUID(),workItemId:randomUUID(),expectedWorkItemVersion:1,idempotencyKey:headers['Idempotency-Key']};
  const post=(action:string,body:unknown)=>fetch(path+'/'+action,{method:'POST',headers,body:JSON.stringify(body)});
  for(const invalid of [{...base,action:'request',text:' '},{...base,action:'resolve',text:'approved'},{...base,action:'respond',text:'answer',respondentId:randomUUID()},{...base,action:'request',text:'question',idempotencyKey:randomUUID()}])expect((await post('information',invalid)).status).toBe(400);
  for(const invalid of [{...base,reason:''},{...base,reason:'Escalation',supervisorId:randomUUID()},{...base,reason:'Escalation',mode:'reassign'}])expect((await post('escalate',invalid)).status).toBe(400);
  for(const invalid of [{expectedVersion:1,proposedPayload:[],policyId:randomUUID()},{expectedVersion:0,proposedPayload:{}},{expectedVersion:1,proposedPayload:{},context:{principalId:randomUUID()}}])expect((await post('edit-preview',invalid)).status).toBe(400);
  expect(information).not.toHaveBeenCalled();expect(escalate).not.toHaveBeenCalled();expect(editPreview).not.toHaveBeenCalled();
  expect((await post('information',{...base,action:'request',text:'Please clarify'})).status).toBe(200);
  expect((await post('escalate',{...base,reason:'Supervisor expertise required'})).status).toBe(200);
  expect((await post('edit-preview',{expectedVersion:1,proposedPayload:{website:'https://example.invalid'}})).status).toBe(200);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
