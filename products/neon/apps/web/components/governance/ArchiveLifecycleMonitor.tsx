"use client";

import { useState, useMemo } from "react";
import {
  Archive,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  Search,
  HardDrive,
  Unplug,
  RotateCcw,
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

import { useArchiveLifecycle } from "@/lib/governance/hooks";

const LIFECYCLE_CONFIG: Record<string, { icon: typeof Archive; bg: string; text: string }> = {
  ARCHIVED: { icon: Archive, bg: "bg-blue-100 dark:bg-blue-950", text: "text-blue-800 dark:text-blue-300" },
  VERIFIED: { icon: CheckCircle2, bg: "bg-green-100 dark:bg-green-950", text: "text-green-800 dark:text-green-300" },
  DETACHED: { icon: Unplug, bg: "bg-amber-100 dark:bg-amber-950", text: "text-amber-800 dark:text-amber-300" },
  RESTORED: { icon: RotateCcw, bg: "bg-purple-100 dark:bg-purple-950", text: "text-purple-800 dark:text-purple-300" },
};

const RESTORE_STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  REQUESTED: { bg: "bg-blue-100 dark:bg-blue-950", text: "text-blue-800 dark:text-blue-300" },
  APPROVED: { bg: "bg-green-100 dark:bg-green-950", text: "text-green-800 dark:text-green-300" },
  RESTORING: { bg: "bg-amber-100 dark:bg-amber-950", text: "text-amber-800 dark:text-amber-300" },
  RESTORED: { bg: "bg-green-100 dark:bg-green-950", text: "text-green-800 dark:text-green-300" },
  FAILED: { bg: "bg-red-100 dark:bg-red-950", text: "text-red-800 dark:text-red-300" },
  REJECTED: { bg: "bg-red-100 dark:bg-red-950", text: "text-red-800 dark:text-red-300" },
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function ArchiveLifecycleMonitor() {
  const { data, loading, error, refresh } = useArchiveLifecycle();
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [tab, setTab] = useState<"manifests" | "restores">("manifests");

  const filteredManifests = useMemo(() => {
    if (!data) return [];
    return data.manifests.filter((m) => {
      if (lifecycleFilter !== "all" && m.lifecycle !== lifecycleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return m.partitionName.toLowerCase().includes(q) || m.sha256.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, search, lifecycleFilter]);

  const lifecycleCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, number> = {};
    for (const m of data.manifests) {
      counts[m.lifecycle] = (counts[m.lifecycle] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  const heldCount = data?.manifests.filter((m) => m.isHeld).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Archive Lifecycle Monitor</h2>
          <p className="text-sm text-muted-foreground">
            Track archive manifests through their lifecycle and monitor restore requests
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        {(["ARCHIVED", "VERIFIED", "DETACHED", "RESTORED"] as const).map((state) => {
          const cfg = LIFECYCLE_CONFIG[state];
          const Icon = cfg.icon;
          return (
            <Card key={state} className="p-3">
              <div className="flex items-center gap-3">
                <Icon className={`size-5 ${cfg.text}`} />
                <div>
                  <p className="text-2xl font-bold">{lifecycleCounts[state] ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{state}</p>
                </div>
              </div>
            </Card>
          );
        })}
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <Shield className="size-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{heldCount}</p>
              <p className="text-xs text-muted-foreground">Under Hold</p>
            </div>
          </div>
        </Card>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Tab selector */}
      <div className="flex items-center gap-2 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium ${tab === "manifests" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
          onClick={() => setTab("manifests")}
        >
          <HardDrive className="mr-1.5 inline size-4" />
          Manifests ({data?.manifests.length ?? 0})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium ${tab === "restores" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
          onClick={() => setTab("restores")}
        >
          <RotateCcw className="mr-1.5 inline size-4" />
          Restore Requests ({data?.restoreRequests.length ?? 0})
        </button>
      </div>

      {tab === "manifests" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by partition or hash..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
                <SelectItem value="VERIFIED">Verified</SelectItem>
                <SelectItem value="DETACHED">Detached</SelectItem>
                <SelectItem value="RESTORED">Restored</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading && !data ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partition</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Lifecycle</TableHead>
                  <TableHead>Hold</TableHead>
                  <TableHead>Archived</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredManifests.map((m) => {
                  const cfg = LIFECYCLE_CONFIG[m.lifecycle];
                  const Icon = cfg?.icon ?? Archive;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.partitionName}</TableCell>
                      <TableCell className="text-sm">{formatDate(m.partitionMonth)}</TableCell>
                      <TableCell className="text-sm">{m.rowCount.toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{formatBytes(m.sizeBytes)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{m.archiveFormat}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{m.tierAtArchive}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${cfg?.bg ?? ""} ${cfg?.text ?? ""}`}>
                          <Icon className="mr-1 size-3" />
                          {m.lifecycle}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {m.isHeld ? (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                            <Shield className="mr-1 size-3" /> Held
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(m.archivedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {tab === "restores" && (
        <>
          {loading && !data ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
            </div>
          ) : data?.restoreRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border p-8 text-muted-foreground">
              <RotateCcw className="mb-2 size-8" />
              <p>No restore requests</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approved By</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.restoreRequests.map((r) => {
                  const scfg = RESTORE_STATUS_CONFIG[r.status];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.requestedBy}</TableCell>
                      <TableCell className="max-w-48 truncate text-sm">{r.reason}</TableCell>
                      <TableCell>
                        <Badge className={`${scfg?.bg ?? ""} ${scfg?.text ?? ""}`}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.approvedBy ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(r.requestedAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(r.completedAt)}
                      </TableCell>
                      <TableCell>
                        {r.errorMessage && (
                          <span className="text-xs text-destructive">{r.errorMessage}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
