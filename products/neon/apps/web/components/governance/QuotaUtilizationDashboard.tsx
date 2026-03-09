"use client";

import { useState, useMemo } from "react";
import {
  Gauge,
  RefreshCw,
  Loader2,
  Search,
  AlertTriangle,
  XCircle,
  CheckCircle2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useQuotas } from "@/lib/governance/hooks";

const STATUS_CONFIG = {
  OK: {
    icon: CheckCircle2,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-800 dark:text-green-300",
    barColor: "bg-green-500",
  },
  WARNING: {
    icon: AlertTriangle,
    bg: "bg-amber-100 dark:bg-amber-950",
    text: "text-amber-800 dark:text-amber-300",
    barColor: "bg-amber-500",
  },
  EXCEEDED: {
    icon: XCircle,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-800 dark:text-red-300",
    barColor: "bg-red-500",
  },
} as const;

function formatValue(value: number, unit: string): string {
  if (unit === "bytes") {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return value.toLocaleString();
}

export function QuotaUtilizationDashboard() {
  const { data, loading, error, refresh } = useQuotas();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const categories = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map((q) => q.category))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((q) => {
      if (statusFilter !== "all" && q.status !== statusFilter) return false;
      if (categoryFilter !== "all" && q.category !== categoryFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return q.quotaName.toLowerCase().includes(s) || q.quotaKey.toLowerCase().includes(s);
      }
      return true;
    });
  }, [data, search, statusFilter, categoryFilter]);

  const statusCounts = useMemo(() => {
    if (!data) return { OK: 0, WARNING: 0, EXCEEDED: 0 };
    const c = { OK: 0, WARNING: 0, EXCEEDED: 0 };
    for (const q of data) c[q.status]++;
    return c;
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Quota Utilization Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Monitor resource quota usage, enforcement modes, and capacity planning
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(["OK", "WARNING", "EXCEEDED"] as const).map((status) => {
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          return (
            <Card key={status} className="p-3">
              <div className="flex items-center gap-3">
                <Icon className={`size-5 ${cfg.text}`} />
                <div>
                  <p className="text-2xl font-bold">{statusCounts[status]}</p>
                  <p className="text-xs text-muted-foreground">{status}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search quotas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="OK">OK</SelectItem>
            <SelectItem value="WARNING">Warning</SelectItem>
            <SelectItem value="EXCEEDED">Exceeded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quotas table */}
      {loading && !data ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border p-8 text-muted-foreground">
          <Gauge className="mb-2 size-8" />
          <p>No quotas found</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quota</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="w-48">Utilization</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Enforcement</TableHead>
              <TableHead>Overage</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((q) => {
              const cfg = STATUS_CONFIG[q.status];
              const Icon = cfg.icon;
              const barPct = Math.min(q.utilizationPct, 100);
              return (
                <TableRow key={q.id}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{q.quotaName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{q.quotaKey}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{q.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{q.utilizationPct.toFixed(1)}%</span>
                        <span className="text-muted-foreground">warn at {q.warningPct}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${cfg.barColor}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatValue(q.currentValue, q.limitUnit)} / {formatValue(q.limitValue, q.limitUnit)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {q.enforcement}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {q.overageAction}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${cfg.bg} ${cfg.text}`}>
                      <Icon className="mr-1 size-3" />
                      {q.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
