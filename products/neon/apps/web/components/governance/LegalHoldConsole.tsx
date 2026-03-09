"use client";

import { useState, useMemo } from "react";
import {
  Shield,
  ShieldOff,
  Plus,
  RefreshCw,
  Loader2,
  Search,
  Clock,
  AlertCircle,
  CheckCircle2,
  Archive,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useLegalHolds } from "@/lib/governance/hooks";

const SOURCE_COLORS: Record<string, string> = {
  LITIGATION: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REGULATORY: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  INTERNAL: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  PRESERVATION: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  INVESTIGATION: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

const SCOPE_LABELS: Record<string, string> = {
  global: "Global (all data)",
  schema: "Schema-level",
  table: "Table-level",
  entity: "Entity-level",
};

export function LegalHoldConsole() {
  const { data, loading, error, refresh, createHold, releaseHold } = useLegalHolds();
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "released">("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [releaseDialog, setReleaseDialog] = useState<{ holdId: string; ref: string } | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Create form state
  const [newHold, setNewHold] = useState({
    holdReference: "",
    holdSource: "LITIGATION",
    reason: "",
    scopeType: "table",
    targetSchema: "evt",
    targetTable: "event",
    complianceFramework: "",
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((h) => {
      if (filterActive === "active" && !h.isActive) return false;
      if (filterActive === "released" && h.isActive) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          h.holdReference.toLowerCase().includes(q) ||
          h.reason.toLowerCase().includes(q) ||
          h.holdSource.toLowerCase().includes(q) ||
          h.issuedBy.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, search, filterActive]);

  const activeCount = data?.filter((h) => h.isActive).length ?? 0;
  const releasedCount = data?.filter((h) => !h.isActive).length ?? 0;

  async function handleCreate() {
    if (!newHold.holdReference || !newHold.reason) return;
    setSubmitting(true);
    try {
      await createHold({
        ...newHold,
        complianceFramework: newHold.complianceFramework || undefined,
      });
      toast.success(`Legal hold "${newHold.holdReference}" created`);
      setShowCreateDialog(false);
      setNewHold({ holdReference: "", holdSource: "LITIGATION", reason: "", scopeType: "table", targetSchema: "evt", targetTable: "event", complianceFramework: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create hold");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRelease() {
    if (!releaseDialog || !releaseReason) return;
    setSubmitting(true);
    try {
      await releaseHold(releaseDialog.holdId, releaseReason);
      toast.success(`Hold "${releaseDialog.ref}" released`);
      setReleaseDialog(null);
      setReleaseReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to release hold");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Legal Hold Console</h2>
          <p className="text-sm text-muted-foreground">
            Manage legal holds, view overlap conflicts, and release holds with audit trail
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 size-4" /> New Hold
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <Shield className="size-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active Holds</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <ShieldOff className="size-5 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{releasedCount}</p>
              <p className="text-xs text-muted-foreground">Released</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <Archive className="size-5 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">
                {data?.filter((h) => h.isActive).reduce((s, h) => s + h.heldManifestCount, 0) ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Held Manifests</p>
            </div>
          </div>
        </Card>
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
            placeholder="Search holds..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterActive} onValueChange={(v) => setFilterActive(v as typeof filterActive)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Holds</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="released">Released</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Holds table */}
      {loading && !data ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Loading holds...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border p-8 text-muted-foreground">
          <Shield className="mb-2 size-8" />
          <p>No legal holds found</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Issued By</TableHead>
              <TableHead>Manifests</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="font-medium">{h.holdReference}</TableCell>
                <TableCell>
                  <Badge className={SOURCE_COLORS[h.holdSource] ?? ""}>
                    {h.holdSource}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-xs">
                    {SCOPE_LABELS[h.scopeType] ?? h.scopeType}
                    {h.targetSchema && ` (${h.targetSchema}${h.targetTable ? `.${h.targetTable}` : ""})`}
                  </span>
                </TableCell>
                <TableCell className="max-w-48 truncate text-sm">{h.reason}</TableCell>
                <TableCell className="text-sm">{h.issuedBy}</TableCell>
                <TableCell>
                  {h.isActive ? (
                    <Badge variant="outline">{h.heldManifestCount}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {h.isActive ? (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                      <Clock className="mr-1 size-3" /> Active
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                      <CheckCircle2 className="mr-1 size-3" /> Released
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {h.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReleaseDialog({ holdId: h.id, ref: h.holdReference })}
                    >
                      Release
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Hold Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Legal Hold</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Hold Reference</Label>
              <Input
                placeholder="e.g. LIT-2026-001"
                value={newHold.holdReference}
                onChange={(e) => setNewHold({ ...newHold, holdReference: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={newHold.holdSource} onValueChange={(v) => setNewHold({ ...newHold, holdSource: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LITIGATION">Litigation</SelectItem>
                  <SelectItem value="REGULATORY">Regulatory</SelectItem>
                  <SelectItem value="INTERNAL">Internal</SelectItem>
                  <SelectItem value="PRESERVATION">Preservation</SelectItem>
                  <SelectItem value="INVESTIGATION">Investigation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={newHold.scopeType} onValueChange={(v) => setNewHold({ ...newHold, scopeType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="schema">Schema</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="entity">Entity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(newHold.scopeType === "schema" || newHold.scopeType === "table") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Schema</Label>
                  <Input
                    value={newHold.targetSchema}
                    onChange={(e) => setNewHold({ ...newHold, targetSchema: e.target.value })}
                  />
                </div>
                {newHold.scopeType === "table" && (
                  <div className="space-y-2">
                    <Label>Table</Label>
                    <Input
                      value={newHold.targetTable}
                      onChange={(e) => setNewHold({ ...newHold, targetTable: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                placeholder="Reason for this legal hold..."
                value={newHold.reason}
                onChange={(e) => setNewHold({ ...newHold, reason: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Compliance Framework (optional)</Label>
              <Select value={newHold.complianceFramework} onValueChange={(v) => setNewHold({ ...newHold, complianceFramework: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  <SelectItem value="GDPR">GDPR</SelectItem>
                  <SelectItem value="PDPA">PDPA</SelectItem>
                  <SelectItem value="SOC2">SOC2</SelectItem>
                  <SelectItem value="HIPAA">HIPAA</SelectItem>
                  <SelectItem value="PCI_DSS">PCI DSS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={submitting || !newHold.holdReference || !newHold.reason}
            >
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release Dialog */}
      <Dialog open={!!releaseDialog} onOpenChange={(open) => !open && setReleaseDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Hold: {releaseDialog?.ref}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/50">
              <AlertCircle className="mt-0.5 size-4 text-amber-600" />
              <p className="text-amber-800 dark:text-amber-300">
                Releasing this hold will unfreeze retention and tiering processing for its scope.
                Manifests held only by this hold will become eligible for lifecycle transitions.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Release Reason (required)</Label>
              <Input
                placeholder="Reason for releasing this hold..."
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseDialog(null)}>Cancel</Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleRelease}
              disabled={submitting || !releaseReason}
            >
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Release Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
