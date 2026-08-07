"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  LockKeyhole,
  Save,
  Settings2,
} from "lucide-react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
} from "@athyper/platform-ui/primitives";
import {
  useSaveTenantFxPolicy,
  type FxPolicy,
  type TenantCurrencyFxSummary,
} from "../../hooks/useCurrencyFxSetup";

const RATE_TYPES=["SPOT","PERIOD_AVG","PERIOD_END","BUDGET","CONTRACTED","HISTORICAL"];
const SOURCES=["ECB","REUTERS","BLOOMBERG","CENTRAL_BANK","MANUAL","CUSTOM","API"];
const MISSING_BEHAVIORS=[
  {value:"block",label:"Block the operation"},
  {value:"manual_with_approval",label:"Require an approved manual rate"},
  {value:"fallback",label:"Use eligible fallback sources"},
];

interface PolicyDraft {
  defaultRateType:string;
  revaluationRateType:string;
  preferredSource:string;
  fallbackSources:string;
  maximumRateAgeDays:string;
  allowInverse:boolean;
  allowTriangulation:boolean;
  pivotCurrencyCode:string;
  missingRateBehavior:string;
  manualOverrideAllowed:boolean;
  manualOverrideApprovalRequired:boolean;
  effectiveFrom:string;
  effectiveTo:string;
  priority:string;
}

const today=()=>new Date().toISOString().slice(0,10);
const emptyDraft=():PolicyDraft=>({
  defaultRateType:"SPOT",
  revaluationRateType:"PERIOD_END",
  preferredSource:"CENTRAL_BANK",
  fallbackSources:"",
  maximumRateAgeDays:"7",
  allowInverse:true,
  allowTriangulation:false,
  pivotCurrencyCode:"",
  missingRateBehavior:"block",
  manualOverrideAllowed:false,
  manualOverrideApprovalRequired:false,
  effectiveFrom:today(),
  effectiveTo:"",
  priority:"100",
});

function policyDraft(policy:FxPolicy|null):PolicyDraft {
  if(!policy)return emptyDraft();
  return {
    defaultRateType:policy.defaultRateType,
    revaluationRateType:policy.revaluationRateType,
    preferredSource:policy.preferredSources[0]??"CENTRAL_BANK",
    fallbackSources:policy.preferredSources.slice(1).join(", "),
    maximumRateAgeDays:policy.maximumRateAgeDays==null?"":String(policy.maximumRateAgeDays),
    allowInverse:policy.allowInverse,
    allowTriangulation:policy.allowTriangulation,
    pivotCurrencyCode:policy.pivotCurrencyCode??"",
    missingRateBehavior:policy.missingRateBehavior,
    manualOverrideAllowed:policy.manualOverrideAllowed,
    manualOverrideApprovalRequired:policy.manualOverrideApprovalRequired,
    effectiveFrom:policy.effectiveFrom,
    effectiveTo:policy.effectiveTo??"",
    priority:String(policy.priority),
  };
}

