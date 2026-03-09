"use client";

// components/finance/DimensionPicker.tsx
//
// Reusable dimension picker for journal entries and document lines.
// Shows available dimension types for the entity, lets users pick values.
// Supports hierarchical dimension values and search.

import { Layers, X } from "lucide-react";
import { useState, useMemo, useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDimensionTypes,
  useDimensionValues,
} from "@/lib/finance/use-dimensions";
import type { DimensionSelectionDTO } from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DimensionPickerProps {
  entityCode: string;
  /** Current selections */
  value: DimensionSelectionDTO[];
  /** Called when selections change */
  onChange: (selections: DimensionSelectionDTO[]) => void;
  /** Compact mode for inline use in grids */
  compact?: boolean;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DimensionPicker({
  entityCode,
  value,
  onChange,
  compact = false,
  disabled = false,
}: DimensionPickerProps) {
  const [addingType, setAddingType] = useState<string | null>(null);
  const [valueSearch, setValueSearch] = useState("");

  const { data: types } = useDimensionTypes(entityCode);

  // Filter out already-selected types
  const availableTypes = useMemo(
    () =>
      (types ?? []).filter(
        (t) => t.isActive && !value.some((v) => v.typeCode === t.code),
      ),
    [types, value],
  );

  const { data: values } = useDimensionValues(
    addingType
      ? { entityCode, typeCode: addingType, postableOnly: true }
      : null,
  );

  const filteredValues = useMemo(() => {
    if (!values) return [];
    if (!valueSearch) return values;
    const q = valueSearch.toLowerCase();
    return values.filter(
      (v) =>
        v.code.toLowerCase().includes(q) ||
        v.name.toLowerCase().includes(q),
    );
  }, [values, valueSearch]);

  const handleSelectValue = useCallback(
    (valueId: string) => {
      if (!types || !values) return;
      const dimType = types.find((t) => t.code === addingType);
      const dimValue = values.find((v) => v.id === valueId);
      if (!dimType || !dimValue) return;

      const selection: DimensionSelectionDTO = {
        typeCode: dimType.code,
        typeName: dimType.name,
        valueId: dimValue.id,
        valueCode: dimValue.code,
        valueName: dimValue.name,
      };

      onChange([...value, selection]);
      setAddingType(null);
      setValueSearch("");
    },
    [types, values, addingType, value, onChange],
  );

  const handleRemove = useCallback(
    (typeCode: string) => {
      onChange(value.filter((v) => v.typeCode !== typeCode));
    },
    [value, onChange],
  );

  // ── Compact mode: just show badges ─────────────────────────────
  if (compact && value.length === 0 && disabled) {
    return <span className="text-xs text-muted-foreground">--</span>;
  }

  return (
    <div className="space-y-2">
      {/* Selected dimensions */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((sel) => (
            <Badge
              key={sel.typeCode}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span className="text-xs font-medium">{sel.typeName}:</span>
              <span className="text-xs">{sel.valueName}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(sel.typeCode)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Add dimension button */}
      {!disabled && availableTypes.length > 0 && (
        <Popover
          open={addingType !== null}
          onOpenChange={(open) => {
            if (!open) {
              setAddingType(null);
              setValueSearch("");
            }
          }}
        >
          <PopoverTrigger asChild>
            {addingType === null ? (
              <div>
                <Select
                  value=""
                  onValueChange={(code) => setAddingType(code)}
                >
                  <SelectTrigger
                    className={compact ? "h-7 w-[140px] text-xs" : "w-[200px]"}
                    size="sm"
                  >
                    <div className="flex items-center gap-1.5">
                      <Layers className="size-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Add dimension
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {availableTypes.map((t) => (
                      <SelectItem key={t.code} value={t.code}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <span />
            )}
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-3" align="start">
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Select {types?.find((t) => t.code === addingType)?.name} value
              </Label>
              <Input
                placeholder="Search values..."
                value={valueSearch}
                onChange={(e) => setValueSearch(e.target.value)}
                className="h-8"
                autoFocus
              />
              <div className="max-h-[200px] space-y-0.5 overflow-y-auto">
                {filteredValues.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelectValue(v.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    {v.level > 1 && (
                      <span
                        style={{ width: `${(v.level - 1) * 12}px` }}
                        className="shrink-0"
                      />
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {v.code}
                    </span>
                    <span className="truncate">{v.name}</span>
                  </button>
                ))}
                {filteredValues.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No values found
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setAddingType(null);
                  setValueSearch("");
                }}
              >
                Cancel
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Empty state */}
      {!disabled && value.length === 0 && availableTypes.length === 0 && (
        <span className="text-xs text-muted-foreground">
          No dimension types configured
        </span>
      )}
    </div>
  );
}
