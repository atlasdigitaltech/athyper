"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ─── Color Palette ───────────────────────────────────────────
// Groups of theme-aware CSS custom property names.
// Swatches resolve via var(--<token>) so they adapt to the
// active theme preset (bubblegum, cosmic-night, etc.) and mode.

interface ColorGroup {
  label: string;
  tokens: { value: string; label: string }[];
}

const COLOR_PALETTE: ColorGroup[] = [
  {
    label: "Categorical",
    tokens: [
      { value: "categorical-1", label: "Cat 1" },
      { value: "categorical-2", label: "Cat 2" },
      { value: "categorical-3", label: "Cat 3" },
      { value: "categorical-4", label: "Cat 4" },
      { value: "categorical-5", label: "Cat 5" },
    ],
  },
  {
    label: "Semantic",
    tokens: [
      { value: "primary", label: "Primary" },
      { value: "success", label: "Success" },
      { value: "warning", label: "Warning" },
      { value: "info", label: "Info" },
      { value: "destructive", label: "Destructive" },
    ],
  },
  {
    label: "Extended",
    tokens: [
      { value: "blue", label: "Blue" },
      { value: "green", label: "Green" },
      { value: "amber", label: "Amber" },
      { value: "purple", label: "Purple" },
      { value: "teal", label: "Teal" },
      { value: "red", label: "Red" },
      { value: "yellow", label: "Yellow" },
      { value: "gray", label: "Gray" },
      { value: "pink", label: "Pink" },
      { value: "orange", label: "Orange" },
      { value: "indigo", label: "Indigo" },
      { value: "cyan", label: "Cyan" },
    ],
  },
];

// Extended palette uses direct CSS color values (not custom properties)
// so they always render predictably across themes.
const EXTENDED_FALLBACK: Record<string, string> = {
  blue: "oklch(0.55 0.15 240)",
  green: "oklch(0.55 0.14 155)",
  amber: "oklch(0.65 0.14 75)",
  purple: "oklch(0.50 0.15 290)",
  teal: "oklch(0.55 0.10 185)",
  red: "oklch(0.55 0.20 25)",
  yellow: "oklch(0.75 0.15 85)",
  gray: "oklch(0.55 0.00 0)",
  pink: "oklch(0.60 0.17 350)",
  orange: "oklch(0.65 0.17 50)",
  indigo: "oklch(0.45 0.15 270)",
  cyan: "oklch(0.60 0.10 200)",
};

function resolveSwatchColor(token: string): string {
  // Categorical & semantic tokens use CSS custom properties
  if (token.startsWith("categorical-") || ["primary", "success", "warning", "info", "destructive"].includes(token)) {
    return `var(--${token})`;
  }
  // Extended palette uses OKLCh fallbacks
  return EXTENDED_FALLBACK[token] ?? `var(--${token}, gray)`;
}

// ─── Component ───────────────────────────────────────────────

interface ColorTokenPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ColorTokenPicker({
  value,
  onChange,
  className,
}: ColorTokenPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`h-8 w-full justify-start gap-2 font-mono text-sm ${className ?? ""}`}
        >
          {value ? (
            <>
              <span
                className="inline-block size-4 shrink-0 rounded-full border"
                style={{ backgroundColor: resolveSwatchColor(value) }}
              />
              <span className="truncate">{value}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Select color...</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          {COLOR_PALETTE.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.tokens.map((token) => {
                  const isSelected = value === token.value;
                  return (
                    <button
                      key={token.value}
                      type="button"
                      title={token.label}
                      onClick={() => {
                        onChange(token.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "relative flex size-7 items-center justify-center rounded-full border-2 transition-all hover:scale-110",
                        isSelected
                          ? "border-foreground ring-2 ring-ring ring-offset-1"
                          : "border-transparent hover:border-muted-foreground/30",
                      )}
                      style={{ backgroundColor: resolveSwatchColor(token.value) }}
                    >
                      {isSelected && (
                        <Check className="size-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Clear selection */}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="w-full rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Clear selection
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
