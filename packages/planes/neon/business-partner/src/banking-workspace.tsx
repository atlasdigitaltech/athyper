"use client";
import {useEffect,useMemo,useState} from "react";
import {useApiClient,usePermissions,useSessionIdentity} from "@athyper/platform-shell-app-foundation";
import {useNeonWorkContext} from "@athyper/product-neon-shell";
import {BusinessPartnerPageFrame} from "./page-frame";
import {Card} from "@athyper/platform-ui";
import {Banking} from "./360/components/commercial-controls";
import {createBusinessPartner360CommercialClient} from "./360/business-partner-360-commercial-client";
import {BankVerificationControls} from "./bank-verification-controls";

type Row=Readonly<Record<string,unknown>>;
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter((v):v is Row=>!!v&&typeof v==="object"):[];
export function BankingWorkspace({businessPartnerId,mode="manage",initialCompanyCodeId="",initialBankProjectionId="",embedded=false}:{embedded?:boolean;businessPartnerId:string;mode?:"manage"|"verification";initialCompanyCodeId?:string;initialBankProjectionId?:string}){
 const http=useApiClient(),identity=useSessionIdentity(),permissions=usePermissions(),work=useNeonWorkContext();
 const client=useMemo(()=>createBusinessPartner360CommercialClient(http),[http]);
 const [companyCodeId,setCompanyCodeId]=useState(initialCompanyCodeId),[selected,setSelected]=useState(initialBankProjectionId?`mesh:${initialBankProjectionId}`:""),[revision,setRevision]=useState(0);
 const [loaded,setLoaded]=useState<{key:string;data:Row}>(),[error,setError]=useState<string>();
 const permitted=!companyCodeId || work.companies.some(c=>c.companyCodeId===companyCodeId);
 const key=[businessPartnerId,companyCodeId,identity.scope?.tenantId,identity.scope?.principalId,identity.scope?.authEpoch,revision].join(":");
 useEffect(()=>{
  if(!permitted || !identity.scope)return;
  const controller=new AbortController();setError(undefined);
  client.read({tenantId:identity.scope.tenantId,principalId:identity.scope.principalId,authEpoch:identity.scope.authEpoch,businessPartnerId,roleLens:"all",sectionCode:"banking",...(companyCodeId?{companyCodeId}: {})},controller.signal)
    .then(result=>{if(!controller.signal.aborted)setLoaded({key,data:result.data});})
    .catch(()=>{if(!controller.signal.aborted)setError("Banking could not be loaded for this selection.");});
  return ()=>controller.abort();
 },[client,key,permitted]);
 const data=loaded?.key===key?loaded.data:undefined,accounts=rows(data?.["accounts"]);
 const selectedAccount=accounts.find(a=>a["linkId"]===selected)??accounts.find(a=>a["bankProjectionId"])??accounts[0];
 const assignments=rows(selectedAccount?.["companyAssignments"]);
 const verification=assignments.find(a=>a["companyCodeId"]===companyCodeId)?.["verificationId"] ?? (selectedAccount?.["verificationState"] as Row|undefined)?.["id"];
 const base=`/mdg/business-partner/${encodeURIComponent(businessPartnerId)}`;
 const companyQuery=companyCodeId?`?companyCodeId=${encodeURIComponent(companyCodeId)}`:"";
 return <BusinessPartnerPageFrame contentOnly={embedded} title={embedded?"Bank accounts":mode==="manage"?"Manage banking":"Bank verification"} description="Partner account facts are shared. Usage and acceptance are configured separately for each company.">
  {!embedded?<p><a href={`${base}?section=banking&tab=360`}>Back to partner Banking</a> · <a href={`${base}/${mode==="manage"?"bank-verification":"banking"}${companyQuery}`}>{mode==="manage"?"Open bank verification":"Manage banking"}</a></p>:null}
  {!embedded?<Card><label htmlFor="banking-company">Company</label><select id="banking-company" value={companyCodeId} onChange={event=>{setCompanyCodeId(event.target.value);setSelected("");}} disabled={work.status!=="ready"}>
   <option value="">All authorized companies — view accounts</option>
   {work.companies.map(company=><option key={company.companyCodeId} value={company.companyCodeId}>{company.displayName}</option>)}
  </select>
  {!companyCodeId?<p>Select a company to configure usage or review acceptance.</p>:null}
  {work.status==="error"?<p role="alert">Companies could not be loaded. <button onClick={()=>work.retry()}>Retry</button></p>:null}
  {!permitted&&work.status==="ready"?<p role="alert">The requested company is not available to you.</p>:null}
  </Card>:null}
  {embedded?<p>Link multiple accounts for this company. Each purpose needs its own acceptance. Disclosure verification currently supports supplier payments; it does not authorize customer collections.</p>:null}
  {embedded&&companyCodeId?<a href={`${base}/bank-verification${companyQuery}`}>Review supplier payment acceptance</a>:null}
  {error?<p role="alert">{error} <button onClick={()=>setRevision(v=>v+1)}>Retry</button></p>:null}
  {!data&&!error&&permitted?<p role="status">Loading banking…</p>:null}
  {data?<Banking data={data} client={client} businessPartnerId={businessPartnerId} showNavigation={false} allowCompanySettings={mode==="manage"&&!!companyCodeId&&permissions.has("neon.business_partner_bank.apply")} onChanged={()=>setRevision(v=>v+1)}/>:null}
  {mode==="verification"&&companyCodeId&&data?<Card>
   <label htmlFor="banking-account">Account to review</label><select id="banking-account" value={String(selectedAccount?.["linkId"]??"")} onChange={event=>setSelected(event.target.value)}>
    {!accounts.length?<option value="">No accounts received</option>:null}
    {accounts.map(account=><option key={String(account["linkId"])} value={String(account["linkId"])}>{String(account["bankName"]??"")} · {String(account["currencyCode"]??"")} · {String(account["maskedAccount"]??"")} · {String(account["source"]??"NEON")}</option>)}
   </select>
   {!data["supplierCompanyProfileId"]?<p>This partner needs an active supplier profile for the selected company before a disclosure review can start.</p>:null}
  </Card>:null}
  {companyCodeId&&permitted&&data?<BankVerificationControls key={`${companyCodeId}:${selectedAccount?.["linkId"]??"new"}:${mode}`} businessPartnerId={businessPartnerId} companyCodeId={companyCodeId}
   mode={mode==="manage"?"registration":"all"} onApplied={()=>setRevision(v=>v+1)}
   {...(mode==="verification"&&verification?{initialVerificationId:String(verification)}:{})}
   {...(mode==="verification"&&selectedAccount?.["bankProjectionId"]?{bankProjectionId:String(selectedAccount["bankProjectionId"])}:{})}
   {...(data["supplierCompanyProfileId"]?{supplierCompanyProfileId:String(data["supplierCompanyProfileId"])}:{})}/>:null}
 </BusinessPartnerPageFrame>;
}
