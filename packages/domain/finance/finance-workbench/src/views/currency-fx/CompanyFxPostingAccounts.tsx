"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@athyper/platform-ui/primitives";
import { useSavePostingRoleAccountMap } from "../../hooks/usePostingRoleCoverage";
import type {
  CompanyFxPostingCell,
  CompanyFxPostingRow,
  CurrencyFxSetupPayload,
} from "../../hooks/useCurrencyFxSetup";

const ROLE_ORDER=["fx_gain","fx_loss"] as const;

export function CompanyFxPostingAccounts({
  companyCode,asOfDate,postingAccounts,
}:{
  companyCode:string;
  asOfDate:string;
  postingAccounts:CurrencyFxSetupPayload["postingAccounts"];
}) {
  const save=useSavePostingRoleAccountMap(companyCode);
  const rowsByRole=useMemo(
    ()=>new Map(postingAccounts.rows.map(row=>[row.roleCode,row])),
    [postingAccounts.rows],
  );
  const initial=useMemo(()=>selectionFrom(postingAccounts.rows),[postingAccounts.rows]);
  const [selection,setSelection]=useState<Record<string,string>>(initial);
  const [message,setMessage]=useState("");
  useEffect(()=>setSelection(initial),[initial]);
  const changed=postingAccounts.rows.flatMap(row=>row.cells.map(cell=>({row,cell}))).filter(({row,cell})=>
    (selection[key(row.roleCode,cell.bookId)]??"")!==(cell.glAccountId??""),
  );

  const handleSave=async()=>{
    setMessage("");
    try{
      for(const {row,cell} of changed){
        const glAccountId=selection[key(row.roleCode,cell.bookId)];
        if(!glAccountId)continue;
        await save.mutateAsync({
          mappingId:cell.mappingId??undefined,
          companyCode,
          roleCode:row.roleCode,
          ledgerBookId:cell.bookId,
          glAccountId,
          effectiveFrom:cell.effectiveFrom??asOfDate,
          priority:cell.priority??100,
        });
      }
      setMessage("FX posting-account assignments saved.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"FX posting-account assignments could not be saved.");
    }
  };

  return (
    <section id="fx-posting-accounts" className="scroll-mt-24 rounded-xl border bg-card" aria-labelledby="fx-posting-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <h2 id="fx-posting-title" className="font-semibold">Posting accounts</h2>
          <p className="mt-1 text-sm text-muted-foreground">Assign FX gain and loss accounts by ledger book.</p>
        </div>
        <Button size="sm" disabled={save.isPending||changed.length===0||changed.some(({row,cell})=>!selection[key(row.roleCode,cell.bookId)])} onClick={handleSave}>
          {save.isPending?<Loader2 className="mr-1.5 h-4 w-4 animate-spin"/>:<Save className="mr-1.5 h-4 w-4"/>}
          Save account assignments
        </Button>
      </div>

      {postingAccounts.books.length===0 ? (
        <p className="p-5 text-sm text-muted-foreground">Assign an active ledger book before configuring FX posting accounts.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Ledger book</th>
                <th className="px-4 py-3">FX gain account</th>
                <th className="px-4 py-3">FX loss account</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {postingAccounts.books.map(book=>{
                const cells=ROLE_ORDER.map(roleCode=>{
                  const row=rowsByRole.get(roleCode);
                  return {row,cell:row?.cells.find(candidate=>candidate.bookId===book.bookId)};
                });
                return (
                  <tr key={book.bookId}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{book.bookCode}{book.isPrimary?<span className="ml-2 text-xs text-muted-foreground">Primary</span>:null}</p>
                      <p className="text-xs text-muted-foreground">{book.bookName}</p>
                    </td>
                    {cells.map(({row,cell},index)=>(
                      <td key={ROLE_ORDER[index]} className="px-4 py-3">
                        {row&&cell?(
                          <AccountSelect
                            row={row}
                            cell={cell}
                            value={selection[key(row.roleCode,cell.bookId)]??""}
                            accounts={postingAccounts.accounts}
                            onChange={value=>setSelection(current=>({...current,[key(row.roleCode,cell.bookId)]:value}))}
                          />
                        ):<span className="text-xs text-destructive">Role unavailable</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {message?<p className={`border-t px-5 py-3 text-sm ${message.includes("saved")?"text-emerald-700":"text-destructive"}`}>{message}</p>:null}
    </section>
  );
}

function AccountSelect({
  row,cell,value,accounts,onChange,
}:{
  row:CompanyFxPostingRow;
  cell:CompanyFxPostingCell;
  value:string;
  accounts:CurrencyFxSetupPayload["postingAccounts"]["accounts"];
  onChange:(value:string)=>void;
}) {
  const compatible=row.normalBalance==="either"
    ? accounts
    : accounts.filter(account=>account.normalBalance.toLowerCase()===row.normalBalance.toLowerCase());
  return (
    <div>
      <select
        aria-label={`${row.roleName} for ${cell.bookCode}`}
        className={`h-9 w-full min-w-56 rounded-md border bg-background px-2 text-sm ${cell.status==="invalid"?"border-destructive/60":""}`}
        value={value}
        onChange={event=>onChange(event.target.value)}
      >
        <option value="">Select account</option>
        {compatible.map(account=>(
          <option key={account.glAccountId} value={account.glAccountId}>{account.accountCode} · {account.accountName}</option>
        ))}
      </select>
      {cell.status==="invalid"?<p className="mt-1 text-xs text-destructive">Current account is not postable.</p>:null}
    </div>
  );
}

function selectionFrom(rows:CompanyFxPostingRow[]):Record<string,string> {
  return Object.fromEntries(rows.flatMap(row=>row.cells.map(cell=>[key(row.roleCode,cell.bookId),cell.glAccountId??""])));
}
function key(roleCode:string,bookId:string):string{return `${roleCode}:${bookId}`}
