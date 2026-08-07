"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button, Input, Label, Skeleton } from "@athyper/platform-ui/primitives";
import { PageFrame } from "@athyper/platform-ui/layout";
import {
  usePaymentTerms,
  useSavePaymentTerm,
  type PaymentTerm,
} from "../../hooks/usePaymentsSetup";

type Row = Record<string, unknown>;
type Form = {
  termId?: string;
  replacesPaymentTermId?: string;
  code: string;
  name: string;
  applicableTo: string;
  baseEvent: string;
  dueRuleType: string;
  dueDays: string;
  dueDayOfMonth: string;
  graceDays: string;
  businessDayConvention: string;
  holidayCalendarId: string;
  status: string;
  clauses: Row[];
  discountTiers: Row[];
};

const blank = (): Form => ({
  code: "",
  name: "",
  applicableTo: "BOTH",
  baseEvent: "INVOICE_DATE",
  dueRuleType: "NET_DAYS",
  dueDays: "30",
  dueDayOfMonth: "",
  graceDays: "0",
  businessDayConvention: "NONE",
  holidayCalendarId: "",
  status: "draft",
  clauses: [],
  discountTiers: [],
});

export function PaymentTermWorkbench({ tenantCode }: { tenantCode: string }) {
  const definitions = usePaymentTerms(tenantCode);
  const save = useSavePaymentTerm(tenantCode);
  const [selected, setSelected] = useState<PaymentTerm | null>(null);
  const [form, setForm] = useState<Form>(blank());

  useEffect(() => {
    if (!selected) return;
    setForm({
      termId: selected.id,
      code: selected.code,
      name: selected.name,
      applicableTo: String(selected.applicableTo ?? "BOTH"),
      baseEvent: String(selected.baseEvent ?? "INVOICE_DATE"),
      dueRuleType: selected.dueRuleType,
      dueDays: selected.dueDays == null ? "" : String(selected.dueDays),
      dueDayOfMonth: selected.dueDayOfMonth == null ? "" : String(selected.dueDayOfMonth),
      graceDays: String(selected.graceDays ?? 0),
      businessDayConvention: String(selected.businessDayConvention ?? "NONE"),
      holidayCalendarId: String(selected.holidayCalendarId ?? ""),
      status: selected.status,
      clauses: selected.clauses.map((row) => ({ ...row })),
      discountTiers: selected.discountTiers.map((row) => ({ ...row })),
    });
  }, [selected]);

  if (definitions.isLoading)
    return (
      <PageFrame>
        <Skeleton className="h-[650px] rounded-xl" />
      </PageFrame>
    );
  if (!definitions.data)
    return (
      <PageFrame>
        <p className="rounded-xl border p-8">Payment Terms unavailable.</p>
      </PageFrame>
    );

  const data = definitions.data;
  const locked = Boolean(form.termId && form.status !== "draft");
  const move = (key: "clauses" | "discountTiers", index: number, delta: number) => {
    const next = [...form[key]];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setForm({ ...form, [key]: next });
  };
  const update = (key: "clauses" | "discountTiers", index: number, value: Row) => {
    const next = [...form[key]];
    next[index] = { ...next[index], ...value };
    setForm({ ...form, [key]: next });
  };
  const submit = (status: string) =>
    save.mutate({
      ...form,
      status,
      dueDays: form.dueDays === "" ? null : Number(form.dueDays),
      dueDayOfMonth: form.dueDayOfMonth === "" ? null : Number(form.dueDayOfMonth),
      graceDays: Number(form.graceDays),
      holidayCalendarId: form.holidayCalendarId || null,
    });
  const createReplacement = () => {
    if (!selected) return;
    setSelected(null);
    setForm({
      ...blank(),
      replacesPaymentTermId: selected.id,
      name: selected.name,
      applicableTo: String(selected.applicableTo ?? "BOTH"),
      baseEvent: String(selected.baseEvent ?? "INVOICE_DATE"),
      dueRuleType: selected.dueRuleType,
      dueDays: selected.dueDays == null ? "" : String(selected.dueDays),
      dueDayOfMonth: selected.dueDayOfMonth == null ? "" : String(selected.dueDayOfMonth),
      graceDays: String(selected.graceDays ?? 0),
      businessDayConvention: String(selected.businessDayConvention ?? "NONE"),
      holidayCalendarId: String(selected.holidayCalendarId ?? ""),
      clauses: selected.clauses.map((row) => ({ ...row, id: undefined })),
      discountTiers: selected.discountTiers.map((row) => ({ ...row, id: undefined })),
    });
  };

  return (
    <PageFrame>
      <div className="flex flex-col gap-5 pb-10">
        <header className="flex flex-col gap-3 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Finance Settings · Payments</p>
            <h1 className="text-xl font-semibold">Payment Term aggregate editor</h1>
            <p className="text-sm text-muted-foreground">
              Draft terms are editable. Activation permanently freezes the header, clauses, and discount tiers.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => definitions.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button asChild variant="outline">
              <Link href={`/finance/setup/tenant/${encodeURIComponent(tenantCode)}`}>Tenant setup</Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
          <aside className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-semibold">Payment Terms</h2>
              <Button size="sm" variant="outline" onClick={() => { setSelected(null); setForm(blank()); }}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="divide-y">
              {data.terms.map((term) => (
                <button
                  key={term.id}
                  onClick={() => setSelected(term)}
                  className={`w-full p-4 text-left hover:bg-muted/30 ${selected?.id === term.id ? "bg-muted/40" : ""}`}
                >
                  <p className="text-sm font-medium">{term.code} · {term.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {term.status} · {term.dueRuleType}{term.dueDays != null ? ` ${term.dueDays} days` : ""}
                  </p>
                </button>
              ))}
            </div>
          </aside>

          <section className="rounded-xl border bg-card">
            <div className="flex items-start justify-between gap-3 border-b p-5">
              <div>
                <h2 className="font-semibold">{form.termId ? form.code : "New Payment Term"}</h2>
                <p className="text-sm text-muted-foreground">
                  {locked ? "This definition is immutable. Create a replacement to make a commercial change." : "Save as draft, review, then activate once."}
                </p>
              </div>
              {locked && <Button variant="outline" onClick={createReplacement}>Create replacement</Button>}
            </div>

            <fieldset disabled={locked} className="disabled:opacity-70">
              <div className="grid gap-4 p-5 md:grid-cols-4">
                <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
                <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Applicable to"><Select value={form.applicableTo} onChange={(value) => setForm({ ...form, applicableTo: value })} options={["PURCHASE", "SALE", "BOTH"]} /></Field>
                <Field label="Base event"><Select value={form.baseEvent} onChange={(value) => setForm({ ...form, baseEvent: value })} options={["INVOICE_DATE", "GR_DATE", "SERVICE_ENTRY_DATE", "DELIVERY_DATE", "CERTIFIED_DATE", "CONTRACT_DATE"]} /></Field>
                <Field label="Due rule"><Select value={form.dueRuleType} onChange={(value) => setForm({ ...form, dueRuleType: value })} options={["NET_DAYS", "EOM", "FIXED_DAY", "COD", "PREPAID"]} /></Field>
                <Field label="Due days"><Input type="number" value={form.dueDays} disabled={form.dueRuleType !== "NET_DAYS"} onChange={(e) => setForm({ ...form, dueDays: e.target.value })} /></Field>
                <Field label="Day of month"><Input type="number" value={form.dueDayOfMonth} disabled={form.dueRuleType !== "FIXED_DAY"} onChange={(e) => setForm({ ...form, dueDayOfMonth: e.target.value })} /></Field>
                <Field label="Grace days"><Input type="number" value={form.graceDays} onChange={(e) => setForm({ ...form, graceDays: e.target.value })} /></Field>
                <Field label="Business-day convention"><Select value={form.businessDayConvention} onChange={(value) => setForm({ ...form, businessDayConvention: value })} options={["NONE", "FOLLOWING", "PRECEDING", "MODIFIED_FOLLOWING"]} /></Field>
                <Field label="Holiday calendar">
                  <select className="h-10 rounded-md border bg-background px-3" value={form.holidayCalendarId} onChange={(e) => setForm({ ...form, holidayCalendarId: e.target.value })}>
                    <option value="">None</option>
                    {data.holidayCalendars.map((calendar) => <option key={String(calendar.id)} value={String(calendar.id)}>{String(calendar.code)} · {String(calendar.name)}</option>)}
                  </select>
                </Field>
              </div>

              <AggregateHeader title="Ordered payment clauses" action={() => setForm({ ...form, clauses: [...form.clauses, { clauseCode: `CLAUSE_${form.clauses.length + 1}`, clauseType: "ADVANCE", calcMode: "PERCENT", defaultPct: 1, applicationScope: "HEADER", basisAmountMode: "GROSS" }] })} />
              <div className="divide-y">
                {form.clauses.map((clause, index) => (
                  <div key={index} className="grid items-end gap-2 p-4 md:grid-cols-[40px_1fr_1fr_1fr_110px_1fr_auto]">
                    <span className="pb-2 text-center text-sm font-semibold">{index + 1}</span>
                    <Field label="Code"><Input value={String(clause.clauseCode ?? "")} onChange={(e) => update("clauses", index, { clauseCode: e.target.value.toUpperCase() })} /></Field>
                    <Field label="Type"><Select value={String(clause.clauseType ?? "ADVANCE")} onChange={(value) => update("clauses", index, { clauseType: value })} options={["ADVANCE", "ADVANCE_RECOVERY", "RETENTION", "RETENTION_RELEASE"]} /></Field>
                    <Field label="Settles clause"><Input value={String(clause.settlesClauseCode ?? "")} onChange={(e) => update("clauses", index, { settlesClauseCode: e.target.value.toUpperCase() })} /></Field>
                    <Field label="Percent"><Input type="number" value={String(clause.defaultPct ?? "")} onChange={(e) => update("clauses", index, { defaultPct: Number(e.target.value) })} /></Field>
                    {clause.clauseType === "ADVANCE_RECOVERY" ? (
                      <Field label="Recovery method"><Input value={String(clause.recoveryMethod ?? "")} onChange={(e) => update("clauses", index, { recoveryMethod: e.target.value })} /></Field>
                    ) : clause.clauseType === "RETENTION_RELEASE" ? (
                      <Field label="Release event"><Input value={String(clause.releaseEvent ?? "")} onChange={(e) => update("clauses", index, { releaseEvent: e.target.value })} /></Field>
                    ) : <span />}
                    <RowButtons up={() => move("clauses", index, -1)} down={() => move("clauses", index, 1)} remove={() => setForm({ ...form, clauses: form.clauses.filter((_, row) => row !== index) })} />
                  </div>
                ))}
              </div>

              <AggregateHeader title="Early-payment discount tiers" action={() => setForm({ ...form, discountTiers: [...form.discountTiers, { qualifyWithinDays: 10, discountPct: 2, discountBasisMode: "GROSS" }] })} />
              <div className="divide-y">
                {form.discountTiers.map((tier, index) => (
                  <div key={index} className="grid items-end gap-2 p-4 md:grid-cols-[40px_1fr_1fr_1fr_auto]">
                    <span className="pb-2 text-center text-sm font-semibold">{index + 1}</span>
                    <Field label="Qualify within days"><Input type="number" value={String(tier.qualifyWithinDays ?? "")} onChange={(e) => update("discountTiers", index, { qualifyWithinDays: Number(e.target.value) })} /></Field>
                    <Field label="Discount %"><Input type="number" value={String(tier.discountPct ?? "")} onChange={(e) => update("discountTiers", index, { discountPct: Number(e.target.value), discountFixed: null })} /></Field>
                    <Field label="Basis"><Select value={String(tier.discountBasisMode ?? "GROSS")} onChange={(value) => update("discountTiers", index, { discountBasisMode: value })} options={["GROSS", "NET"]} /></Field>
                    <RowButtons up={() => move("discountTiers", index, -1)} down={() => move("discountTiers", index, 1)} remove={() => setForm({ ...form, discountTiers: form.discountTiers.filter((_, row) => row !== index) })} />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 border-t p-4">
                <Button variant="outline" disabled={save.isPending || locked} onClick={() => submit("draft")}>Save draft</Button>
                <Button disabled={save.isPending || locked} onClick={() => submit("active")}><Save className="mr-2 h-4 w-4" />Save &amp; activate</Button>
              </div>
            </fieldset>
            {save.error && <p className="px-5 pb-4 text-sm text-destructive">{String(save.error)}</p>}
          </section>
        </div>
      </div>
    </PageFrame>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select className="h-10 rounded-md border bg-background px-3" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>;
}

function AggregateHeader({ title, action }: { title: string; action: () => void }) {
  return <div className="flex items-center justify-between border-y bg-muted/20 px-5 py-3"><h3 className="text-sm font-semibold">{title}</h3><Button size="sm" variant="outline" onClick={action}><Plus className="mr-1 h-4 w-4" />Add</Button></div>;
}

function RowButtons({ up, down, remove }: { up: () => void; down: () => void; remove: () => void }) {
  return <div className="flex pb-0.5"><Button size="sm" variant="ghost" onClick={up}><ArrowUp className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={down}><ArrowDown className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={remove}><Trash2 className="h-4 w-4" /></Button></div>;
}
