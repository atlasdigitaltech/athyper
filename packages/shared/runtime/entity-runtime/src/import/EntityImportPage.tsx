"use client";

/**
 * EntityImportPage — /app/[entity]/import
 *
 * 5-step import wizard:
 *   1. UPLOAD    — drag-drop file, server issues upload token
 *   2. MAP       — map CSV columns → entity fields, set constants
 *   3. PREVIEW   — client-side validation on first 50 rows
 *   4. DRY-RUN   — server validates fully (uniqueness, business rules, cross-row)
 *   5. IMPORT    — execute with polling progress
 *   6. RESULT    — success/error summary, optional error report download
 *
 * File is uploaded once and held by the server via uploadToken — the client
 * never needs to re-send the file for dry-run or final import.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2,
  Download, FileText, Loader2, Upload, X,
} from "lucide-react";
import { useCompiledEntity } from "@athyper/query";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import { appEntityListHref } from "@athyper/runtime-shared/core";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Button, Input, Label, Progress, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@athyper/ui/primitives";
import { DragDropUploadZone } from "@athyper/content-ui";
const formatTitle = (code: string) =>
  code.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const getCsrfToken = () => {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
};
import type {
  ColumnMapping,
  ImportMode,
  ImportResult,
  ImportRowError,
  UploadTokenResponse,
} from "./types";

// ── Step state machine ────────────────────────────────────────────────────────

type Step = "upload" | "map" | "preview" | "dry-run" | "importing" | "result";

interface WizardState {
  step:         Step;
  uploadToken:  string | null;
  headers:      string[];
  rowCount:     number;
  previewRows:  unknown[][];
  mappings:     ColumnMapping[];
  mode:         ImportMode;
  dryRunResult: ImportResult | null;
  jobId:        string | null;
  finalResult:  ImportResult | null;
  error:        string | null;
}

const initialState: WizardState = {
  step:         "upload",
  uploadToken:  null,
  headers:      [],
  rowCount:     0,
  previewRows:  [],
  mappings:     [],
  mode:         "create",
  dryRunResult: null,
  jobId:        null,
  finalResult:  null,
  error:        null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function autoMap(headers: string[], fieldNames: string[]): ColumnMapping[] {
  return headers.map((h) => {
    const norm = h.toLowerCase().replace(/[\s_-]/g, "");
    const match = fieldNames.find((f) => f.toLowerCase().replace(/[\s_-]/g, "") === norm);
    return { csvHeader: h, fieldName: match ?? null };
  });
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string }[] = [
  { id: "upload",    label: "Upload" },
  { id: "map",       label: "Map" },
  { id: "preview",   label: "Preview" },
  { id: "dry-run",   label: "Validate" },
  { id: "importing", label: "Import" },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
            i < idx  ? "bg-primary text-primary-foreground" :
            i === idx ? "bg-primary/20 text-primary ring-1 ring-primary" :
            "bg-muted text-muted-foreground"
          }`}>
            {i < idx ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mx-1 h-px w-8 ${i < idx ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Upload ─────────────────────────────────────────────────────────────

function UploadStep({
  entityCode,
  mode,
  onModeChange,
  onComplete,
}: {
  entityCode:   string;
  mode:         ImportMode;
  onModeChange: (m: ImportMode) => void;
  onComplete:   (r: UploadTokenResponse) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const handleUpload = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    const fd   = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/import/upload`,
        { method: "POST", body: fd, headers: { "X-CSRF-Token": getCsrfToken() } },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const data = await res.json() as UploadTokenResponse;
      onComplete(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }, [entityCode, onComplete]);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="space-y-1.5">
        <Label className="text-xs">Import mode</Label>
        <Select value={mode} onValueChange={(v) => onModeChange(v as ImportMode)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="create" className="text-xs">Create only — reject if record exists</SelectItem>
            <SelectItem value="update" className="text-xs">Update only — reject if record not found</SelectItem>
            <SelectItem value="upsert" className="text-xs">Upsert — create or update by natural key</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DragDropUploadZone
        onUpload={handleUpload}
        accept=".csv,.xlsx,.xls"
        maxSizeMb={25}
        multiple={false}
        isUploading={isUploading}
      />
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Map ───────────────────────────────────────────────────────────────

function MapStep({
  headers,
  mappings,
  requiredFields,
  allFields,
  onMappingsChange,
  onNext,
  onBack,
}: {
  headers:         string[];
  mappings:        ColumnMapping[];
  requiredFields:  string[];
  allFields:       { name: string; label: string }[];
  onMappingsChange: (m: ColumnMapping[]) => void;
  onNext:          () => void;
  onBack:          () => void;
}) {
  const unmappedRequired = requiredFields.filter(
    (f) => !mappings.some((m) => m.fieldName === f && (m.constant !== undefined || m.csvHeader)),
  );

  const update = (idx: number, patch: Partial<ColumnMapping>) => {
    const next = [...mappings];
    next[idx] = { ...next[idx]!, ...patch };
    onMappingsChange(next);
  };

  return (
    <div className="space-y-4">
      {unmappedRequired.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Required fields not mapped: {unmappedRequired.join(", ")}
        </div>
      )}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">CSV Column</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Map to field</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Constant override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {mappings.map((m, i) => (
              <tr key={m.csvHeader} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-mono">{m.csvHeader}</td>
                <td className="px-3 py-2">
                  <Select
                    value={m.fieldName ?? "__skip"}
                    onValueChange={(v) => update(i, { fieldName: v === "__skip" ? null : v })}
                  >
                    <SelectTrigger className="h-7 text-xs min-w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip" className="text-xs text-muted-foreground">— skip —</SelectItem>
                      {allFields.map((f) => (
                        <SelectItem key={f.name} value={f.name} className="text-xs">
                          {f.label}
                          {requiredFields.includes(f.name) && <span className="ml-1 text-destructive">*</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={m.constant !== undefined ? String(m.constant) : ""}
                    onChange={(e) => update(i, { constant: e.target.value || undefined })}
                    placeholder="Override value…"
                    className="h-7 text-xs"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back</Button>
        <Button size="sm" onClick={onNext} disabled={unmappedRequired.length > 0}>
          Preview <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Preview ───────────────────────────────────────────────────────────

function PreviewStep({
  headers,
  previewRows,
  mappings,
  rowCount,
  onNext,
  onBack,
}: {
  headers:     string[];
  previewRows: unknown[][];
  mappings:    ColumnMapping[];
  rowCount:    number;
  onNext:      () => void;
  onBack:      () => void;
}) {
  const mappedCols = mappings.filter((m) => m.fieldName !== null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Showing first {Math.min(previewRows.length, 10)} of {rowCount} rows.
        Client-side validation only — server dry-run runs next.
      </p>
      <div className="overflow-auto rounded-md border max-h-64">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">#</th>
              {mappedCols.map((m) => (
                <th key={m.csvHeader} className="px-2 py-2 text-left font-medium text-muted-foreground">
                  {m.fieldName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {previewRows.slice(0, 10).map((row, i) => {
              const cells = row as unknown[];
              return (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                  {mappedCols.map((m) => {
                    const colIdx = headers.indexOf(m.csvHeader);
                    const val    = m.constant !== undefined ? m.constant : cells[colIdx];
                    return (
                      <td key={m.csvHeader} className="px-2 py-1.5 max-w-[200px] truncate">
                        {val == null ? <span className="text-muted-foreground/40">—</span> : String(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back</Button>
        <Button size="sm" onClick={onNext}>
          Validate on server <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 4: Dry-run result ────────────────────────────────────────────────────

function DryRunStep({
  result,
  onImport,
  onBack,
  isImporting,
}: {
  result:      ImportResult;
  onImport:    () => void;
  onBack:      () => void;
  isImporting: boolean;
}) {
  const canImport = result.failed === 0;
  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className={`rounded-lg border p-4 space-y-2 ${canImport ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          {canImport
            ? <><CheckCircle2 className="h-4 w-4 text-success" /> Validation passed</>
            : <><AlertCircle className="h-4 w-4 text-warning" /> Validation found {result.failed} error{result.failed !== 1 ? "s" : ""}</>
          }
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {result.created > 0  && <span className="text-success">+{result.created} to create</span>}
          {result.updated > 0  && <span className="text-primary">~{result.updated} to update</span>}
          {result.skipped > 0  && <span>skip {result.skipped}</span>}
          {result.failed > 0   && <span className="text-warning">✗ {result.failed} errors</span>}
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="max-h-48 overflow-auto rounded-md border space-y-0 divide-y divide-border/50">
          {result.errors.slice(0, 50).map((e: ImportRowError, i) => (
            <div key={i} className="flex gap-3 px-3 py-2 text-xs">
              <span className="text-muted-foreground shrink-0">Row {e.row}</span>
              {e.field && <span className="font-medium shrink-0">{e.field}</span>}
              <span className="text-destructive">{e.message}</span>
            </div>
          ))}
          {result.errors.length > 50 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              + {result.errors.length - 50} more errors…
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Fix mapping</Button>
        {canImport && (
          <Button size="sm" onClick={onImport} disabled={isImporting}>
            {isImporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
            Import {result.created + result.updated} records
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step 5: Progress ──────────────────────────────────────────────────────────

function ImportingStep({ processed, total }: { processed: number; total: number }) {
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-6 py-12 max-w-sm mx-auto text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="space-y-2 w-full">
        <p className="text-sm font-medium">Importing records…</p>
        <Progress value={pct} className="h-2" />
        <p className="text-xs text-muted-foreground">{processed} / {total} processed</p>
      </div>
    </div>
  );
}

// ── Step 6: Result ────────────────────────────────────────────────────────────

function ResultStep({
  result,
  entityCode,
  onImportAnother,
}: {
  result:         ImportResult;
  entityCode:     string;
  onImportAnother: () => void;
}) {
  const router  = useRouter();
  const success = result.failed === 0;
  return (
    <div className="flex flex-col items-center gap-6 py-8 max-w-sm mx-auto text-center">
      <div className={`flex h-16 w-16 items-center justify-center rounded-full ${success ? "bg-success/20" : "bg-warning/20"}`}>
        {success
          ? <CheckCircle2 className="h-8 w-8 text-success" />
          : <AlertCircle className="h-8 w-8 text-warning" />
        }
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{success ? "Import complete" : "Import completed with errors"}</p>
        <div className="flex justify-center gap-4 text-xs text-muted-foreground">
          {result.created > 0  && <span className="text-success">+{result.created} created</span>}
          {result.updated > 0  && <span className="text-primary">~{result.updated} updated</span>}
          {result.skipped > 0  && <span>skip {result.skipped}</span>}
          {result.failed > 0   && <span className="text-warning">✗ {result.failed} failed</span>}
        </div>
      </div>
      <div className="flex gap-2">
        {result.errorReportUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={result.errorReportUrl} download>
              <Download className="h-3.5 w-3.5 mr-1" /> Error Report
            </a>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onImportAnother}>
          Import another file
        </Button>
        <Button size="sm" onClick={() => router.push(appEntityListHref(entityCode))}>
          View {formatTitle(entityCode)}
        </Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface EntityImportPageProps {
  entityCode: string;
}

export function EntityImportPage({ entityCode }: EntityImportPageProps) {
  const [state, setState] = useState<WizardState>(initialState);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });

  const { data: entity, isLoading: metaLoading } = useCompiledEntity(entityCode);

  const allFields = entity ? resolveListConfig(entity).columns.map((f) => ({
    name:     f.name,
    label:    f.label ?? f.name,
    required: f.is_required ?? false,
  })) : [];
  const requiredFields = allFields.filter((f) => f.required).map((f) => f.name);

  // ── Step handlers ────────────────────────────────────────────────────────

  const handleUploadComplete = (r: UploadTokenResponse) => {
    const mappings = autoMap(r.headers, allFields.map((f) => f.name));
    setState((s) => ({ ...s, step: "map", uploadToken: r.uploadToken, headers: r.headers, rowCount: r.rowCount, previewRows: r.previewRows, mappings }));
  };

  const handleDryRun = useCallback(async () => {
    if (!state.uploadToken) return;
    setState((s) => ({ ...s, step: "dry-run", error: null }));
    try {
      const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/import`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ entityCode, uploadToken: state.uploadToken, mappings: state.mappings, mode: state.mode, dryRun: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Dry-run failed");
      }
      const result = await res.json() as ImportResult;
      setState((s) => ({ ...s, dryRunResult: result }));
    } catch (e) {
      setState((s) => ({ ...s, step: "preview", error: e instanceof Error ? e.message : "Validation failed" }));
    }
  }, [entityCode, state.uploadToken, state.mappings, state.mode]);

  const handleImport = useCallback(async () => {
    if (!state.uploadToken) return;
    setState((s) => ({ ...s, step: "importing", error: null }));
    setProgress({ processed: 0, total: state.rowCount });
    try {
      const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/import`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ entityCode, uploadToken: state.uploadToken, mappings: state.mappings, mode: state.mode, dryRun: false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Import failed");
      }
      const { jobId } = await res.json() as { jobId: string };

      // Poll for completion
      const poll = async (): Promise<ImportResult> => {
        const statusRes = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/import/${jobId}/status`);
        if (!statusRes.ok) throw new Error("Failed to poll status");
        const status = await statusRes.json() as { status: string; processed: number; total: number; result?: ImportResult };
        setProgress({ processed: status.processed, total: status.total });
        if (status.status === "completed" || status.status === "failed") {
          return status.result!;
        }
        await new Promise((r) => setTimeout(r, 2000));
        return poll();
      };

      const finalResult = await poll();
      setState((s) => ({ ...s, step: "result", finalResult }));
    } catch (e) {
      setState((s) => ({ ...s, step: "dry-run", error: e instanceof Error ? e.message : "Import failed" }));
    }
  }, [entityCode, state.uploadToken, state.mappings, state.mode, state.rowCount]);

  if (metaLoading || !entity) {
    return (
      <PageFrame title={`Import ${formatTitle(entityCode)}`}>
        <div className="space-y-3 max-w-2xl mx-auto">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PageFrame>
    );
  }

  const activeStep = state.step === "result" ? "importing" : state.step;

  return (
    <PageFrame
      title={`Import ${entity.entity_name}`}
      description="Bulk import records via CSV or Excel"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Step indicator */}
        {state.step !== "result" && (
          <div className="flex justify-center">
            <StepIndicator current={activeStep as Step} />
          </div>
        )}

        {/* Global error */}
        {state.error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {state.error}
            <button onClick={() => setState((s) => ({ ...s, error: null }))} className="ml-auto">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Step content */}
        {state.step === "upload" && (
          <UploadStep
            entityCode={entityCode}
            mode={state.mode}
            onModeChange={(mode) => setState((s) => ({ ...s, mode }))}
            onComplete={handleUploadComplete}
          />
        )}

        {state.step === "map" && (
          <MapStep
            headers={state.headers}
            mappings={state.mappings}
            requiredFields={requiredFields}
            allFields={allFields}
            onMappingsChange={(mappings) => setState((s) => ({ ...s, mappings }))}
            onNext={() => setState((s) => ({ ...s, step: "preview" }))}
            onBack={() => setState((s) => ({ ...s, step: "upload" }))}
          />
        )}

        {state.step === "preview" && (
          <PreviewStep
            headers={state.headers}
            previewRows={state.previewRows}
            mappings={state.mappings}
            rowCount={state.rowCount}
            onNext={() => void handleDryRun()}
            onBack={() => setState((s) => ({ ...s, step: "map" }))}
          />
        )}

        {state.step === "dry-run" && state.dryRunResult && (
          <DryRunStep
            result={state.dryRunResult}
            onImport={() => void handleImport()}
            onBack={() => setState((s) => ({ ...s, step: "preview" }))}
            isImporting={false}
          />
        )}

        {state.step === "dry-run" && !state.dryRunResult && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Running server validation…</p>
          </div>
        )}

        {state.step === "importing" && (
          <ImportingStep processed={progress.processed} total={progress.total} />
        )}

        {state.step === "result" && state.finalResult && (
          <ResultStep
            result={state.finalResult}
            entityCode={entityCode}
            onImportAnother={() => setState(initialState)}
          />
        )}
      </div>
    </PageFrame>
  );
}
