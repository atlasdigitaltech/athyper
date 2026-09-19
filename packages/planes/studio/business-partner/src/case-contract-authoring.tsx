"use client";
import {useMemo,useRef,useState} from "react";
import {ApiTransportError,createOperation,encodePathSegment} from "@athyper/platform-api-client";
import {readBrowserCsrfToken,useApiClient,usePermissions} from "@athyper/platform-shell-app-foundation";
import {createDefinitionCommandKeys} from "./definition-client";
const root="/api/studio/business-partner-case-contracts";
type Revision={id:string;contractHash:string;createdBy:string;previousContractId:string;contract:unknown};
const simulate=createOperation<{compatible:boolean;contractHash:string},unknown>({method:"POST",path:`${root}/simulations`});
const author=createOperation<Revision,unknown>({method:"POST",path:root,idempotency:"required"});
const read=createOperation<Revision>({method:"GET",path:({id})=>`${root}/${encodePathSegment(String(id))}`});
const publish=createOperation<{release:{id:string;status:string};jobId:string},unknown>({method:"POST",path:({id})=>`${root}/${encodePathSegment(String(id))}/publish`,idempotency:"required"});
export function BusinessPartnerCaseContractAuthoring(){
 const grants=usePermissions();
 const http=useApiClient(),keys=useMemo(()=>createDefinitionCommandKeys(),[]),lock=useRef(false);
 const [packet,setPacket]=useState(""),[revisionId,setRevisionId]=useState(""),[review,setReview]=useState<Revision>(),[simulation,setSimulation]=useState<string>(),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[needsMfa,setNeedsMfa]=useState(false),[receipt,setReceipt]=useState("");
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNeedsMfa(false);try{await work();}catch(e){setNeedsMfa(e instanceof ApiTransportError&&e.status===403&&grants.has("studio.business_partner_definition.publish"));setError(e instanceof Error?e.message:"Case contract command failed");}finally{lock.current=false;setBusy(false);}}
 function draft(){return {bundle:JSON.parse(packet),targetPlanes:["neon"]};}
 return <section aria-labelledby="case-contract-heading"><h2 id="case-contract-heading">Case contract publication</h2>
 <p>Publish the NEON case schema separately from the onboarding definition. A different reviewer must approve the saved revision.</p>
 <fieldset disabled={busy||!grants.has("studio.business_partner_definition.author")}><legend>Author case contract</legend>
 <label>Case contract review packet JSON<textarea rows={12} style={{width:"100%"}} value={packet} onChange={e=>{setPacket(e.target.value);setSimulation(undefined);setReceipt("");}} /></label>
 <button type="button" onClick={()=>void run(async()=>{const result=await http.request(simulate,{body:draft()});setSimulation(result.contractHash);})}>Validate case contract</button>
 <button type="button" disabled={!simulation} onClick={()=>void run(async()=>{const body=draft(),saved=await http.request(author,{body,idempotencyKey:keys("case-author",body)});setRevisionId(saved.id);setReview(undefined);setConfirmed(false);setReceipt(`Saved revision: ${saved.id}. Contract hash: ${saved.contractHash}`);})}>Save immutable case contract</button>
 {simulation?<p>Compatible schema: {simulation}. Validation does not authorize publication.</p>:null}
 </fieldset>
 <fieldset disabled={busy}><legend>Independent case contract review</legend>
 <label>Case contract revision ID<input value={revisionId} onChange={e=>{setRevisionId(e.target.value);setReview(undefined);setConfirmed(false);}} /></label>
 <button type="button" onClick={()=>void run(async()=>{setReview(undefined);setConfirmed(false);setReview(await http.request(read,{params:{id:revisionId}}));})}>Load case contract for review</button>
 {review?<><p>Author: {review.createdBy} · Source contract: {review.previousContractId} · Hash: {review.contractHash}</p><pre style={{overflowX:"auto"}}>{JSON.stringify(review.contract,null,2)}</pre></>:null}
 <label><input type="checkbox" checked={confirmed} disabled={!review} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed this immutable case contract and approve publication to NEON.</label>
 <button type="button" disabled={!review||!confirmed||!grants.has("studio.business_partner_definition.publish")} onClick={()=>void run(async()=>{const id=review!.id,body={minimumRuntimeVersion:"1.0.0"},result=await http.request(publish,{params:{id},body,idempotencyKey:keys("case-publish",{id,body})});setReceipt(`Release ${result.release.id}: ${result.release.status}. Compilation job: ${result.jobId}. Consumer activation is pending.`);})}>Approve and queue case contract</button>
 </fieldset>{grants.has("studio.business_partner_definition.publish")?<form method="post" action={`/api/auth/step-up/start?returnTo=${encodeURIComponent(typeof window!=="undefined"?window.location.pathname:"/mdg/business-partner/publication")}`}><input type="hidden" name="csrfToken" value={readBrowserCsrfToken()??""}/><p>{needsMfa?"Publishing was denied because elevated assurance is required.":"Publishing requires elevated assurance."}</p><button type="submit">Verify with MFA</button></form>:null}{error?<p role="alert">{error}</p>:null}{receipt?<p role="status">{receipt}</p>:null}
 </section>;
}
