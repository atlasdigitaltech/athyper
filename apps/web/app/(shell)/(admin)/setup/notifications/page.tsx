"use client";

/**
 * Notification Admin — /setup/notifications
 *
 * Comprehensive admin surface for the notification pipeline:
 *   • Routing Rules  — event → channel → recipient mapping
 *   • Templates      — versioned message templates per channel/locale
 *   • Providers      — channel adapter health dashboard
 *   • Deliveries     — recent message delivery log with retry
 *
 * API surface (via /api/notifications/admin/* BFF → runtime /notifications/*):
 *   GET/POST   /api/notifications/admin/routing-rules
 *   PATCH/DEL  /api/notifications/admin/routing-rules/:id
 *   GET/POST   /api/notifications/admin/templates
 *   PATCH      /api/notifications/admin/templates/:id
 *   POST       /api/notifications/admin/templates/:id/activate
 *   GET        /api/notifications/admin/providers
 *   GET        /api/notifications/admin/messages
 *   GET        /api/notifications/admin/messages/:id/deliveries
 *   POST       /api/notifications/admin/deliveries/:id/retry
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Plus, Trash2, Pencil, CheckCircle2, AlertCircle, Clock,
  RefreshCw, Play, Zap, Mail, MessageSquare, Smartphone, Webhook,
  Activity, ToggleLeft, ToggleRight, Eye, RotateCcw,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { FilterPillBar } from "@athyper/ui/composites";
import {
  Button, Badge, Skeleton, Input, Label, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Switch, Card, CardContent,
} from "@athyper/ui/primitives";
import { useToast } from "@/components/ui/use-toast";
import {
  StatusPill, EmptyState, SearchInput, ConfirmDialog, CodeBadge,
  fmtDateTime, fmtDate,
} from "../_components/admin-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoutingRule {
  id: string;
  rule_name: string;
  event_code: string;
  channel: string;
  template_key: string | null;
  is_enabled: boolean;
  priority: number;
  dedup_window_ms: number | null;
  recipient_rules: unknown;
  conditions: unknown;
  created_at: string;
}

interface NotifTemplate {
  id: string;
  template_key: string;
  channel: string;
  locale_code: string;
  subject_template: string | null;
  body_template: string;
  is_active: boolean;
  version: number;
  created_at: string;
}

interface Provider {
  id: string;
  code: string;
  channel: string;
  adapter_key: string;
  health: "healthy" | "degraded" | "down";
  priority: number;
  is_enabled: boolean;
  last_health_check: string | null;
  failure_count: number;
}

interface DeliveryMessage {
  id: string;
  event_code: string;
  channel: string;
  recipient_id: string | null;
  status: string;
  attempt_count: number;
  created_at: string;
  last_attempt_at: string | null;
  error_detail: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNELS = ["in_app", "email", "sms", "push", "webhook"];

const CHANNEL_ICON: Record<string, React.ElementType> = {
  in_app:  Bell,
  email:   Mail,
  sms:     MessageSquare,
  push:    Smartphone,
  webhook: Webhook,
};

const CHANNEL_LABEL: Record<string, string> = {
  in_app: "In-App", email: "Email", sms: "SMS", push: "Push", webhook: "Webhook",
};

const HEALTH_COLORS: Record<string, string> = {
  healthy:  "text-success",
  degraded: "text-warning",
  down:     "text-destructive",
};

const HEALTH_DOT: Record<string, string> = {
  healthy:  "bg-success",
  degraded: "bg-warning",
  down:     "bg-destructive",
};

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `/api/notifications/admin/${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function adminPost<T>(path: string, body: unknown) {
  return adminFetch<T>(path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminPatch<T>(path: string, body: unknown) {
  return adminFetch<T>(path, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminDel(path: string) {
  return adminFetch(path, { method: "DELETE" });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTING RULES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function RuleDialog({
  open, onClose, onSaved, edit,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; edit?: RoutingRule;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!edit;

  const [ruleName, setRuleName]     = useState(edit?.rule_name ?? "");
  const [eventCode, setEventCode]   = useState(edit?.event_code ?? "");
  const [channel, setChannel]       = useState(edit?.channel ?? "in_app");
  const [templateKey, setTplKey]    = useState(edit?.template_key ?? "");
  const [priority, setPriority]     = useState(String(edit?.priority ?? 100));
  const [dedupMs, setDedup]         = useState(String(edit?.dedup_window_ms ?? ""));
  const [isEnabled, setEnabled]     = useState(edit?.is_enabled ?? true);
  const [recipientRules, setRecip]  = useState(
    edit?.recipient_rules ? JSON.stringify(edit.recipient_rules, null, 2) : '{"type": "actor"}'
  );
  const [conditions, setConds]      = useState(
    edit?.conditions ? JSON.stringify(edit.conditions, null, 2) : ""
  );

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        rule_name: ruleName,
        event_code: eventCode,
        channel,
        template_key: templateKey || null,
        priority: Number(priority),
        dedup_window_ms: dedupMs ? Number(dedupMs) : null,
        is_enabled: isEnabled,
        recipient_rules: JSON.parse(recipientRules),
        conditions: conditions.trim() ? JSON.parse(conditions) : null,
      };
      if (isEdit) return adminPatch(`routing-rules/${edit!.id}`, body);
      return adminPost("routing-rules", body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notif-routing-rules"] });
      toast({ title: isEdit ? "Rule updated" : "Rule created" });
      onSaved(); onClose();
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            {isEdit ? "Edit routing rule" : "New routing rule"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Rule name</Label>
              <Input placeholder="e.g. Approval Requested" value={ruleName}
                onChange={(e) => setRuleName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Event code</Label>
              <Input placeholder="e.g. wfl.approval_requested" value={eventCode}
                onChange={(e) => setEventCode(e.target.value.toLowerCase())} className="font-mono text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c} className="text-sm">
                      {CHANNEL_LABEL[c] ?? c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Template key</Label>
              <Input placeholder="e.g. wfl.approval_requested" value={templateKey}
                onChange={(e) => setTplKey(e.target.value)} className="font-mono text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Priority (lower = first)</Label>
              <Input type="number" min={1} className="h-8 text-xs" value={priority}
                onChange={(e) => setPriority(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dedup window (ms)</Label>
              <Input type="number" min={0} className="h-8 text-xs font-mono" value={dedupMs}
                placeholder="e.g. 60000"
                onChange={(e) => setDedup(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Recipient rules (JSON)</Label>
            <Textarea className="h-20 resize-none font-mono text-xs" value={recipientRules}
              onChange={(e) => setRecip(e.target.value)}
              placeholder='{"type": "actor"} or {"type": "role", "value": "finance_approver"}' />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Conditions (JSONLogic, leave blank = always fire)</Label>
            <Textarea className="h-16 resize-none font-mono text-xs" value={conditions}
              onChange={(e) => setConds(e.target.value)}
              placeholder='{">=": [{"var": "amount"}, 1000]}' />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isEnabled} onCheckedChange={setEnabled} />
            <Label className="text-sm">Enabled</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!ruleName || !eventCode || save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoutingRulesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreate] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ items: RoutingRule[] }>({
    queryKey: ["notif-routing-rules"],
    queryFn: () => adminFetch("routing-rules"),
    staleTime: 30_000,
  });

  const rules = (data?.items ?? []).filter(
    (r) => !search ||
      r.rule_name.toLowerCase().includes(search) ||
      r.event_code.toLowerCase().includes(search) ||
      r.channel.includes(search)
  );

  const toggleEnabled = useMutation({
    mutationFn: (rule: RoutingRule) => adminPatch(`routing-rules/${rule.id}`, { is_enabled: !rule.is_enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notif-routing-rules"] }),
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminDel(`routing-rules/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notif-routing-rules"] });
      toast({ title: "Rule deleted" });
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const [editRule, setEditRule]   = useState<RoutingRule | undefined>();
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const deleteRule = rules.find((r) => r.id === deleteId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search rules, events, channels…"
          className="flex-1 max-w-sm" />
        <Button size="sm" className="gap-1.5 ml-auto" onClick={() => setCreate(true)}>
          <Plus className="size-4" /> New rule
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : rules.length === 0 ? (
        <EmptyState icon={<Zap />} title="No routing rules"
          description="Create routing rules to map events to notification channels."
          action={<Button size="sm" className="gap-1" onClick={() => setCreate(true)}><Plus className="size-3" /> New rule</Button>} />
      ) : (
        <div className="rounded-lg border bg-card divide-y divide-border/50">
          {rules.sort((a, b) => a.priority - b.priority).map((rule) => {
            const ChannelIcon = CHANNEL_ICON[rule.channel] ?? Bell;
            return (
              <div key={rule.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 group">
                <ChannelIcon className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{rule.rule_name}</span>
                    <CodeBadge>{rule.event_code}</CodeBadge>
                    <Badge variant="outline" className="text-[10px]">{CHANNEL_LABEL[rule.channel] ?? rule.channel}</Badge>
                    {rule.template_key && <CodeBadge>{rule.template_key}</CodeBadge>}
                    {!rule.is_enabled && <StatusPill value="disabled" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Priority {rule.priority}
                    {rule.dedup_window_ms && ` · Dedup ${rule.dedup_window_ms}ms`}
                    {` · ${fmtDate(rule.created_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="size-7"
                    onClick={() => toggleEnabled.mutate(rule)}>
                    {rule.is_enabled
                      ? <ToggleRight className="size-4 text-success" />
                      : <ToggleLeft className="size-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditRule(rule)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-destructive"
                    onClick={() => setDeleteId(rule.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RuleDialog open={createOpen} onClose={() => setCreate(false)} onSaved={() => void refetch()} />
      {editRule && (
        <RuleDialog open={!!editRule} onClose={() => setEditRule(undefined)} onSaved={() => void refetch()} edit={editRule} />
      )}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete routing rule?"
        description={deleteRule ? `Delete '${deleteRule.rule_name}'?` : "Delete this rule?"}
        confirmLabel="Delete"
        onConfirm={() => { if (deleteId) del.mutate(deleteId); setDeleteId(null); }}
        loading={del.isPending}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function TemplateDialog({
  open, onClose, onSaved, edit,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; edit?: NotifTemplate;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!edit;

  const [templateKey, setKey]  = useState(edit?.template_key ?? "");
  const [channel, setChannel]  = useState(edit?.channel ?? "in_app");
  const [locale, setLocale]    = useState(edit?.locale_code ?? "en");
  const [subject, setSubject]  = useState(edit?.subject_template ?? "");
  const [body, setBody]        = useState(edit?.body_template ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const b = { template_key: templateKey, channel, locale_code: locale,
        subject_template: subject || null, body_template: body };
      if (isEdit) return adminPatch(`templates/${edit!.id}`, b);
      return adminPost("templates", b);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notif-templates"] });
      toast({ title: isEdit ? "Template updated" : "Template created" });
      onSaved(); onClose();
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4" />
            {isEdit ? "Edit template" : "New notification template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label>Template key</Label>
              <Input placeholder="e.g. wfl.approval_requested" className="font-mono text-sm"
                value={templateKey} disabled={isEdit}
                onChange={(e) => setKey(e.target.value.toLowerCase())} />
            </div>
            <div className="space-y-1">
              <Label>Locale</Label>
              <Input placeholder="en" className="text-sm" value={locale}
                onChange={(e) => setLocale(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={setChannel} disabled={isEdit}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c} value={c} className="text-sm">{CHANNEL_LABEL[c] ?? c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(channel === "email") && (
            <div className="space-y-1">
              <Label>Subject template</Label>
              <Input placeholder="e.g. Action required: {{entity_name}}" value={subject}
                onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}

          <div className="space-y-1">
            <Label>Body template</Label>
            <Textarea className="h-32 resize-none font-mono text-xs" value={body}
              placeholder="Your request {{request_id}} requires action. {{action_url}}"
              onChange={(e) => setBody(e.target.value)} />
            <p className="text-[10px] text-muted-foreground">
              Use {"{{variable}}"} syntax for interpolation. Variables come from the event payload.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!templateKey || !body || save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch]     = useState("");
  const [filterCh, setFilterCh] = useState("");
  const [createOpen, setCreate] = useState(false);
  const [editTpl, setEditTpl]   = useState<NotifTemplate | undefined>();

  const { data, isLoading, refetch } = useQuery<{ items: NotifTemplate[] }>({
    queryKey: ["notif-templates"],
    queryFn: () => adminFetch("templates"),
    staleTime: 30_000,
  });

  const activate = useMutation({
    mutationFn: (id: string) => adminPost(`templates/${id}/activate`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notif-templates"] });
      toast({ title: "Template activated" });
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const templates = (data?.items ?? []).filter((t) => {
    const matchSearch = !search || t.template_key.includes(search.toLowerCase());
    const matchCh = !filterCh || t.channel === filterCh;
    return matchSearch && matchCh;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search template key…"
          className="flex-1 max-w-sm" />
        <div className="flex items-center gap-1">
          <Button variant={!filterCh ? "primary" : "ghost"} size="sm" className="h-8 text-xs"
            onClick={() => setFilterCh("")}>All</Button>
          {CHANNELS.map((c) => (
            <Button key={c} variant={filterCh === c ? "primary" : "ghost"} size="sm" className="h-8 text-xs"
              onClick={() => setFilterCh(c === filterCh ? "" : c)}>
              {CHANNEL_LABEL[c] ?? c}
            </Button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5 ml-auto" onClick={() => setCreate(true)}>
          <Plus className="size-4" /> New template
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : templates.length === 0 ? (
        <EmptyState icon={<Mail />} title="No templates" description="Create templates to format notification messages."
          action={<Button size="sm" className="gap-1" onClick={() => setCreate(true)}><Plus className="size-3" /> New template</Button>} />
      ) : (
        <div className="rounded-lg border bg-card divide-y divide-border/50">
          {templates.map((t) => {
            const ChannelIcon = CHANNEL_ICON[t.channel] ?? Bell;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 group">
                <ChannelIcon className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CodeBadge>{t.template_key}</CodeBadge>
                    <Badge variant="outline" className="text-[10px]">{t.locale_code}</Badge>
                    {t.is_active
                      ? <StatusPill value="active" label="active" />
                      : <StatusPill value="draft" label="draft" />}
                    <span className="text-xs text-muted-foreground">v{t.version}</span>
                  </div>
                  {t.subject_template && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-sm">
                      {t.subject_template}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!t.is_active && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => activate.mutate(t.id)}>
                      <Play className="size-3" /> Activate
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditTpl(t)}>
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TemplateDialog open={createOpen} onClose={() => setCreate(false)} onSaved={() => void refetch()} />
      {editTpl && (
        <TemplateDialog open={!!editTpl} onClose={() => setEditTpl(undefined)} onSaved={() => void refetch()} edit={editTpl} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDERS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ProvidersTab() {
  const { data, isLoading, refetch } = useQuery<{ items: Provider[] }>({
    queryKey: ["notif-providers"],
    queryFn: () => adminFetch("providers"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const providers = data?.items ?? [];

  const healthCounts = providers.reduce<Record<string, number>>((acc, p) => {
    acc[p.health] = (acc[p.health] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {(["healthy", "degraded", "down"] as const).map((h) => (
          <Card key={h}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`size-8 rounded-full flex items-center justify-center ${
                h === "healthy"  ? "bg-success/20" :
                h === "degraded" ? "bg-warning/20" :
                                   "bg-destructive/20"
              }`}>
                {h === "healthy"  ? <CheckCircle2 className="size-4 text-success" /> :
                 h === "degraded" ? <AlertCircle className="size-4 text-warning" /> :
                                    <AlertCircle className="size-4 text-destructive" />}
              </div>
              <div>
                <p className="text-xl font-bold">{healthCounts[h] ?? 0}</p>
                <p className="text-xs text-muted-foreground capitalize">{h}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{providers.length} registered providers</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refetch()}>
          <RefreshCw className="size-3.5" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : providers.length === 0 ? (
        <EmptyState icon={<Activity />} title="No providers" description="No notification channel providers registered." />
      ) : (
        <div className="rounded-lg border bg-card divide-y divide-border/50">
          {providers.sort((a, b) => a.priority - b.priority).map((p) => {
            const ChannelIcon = CHANNEL_ICON[p.channel] ?? Bell;
            return (
              <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                <ChannelIcon className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.code}</span>
                    <CodeBadge>{p.adapter_key}</CodeBadge>
                    <Badge variant="outline" className="text-[10px]">{CHANNEL_LABEL[p.channel] ?? p.channel}</Badge>
                    {!p.is_enabled && <StatusPill value="disabled" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Priority {p.priority}
                    {p.failure_count > 0 && ` · ${p.failure_count} failure${p.failure_count !== 1 ? "s" : ""}`}
                    {p.last_health_check && ` · Checked ${fmtDateTime(p.last_health_check)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className={`size-2 rounded-full ${HEALTH_DOT[p.health] ?? "bg-muted"}`} />
                  <span className={`text-xs font-medium ${HEALTH_COLORS[p.health] ?? ""}`}>
                    {p.health}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELIVERIES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function DeliveriesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("");
  const [expandedId, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ items: DeliveryMessage[] }>({
    queryKey: ["notif-messages", filterStatus],
    queryFn: () => {
      const q = filterStatus ? `?status=${filterStatus}` : "";
      return adminFetch(`messages${q}`);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const messages = data?.items ?? [];

  const retry = useMutation({
    mutationFn: (deliveryId: string) => adminPost(`deliveries/${deliveryId}/retry`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notif-messages"] });
      toast({ title: "Retry queued" });
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const STATUS_OPTIONS = ["", "pending", "sent", "failed", "suppressed"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FilterPillBar
          items={["pending", "sent", "failed", "suppressed"].map((s) => ({ value: s, label: s }))}
          value={filterStatus}
          onChange={setFilterStatus}
          allItem={{ label: "All" }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : messages.length === 0 ? (
        <EmptyState icon={<Bell />} title="No messages" description="No notification messages matching the current filter." />
      ) : (
        <div className="rounded-lg border bg-card divide-y divide-border/50">
          {messages.map((m) => {
            const ChannelIcon = CHANNEL_ICON[m.channel] ?? Bell;
            const isFailed = m.status === "failed";
            const isExpanded = expandedId === m.id;
            return (
              <div key={m.id} className="px-4 py-3 hover:bg-muted/20">
                <div className="flex items-center gap-3">
                  <ChannelIcon className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CodeBadge>{m.event_code}</CodeBadge>
                      <Badge variant="outline" className="text-[10px]">{CHANNEL_LABEL[m.channel] ?? m.channel}</Badge>
                      <StatusPill
                        value={m.status === "sent" ? "active" : m.status === "failed" ? "down" : "pending"}
                        label={m.status}
                      />
                      {m.attempt_count > 1 && (
                        <span className="text-[10px] text-muted-foreground">{m.attempt_count} attempts</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {fmtDateTime(m.created_at)}
                      {m.last_attempt_at && ` · Last attempt ${fmtDateTime(m.last_attempt_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.error_detail && (
                      <Button variant="ghost" size="icon" className="size-7"
                        onClick={() => setExpanded(isExpanded ? null : m.id)}>
                        {isExpanded ? <Eye className="size-3.5 text-primary" /> : <Eye className="size-3.5" />}
                      </Button>
                    )}
                    {isFailed && (
                      <Button variant="ghost" size="icon" className="size-7"
                        onClick={() => retry.mutate(m.id)} title="Retry delivery">
                        <RotateCcw className="size-3.5 text-warning" />
                      </Button>
                    )}
                  </div>
                </div>
                {isExpanded && m.error_detail && (
                  <div className="mt-2 rounded bg-destructive/5 border border-destructive/20 px-3 py-2">
                    <p className="text-xs font-mono text-destructive break-all">{m.error_detail}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function NotificationsAdminPage() {
  return (
    <PageFrame
      title="Notification Admin"
      description="Configure routing rules, message templates, channel providers, and monitor delivery health."
    >
      <Tabs defaultValue="routing-rules">
        <TabsList className="mb-4">
          <TabsTrigger value="routing-rules" className="gap-1.5 text-xs">
            <Zap className="size-3.5" /> Routing rules
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 text-xs">
            <Mail className="size-3.5" /> Templates
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-1.5 text-xs">
            <Activity className="size-3.5" /> Providers
          </TabsTrigger>
          <TabsTrigger value="deliveries" className="gap-1.5 text-xs">
            <Bell className="size-3.5" /> Deliveries
          </TabsTrigger>
        </TabsList>

        <TabsContent value="routing-rules" className="mt-4">
          <RoutingRulesTab />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="providers" className="mt-4">
          <ProvidersTab />
        </TabsContent>

        <TabsContent value="deliveries" className="mt-4">
          <DeliveriesTab />
        </TabsContent>
      </Tabs>
    </PageFrame>
  );
}
