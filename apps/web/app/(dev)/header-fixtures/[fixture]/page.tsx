"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { EntityHeader } from "@athyper/entity-runtime/header";
import { FIXTURES } from "@athyper/entity-runtime/header";
import type { HeaderMode } from "@athyper/entity-runtime/header";

const MODES: HeaderMode[] = ["expanded", "collapsed", "pinned"];

export default function HeaderFixturePage({
  params,
}: {
  params: Promise<{ fixture: string }>;
}) {
  const { fixture } = use(params);
  const model = FIXTURES[fixture];
  if (!model) notFound();

  return (
    <div className="space-y-10 max-w-5xl">
      <div>
        <p className="text-xs font-mono text-muted-foreground mb-1">{fixture}</p>
        <h2 className="text-base font-semibold">
          All three modes
        </h2>
      </div>

      {MODES.map(mode => (
        <div key={mode} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            mode = {mode}
          </p>
          <EntityHeader
            model={model}
            mode={mode}
            activeTab={model.tabs?.[0]?.id}
          />
        </div>
      ))}
    </div>
  );
}
