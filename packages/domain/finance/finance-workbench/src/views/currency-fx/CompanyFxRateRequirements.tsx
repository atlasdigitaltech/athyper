import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Plus } from "lucide-react";
import { Badge, Button } from "@athyper/ui/primitives";
import type {
  CompanyFxRateRequirement,
  CurrencyFxSetupPayload,
  FxPolicy,
} from "../../hooks/useCurrencyFxSetup";

export function CompanyFxRateRequirements({data}:{data:CurrencyFxSetupPayload}) {
  const requirements=data.rateRequirements;
  return (
    <section className="rounded-xl border bg-card" aria-labelledby="rate-health-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="rate-health-title" className="font-semibold">Current rate health</h2>
            <Badge variant={data.operationalHealth.attentionCount?"warning":"success"} size="sm">
              {data.operationalHealth.attentionCount
                ? `${data.operationalHealth.attentionCount} operational warning${data.operationalHealth.attentionCount===1?"":"s"}`
                : "healthy"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Rate availability is operational attention and never changes Company setup completion.
          </p>
        </div>
        <Button asChild size="sm" variant="outline"><Link href={data.navigation.rateListHref}>Manage all rates</Link></Button>
      </div>
      {requirements.length===0 ? (
        <p className="p-5 text-sm text-muted-foreground">No operational rate requirement is currently derived.</p>
      ) : (
        <div className="divide-y">
          {requirements.map(requirement=>(
            <RequirementRow
              key={requirement.requirementKey}
              requirement={requirement}
              policy={data.policy.effective}
              canAdd={data.permissions.addRate.allowed}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RequirementRow({
  requirement,policy,canAdd,
}:{
  requirement:CompanyFxRateRequirement;
  policy:FxPolicy|null;
  canAdd:boolean;
}) {
  const healthy=requirement.state==="healthy";
  const selected=readSelected(requirement.selectedRate);
  return (
    <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex gap-3">
        {healthy
          ?<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          :<CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {requirement.fromCurrency} <ArrowRight className="inline h-3.5 w-3.5"/> {requirement.toCurrency}
            </p>
            <Badge variant={healthy?"success":"warning"} size="sm">{label(requirement.state)}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {label(requirement.purpose)} · {label(requirement.rateType)} · required {requirement.requiredAsOfDate}
            {requirement.bookCode?` · ${requirement.bookCode}`:""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected
              ? `Latest eligible rate ${selected.rate??"—"} · ${selected.source??"source unavailable"} · ${selected.effectiveDate??"date unavailable"}`
              : reason(requirement.reasonCode)}
          </p>
        </div>
      </div>
      {!healthy&&canAdd ? (
        <Button asChild size="sm">
          <Link href={buildMissingRateHref(requirement,policy)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />Add missing rate
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

export function buildMissingRateHref(requirement:CompanyFxRateRequirement,policy:FxPolicy|null):string {
  const search=new URLSearchParams({
    from_currency:requirement.fromCurrency,
    to_currency:requirement.toCurrency,
    rate_type:requirement.rateType,
    effective_date:requirement.requiredAsOfDate,
  });
  const preferredSource=policy?.preferredSources[0];
  if(preferredSource)search.set("source",preferredSource);
  return `/app/fx_rate/new?${search.toString()}`;
}

function readSelected(value:Record<string,unknown>|null):{rate?:string;source?:string;effectiveDate?:string}|null {
  if(!value)return null;
  return {
    rate:value["rate"]==null?undefined:String(value["rate"]),
    source:typeof value["source"]==="string"?value["source"]:undefined,
    effectiveDate:typeof value["effectiveDate"]==="string"
      ?value["effectiveDate"]
      :typeof value["effective_date"]==="string"?value["effective_date"]:undefined,
  };
}
function reason(reasonCode:string):string {
  const reasons:Record<string,string>={
    FX_RATE_MISSING:"No eligible active rate exists.",
    FX_RATE_STALE:"The latest eligible rate is older than policy allows.",
    FX_MANUAL_OVERRIDE_REQUIRED:"A governed manual override is required.",
    FX_FALLBACK_EXHAUSTED:"Configured inverse and pivot fallbacks did not resolve a rate.",
  };
  return reasons[reasonCode]??label(reasonCode);
}
function label(value:string):string{return value.replace(/^FX_/,"").replaceAll("_"," ").replace(/\b\w/g,character=>character.toUpperCase())}
