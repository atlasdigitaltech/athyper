"use client";
import {useEffect,useMemo,useState} from "react";
import {Card} from "@athyper/platform-ui";
import {useApiClient,useSessionIdentity} from "@athyper/platform-shell-app-foundation";
import {useNeonWorkContext} from "@athyper/product-neon-shell";
import {useBusinessPartner360} from "../business-partner-360-context";
import {useCompanyRelationships,relationshipCounts,rolesHref} from "../company-relationships";
import {createBusinessPartner360CommercialClient} from "../business-partner-360-commercial-client";
import {createBusinessPartner360ExplainabilityClient} from "../business-partner-360-explainability-client";
type Row=Readonly<Record<string,unknown>>;
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.filter(x=>x&&typeof x==="object"):[];
export function RelationshipOverview(){
 const {summary,selectSection}=useBusinessPartner360(),relationships=useCompanyRelationships(),work=useNeonWorkContext(),http=useApiClient(),identity=useSessionIdentity();
 const bankClient=useMemo(()=>createBusinessPartner360CommercialClient(http),[http]),activityClient=useMemo(()=>createBusinessPartner360ExplainabilityClient(http),[http]);
 const [company,setCompany]=useState(summary.scope.companyCodeId??""),[from,setFrom]=useState(`${summary.asOf.slice(0,4)}-01-01`),[until,setUntil]=useState(summary.asOf.slice(0,10));
 const [bank,setBank]=useState<{key:string;data:Row}>(),[activity,setActivity]=useState<{key:string;data:Row}>();
 const key=[summary.identity.id,identity.scope?.tenantId,identity.scope?.principalId,identity.scope?.authEpoch,company,summary.asOf].join(":");
 const granted=(code:string)=>summary.sections.some(s=>s.code===code&&s.authorization==="granted");
 useEffect(()=>{
  if(!identity.scope)return;const controller=new AbortController();
  const query={tenantId:identity.scope.tenantId,principalId:identity.scope.principalId,authEpoch:identity.scope.authEpoch,businessPartnerId:summary.identity.id,roleLens:"all" as const,...(company?{companyCodeId:company}:{}),...(summary.completeness.readOnly?{asOf:summary.asOf}:{})};
  if(granted("banking"))void bankClient.read({...query,sectionCode:"banking"},controller.signal).then(v=>{if(!controller.signal.aborted)setBank({key,data:v.data});}).catch(()=>{if(!controller.signal.aborted)setBank({key,data:{unavailable:true}});});
  if(granted("business-activity"))void activityClient.read({...query,sectionCode:"business-activity"},controller.signal).then(v=>{if(!controller.signal.aborted)setActivity({key,data:v.data});}).catch(()=>{if(!controller.signal.aborted)setActivity({key,data:{unavailable:true}});});
  return ()=>controller.abort();
 },[bankClient,activityClient,key]);
 const visible=relationships.rows?.filter(r=>!company||r.companyCodeId===company),counts=visible?relationshipCounts(visible):undefined;
 const accounts=bank?.key===key&&!bank.data["unavailable"]?rows(bank.data["accounts"]):undefined;
 const pending=accounts?new Set(accounts.flatMap(a=>rows(a["companyAssignments"]).filter(u=>(!company||u["companyCodeId"]===company)&&u["acceptanceCurrent"]===false).map(u=>u["assignmentId"]??`${a["sourceAccountId"]??a["bankProjectionId"]??a["linkId"]}:${u["companyCodeId"]}:${u["purpose"]}`))).size:undefined;
 const providers=activity?.key===key?rows(activity.data["providers"]):[];
 const companyName=work.companies.find(c=>c.companyCodeId===company)?.displayName;
 const href=rolesHref(summary.identity.id,company||undefined,company===summary.scope.companyCodeId?summary.scope.operatingOrganizationId:undefined);
 return <>
  <Card className="bp360-section-card"><h2>Relationship summary</h2>
   <p>Overview filters affect this summary only. They do not change transaction context or action access.</p><div className="bp360-fields"><label>Overview company filter<select aria-label="Overview company" value={company} onChange={e=>setCompany(e.target.value)}><option value="">All authorized companies</option>{work.companies.map(c=><option key={c.companyCodeId} value={c.companyCodeId}>{c.displayName}</option>)}</select></label></div>
   <p>{company?companyName??"Selected company":"All authorized companies"} · Setup as of {summary.asOf.slice(0,10)}</p>
   {counts?<p className="bp-relationship-summary">Buying in {counts.buying} {counts.buying===1?"company":"companies"} · Selling in {counts.selling} {counts.selling===1?"company":"companies"} · {counts.gaps} setup {counts.gaps===1?"gap":"gaps"}</p>:<p>{relationships.error?"Company relationships unavailable":relationships.allowed?"Loading company relationships…":"Company relationships are not available to you."}</p>}
   {pending!==undefined?<p>{pending} company account {pending===1?"assignment requires":"assignments require"} acceptance review</p>:null}
   {relationships.allowed?<a href={href}>Manage roles &amp; scope</a>:null}
  </Card>
  <Card className="bp360-section-card"><h2>Performance, spend &amp; revenue</h2>
   <div className="bp360-fields"><label>Period from<input aria-label="Reporting period from" type="date" value={from} max={until} onChange={e=>setFrom(e.target.value)}/></label><label>Period to<input aria-label="Reporting period to" type="date" min={from} value={until} onChange={e=>setUntil(e.target.value)}/></label></div>
   <p>{company?companyName??"Selected company":"All authorized companies"} · Requested reporting period: {from} – {until}</p>
   <div className="bp-outcome-grid">{["Delivery performance","Quality performance","Payment performance","Spend","Revenue"].map(label=><div key={label}><h3>{label}</h3><p>Unavailable</p></div>)}</div>
   <p>Period-based performance and financial totals are not yet supplied by the connected services. Unavailable values are not zero.</p>
   {providers.some(p=>p["state"]==="ready")?<details><summary>Available operational snapshots</summary><p>These snapshots have their own observation dates and are not totals for the requested period.</p>{providers.filter(p=>p["state"]==="ready").map(p=><section key={String(p["provider"])}><h3>{String(p["provider"])}</h3><p>Observed {String(p["observedAt"])}</p>{rows(p["metrics"]).map(m=><p key={String(m["code"])}>{String(m["label"])}: {String(m["value"])} {String(m["unit"]??"")}</p>)}</section>)}</details>:null}
   {granted("business-activity")?<button onClick={()=>selectSection("business-activity")}>View business transactions</button>:null}
  </Card>
  <Card className="bp360-section-card"><h2>Risk assessment</h2><p>Review the underlying evidence; missing evidence does not mean low risk.</p>
   <div className="bp-actions">{[["qualifications-certificates","Qualifications & compliance"],["credit","Credit exposure & review"],["governance","Governance evidence"]].filter(([code])=>granted(code!)).map(([code,label])=><button key={code} onClick={()=>selectSection(code!)}>{label}</button>)}</div>
   <p>Bank review: {pending===undefined?"Unavailable":`${pending} company assignments require acceptance review`}</p>
   {relationships.allowed?<a href={rolesHref(summary.identity.id,company||undefined,company===summary.scope.companyCodeId?summary.scope.operatingOrganizationId:undefined,"banks")}>Review company bank accounts</a>:null}
  </Card>
 </>;
}
