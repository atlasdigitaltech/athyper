"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  ChevronDown,
  ListTree,
  Trash2,
} from "lucide-react";
import {
  AdvancedEntityChooserPanel,
  type AdvancedEntityChooserMetaConfig,
  type AdvancedEntityChooserOption,
} from "@athyper/ui/composites";
import { Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

type AccountClass = "all" | "asset" | "liability" | "expense" | "income";
type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface AccountOption {
  id: string;
  name: string;
  code: string;
  path: string;
  accountClass: Exclude<AccountClass, "all">;
  side: "Dr" | "Cr";
  tags?: string[];
  recentlyUsed?: boolean;
}

const FILTERS: Array<{ id: AccountClass; label: string; count: number }> = [
  { id: "all", label: "All", count: 12 },
  { id: "asset", label: "Asset", count: 1 },
  { id: "liability", label: "Liability", count: 4 },
  { id: "expense", label: "Expense", count: 5 },
  { id: "income", label: "Income", count: 2 },
];

const ACCOUNTS: AccountOption[] = [
  {
    id: "zakat-payable",
    name: "Zakat Payable",
    code: "CST-L-TAX-ZKT",
    path: "Liabilities / Tax / Zakat",
    accountClass: "liability",
    side: "Cr",
    tags: ["7x"],
    recentlyUsed: true,
  },
  {
    id: "zakat-expense",
    name: "Zakat Expense",
    code: "CST-E-TAX-ZKT",
    path: "Expenses / Tax / Zakat",
    accountClass: "expense",
    side: "Dr",
    tags: ["CC"],
    recentlyUsed: true,
  },
  {
    id: "zakat-receivable",
    name: "Zakat Receivable",
    code: "CST-A-OA-ZKT",
    path: "Assets / Other Receivables",
    accountClass: "asset",
    side: "Dr",
  },
  {
    id: "wht-payable",
    name: "WHT Payable (Subcontractors)",
    code: "CST-L-TAX-WHT",
    path: "Liabilities / Tax",
    accountClass: "liability",
    side: "Cr",
  },
  {
    id: "zakat-adjustment",
    name: "Zakat Settlement Adjustment",
    code: "CST-E-TAX-ADJ",
    path: "Expenses / Tax / Adjustments",
    accountClass: "expense",
    side: "Dr",
  },
  {
    id: "other-income",
    name: "Tax Penalty Recoveries",
    code: "CST-I-OTH-TAX",
    path: "Income / Other Income",
    accountClass: "income",
    side: "Cr",
  },
];

const DEFAULT_ACCOUNT: AccountOption = ACCOUNTS[0]!;

const GL_CHOOSER_SECTIONS = [
  { id: "recent", label: "Recently used" },
  { id: "matches", label: "All matches" },
];

const GL_CHOOSER_CONTROLS = FILTERS.map((filter) => ({
  id: `account-class-${filter.id}`,
  label: filter.label,
  value: filter.id,
  count: filter.count,
}));

const CORNER_META: Record<Corner, {
  label: string;
  icon: typeof ArrowDownRight;
  status: string;
  triggerClass: string;
  chooserClass: string;
}> = {
  "top-left": {
    label: "Top-left",
    icon: ArrowDownRight,
    status: "drops down + right",
    triggerClass: "left-6 top-8",
    chooserClass: "left-6 top-20",
  },
  "top-right": {
    label: "Top-right",
    icon: ArrowDownLeft,
    status: "drops down + left, flipped x",
    triggerClass: "right-6 top-8",
    chooserClass: "right-6 top-20",
  },
  "bottom-left": {
    label: "Bottom-left",
    icon: ArrowUpRight,
    status: "opens up + right, flipped y",
    triggerClass: "left-6 bottom-8",
    chooserClass: "left-6 bottom-20",
  },
  "bottom-right": {
    label: "Bottom-right",
    icon: ArrowUpLeft,
    status: "opens up + left, flipped x+y",
    triggerClass: "right-6 bottom-8",
    chooserClass: "right-6 bottom-20",
  },
};

export default function AdvancedEntityChooserDesignPage() {
  const [activeFilter, setActiveFilter] = useState<AccountClass>("all");
  const [selectedAccount, setSelectedAccount] = useState<AccountOption>(DEFAULT_ACCOUNT);
  const [corner, setCorner] = useState<Corner>("top-left");

  const filteredAccounts = useMemo(
    () => ACCOUNTS.filter((account) => activeFilter === "all" || account.accountClass === activeFilter),
    [activeFilter],
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="section-label">Prototype as General Ledger</p>
          <h1 className="text-2xl font-semibold">Advanced Entity Chooser</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Review surface for the GL account picker before wiring it into entity_chooser runtime behavior.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <ListTree className="size-4" />
          GL account chooser / dense finance display
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <JournalEntryPrototype
          activeFilter={activeFilter}
          filteredAccounts={filteredAccounts}
          selectedAccount={selectedAccount}
          onFilterChange={setActiveFilter}
          onSelect={setSelectedAccount}
        />
        <MobileSheetPrototype
          activeFilter={activeFilter}
          filteredAccounts={filteredAccounts}
          selectedAccount={selectedAccount}
          onFilterChange={setActiveFilter}
          onSelect={setSelectedAccount}
        />
      </section>

      <CollisionPrototype
        activeFilter={activeFilter}
        filteredAccounts={filteredAccounts}
        selectedAccount={selectedAccount}
        corner={corner}
        onCornerChange={setCorner}
        onFilterChange={setActiveFilter}
        onSelect={setSelectedAccount}
      />
    </main>
  );
}

function JournalEntryPrototype({
  activeFilter,
  filteredAccounts,
  selectedAccount,
  onFilterChange,
  onSelect,
}: {
  activeFilter: AccountClass;
  filteredAccounts: AccountOption[];
  selectedAccount: AccountOption;
  onFilterChange: (filter: AccountClass) => void;
  onSelect: (account: AccountOption) => void;
}) {
  return (
    <div className="relative min-h-[520px] overflow-visible rounded-md border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/20 px-6 py-4">
        <div>
          <p className="text-sm font-semibold">JOURNAL ENTRY - JE-202605-EGBFBG</p>
          <p className="text-xs text-muted-foreground">Draft - Editing</p>
        </div>
        <div className="text-right text-xs">
          <span className="text-muted-foreground">3 lines</span>
          <span className="mx-2 text-muted-foreground">-</span>
          <span className="font-semibold">Total SAR 12,500.00</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-28">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-[44px_230px_190px_150px_120px_120px_44px] border-b bg-muted/30 px-3 text-doc-label font-semibold uppercase text-muted-foreground">
            <div className="py-3 text-center">#</div>
            <div className="py-3">GL account</div>
            <div className="py-3">Description</div>
            <div className="py-3">Reference</div>
            <div className="py-3 text-right">Debit</div>
            <div className="py-3 text-right">Credit</div>
            <div />
          </div>

          <div className="relative">
            <LineRow
              index={1}
              active
              accountCell={(
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between rounded-md border border-primary bg-background px-3 text-left text-xs shadow-sm"
                >
                  <span className="truncate text-muted-foreground">Search account...</span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
              )}
              description="-"
              reference="No reference"
              debit="-"
              credit="-"
            />
            <LineRow
              index={2}
              accountCell={<MiniSelectedAccount name="Cash & Bank" code="CST-A-CASH-BNK" side="Dr" />}
              description="Bank movement"
              reference="-"
              debit="0.00"
              credit="-"
            />
            <LineRow
              index={3}
              accountCell={<MiniSelectedAccount name={selectedAccount.name} code={selectedAccount.code} side={selectedAccount.side} />}
              description="Zakat accrual"
              reference="-"
              debit="-"
              credit="12,500.00"
            />

          </div>
        </div>
      </div>

      <div className="absolute left-[95px] top-[172px] z-30">
        <GlAccountChooserPanel
          activeFilter={activeFilter}
          filteredAccounts={filteredAccounts}
          selectedAccount={selectedAccount}
          onFilterChange={onFilterChange}
          onSelect={onSelect}
          density="mini"
          width={390}
          maxListHeight={180}
          denseFooter
        />
      </div>

      <div className="absolute bottom-4 left-6 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-sm bg-primary" />
        Field state: popup rendered as a viewport layer, not as a child of the table scroller.
      </div>
    </div>
  );
}

function LineRow({
  index,
  accountCell,
  description,
  reference,
  debit,
  credit,
  active,
}: {
  index: number;
  accountCell: ReactNode;
  description: string;
  reference: string;
  debit: string;
  credit: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[44px_230px_190px_150px_120px_120px_44px] items-center border-b px-3 text-xs",
        active ? "bg-primary/10" : "bg-card",
      )}
    >
      <div className="py-3 text-center font-medium">{index}</div>
      <div className="py-2">{accountCell}</div>
      <div className="px-3 py-3 text-muted-foreground">{description}</div>
      <div className="px-3 py-3 text-muted-foreground">{reference}</div>
      <div className="px-3 py-3 text-right font-mono">{debit}</div>
      <div className="px-3 py-3 text-right font-mono font-semibold">{credit}</div>
      <div className="py-3 text-center text-muted-foreground">
        <Trash2 className="mx-auto size-3.5" />
      </div>
    </div>
  );
}

