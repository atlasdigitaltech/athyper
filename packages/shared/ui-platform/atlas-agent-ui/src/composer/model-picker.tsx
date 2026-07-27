"use client";

import { Check, ChevronUp, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@athyper/ui";
import { resolveAtlasPublicModes } from "@athyper/atlas-agent-runtime";
import { useAtlas } from "../provider/atlas-context";

/**
 * Customer-facing Atlas mode picker. Provider names, upstream model IDs,
 * context limits, and pass-through token prices are intentionally absent.
 */
export function ModelPicker() {
  const atlas = useAtlas();

  if (!atlas.catalog) {
    return (
      <div
        className="flex items-center gap-1.5 text-muted-foreground"
        aria-label={atlas.catalogError ? "Atlas modes unavailable" : "Atlas modes loading"}
      >
        <Sparkles className="size-3.5" aria-hidden />
        <span className="text-[11px]">
          {atlas.catalogError ? "Atlas unavailable" : "Loading Atlas…"}
        </span>
      </div>
    );
  }

  const modes = resolveAtlasPublicModes(atlas.catalog, atlas.currentModelId);
  const selected = modes.find((mode) => mode.selected);
  const anyAvailable = modes.some((mode) => mode.modelId !== null);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!anyAvailable}
          aria-label="Select Atlas mode"
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          <span>
            {selected?.label ?? (anyAvailable ? "Select Atlas mode" : "Atlas unavailable")}
          </span>
          <ChevronUp className="size-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-1">
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Response mode
        </div>
        <ul className="flex flex-col">
          {modes.map((mode) => {
            const disabled = mode.modelId === null;
            return (
              <li key={mode.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (mode.modelId) atlas.setModelId(mode.modelId);
                  }}
                  className={
                    "flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors "
                    + (disabled
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-muted focus:bg-muted focus:outline-none")
                  }
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{mode.label}</span>
                    <span className="text-[11px] leading-4 text-muted-foreground">
                      {mode.description}
                    </span>
                  </span>
                  <span className="mt-0.5 flex shrink-0 items-center">
                    {disabled ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Unavailable
                      </span>
                    ) : mode.selected ? (
                      <Check className="size-3.5 text-primary" aria-hidden />
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
