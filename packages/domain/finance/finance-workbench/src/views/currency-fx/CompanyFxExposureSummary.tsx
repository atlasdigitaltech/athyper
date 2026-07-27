import Link from "next/link";
import { Banknote, BookOpen, Building2, CreditCard } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import type { CurrencyFxSetupPayload } from "../../hooks/useCurrencyFxSetup";

const SOURCE_LABELS={
  ledger_book:"Ledger books",
  bank_account:"Linked bank accounts",
  payment_policy:"Payment policies",
  settlement_rule:"Settlement rules",
} as const;
const SOURCE_ICONS={
  ledger_book:BookOpen,
  bank_account:Building2,
  payment_policy:CreditCard,
  settlement_rule:Banknote,
} as const;

export function CompanyFxExposureSummary({data}:{data:CurrencyFxSetupPayload}) {
  const exposure=data.exposure;
  const sourceCounts=Object.fromEntries(
    Object.keys(SOURCE_LABELS).map(type=>[
      type,
      exposure.sources.filter(source=>source.sourceType===type).length,
    ]),
  ) as Record<keyof typeof SOURCE_LABELS,number>;

  return (
    <section className="rounded-xl border bg-card" aria-labelledby="currency-usage-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <h2 id="currency-usage-title" className="font-semibold">Currency usage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Functional currency <strong className="font-medium text-foreground">{data.company.functionalCurrency}</strong>
          </p>
        </div>
        <Button asChild size="sm" variant="outline"><Link href="/app/currency">View currency catalogue</Link></Button>
      </div>

      {!exposure.hasForeignCurrencyExposure ? (
        <div className="p-5">
          <p className="font-medium">No foreign-currency exposure detected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Active books, linked bank accounts, payment policies, and settlement rules currently use {data.company.functionalCurrency}.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Foreign currencies</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {exposure.currencies.map(currency=>(
                <div key={currency.currencyCode} className="rounded-lg border bg-background px-3 py-2">
                  <p className="font-mono text-sm font-semibold">{currency.currencyCode}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {currency.purposes.map(label).join(" + ")} · {currency.sourceCount} source{currency.sourceCount===1?"":"s"}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Detected from</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(Object.keys(SOURCE_LABELS) as Array<keyof typeof SOURCE_LABELS>).map(type=>{
                const Icon=SOURCE_ICONS[type];
                return (
                  <div key={type} className="flex items-center gap-3 rounded-lg border bg-muted/10 p-3">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="text-sm font-medium">{SOURCE_LABELS[type]}</p>
                      <p className="text-xs text-muted-foreground">{sourceCounts[type]} exposure record{sourceCounts[type]===1?"":"s"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function label(value:string):string {
  return value.replaceAll("_"," ").replace(/\b\w/g,character=>character.toUpperCase());
}
