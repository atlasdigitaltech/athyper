"use client";
import {useEffect,useRef,useState} from "react";
import {createOperation,encodePathSegment} from "@athyper/platform-api-client";
import {useApiClient,usePermissions} from "@athyper/platform-shell-app-foundation";
import {Card,Button,Input,Label} from "@athyper/platform-ui";

type Registration={bank_account_link_id:string;account_last4:string;status:string};
const register=createOperation<{registration:Registration;replayed:boolean},unknown>({
  method:"POST",path:({businessPartnerId})=>`/api/neon/business-partners/${encodePathSegment(String(businessPartnerId))}/protected-bank-registrations`,idempotency:"required",
});
/** Partner-level facts only. A captured account is not authorization to settle a transaction. */
export function BankRegistrationControls({businessPartnerId,onChanged}:{businessPartnerId:string;onChanged?:()=>void}){
  return <BankRegistrationForm key={businessPartnerId} businessPartnerId={businessPartnerId} onChanged={onChanged}/>;
}
function BankRegistrationForm({businessPartnerId,onChanged}:{businessPartnerId:string;onChanged?:()=>void}){
  const http=useApiClient(),permissions=usePermissions();
  const [busy,setBusy]=useState(false),[error,setError]=useState<"rejected"|"unknown">(),[saved,setSaved]=useState<Registration>();
  const inFlight=useRef(false),active=useRef(true);
  const attempt=useRef<{key:string;body:Record<string,string>}|undefined>(undefined);
  const [kind,setKind]=useState("iban");
  useEffect(()=>{active.current=true;return()=>{active.current=false;attempt.current=undefined;};},[]);
  if(!permissions.has("neon.business_partner_bank.register"))return null;
  return <Card><h2>Add bank account</h2><p>Capture partner bank facts without supplier/customer or company setup.</p>
    <form onSubmit={event=>{
      event.preventDefault();if(inFlight.current)return;
      const form=event.currentTarget;
      const body=Object.fromEntries([...new FormData(form).entries()].map(([key,value])=>[key,String(value).trim()]));
      for(const key of ["currencyCode","bankCountryCode","bic"]) if(body[key]) body[key]=body[key].toUpperCase();
      if(!attempt.current)attempt.current={key:`partner-bank-${crypto.randomUUID()}`,body};
      // Keep the same request body/key after an ambiguous timeout; do not create a second account.
      const request=attempt.current;inFlight.current=true;setBusy(true);setError(undefined);
      void http.request(register,{params:{businessPartnerId},body:{...request.body,idempotencyKey:request.key},idempotencyKey:request.key})
        .then(result=>{if(!active.current)return;setSaved(result.registration);attempt.current=undefined;form.reset();setKind("iban");onChanged?.();})
        .catch(cause=>{if(!active.current)return;const rejected=cause && [400,422].includes(cause.status);if(rejected)attempt.current=undefined;setError(rejected?"rejected":"unknown");})
        .finally(()=>{inFlight.current=false;if(active.current)setBusy(false);});
    }}><fieldset disabled={busy||error==="unknown"}>
      <Label htmlFor="bank-holder">Account holder</Label><Input id="bank-holder" name="accountHolderName" required/>
      <Label htmlFor="bank-kind">Account identifier type</Label><select id="bank-kind" name="accountIdType" value={kind} onChange={e=>setKind(e.target.value)}><option value="iban">IBAN</option><option value="local">Domestic account</option></select>
      <Label htmlFor="bank-identifier">Account identifier</Label><Input id="bank-identifier" name="accountIdentifier" type="password" autoComplete="off" required/>
      <Label htmlFor="bank-currency">Currency</Label><Input id="bank-currency" name="currencyCode" maxLength={3} required/>
      <Label htmlFor="bank-name">Bank name</Label><Input id="bank-name" name="bankName" required/>
      <Label htmlFor="bank-country">Bank country</Label><Input id="bank-country" name="bankCountryCode" maxLength={2} required/>
      <Label htmlFor="bank-bic">BIC (optional)</Label><Input id="bank-bic" name="bic"/>
      {kind==="local"?<><Label htmlFor="bank-scheme">Clearing scheme</Label><Input id="bank-scheme" name="clearingScheme" required/><Label htmlFor="bank-branch">Branch code</Label><Input id="bank-branch" name="branchCode"/></>:null}
    </fieldset><Button type="submit" disabled={busy}>{error==="unknown"?"Retry same registration":"Save protected bank account"}</Button>
    {error?<p role="alert">{error==="unknown"?"Registration could not be confirmed. Retry sends the same request safely; it does not create a new attempt.":"Registration was rejected. Correct the fields and submit again."}</p>:null}
    </form>{saved?<p role="status">Bank account ending {saved.account_last4} saved.</p>:null}
  </Card>;
}
