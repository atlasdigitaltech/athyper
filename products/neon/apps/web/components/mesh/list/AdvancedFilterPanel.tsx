"use client";

// components/mesh/list/AdvancedFilterPanel.tsx
//
// Zone 3B — Collapsible multi-column filter form.

import { useListPage, useListPageActions } from "./ListPageContext";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdvancedFilterPanel<T>() {
  const { state, config } = useListPage<T>();
  const actions = useListPageActions();

  if (!config.advancedFilters || config.advancedFilters.length === 0) {
    return null;
  }

  const handleApply = () => {
    actions.setFilters(state.advancedFilters);
  };

  const handleClear = () => {
    actions.clearFilters();
  };

  return (
    <Collapsible open={state.advancedOpen}>
      <CollapsibleContent>
        <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {config.advancedFilters.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label htmlFor={`adv-${field.id}`} className="text-xs">
                  {field.label}
                </Label>

                {field.type === "text" && (
                  <Input
                    id={`adv-${field.id}`}
                    placeholder={field.placeholder}
                    value={state.advancedFilters[field.id] ?? ""}
                    onChange={(e) =>
                      actions.setFilter(field.id, e.target.value)
                    }
                    className="h-8"
                  />
                )}

                {field.type === "select" && field.options && (
                  <Select
                    value={state.advancedFilters[field.id] ?? ""}
                    onValueChange={(v) => actions.setFilter(field.id, v)}
                  >
                    <SelectTrigger id={`adv-${field.id}`} className="h-8">
                      <SelectValue
                        placeholder={field.placeholder ?? "Select..."}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {field.type === "date" && (
                  <Input
                    id={`adv-${field.id}`}
                    type="date"
                    value={state.advancedFilters[field.id] ?? ""}
                    onChange={(e) =>
                      actions.setFilter(field.id, e.target.value)
                    }
                    className="h-8"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <Button size="sm" onClick={handleApply}>
              Apply Filters
            </Button>
            <Button variant="outline" size="sm" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
