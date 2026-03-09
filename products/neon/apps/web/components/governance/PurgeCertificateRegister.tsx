"use client";

import { useState, useMemo } from "react";
import {
  FileCheck,
  RefreshCw,
  Loader2,
  Search,
  CheckCircle2,
  Clock,
  ShieldCheck,
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

import { useArchiveLifecycle } from "@/lib/governance/hooks";

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function PurgeCertificateRegister() {
  const { data, loading, error, refresh } = useArchiveLifecycle();
  const [search, setSearch] = useState("");

  const certificates = data?.purgeCertificates ?? [];

  const filtered = useMemo(() => {
    if (!search) return certificates;
    const q = search.toLowerCase();
    return certificates.filter(
      (c) =>
        c.partitionName.toLowerCase().includes(q) ||
        c.purgeReason.toLowerCase().includes(q) ||
        c.purgedBy.toLowerCase().includes(q) ||
        c.sha256.toLowerCase().includes(q),
    );
  }, [certificates, search]);

  const verifiedCount = certificates.filter((c) => c.deletionVerified).length;
  const pendingCount = certificates.filter((c) => !c.deletionVerified).length;
  const totalRows = certificates.reduce((s, c) => s + c.rowCount, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Purge Certificate Register</h2>
          <p className="text-sm text-muted-foreground">
            Immutable deletion proof for compliance audits — every purge generates a tamper-proof certificate
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <FileCheck className="size-5 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{certificates.length}</p>
              <p className="text-xs text-muted-foreground">Total Certificates</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{verifiedCount}</p>
              <p className="text-xs text-muted-foreground">Verified Deletions</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <Clock className="size-5 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{totalRows.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Rows Purged</p>
            </div>
          </div>
        </Card>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <Clock className="size-4" />
          {pendingCount} certificate(s) pending deletion verification
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search certificates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Certificates table */}
      {loading && !data ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border p-8 text-muted-foreground">
          <FileCheck className="mb-2 size-8" />
          <p>No purge certificates found</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partition</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Framework</TableHead>
              <TableHead>Approval Chain</TableHead>
              <TableHead>Purged</TableHead>
              <TableHead>Verified</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.partitionName}</TableCell>
                <TableCell className="text-sm">{formatDate(c.partitionMonth)}</TableCell>
                <TableCell className="text-sm">{c.rowCount.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{c.purgeMethod}</Badge>
                </TableCell>
                <TableCell className="max-w-40 truncate text-sm">{c.purgeReason}</TableCell>
                <TableCell>
                  {c.complianceFramework ? (
                    <Badge variant="outline" className="text-xs">{c.complianceFramework}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="text-muted-foreground">Req:</span> {c.requestedBy}
                  <br />
                  <span className="text-muted-foreground">Appr:</span> {c.approvedBy}
                </TableCell>
                <TableCell className="text-xs">
                  {formatDate(c.purgedAt)}
                  <br />
                  <span className="text-muted-foreground">by {c.purgedBy}</span>
                </TableCell>
                <TableCell>
                  {c.deletionVerified ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                      <CheckCircle2 className="mr-1 size-3" /> Verified
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <Clock className="mr-1 size-3" /> Pending
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* SHA256 audit note */}
      {filtered.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Each certificate stores a SHA-256 hash of the original archive data. Certificates are immutable — once created, they cannot be modified or deleted.
        </div>
      )}
    </div>
  );
}
