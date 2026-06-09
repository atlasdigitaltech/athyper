"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Rows3 } from "lucide-react";
import type { ViewDensity } from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import { PaletteButton } from "./PaletteButton";
import { PalettePanel } from "./PalettePanel";
import { serializeOrganizeState } from "./organizeUrl";
import { useOrganizePanel } from "./organizeState";

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
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panel = useOrganizePanel("density");

  const commit = (value: ViewDensity) => {
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      [P.DENSITY]: value === "compact" ? null : value,
    }));
    panel.close();
  };

  return (
    <>
      <PaletteButton
        ref={buttonRef}
        icon={Rows3}
        label="Density"
        active={density !== "compact"}
        expanded={panel.open}
        onClick={panel.toggle}
      />
      {panel.open && (
        <PalettePanel anchorRef={buttonRef} title="Density" width={280} onClose={panel.close}>
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
      )}
    </>
  );
}
