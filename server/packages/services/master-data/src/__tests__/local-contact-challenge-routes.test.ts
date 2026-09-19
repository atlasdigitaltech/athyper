import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, expect, it, vi } from "vitest";
import { registerLocalContactChallengeRoutes } from "../local-contact-challenge-routes.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const servers: Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();})));});
async function fixture(authorized=true){
 const app=express();app.use(express.json());
 const request=vi.fn(async()=>({challengeId:'id',expiresAt:'expiry'})),complete=vi.fn(async()=>({contactId:'id',verified:true}));
 registerLocalContactChallengeRoutes(app,{authenticate:(_req,res,next)=>{if(!authorized)res.sendStatus(401);else next();},readContext:()=>({tenantId:'tenant',principalId:'principal',planeKey:'neon'}) as VerifiedRequestContext},{request,complete});
 const server=createServer(app);servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,request,complete};
}
const id='11111111-1111-4111-8111-111111111111';
it('GET cannot consume a challenge',async()=>{const f=await fixture();expect((await fetch(`${f.url}/api/master/verification-challenges/${id}/complete`)).status).toBe(404);expect(f.complete).not.toHaveBeenCalled();});
it('unauthenticated requests cannot send or complete',async()=>{const f=await fixture(false);for(const path of [`contacts/${id}/verification-challenges`,`verification-challenges/${id}/complete`])expect((await fetch(`${f.url}/api/master/${path}`,{method:'POST'})).status).toBe(401);expect(f.request).not.toHaveBeenCalled();expect(f.complete).not.toHaveBeenCalled();});
it('validates completion bodies and disables caching',async()=>{const f=await fixture();const result=await fetch(`${f.url}/api/master/verification-challenges/${id}/complete`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});expect(result.status).toBe(422);expect(result.headers.get('cache-control')).toBe('no-store');expect(f.complete).not.toHaveBeenCalled();});
it('request response does not expose a token',async()=>{const f=await fixture();const result=await fetch(`${f.url}/api/master/contacts/${id}/verification-challenges`,{method:'POST'});expect(result.status).toBe(202);expect(await result.json()).toEqual({challengeId:'id',expiresAt:'expiry'});});
