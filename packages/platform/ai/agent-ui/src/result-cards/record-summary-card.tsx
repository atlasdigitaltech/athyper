"use client";

import { Database, ShieldCheck } from "lucide-react";
import type { AtlasRecordSummaryCard as AtlasRecordSummaryCardValue } from "@athyper/platform-ai-agent-runtime";

export function RecordSummaryCard({
  card,
}: {
  card: AtlasRecordSummaryCardValue;
}) {
  return (
    <section
      className="w-full rounded-xl border border-border/70 bg-background/80 p-3 text-sm"
      aria-label={`Record summary: ${card.title}`}
    >
      <header className="flex items-start gap-2">
        <Database className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h4 className="truncate font-medium text-foreground">{card.title}</h4>
          <p className="truncate text-xs text-muted-foreground">
            {card.entityType} · {card.entityId}
          </p>
        </div>
      </header>
      {card.fields.length > 0 ? (
        <dl className="mt-3 grid gap-2">
          {card.fields.map((field, index) => (
            <div
              key={`${field.label}:${index}`}
              className="grid grid-cols-[minmax(6rem,0.8fr)_minmax(0,1.2fr)] gap-2"
            >
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="break-words text-foreground">{field.displayValue}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <footer className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3" aria-hidden />
        <span>
          Verified from {card.evidence.length} authorized source
          {card.evidence.length === 1 ? "" : "s"}
        </span>
      </footer>
    </section>
  );
}
