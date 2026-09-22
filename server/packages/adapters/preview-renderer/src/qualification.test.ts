import {expect,it,vi} from "vitest";
import {qualifyPreviewRenderer} from "./qualification.js";
import {createPreviewRendererAdapter} from "./preview-renderer-adapter.js";
it("does not qualify a healthy Gotenberg-style provider with no /render endpoint",async()=>{
 const fetch=vi.fn(async(input:string|URL|Request)=>String(input).endsWith('/health')?new Response('{}',{status:200}):new Response('not found',{status:404}));
 const renderer=createPreviewRendererAdapter({baseUrl:'http://gotenberg'},{fetch:fetch as typeof globalThis.fetch});
 expect(await renderer.health()).toMatchObject({status:'healthy'});
 await expect(qualifyPreviewRenderer(renderer)).rejects.toThrow('404');
});
it("rejects unbounded JSON output before decoding",async()=>{
 const renderer=createPreviewRendererAdapter({baseUrl:'http://renderer',maxOutputBytes:1},{fetch:vi.fn(async()=>new Response(' '.repeat(5000),{headers:{'content-type':'application/json'}})) as typeof globalThis.fetch});
 await expect(renderer.render({content:new Uint8Array([1]),sourceContentType:'image/png',renditionCode:'thumbnail_sm',specificationHash:'a'.repeat(64)})).rejects.toThrow();
});
it("requires PDF and first-page image signatures, not just a JSON success response",async()=>{
 const render=vi.fn(async()=>({bytes:new Uint8Array([1]),contentType:'application/pdf',width:1,height:1,pageNumber:1,provider:'fixture',providerVersion:'1',durationMs:0}));
 await expect(qualifyPreviewRenderer({render,health:async()=>({status:'healthy',latencyMs:0})})).rejects.toThrow('PDF qualification');
});
