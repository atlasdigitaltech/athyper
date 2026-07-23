"use client";

import Link from "next/link";
import { ArrowUpRight, BookOpen, ListTree } from "lucide-react";
import { ChartAssignmentPanel } from "../configure/ChartAndBookAssignmentPanels";
import { GlControlsGrid } from "../configure/GlControlsGrid";

export function AccountsFoundationPanel({ companyCode }: { companyCode: string }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border bg-card p-5" aria-labelledby="tenant-definitions-title">
        <div><h2 id="tenant-definitions-title" className="font-semibold">Tenant definitions</h2><p className="mt-1 text-sm text-muted-foreground">Charts and GL Accounts are reusable tenant records. Manage their definitions in the canonical Entity App, then assign them below.</p></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link href="/app/chart_of_account" className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/30"><ListTree className="h-5 w-5 text-muted-foreground" /><div className="mr-auto"><p className="text-sm font-medium">Chart of Accounts</p><p className="text-xs text-muted-foreground">Definitions, versions, lifecycle and relationships</p></div><ArrowUpRight className="h-4 w-4" /></Link>
          <Link href="/app/gl_account" className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/30"><BookOpen className="h-5 w-5 text-muted-foreground" /><div className="mr-auto"><p className="text-sm font-medium">GL Accounts</p><p className="text-xs text-muted-foreground">Hierarchy, classification and posting nodes</p></div><ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </section>
      <ChartAssignmentPanel companyCode={companyCode} />
      <GlControlsGrid companyCode={companyCode} />
    </div>
  );
}
