"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Database, Plus, RefreshCw } from "lucide-react";
import { Button } from "@athyper/platform-ui/primitives";
import {
  useFinanceAggregateEntities,
  type AggregateEntityDefinition,
  type AggregateRuntimeRecord,
} from "../../hooks/useFinanceAggregateEntities";

export type FinanceAggregateKind = "dimensions" | "tax" | "payments";

const DEFINITIONS: Record<FinanceAggregateKind, {
  title: string;
  description: string;
  entities: AggregateEntityDefinition[];
}> = {
  dimensions: {
    title: "Dimension Policy Editor",
    description: "Required, optional, and forbidden dimension validation with governed allowed values; derivation remains a separate accounting-profile rule.",
    entities: [
      { entityCode: "dimension_policy", label: "Policies", description: "Scope and enforcement behavior", role: "root" },
      { entityCode: "dimension_policy_allowed_value", label: "Allowed values", description: "Auditable policy value restrictions", role: "child" },
      { entityCode: "acct_profile_dimension_rule", label: "Derivation rules", description: "Accounting-profile dimension derivation", role: "child" },
      { entityCode: "dimension_type", label: "Dimension types", description: "Canonical dimension definitions", role: "reference" },
      { entityCode: "dimension_value", label: "Dimension values", description: "Canonical selectable values", role: "reference" },
    ],
  },
  tax: {
    title: "Tax Group and Rate Schedule Editor",
    description: "Tax bundles, effective-dated rates and context resolution in one configuration surface.",
    entities: [
      { entityCode: "tax_group", label: "Tax groups", description: "Named tax bundles", role: "root" },
      { entityCode: "tax_group_component", label: "Components", description: "Ordered group rate components", role: "child" },
      { entityCode: "tax_rate_schedule", label: "Rate schedules", description: "Effective-dated atomic rates", role: "child" },
      { entityCode: "tax_resolution_rule", label: "Resolution rules", description: "Context-to-group resolution", role: "child" },
      { entityCode: "tax_jurisdiction", label: "Jurisdictions", description: "Canonical tax jurisdictions", role: "reference" },
      { entityCode: "tax_type", label: "Tax types", description: "Canonical tax classifications", role: "reference" },
    ],
  },
  payments: {
    title: "Payment Policy and Bank Interface Editor",
    description: "Company eligibility, bank delivery routing and posting-role settlement configuration.",
    entities: [
      { entityCode: "payment_method_company_policy", label: "Company policies", description: "Eligibility, defaults, cutoffs and house banks", role: "root" },
      { entityCode: "bank_interface_profile", label: "Bank interfaces", description: "File, API, print and manual delivery profiles", role: "root" },
      { entityCode: "payment_method_interface_binding", label: "Interface bindings", description: "Method-to-interface priority routing", role: "child" },
      { entityCode: "payment_settlement_rule", label: "Settlement rules", description: "Posting-role-based settlement accounting", role: "child" },
      { entityCode: "bank_format_rule", label: "Bank format rules", description: "Country and payment-rail validation", role: "reference" },
      { entityCode: "payment_method", label: "Payment methods", description: "Canonical payment method master", role: "reference" },
      { entityCode: "bank_account_link", label: "House-bank links", description: "Company-to-bank-account links", role: "reference" },
    ],
  },
};

function value(record: AggregateRuntimeRecord, names: string[]): string | null {
  for (const name of names) {
    const candidate = record.data[name];
    if (candidate !== null && candidate !== undefined && String(candidate).trim()) return String(candidate);
  }
  return null;
}

function recordTitle(record: AggregateRuntimeRecord): string {
  return value(record, ["name", "code", "policy_code", "description", "payment_method_id", "tax_group_id", "dimension_value_id"])
    ?? record.id;
}

function recordSubtitle(record: AggregateRuntimeRecord): string {
  const parts = [
    value(record, ["behavior", "direction", "tax_direction", "interface_type", "book_code"]),
    value(record, ["effective_from", "created_at"]),
    value(record, ["status"]),
  ].filter(Boolean);
  return parts.join(" · ") || "Configuration record";
}

export function FinanceAggregateEditor({ kind, companyCode }: { kind: FinanceAggregateKind; companyCode?: string }) {
  const definition = DEFINITIONS[kind];
  const [activeCode, setActiveCode] = useState(definition.entities[0]!.entityCode);
  const results = useFinanceAggregateEntities([
    ...definition.entities,
    { entityCode: "company_code", label: "Companies", description: "Scope resolver", role: "reference" },
  ], [activeCode, "company_code"]);
  const entities = results.slice(0, definition.entities.length);
  const companyRecords = results[definition.entities.length]?.records ?? [];
  const companyScopeId = companyRecords.find((record) =>
    value(record, ["code", "company_code"])?.toLowerCase() === companyCode?.toLowerCase(),
  )?.id;
  const [search, setSearch] = useState("");
  const active = entities.find((entity) => entity.entityCode === activeCode) ?? entities[0]!;
  const records = useMemo(() => active.records.filter((record) => {
    const recordCompanyId = value(record, ["company_code_id"]);
    if (companyScopeId && recordCompanyId && recordCompanyId !== companyScopeId) return false;
    const query = search.trim().toLowerCase();
    return !query || JSON.stringify(record.data).toLowerCase().includes(query);
  }), [active.records, companyScopeId, search]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold">{definition.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{definition.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">Current scope: {companyCode || "tenant"}. Tenant isolation remains enforced by the runtime.</p>
        </div>
        <Button asChild size="sm"><Link href={`/app/${active.entityCode}/new`}><Plus className="mr-2 h-4 w-4" />New {active.label}</Link></Button>
      </header>

      {kind === "payments" ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />Bank-interface provider credentials are read-only here until the encrypted credential contract is installed.
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {entities.map((entity) => (
          <button key={entity.entityCode} type="button" onClick={() => setActiveCode(entity.entityCode)} className={`rounded-xl border p-4 text-left transition-colors ${active.entityCode === entity.entityCode ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-medium">{entity.label}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{entity.isLoading ? "…" : entity.isFetched ? entity.records.length : "—"}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">{entity.description}</p>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{entity.role}</p>
          </button>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div><h3 className="font-semibold">{active.label}</h3><p className="text-xs text-muted-foreground">{active.entityCode}</p></div>
          <div className="flex gap-2"><input className="h-9 w-64 rounded-md border bg-background px-3 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search loaded records" /><Button asChild variant="outline" size="sm"><Link href={`/app/${active.entityCode}`}><Database className="mr-2 h-4 w-4" />Entity List</Link></Button></div>
        </div>
        {active.error ? <div className="flex gap-2 p-5 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{active.error.message}</div> : null}
        {active.isLoading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Loading {active.label.toLowerCase()}…</div> : null}
        {!active.isLoading && !active.error && records.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No records found. Create the first record with its canonical Entity form.</div> : null}
        {records.length > 0 ? <div className="divide-y">{records.map((record) => <div key={record.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-medium">{recordTitle(record)}</p><p className="mt-1 truncate text-xs text-muted-foreground">{recordSubtitle(record)}</p></div><div className="flex shrink-0 gap-2"><Button asChild variant="outline" size="sm"><Link href={`/app/${active.entityCode}/${record.id}`}>View</Link></Button><Button asChild variant="ghost" size="sm"><Link href={`/app/${active.entityCode}/${record.id}/edit`}>Edit <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link></Button></div></div>)}</div> : null}
      </section>
    </div>
  );
}
