"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, Plus, RefreshCw, Save } from "lucide-react";
import { Button, Input, Label, Skeleton } from "@athyper/platform-ui/primitives";
import { PageFrame } from "@athyper/platform-ui/layout";
import {
  useCompanyPaymentsSetup,
  useInterfaceRoutingTrace,
  useSaveInterfaceBinding,
  useSavePaymentPolicy,
  useSaveSettlementRule,
} from "../../hooks/usePaymentsSetup";

type RecordValue = Record<string, unknown>;
const today = () => new Date().toISOString().slice(0, 10);

export function CompanyPaymentsSetupView({ companyCode }: { companyCode: string }) {
  const setup = useCompanyPaymentsSetup(companyCode);
  const savePolicy = useSavePaymentPolicy(companyCode);
  const saveBinding = useSaveInterfaceBinding(companyCode);
  const saveSettlement = useSaveSettlementRule(companyCode);
  const trace = useInterfaceRoutingTrace(companyCode);
  const [policy, setPolicy] = useState<RecordValue>({
    direction: "OUTBOUND",
    currencyCode: "",
    isDefault: false,
    isManualAllowed: true,
    isFileAllowed: true,
    isApiAllowed: false,
    effectiveFrom: today(),
    status: "active",
  });
  const [binding, setBinding] = useState<RecordValue>({
    direction: "OUTBOUND",
    currencyCode: "",
    priority: 0,
    effectiveFrom: today(),
    status: "active",
  });
  const [settlement, setSettlement] = useState<RecordValue>({
    direction: "OUTBOUND",
    bookCode: "",
    clearingRole: "payment_clearing",
    settlementRole: "bank_settlement",
    effectiveFrom: today(),
    status: "active",
  });

  if (setup.isLoading) {
    return <PageFrame><Skeleton className="h-[700px] rounded-xl" /></PageFrame>;
  }
  if (!setup.data) {
    return <PageFrame><p className="rounded-xl border p-8">Company Payments settings unavailable.</p></PageFrame>;
  }

  const data = setup.data;
  return (
    <PageFrame>
      <div className="flex flex-col gap-5 pb-10">
        <header className="flex flex-col gap-3 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Finance Settings · Company Payments</p>
            <h1 className="text-xl font-semibold">{data.company.name} ({data.company.code})</h1>
            <p className="text-sm text-muted-foreground">
              Payment policies, interface routing, and settlement accounting rules.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setup.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
            <Button asChild variant="outline">
              <Link href={`/finance/setup/tenant/${encodeURIComponent(data.company.tenantCode)}/payment-terms`}>
                Payment terms
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/workbench/finance/readiness?scopeId=${encodeURIComponent(companyCode)}`}>
                Review configuration
              </Link>
            </Button>
          </div>
        </header>

        <section id="payment-policies" className="scroll-mt-24 rounded-xl border bg-card">
          <SectionTitle
            title="Payment policies"
            description="Allowed methods, directions, currencies, channels, defaults, House Banks, and effective dates."
          />
          <div className="divide-y">
            {data.policies.length ? data.policies.map((item) => {
              const method = data.methods.find((candidate) => candidate.id === item.paymentMethodId);
              const bank = data.houseBanks.find((candidate) => (
                candidate.bankAccountLinkId === item.bankAccountLinkId
              ));
              return (
                <div key={String(item.id)} className="grid gap-2 p-4 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
                  <div>
                    <p className="font-medium">{String(method?.code ?? item.paymentMethodId)}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(item.direction)} · {String(item.currencyCode ?? "All currencies")}
                    </p>
                  </div>
                  <SettingValue label="Default" value={item.isDefault ? "Yes" : "No"} />
                  <SettingValue label="House Bank" value={String(bank?.nickname ?? bank?.accountName ?? "None")} />
                  <SettingValue
                    label="Channels"
                    value={[
                      item.isManualAllowed && "Manual",
                      item.isFileAllowed && "File",
                      item.isApiAllowed && "API",
                    ].filter(Boolean).join(" · ") || "None"}
                  />
                </div>
              );
            }) : <p className="p-5 text-sm text-muted-foreground">No payment policies configured.</p>}
          </div>
          <div className="grid gap-3 border-t bg-muted/20 p-5 md:grid-cols-6">
            <Method
              value={policy.paymentMethodId}
              methods={data.methods}
              onChange={(value) => setPolicy({ ...policy, paymentMethodId: value })}
            />
            <Choice
              label="Direction"
              value={String(policy.direction)}
              values={["OUTBOUND", "INBOUND"]}
              onChange={(value) => setPolicy({ ...policy, direction: value })}
            />
            <Field label="Currency">
              <Input
                maxLength={3}
                value={String(policy.currencyCode)}
                onChange={(event) => setPolicy({ ...policy, currencyCode: event.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Preferred House Bank">
              <select
                className="h-10 rounded-md border bg-background px-3"
                value={String(policy.bankAccountLinkId ?? "")}
                onChange={(event) => setPolicy({ ...policy, bankAccountLinkId: event.target.value })}
              >
                <option value="">None</option>
                {data.houseBanks.map((bank) => (
                  <option value={String(bank.bankAccountLinkId)} key={String(bank.bankAccountLinkId)}>
                    {String(bank.nickname ?? bank.accountName)} · {String(bank.currencyCode)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Effective from">
              <Input
                type="date"
                value={String(policy.effectiveFrom)}
                onChange={(event) => setPolicy({ ...policy, effectiveFrom: event.target.value })}
              />
            </Field>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(policy.isDefault)}
                  onChange={(event) => setPolicy({ ...policy, isDefault: event.target.checked })}
                />
                Default
              </label>
              <Button
                disabled={savePolicy.isPending}
                onClick={() => savePolicy.mutate({
                  ...policy,
                  currencyCode: policy.currencyCode || null,
                  bankAccountLinkId: policy.bankAccountLinkId || null,
                })}
              >
                <Plus className="mr-1 h-4 w-4" />Add
              </Button>
            </div>
          </div>
          {data.diagnostics.length > 0 && (
            <div className="border-t p-4">
              <h3 className="text-sm font-semibold">Policy validation</h3>
              {data.diagnostics.map((diagnostic, index) => (
                <p
                  key={`${diagnostic.code}-${index}`}
                  className={`mt-2 text-sm ${diagnostic.severity === "error" ? "text-destructive" : "text-amber-700"}`}
                >
                  {diagnostic.message}
                </p>
              ))}
            </div>
          )}
          {savePolicy.error && <p className="border-t p-4 text-sm text-destructive">{String(savePolicy.error)}</p>}
        </section>

        <section id="payment-routing" className="scroll-mt-24 rounded-xl border bg-card">
          <SectionTitle
            title="Interface routing"
            description="Bind payment methods to interface profiles. Use the trace action to test deterministic selection."
          />
          <div className="grid gap-3 p-5 md:grid-cols-3 xl:grid-cols-6">
            <Method
              value={binding.paymentMethodId}
              methods={data.methods}
              onChange={(value) => setBinding({ ...binding, paymentMethodId: value })}
            />
            <Field label="Interface profile">
              <select
                className="h-10 rounded-md border bg-background px-3"
                value={String(binding.profileId ?? "")}
                onChange={(event) => setBinding({ ...binding, profileId: event.target.value })}
              >
                <option value="">Select…</option>
                {data.interfaces.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {String(item.code)} · {String(item.interfaceType)}
                  </option>
                ))}
              </select>
            </Field>
            <Choice
              label="Direction"
              value={String(binding.direction)}
              values={["OUTBOUND", "INBOUND", "BOTH"]}
              onChange={(value) => setBinding({ ...binding, direction: value })}
            />
            <Field label="Currency">
              <Input
                maxLength={3}
                value={String(binding.currencyCode)}
                onChange={(event) => setBinding({ ...binding, currencyCode: event.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="House Bank scope">
              <select
                className="h-10 rounded-md border bg-background px-3"
                value={String(binding.bankAccountLinkId ?? "")}
                onChange={(event) => setBinding({ ...binding, bankAccountLinkId: event.target.value })}
              >
                <option value="">Any</option>
                {data.houseBanks.map((bank) => (
                  <option key={String(bank.bankAccountLinkId)} value={String(bank.bankAccountLinkId)}>
                    {String(bank.nickname ?? bank.accountName)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Effective from">
              <Input
                type="date"
                value={String(binding.effectiveFrom)}
                onChange={(event) => setBinding({ ...binding, effectiveFrom: event.target.value })}
              />
            </Field>
            <Field label="Priority">
              <Input
                type="number"
                value={String(binding.priority)}
                onChange={(event) => setBinding({ ...binding, priority: Number(event.target.value) })}
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button
                disabled={saveBinding.isPending}
                onClick={() => saveBinding.mutate({
                  ...binding,
                  currencyCode: binding.currencyCode || null,
                  bankAccountLinkId: binding.bankAccountLinkId || null,
                })}
              >
                <Save className="mr-1 h-4 w-4" />Save binding
              </Button>
              <Button
                variant="outline"
                disabled={trace.isPending}
                onClick={() => trace.mutate({
                  paymentMethodId: binding.paymentMethodId,
                  direction: binding.direction,
                  currencyCode: binding.currencyCode || data.company.functionalCurrency,
                  bankAccountLinkId: binding.bankAccountLinkId || null,
                  asOfDate: today(),
                })}
              >
                <Play className="mr-1 h-4 w-4" />Test
              </Button>
            </div>
          </div>
          {trace.data && (
            <div className="border-t p-4">
              <p className={trace.data.ambiguous ? "font-semibold text-destructive" : "font-semibold"}>
                {trace.data.explanation}
              </p>
              {trace.data.candidates.map((candidate, index) => (
                <p key={String(candidate.bindingId)} className="mt-2 text-xs">
                  {index + 1}. {String(candidate.profileCode)} · specificity [{candidate.specificity.join(",")}]
                  {" "}· P{String(candidate.priority)} · {candidate.matched ? "matched" : candidate.reasons.join(", ")}
                </p>
              ))}
            </div>
          )}
          {(saveBinding.error || trace.error) && (
            <p className="border-t p-4 text-sm text-destructive">{String(saveBinding.error ?? trace.error)}</p>
          )}
        </section>

        <section id="settlement-accounting" className="scroll-mt-24 rounded-xl border bg-card">
          <SectionTitle
            title="Settlement accounting"
            description="Map payment methods and Books to governed clearing, settlement, fee, discount, and FX roles."
          />
          <div className="grid gap-3 p-5 md:grid-cols-3 xl:grid-cols-6">
            <Method
              value={settlement.paymentMethodId}
              methods={data.methods}
              onChange={(value) => setSettlement({ ...settlement, paymentMethodId: value })}
            />
            <Choice
              label="Direction"
              value={String(settlement.direction)}
              values={["OUTBOUND", "INBOUND", "BOTH"]}
              onChange={(value) => setSettlement({ ...settlement, direction: value })}
            />
            <Field label="Book">
              <select
                className="h-10 rounded-md border bg-background px-3"
                value={String(settlement.bookCode)}
                onChange={(event) => setSettlement({ ...settlement, bookCode: event.target.value })}
              >
                <option value="">Select…</option>
                {data.books.map((book) => (
                  <option key={String(book.id)} value={String(book.code)}>
                    {String(book.code)} · {String(book.name)}
                  </option>
                ))}
              </select>
            </Field>
            {[
              ["Clearing role", "clearingRole"],
              ["Settlement role", "settlementRole"],
              ["Bank fee role", "bankFeeRole"],
              ["Discount role", "discountRole"],
              ["FX gain role", "fxGainRole"],
              ["FX loss role", "fxLossRole"],
              ["Chargeback role", "chargebackRole"],
              ["Suspense role", "suspenseRole"],
            ].map(([label, key]) => (
              <Field label={label!} key={key}>
                <Input
                  value={String(settlement[key!] ?? "")}
                  onChange={(event) => setSettlement({ ...settlement, [key!]: event.target.value.toLowerCase() })}
                />
              </Field>
            ))}
            <Field label="Effective from">
              <Input
                type="date"
                value={String(settlement.effectiveFrom)}
                onChange={(event) => setSettlement({ ...settlement, effectiveFrom: event.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button
                disabled={saveSettlement.isPending}
                onClick={() => saveSettlement.mutate(settlement)}
              >
                <Save className="mr-1 h-4 w-4" />Save rule
              </Button>
            </div>
          </div>
          {saveSettlement.error && (
            <p className="border-t p-4 text-sm text-destructive">{String(saveSettlement.error)}</p>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SettingValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}

function Choice({ label, value, values, onChange }: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="h-10 rounded-md border bg-background px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {values.map((item) => <option key={item}>{item}</option>)}
      </select>
    </Field>
  );
}

function Method({ value, methods, onChange }: {
  value: unknown;
  methods: RecordValue[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Payment method">
      <select
        className="h-10 rounded-md border bg-background px-3"
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select…</option>
        {methods.map((method) => (
          <option key={String(method.id)} value={String(method.id)}>
            {String(method.code)} · {String(method.name)}
          </option>
        ))}
      </select>
    </Field>
  );
}
