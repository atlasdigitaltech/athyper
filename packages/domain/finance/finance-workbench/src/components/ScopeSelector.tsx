"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@athyper/ui/primitives";
import type { FinanceScope, ScopeType } from "../lib/scope";

export interface ScopeOption {
  type: ScopeType;
  id: string;
  label: string;
}

interface ScopeSelectorProps {
  value: FinanceScope;
  onChange: (scope: FinanceScope) => void;
  companies: Array<{ code: string; name: string }>;
  entities: Array<{ id: string; code: string; name: string }>;
  allowGroup?: boolean;
  size?: "sm" | "md";
}

export function ScopeSelector({
  value,
  onChange,
  companies,
  entities,
  allowGroup = true,
  size = "sm",
}: ScopeSelectorProps) {
  const triggerClass = size === "sm" ? "h-6 w-52 text-[10px]" : "h-7 w-64 text-xs";

  // Build a single flat list: "company:AUKA", "entity:<uuid>", "group:GROUP"
  const current = `${value.scopeType}:${value.scopeId}`;

  function handleChange(raw: string) {
    const idx = raw.indexOf(":");
    const type = raw.slice(0, idx) as ScopeType;
    const id = raw.slice(idx + 1);
    onChange({ ...value, scopeType: type, scopeId: id });
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className={triggerClass}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowGroup && (
          <SelectItem value="group:GROUP">All companies (group)</SelectItem>
        )}
        {entities.length > 0 && (
          <>
            <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Legal entities
            </div>
            {entities.map((e) => (
              <SelectItem key={e.id} value={`legal_entity:${e.id}`}>
                {e.code} — {e.name}
              </SelectItem>
            ))}
          </>
        )}
        <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          Companies
        </div>
        {companies.map((c) => (
          <SelectItem key={c.code} value={`company:${c.code}`}>
            {c.code} — {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
