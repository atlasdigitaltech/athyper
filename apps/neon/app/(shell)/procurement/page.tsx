"use client";

import {resolveProcurementContext} from "@athyper/product-neon-procurement";
import {NeonOperatingOrganizationSelector,useNeonOperatingOrganization,useNeonWorkContext} from "@athyper/product-neon-shell";
import {useMemo} from "react";

export default function ProcurementPage(){
  const work=useNeonWorkContext(),organizations=useNeonOperatingOrganization(),company=work.selection.mode==="company"?{companyCodeId:work.selection.companyCodeId}:undefined,organization=organizations.selected("procurement");
  const businessDate=useMemo(()=>new Date().toISOString().slice(0,10),[]),decision=resolveProcurementContext({...(company?{company}:{}),...(organization?{organization}:{}),businessDate});
  return <section className="neon-procurement" aria-labelledby="page-title"><p>Supply Chain</p><h1 id="page-title">Procurement</h1><p>Select the company that owns the transaction and the procurement organization responsible for the process.</p><div className="neon-procurement__context"><NeonOperatingOrganizationSelector capability="procurement"/><ContextDecision decision={decision}/></div><button type="button" disabled={decision.state!=="ready"}>Create purchase order</button>{decision.state==="ready"?<dl><div><dt>Company</dt><dd>{decision.scope.companyCodeId}</dd></div><div><dt>Procurement organization</dt><dd>{decision.scope.operatingOrganizationId}</dd></div><div><dt>Business date</dt><dd>{decision.scope.businessDate}</dd></div></dl>:null}</section>;
}

function ContextDecision({decision}:{readonly decision:ReturnType<typeof resolveProcurementContext>}){const copy={company_required:"Choose one exact company before creating a purchase order.",organization_required:"Choose a permitted procurement organization.",organization_incompatible:"The selected organization does not serve this company.",profile_required:"This organization needs a procurement profile before it can create purchase orders."} as const;return decision.state==="ready"?<p role="status">Company and procurement organization are ready.</p>:<p role="alert">{copy[decision.state]}</p>;}
