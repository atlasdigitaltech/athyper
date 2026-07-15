"use client";

import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import type { HeaderFact, HeaderMode } from "../types";

export interface EntityFactRailProps {
  facts: HeaderFact[];
  /** In collapsed mode only the xl (hero) cell is shown. */
  mode?: HeaderMode;
  className?: string;
}

function FactCell({ fact }: { fact: HeaderFact }) {
  const intentClasses = fact.intent
    ? resolveSemanticColors(fact.intent)
    : null;

  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0 shrink-0", fact.xl && "pl-2 border-l border-border")}>
      <span className="text-xs font-medium text-muted-foregroundr whitespace-nowrap">
        {fact.label}
      </span>
      <span className={cn(
        "whitespace-nowrap leading-tight",
        fact.xl ? "text-base font-medium" : "text-sm font-medium",
        fact.valueType === "code" && "tabular-nums",
        intentClasses ? intentClasses.text : "text-foreground",
      )}>
        {fact.value}
        {fact.xl && fact.currency && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{fact.currency}</span>
        )}
      </span>
      {fact.subValue && (
        <span className={cn(
          "text-xs",
          fact.intent ? intentClasses?.text : "text-muted-foreground",
        )}>
          {fact.subValue}
        </span>
      )}
    </div>
  );
}

export function EntityFactRail({ facts, mode, className }: EntityFactRailProps) {
  if (facts.length === 0) return null;

  // Collapsed: show only the xl/hero cell, or the first two cells if none is xl.
  const visibleFacts = mode === "collapsed"
    ? (facts.find(f => f.xl) ? facts.filter(f => f.xl) : facts.slice(0, 2))
    : facts;

  return (
    <div className={cn(
      "border-t border-border px-4 py-3 sm:px-5 lg:px-[22px]",
      className,
    )}>
      <div className="flex items-start gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleFacts.map(fact => (
          <FactCell key={fact.id} fact={fact} />
        ))}
      </div>
    </div>
  );
}