function MiniSelectedAccount({ name, code, side }: { name: string; code: string; side: "Dr" | "Cr" }) {
  return (
    <div className="flex min-h-9 items-center gap-2 rounded-md border bg-background px-3">
      <SideBadge side={side} />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">{name}</p>
        <p className="truncate font-mono text-doc-support text-muted-foreground">{code}</p>
      </div>
    </div>
  );
}

function CollisionPrototype({
  activeFilter,
  filteredAccounts,
  selectedAccount,
  corner,
  onCornerChange,
  onFilterChange,
  onSelect,
}: {
  activeFilter: AccountClass;
  filteredAccounts: AccountOption[];
  selectedAccount: AccountOption;
  corner: Corner;
  onCornerChange: (corner: Corner) => void;
  onFilterChange: (filter: AccountClass) => void;
  onSelect: (account: AccountOption) => void;
}) {
  const meta = CORNER_META[corner];

  return (
    <section className="rounded-md border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Flip-on-collision</p>
          <p className="text-xs text-muted-foreground">The chooser stays inside the browser viewport and keeps the trigger visible.</p>
        </div>
        <span className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-doc-support text-muted-foreground">
          {meta.status}
        </span>
      </div>

      <div className="relative min-h-[320px] overflow-hidden rounded-md border bg-[#f8f7f2]">
        <div className="absolute left-1/2 top-3 -translate-x-1/2 text-doc-label font-semibold uppercase text-muted-foreground">
          Browser viewport
        </div>
        <button
          type="button"
          className={cn(
            "absolute z-10 flex h-9 w-[190px] items-center justify-between rounded-md border border-primary bg-background px-3 text-left text-xs shadow-sm",
            meta.triggerClass,
          )}
        >
          <span className="truncate text-muted-foreground">Search GL account...</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
        <div className={cn("absolute z-20", meta.chooserClass)}>
          <GlAccountChooserPanel
            activeFilter={activeFilter}
            filteredAccounts={filteredAccounts.slice(0, 4)}
            selectedAccount={selectedAccount}
            onFilterChange={onFilterChange}
            onSelect={onSelect}
            density="mini"
            width={320}
            maxListHeight={150}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(Object.keys(CORNER_META) as Corner[]).map((option) => {
          const Icon = CORNER_META[option].icon;
          return (
            <Button
              key={option}
              type="button"
              variant={corner === option ? "primary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => onCornerChange(option)}
            >
              <Icon className="size-3.5" />
              {CORNER_META[option].label}
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function MobileSheetPrototype({
  activeFilter,
  filteredAccounts,
  selectedAccount,
  onFilterChange,
  onSelect,
}: {
  activeFilter: AccountClass;
  filteredAccounts: AccountOption[];
  selectedAccount: AccountOption;
  onFilterChange: (filter: AccountClass) => void;
  onSelect: (account: AccountOption) => void;
}) {
  return (
    <aside className="rounded-md border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <p className="text-sm font-semibold">Mobile sheet variant</p>
        <p className="text-xs text-muted-foreground">Same entity_chooser density, optimized for thumb scanning.</p>
      </div>

      <div className="mx-auto w-[282px] rounded-[28px] border-[6px] border-foreground bg-foreground p-1 shadow-xl">
        <div className="relative h-[560px] overflow-hidden rounded-[22px] bg-background">
          <div className="flex h-10 items-center justify-between border-b px-4 text-xs">
            <span className="font-semibold">9:41</span>
            <span className="font-mono text-doc-support">LTE 88%</span>
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">JE-202605-EGBFBG</p>
                <p className="text-doc-support text-muted-foreground">Draft - Editing</p>
              </div>
              <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                <span className="block h-1 w-1 rounded-full bg-current" />
                <span className="mt-0.5 block h-1 w-1 rounded-full bg-current" />
                <span className="mt-0.5 block h-1 w-1 rounded-full bg-current" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <p className="section-label">Line 1</p>
              <button
                type="button"
                className="flex h-9 w-full items-center justify-between rounded-md border border-primary bg-background px-3 text-left text-xs"
              >
                <span className="truncate text-muted-foreground">Search GL account...</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
              <div className="grid grid-cols-2 gap-2">
                <SmallAmountInput label="Debit" value="-" />
                <SmallAmountInput label="Credit" value="-" />
              </div>
            </div>

            <div className="mt-4 space-y-2 opacity-55">
              <p className="section-label">Line 2</p>
              <MiniSelectedAccount name="Cash & Bank" code="CST-A-CASH-BNK" side="Dr" />
            </div>
          </div>

          <div className="absolute inset-0 top-[86px] bg-foreground/35" />
          <div className="absolute inset-x-0 bottom-0 z-10 max-h-[438px] rounded-t-xl border-t bg-popover shadow-2xl">
            <div className="flex justify-center pt-2">
              <div className="h-1 w-16 rounded-full bg-border" />
            </div>
            <GlAccountChooserPanel
              activeFilter={activeFilter}
              filteredAccounts={filteredAccounts}
              selectedAccount={selectedAccount}
              onFilterChange={onFilterChange}
              onSelect={onSelect}
              density="mobile"
              width="100%"
              maxListHeight={292}
              title="Choose GL account"
              className="border-0 shadow-none"
            />
          </div>

          <div className="absolute inset-x-4 bottom-3 flex items-end justify-between text-xs">
            <div>
              <p className="section-label">Total</p>
              <p className="font-mono font-semibold">SAR 0.00</p>
            </div>
            <Button size="sm" className="h-8 bg-foreground px-4 text-background hover:opacity-90">
              Submit
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SmallAmountInput({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-1">
      <span className="text-doc-support text-muted-foreground">{label}</span>
      <span className="flex h-8 items-center rounded-md border bg-background px-3 font-mono text-xs text-muted-foreground">
        {value}
      </span>
    </label>
  );
}

function GlAccountChooserPanel({
  activeFilter,
  filteredAccounts,
  selectedAccount,
  onFilterChange,
  onSelect,
  density,
  width,
  maxListHeight,
  denseFooter,
  title,
  className,
}: {
  activeFilter: AccountClass;
  filteredAccounts: AccountOption[];
  selectedAccount: AccountOption;
  onFilterChange: (filter: AccountClass) => void;
  onSelect: (account: AccountOption) => void;
  density: NonNullable<AdvancedEntityChooserMetaConfig["density"]>;
  width: AdvancedEntityChooserMetaConfig["width"];
  maxListHeight: number;
  denseFooter?: boolean;
  title?: string;
  className?: string;
}) {
  const meta: AdvancedEntityChooserMetaConfig = {
    density,
    width,
    maxListHeight,
    placeholder: "Search GL account...",
    controls: GL_CHOOSER_CONTROLS,
    sections: GL_CHOOSER_SECTIONS,
    showKeyboardHints: denseFooter,
    footerActions: denseFooter
      ? [{ id: "browse-coa", label: "Browse COA", href: "/finance/coa" }]
      : undefined,
  };
  const options = filteredAccounts.map(accountToChooserOption);

  return (
    <AdvancedEntityChooserPanel
      query="zakat"
      activeControlValue={activeFilter}
      selectedValue={selectedAccount.id}
      options={options}
      meta={meta}
      title={title}
      onControlChange={(control) => onFilterChange(control.value as AccountClass)}
      onSelect={(option) => {
        const account = ACCOUNTS.find((item) => item.id === option.value);
        if (account) onSelect(account);
      }}
      className={className}
    />
  );
}

function SideBadge({ side }: { side: "Dr" | "Cr" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 font-mono text-doc-support font-semibold",
        side === "Dr"
          ? "bg-success/15 text-success"
          : "bg-destructive/15 text-destructive",
      )}
    >
      {side}
    </span>
  );
}

function accountToChooserOption(account: AccountOption): AdvancedEntityChooserOption {
  return {
    value: account.id,
    label: account.name,
    code: account.code,
    description: account.path,
    section: account.recentlyUsed ? "recent" : "matches",
    badges: [
      { label: account.side, tone: account.side === "Dr" ? "success" : "destructive" },
      ...(account.tags ?? []).map((tag) => ({ label: tag, tone: "warning" as const })),
    ],
  };
}
