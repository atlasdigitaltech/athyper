"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Pencil, Plus, Star } from "lucide-react";
import {
  Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Input, Label, Skeleton,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { DefinitionStateChip } from "../company-hub/DefinitionStateChip";
import {
  useConfigureChartAssignments,
  useConfigureChartOptions,
  useConfigureBookAssignments,
  useConfigureBookOptions,
  type ConfigureChartAssignment,
  type ConfigureBookAssignment,
} from "../../hooks/useFinanceConfigure";
import {
  useDeactivateChartAssignment,
  useSaveChartAssignment,
  useSetPrimaryChartAssignment,
  useDeactivateBookAssignment,
  useSaveBookAssignment,
  useSetCompanyDefaultBook,
  type SaveBookAssignmentPayload,
  type SaveChartAssignmentPayload,
} from "../../hooks/useFinanceSetupMutations";


// ─── Chart Assignments panel ────────────────────────────────────────────────

export function ChartAssignmentPanel({ companyCode, className }: { companyCode: string; className?: string }) {
  const q = useConfigureChartAssignments(companyCode);
  const setPrimary = useSetPrimaryChartAssignment();
  const deactivate = useDeactivateChartAssignment();
  const [editor, setEditor] = useState<ConfigureChartAssignment | "new" | null>(null);

  return (
    <section id="chart-assignments" className={cn("scroll-mt-24 rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Chart assignments
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Operating chart drives postability; reporting charts drive statements.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditor("new")}><Plus className="mr-1 h-3.5 w-3.5" />Assign chart</Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : q.isError ? (
        <p className="p-6 text-sm text-destructive">Failed to load assignments.</p>
      ) : (q.data?.length ?? 0) === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No chart assignments configured.</p>
      ) : (
        <ul role="list" className="divide-y">
          {q.data!.map((a) => (
            <li key={a.assignmentId} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" size="sm">{a.assignmentType}</Badge>
                  <span className="text-sm font-medium">{a.chartName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{a.chartCode}</span>
                  {a.isPrimary && <Badge variant="info" size="sm">primary</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Effective {a.effectiveFrom ?? "—"}
                  {a.effectiveTo ? ` → ${a.effectiveTo}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <DefinitionStateChip
                  state={a.chartStatus as "draft" | "active" | "inactive"}
                  vocabulary={["draft", "active", "inactive"]}
                  objectKind="chart_of_account"
                  size="sm"
                />
                <DefinitionStateChip
                  state={a.status as "active" | "inactive"}
                  vocabulary={["active", "inactive"]}
                  objectKind="company_code_chart_assignment"
                  size="sm"
                />
                {!a.isPrimary && a.status === "active" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPrimary.mutate({ assignmentId: a.assignmentId, companyCode, expectedUpdatedAt: a.updatedAt })}
                    disabled={setPrimary.isPending}
                    aria-label="Make primary"
                    title="Make this assignment the primary for its type"
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setEditor(a)} aria-label={`Edit ${a.chartCode} assignment`}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button asChild variant="ghost" size="sm"><Link href={`/app/chart_of_account/${encodeURIComponent(a.chartId)}`} aria-label={`Open ${a.chartCode}`}><ExternalLink className="h-3.5 w-3.5" /></Link></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editor && <ChartAssignmentDialog companyCode={companyCode} assignment={editor === "new" ? null : editor}
        onClose={() => setEditor(null)} onDeactivate={(assignment) => deactivate.mutate({ companyCode,
          assignmentId: assignment.assignmentId, expectedUpdatedAt: assignment.updatedAt,
        }, { onSuccess: () => setEditor(null) })} deactivateError={deactivate.error as Error | null} />}
    </section>
  );
}

function ChartAssignmentDialog({ companyCode, assignment, onClose, onDeactivate, deactivateError }: {
  companyCode: string; assignment: ConfigureChartAssignment | null; onClose: () => void;
  onDeactivate: (assignment: ConfigureChartAssignment) => void; deactivateError: Error | null;
}) {
  const options = useConfigureChartOptions(companyCode);
  const save = useSaveChartAssignment();
  const [form, setForm] = useState<SaveChartAssignmentPayload>({
    companyCode, chartId: assignment?.chartId ?? "",
    assignmentType: (assignment?.assignmentType as SaveChartAssignmentPayload["assignmentType"]) ?? "operating",
    effectiveFrom: assignment?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    effectiveTo: assignment?.effectiveTo ?? null, isPrimary: assignment?.isPrimary ?? false,
    status: (assignment?.status as "active" | "inactive") ?? "active", expectedUpdatedAt: assignment?.updatedAt,
  });
  useEffect(() => {
    if (!form.chartId && options.data?.[0]) setForm((current) => ({ ...current, chartId: options.data![0]!.chartId }));
  }, [form.chartId, options.data]);
  const error = save.error as Error | null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{assignment ? "Edit Chart assignment" : "Assign Chart"}</DialogTitle>
          <DialogDescription>Only active tenant Charts can be assigned. Operating assignments determine posting-account reachability.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="chart-option">Chart of Accounts</Label>
            <select id="chart-option" value={form.chartId} disabled={Boolean(assignment)} onChange={(event) => setForm((current) => ({ ...current, chartId: event.target.value }))} className="h-10 rounded-md border bg-background px-3 text-sm">
              {(options.data ?? []).map((chart) => <option key={chart.chartId} value={chart.chartId} disabled={chart.status !== "active"}>{chart.name} ({chart.code}) · v{chart.version} · {chart.postingAccountCount} posting</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="assignment-type">Assignment type</Label>
            <select id="assignment-type" value={form.assignmentType} onChange={(event) => setForm((current) => ({ ...current, assignmentType: event.target.value as SaveChartAssignmentPayload["assignmentType"] }))} className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="operating">Operating</option><option value="local">Local</option><option value="group">Group</option><option value="reporting">Reporting</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="chart-from">Effective from</Label><Input id="chart-from" type="date" value={form.effectiveFrom ?? ""} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value || null }))} /></div>
            <div className="grid gap-1.5"><Label htmlFor="chart-to">Effective to</Label><Input id="chart-to" type="date" value={form.effectiveTo ?? ""} onChange={(event) => setForm((current) => ({ ...current, effectiveTo: event.target.value || null }))} /></div>
          </div>
          <div className="flex items-center gap-2"><Checkbox id="chart-primary" checked={form.isPrimary} onCheckedChange={(value) => setForm((current) => ({ ...current, isPrimary: Boolean(value) }))} /><Label htmlFor="chart-primary">Primary within assignment type</Label></div>
          {assignment?.status === "inactive" && <div className="flex items-center gap-2"><Checkbox id="chart-active" checked={form.status === "active"} onCheckedChange={(value) => setForm((current) => ({ ...current, status: value ? "active" : "inactive" }))} /><Label htmlFor="chart-active">Reactivate assignment</Label></div>}
          {(error || deactivateError) && <p className="text-sm text-destructive">{error?.message ?? deactivateError?.message}</p>}
        </div>
        <DialogFooter className="sm:justify-between">
          <div>{assignment?.status === "active" && <Button variant="ghost" className="text-destructive" onClick={() => onDeactivate(assignment)}>Deactivate</Button>}</div>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!form.chartId || save.isPending} onClick={() => save.mutate({ ...form, assignmentId: assignment?.assignmentId }, { onSuccess: onClose })}>{save.isPending ? "Saving…" : "Save assignment"}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Book Assignments panel ─────────────────────────────────────────────────

export function BookAssignmentPanel({ companyCode, className }: { companyCode: string; className?: string }) {
  const q = useConfigureBookAssignments(companyCode);
  const setDefault = useSetCompanyDefaultBook();
  const deactivate = useDeactivateBookAssignment();
  const [editor, setEditor] = useState<ConfigureBookAssignment | "new" | null>(null);

  return (
    <section id="book-assignments" className={cn("scroll-mt-24 rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Book assignments
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ledger books determine postability windows and reporting currency.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditor("new")}><Plus className="mr-1 h-3.5 w-3.5" />Assign book</Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : q.isError ? (
        <p className="p-6 text-sm text-destructive">Failed to load books.</p>
      ) : (q.data?.length ?? 0) === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No books assigned.</p>
      ) : (
        <ul role="list" className="divide-y">
          {q.data!.map((b) => (
            <li key={b.assignmentId} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{b.bookName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{b.bookCode}</span>
                  {b.isCompanyDefault && <Badge variant="info" size="sm">company default</Badge>}
                  {b.isTenantDefault && <Badge variant="outline" size="sm">tenant default</Badge>}
                  {b.currencyCode && <Badge variant="outline" size="sm">{b.currencyCode}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{b.purpose ?? "book"} · {b.effectiveFrom} to {b.effectiveTo ?? "open-ended"} · priority {b.priority}</p>
                <p className="mt-1 text-xs text-muted-foreground">Currency: {b.currencySource === "assignment_override" ? "assignment override" : "book base"}{b.companyFunctionalCurrency && b.currencyCode !== b.companyFunctionalCurrency ? ` · company functional ${b.companyFunctionalCurrency}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {b.isPostingEnabled ? (
                  <Badge variant="success" size="sm">posting enabled</Badge>
                ) : (
                  <Badge variant="muted" size="sm">posting disabled</Badge>
                )}
                <DefinitionStateChip
                  state={b.assignmentStatus as "draft" | "active" | "inactive"}
                  vocabulary={["draft", "active", "inactive"]}
                  objectKind="book_assignment"
                  size="sm"
                />
                <Button asChild variant="ghost" size="sm"><Link href={`/app/ledger_book/${encodeURIComponent(b.bookId)}`} aria-label={`Open ${b.bookCode}`}><ExternalLink className="h-3.5 w-3.5" /></Link></Button>
                {!b.isCompanyDefault && b.isPostingEnabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDefault.mutate({ bookId: b.bookId, companyCode, expectedUpdatedAt: b.updatedAt })}
                    disabled={setDefault.isPending}
                    aria-label="Set as company default Book"
                    title="Set as company default Book"
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setEditor(b)} aria-label={`Edit ${b.bookCode}`}><Pencil className="h-3.5 w-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editor && <BookAssignmentDialog companyCode={companyCode} assignment={editor === "new" ? null : editor}
        onClose={() => setEditor(null)} onDeactivate={(assignment) => deactivate.mutate({ companyCode,
          assignmentId: assignment.assignmentId, expectedUpdatedAt: assignment.updatedAt,
        }, { onSuccess: () => setEditor(null) })} deactivateError={deactivate.error as Error | null} />}
    </section>
  );
}

function BookAssignmentDialog({ companyCode, assignment, onClose, onDeactivate, deactivateError }: {
  companyCode: string; assignment: ConfigureBookAssignment | null; onClose: () => void;
  onDeactivate: (assignment: ConfigureBookAssignment) => void; deactivateError: Error | null;
}) {
  const options = useConfigureBookOptions(companyCode);
  const save = useSaveBookAssignment();
  const [form, setForm] = useState<SaveBookAssignmentPayload>({
    companyCode, bookId: assignment?.bookId ?? "", effectiveFrom: assignment?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    effectiveTo: assignment?.effectiveTo ?? null, overrideCurrencyCode: assignment?.overrideCurrencyCode ?? null,
    alternateCoaPrefix: assignment?.alternateCoaPrefix ?? null, priority: assignment?.priority ?? 0,
    conflictStrategy: (assignment?.conflictStrategy as SaveBookAssignmentPayload["conflictStrategy"]) ?? "highest_priority",
    status: (assignment?.assignmentStatus as "active" | "inactive") ?? "active", setAsDefault: assignment?.isCompanyDefault ?? false,
    expectedUpdatedAt: assignment?.updatedAt,
  });
  useEffect(() => {
    if (!form.bookId && options.data?.[0]) setForm((current) => ({ ...current, bookId: options.data![0]!.bookId }));
  }, [form.bookId, options.data]);
  const selectedBook = options.data?.find((book) => book.bookId === form.bookId);
  const effectiveCurrency = form.overrideCurrencyCode?.trim().toUpperCase() || selectedBook?.baseCurrencyCode || assignment?.baseCurrencyCode;
  const error = save.error as Error | null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{assignment ? "Edit Book assignment" : "Assign Ledger Book"}</DialogTitle>
          <DialogDescription>The Company default is explicit. Priority is used only when resolving routing conflicts.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5"><Label htmlFor="book-option">Ledger Book</Label>
            <select id="book-option" value={form.bookId} disabled={Boolean(assignment)} onChange={(event) => setForm((current) => ({ ...current, bookId: event.target.value }))} className="h-10 rounded-md border bg-background px-3 text-sm">
              {(options.data ?? []).map((book) => <option key={book.bookId} value={book.bookId} disabled={book.status !== "active"}>{book.name} ({book.code}) · {book.baseCurrencyCode}{book.isTenantDefault ? " · tenant default" : ""}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="book-from">Effective from</Label><Input id="book-from" type="date" value={form.effectiveFrom} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label htmlFor="book-to">Effective to</Label><Input id="book-to" type="date" value={form.effectiveTo ?? ""} onChange={(event) => setForm((current) => ({ ...current, effectiveTo: event.target.value || null }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="book-currency">Override currency</Label><Input id="book-currency" maxLength={3} placeholder={selectedBook?.baseCurrencyCode ?? assignment?.baseCurrencyCode ?? "Book base"} value={form.overrideCurrencyCode ?? ""} onChange={(event) => setForm((current) => ({ ...current, overrideCurrencyCode: event.target.value.toUpperCase() || null }))} /></div>
            <div className="grid gap-1.5"><Label htmlFor="book-prefix">Alternate COA prefix</Label><Input id="book-prefix" value={form.alternateCoaPrefix ?? ""} onChange={(event) => setForm((current) => ({ ...current, alternateCoaPrefix: event.target.value || null }))} /></div>
          </div>
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Effective currency: <span className="font-medium text-foreground">{effectiveCurrency ?? "not resolved"}</span> from {form.overrideCurrencyCode ? "assignment override" : "Ledger Book base currency"}. Company functional currency is validation context.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="book-priority">Priority</Label><Input id="book-priority" type="number" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: Number(event.target.value) }))} /></div>
            <div className="grid gap-1.5"><Label htmlFor="book-strategy">Conflict strategy</Label><select id="book-strategy" value={form.conflictStrategy} onChange={(event) => setForm((current) => ({ ...current, conflictStrategy: event.target.value as SaveBookAssignmentPayload["conflictStrategy"] }))} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="highest_priority">Highest priority</option><option value="most_specific">Most specific</option><option value="error_on_conflict">Error on conflict</option></select></div>
          </div>
          {!assignment?.isCompanyDefault && <div className="flex items-center gap-2"><Checkbox id="book-default" checked={Boolean(form.setAsDefault)} onCheckedChange={(value) => setForm((current) => ({ ...current, setAsDefault: Boolean(value) }))} /><Label htmlFor="book-default">Set as Company default Book</Label></div>}
          {assignment?.assignmentStatus === "inactive" && <div className="flex items-center gap-2"><Checkbox id="book-active" checked={form.status === "active"} onCheckedChange={(value) => setForm((current) => ({ ...current, status: value ? "active" : "inactive" }))} /><Label htmlFor="book-active">Reactivate assignment</Label></div>}
          {(error || deactivateError) && <p className="text-sm text-destructive">{error?.message ?? deactivateError?.message}</p>}
        </div>
        <DialogFooter className="sm:justify-between"><div>{assignment?.assignmentStatus === "active" && <Button variant="ghost" className="text-destructive" disabled={assignment.isCompanyDefault} title={assignment.isCompanyDefault ? "Select another Company default first" : undefined} onClick={() => onDeactivate(assignment)}>Deactivate</Button>}</div>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!form.bookId || !form.effectiveFrom || save.isPending} onClick={() => save.mutate({ ...form, assignmentId: assignment?.assignmentId }, { onSuccess: onClose })}>{save.isPending ? "Saving…" : "Save assignment"}</Button></div></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
