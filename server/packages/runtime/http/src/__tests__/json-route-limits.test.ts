import {expect,it} from "vitest";
import {createHttpApplication} from "../http-runtime.js";
it("raises the JSON limit only for the explicit import POST and rejects oversized bodies",async()=>{
 const path="/api/neon/business-partner-imports";
 const app=createHttpApplication({openApi:false,jsonRouteLimits:[{method:"POST",path,maxBytes:512*1024}],configure(app){app.post([path,"/api/other"],(_req,res)=>{res.sendStatus(204);});}});
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
 const address=server.address();if(!address||typeof address==="string")throw Error("No listener");
 const send=(route:string,length:number)=>fetch(`http://127.0.0.1:${address.port}${route}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({value:"x".repeat(length)})});
 try{
  expect((await send(path,300*1024)).status).toBe(204);
  expect((await send(path+"/",300*1024)).status).toBe(204);
  expect((await send("/api/other",300*1024)).status).toBe(413);
  expect((await send(path,600*1024)).status).toBe(413);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
