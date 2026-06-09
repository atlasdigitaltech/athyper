"use client";

import { useEffect, useMemo, useState } from "react";
import { StatePanel } from "@athyper/surface-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { ColumnDef } from "@athyper/ui";
import type { EntityOperation } from "./types";
import {
  OPERATION_ACTION_GROUPS,
  OPERATION_HANDLER_TYPES,
  OPERATION_INTENTS,
  OPERATION_PLACEMENTS,
  OPERATION_SOURCES,
  OPERATION_SURFACES,
  emptyToNull,
  numberOrUndefined,
} from "./metadataContract";

interface OperationForm {
  permission_code: string;
  surface: string;
  placement: string;
  handler_type: string;
  handler_target: string;
  sort_order: string;
  label_override: string;
  icon_override: string;
  tcode_alias: string;
  is_record_required: boolean;
}

function formFromOperation(op?: EntityOperation): OperationForm {
  return {
    permission_code: op?.permission_code ?? "",
    surface: op?.surface ?? "BOTH",
    placement: op?.placement ?? "TOOLBAR",
    handler_type: op?.handler_type ?? "API",
    handler_target: op?.handler_target ?? "",
    sort_order: String(op?.sort_order ?? 0),
    label_override: op?.label_override ?? "",
    icon_override: op?.icon_override ?? "",
    tcode_alias: op?.tcode_alias ?? "",
    is_record_required: op?.is_record_required ?? false,
  };
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
  return body?.message ?? body?.error ?? `${res.status}`;
}

function validateOperationForm(form: OperationForm): string | null {
  if (!form.permission_code.trim()) return "Permission code is required.";
  if (!(OPERATION_SURFACES as readonly string[]).includes(form.surface)) return "Invalid surface.";
  if (!(OPERATION_PLACEMENTS as readonly string[]).includes(form.placement)) return "Invalid placement.";
  if (!(OPERATION_HANDLER_TYPES as readonly string[]).includes(form.handler_type)) return "Invalid handler type.";
  if (form.surface === "HIDDEN" && form.placement !== "COMMAND") return "Hidden operations must use COMMAND placement.";
  if (form.handler_type === "NAVIGATE" && !form.handler_target.trim()) return "Navigate operations require a handler target.";
  return null;
}

function operationBody(form: OperationForm, entityName: string, includePermission: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    entity_name: entityName,
    surface: form.surface,
    placement: form.placement,
    handler_type: form.handler_type,
    handler_target: emptyToNull(form.handler_target),
    is_record_required: form.is_record_required,
    sort_order: numberOrUndefined(form.sort_order) ?? 0,
    label_override: emptyToNull(form.label_override),
    icon_override: emptyToNull(form.icon_override),
    tcode_alias: emptyToNull(form.tcode_alias),
  };
  if (includePermission) body["permission_code"] = form.permission_code.trim();
  return body;
}

