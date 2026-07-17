"use client";

import { useRouter } from "next/navigation";
import { Check, Rows3 } from "lucide-react";
import type { ViewDensity } from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import { PaletteButton } from "./palette-button";
import { PalettePanel } from "./palette-panel";
import { serializeOrganizeState } from "./organize-url";
import { useOrganizePanel } from "./organize-state";

interface DensityControlProps {
  density:         ViewDensity;
  listBaseHref:    string;
  rawSearchParams: Record<string, string | string[] | undefined>;
}

const DENSITIES: Array<{ value: ViewDensity; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

export function DensityControl({
  density,
  listBaseHref,
  rawSearchParams,
}: DensityControlProps) {
  const router = useRouter();
  const panel = useOrganizePanel("density");

  const commit = (value: ViewDensity) => {
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      [P.DENSITY]: value === "compact" ? null : value,
    }));
    panel.close();
  };

  return (
    <>
      <PalettePanel
        open={panel.open}
        onOpenChange={(next) => next ? panel.show() : panel.close()}
        title="Density"
        width={280}
        trigger={(
      <PaletteButton
        icon={Rows3}
        label="Density"
        active={density !== "compact"}
        expanded={panel.open}
      />
        )}
      >
          <div className="grid gap-1 rounded-md border p-1">
            {DENSITIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => commit(option.value)}
                className={[
                  "flex h-9 items-center justify-between rounded px-3 text-left text-sm transition-colors",
                  density === option.value ? "bg-foreground font-medium text-background" : "hover:bg-muted",
                ].join(" ")}
              >
                {option.label}
                {density === option.value && <Check aria-hidden="true" className="size-4" />}
              </button>
            ))}
          </div>
      </PalettePanel>
    </>
  );
}
