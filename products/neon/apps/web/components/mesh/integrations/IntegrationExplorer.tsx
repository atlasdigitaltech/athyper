"use client";

import {
  Activity,
  LayoutGrid,
  List,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";
import {
  ENDPOINT_TYPE_BORDER,
  ENDPOINT_TYPE_BADGE,
  SYNC_DOT,
  ACTIVE_BADGE,
} from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

export type EndpointType = "rest_api" | "graphql" | "soap" | "webhook";
export type AuthMethod = "none" | "api_key" | "basic" | "oauth2" | "hmac";

export interface IntegrationSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  endpointType: EndpointType;
  baseUrl: string;
  authMethod: AuthMethod;
  isActive: boolean;
  flowCount: number;
  webhookCount: number;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "failure" | "partial" | null;
  createdAt: string;
  updatedAt: string | null;
}

interface FilterValues {
  search: string;
  endpointType: string;
  authMethod: string;
}

// ─── Endpoint Type Helpers ───────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  rest_api: "REST API",
  graphql: "GraphQL",
  soap: "SOAP",
  webhook: "Webhook",
};

function EndpointTypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? type;
  const color = ENDPOINT_TYPE_BADGE[type] ?? "";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        color,
      )}
    >
      {label}
    </span>
  );
}

// ─── Auth Method Badge ───────────────────────────────────────

const AUTH_LABELS: Record<string, string> = {
  none: "None",
  api_key: "API Key",
  basic: "Basic",
  oauth2: "OAuth 2.0",
  hmac: "HMAC",
};

function AuthBadge({ method }: { method: string }) {
  const label = AUTH_LABELS[method] ?? method;
  return (
    <Badge variant="outline" className="text-xs font-normal">
      {label}
    </Badge>
  );
}

// ─── Sync Status Dot ─────────────────────────────────────────

function SyncStatusDot({ status }: { status: string | null }) {
  if (!status)
    return (
      <span className="text-xs text-muted-foreground italic">Never synced</span>
    );
  const color = SYNC_DOT[status] ?? "bg-muted-foreground/40";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-2 rounded-full", color)} />
      <span className="text-xs capitalize">{status}</span>
    </span>
  );
}

// ─── Integration Card ────────────────────────────────────────

