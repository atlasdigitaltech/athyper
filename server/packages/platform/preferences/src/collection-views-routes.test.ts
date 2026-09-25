import express from 'express';
import {expect,it} from 'vitest';
import {createSavedViewService,type SavedView,type SavedViewRepository} from './index.js';
import {registerViewCollectionRoutes} from './entity-views-routes.js';
import type {VerifiedRequestContext} from '@athyper/server-contract-auth';
it('uses one saved-view service for collection imports, compatibility and optimistic updates',async()=>{
 const rows=new Map<string,SavedView>();let writes=0;let preference:unknown;
 const repository:SavedViewRepository={getPreference:async()=>preference,setPreference:async(_s,_c,_surface,value)=>{preference=value;},clearPreference:async()=>{preference=undefined;},list:async scope=>[...rows.values()].filter(v=>v.entityCode===scope.entityCode&&v.ownerPrincipalId===scope.principalId),get:async scope=>rows.get(scope.id),create:async(_plane,v)=>{rows.set(v.id,v);writes++;return v;},replace:async(_plane,v,version)=>{if(rows.get(v.id)?.version!==version)return;rows.set(v.id,{...v,version:version+1});return version+1;}};
 const app=express();app.use(express.json());const context={planeKey:'mesh',tenantId:'tenant',principalId:'reader'} as VerifiedRequestContext;
 const validate=(value:unknown)=>{const v=value as Record<string,unknown>;if(v?.schemaVersion!==1)throw new TypeError('Incompatible version');return v;};
 registerViewCollectionRoutes(app,{path:'/api/collections/:entityCode/views',surface:'activity_center',authenticate:(q,s,next)=>{if(q.headers.authorization!=='test'){s.sendStatus(401);return;}next();},readContext:()=>context,service:createSavedViewService(repository),descriptor:async(_c,key)=>{if(key!=='activity.inbox')throw new TypeError('Unknown provider');return {standardViews:[],validate};}});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const root=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/collections/activity.inbox/views`;
 const post=(body:unknown)=>fetch(root,{method:'POST',headers:{authorization:'test','content-type':'application/json'},body:JSON.stringify(body)});
 try{
  expect((await fetch(root)).status).toBe(401);
  const input={action:'create',name:'Imported',visibility:'personal',importKey:'stable-import',state:{schemaVersion:1,collection:{}}};
  const first=await (await post(input)).json();expect(first.createdId).toBeDefined();
  expect((await (await post(input)).json()).createdId).toBe(first.createdId);expect(writes).toBe(1);
  expect((await post({...input,importKey:'invalid',state:{schemaVersion:2}})).status).toBe(400);
  expect((await post({...input,importKey:undefined,visibility:'shared'})).status).toBe(403);
  expect((await post({action:"default",id:first.createdId,target:"personal"})).status).toBe(200);
  expect(preference).toEqual({viewId:first.createdId});
  expect((await post({action:"clear_default"})).status).toBe(200);expect(preference).toBeUndefined();
  expect((await post({action:'update',id:first.createdId,version:1,name:'Updated'})).status).toBe(200);
  expect((await post({action:'update',id:first.createdId,version:1,name:'Lost edit'})).status).toBe(409);
  expect((await fetch(root+'?surface=entity_list',{headers:{authorization:'test'}})).status).toBe(400);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
