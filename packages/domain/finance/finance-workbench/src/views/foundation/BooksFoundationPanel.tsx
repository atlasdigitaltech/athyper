"use client";

import Link from "next/link";
import { ArrowUpRight, BookCopy } from "lucide-react";
import { BookAssignmentPanel } from "../configure/ChartAndBookAssignmentPanels";

export function BooksFoundationPanel({ companyCode }: { companyCode: string }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border bg-card p-5" aria-labelledby="book-definitions-title">
        <h2 id="book-definitions-title" className="font-semibold">Tenant definitions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ledger Books are reusable tenant records. The tenant default helps provisioning; each Company chooses its own explicit default below.</p>
        <Link href="/app/ledger_book" className="mt-4 flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/30">
          <BookCopy className="h-5 w-5 text-muted-foreground" />
          <div className="mr-auto"><p className="text-sm font-medium">Ledger Books</p><p className="text-xs text-muted-foreground">Definitions, reporting standards, currencies and posting behavior</p></div>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </section>
      <BookAssignmentPanel companyCode={companyCode} />
    </div>
  );
}
