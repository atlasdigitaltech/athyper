"use client";

import type { AtlasTextResultCard } from "@athyper/atlas-agent-runtime";

export function TextCard({ card }: { card: AtlasTextResultCard }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      {card.title ? <h3 className="font-medium">{card.title}</h3> : null}
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{card.body}</p>
    </section>
  );
}
