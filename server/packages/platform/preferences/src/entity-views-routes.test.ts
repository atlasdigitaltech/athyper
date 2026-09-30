import express from "express";
import {it,expect} from "vitest";
import type {EntityListDescriptorV1} from "@athyper/contract-platform-entity-list";
import type {VerifiedRequestContext} from "@athyper/server-contract-auth";
import {registerEntityViewRoutes,validateViewState} from "./entity-views-routes.js";
import {createSavedViewService,type SavedViewRepository} from "./index.js";
const descriptor={entity:{identityField:"code"},fields:[{key:"code",sortable:true,groupable:false,filterOperators:["eq"]}],surface:{supportedModes:["table"]},limits:{maxSortLevels:3,allowedPageSizes:[10],defaultPageSize:10}} as unknown as EntityListDescriptorV1;
const state={columns:["code"],filters:[],sort:[],density:"compact",mode:"table"};
it("does not silently remove inaccessible filters and never saves search or scope",()=>{expect(validateViewState({...state,query:"private search",scopeCoordinate:{tenantId:"other"}},descriptor)).toEqual(state);expect(()=>validateViewState({...state,columns:["secret"]},descriptor)).toThrow();expect(()=>validateViewState({...state,filters:[{field:"secret",operator:"eq",value:"x"}]},descriptor)).toThrow();expect(()=>validateViewState({...state,sort:[{field:"secret",direction:"asc"}]},descriptor)).toThrow();});
it("authenticates view routes and validates collection access before storage",async()=>{
 let writes=0,allowed=false;const repository:SavedViewRepository={list:async()=>[],get:async()=>undefined,create:async()=>{writes++;},replace:async()=>undefined};
 const app=express();app.use(express.json());registerEntityViewRoutes(app,{authenticate:(req,res,next)=>{if(req.headers.authorization!=="test"){res.status(401).end();return;}next();},readContext:()=>({planeKey:"neon",tenantId:"tenant",principalId:"principal"} as VerifiedRequestContext),service:createSavedViewService(repository),descriptor:async()=>{if(!allowed)throw new TypeError("Collection access denied");return descriptor;}});
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.on("listening",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("No address");
 const url=`http://127.0.0.1:${address.port}/api/entity-runtime/partner/views?surface=app.manage.partner`;
 try{expect((await fetch(url)).status).toBe(401);expect((await fetch(url,{headers:{authorization:"test"}})).status).toBe(400);allowed=true;const post=(body:unknown)=>fetch(url,{method:"POST",headers:{authorization:"test","content-type":"application/json"},body:JSON.stringify(body)});expect((await post({action:"create",name:"Shared",visibility:"shared",state})).status).toBe(403);expect(writes).toBe(0);expect((await post({action:"create",name:"Mine",visibility:"personal",state})).status).toBe(201);expect(writes).toBe(1);expect((await post({action:"create",name:"Invalid",visibility:"personal",state:{...state,filters:[{field:"secret",operator:"eq",value:1}]}})).status).toBe(400);expect(writes).toBe(1);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
