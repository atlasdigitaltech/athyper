"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@athyper/platform-ui/primitives";

export function FxRateEntityExport({tenantCode}:{tenantCode:string}) {
  const [status,setStatus]=useState<"idle"|"loading"|"done">("idle");
  const [message,setMessage]=useState("");
  const download=async()=>{
    setStatus("loading");
    setMessage("");
    try{
      const response=await fetch(`/api/finance/setup/tenant/${encodeURIComponent(tenantCode)}/fx/rates/export`,{
        credentials:"include",
        cache:"no-store",
      });
      const result=await response.json().catch(()=>({})) as Record<string,unknown>;
      if(!response.ok)throw new Error(typeof result["message"]==="string"?result["message"]:`Export failed (${response.status}).`);
      const url=URL.createObjectURL(new Blob([String(result["content"]??"")],{type:String(result["contentType"]??"text/csv;charset=utf-8")}));
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download=String(result["fileName"]??"fx-rates.csv");
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("done");
      setMessage(`${Number(result["rowCount"]??0)} FX rate versions exported.`);
    }catch(error){
      setStatus("idle");
      setMessage(error instanceof Error?error.message:"Export failed.");
    }
  };
  return (
    <div className="rounded-xl border bg-card p-5">
      <Link href="/app/fx_rate" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to FX rates
      </Link>
      <h1 className="mt-4 text-xl font-semibold">Export FX rate history</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Export every active and superseded tenant rate version, including source and predecessor lineage, as CSV.
      </p>
      <Button className="mt-5" onClick={download} disabled={status==="loading"}>
        <Download className="mr-2 h-4 w-4" aria-hidden />{status==="loading"?"Preparing…":"Download CSV"}
      </Button>
      {message?<p className={`mt-3 text-sm ${status==="done"?"text-emerald-700":"text-destructive"}`}>{message}</p>:null}
    </div>
  );
}
