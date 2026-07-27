"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Landmark,
  Link2Off,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import { Button, Input, Label, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import {
  useCompanyBankingSetup,
  useEndHouseBankLink,
  useSaveHouseBank,
  useTestBankInterface,
  useVerifyBankAccount,
  type BankingRow,
  type HouseBank,
} from "../../hooks/useBankingSetup";

const today = () => new Date().toISOString().slice(0, 10);

const emptyHouseBank = (currencyCode = ""): BankingRow => ({
  bankAccountId: "",
  bankPartyId: "",
  accountIdType: "LOCAL",
  currencyCode,
  usageType: "DISBURSEMENT",
  isDisbursementEnabled: true,
  isCollectionEnabled: false,
  isDefaultDisbursement: false,
  isDefaultCollection: false,
  isManualAllowed: true,
  isFileAllowed: true,
  reconciliationMode: "MANUAL",
  priority: 0,
  effectiveFrom: today(),
});

export function CompanyBankingTreasuryView({ companyCode }: { companyCode: string }) {
  const setup = useCompanyBankingSetup(companyCode);
  const save = useSaveHouseBank(companyCode);
  const test = useTestBankInterface(companyCode);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState<BankingRow>(emptyHouseBank());

  if (setup.isLoading) {
    return <PageFrame><Skeleton className="h-[720px] rounded-xl" /></PageFrame>;
  }
  if (!setup.data) {
    return <PageFrame><p className="rounded-xl border p-8">Banking settings unavailable.</p></PageFrame>;
  }

  const data = setup.data;
  const edit = (bank: HouseBank) => {
    setForm({ ...bank });
    setShowEditor(true);
  };

  return (
    <PageFrame>
      <div className="flex flex-col gap-5 pb-10">
        <header className="flex flex-col gap-3 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Finance Settings · Banking and Treasury
            </p>
            <h1 className="text-xl font-semibold">{data.company.name} ({data.company.code})</h1>
            <p className="text-sm text-muted-foreground">
              House Banks, bank accounts, cash GL mapping, reconciliation policy, and bank interfaces.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setup.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/finance/bank-recon?company=${encodeURIComponent(companyCode)}`}>
                Statements and reconciliation
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/workbench/finance/readiness?scopeId=${encodeURIComponent(companyCode)}`}>
                Review configuration
              </Link>
            </Button>
            <Button
              onClick={() => {
                setForm(emptyHouseBank(data.company.functionalCurrency));
                setShowEditor(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />Add House Bank
            </Button>
          </div>
        </header>

        {showEditor && (
          <section id="house-bank-editor" className="scroll-mt-24 rounded-xl border bg-card">
            <SectionTitle
              title={form.houseConfigId ? "Edit House Bank" : "Add House Bank"}
              description="Bank account, Company link, cash GL, usage, effective date, and reconciliation settings."
            />
            <div className="grid gap-3 p-5 md:grid-cols-3 xl:grid-cols-5">
              <Field label="Existing Bank Account">
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={String(form.bankAccountId ?? "")}
                  disabled={Boolean(form.houseConfigId)}
                  onChange={(event) => {
                    const account = data.bankAccounts.find((item) => item.id === event.target.value);
                    setForm({
                      ...form,
                      bankAccountId: event.target.value,
                      currencyCode: account?.currencyCode ?? form.currencyCode,
                    });
                  }}
                >
                  <option value="">Create new…</option>
                  {data.bankAccounts.map((account) => (
                    <option key={String(account.id)} value={String(account.id)}>
                      {String(account.bankName ?? account.name ?? "Account")}
                      {" "}· ••••{String(account.accountLast4 ?? "")} · {String(account.currencyCode)}
                    </option>
                  ))}
                </select>
              </Field>
              {!form.bankAccountId && (
                <>
                  <Field label="Bank Party">
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={String(form.bankPartyId ?? "")}
                      onChange={(event) => setForm({ ...form, bankPartyId: event.target.value })}
                    >
                      <option value="">Select…</option>
                      {data.bankParties.map((party) => (
                        <option key={String(party.id)} value={String(party.id)}>
                          {String(party.name)} · {String(party.countryCode)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Account holder">
                    <Input
                      value={String(form.accountHolderName ?? "")}
                      onChange={(event) => setForm({ ...form, accountHolderName: event.target.value })}
                    />
                  </Field>
                  <Field label="Account identifier">
                    <Input
                      autoComplete="off"
                      value={String(form.accountIdValue ?? "")}
                      onChange={(event) => setForm({ ...form, accountIdValue: event.target.value })}
                    />
                  </Field>
                  <Field label="Identifier type">
                    <Choice
                      value={String(form.accountIdType ?? "LOCAL")}
                      values={["LOCAL", "IBAN"]}
                      onChange={(value) => setForm({ ...form, accountIdType: value })}
                    />
                  </Field>
                  <Field label="Currency">
                    <Input
                      maxLength={3}
                      value={String(form.currencyCode ?? "")}
                      onChange={(event) => setForm({ ...form, currencyCode: event.target.value.toUpperCase() })}
                    />
                  </Field>
                </>
              )}
              <Field label="Nickname">
                <Input
                  value={String(form.nickname ?? "")}
                  onChange={(event) => setForm({ ...form, nickname: event.target.value })}
                />
              </Field>
              <Field label="Cash GL">
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={String(form.glAccountId ?? "")}
                  onChange={(event) => setForm({ ...form, glAccountId: event.target.value })}
                >
                  <option value="">Select…</option>
                  {data.cashGlAccounts
                    .filter((account) => (
                      !account.currencyCode || !form.currencyCode || account.currencyCode === form.currencyCode
                    ))
                    .map((account) => (
                      <option key={String(account.id)} value={String(account.id)}>
                        {String(account.code)} · {String(account.name)} · {String(account.currencyCode ?? "multi/unset")}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Usage">
                <Choice
                  value={String(form.usageType ?? "DISBURSEMENT")}
                  values={["DISBURSEMENT", "COLLECTION", "PAYROLL", "TREASURY", "ESCROW", "PETTY_CASH"]}
                  onChange={(value) => setForm({ ...form, usageType: value })}
                />
              </Field>
              <Field label="Reconciliation">
                <Choice
                  value={String(form.reconciliationMode ?? "MANUAL")}
                  values={["MANUAL", "SEMI_AUTO", "AUTO"]}
                  onChange={(value) => setForm({ ...form, reconciliationMode: value })}
                />
              </Field>
              <Field label="Priority">
                <Input
                  type="number"
                  value={String(form.priority ?? 0)}
                  onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
                />
              </Field>
              <Field label="Effective from">
                <Input
                  type="date"
                  value={String(form.effectiveFrom ?? "")}
                  onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2 xl:col-span-2">
                {[
                  ["Disbursement", "isDisbursementEnabled"],
                  ["Collection", "isCollectionEnabled"],
                  ["Default disbursement", "isDefaultDisbursement"],
                  ["Default collection", "isDefaultCollection"],
                  ["Manual payment", "isManualAllowed"],
                  ["Payment file", "isFileAllowed"],
                ].map(([label, key]) => (
                  <label className="flex items-center gap-2 text-sm" key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(form[key!])}
                      onChange={(event) => setForm({ ...form, [key!]: event.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" onClick={() => setShowEditor(false)}>Cancel</Button>
                <Button
                  disabled={save.isPending}
                  onClick={() => save.mutate(form, { onSuccess: () => setShowEditor(false) })}
                >
                  <Save className="mr-1 h-4 w-4" />Save House Bank
                </Button>
              </div>
            </div>
            {save.error && <p className="px-5 pb-4 text-sm text-destructive">{String(save.error)}</p>}
          </section>
        )}

        <section id="house-banks" className="scroll-mt-24 rounded-xl border bg-card">
          <SectionTitle
            title="House Banks"
            description="Company bank-account links, usage, cash GL assignments, reconciliation policy, and effective dates."
          />
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            {data.houseBanks.length ? data.houseBanks.map((bank) => (
              <HouseBankCard
                key={bank.bankAccountLinkId}
                companyCode={companyCode}
                bank={bank}
                onEdit={() => edit(bank)}
              />
            )) : <p className="text-sm text-muted-foreground">No House Banks configured.</p>}
          </div>
        </section>

        <section id="bank-interfaces" className="scroll-mt-24 rounded-xl border bg-card">
          <SectionTitle
            title="Bank interfaces"
            description="Configured interface profiles and secure connection tests using opaque credential references."
          />
          <div className="divide-y">
            {data.interfaces.length ? data.interfaces.map((item) => (
              <div
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                key={String(item.id)}
              >
                <div>
                  <p className="font-medium">{String(item.code)} · {String(item.name)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(item.interfaceType)} · credential {String(item.credentialStatus)}
                    {item.lastConnectionTestAt
                      ? ` · last tested ${new Date(String(item.lastConnectionTestAt)).toLocaleString()}`
                      : " · not tested"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={test.isPending}
                  onClick={() => test.mutate(String(item.id))}
                >
                  <TestTube2 className="mr-1 h-4 w-4" />Test connection
                </Button>
              </div>
            )) : <p className="p-5 text-sm text-muted-foreground">No bank interfaces configured.</p>}
          </div>
          {test.error && <p className="border-t p-4 text-sm text-destructive">{String(test.error)}</p>}
        </section>
      </div>
    </PageFrame>
  );
}

function HouseBankCard({ companyCode, bank, onEdit }: {
  companyCode: string;
  bank: HouseBank;
  onEdit: () => void;
}) {
  const verify = useVerifyBankAccount(companyCode, bank.bankAccountId);
  const end = useEndHouseBankLink(companyCode, bank.bankAccountLinkId);
  const [endDate, setEndDate] = useState(today());
  return (
    <article className="rounded-xl border bg-card">
      <div className="flex items-start gap-3 border-b p-5">
        <Landmark className="mt-1 h-5 w-5" />
        <div>
          <h3 className="font-semibold">{String(bank.nickname ?? bank.bankName ?? "House Bank")}</h3>
          <p className="text-sm text-muted-foreground">
            {String(bank.bankName ?? "")} · ••••{bank.accountLast4 ?? "----"} · {bank.currencyCode}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5 text-sm">
        <SettingValue label="Usage" value={String(bank.usageType)} />
        <SettingValue label="Verification" value={bank.isVerified ? "Verified" : "Not verified"} />
        <SettingValue
          label="Cash GL"
          value={`${String(bank.glAccountCode ?? "None")} · ${String(bank.glCurrencyCode ?? "multi/unset")}`}
        />
        <SettingValue label="Reconciliation" value={String(bank.reconciliationMode)} />
        <SettingValue label="Effective from" value={String(bank.effectiveFrom ?? "Not set")} />
        <SettingValue label="Effective until" value={String(bank.effectiveUntil ?? "Open-ended")} />
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t p-4">
        <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
        {!bank.isVerified && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => verify.mutate({ verified: true, verificationMethod: "MANUAL" })}
          >
            <ShieldCheck className="mr-1 h-4 w-4" />Verify
          </Button>
        )}
        <label className="grid gap-1 text-xs">
          <span>End date</span>
          <Input
            className="h-8"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={end.isPending}
          onClick={() => end.mutate({ effectiveUntil: endDate })}
        >
          <Link2Off className="mr-1 h-4 w-4" />End link
        </Button>
      </div>
      {(verify.error || end.error) && (
        <p className="px-4 pb-4 text-xs text-destructive">{String(verify.error ?? end.error)}</p>
      )}
    </article>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}

function Choice({ value, values, onChange }: {
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="h-10 rounded-md border bg-background px-3"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {values.map((item) => <option key={item}>{item}</option>)}
    </select>
  );
}

function SettingValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
