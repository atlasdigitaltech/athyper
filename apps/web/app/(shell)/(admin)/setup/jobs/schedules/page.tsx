"use client";

/**
 * Cron Schedule Management — /setup/jobs/schedules
 *
 * Full CRUD for control.cron_schedule. Code-based system schedules
 * are shown as read-only (requires Phase 1.2.2 scheduler integration
 * to enumerate them — this UI handles DB-based schedules only for now).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, ToggleLeft, ToggleRight, Pencil, Trash2, Lock } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";
import { JobsSubNav } from "../_components/jobs-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CronSchedule {
  id:                string;
  tenant_id:         string | null;
  code:              string;
  name:              string;
  description:       string | null;
  handler_type:      string;
  cron_expression:   string;
  timezone:          string;
  target_queue:      string;
  payload_template:  Record<string, unknown>;
  priority:          number;
  max_retries:       number;
  concurrency_limit: number | null;
  effective_from:    string | null;
  effective_until:   string | null;
  is_enabled:        boolean;
  lock_key:          string | null;
  last_run_at:       string | null;
  next_run_at:       string | null;
  created_at:        string;
  updated_at:        string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUEUE_OPTIONS = [
  "jobs:lifecycle-timers",
  "jobs:notifications",
  "jobs:domain-outbox",
  "jobs:sla-check",
];

const TZ_OPTIONS = [
  "UTC", "Asia/Kuala_Lumpur", "Asia/Kolkata", "Asia/Singapore",
  "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin",
];

// ── Schedule form (shared by create + edit) ───────────────────────────────────

interface ScheduleFormState {
  code:            string;
  name:            string;
  description:     string;
  handler_type:    string;
  cron_expression: string;
  timezone:        string;
  target_queue:    string;
  payload_template: string; // raw JSON string in UI
  priority:        string;
  max_retries:     string;
  lock_key:        string;
}

function emptyForm(): ScheduleFormState {
  return {
    code: "", name: "", description: "", handler_type: "",
    cron_expression: "0 * * * *", timezone: "UTC",
    target_queue: "jobs:lifecycle-timers",
    payload_template: "{}",
    priority: "0", max_retries: "3", lock_key: "",
  };
}

function fromSchedule(s: CronSchedule): ScheduleFormState {
  return {
    code:             s.code,
    name:             s.name,
    description:      s.description ?? "",
    handler_type:     s.handler_type,
    cron_expression:  s.cron_expression,
    timezone:         s.timezone,
    target_queue:     s.target_queue,
    payload_template: JSON.stringify(s.payload_template ?? {}, null, 2),
    priority:         String(s.priority),
    max_retries:      String(s.max_retries),
    lock_key:         s.lock_key ?? "",
  };
}

interface ScheduleFormProps {
  form:      ScheduleFormState;
  onChange:  (f: ScheduleFormState) => void;
  isEdit?:   boolean;
  error?:    string | null;
}

function ScheduleForm({ form, onChange, isEdit, error }: ScheduleFormProps) {
  const set = (field: keyof ScheduleFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...form, [field]: e.target.value });

  return (
    <div className="space-y-3 py-1 max-h-[70vh] overflow-y-auto px-0.5">
      {/* Code + Name */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Code *</Label>
          <Input value={form.code} onChange={set("code")} disabled={isEdit}
            className="font-mono text-xs" placeholder="nightly_sla_check" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Name *</Label>
          <Input value={form.name} onChange={set("name")} className="text-xs" placeholder="Nightly SLA Check" />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Textarea value={form.description} onChange={set("description")} rows={2} className="text-xs" />
      </div>

      {/* Handler + Queue */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Handler Type *</Label>
          <Input value={form.handler_type} onChange={set("handler_type")}
            className="font-mono text-xs" placeholder="check" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Target Queue *</Label>
          <Select value={form.target_queue} onValueChange={(v) => onChange({ ...form, target_queue: v })}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUEUE_OPTIONS.map((q) => <SelectItem key={q} value={q} className="font-mono text-xs">{q}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cron + Timezone */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Cron Expression *</Label>
          <Input value={form.cron_expression} onChange={set("cron_expression")}
            className="font-mono text-xs" placeholder="0 2 * * *" />
          <p className="text-[9px] text-muted-foreground">min hour day month weekday</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Timezone</Label>
          <Select value={form.timezone} onValueChange={(v) => onChange({ ...form, timezone: v })}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TZ_OPTIONS.map((tz) => <SelectItem key={tz} value={tz} className="text-xs">{tz}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Payload template */}
      <div className="space-y-1">
        <Label className="text-xs">Payload Template (JSON)</Label>
        <Textarea
          value={form.payload_template}
          onChange={set("payload_template")}
          rows={3}
          className="font-mono text-xs"
          placeholder="{}"
        />
        <p className="text-[9px] text-muted-foreground">Supports &#123;&#123;tenant_id&#125;&#125; and &#123;&#123;now&#125;&#125; interpolation</p>
      </div>

      {/* Priority + Retries + Lock key */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Priority (-10–10)</Label>
          <Input value={form.priority} onChange={set("priority")} type="number" min={-10} max={10} className="text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max Retries</Label>
          <Input value={form.max_retries} onChange={set("max_retries")} type="number" min={0} className="text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Lock Key</Label>
          <Input value={form.lock_key} onChange={set("lock_key")} className="font-mono text-xs" placeholder="cron:nightly" />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

function CreateScheduleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/jobs/admin/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs-schedules"] });
      onOpenChange(false);
      setForm(emptyForm());
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    let pt: unknown;
    try { pt = JSON.parse(form.payload_template || "{}"); }
    catch { setError("Payload template must be valid JSON"); return; }

    const pri = parseInt(form.priority, 10);
    const ret = parseInt(form.max_retries, 10);
    if (isNaN(pri) || pri < -10 || pri > 10) { setError("Priority must be -10 to 10"); return; }
    if (isNaN(ret) || ret < 0) { setError("Max retries must be ≥ 0"); return; }

    create.mutate({
      code:             form.code.trim(),
      name:             form.name.trim(),
      description:      form.description.trim() || null,
      handler_type:     form.handler_type.trim(),
      cron_expression:  form.cron_expression.trim(),
      timezone:         form.timezone,
      target_queue:     form.target_queue,
      payload_template: pt,
      priority:         pri,
      max_retries:      ret,
      lock_key:         form.lock_key.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Cron Schedule</DialogTitle></DialogHeader>
        <ScheduleForm form={form} onChange={setForm} error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditScheduleDialog({
  schedule, open, onOpenChange,
}: { schedule: CronSchedule; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => fromSchedule(schedule));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/jobs/admin/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs-schedules"] });
      onOpenChange(false);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    let pt: unknown;
    try { pt = JSON.parse(form.payload_template || "{}"); }
    catch { setError("Payload template must be valid JSON"); return; }

    save.mutate({
      name:             form.name.trim(),
      description:      form.description.trim() || null,
      handler_type:     form.handler_type.trim(),
      cron_expression:  form.cron_expression.trim(),
      timezone:         form.timezone,
      target_queue:     form.target_queue,
      payload_template: pt,
      priority:         parseInt(form.priority, 10),
      max_retries:      parseInt(form.max_retries, 10),
      lock_key:         form.lock_key.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Schedule — <code className="font-mono text-sm">{schedule.code}</code></DialogTitle>
        </DialogHeader>
        <ScheduleForm form={form} onChange={setForm} isEdit error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Schedule card ─────────────────────────────────────────────────────────────

function ScheduleCard({ schedule }: { schedule: CronSchedule }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isPlatformGlobal = schedule.tenant_id === null;

  const toggle = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/jobs/admin/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: !schedule.is_enabled }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs-schedules"] }),
  });

  const del = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/jobs/admin/schedules/${schedule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs-schedules"] }),
  });

  return (
    <>
      <RowCard className={!schedule.is_enabled ? "opacity-60" : ""}>
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {isPlatformGlobal && (
                <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Platform-global schedule" />
              )}
              <span className="font-mono text-xs font-medium">{schedule.code}</span>
              <span className="text-xs text-muted-foreground">{schedule.name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Badge variant={schedule.is_enabled ? "success" : "muted"} className="text-[10px]">
                {schedule.is_enabled ? "active" : "disabled"}
              </Badge>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggle.mutate()} title="Toggle">
                {schedule.is_enabled
                  ? <ToggleRight className="h-3.5 w-3.5 text-success" />
                  : <ToggleLeft  className="h-3.5 w-3.5 text-muted-foreground" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <span className="font-mono bg-muted/50 px-1 rounded">{schedule.cron_expression}</span>
            <span>{schedule.timezone}</span>
            <span className="font-mono">{schedule.target_queue.replace("jobs:", "")}</span>
            <span>handler: <code>{schedule.handler_type}</code></span>
          </div>

          <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            {schedule.last_run_at && (
              <span>Last run: {new Date(schedule.last_run_at).toLocaleString()}</span>
            )}
            {schedule.next_run_at && (
              <span>Next: {new Date(schedule.next_run_at).toLocaleString()}</span>
            )}
            {schedule.lock_key && (
              <span className="flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" />lock: <code>{schedule.lock_key}</code>
              </span>
            )}
          </div>

          {schedule.description && (
            <p className="text-[10px] text-muted-foreground">{schedule.description}</p>
          )}
        </div>
      </RowCard>

      {editOpen && (
        <EditScheduleDialog schedule={schedule} open={editOpen} onOpenChange={setEditOpen} />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete schedule?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Delete <code className="font-mono">{schedule.code}</code>? This cannot be undone.
            The scheduler will stop firing this job at the next poll cycle.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { del.mutate(); setDeleteOpen(false); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [showDisabled, setShowDisabled] = useState(false);

  const { data, isLoading } = useQuery<{ items: CronSchedule[] }>({
    queryKey: ["jobs-schedules"],
    queryFn: async () => {
      const res = await fetch("/api/jobs/admin/schedules");
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 30_000,
  });

  const all      = data?.items ?? [];
  const filtered = showDisabled ? all : all.filter((s) => s.is_enabled);
  const global   = filtered.filter((s) => s.tenant_id === null);
  const tenant   = filtered.filter((s) => s.tenant_id !== null);

  return (
    <PageFrame
      title="Cron Schedules"
      description="Runtime-configurable BullMQ scheduled jobs (control.cron_schedule)"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["jobs-schedules"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />New Schedule
          </Button>
        </div>
      }
    >
      <JobsSubNav active="/setup/jobs/schedules" />

      {/* Filter toggle */}
      <div className="mb-4 flex items-center gap-2">
        <Button
          size="sm" variant={showDisabled ? "primary" : "ghost"} className="h-7 text-xs"
          onClick={() => setShowDisabled((v) => !v)}
        >
          Show disabled
        </Button>
        {all.length > 0 && (
          <span className="text-xs text-muted-foreground">{all.length} schedule{all.length !== 1 ? "s" : ""} total</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={<Lock className="h-10 w-10 text-muted-foreground/30" />}
          title="No DB-managed schedules yet."
          description="Code-based schedules from cron-registry.ts are not shown here. Create a DB schedule to override intervals at runtime without redeployment."
          action={
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Create first schedule
            </Button>
          }
          className="py-20"
        />
      ) : (
        <div className="space-y-5">
          {global.length > 0 && (
            <div>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Lock className="h-3 w-3" />Platform-global
              </h3>
              <div className="space-y-2">
                {global.map((s) => <ScheduleCard key={s.id} schedule={s} />)}
              </div>
            </div>
          )}
          {tenant.length > 0 && (
            <div>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Tenant schedules</h3>
              <div className="space-y-2">
                {tenant.map((s) => <ScheduleCard key={s.id} schedule={s} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <CreateScheduleDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageFrame>
  );
}
