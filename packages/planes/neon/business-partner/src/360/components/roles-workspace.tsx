"use client";
import { BusinessPartnerAction } from "./governed-action";
import {useEffect,useState} from "react";
import {Card} from "@athyper/platform-ui";
import {useNeonOperatingOrganization,useNeonWorkContext} from "@athyper/product-neon-shell";
import {useBusinessPartner360} from "../business-partner-360-context";
import {relationshipStatus,useCompanyRelationships} from "../company-relationships";
import {SupplierCompanySection,CustomerCompanySection} from "./role-company-sections";
import {BankingWorkspace} from "../../banking-workspace";

export function RolesWorkspace(){
 const {summary,selectScope}=useBusinessPartner360(),relationships=useCompanyRelationships(),work=useNeonWorkContext(),operating=useNeonOperatingOrganization();
 const initial=typeof window!=="undefined"?(new URLSearchParams(window.location.search).get("roleTab")??(new URLSearchParams(window.location.search).get("section")==="customer-company"?"selling":null)):null;
 const [tab,setTab]=useState(initial==="selling"||initial==="banks"?initial:"buying"),[pendingCompany,setPendingCompany]=useState("");
 useEffect(()=>{setTab(initial==="selling"||initial==="banks"?initial:"buying");},[initial]);
 const companyId=summary.scope.companyCodeId,orgId=summary.scope.operatingOrganizationId;
 useEffect(()=>{
  if(!companyId||orgId||pendingCompany)return;
  const choices=operating.organizations.filter(o=>o.companyAssignments.some(a=>a.companyCodeId===companyId));
  if(choices.length===1)selectScope?.(choices[0]!.id,companyId);
  else if(choices.length>1)setPendingCompany(companyId);
 },[companyId,orgId,pendingCompany,operating.organizations,selectScope]);
 const company=work.companies.find(c=>c.companyCodeId===companyId),org=operating.organizations.find(o=>o.id===orgId);
 const companies=[...new Map((relationships.rows??[]).map(r=>[r.companyCodeId,r.companyName])).entries()];
 const compatible=operating.organizations.filter(o=>o.companyAssignments.some(a=>a.companyCodeId===(pendingCompany||companyId)));
 const chooseCompany=(id:string)=>{if(!id)return;const choices=operating.organizations.filter(o=>o.companyAssignments.some(a=>a.companyCodeId===id));if(choices.length===1){setPendingCompany("");selectScope?.(choices[0]!.id,id);}else setPendingCompany(id);};
 const switchTab=(next:string)=>{setTab(next);const url=new URL(window.location.href);url.searchParams.set("roleTab",next);window.history.replaceState(window.history.state,"",url);};
 const action=summary.recordHeader?.actions.find(a=>(a.operationKey??a.key)==="configure_company");
 return <div className="bp360-section-list bp-roles-workspace">
  <Card className="bp360-section-card"><h2>Roles &amp; scope</h2><p>Choose a company to manage buying, selling and bank account usage.</p>
   <div className="bp-actions" aria-label="Partner roles">{summary.roles.filter(r=>r.code==="supplier"||r.code==="customer").map(r=><span key={r.code}>{r.code==="supplier"?"Supplier":"Customer"} · {r.status}</span>)}</div>
   {relationships.error?<p role="alert">Company relationships could not be loaded. <button onClick={relationships.retry}>Retry</button></p>:!relationships.rows?<p role="status">Loading company relationships…</p>:companies.length?<div className="bp-company-table"><table><thead><tr><th>Company</th><th>Buying</th><th>Selling</th><th>Action</th></tr></thead><tbody>{companies.map(([id,name])=><tr key={id} aria-selected={id===companyId}><th scope="row">{name}</th>{(["supplier","customer"] as const).map(role=>{const rows=relationships.rows!.filter(r=>r.companyCodeId===id&&r.role===role);return <td key={role}>{rows.length?[...new Set(rows.map(relationshipStatus))].join(" · "):"Not enabled or not visible"}</td>;})}<td><button onClick={()=>chooseCompany(id)}>Configure <span className="sr-only">{name}</span></button></td></tr>)}</tbody></table></div>:<p>No company extensions are visible. Extend this partner to an authorized company to begin setup.</p>}
   {action?<BusinessPartnerAction action={action}/>:null}
  </Card>
  <Card className="bp360-section-card"><label htmlFor="roles-company">Selected company</label><select id="roles-company" value={pendingCompany||companyId||""} onChange={e=>chooseCompany(e.target.value)}><option value="" disabled>Select company</option>{work.companies.map(c=><option key={c.companyCodeId} value={c.companyCodeId}>{c.displayName}</option>)}</select>
   {pendingCompany?<label>Operating organization<select value="" onChange={e=>{if(e.target.value){selectScope?.(e.target.value,pendingCompany);setPendingCompany("");}}}><option value="">Select organization</option>{compatible.map(o=><option key={o.id} value={o.id}>{o.displayName}</option>)}</select>{!compatible.length?<span>No authorized organization is available for this company.</span>:null}</label>:org?<p>Operating organization: {org.displayName}</p>:null}
   {company&&org?<details><summary>Scope details</summary><p>{company.displayName} · {org.displayName}</p>{relationships.rows?.filter(r=>r.companyCodeId===companyId&&r.operatingOrganizationId===orgId).map(r=><p key={r.role}>{r.role==="supplier"?"Buying":"Selling"}: {relationshipStatus(r)}</p>)}</details>:null}
  </Card>
  {companyId&&orgId&&!pendingCompany?<>
   <div className="bp-role-tabs" role="tablist" aria-label="Company setup">{[["buying","Buying & Payables"],["selling","Selling & Receivables"],["banks","Bank accounts"]].map(([id,label])=><button key={id} id={`role-tab-${id}`} role="tab" aria-selected={tab===id} aria-controls="role-company-panel" onClick={()=>switchTab(id!)}>{label}</button>)}</div>
   <div id="role-company-panel" role="tabpanel" aria-labelledby={`role-tab-${tab}`}>
    {tab==="banks"?summary.completeness.readOnly?<p>Bank account configuration is unavailable in the historical view.</p>:<BankingWorkspace key={companyId} businessPartnerId={summary.identity.id} initialCompanyCodeId={companyId} embedded/>:<>
     {summary.sections.some(s=>s.code===(tab==="buying"?"supplier-company":"customer-company")&&s.authorization==="granted")?tab==="buying"?<SupplierCompanySection/>:<CustomerCompanySection/>:<Card><p>{tab==="buying"?"Buying":"Selling"} is not enabled or is not available to you in this scope.</p></Card>}
     <button onClick={()=>switchTab("banks")}>{tab==="buying"?"Manage supplier payment accounts":"Manage refund and collection accounts"}</button>
    </>}
   </div>
  </>:<Card><p>Select a company and its operating organization to view setup. Partner account facts remain available in the 360 View.</p></Card>}
 </div>;
}
