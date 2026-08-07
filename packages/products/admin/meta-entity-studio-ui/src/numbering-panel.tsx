"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Button, Input } from "@athyper/platform-ui";
import type {
  MetaEntityFieldDraft,
  MetaEntityNumberingBindingDraft,
  MetaEntityNumberingTestArtifact,
  MetaEntityOperationDraft,
} from "@athyper/meta-entity-authoring-contracts";
import { EditorCheckbox, EditorInput, EditorSelect, PanelHeader, selectClassName } from "./editor-controls";

export function NumberingPanel({ bindings, fields, operations, artifacts, editable, testing, onPreview, onChange }: {
  bindings: readonly MetaEntityNumberingBindingDraft[];
  fields: readonly MetaEntityFieldDraft[];
  operations: readonly MetaEntityOperationDraft[];
  artifacts: readonly MetaEntityNumberingTestArtifact[];
  editable: boolean;
  testing: boolean;
  onPreview?: (bindingId: string, input: { nextValue: number; occurredAt: string; scopeKey?: string | null; fiscalYear?: string | null }) => void;
  onChange: (rows: readonly MetaEntityNumberingBindingDraft[]) => void;
}) {
  const [nextValue, setNextValue] = useState("1");
  const [occurredAt, setOccurredAt] = useState("2026-08-02T00:00");
  const [scopeKey, setScopeKey] = useState("");
  const [fiscalYear, setFiscalYear] = useState("");
  const latestByBinding = useMemo(() => new Map(artifacts.map((artifact) => [artifact.numberingBindingId, artifact])), [artifacts]);
  const numberFields = fields.filter((field) => field.status === "active" && field.dataType === "string"
    && field.cardinality === "one" && field.valueOrigin === "stored" && field.writeMode === "write_once");
  const activeOperations = operations.filter((operation) => operation.status === "active");
  const replace = (row: MetaEntityNumberingBindingDraft) => onChange(bindings.map((item) => item.id === row.id ? row : item));
  const add = () => {
    const field = numberFields.find((candidate) => !bindings.some((binding) => binding.fieldId === candidate.id && binding.targetPlane === "neon"));
    const operation = activeOperations.find((candidate) => candidate.operationKind === "create") ?? activeOperations[0];
    if (!field || !operation) return;
    onChange([...bindings, {
      id: crypto.randomUUID(),
      bindingKey: `${field.fieldKey}_neon`,
      fieldId: field.id,
      operationId: operation.id,
      targetPlane: "neon",
      policyCode: `${field.fieldKey}.standard`,
      policyRevision: 1,
      assignmentMode: "automatic",
      required: true,
      status: "active",
    }]);
  };

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Numbering bindings"
        description="Bind a write-once field to a consumer policy, compile a safe preview, and retain immutable evidence. Preview never advances a runtime counter."
        action={<Button size="sm" disabled={!editable || !numberFields.length || !activeOperations.length} onClick={add}><Plus className="size-4" aria-hidden />Add binding</Button>}
      />
      {!numberFields.length && <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">Create an active, stored, scalar, write-once string field before adding numbering.</p>}
      <div className="space-y-3">
        {bindings.map((row) => {
          const latest = latestByBinding.get(row.id);
          const output = latest?.actualOutput as Readonly<Record<string, unknown>> | undefined;
          return (
          <article key={row.id} className="space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <EditorInput label="Binding key" value={row.bindingKey} disabled={!editable} onChange={(bindingKey) => replace({ ...row, bindingKey })} />
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">Number field<select className={selectClassName} value={row.fieldId} disabled={!editable} onChange={(event) => replace({ ...row, fieldId: event.target.value })}>{numberFields.map((field) => <option key={field.id} value={field.id}>{field.fieldKey}</option>)}</select></label>
              <EditorSelect label="Target plane" value={row.targetPlane} options={["neon", "mesh"]} disabled={!editable} onChange={(targetPlane) => replace({ ...row, targetPlane })} />
              <EditorSelect label="Assignment" value={row.assignmentMode} options={["automatic", "manual"]} disabled={!editable} onChange={(assignmentMode) => replace({ ...row, assignmentMode, operationId: assignmentMode === "manual" ? null : row.operationId ?? activeOperations[0]?.id ?? null })} />
              <EditorInput label="Policy code" value={row.policyCode} disabled={!editable} onChange={(policyCode) => replace({ ...row, policyCode })} />
              <EditorInput label="Policy revision" type="number" value={String(row.policyRevision)} disabled={!editable} onChange={(value) => replace({ ...row, policyRevision: Math.max(1, Number(value) || 1) })} />
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">Trigger operation<select className={selectClassName} value={row.operationId ?? ""} disabled={!editable || row.assignmentMode === "manual"} onChange={(event) => replace({ ...row, operationId: event.target.value || null })}><option value="">Select operation</option>{activeOperations.map((operation) => <option key={operation.id} value={operation.id}>{operation.operationKey}</option>)}</select></label>
              <div className="flex items-end gap-3">
                <EditorCheckbox label="Required" checked={row.required} disabled={!editable} onChange={(required) => replace({ ...row, required })} />
                <Button size="sm" variant="ghost" disabled={!editable} onClick={() => onChange(bindings.filter((item) => item.id !== row.id))}><Trash2 className="size-4" aria-hidden />Remove</Button>
              </div>
            </div>
            <div className="grid gap-3 border-t border-border pt-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">Sample next value<Input type="number" min={0} step={1} value={nextValue} onChange={(event) => setNextValue(event.target.value)} /></label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">Occurred at<Input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">Scope key<Input value={scopeKey} placeholder="Optional for tenant scope" onChange={(event) => setScopeKey(event.target.value)} /></label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">Fiscal year<Input value={fiscalYear} placeholder="Required for fiscal reset" onChange={(event) => setFiscalYear(event.target.value)} /></label>
              <div className="flex items-end"><Button className="w-full" variant="outline" disabled={!onPreview || testing || !occurredAt || !Number.isSafeInteger(Number(nextValue))} onClick={() => onPreview?.(row.id, {
                nextValue: Number(nextValue), occurredAt: new Date(occurredAt).toISOString(),
                scopeKey: scopeKey.trim() || null, fiscalYear: fiscalYear.trim() || null,
              })}><FlaskConical className="size-4" aria-hidden />{testing ? "Testing" : "Compile preview"}</Button></div>
            </div>
            {latest && <div className={latest.status === "passed" ? "rounded-md border border-success/30 bg-success/10 p-3" : "rounded-md border border-destructive/30 bg-destructive/10 p-3"}>
              <div className="flex flex-wrap items-center gap-2">
                {latest.status === "passed" ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <TriangleAlert className="size-4 text-destructive" aria-hidden />}
                <span className="text-sm font-medium text-foreground">{latest.status === "passed" ? String(output?.["formattedNumber"] ?? "Preview passed") : "Preview failed"}</span>
                <Badge variant="outline">{latest.policySource ?? "unresolved"} policy</Badge>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{latest.artifactHash.slice(0, 12)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{latest.status === "passed"
                ? `Bucket ${String(output?.["resetBucket"] ?? "-")} · next ${String(output?.["followingValue"] ?? "-")} · ${new Date(latest.executedAt).toLocaleString()}`
                : latest.diagnostics.map((item) => `${item.code}: ${item.message}`).join("; ")}</p>
            </div>}
          </article>
        );})}
      </div>
    </section>
  );
}