export function TenantFxPolicyEditor({
  tenantCode,
  summary,
}:{
  tenantCode:string;
  summary:TenantCurrencyFxSummary;
}) {
  const sourcePolicy=summary.activeDefaultPolicy??summary.scheduledDefaultPolicies[0]??null;
  const [draft,setDraft]=useState<PolicyDraft>(()=>policyDraft(sourcePolicy));
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const savePolicy=useSaveTenantFxPolicy(tenantCode);
  const canConfigure=summary.permissions.configure.allowed;

  useEffect(()=>{
    setDraft(policyDraft(sourcePolicy));
  },[sourcePolicy?.id,sourcePolicy?.versionNo]);

  const preferredSources=useMemo(()=>{
    const fallbacks=draft.fallbackSources
      .split(",")
      .map(value=>value.trim().toUpperCase())
      .filter(Boolean);
    return [...new Set([draft.preferredSource,...fallbacks])];
  },[draft.fallbackSources,draft.preferredSource]);

  const invalidFallbacks=preferredSources.filter(source=>!SOURCES.includes(source));
  const validationMessage=invalidFallbacks.length
    ? `Unsupported source: ${invalidFallbacks.join(", ")}`
    : draft.allowTriangulation&&!draft.pivotCurrencyCode
      ? "Choose a pivot currency when triangulation is enabled."
      : null;

  const submit=()=>{
    if(validationMessage||!canConfigure)return;
    savePolicy.mutate({
      policyId:sourcePolicy?.id,
      expectedVersionNo:sourcePolicy?.versionNo,
      policy:{
        transactionContext:"general",
        defaultRateType:draft.defaultRateType,
        revaluationRateType:draft.revaluationRateType,
        preferredSources,
        maximumRateAgeDays:draft.maximumRateAgeDays===""?null:Number(draft.maximumRateAgeDays),
        allowInverse:draft.allowInverse,
        allowTriangulation:draft.allowTriangulation,
        pivotCurrencyCode:draft.allowTriangulation?draft.pivotCurrencyCode.toUpperCase():null,
        missingRateBehavior:draft.missingRateBehavior,
        manualOverrideAllowed:draft.manualOverrideAllowed,
        manualOverrideApprovalRequired:draft.manualOverrideAllowed&&draft.manualOverrideApprovalRequired,
        autoReverseRevaluation:true,
        effectiveFrom:draft.effectiveFrom,
        effectiveTo:draft.effectiveTo||null,
        priority:Number(draft.priority),
        status:"active",
      },
    });
  };

  const saveLabel=sourcePolicy
    ? sourcePolicy.effectiveFrom>summary.asOfDate?"Replace scheduled default":"Save new policy version"
    : "Configure default settings";

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="font-semibold">Effective policy</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Normal controls stay visible. Saving always creates an immutable successor version.
          </p>
        </div>
        {sourcePolicy ? (
          <span className="rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium">
            Version {sourcePolicy.versionNo} · {sourcePolicy.status}
          </span>
        ) : null}
      </div>

      {!canConfigure ? (
        <div className="flex items-center gap-2 border-b bg-muted/20 px-5 py-3 text-sm text-muted-foreground">
          <LockKeyhole className="h-4 w-4" aria-hidden />
          Read only · {summary.permissions.configure.reasonCode??"configuration permission is not granted"}
        </div>
      ) : null}

      <fieldset disabled={!canConfigure||savePolicy.isPending} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
        <SelectField
          label="Transaction rate type"
          value={draft.defaultRateType}
          options={RATE_TYPES}
          onChange={value=>setDraft({...draft,defaultRateType:value})}
        />
        <SelectField
          label="Month-end rate type"
          value={draft.revaluationRateType}
          options={RATE_TYPES}
          onChange={value=>setDraft({...draft,revaluationRateType:value})}
        />
        <SelectField
          label="Preferred source"
          value={draft.preferredSource}
          options={SOURCES}
          onChange={value=>setDraft({...draft,preferredSource:value})}
        />
        <Field label="Maximum age (days)">
          <Input
            type="number"
            min="0"
            value={draft.maximumRateAgeDays}
            onChange={event=>setDraft({...draft,maximumRateAgeDays:event.target.value})}
          />
        </Field>
        <BooleanField
          label="Allow inverse rates"
          description="Use the reciprocal direct pair when eligible."
          checked={draft.allowInverse}
          onChange={checked=>setDraft({...draft,allowInverse:checked})}
        />
      </fieldset>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between border-y bg-muted/20 px-5 py-3 text-left text-sm font-medium hover:bg-muted/30"
          >
            <span>Advanced policy controls</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen?"rotate-180":""}`} aria-hidden />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <fieldset disabled={!canConfigure||savePolicy.isPending} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Fallback sources, in order">
              <Input
                value={draft.fallbackSources}
                placeholder="ECB, REUTERS, MANUAL"
                onChange={event=>setDraft({...draft,fallbackSources:event.target.value})}
              />
            </Field>
            <Field label="Effective from">
              <Input type="date" value={draft.effectiveFrom} onChange={event=>setDraft({...draft,effectiveFrom:event.target.value})}/>
            </Field>
            <Field label="Effective to">
              <Input type="date" value={draft.effectiveTo} onChange={event=>setDraft({...draft,effectiveTo:event.target.value})}/>
            </Field>
            <Field label="Priority">
              <Input type="number" min="0" max="1000" value={draft.priority} onChange={event=>setDraft({...draft,priority:event.target.value})}/>
            </Field>
            <SelectField
              label="Missing-rate behavior"
              value={draft.missingRateBehavior}
              options={MISSING_BEHAVIORS.map(option=>option.value)}
              labels={Object.fromEntries(MISSING_BEHAVIORS.map(option=>[option.value,option.label]))}
              onChange={value=>setDraft({...draft,missingRateBehavior:value})}
            />
            <Field label="Pivot currency">
              <Input
                maxLength={3}
                disabled={!draft.allowTriangulation}
                value={draft.pivotCurrencyCode}
                placeholder="USD"
                onChange={event=>setDraft({...draft,pivotCurrencyCode:event.target.value.toUpperCase()})}
              />
            </Field>
            <BooleanField
              label="Allow triangulation"
              description="Resolve through the explicit pivot currency."
              checked={draft.allowTriangulation}
              onChange={checked=>setDraft({...draft,allowTriangulation:checked})}
            />
            <BooleanField
              label="Allow manual override"
              description="Permit a governed manual rate when policy allows."
              checked={draft.manualOverrideAllowed}
              onChange={checked=>setDraft({
                ...draft,
                manualOverrideAllowed:checked,
                manualOverrideApprovalRequired:checked&&draft.manualOverrideApprovalRequired,
              })}
            />
            <BooleanField
              label="Require override approval"
              description="Block posting until the manual rate is approved."
              checked={draft.manualOverrideApprovalRequired}
              disabled={!draft.manualOverrideAllowed}
              onChange={checked=>setDraft({...draft,manualOverrideApprovalRequired:checked})}
            />
            <div className="rounded-lg border border-dashed p-4 md:col-span-2 xl:col-span-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
                Automatic revaluation reversal
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Deferred</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Read only until the governed revaluation executor is registered. New policies retain the safe enabled server default.
              </p>
            </div>
          </fieldset>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          {validationMessage ? <span className="text-destructive">{validationMessage}</span> : null}
          {savePolicy.error ? <span className="text-destructive">{String(savePolicy.error)}</span> : null}
          {savePolicy.isSuccess ? <span className="text-emerald-700">Policy version saved.</span> : null}
        </div>
        <Button disabled={!canConfigure||savePolicy.isPending||Boolean(validationMessage)} onClick={submit}>
          <Save className="mr-2 h-4 w-4" aria-hidden />
          {savePolicy.isPending?"Saving…":saveLabel}
        </Button>
      </div>
    </section>
  );
}

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

function SelectField({
  label,value,options,labels,onChange,
}:{
  label:string;
  value:string;
  options:string[];
  labels?:Record<string,string>;
  onChange:(value:string)=>void;
}) {
  return (
    <Field label={label}>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={value} onChange={event=>onChange(event.target.value)}>
        {options.map(option=><option key={option} value={option}>{labels?.[option]??option.replaceAll("_"," ")}</option>)}
      </select>
    </Field>
  );
}

function BooleanField({
  label,description,checked,disabled,onChange,
}:{
  label:string;
  description:string;
  checked:boolean;
  disabled?:boolean;
  onChange:(checked:boolean)=>void;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-lg border p-3 ${disabled?"opacity-60":""}`}>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        disabled={disabled}
        onChange={event=>onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
