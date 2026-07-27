"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, History, Settings2 } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import type {
  CurrencyFxSetupPayload,
  FxPolicy,
} from "../../hooks/useCurrencyFxSetup";
import { FxPolicyOverrideDialog } from "./FxPolicyOverrideDialog";

export function CompanyFxAdvancedAdministration({data}:{data:CurrencyFxSetupPayload}) {
  const inherited=data.policy.companyOverride??data.policy.tenantDefault;
  const [selectedBookId,setSelectedBookId]=useState<string|null>(null);
  const selectedBook=data.policy.availableBooks.find(book=>book.bookId===selectedBookId);
  const selectedOverride=data.policy.bookOverrides.find(policy=>policy.ledgerBookId===selectedBookId)??null;
  if(!data.permissions.advancedConfigure.allowed)return null;

  return (
    <section id="fx-advanced" className="scroll-mt-24 rounded-xl border bg-card" aria-labelledby="fx-advanced-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" aria-hidden />
            <h2 id="fx-advanced-title" className="font-semibold">Advanced</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure ledger-book policy overrides and inspect immutable policy history.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/app/fx_policy"><History className="mr-1.5 h-4 w-4"/>Policy history</Link>
        </Button>
      </div>

      <div className="p-5">
        <BookOverrideMatrix data={data} inherited={inherited} onEdit={setSelectedBookId}/>
      </div>

      {inherited&&selectedBook?(
        <FxPolicyOverrideDialog
          open={Boolean(selectedBookId)}
          onOpenChange={open=>{if(!open)setSelectedBookId(null)}}
          companyCode={data.company.code}
          scope="book"
          ledgerBook={selectedBook}
          source={selectedOverride??inherited}
          override={selectedOverride}
        />
      ):null}
    </section>
  );
}

function BookOverrideMatrix({
  data,inherited,onEdit,
}:{
  data:CurrencyFxSetupPayload;
  inherited:FxPolicy|null;
  onEdit:(bookId:string)=>void;
}) {
  const overrides=useMemo(
    ()=>new Map(data.policy.bookOverrides.map(policy=>[policy.ledgerBookId,policy])),
    [data.policy.bookOverrides],
  );
  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">Ledger-book policy overrides</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Books use company or tenant settings unless an explicit exception is created here.
        </p>
      </div>
      {data.policy.availableBooks.length===0?(
        <p className="p-4 text-sm text-muted-foreground">No active ledger books are assigned.</p>
      ):(
        <div className="divide-y">
          {data.policy.availableBooks.map(book=>{
            const override=overrides.get(book.bookId)??null;
            return (
              <div key={book.bookId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{book.bookCode} · {book.bookName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {override
                      ? `Book override version ${override.versionNo} · ${override.defaultRateType}/${override.revaluationRateType}`
                      : "Uses company or tenant settings"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {override?(
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/app/fx_policy/${encodeURIComponent(override.id)}`}>
                        <Eye className="mr-1 h-4 w-4"/>View version
                      </Link>
                    </Button>
                  ):null}
                  <Button size="sm" variant="outline" disabled={!inherited} onClick={()=>onEdit(book.bookId)}>
                    {override?"Edit override":"Create book override"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
