"use client";

import { CheckCircle2,CircleAlert,RefreshCw,ShieldCheck } from "lucide-react";
import { Button,Skeleton } from "@athyper/platform-ui/primitives";
import { cn } from "@athyper/platform-theme/utils";
import { useCompanyCertificationReadiness } from "../../hooks/useCertificationReadiness";

export function CertificationReadinessPanel({companyCode}:{companyCode:string}) {
  const query=useCompanyCertificationReadiness(companyCode);
  if(query.isLoading&&!query.data)return <Skeleton className="h-56 rounded-xl"/>;
  if(!query.data){
    return (
      <section className="rounded-xl border bg-card p-4 text-sm text-destructive">
        Four-domain certification readiness is unavailable.
        <Button variant="ghost" size="sm" onClick={()=>query.refetch()}>Retry</Button>
      </section>
    );
  }
  const data=query.data;
  return (
    <section className="rounded-xl border bg-card" aria-label="Four-domain certification readiness">
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5"/>
            <h2 className="font-semibold">Phase 2 certification roll-up</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Setup readiness is certification evidence. Operational health is displayed separately and remains non-blocking.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-1 text-xs font-medium",data.status==="certified"?"bg-emerald-100 text-emerald-800":data.summary.readyForCertification?"bg-blue-100 text-blue-800":"bg-amber-100 text-amber-900")}>{data.status.replaceAll("_"," ")}</span>
          <span className={cn("rounded-full px-2 py-1 text-xs",data.rollout.postingGateActive?"bg-red-100 text-red-800":"bg-muted text-muted-foreground")}>Posting gate: {data.rollout.mode}</span>
          <Button variant="ghost" size="sm" onClick={()=>query.refetch()}><RefreshCw className={cn("h-4 w-4",query.isFetching&&"animate-spin")}/></Button>
        </div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        {data.domains.map(item=>(
          <a href={item.primaryAction.href} key={item.domain} className="rounded-lg border p-4 transition-colors hover:bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{item.label}</span>
              {item.state==="ready"?<CheckCircle2 className="h-5 w-5 text-emerald-600"/>:<CircleAlert className="h-5 w-5 text-amber-600"/>}
            </div>
            <p className="mt-3 text-2xl font-semibold">{item.passed}/{item.total}</p>
            <p className="mt-1 text-xs capitalize text-muted-foreground">{item.state.replaceAll("_"," ")} · {item.blockerCount} setup blockers</p>
            {item.operationalHealth&&item.operationalHealth.attentionCount>0?(
              <p className="mt-2 text-xs text-amber-700">{item.operationalHealth.attentionCount} operational rate warning{item.operationalHealth.attentionCount===1?"":"s"} · does not block certification</p>
            ):null}
          </a>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
        <span>{data.summary.passed}/{data.summary.total} setup checks passed · Certification {data.certification.fresh?"current":data.certification.status?"stale":"not issued"}</span>
        <span>Material setup change: {data.certification.materialChangeAt?new Date(data.certification.materialChangeAt).toLocaleString():"none recorded"}</span>
      </div>
    </section>
  );
}
