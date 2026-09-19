import type { Server } from "node:http";
import express from "express";
import { afterEach, expect, it, vi } from "vitest";
import { registerWorkforceRoutes } from "../workforce-routes.js";
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();})));});
it.each(["prefix-11111111-1111-4111-8111-111111111111","11111111-1111-4111-8111-111111111111-suffix"])("rejects UUID substrings in workforce paths: %s",async id=>{
  const app=express(),get=vi.fn();
  registerWorkforceRoutes(app,{authenticate:(_req,_res,next)=>next(),readContext:()=>({planeKey:"neon"} as never),service:new Proxy({}, {get:()=>get}) as Parameters<typeof registerWorkforceRoutes>[1]["service"]});
  const server=app.listen(0,"127.0.0.1");servers.push(server);
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/neon/workforce/${id}`);
  expect(response.status).toBe(400);expect(get).not.toHaveBeenCalled();
});

import { createBusinessPartnerInvitationExternalGuard } from "../business-partner-invitation-routes.js";
it("does not let invitation callers reset their rate limit by changing User-Agent",()=>{
  let now=0;
  const guard=createBusinessPartnerInvitationExternalGuard({limit:1,windowMs:1000,now:()=>now});
  const response={status:vi.fn().mockReturnThis(),json:vi.fn(),setHeader:vi.fn()};
  const request=(agent:string)=>({ip:"127.0.0.1",headers:{"user-agent":agent}} as express.Request);
  const next=vi.fn();
  guard(request("first"),response as unknown as express.Response,next);
  guard(request("second"),response as unknown as express.Response,next);
  expect(next).toHaveBeenCalledTimes(1);expect(response.status).toHaveBeenCalledWith(429);
  now=1000;
  guard(request("third"),response as unknown as express.Response,next);
  expect(next).toHaveBeenCalledTimes(2);
});


import { registerBusinessPartner360Routes } from "../business-partner-360-routes.js";
it.each(["2026-02-30","2026-13-01"])("rejects impossible Business Partner 360 dates: %s",async asOf=>{
  const app=express(),read=vi.fn();
  registerBusinessPartner360Routes(app,{authenticate:(_req,_res,next)=>next(),readContext:()=>({planeKey:"neon"} as never),service:new Proxy({}, {get:()=>read}) as Parameters<typeof registerBusinessPartner360Routes>[1]["service"]});
  const server=app.listen(0,"127.0.0.1");servers.push(server);
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/neon/business-partners/11111111-1111-4111-8111-111111111111/360/summary?asOf=${asOf}`);
  expect(response.status).toBe(400);expect(read).not.toHaveBeenCalled();
});
