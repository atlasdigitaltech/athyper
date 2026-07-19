"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Search, ShieldCheck, Trash2 } from "lucide-react";
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Skeleton,
} from "@athyper/ui/primitives";
import {
  usePostingRoleCoverage,
  usePostingRoleResolutionTrace,
  useRetirePostingRoleAccountMap,
  useSavePostingRoleAccountMap,
  type PostingRoleCoverageCell,
  type PostingRoleCoverageRow,
} from "../../hooks/usePostingRoleCoverage";

const TODAY = new Date().toISOString().slice(0, 10);
type Selection = { row: PostingRoleCoverageRow; cell: PostingRoleCoverageCell };

export function PostingRoleCoverageMatrix({ companyCode }: { companyCode: string }) {
  const [asOfDate, setAsOfDate] = useState(TODAY);
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("all");
  const [coverage, setCoverage] = useState("required");
  const [selection, setSelection] = useState<Selection | null>(null);
  const query = usePostingRoleCoverage(companyCode, asOfDate);

  const domains = useMemo(
    () => [...new Set(query.data?.rows.map((row) => row.domain) ?? [])].sort(),
    [query.data?.rows],
  );
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data?.rows ?? []).filter((row) => {
      if (domain !== "all" && row.domain !== domain) return false;
      if (needle && !`${row.roleCode} ${row.roleName}`.toLowerCase().includes(needle)) return false;
      if (coverage === "required" && !row.cells.some((cell) => cell.required)) return false;
      if (coverage === "missing" && !row.cells.some((cell) => cell.status === "missing" || cell.status === "invalid")) return false;
      if (coverage === "resolved" && !row.cells.some((cell) => cell.status === "resolved")) return false;
      return true;
    });
  }, [query.data?.rows, search, domain, coverage]);

  if (query.isLoading) return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (query.isError || !query.data) {
    return <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">Posting-role coverage could not be loaded.</p>;
  }

  const { summary, books } = query.data;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Posting Role Coverage Matrix</h2>
              <Badge variant={summary.ready ? "success" : "warning"} size="sm">
                {summary.ready ? "posting ready" : "coverage required"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Canonical role-to-account resolution by company and ledger book. Required cells feed posting readiness.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3 text-right text-sm">
            <Metric label="Coverage" value={`${summary.coveragePct}%`} />
            <Metric label="Resolved" value={String(summary.resolvedCells)} />
            <Metric label="Missing" value={String(summary.missingCells)} tone={summary.missingCells ? "warning" : undefined} />
            <Metric label="Invalid" value={String(summary.invalidCells)} tone={summary.invalidCells ? "danger" : undefined} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-end gap-3 border-b p-3">
          <div className="min-w-64 flex-1">
            <Label htmlFor="posting-role-search">Find posting role</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="posting-role-search" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" placeholder="Role code or name" />
            </div>
          </div>
          <div className="w-48">
            <Label>Domain</Label>
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All domains</SelectItem>{domains.map((item) => <SelectItem key={item} value={item}>{label(item)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Label>Coverage</Label>
            <Select value={coverage} onValueChange={setCoverage}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="required">Required roles</SelectItem>
                <SelectItem value="missing">Needs attention</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All roles</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40"><Label htmlFor="role-as-of">Effective on</Label><Input id="role-as-of" className="mt-1" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} /></div>
          <Badge variant="muted" size="sm" className="mb-2">{rows.length} roles</Badge>
        </div>

        {books.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Assign an active ledger book before configuring posting roles.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 min-w-72 border-b bg-muted/90 px-4 py-3">Canonical posting role</th>
                  {books.map((book) => (
                    <th key={book.bookId} className="min-w-56 border-b border-l px-3 py-3">
                      <div className="flex items-center gap-2"><span>{book.bookCode}</span>{book.isPrimary && <Badge variant="info" size="sm">primary</Badge>}</div>
                      <span className="normal-case font-normal">{book.bookName}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.roleCode} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="sticky left-0 z-[1] bg-card px-4 py-3 align-top">
                      <div className="font-medium">{row.roleName}</div>
                      <div className="font-mono text-xs text-muted-foreground">{row.roleCode}</div>
                      <div className="mt-1 flex gap-1"><Badge variant="outline" size="sm">{label(row.domain)}</Badge><Badge variant="muted" size="sm">{row.normalBalance}</Badge></div>
                    </td>
                    {row.cells.map((cell) => <CoverageCell key={cell.bookId} cell={cell} onOpen={() => setSelection({ row, cell })} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PostingRoleAssignmentDialog
        companyCode={companyCode} asOfDate={asOfDate} selection={selection}
        accounts={query.data.accounts} onClose={() => setSelection(null)}
      />
    </div>
  );
}

function CoverageCell({ cell, onOpen }: { cell: PostingRoleCoverageCell; onOpen: () => void }) {
  const tone = cell.status === "resolved" ? "success" : cell.status === "invalid" ? "warning" : cell.status === "missing" ? "warning" : "muted";
  return (
    <td className="border-l px-3 py-3 align-top">
      <button type="button" onClick={onOpen} className="w-full rounded-lg border bg-background p-2.5 text-left transition hover:border-primary/50 hover:bg-primary/5">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={tone} size="sm">{cell.status.replace("_", " ")}</Badge>
          {cell.required && <span className="text-[10px] font-semibold uppercase text-warning">required</span>}
        </div>
        {cell.glAccountCode ? (
          <><div className="mt-2 font-mono text-xs font-semibold">{cell.glAccountCode}</div><div className="truncate text-xs text-muted-foreground">{cell.glAccountName}</div></>
        ) : <div className="mt-2 text-xs text-muted-foreground">Click to assign or trace</div>}
      </button>
    </td>
  );
}

function PostingRoleAssignmentDialog({
  companyCode, asOfDate, selection, accounts, onClose,
}: {
  companyCode: string; asOfDate: string; selection: Selection | null;
  accounts: Array<{ glAccountId: string; accountCode: string; accountName: string; accountClass: string; normalBalance: string }>;
  onClose: () => void;
}) {
  const [glAccountId, setGlAccountId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(asOfDate);
  const [priority, setPriority] = useState(100);
  const [showTrace, setShowTrace] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = useSavePostingRoleAccountMap(companyCode);
  const retire = useRetirePostingRoleAccountMap(companyCode);
  const trace = usePostingRoleResolutionTrace(
    companyCode, selection?.row.roleCode, selection?.cell.bookCode, asOfDate,
  );

  useEffect(() => {
    setGlAccountId(selection?.cell.glAccountId ?? "");
    setEffectiveFrom(selection?.cell.effectiveFrom ?? asOfDate);
    setPriority(selection?.cell.priority ?? 100);
    setShowTrace(false);
    setMessage(null);
  }, [selection, asOfDate]);

  if (!selection) return null;
  const compatibleAccounts = selection.row.normalBalance === "either"
    ? accounts
    : accounts.filter((account) => account.normalBalance.toLowerCase() === selection.row.normalBalance.toLowerCase());
  const busy = save.isPending || retire.isPending;
  const handleSave = async () => {
    if (!glAccountId) return;
    setMessage(null);
    try {
      await save.mutateAsync({
        mappingId: selection.cell.mappingId ?? undefined,
        companyCode, roleCode: selection.row.roleCode, ledgerBookId: selection.cell.bookId,
        glAccountId, effectiveFrom, priority,
      });
      onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Assignment failed."); }
  };
  const handleRetire = async () => {
    if (!selection.cell.mappingId) return;
    try { await retire.mutateAsync(selection.cell.mappingId); onClose(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Assignment could not be retired."); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{selection.row.roleName} · {selection.cell.bookCode}</DialogTitle>
          <DialogDescription>
            {selection.row.roleCode} · {selection.cell.required ? `Required by ${selection.cell.requiredBy.map(label).join(", ")}` : "Optional mapping"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label>Postable GL account</Label>
            <Select value={glAccountId} onValueChange={setGlAccountId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {compatibleAccounts.map((account) => (
                  <SelectItem key={account.glAccountId} value={account.glAccountId}>
                    {account.accountCode} · {account.accountName} ({account.normalBalance})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Effective from</Label><Input className="mt-1" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></div>
          <div><Label>Priority</Label><Input className="mt-1" type="number" min={0} max={1000} value={priority} onChange={(e) => setPriority(Number(e.target.value))} /></div>
          <div className="flex items-end"><Badge variant="outline" className="mb-2">Version {selection.cell.versionNo ?? "new"}</Badge></div>
        </div>

        <div className="rounded-lg border bg-muted/20">
          <button type="button" className="flex w-full items-center justify-between p-3 text-left text-sm font-medium" onClick={() => setShowTrace((value) => !value)}>
            <span className="flex items-center gap-2"><Eye className="h-4 w-4" /> Resolution trace</span>
            <Badge variant={trace.data?.status === "resolved" ? "success" : "warning"} size="sm">{trace.data?.status ?? "loading"}</Badge>
          </button>
          {showTrace && (
            <div className="space-y-2 border-t p-3">
              {trace.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : trace.data?.steps?.map((step, index) => (
                <div key={index} className="flex gap-3 text-xs"><span className="w-5 text-muted-foreground">{index + 1}</span><code className="whitespace-pre-wrap break-all">{JSON.stringify(step)}</code></div>
              ))}
            </div>
          )}
        </div>
        {message && <p className="text-sm text-destructive">{message}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          <div>{selection.cell.mappingId && <Button variant="destructive" size="sm" onClick={handleRetire} disabled={busy}><Trash2 className="mr-1 h-4 w-4" />Retire</Button>}</div>
          <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSave} disabled={busy || !glAccountId}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{selection.cell.mappingId ? "Create new version" : "Assign account"}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label: metricLabel, value, tone }: { label: string; value: string; tone?: "warning" | "danger" }) {
  return <div><div className={`text-lg font-semibold ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : ""}`}>{value}</div><div className="text-xs text-muted-foreground">{metricLabel}</div></div>;
}

function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
