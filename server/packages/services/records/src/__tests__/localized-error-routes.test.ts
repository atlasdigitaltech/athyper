import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import { afterEach, expect, it } from "vitest";
import { HttpError, sendProblem } from "@athyper/server-runtime-http";
import { registerEntityListRoutes } from "../entity-list-routes.js";
import { registerRecordsRoutes } from "../records-routes.js";
import { RecordServiceError } from "../errors.js";
import { validateFilterValue } from "../filter-value-validation.js";
import { MAX_LIST_FILTERS } from "../list-limits.js";

const servers: Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))));});
it.each(["/api/records/country","/api/entity-runtime/country/list"])("preserves stable code, safe parameters and fallback detail through %s",async path=>{
  const app=express();
  const list=async()=>{throw new RecordServiceError(400,"TOO_MANY_FILTERS",`At most ${MAX_LIST_FILTERS} filters are supported`,{max:MAX_LIST_FILTERS});};
  const common={authenticate:(_req:unknown,_res:unknown,next:()=>void)=>next(),readContext:()=>({}) as never};
  registerEntityListRoutes(app,{...common,lists:{list} as never});
  registerRecordsRoutes(app,{...common,queries:{list} as never,mutations:{} as never});
  app.use(((error,req,res,_next)=>sendProblem(res,req,error instanceof HttpError?error:new HttpError(500,"UNEXPECTED","Unexpected failure"))) satisfies ErrorRequestHandler);
  const server=await new Promise<Server>(resolve=>{const server=app.listen(0,"127.0.0.1",()=>resolve(server));});servers.push(server);
  const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}${path}`);
  expect(response.status).toBe(400);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  expect(await response.json()).toMatchObject({code:"TOO_MANY_FILTERS",detail:`At most ${MAX_LIST_FILTERS} filters are supported`,errors:{params:{max:MAX_LIST_FILTERS}}});
});
it("malformed-filter parameters identify the field and operator without reflecting the submitted value",()=>{
  expect(()=>validateFilterValue({field:"name",operator:"contains",value:{secret:"must-not-be-reflected"}} as never)).toThrowError(expect.objectContaining({code:"INVALID_FILTER_VALUE",params:{field:"name",operator:"contains"}}));
});
