"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CloseCycleWorkbench } from "./CloseCycleWorkbench";
import type { FinanceScope } from "../lib/scope";

export interface OpeningBalanceWorkbenchProps {
  scope: FinanceScope;
  runId?: string;
  phaseCode?: string;
}

export function OpeningBalanceWorkbench({ scope, runId, phaseCode }: OpeningBalanceWorkbenchProps) {
  const [migrationStrategy, setMigrationStrategy] = useState("trial_balance");
  const [sourceSystem, setSourceSystem] = useState("");
  const [sourceCutoffDate, setSourceCutoffDate] = useState("");
  const [importRequestIds, setImportRequestIds] = useState("");
  const runData = useMemo(() => ({
    migration_strategy: migrationStrategy,
    source_system: sourceSystem.trim(),
    source_cutoff_date: sourceCutoffDate,
    import_request_ids: importRequestIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean),
  }), [migrationStrategy, sourceSystem, sourceCutoffDate, importRequestIds]);

  return (
    <div className="space-y-4">
      <section className="mx-6 mt-4 rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <div>
            <h2 className="text-sm font-semibold">Migration source contract</h2>
            <p className="text-xs text-muted-foreground">
              Failed rows are corrected in the source file and re-uploaded. Draft journal lines are the editable accounting representation.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs font-medium">Strategy
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={migrationStrategy} onChange={(event) => setMigrationStrategy(event.target.value)}>
              <option value="trial_balance">Trial balance</option>
              <option value="gl_and_subledger">GL and subledgers</option>
              <option value="carry_forward">Carry forward</option>
            </select>
          </label>
          <label className="text-xs font-medium">Source system
            <input className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} placeholder="Legacy ERP" />
          </label>
          <label className="text-xs font-medium">Cutoff date
            <input type="date" className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={sourceCutoffDate} onChange={(event) => setSourceCutoffDate(event.target.value)} />
          </label>
          <label className="text-xs font-medium">Import request IDs
            <input className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={importRequestIds} onChange={(event) => setImportRequestIds(event.target.value)} placeholder="UUIDs, comma separated" />
          </label>
        </div>
      </section>
      <CloseCycleWorkbench
        scope={{ ...scope, period: 0 }}
        runId={runId}
        phaseCode={phaseCode}
        cycleTypeCode="OPENING_BALANCE_MIGRATION"
        periodNumber={0}
        runData={runData}
        title="Opening Balance Workbench"
        description={`${scope.scopeId} · FY${scope.fiscalYear} · governed period 0 migration`}
      />
    </div>
  );
}
