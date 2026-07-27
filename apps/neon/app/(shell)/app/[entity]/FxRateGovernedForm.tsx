"use client";

import { GovernedEntityForm, type GovernedEntityCommandResult } from "@athyper/runtime-canvas";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";

const FX_RATE_FIELDS=[
  "from_currency",
  "to_currency",
  "rate",
  "rate_type",
  "effective_date",
  "effective_time",
  "source",
  "source_reference",
];
const NATURAL_KEY_FIELDS=[
  "from_currency",
  "to_currency",
  "rate_type",
  "effective_date",
  "effective_time",
  "source",
];

export function FxRateGovernedForm({
  tenantCode,
  descriptor,
  mode,
  record,
}:{
  tenantCode:string;
  descriptor:MetaEntityRuntimeDescriptor;
  mode:"create"|"replace";
  record?:RuntimeRecordRow;
}) {
  const rateId=readString(record,"id");
  const versionNo=Number(readValue(record,"version_no")??0);
  const submit=async(values:Record<string,unknown>):Promise<GovernedEntityCommandResult>=>{
    const row={
      fromCurrency:values["from_currency"],
      toCurrency:values["to_currency"],
      rate:values["rate"],
      rateType:values["rate_type"],
      effectiveDate:values["effective_date"],
      effectiveTime:values["effective_time"]||null,
      source:values["source"],
      sourceReference:values["source_reference"]||null,
    };
    const base=`/api/finance/setup/tenant/${encodeURIComponent(tenantCode)}/fx/rates`;
    const response=await fetch(
      mode==="replace"?`${base}/${encodeURIComponent(rateId)}/replace`:base,
      {
        method:"POST",
        credentials:"include",
        headers:{"content-type":"application/json"},
        body:JSON.stringify(mode==="replace"?{...row,expectedVersionNo:versionNo}:row),
      },
    );
    const result=await response.json().catch(()=>({})) as Record<string,unknown>;
    if(!response.ok)throw new Error(typeof result["message"]==="string"?result["message"]:`FX rate command failed (${response.status}).`);
    return {id:typeof result["id"]==="string"?result["id"]:undefined,record:result};
  };
  return (
    <GovernedEntityForm
      descriptor={descriptor}
      mode={mode}
      record={record}
      fieldNames={FX_RATE_FIELDS}
      lockedFieldNames={mode==="replace"?NATURAL_KEY_FIELDS:[]}
      clearedFieldNames={mode==="replace"?["source_reference"]:[]}
      title={mode==="replace"?"Replace FX rate":"Add FX rate"}
      description={mode==="replace"
        ?"The existing record remains immutable and inspectable. This command creates its active successor."
        :"Create one active, source-specific rate through the same domain service used by imports."}
      submitLabel={mode==="replace"?"Create successor rate":"Add rate"}
      backHref={rateId?`/app/fx_rate/${encodeURIComponent(rateId)}`:"/app/fx_rate"}
      onSubmit={submit}
      onSuccessHref={result=>`/app/fx_rate/${encodeURIComponent(result.id??rateId)}`}
    />
  );
}

function readValue(record:RuntimeRecordRow|undefined,key:string):unknown {
  return record?.data?.[key]??record?.[key];
}

function readString(record:RuntimeRecordRow|undefined,key:string):string {
  const value=readValue(record,key);
  return typeof value==="string"?value:"";
}
