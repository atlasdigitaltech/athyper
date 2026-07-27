"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, GitBranch } from "lucide-react";

interface FxRateLineage {
  id:string;
  status:string;
  versionNo:number;
  supersedesId:string|null;
  successorId:string|null;
  successorVersionNo:number|null;
}

export function FxRateLineagePanel({tenantCode,rateId}:{tenantCode:string;rateId:string}) {
  const [rate,setRate]=useState<FxRateLineage|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/finance/setup/tenant/${encodeURIComponent(tenantCode)}/fx/rates/${encodeURIComponent(rateId)}`,{
      credentials:"include",
      cache:"no-store",
      signal:controller.signal,
    })
      .then(async response=>{
        if(!response.ok)return null;
        const body=await response.json() as {rate?:FxRateLineage};
        return body.rate??null;
      })
      .then(value=>setRate(value))
      .catch(()=>undefined);
    return ()=>controller.abort();
  },[rateId,tenantCode]);
  if(!rate)return null;
  return (
    <section className="rounded-xl border bg-card px-5 py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium"><GitBranch className="h-4 w-4 text-primary" aria-hidden />Rate lineage</span>
        <span className="rounded-full border px-2 py-0.5 text-xs capitalize">Version {rate.versionNo} · {rate.status}</span>
        {rate.supersedesId?(
          <Link className="inline-flex items-center gap-1 text-primary hover:underline" href={`/app/fx_rate/${encodeURIComponent(rate.supersedesId)}`}>
            Previous version <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ):<span className="text-xs text-muted-foreground">Original version</span>}
        {rate.successorId?(
          <Link className="inline-flex items-center gap-1 text-primary hover:underline" href={`/app/fx_rate/${encodeURIComponent(rate.successorId)}`}>
            Successor v{rate.successorVersionNo} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ):<span className="text-xs text-muted-foreground">No successor</span>}
      </div>
    </section>
  );
}
