"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Bell, BellRing, Check, ChevronDown, ChevronRight,
  RefreshCcw, Save,
} from "lucide-react";
import {
  Badge, Button, Card, CardContent,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator, Skeleton, Switch,
} from "@athyper/ui/primitives";
import { bffFetch } from "@/lib/bff-fetch";
import { usePushSubscription } from "@/hooks/use-push-subscription";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifPreference {
  id:             string;
  event_code:     string;
  channel:        string;
  is_enabled:     boolean | null;
  frequency_code: string | null;
  status?:        string;
}

interface PrefUpsert {
  event_code:     string;
  channel:        string;
  is_enabled:     boolean | null;
  frequency_code: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNELS = ["in_app", "email", "sms", "push", "whatsapp"] as const;

const CHANNEL_LABELS: Record<string, string> = {
  in_app:   "In-App",
  email:    "Email",
  sms:      "SMS",
  push:     "Push",
  whatsapp: "WhatsApp",
};

const DIGEST_FREQUENCIES: { code: string | null; label: string }[] = [
  { code: null,            label: "Immediate" },
  { code: "hourly_digest", label: "Hourly digest" },
  { code: "daily_digest",  label: "Daily digest" },
  { code: "weekly_digest", label: "Weekly digest" },
];

// ── API hooks ─────────────────────────────────────────────────────────────────

function useNotifPreferences() {
  return useQuery<{ data: NotifPreference[] }>({
    queryKey: ["notifications", "preferences"],
    queryFn:  async () => {
      const res = await fetch("/api/notifications/preferences");
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: NotifPreference[] }>;
    },
    staleTime: 30_000,
  });
}

function useSavePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: PrefUpsert[]) =>
      bffFetch("/api/notifications/preferences", {
        method: "PATCH",
        body:   { preferences: prefs },
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] }); },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function eventCodeLabel(code: string): string {
  return code
    .replace(/^[a-z]+\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupByEventCode(prefs: NotifPreference[]): Map<string, NotifPreference[]> {
  const map = new Map<string, NotifPreference[]>();
  for (const p of prefs) {
    const group = map.get(p.event_code) ?? [];
    group.push(p);
    map.set(p.event_code, group);
  }
  return map;
}

// ── EventCodeRow ──────────────────────────────────────────────────────────────

function EventCodeRow({ eventCode, prefs, onToggle, onFrequency, expanded, onExpand }: {
  eventCode:   string;
  prefs:       NotifPreference[];
  onToggle:    (channel: string, enabled: boolean) => void;
  onFrequency: (channel: string, freq: string | null) => void;
  expanded:    boolean;
  onExpand:    () => void;
}) {
  const enabledCount = prefs.filter((p) => p.is_enabled !== false).length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={onExpand} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown  className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="text-sm font-medium text-foreground">{eventCodeLabel(eventCode)}</span>
          <span className="font-mono text-xs text-muted-foreground">{eventCode}</span>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">{enabledCount}/{prefs.length} active</Badge>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {prefs.map((pref) => {
            const isEnabled = pref.is_enabled !== false;
            return (
              <div
                key={pref.channel}
                className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground w-20 shrink-0">
                    {CHANNEL_LABELS[pref.channel] ?? pref.channel}
                  </span>
                  {pref.is_enabled === null && (
                    <Badge variant="outline" className="text-xs">Default</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {pref.channel !== "push" && pref.channel !== "in_app" && isEnabled && (
                    <Select
                      value={pref.frequency_code ?? "__immediate__"}
                      onValueChange={(v) => onFrequency(pref.channel, v === "__immediate__" ? null : v)}
                    >
                      <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DIGEST_FREQUENCIES.map((f) => (
                          <SelectItem key={f.code ?? "__immediate__"} value={f.code ?? "__immediate__"} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(v) => onToggle(pref.channel, v)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── NotificationsSection ──────────────────────────────────────────────────────

function PushSubscriptionControl() {
  const push = usePushSubscription();

  if (!push.isSupported) return null;

  const isBusy       = push.status === "requesting" || push.status === "unsubscribing";
  const isSubscribed = push.status === "subscribed";
  const isDenied     = push.permission === "denied" || push.status === "denied";

  if (isDenied) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Blocked in browser settings — allow notifications in your browser to re-enable push.
        </p>
      </div>
    );
  }

  if (isSubscribed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Badge variant="success" className="text-xs">Push notifications active</Badge>
          <span className="text-xs text-muted-foreground">This browser is registered.</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={push.status === "unsubscribing"}
          disabled={isBusy}
          onClick={() => { void push.unsubscribe(); }}
          className="shrink-0 text-muted-foreground"
        >
          Disable
        </Button>
      </div>
    );
  }

  const canEnable = push.isSecureContext && push.configured && !isBusy;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-xs text-muted-foreground">
        {push.error
          ? push.error
          : !push.isConfiguredKnown
            ? "Checking push configuration…"
            : !push.configured
              ? "Push notifications are not configured for this environment."
              : "Enable this browser to receive real-time push notifications."}
      </p>
      <Button
        variant="primary"
        size="sm"
        loading={push.status === "requesting"}
        disabled={!canEnable}
        onClick={() => { void push.subscribe(); }}
        className="shrink-0"
      >
        {push.status !== "requesting" && <BellRing className="h-3.5 w-3.5" />}
        Enable push notifications
      </Button>
    </div>
  );
}

export function NotificationsSection({ active }: { active: boolean }) {
  const { data, isLoading } = useNotifPreferences();
  const save                = useSavePreferences();

  const [drafts,   setDrafts]   = useState<Map<string, PrefUpsert>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saved,    setSaved]    = useState(false);

  const prefs   = data?.data ?? [];
  const grouped = groupByEventCode(prefs);
  const hasDrafts = drafts.size > 0;

  const draftKey = (event_code: string, channel: string) => `${event_code}:${channel}`;

  const getEffectivePref = useCallback((p: NotifPreference): NotifPreference => {
    const key = draftKey(p.event_code, p.channel);
    const d = drafts.get(key);
    if (!d) return p;
    return { ...p, is_enabled: d.is_enabled, frequency_code: d.frequency_code };
  }, [drafts]);

  function setDraft(event_code: string, channel: string, partial: Partial<PrefUpsert>) {
    const key = draftKey(event_code, channel);
    const existing = prefs.find((p) => p.event_code === event_code && p.channel === channel);
    const base: PrefUpsert = drafts.get(key) ?? {
      event_code, channel,
      is_enabled:     existing?.is_enabled ?? null,
      frequency_code: existing?.frequency_code ?? null,
    };
    setDrafts((prev) => new Map(prev).set(key, { ...base, ...partial }));
    setSaved(false);
  }

  function handleSave() {
    const payload = [...drafts.values()];
    if (payload.length === 0) return;
    save.mutate(payload, {
      onSuccess: () => { setDrafts(new Map()); setSaved(true); setTimeout(() => setSaved(false), 3000); },
    });
  }

  if (!active) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Set per-event, per-channel notification preferences. Unsaved changes are highlighted.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {hasDrafts && (
            <Button variant="ghost" size="sm" onClick={() => { setDrafts(new Map()); setSaved(false); }} disabled={save.isPending}>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!hasDrafts || save.isPending}>
            {saved
              ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Saved</>
              : <><Save  className="mr-1.5 h-3.5 w-3.5" /> Save</>
            }
          </Button>
        </div>
      </div>

      {save.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          Failed to save preferences. Please try again.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : grouped.size === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Bell className="mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">No notification preferences</p>
            <p className="text-xs text-muted-foreground mt-1">Preferences will appear here once notification events are configured for your tenant.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...grouped.entries()].map(([eventCode, eventPrefs]) => (
            <EventCodeRow
              key={eventCode}
              eventCode={eventCode}
              prefs={eventPrefs.map(getEffectivePref)}
              expanded={expanded.has(eventCode)}
              onExpand={() => setExpanded((prev) => { const next = new Set(prev); if (next.has(eventCode)) next.delete(eventCode); else next.add(eventCode); return next; })}
              onToggle={(ch, v) => setDraft(eventCode, ch, { is_enabled: v })}
              onFrequency={(ch, f) => setDraft(eventCode, ch, { frequency_code: f })}
            />
          ))}
        </div>
      )}

      <PushSubscriptionControl />

      <Separator />

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Channels</p>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((ch) => (
            <div key={ch} className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1">
              <span className="text-xs text-foreground">{CHANNEL_LABELS[ch] ?? ch}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Channel availability depends on your tenant configuration and subscription.
        </p>
      </div>
    </div>
  );
}
