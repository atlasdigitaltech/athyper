"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@athyper/ui";
import type { MetaEntityOperationDraft, MetaEntitySurfaceDraft } from "@athyper/meta-entity-authoring-contracts";
import {
  EditorCheckbox,
  EditorInput,
  EditorNullableSelect,
  EditorSelect,
  PanelHeader,
} from "./editor-controls";

export function OperationsPanel({ operations, surfaces, editable, onChange }: {
  operations: readonly MetaEntityOperationDraft[];
  surfaces: readonly MetaEntitySurfaceDraft[];
  editable: boolean;
  onChange: (operations: readonly MetaEntityOperationDraft[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(operations[0]?.id ?? null);
  useEffect(() => {
    if (!operations.some((item) => item.id === selectedId)) setSelectedId(operations[0]?.id ?? null);
  }, [operations, selectedId]);

  const selected = operations.find((item) => item.id === selectedId) ?? null;
  const replace = (operation: MetaEntityOperationDraft) => {
    onChange(operations.map((item) => item.id === operation.id ? operation : item));
  };
  const add = () => {
    const operation: MetaEntityOperationDraft = {
      id: crypto.randomUUID(),
      operationKey: `execute_${operations.length + 1}`,
      operationKind: "execute",
      label: "New operation",
      description: null,
      handlerKey: "entity.operation.handler",
      permissionCode: "metadata.entity.author",
      executionMode: "synchronous",
      idempotencyMode: "required",
      inputSurfaceKey: null,
      confirmationSurfaceKey: null,
      resultSurfaceKey: null,
      requiresMfa: false,
      auditEventCode: "metadata.entity.operation.executed",
      status: "active",
    };
    onChange([...operations, operation]);
    setSelectedId(operation.id);
  };
  const surfaceKeys = surfaces.map((surface) => surface.surfaceKey);

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <section className="space-y-4 xl:col-span-2">
        <PanelHeader
          title="Operations"
          description="Execution references only. Lifecycle transitions are mapped in the Lifecycle section."
          action={<Button size="sm" onClick={add} disabled={!editable}><Plus className="size-4" aria-hidden />Add operation</Button>}
        />
        <div className="space-y-2">
          {operations.map((operation) => (
            <button
              type="button"
              key={operation.id}
              onClick={() => setSelectedId(operation.id)}
              className={operation.id === selectedId
                ? "w-full rounded-lg border border-border bg-accent p-3 text-left text-accent-foreground"
                : "w-full rounded-lg border border-border bg-card p-3 text-left text-card-foreground hover:bg-muted"}
            >
              <span className="font-mono text-sm font-medium">{operation.operationKey}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{operation.operationKind} · {operation.executionMode}</span>
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground xl:col-span-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditorInput label="Operation key" value={selected.operationKey} disabled={!editable} onChange={(operationKey) => replace({ ...selected, operationKey })} />
            <EditorInput label="Label" value={selected.label} disabled={!editable} onChange={(label) => replace({ ...selected, label })} />
            <EditorSelect label="Kind" value={selected.operationKind} options={["create", "read", "update", "delete", "execute", "transition", "import", "export"]} disabled={!editable} onChange={(operationKind) => replace({ ...selected, operationKind })} />
            <EditorSelect label="Execution" value={selected.executionMode} options={["synchronous", "asynchronous"]} disabled={!editable} onChange={(executionMode) => replace({ ...selected, executionMode })} />
            <EditorInput label="Handler key" value={selected.handlerKey ?? ""} disabled={!editable} onChange={(handlerKey) => replace({ ...selected, handlerKey: handlerKey || null })} />
            <EditorInput label="Permission code" value={selected.permissionCode} disabled={!editable} onChange={(permissionCode) => replace({ ...selected, permissionCode })} />
            <EditorNullableSelect label="Input surface" value={selected.inputSurfaceKey} options={surfaceKeys} disabled={!editable} onChange={(inputSurfaceKey) => replace({ ...selected, inputSurfaceKey })} />
            <EditorNullableSelect label="Result surface" value={selected.resultSurfaceKey} options={surfaceKeys} disabled={!editable} onChange={(resultSurfaceKey) => replace({ ...selected, resultSurfaceKey })} />
            <EditorInput label="Audit event code" value={selected.auditEventCode} disabled={!editable} onChange={(auditEventCode) => replace({ ...selected, auditEventCode })} />
          </div>
          <EditorCheckbox label="Requires MFA step-up" checked={selected.requiresMfa} disabled={!editable} onChange={(requiresMfa) => replace({ ...selected, requiresMfa })} />
        </section>
      )}
    </div>
  );
}
