"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, LockKeyhole, Save } from "lucide-react";
import type { MetaEntityField, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { readRecordValue } from "@athyper/runtime-shared/meta-entity";
import { Button } from "@athyper/ui/primitives";
import { FieldRow } from "@athyper/content-ui";
import {
  defaultFormValue,
  isEmptyFormValue,
  parseFieldValue,
  RuntimeEditInput,
  type FormPrimitive,
  type FormValues,
} from "../edit/runtime-edit-form";

export interface GovernedEntityCommandResult {
  id?:string;
  record?:Record<string,unknown>;
}

export interface GovernedEntityFormProps {
  descriptor:MetaEntityRuntimeDescriptor;
  mode:"create"|"replace";
  record?:RuntimeRecordRow;
  fieldNames:string[];
  lockedFieldNames?:string[];
  clearedFieldNames?:string[];
  title:string;
  description:string;
  submitLabel:string;
  backHref:string;
  onSubmit:(values:Record<string,unknown>)=>Promise<GovernedEntityCommandResult>;
  onSuccessHref?:(result:GovernedEntityCommandResult)=>string;
}

export function GovernedEntityForm({
  descriptor,
  mode,
  record,
  fieldNames,
  lockedFieldNames=[],
  clearedFieldNames=[],
  title,
  description,
  submitLabel,
  backHref,
  onSubmit,
  onSuccessHref,
}:GovernedEntityFormProps) {
  const allowed=new Set(fieldNames);
  const locked=new Set(lockedFieldNames);
  const cleared=new Set(clearedFieldNames);
  const fields=useMemo(
    ()=>descriptor.fields
      .filter(field=>allowed.has(field.name))
      .sort((left,right)=>left.order-right.order),
    [descriptor.fields,fieldNames.join("|")],
  );
  const [values,setValues]=useState<FormValues>(()=>buildInitialValues(fields,record,cleared));
  const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(saving)return;
    const data:Record<string,unknown>={};
    const errors:Record<string,string>={};
    for(const field of fields){
      const raw=values[field.name]??defaultFormValue(field);
      if(field.isRequired&&isEmptyFormValue(raw)){
        errors[field.name]=`${field.label} is required.`;
        continue;
      }
      const parsed=parseFieldValue(field,raw);
      if(parsed.status==="error")errors[field.name]=parsed.message;
      else data[field.name]=parsed.value;
    }
    if(Object.keys(errors).length){
      setFieldErrors(errors);
      setMessage("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    setFieldErrors({});
    setMessage("");
    try{
      const result=await onSubmit(data);
      const destination=onSuccessHref?.(result);
      if(destination){
        window.location.assign(destination);
        return;
      }
      setMessage("Command completed.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"The governed command failed.");
    }finally{
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <header className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a href={backHref} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to {descriptor.entityName}
            </a>
            <h1 className="mt-3 text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden />Governed command
          </span>
        </div>
      </header>
      <form onSubmit={submit} className="rounded-xl border bg-card">
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {fields.map(field=>{
            const inputId=`governed-${mode}-${field.name}`;
            const labelId=`${inputId}-label`;
            const error=fieldErrors[field.name];
            const value=values[field.name]??defaultFormValue(field);
            const original=record?readRecordValue(record,field):defaultFormValue(field);
            const dirty=value!==original;
            const isLocked=locked.has(field.name);
            return (
              <FieldRow key={field.name} dirty={dirty} invalid={Boolean(error)} className="rounded-md border">
                <FieldRow.Label htmlFor={inputId} required={field.isRequired} helpText={field.description}>
                  <span id={labelId}>{field.label}</span>
                </FieldRow.Label>
                {isLocked ? (
                  <FieldRow.Read
                    reason="readonly"
                    reasonMessage="Identity field retained from the prior version."
                    inherited={mode==="replace"}
                    sourceLabel={mode==="replace"?"Prior governed version":undefined}
                    empty={value===""}
                  >
                    {String(value)}
                  </FieldRow.Read>
                ) : (
                  <FieldRow.Edit error={error} errorId={error?`${inputId}-error`:undefined} dirty={dirty}>
                    <RuntimeEditInput
                      field={field}
                      inputId={inputId}
                      labelId={labelId}
                      value={value}
                      disabled={saving}
                      entitySlug={descriptor.entityCode}
                      recordId={readId(record)??"new"}
                      formValues={values}
                      onChange={next=>setValues(current=>({...current,[field.name]:next}))}
                      ariaDescribedBy={error?`${inputId}-error`:undefined}
                    />
                  </FieldRow.Edit>
                )}
              </FieldRow>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className={`text-sm ${message&&message!=="Command completed."?"text-destructive":"text-muted-foreground"}`}>{message}</p>
          <div className="flex gap-2">
            <Button asChild type="button" variant="outline"><a href={backHref}>Cancel</a></Button>
            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" aria-hidden />{saving?"Saving…":submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function buildInitialValues(
  fields:MetaEntityField[],
  record:RuntimeRecordRow|undefined,
  cleared:Set<string>,
):FormValues {
  return Object.fromEntries(fields.map(field=>{
    if(cleared.has(field.name))return [field.name,""];
    const value=record?readRecordValue(record,field):undefined;
    if(typeof value==="boolean"||typeof value==="string")return [field.name,value];
    if(typeof value==="number")return [field.name,String(value)];
    return [field.name,defaultFormValue(field)];
  }));
}

function readId(record:RuntimeRecordRow|undefined):string|undefined {
  const value=record?.id??record?.data?.["id"];
  return typeof value==="string"?value:undefined;
}
