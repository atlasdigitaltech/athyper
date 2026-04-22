"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import {
  Badge, Separator,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { useLegalEntities } from "../hooks/useScopeOptions";
import { useCompanyList } from "../hooks/useCharts";
import type { LegalEntity } from "../data/types";
import { ConsolBadge } from "../components/ChartBadge";

/* -- Entity tree row ------------------------------------------------------ */

function EntityRow({
  entity,
  entities,
  depth,
  selectedId,
  onSelect,
}: {
  entity: LegalEntity;
  entities: LegalEntity[];
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const children = entities.filter((e) => e.parentId === entity.id);
  const hasChildren = children.length > 0;

  return (
    <>
      <div
        onClick={() => onSelect(entity.id)}
        className={cn(
          "flex items-center gap-1.5 py-[3px] px-2 cursor-pointer rounded-md transition-colors",
          selectedId === entity.id
            ? "bg-accent"
            : "hover:bg-muted/50",
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <div
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded text-doc-label font-bold shrink-0",
            entity.entityType === "holding"
              ? "bg-accent/10 text-accent-foreground"
              : "bg-info/10 text-info",
          )}
        >
          {entity.country}
        </div>

        <span className="font-mono text-doc-support text-muted-foreground w-14 shrink-0">{entity.code}</span>
        <span className={cn("text-xs flex-1 truncate", entity.entityType === "holding" ? "font-medium" : "")}>{entity.name}</span>

        {entity.consolidationMethod && (
          <ConsolBadge method={entity.consolidationMethod} />
        )}
        {!entity.consolidationMethod && (
          <Badge variant="outline" className="text-doc-support py-0 bg-accent/10 text-accent-foreground border-accent/30">
            root
          </Badge>
        )}

        {entity.ownershipPct !== null && (
          <span
            className={cn(
              "text-doc-support font-mono w-10 text-right",
              entity.ownershipPct < 100 ? "text-warning font-medium" : "text-muted-foreground",
            )}
          >
            {entity.ownershipPct}%
          </span>
        )}

        {hasChildren && (
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        )}
      </div>

      {children.map((child) => (
        <EntityRow
          key={child.id}
          entity={child}
          entities={entities}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

/* -- Main view ------------------------------------------------------------ */

export function LegalEntityView() {
  const { data: entities = [], isLoading } = useLegalEntities();
  const { data: companies = [] } = useCompanyList();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCountry, setFilterCountry] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const countries = useMemo(
    () => [...new Set(entities.map((e) => e.country))].sort(),
    [entities],
  );
  const roots = entities.filter((e) => !e.parentId);
  const selected = entities.find((e) => e.id === selectedId);
  const children = selectedId ? entities.filter((e) => e.parentId === selectedId) : [];
  const linkedCompanies = selected
    ? companies.filter((c) => selected.companyCodes.includes(c.code))
    : [];

  const holdingCount = entities.filter((e) => e.entityType === "holding").length;
  const operatingCount = entities.filter((e) => e.entityType === "operating").length;

  return (
    <div className="flex h-full">
      {/* Left: tree */}
      <div className={cn("flex flex-col border-r", selected ? "w-[55%]" : "flex-1")}>
        <div className="px-3 py-1.5 border-b flex items-center gap-2">
          <h2 className="text-xs font-semibold">Group structure</h2>
          <span className="text-doc-support text-muted-foreground">
            {entities.length} entities · {holdingCount} holdings · {operatingCount} operating
          </span>
          <span className="flex-1" />
          <Select value={filterCountry} onValueChange={setFilterCountry}>
            <SelectTrigger className="h-6 w-28 text-doc-support"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-6 w-28 text-doc-support"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="holding">Holding</SelectItem>
              <SelectItem value="operating">Operating</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-doc-label text-muted-foreground">
            <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-success" />full</span>
            <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-info" />proportional</span>
            <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-warning" />equity</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1 py-0.5">
          {isLoading
            ? <div className="p-3 text-xs text-muted-foreground">Loading…</div>
            : roots.map((entity) => (
                <EntityRow
                  key={entity.id}
                  entity={entity}
                  entities={entities}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ))}
        </div>
      </div>

      {/* Right: detail */}
      {selected && (
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {/* Header line */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-doc-subtitle text-muted-foreground">{selected.code}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-doc-support py-0",
                selected.entityType === "holding"
                  ? "bg-accent/10 text-accent-foreground border-accent/30"
                  : "bg-info/10 text-info border-info/30",
              )}
            >
              {selected.entityType}
            </Badge>
            {selected.consolidationMethod && (
              <ConsolBadge method={selected.consolidationMethod} />
            )}
            <span className="text-sm font-semibold">{selected.name}</span>
          </div>

          {/* Properties - single inline row */}
          <div className="flex items-center gap-4 text-xs py-1 px-2 bg-muted/30 rounded-md">
            <div>
              <span className="text-doc-label text-muted-foreground uppercase mr-1">Own</span>
              <span className={cn("font-semibold", selected.ownershipPct !== null && selected.ownershipPct < 100 ? "text-warning" : "")}>
                {selected.ownershipPct !== null ? `${selected.ownershipPct}%` : "Root"}
              </span>
              {selected.ownershipPct !== null && selected.ownershipPct < 100 && (
                <span className="text-doc-support text-muted-foreground ml-1">(NCI {100 - selected.ownershipPct}%)</span>
              )}
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div>
              <span className="text-doc-label text-muted-foreground uppercase mr-1">Country</span>
              <span className="font-semibold">{selected.country}</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div>
              <span className="text-doc-label text-muted-foreground uppercase mr-1">Currency</span>
              <span className="font-semibold">{selected.functionalCurrency}</span>
              <span className="text-muted-foreground"> / {selected.reportingCurrency}</span>
            </div>
          </div>

          {/* Company codes */}
          {linkedCompanies.length > 0 && (
            <div>
              <h3 className="text-doc-support text-muted-foreground uppercase mb-1">
                Company codes ({linkedCompanies.length})
              </h3>
              {linkedCompanies.map((c) => (
                <div key={c.code} className="flex items-center gap-2 py-0.5 text-doc-subtitle">
                  <span className="font-mono font-medium w-12">{c.code}</span>
                  <span className="flex-1 text-muted-foreground truncate">{c.name}</span>
                  <span className="font-mono text-muted-foreground text-doc-support">{c.functionalCurrency}</span>
                </div>
              ))}
            </div>
          )}

          {/* Subsidiaries */}
          {children.length > 0 && (
            <div>
              <Separator className="mb-1.5" />
              <h3 className="text-doc-support text-muted-foreground uppercase mb-1">
                Subsidiaries ({children.length})
              </h3>
              {children.map((child) => (
                <div
                  key={child.id}
                  onClick={() => setSelectedId(child.id)}
                  className="flex items-center gap-1.5 py-[3px] px-1 rounded-md text-doc-subtitle cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <span className="font-mono text-doc-support text-muted-foreground w-14">{child.code}</span>
                  <span className="flex-1 truncate">{child.name}</span>
                  <ConsolBadge method={child.consolidationMethod!} />
                  <span className={cn("text-doc-support font-mono", child.ownershipPct! < 100 ? "text-warning" : "text-muted-foreground")}>
                    {child.ownershipPct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
