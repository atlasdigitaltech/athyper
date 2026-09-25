"use client";
import {useEffect,useMemo,useState} from "react";
import {useApiClient,useSessionIdentity} from "@athyper/platform-shell-app-foundation";
import {BusinessPartnerPageFrame} from "./page-frame";
import {Banking} from "./banking/bank-accounts";
import {createBusinessPartner360CommercialClient} from "@athyper/product-neon-entity-extensions/business-partner/clients/business-partner-360-commercial-client";
import {BankRegistrationControls} from "./bank-registration-controls";
import {invalidateEntityRuntimeRecord} from "@athyper/platform-entity-form-detail";

export function BankingWorkspace({businessPartnerId,mode="manage",embedded=false}:{
  businessPartnerId:string;embedded?:boolean;mode?:"manage"|"verification";
  initialCompanyCodeId?:string;initialBankProjectionId?:string;
}){
 const http=useApiClient(),identity=useSessionIdentity();
 const client=useMemo(()=>createBusinessPartner360CommercialClient(http),[http]);
 const [revision,setRevision]=useState(0),[loaded,setLoaded]=useState<{key:string;data:Readonly<Record<string,unknown>>}>(),[error,setError]=useState(false);
 const key=[businessPartnerId,identity.scope?.tenantId,identity.scope?.principalId,identity.scope?.authEpoch,revision].join(":");
 const changed=()=>{setRevision(v=>v+1);if(identity.scope)invalidateEntityRuntimeRecord({...identity.scope,entityCode:"business_partner",recordId:businessPartnerId});};
 useEffect(()=>{
  if(!identity.scope)return;
  const controller=new AbortController();setError(false);
  client.read({tenantId:identity.scope.tenantId,principalId:identity.scope.principalId,authEpoch:identity.scope.authEpoch,businessPartnerId,roleLens:"all",sectionCode:"banking"},controller.signal)
    .then(result=>{if(!controller.signal.aborted)setLoaded({key,data:result.data});})
    .catch(()=>{if(!controller.signal.aborted)setError(true);});
  return ()=>controller.abort();
 },[client,key]);
 const data=loaded?.key===key?loaded.data:undefined;
 return <BusinessPartnerPageFrame contentOnly={embedded} title="Bank accounts" description="Partner-owned bank facts, independent of commercial roles and company setup.">
  {mode==="verification"?<p>Bank verification has been retired. Manage bank-account facts here.</p>:null}
  {!embedded?<p><a href={`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}?section=banking&tab=360`}>Back to partner Banking</a></p>:null}
  {error?<p role="alert">Banking could not be loaded. <button onClick={()=>setRevision(v=>v+1)}>Retry</button></p>:null}
  {!data&&!error?<p role="status">Loading banking…</p>:null}
  {data&&!error?<><Banking data={data} client={client} businessPartnerId={businessPartnerId} showNavigation={false}/><BankRegistrationControls key={key} businessPartnerId={businessPartnerId} onChanged={changed}/></>:null}
 </BusinessPartnerPageFrame>;
}
