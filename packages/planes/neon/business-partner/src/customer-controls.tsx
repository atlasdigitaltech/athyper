"use client";

import {ApiTransportError} from "@athyper/platform-api-client";
import {useApiClient, usePermissions, useToasts} from "@athyper/platform-shell-app-foundation";
import {PageSurface} from "@athyper/platform-surface-kit";
import {Badge, Button, Card, Input, Label, Select} from "@athyper/platform-ui";
import {useNeonOperatingOrganization, useNeonWorkContext} from "@athyper/product-neon-shell";
import {useCallback, useEffect, useMemo, useState, type FormEvent} from "react";
import {createBusinessPartnerClient, type CustomerCreditReview, type PartnerAggregate, type PartnerEligibility} from "./client";

const permissions={
  creditCreate:"neon.customer.credit.create",
  creditDecide:"neon.customer.credit.decide",
  activate:"neon.customer.lifecycle.activate",
  suspend:"neon.customer.lifecycle.suspend",
  reactivate:"neon.customer.lifecycle.reactivate",
} as const;

export function CustomerControls({businessPartnerId}:{readonly businessPartnerId:string}){
  const http=useApiClient();
  const api=useMemo(()=>createBusinessPartnerClient(http),[http]);
  const work=useNeonWorkContext();
  const operating=useNeonOperatingOrganization();
  const grants=usePermissions();
  const toasts=useToasts();
  const companyCodeId=work.selection.mode==="company"?work.selection.companyCodeId:undefined;
  const organizations=useMemo(()=>operating.organizations.filter(item=>!companyCodeId||item.companyAssignments.some(assignment=>assignment.companyCodeId===companyCodeId)),[operating.organizations,companyCodeId]);
  const[organizationId,setOrganizationId]=useState("");
  const[aggregate,setAggregate]=useState<PartnerAggregate>();
  const[readiness,setReadiness]=useState<PartnerEligibility>();
  const[reviews,setReviews]=useState<readonly CustomerCreditReview[]>([]);
  const[loading,setLoading]=useState(false);
  const[busy,setBusy]=useState<string>();
  const[error,setError]=useState<string>();

  useEffect(()=>setOrganizationId(current=>organizations.some(item=>item.id===current)?current:organizations.length===1?organizations[0]!.id:""),[organizations]);
  const customer=aggregate?.customers[0];
  const reload=useCallback(async()=>{
    if(!organizationId||!companyCodeId)return;
    setLoading(true);setError(undefined);
    try{
      const nextAggregate=await api.aggregate(businessPartnerId,organizationId);
      const[nextReadiness,nextReviews]=await Promise.all([
        api.eligibility(businessPartnerId,organizationId,"activation",new Date().toISOString().slice(0,10),undefined,companyCodeId,"customer"),
        api.customerCreditReviews(businessPartnerId,organizationId,companyCodeId),
      ]);
      setAggregate(nextAggregate);setReadiness(nextReadiness);setReviews(nextReviews);
    }catch(cause){setError(errorMessage(cause));}finally{setLoading(false);}
  },[api,businessPartnerId,organizationId,companyCodeId]);
  useEffect(()=>{void reload();},[reload]);

  async function createCredit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!customer||!companyCodeId)return;
    const data=new FormData(event.currentTarget),limit=Number(data.get("creditLimit"));
    await run("credit",()=>api.createCustomerCredit(businessPartnerId,{customerId:customer.id,operatingOrganizationId:organizationId,companyCodeId,reviewTypeCode:String(data.get("reviewTypeCode")||"initial"),requestedCreditLimit:Number.isFinite(limit)?limit:undefined,currencyCode:String(data.get("currencyCode")||"").toUpperCase(),riskClassCode:String(data.get("riskClassCode")||"")}),"Credit review created");
  }
  async function decide(review:CustomerCreditReview,decision:"approved"|"conditional"|"rejected"){
    await run(`decision-${review.id}`,()=>api.decideCustomerCredit(review.id,{expectedVersion:review.rowVersion,decision,reason:`CUSTOMER_CREDIT_${decision.toUpperCase()}`}),`Credit review ${decision}`);
  }
  async function transition(action:"activate"|"suspend"|"reactivate"){
    if(!customer||!companyCodeId)return;
    await run(action,()=>api.transitionCustomer(businessPartnerId,{customerId:customer.id,operatingOrganizationId:organizationId,companyCodeId,action,reasonCode:`CUSTOMER_${action.toUpperCase()}`,businessDate:new Date().toISOString().slice(0,10)}),`Customer ${action} completed`);
  }
  async function run(name:string,command:()=>Promise<unknown>,success:string){setBusy(name);setError(undefined);try{await command();toasts.push({tone:"success",title:success});await reload();}catch(cause){setError(errorMessage(cause));}finally{setBusy(undefined);}}

  return <PageSurface title="Customer credit and lifecycle" description="Credit approval is independent from registration approval; activation is pinned to current sales and AR readiness." actions={<a className="a-button a-button--secondary" href={`/app/business_partner/${encodeURIComponent(businessPartnerId)}`}>Back to partner</a>}>
    <Card className="bp-filter-bar"><div><Label htmlFor="customer-controls-organization">Sales organization</Label><Select id="customer-controls-organization" value={organizationId} onChange={event=>setOrganizationId(event.currentTarget.value)}><option value="">Select an authorized sales organization</option>{organizations.map(item=><option key={item.id} value={item.id}>{item.code} · {item.displayName}</option>)}</Select></div><div><Label htmlFor="customer-controls-company">AR company</Label><Input id="customer-controls-company" readOnly value={companyCodeId??"Select a company in the work context"}/></div></Card>
    {error?<div className="bp-error" role="alert"><strong>Unable to complete the command</strong><p>{error}</p></div>:null}
    {!companyCodeId?<Card><p>Select a company in the NEON work context to review AR readiness.</p></Card>:null}
    {loading?<Card><p>Loading customer controls…</p></Card>:customer?<>
      <Card className="bp-section"><h2>Readiness</h2><div className="bp-summary"><Badge tone={readiness?.eligible?"success":"warning"}>{readiness?.eligible?"Ready":"Blocked"}</Badge><span>Customer {customer.customerCode}</span><span>Status {customer.status}</span></div>{readiness?.reasons.length?<ul>{readiness.reasons.map(reason=><li key={`${reason.code}-${reason.recordId??"scope"}`}><strong>{reason.code}</strong>{reason.detail?` — ${reason.detail}`:""}</li>)}</ul>:<p>Sales assignment, approved credit, and AR company-profile gates pass.</p>}<div className="bp-actions">{customer.status==="prospect"&&grants.has(permissions.activate)?<Button loading={busy==="activate"} disabled={!readiness?.eligible} onClick={()=>void transition("activate")}>Activate</Button>:null}{customer.status==="active"&&grants.has(permissions.suspend)?<Button variant="secondary" loading={busy==="suspend"} onClick={()=>void transition("suspend")}>Suspend</Button>:null}{customer.status==="suspended"&&grants.has(permissions.reactivate)?<Button loading={busy==="reactivate"} disabled={!readiness?.eligible} onClick={()=>void transition("reactivate")}>Reactivate</Button>:null}</div></Card>
      <Card className="bp-section"><h2>Commercial credit review</h2>{grants.has(permissions.creditCreate)?<form className="bp-grid" onSubmit={createCredit}><div><Label htmlFor="customer-credit-type">Review type</Label><Input id="customer-credit-type" name="reviewTypeCode" defaultValue="initial" required/></div><div><Label htmlFor="customer-credit-limit">Requested limit</Label><Input id="customer-credit-limit" name="creditLimit" type="number" min="0" step="0.01" required/></div><div><Label htmlFor="customer-credit-currency">Currency</Label><Input id="customer-credit-currency" name="currencyCode" minLength={3} maxLength={3} required/></div><div><Label htmlFor="customer-risk-class">Risk class</Label><Input id="customer-risk-class" name="riskClassCode" required/></div><Button type="submit" loading={busy==="credit"}>Open credit review</Button></form>:null}{reviews.length?<table className="bp-table"><thead><tr><th>Type</th><th>Limit</th><th>Risk</th><th>Decision</th><th>Action</th></tr></thead><tbody>{reviews.map(review=><tr key={review.id}><td>{review.reviewTypeCode}</td><td>{review.requestedCreditLimit??"—"} {review.currencyCode}</td><td>{review.riskClassCode??"—"}</td><td>{review.decision}</td><td>{review.decision==="pending"&&grants.has(permissions.creditDecide)?<div className="bp-actions"><Button variant="secondary" loading={busy===`decision-${review.id}`} onClick={()=>void decide(review,"approved")}>Approve</Button><Button variant="secondary" loading={busy===`decision-${review.id}`} onClick={()=>void decide(review,"conditional")}>Conditional</Button><Button variant="secondary" loading={busy===`decision-${review.id}`} onClick={()=>void decide(review,"rejected")}>Reject</Button></div>:"—"}</td></tr>)}</tbody></table>:<p>No customer credit reviews in this sales/company scope.</p>}</Card>
    </>:organizationId&&companyCodeId&&!loading?<Card><p>No customer role is visible in this authorized scope.</p></Card>:null}
  </PageSurface>;
}

function errorMessage(cause:unknown):string{if(cause instanceof ApiTransportError)return cause.problem?.detail??cause.message;if(cause instanceof Error)return cause.message;return "Unexpected customer onboarding error";}