function DerivedOperationContract({ operation }: { operation: EntityOperation | null }) {
  if (!operation) {
    return (
      <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Derived runtime fields are resolved after the operation is persisted and reloaded.
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">group {operation.action_group ?? "general"}</Badge>
        <Badge variant={operation.intent === "danger" ? "destructive" : "outline"}>intent {operation.intent ?? "neutral"}</Badge>
        <Badge variant="outline">source {operation.source ?? "entity_operation"}</Badge>
        {operation.permission_decision && <Badge variant="outline">decision {operation.permission_decision}</Badge>}
        {operation.requires_confirmation && <Badge variant="secondary">confirmation</Badge>}
        {operation.requires_reason && <Badge variant="secondary">reason</Badge>}
      </div>
      {operation.disabled_reason && <p className="text-xs text-muted-foreground">Disabled reason: {operation.disabled_reason}</p>}
      {operation.lifecycle_transitions && operation.lifecycle_transitions.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Lifecycle transitions</Label>
          <div className="grid gap-2">
            {operation.lifecycle_transitions.map((transition, index) => (
              <div key={`${transition.transition_id ?? index}`} className="rounded border px-2 py-1 text-xs">
                <span className="font-mono">{transition.from_state}</span>
                <span className="px-2 text-muted-foreground">to</span>
                <span className="font-mono">{transition.to_state}</span>
                {(transition.requires_confirmation || transition.requires_reason) && (
                  <span className="ml-2 text-muted-foreground">
                    {transition.requires_confirmation ? "confirmation " : ""}
                    {transition.requires_reason ? "reason" : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OperationDialog({
  entityName,
  operation,
  onSaved,
  onClose,
}: {
  entityName: string;
  operation: EntityOperation | null;
  onSaved: (operation: EntityOperation) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<OperationForm>(() => formFromOperation(operation ?? undefined));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = Boolean(operation);

  async function submit() {
    const validation = validateOperationForm(form);
    if (validation) {
      setErr(validation);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const url = isEdit
        ? `/api/relay/metadata/admin/entity-operations/${operation!.id}`
        : "/api/relay/metadata/admin/entity-operations";
      const res = await csrfFetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operationBody(form, entityName, !isEdit)),
      });
      if (!res.ok) throw new Error(await readError(res));
      onSaved(await res.json() as EntityOperation);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{isEdit ? "Edit operation" : "Add operation"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Permission code</Label>
              <Input
                className="h-8 font-mono text-sm"
                disabled={isEdit}
                placeholder="entity.action"
                value={form.permission_code}
                onChange={(event) => setForm((current) => ({ ...current, permission_code: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Surface</Label>
              <Select value={form.surface} onValueChange={(value) => setForm((current) => ({ ...current, surface: value }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATION_SURFACES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Placement</Label>
              <Select value={form.placement} onValueChange={(value) => setForm((current) => ({ ...current, placement: value }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATION_PLACEMENTS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Handler type</Label>
              <Select value={form.handler_type} onValueChange={(value) => setForm((current) => ({ ...current, handler_type: value }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATION_HANDLER_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Handler target</Label>
              <Input className="h-8 text-sm" value={form.handler_target} onChange={(event) => setForm((current) => ({ ...current, handler_target: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sort order</Label>
              <Input className="h-8 text-sm" type="number" value={form.sort_order} onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch id="record-required" checked={form.is_record_required} onCheckedChange={(value) => setForm((current) => ({ ...current, is_record_required: value }))} />
              <Label htmlFor="record-required" className="text-sm">Record required</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label override</Label>
              <Input className="h-8 text-sm" value={form.label_override} onChange={(event) => setForm((current) => ({ ...current, label_override: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Icon override</Label>
              <Input className="h-8 text-sm" value={form.icon_override} onChange={(event) => setForm((current) => ({ ...current, icon_override: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">T-code alias</Label>
              <Input className="h-8 text-sm" value={form.tcode_alias} onChange={(event) => setForm((current) => ({ ...current, tcode_alias: event.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Derived runtime contract</Label>
            <DerivedOperationContract operation={operation} />
            <p className="text-xs text-muted-foreground">
              {OPERATION_ACTION_GROUPS.join(", ")} groups, {OPERATION_INTENTS.join(", ")} intents, and {OPERATION_SOURCES.join(", ")} sources are derived from permission metadata and lifecycle bindings.
            </p>
          </div>

          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Saving..." : isEdit ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OperationsTab({ entityName }: { entityName: string }) {
  const [ops, setOps] = useState<EntityOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EntityOperation | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/relay/metadata/admin/entity-operations?entity=${encodeURIComponent(entityName)}`);
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const data = await res.json() as { items: EntityOperation[] };
      setOps(data.items);
    } catch {
      setError("Network error: could not reach the API.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [entityName]);

  async function toggleEnabled(op: EntityOperation) {
    setError(null);
    const res = await csrfFetch(`/api/relay/metadata/admin/entity-operations/${op.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !op.is_enabled }),
    });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    const updated = await res.json() as EntityOperation;
    setOps((current) => current.map((item) => item.id === op.id ? updated : item));
  }

  async function deleteOp(id: string) {
    setError(null);
    const res = await csrfFetch(`/api/relay/metadata/admin/entity-operations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    setOps((current) => current.filter((item) => item.id !== id));
    setDeleting(null);
  }

  const contractIssues = useMemo(() => ops.flatMap((op) => {
    const issues: string[] = [];
    if (op.surface === "HIDDEN" && op.placement !== "COMMAND") issues.push(`${op.permission_code}: hidden operation must use COMMAND placement.`);
    if (op.handler_type === "NAVIGATE" && !op.handler_target) issues.push(`${op.permission_code}: navigate handler needs target.`);
    if (op.intent === "danger" && !op.requires_confirmation) issues.push(`${op.permission_code}: dangerous action should require confirmation.`);
    return issues;
  }), [ops]);

  const columns: ColumnDef<EntityOperation>[] = [
    {
      id: "permission_code",
      header: "Permission",
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-xs">{row.original.permission_code}</div>
          {row.original.permission_label && <div className="text-xs text-muted-foreground">{row.original.permission_label}</div>}
        </div>
      ),
    },
    {
      id: "surface",
      header: "Surface",
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.original.surface}</Badge>,
    },
    {
      id: "placement",
      header: "Placement",
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.original.placement}</Badge>,
    },
    {
      id: "handler",
      header: "Handler",
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.handler_type}{row.original.handler_target ? ` -> ${row.original.handler_target}` : ""}</span>,
    },
    {
      id: "runtime",
      header: "Runtime",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-xs">{row.original.action_group ?? "general"}</Badge>
          <Badge variant={row.original.intent === "danger" ? "destructive" : "outline"} className="text-xs">{row.original.intent ?? "neutral"}</Badge>
          {row.original.requires_confirmation && <Badge variant="secondary" className="text-xs">confirm</Badge>}
          {row.original.requires_reason && <Badge variant="secondary" className="text-xs">reason</Badge>}
        </div>
      ),
    },
    {
      id: "enabled",
      header: "Enabled",
      cell: ({ row }) => <Switch checked={row.original.is_enabled} onCheckedChange={() => void toggleEnabled(row.original)} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(row.original)}>Edit</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setDeleting(row.original.id)}>Delete</Button>
        </div>
      ),
    },
  ];

  function upsert(op: EntityOperation) {
    setOps((current) => current.some((item) => item.id === op.id)
      ? current.map((item) => item.id === op.id ? op : item)
      : [...current, op]);
    setCreating(false);
    setEditing(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {ops.length} operations
          {contractIssues.length > 0 && <span className="ml-2 text-destructive">{contractIssues.length} contract issues</span>}
        </div>
        <Button size="sm" className="h-8 text-sm" onClick={() => setCreating(true)}>Add operation</Button>
      </div>

      {contractIssues.length > 0 && (
        <div className="rounded border border-destructive/40 px-3 py-2 text-xs text-destructive">
          {contractIssues.slice(0, 5).map((issue) => <div key={issue}>{issue}</div>)}
        </div>
      )}

      {loading ? (
        <StatePanel title="Loading..." message="Fetching operations." />
      ) : error ? (
        <StatePanel title="Error" message={error} />
      ) : ops.length === 0 ? (
        <StatePanel title="No operations" message="No operations are defined for this entity." />
      ) : (
        <DataTable columns={columns} data={ops} />
      )}

      {(creating || editing) && (
        <OperationDialog
          entityName={entityName}
          operation={editing}
          onSaved={upsert}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {deleting && (
        <AlertDialog open onOpenChange={(open) => !open && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete operation?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone. The operation will be removed immediately.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteOp(deleting)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
