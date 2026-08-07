"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@athyper/platform-ui/primitives";
import {
  useEndBookFxOverride,
  useEndCompanyFxOverride,
  useSaveBookFxOverride,
  useSaveCompanyFxOverride,
  type FxPolicy,
} from "../../hooks/useCurrencyFxSetup";

const RATE_TYPES=["SPOT","PERIOD_AVG","PERIOD_END","BUDGET","CONTRACTED","HISTORICAL"];

export function FxPolicyOverrideDialog({
  open,
  onOpenChange,
  companyCode,
  scope,
  ledgerBook,
  source,
  override,
}:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  companyCode:string;
  scope:"company"|"book";
  ledgerBook?:{bookId:string;bookCode:string;bookName:string};
  source:FxPolicy;
  override:FxPolicy|null;
}) {
  const saveCompany=useSaveCompanyFxOverride(companyCode);
  const endCompany=useEndCompanyFxOverride(companyCode);
  const saveBook=useSaveBookFxOverride(companyCode);
  const endBook=useEndBookFxOverride(companyCode);
  const [form,setForm]=useState(()=>toForm(source,Boolean(override)));
  const [message,setMessage]=useState("");
  useEffect(()=>{
    if(open){
      setForm(toForm(source,Boolean(override)));
      setMessage("");
    }
  },[open,source,override]);
  const busy=saveCompany.isPending||endCompany.isPending||saveBook.isPending||endBook.isPending;
  const scopeLabel=scope==="book"?`${ledgerBook?.bookCode??"Book"} override`:"Company override";

  const handleSave=async()=>{
    setMessage("");
    try{
      const policy={...form,status:"active"};
      if(scope==="book"){
        if(!ledgerBook)throw new Error("An assigned ledger book is required.");
        await saveBook.mutateAsync({
          ledgerBookId:ledgerBook.bookId,
          policyId:override?.id,
          expectedVersionNo:override?.versionNo,
          policy,
        });
      }else{
        await saveCompany.mutateAsync({
          policyId:override?.id,
          expectedVersionNo:override?.versionNo,
          policy,
        });
      }
      onOpenChange(false);
    }catch(error){setMessage(error instanceof Error?error.message:`${scopeLabel} could not be saved.`);}
  };

  const handleReturn=async()=>{
    if(!override)return;
    setMessage("");
    try{
      if(scope==="book"){
        if(!ledgerBook)throw new Error("An assigned ledger book is required.");
        await endBook.mutateAsync({
          ledgerBookId:ledgerBook.bookId,
          policyId:override.id,
          expectedVersionNo:override.versionNo,
          endDate:previousDate(),
        });
      }else{
        await endCompany.mutateAsync({
          policyId:override.id,
          expectedVersionNo:override.versionNo,
          endDate:previousDate(),
        });
      }
      onOpenChange(false);
    }catch(error){setMessage(error instanceof Error?error.message:`${scopeLabel} could not be ended.`);}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{override?`Replace ${scopeLabel}`:`Create ${scopeLabel}`}</DialogTitle>
          <DialogDescription>
            {scope==="book"
              ? `${ledgerBook?.bookName??"This book"} will override Company or tenant settings.`
              : "Company settings override the tenant default only for this Company."}
            {" "}Saving always creates an immutable policy version.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 md:grid-cols-2">
          <SelectField label="Transaction rate" value={form.defaultRateType} onChange={value=>setForm({...form,defaultRateType:value})}/>
          <SelectField label="Month-end rate" value={form.revaluationRateType} onChange={value=>setForm({...form,revaluationRateType:value})}/>
          <Field label="Maximum age (days)">
            <Input type="number" min={0} value={form.maximumRateAgeDays??""} onChange={event=>setForm({...form,maximumRateAgeDays:event.target.value===""?null:Number(event.target.value)})}/>
          </Field>
          <Field label="Preferred sources">
            <Input value={form.preferredSources.join(", ")} onChange={event=>setForm({...form,preferredSources:event.target.value.split(",").map(value=>value.trim().toUpperCase()).filter(Boolean)})}/>
          </Field>
          <Field label="Effective from">
            <Input type="date" value={form.effectiveFrom} onChange={event=>setForm({...form,effectiveFrom:event.target.value})}/>
          </Field>
          <Field label="Priority">
            <Input type="number" min={0} max={1000} value={form.priority} onChange={event=>setForm({...form,priority:Number(event.target.value)})}/>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowInverse} onChange={event=>setForm({...form,allowInverse:event.target.checked})}/>Allow inverse rates</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowTriangulation} onChange={event=>setForm({...form,allowTriangulation:event.target.checked})}/>Allow triangulation</label>
          {form.allowTriangulation?<Field label="Pivot currency"><Input maxLength={3} value={form.pivotCurrencyCode??""} onChange={event=>setForm({...form,pivotCurrencyCode:event.target.value.toUpperCase()||null})}/></Field>:null}
          <Field label="Missing-rate behavior">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.missingRateBehavior} onChange={event=>setForm({...form,missingRateBehavior:event.target.value})}>
              <option value="block">Block</option>
              <option value="fallback">Fallback</option>
              <option value="manual_with_approval">Manual with approval</option>
            </select>
          </Field>
        </div>
        {message?<p className="text-sm text-destructive">{message}</p>:null}
        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {override?(
              <Button type="button" variant="outline" disabled={busy} onClick={handleReturn}>
                <RotateCcw className="mr-1.5 h-4 w-4"/>
                {scope==="book"?"Return to inherited settings":"Return to tenant default"}
              </Button>
            ):null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={busy} onClick={handleSave}>
              {busy?<Loader2 className="mr-1.5 h-4 w-4 animate-spin"/>:<Save className="mr-1.5 h-4 w-4"/>}
              {override?"Create successor":"Create override"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toForm(policy:FxPolicy,isOverride:boolean) {
  return {
    transactionContext:policy.transactionContext,
    effectiveFrom:isOverride?policy.effectiveFrom:new Date().toISOString().slice(0,10),
    effectiveTo:policy.effectiveTo,
    priority:policy.priority,
    defaultRateType:policy.defaultRateType,
    revaluationRateType:policy.revaluationRateType,
    pivotCurrencyCode:policy.pivotCurrencyCode,
    allowInverse:policy.allowInverse,
    allowTriangulation:policy.allowTriangulation,
    preferredSources:policy.preferredSources,
    maximumRateAgeDays:policy.maximumRateAgeDays,
    missingRateBehavior:policy.missingRateBehavior,
    manualOverrideAllowed:policy.manualOverrideAllowed,
    manualOverrideApprovalRequired:policy.manualOverrideApprovalRequired,
    autoReverseRevaluation:true,
  };
}
function previousDate():string{return new Date(Date.now()-86_400_000).toISOString().slice(0,10)}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>}
function SelectField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){return <Field label={label}><select className="h-10 rounded-md border bg-background px-3 text-sm" value={value} onChange={event=>onChange(event.target.value)}>{RATE_TYPES.map(type=><option key={type} value={type}>{humanize(type)}</option>)}</select></Field>}
function humanize(value:string):string{return value.replaceAll("_"," ").replace(/\b\w/g,character=>character.toUpperCase())}
