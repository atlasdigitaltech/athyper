"use client";

/**
 * Notifications Settings Section
 *
 * Displays and edits the current user's per-event, per-channel notification
 * preferences. Preferences are loaded from GET /api/notifications/preferences
 * and saved via PATCH /api/notifications/preferences.
 *
 * Layout:
 *   - Each row = one (event_code, channel) pair.
 *   - "Enabled" toggle + optional "Frequency" selector for digest-eligible channels.
 *   - Grouped by event code for readability.
 *   - "Add override" flow lets users set preferences for events not yet overridden
 *     (defaults apply when no preference row exists).
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, BellOff, Check, ChevronDown, ChevronRight,
  Loader2, RefreshCcw, Save,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { EmptyState } from "@athyper/ui/composites";
import {
  Badge, Button, Card, CardContent,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator, Skeleton,
  Switch,
} from "@athyper/ui/primitives";
import { bffFetch } from "@/lib/bff-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifPreference {
  id:             string;
  event_code:     string;
  channel:        string;
  is_enabled:     boolean | null;  // null = inherit routing rule default
  frequency_code: string | null;   // null = immediate
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

const DIGEST_FREQUENCIES = [
  { code: null,            label: "Immediately" },
  { code: "hourly_digest", label: "Hourly digest" },
  { code: "daily_digest",  label: "Daily digest"  },
  { code: "weekly_digest", label: "Weekly digest" },
] as const;

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
        body:   JSON.stringify({ preferences: prefs }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] });
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function eventCodeLabel(code: string): string {
  return code
    .replace(/^[a-z]+\./, "")          // strip domain prefix (fin., wf., etc.)
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

function EventCodeRow({
  eventCode,
  prefs,
  onToggle,
  onFrequency,
  expanded,
  onExpand,
}: {
  eventCode:   string;
  prefs:       NotifPreference[];
  onToggle:    (channel: string, enabled: boolean) => void;
  onFrequency: (channel: string, freq: string | null) => void;
  expanded:    boolean;
  onExpand:    () => void;
}) {
  const enabledCount = prefs.filter((p) => p.is_enabled !== false).length;

  return (
    <div className="rounded-lg border bg-card">
      {/* Event header */}
      <button
        type="button"
        onClick={onExpand}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          }
          <span className="text-sm font-medium text-foreground">
            {eventCodeLabel(eventCode)}
          </span>
          <span className="font-mono text-2xs text-muted-foreground">{eventCode}</span>
        </div>
        <Badge variant="secondary" className="shrink-0 text-2xs">
          {enabledCount}/{prefs.length} active
        </Badge>
      </button>

      {/* Channel rows */}
      {expanded && (
        <div className="border-t">
          {prefs.map((pref) => {
            const isEnabled = pref.is_enabled !== false; // null = inherit = enabled
            return (
              <div
                key={pref.channel}
                className="flex items-center justify-between gap-4 border-b px-4 py-2.5 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground w-20 shrink-0">
                    {CHANNEL_LABELS[pref.channel] ?? pref.channel}
                  </span>
                  {pref.is_enabled === null && (
                    <Badge variant="outline" className="text-2xs">Default</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {/* Frequency (only for digest-eligible; not in_app/push which are immediate-only) */}
                  {pref.channel !== "push" && pref.channel !== "in_app" && isEnabled && (
                    <Select
                      value={pref.frequency_code ?? "__immediate__"}
                      onValueChange={(v) => onFrequency(pref.channel, v === "__immediate__" ? null : v)}
                    >
                      <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIGEST_FREQUENCIES.map((f) => (
                          <SelectItem
                            key={f.code ?? "__immediate__"}
                            value={f.code ?? "__immediate__"}
                            className="text-xs"
                          >
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {/* Enabled toggle */}
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

export function NotificationsSection({ active }: { active: boolean }) {
  const { data, isLoading } = useNotifPreferences();
  const save               = useSavePreferences();

  // Local draft state — maps "eventCode:channel" → PrefUpsert
  const [drafts, setDrafts] = useState<Map<string, PrefUpsert>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);

  const prefs = data?.data ?? [];
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
      event_code,
      channel,
      is_enabled:     existing?.is_enabled ?? null,
      frequency_code: existing?.frequency_code ?? null,
    };
    setDrafts((prev) => new Map(prev).set(key, { ...base, ...partial }));
    setSaved(false);
  }

  function handleToggle(event_code: string, channel: string, enabled: boolean) {
    setDraft(event_code, channel, { is_enabled: enabled });
  }

  function handleFrequency(event_code: string, channel: string, freq: string | null) {
    setDraft(event_code, channel, { frequency_code: freq });
  }

  function toggleExpand(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function handleSave() {
    const payload = [...drafts.values()];
    if (payload.length === 0) return;
    save.mutate(payload, {
      onSuccess: () => {
        setDrafts(new Map());
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      },
    });
  }

  function handleReset() {
    setDrafts(new Map());
    setSaved(false);
  }

  if (!active) return null;

  return (
    <div className="space-y-5">

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">
            Control which channels deliver each notification type. Changes apply immediately.
            Removing an override restores the routing rule default.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasDrafts && (
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={save.isPending}>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!hasDrafts || save.isPending}
            loading={save.isPending}
          >
            {saved ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Saved
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save changes
              </>
            )}
          </Button>
        </div>
      </div>

      {save.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          Failed to save preferences. Please try again.
        </div>
      )}

      {/* Preferences list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : grouped.size === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell className="h-8 w-8 text-muted-foreground/30" />}
            title="No custom preferences"
            description="All notifications are delivered using the system routing rule defaults. Once you change a setting here, your override will appear in this list."
            className="py-12"
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {[...grouped.entries()].map(([eventCode, eventPrefs]) => (
            <EventCodeRow
              key={eventCode}
              eventCode={eventCode}
              prefs={eventPrefs.map(getEffectivePref)}
              expanded={expanded.has(eventCode)}
              onExpand={() => toggleExpand(eventCode)}
              onToggle={(ch, v) => handleToggle(eventCode, ch, v)}
              onFrequency={(ch, f) => handleFrequency(eventCode, ch, f)}
            />
          ))}
        </div>
      )}

      <Separator />

      {/* Channel legend */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Available channels</p>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((ch) => (
            <div key={ch} className="flex items-center gap-1.5 rounded border px-2.5 py-1">
              <span className="text-xs text-foreground">{CHANNEL_LABELS[ch]}</span>
            </div>
          ))}
        </div>
        <p className="text-2xs text-muted-foreground">
          SMS and WhatsApp channels require additional setup (phone number verification).
          High-priority and urgent notifications are always delivered immediately regardless of digest settings.
        </p>
      </div>
    </div>
  );
}
