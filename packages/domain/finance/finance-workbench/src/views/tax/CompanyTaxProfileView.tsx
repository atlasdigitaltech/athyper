"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, Plus, RefreshCw } from "lucide-react";
import { Button, Input, Label, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import {
  useCompanyTaxSetup,
  useSaveTaxRegistration,
  useTaxSimulation,
} from "../../hooks/useTaxSetup";

export function CompanyTaxProfileView({ companyCode }: { companyCode: string }) {
  const setup = useCompanyTaxSetup(companyCode);
  const registration = useSaveTaxRegistration(companyCode);
  const simulation = useTaxSimulation(companyCode);
  const [showRegistration, setShowRegistration] = useState(false);
  const [reg, setReg] = useState<Record<string, unknown>>({
    registrationType: "GST",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    isPrimary: true,
    companySpecific: true,
  });
  const [sim, setSim] = useState<Record<string, unknown>>({
    documentType: "purchase_invoice",
    amount: 1000,
    currency: "",
  });

  if (setup.isLoading) {
    return <PageFrame><Skeleton className="h-[600px] rounded-xl" /></PageFrame>;
  }
  if (!setup.data) {
    return (
      <PageFrame>
        <p className="rounded-xl border p-8">
          Tax settings unavailable. <Button onClick={() => setup.refetch()}>Retry</Button>
        </p>
      </PageFrame>
    );
  }

  const data = setup.data;
  return (
    <PageFrame>
      <div className="flex flex-col gap-5 pb-10">
        <header className="flex flex-col gap-3 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Finance Settings · Company Tax</p>
            <h1 className="text-xl font-semibold">{data.company.name} ({data.company.code})</h1>
            <p className="text-sm text-muted-foreground">
              Registrations, assigned tax groups, rounding, and tax-resolution testing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setup.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
            <Button asChild variant="outline">
              <Link href={`/finance/setup/tenant/${encodeURIComponent(data.company.tenantCode)}/tax`}>
                Tax definitions
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/workbench/finance/readiness?scopeId=${encodeURIComponent(companyCode)}`}>
                Review configuration
              </Link>
            </Button>
          </div>
        </header>

        <section id="tax-registrations" className="scroll-mt-24 rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h2 className="font-semibold">Registrations</h2>
              <p className="text-sm text-muted-foreground">
                Legal Entity registrations with optional Company applicability and effective dates.
              </p>
            </div>
            <Button size="sm" onClick={() => setShowRegistration((value) => !value)}>
              <Plus className="mr-1 h-4 w-4" />Add registration
            </Button>
          </div>
          {showRegistration && (
            <div className="grid gap-3 border-b bg-muted/20 p-4 sm:grid-cols-2">
              <Field label="Type">
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={String(reg.registrationType)}
                  onChange={(event) => setReg({ ...reg, registrationType: event.target.value })}
                >
                  {["VAT", "GST", "SALES_TAX", "WHT", "TAX_ID", "CUSTOMS", "EXCISE", "OTHER"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
              <Field label="Registration number">
                <Input
                  value={String(reg.registrationNumber ?? "")}
                  onChange={(event) => setReg({ ...reg, registrationNumber: event.target.value })}
                />
              </Field>
              <Field label="Jurisdiction">
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={String(reg.jurisdictionId ?? "")}
                  onChange={(event) => setReg({ ...reg, jurisdictionId: event.target.value })}
                >
                  <option value="">Select…</option>
                  {data.jurisdictions.map((jurisdiction) => (
                    <option key={String(jurisdiction.id)} value={String(jurisdiction.id)}>
                      {String(jurisdiction.code)} · {String(jurisdiction.name)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Effective from">
                <Input
                  type="date"
                  value={String(reg.effectiveFrom)}
                  onChange={(event) => setReg({ ...reg, effectiveFrom: event.target.value })}
                />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button
                  disabled={registration.isPending}
                  onClick={() => registration.mutate(reg, { onSuccess: () => setShowRegistration(false) })}
                >
                  Save registration
                </Button>
              </div>
              {registration.error && (
                <p className="text-sm text-destructive sm:col-span-2">{String(registration.error)}</p>
              )}
            </div>
          )}
          <div className="divide-y">
            {data.registrations.length ? data.registrations.map((item) => (
              <div key={String(item.id)} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{String(item.registrationType)} · {String(item.registrationNumber)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(item.jurisdictionCode)} · Effective {String(item.effectiveFrom)}
                    {item.companyCodeId ? " · Company-specific" : " · Legal Entity-wide"}
                  </p>
                </div>
                <span className="text-xs capitalize">{String(item.status)}</span>
              </div>
            )) : (
              <p className="p-5 text-sm text-muted-foreground">
                No normalized registration. Legacy value: {data.company.legacyRegistration.number ?? "none"}.
              </p>
            )}
          </div>
        </section>

        <section id="tax-groups" className="scroll-mt-24 rounded-xl border bg-card">
          <div className="border-b p-5">
            <h2 className="font-semibold">Tax groups and rounding</h2>
            <p className="text-sm text-muted-foreground">
              Assigned effective versions, ordered components, and rounding rules.
            </p>
          </div>
          <div className="divide-y">
            {data.groups.map((group) => (
              <div key={group.id} className="p-4">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{group.code} · {group.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {group.versionNo ? `v${group.versionNo}` : "Legacy"}
                    {group.roundingRuleId ? " · Rounding assigned" : " · No rounding rule"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {group.components.map((component) => (
                    `${component.calculationSeq}. ${component.componentCode ?? component.taxRateScheduleId}`
                  )).join(" → ") || "No effective components"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="tax-resolution" className="scroll-mt-24 rounded-xl border bg-card">
          <div className="border-b p-5">
            <h2 className="font-semibold">Test tax resolution</h2>
            <p className="text-sm text-muted-foreground">
              Test rule selection, component math, WHT thresholds, and rounding before using the configuration.
            </p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-4">
            <Field label="Document type">
              <Input
                value={String(sim.documentType)}
                onChange={(event) => setSim({ ...sim, documentType: event.target.value })}
              />
            </Field>
            <Field label="Amount">
              <Input
                type="number"
                value={String(sim.amount)}
                onChange={(event) => setSim({ ...sim, amount: Number(event.target.value) })}
              />
            </Field>
            <Field label="Currency">
              <Input
                maxLength={3}
                placeholder={data.company.functionalCurrency}
                value={String(sim.currency)}
                onChange={(event) => setSim({ ...sim, currency: event.target.value.toUpperCase() })}
              />
            </Field>
            <div className="flex items-end">
              <Button
                onClick={() => simulation.mutate({
                  ...sim,
                  currency: sim.currency || data.company.functionalCurrency,
                  billToJurisdictionId: data.registrations.find((item) => item.isPrimary)?.jurisdictionId
                    ?? data.company.legacyRegistration.jurisdictionId,
                })}
              >
                <Play className="mr-2 h-4 w-4" />Run test
              </Button>
            </div>
          </div>
          {simulation.data && (
            <div className="border-t p-5">
              <strong>
                {simulation.data.ambiguous
                  ? "Ambiguous rules"
                  : simulation.data.winner
                    ? `Selected rule: ${String(simulation.data.winner.ruleCode)}`
                    : "No matching rule"}
              </strong>
              {simulation.data.winner && (
                <p className="mt-1 text-sm">
                  Tax {simulation.data.totals.taxAmount.toFixed(2)} · WHT {simulation.data.totals.whtAmount.toFixed(2)}
                  {" "}· Gross {simulation.data.totals.grossAmount?.toFixed(2)}
                </p>
              )}
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Rule trace</h3>
                  {simulation.data.candidates.map((candidate) => (
                    <p key={candidate.ruleId} className="mt-2 text-xs">
                      {candidate.matched ? "Matched" : "Rejected"} · {candidate.ruleCode} P{candidate.priority}
                      {" "}{candidate.reasons.join("; ")}
                    </p>
                  ))}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Calculated components</h3>
                  {simulation.data.components.map((component, index) => (
                    <p key={index} className="mt-2 text-xs">
                      {index + 1}. {String(component.componentCode ?? "Tax")} · base
                      {" "}{Number(component.baseAmount).toFixed(2)} · {Number(component.effectiveRate)}
                      {" "}· tax {Number(component.taxAmount).toFixed(2)}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
          {simulation.error && <p className="border-t p-4 text-sm text-destructive">{String(simulation.error)}</p>}
        </section>
      </div>
    </PageFrame>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}