function IntegrationCard({
  integration,
  basePath,
}: {
  integration: IntegrationSummary;
  basePath: string;
}) {
  const borderColor = ENDPOINT_TYPE_BORDER[integration.endpointType] ?? "";

  return (
    <Link href={`${basePath}/${integration.id}`}>
      <Card
        className={cn(
          "group h-full border-l-4 transition-all hover:shadow-md hover:border-foreground/20",
          borderColor,
          !integration.isActive && "opacity-60",
        )}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                {integration.name}
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <EndpointTypeBadge type={integration.endpointType} />
                <AuthBadge method={integration.authMethod} />
              </div>
            </div>
            <div className="shrink-0">
              {integration.isActive ? (
                <Badge
                  variant="outline"
                  className={cn("text-xs", ACTIVE_BADGE)}
                >
                  Active
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  Inactive
                </Badge>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground font-mono truncate">
            {integration.baseUrl}
          </p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Activity className="size-3" />
              {integration.flowCount} flows
            </span>
            <span className="inline-flex items-center gap-1">
              <Webhook className="size-3" />
              {integration.webhookCount} hooks
            </span>
            <SyncStatusDot status={integration.lastSyncStatus} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Integration Table ───────────────────────────────────────

function IntegrationTable({
  integrations,
  basePath: _basePath,
  onNavigate,
}: {
  integrations: IntegrationSummary[];
  basePath: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Base URL</TableHead>
          <TableHead>Auth</TableHead>
          <TableHead className="text-center">Flows</TableHead>
          <TableHead className="text-center">Webhooks</TableHead>
          <TableHead>Last Sync</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {integrations.map((integration) => (
          <TableRow
            key={integration.id}
            className={cn(
              "cursor-pointer",
              !integration.isActive && "opacity-60",
            )}
            onClick={() => onNavigate(integration.id)}
          >
            <TableCell>
              <div>
                <span className="font-medium">{integration.name}</span>
                <p className="text-xs text-muted-foreground font-mono">
                  {integration.code}
                </p>
              </div>
            </TableCell>
            <TableCell>
              <EndpointTypeBadge type={integration.endpointType} />
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs max-w-[200px] truncate">
              {integration.baseUrl}
            </TableCell>
            <TableCell>
              <AuthBadge method={integration.authMethod} />
            </TableCell>
            <TableCell className="text-center">
              {integration.flowCount}
            </TableCell>
            <TableCell className="text-center">
              {integration.webhookCount}
            </TableCell>
            <TableCell>
              <SyncStatusDot status={integration.lastSyncStatus} />
            </TableCell>
            <TableCell>
              {integration.isActive ? (
                <Badge
                  variant="outline"
                  className={cn("text-xs", ACTIVE_BADGE)}
                >
                  Active
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  Inactive
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Filters ─────────────────────────────────────────────────

function IntegrationFilters({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
}: {
  filters: FilterValues;
  onFiltersChange: (f: FilterValues) => void;
  viewMode: "grid" | "table";
  onViewModeChange: (m: "grid" | "table") => void;
}) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange({ ...filters, search: value });
      }, 300);
    },
    [filters, onFiltersChange],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search integrations..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      <Select
        value={filters.endpointType}
        onValueChange={(v) => onFiltersChange({ ...filters, endpointType: v })}
      >
        <SelectTrigger className="w-[140px] h-9">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="rest_api">REST API</SelectItem>
          <SelectItem value="graphql">GraphQL</SelectItem>
          <SelectItem value="soap">SOAP</SelectItem>
          <SelectItem value="webhook">Webhook</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.authMethod}
        onValueChange={(v) => onFiltersChange({ ...filters, authMethod: v })}
      >
        <SelectTrigger className="w-[140px] h-9">
          <SelectValue placeholder="Auth" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Auth</SelectItem>
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="api_key">API Key</SelectItem>
          <SelectItem value="basic">Basic</SelectItem>
          <SelectItem value="oauth2">OAuth 2.0</SelectItem>
          <SelectItem value="hmac">HMAC</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center rounded-md border">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 rounded-r-none px-2",
            viewMode === "grid" && "bg-muted",
          )}
          onClick={() => onViewModeChange("grid")}
        >
          <LayoutGrid className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 rounded-l-none px-2",
            viewMode === "table" && "bg-muted",
          )}
          onClick={() => onViewModeChange("table")}
        >
          <List className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Data Hook ───────────────────────────────────────────────

interface UseIntegrationListResult {
  integrations: IntegrationSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function useIntegrationList(): UseIntegrationListResult {
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchIntegrations = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/mesh/integration-studio", {
        headers: buildHeaders(),
        credentials: "same-origin",
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(
          body.error?.message ?? `Failed to load integrations (${res.status})`,
        );
      }

      const body = (await res.json()) as { data: IntegrationSummary[] };
      setIntegrations(body.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Failed to load integrations",
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
    return () => abortRef.current?.abort();
  }, [fetchIntegrations]);

  return { integrations, loading, error, refresh: fetchIntegrations };
}

// ─── Filter Logic ────────────────────────────────────────────

function filterIntegrations(
  integrations: IntegrationSummary[],
  filters: FilterValues,
): IntegrationSummary[] {
  return integrations.filter((i) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !i.name.toLowerCase().includes(q) &&
        !i.code.toLowerCase().includes(q) &&
        !(i.description ?? "").toLowerCase().includes(q) &&
        !i.baseUrl.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (
      filters.endpointType !== "all" &&
      i.endpointType !== filters.endpointType
    )
      return false;
    if (filters.authMethod !== "all" && i.authMethod !== filters.authMethod)
      return false;
    return true;
  });
}

// ─── Explorer ────────────────────────────────────────────────

interface IntegrationExplorerProps {
  basePath: string;
}

export function IntegrationExplorer({ basePath }: IntegrationExplorerProps) {
  const { integrations, loading, error, refresh } = useIntegrationList();
  const [filters, setFilters] = useState<FilterValues>({
    search: "",
    endpointType: "all",
    authMethod: "all",
  });
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const filtered = useMemo(
    () => filterIntegrations(integrations, filters),
    [integrations, filters],
  );

  const handleNavigate = useCallback(
    (id: string) => {
      window.location.href = `${basePath}/${id}`;
    },
    [basePath],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-[200px]" />
          <Skeleton className="h-9 w-[140px]" />
          <Skeleton className="h-9 w-[140px]" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[130px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
          <RefreshCw className="mr-1.5 size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <IntegrationFilters
          filters={filters}
          onFiltersChange={setFilters}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-3.5" />
          </Button>
          <Button size="sm">
            <Plus className="mr-1.5 size-3.5" />
            New Integration
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No integrations found"
          description={
            integrations.length === 0
              ? "Get started by creating your first integration endpoint."
              : "No integrations match your current filters. Try adjusting your search."
          }
          actionLabel={
            integrations.length === 0 ? "Create Integration" : undefined
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              basePath={basePath}
            />
          ))}
        </div>
      ) : (
        <IntegrationTable
          integrations={filtered}
          basePath={basePath}
          onNavigate={handleNavigate}
        />
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {integrations.length} integrations
        </p>
      )}
    </div>
  );
}
