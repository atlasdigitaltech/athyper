"use client";

import { useState, useMemo } from "react";
import {
  Fingerprint,
  RefreshCw,
  Loader2,
  Search,
  ShieldAlert,
  Globe,
  FileCheck2,
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

import { usePiiInventory } from "@/lib/governance/hooks";

const CLASSIFICATION_COLORS: Record<string, string> = {
  DIRECT_ID: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  QUASI_ID: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  SENSITIVE: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  FINANCIAL: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  HEALTH: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  BIOMETRIC: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

export function PrivacyFieldInventory() {
  const { data, loading, error, refresh } = usePiiInventory();
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");

  const entities = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.fields.map((f) => f.entityName))].sort();
  }, [data]);

  const classifications = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.fields.map((f) => f.piiClassification))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.fields.filter((f) => {
      if (entityFilter !== "all" && f.entityName !== entityFilter) return false;
      if (classFilter !== "all" && f.piiClassification !== classFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          f.entityName.toLowerCase().includes(q) ||
          f.fieldPath.toLowerCase().includes(q) ||
          f.piiClassification.toLowerCase().includes(q) ||
          (f.lawfulBasis ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, search, entityFilter, classFilter]);

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Privacy Field Inventory / DSAR Readiness</h2>
          <p className="text-sm text-muted-foreground">
            Complete PII field map with classification, masking, lawful basis, and cross-border controls
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <Fingerprint className="size-5 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{summary?.totalPiiFields ?? 0}</p>
              <p className="text-xs text-muted-foreground">PII Fields</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <ShieldAlert className="size-5 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{summary?.consentRequiredCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Consent Required</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <Globe className="size-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{summary?.crossBorderRestrictedCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Cross-Border Restricted</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <FileCheck2 className="size-5 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{entities.length}</p>
              <p className="text-xs text-muted-foreground">Entities with PII</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Classification breakdown */}
      {summary && Object.keys(summary.byClassification).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.byClassification).map(([cls, count]) => (
            <Badge
              key={cls}
              className={CLASSIFICATION_COLORS[cls] ?? "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"}
            >
              {cls}: {count}
            </Badge>
          ))}
        </div>
      )}

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
            placeholder="Search fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {entities.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Classification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classifications</SelectItem>
            {classifications.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fields table */}
      {loading && !data ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border p-8 text-muted-foreground">
          <Fingerprint className="mb-2 size-8" />
          <p>No PII fields found</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entity</TableHead>
              <TableHead>Field Path</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Mask Strategy</TableHead>
              <TableHead>Lawful Basis</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead>Cross-Border</TableHead>
              <TableHead>Anonymization</TableHead>
              <TableHead>Retention Override</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((f, i) => (
              <TableRow key={`${f.entityName}-${f.fieldPath}-${i}`}>
                <TableCell className="text-sm font-medium">{f.entityName}</TableCell>
                <TableCell className="font-mono text-xs">{f.fieldPath}</TableCell>
                <TableCell>
                  <Badge className={CLASSIFICATION_COLORS[f.piiClassification] ?? ""}>
                    {f.piiClassification}
                  </Badge>
                </TableCell>
                <TableCell>
                  {f.maskStrategy ? (
                    <Badge variant="outline" className="text-xs">{f.maskStrategy}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">none</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {f.lawfulBasis ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {f.consentRequired ? (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Required
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">No</span>
                  )}
                </TableCell>
                <TableCell>
                  {f.crossBorderRestricted ? (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                      Restricted
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {f.anonymizationStrategy ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs">
                  {f.retentionOverrideDays ? (
                    <span>{f.retentionOverrideDays} days</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* DSAR readiness note */}
      {(summary?.totalPiiFields ?? 0) > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          DSAR Readiness: All PII fields are catalogued with classification, masking strategy, and lawful basis.
          Fields with consent_required=true must be included in consent management workflows.
          Cross-border restricted fields must not be transferred outside approved jurisdictions.
        </div>
      )}
    </div>
  );
}
