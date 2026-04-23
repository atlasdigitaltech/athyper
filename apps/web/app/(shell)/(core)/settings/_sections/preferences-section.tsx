"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  Archive, Bell, Check, ChevronDown, ChevronRight, Globe, Grid3x3,
  Loader2, Lock, Moon, Palette, Pin, RotateCcw, Save, Settings,
  Share2, Star, Sun, SunMoon, XCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { themePresets } from "@athyper/theme/presets";
import {
  Badge, Button, Card, CardContent,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator, Skeleton,
} from "@athyper/ui/primitives";
import { usePreferencesStore, type AppearanceMode, type DensityCode } from "@/stores/preferences/usePreferencesStore";
import { useShellSession } from "@/components/providers/SessionProvider";
import { bffFetch } from "@/lib/bff-fetch";
import {
  Banner, SectionCard, DataTable, SkeletonCard, ToggleGroup,
  SourceChip, str, fmtDate,
} from "@/components/settings/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SavedView extends Record<string, unknown> {
  id: string;
  name: string;
  description?: string | null;
  view_type: string;
  module_code: string;
  is_pinned: boolean;
  is_starred: boolean;
  is_shared: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at?: string | null;
}

// ─── PresetCard ───────────────────────────────────────────────────────────────

function PresetCard({
  preset,
  active,
  onSelect,
}: {
  preset: (typeof themePresets)[number];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-all",
        active
          ? "border-primary bg-accent"
          : "border-border hover:border-primary",
      )}
    >
      {active && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
      <div className="flex gap-1">
        <div className="h-4 w-4 shrink-0" style={{ borderRadius: preset.radius, backgroundColor: preset.primaryColor }} />
        <div className="h-4 flex-1" style={{ borderRadius: preset.radius, backgroundColor: preset.mutedColor }} />
      </div>
      <p className="pr-5 text-xs font-semibold leading-tight text-foreground">{preset.label}</p>
      <p className="line-clamp-2 text-2xs leading-tight text-muted-foreground">{preset.description}</p>
    </button>
  );
}

// ─── SavedViewCard ─────────────────────────────────────────────────────────────

function SavedViewCard({
  view,
  onAction,
}: {
  view: SavedView;
  onAction: (id: string, action: "pin" | "star" | "share" | "archive") => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function act(action: "pin" | "star" | "share" | "archive") {
    setBusy(action);
    try { await onAction(view.id, action); }
    finally { setBusy(null); }
  }

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="flex-1 text-xs font-semibold text-foreground">{view.name}</span>
        <div className="flex shrink-0 items-center gap-1">
          {view.is_pinned  && <Pin   className="h-3 w-3 text-info" />}
          {view.is_starred && <Star  className="h-3 w-3 text-warning" />}
          {view.is_shared  && <Share2 className="h-3 w-3 text-success" />}
          <Badge variant="secondary" className="text-2xs capitalize">{view.view_type}</Badge>
          <Badge variant="outline"   className="text-2xs">{view.module_code}</Badge>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          {view.description && (
            <p className="mb-2 text-xs text-muted-foreground">{view.description}</p>
          )}
          <div className="mb-3 flex gap-x-4 gap-y-1 flex-wrap text-2xs text-muted-foreground">
            <span>Created: {fmtDate(view.created_at)}</span>
            {view.updated_at && <span>Updated: {fmtDate(view.updated_at)}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className={cn("h-7 gap-1 px-2 text-2xs", view.is_pinned && "border-info text-info")}
              onClick={() => act("pin")}
              disabled={!!busy}
            >
              {busy === "pin"
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <Pin className="h-2.5 w-2.5" />}
              {view.is_pinned ? "Unpin" : "Pin"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-7 gap-1 px-2 text-2xs", view.is_starred && "border-warning text-warning")}
              onClick={() => act("star")}
              disabled={!!busy}
            >
              {busy === "star"
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <Star className="h-2.5 w-2.5" />}
              {view.is_starred ? "Unstar" : "Star"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-7 gap-1 px-2 text-2xs", view.is_shared && "border-success text-success")}
              onClick={() => act("share")}
              disabled={!!busy}
            >
              {busy === "share"
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <Share2 className="h-2.5 w-2.5" />}
              {view.is_shared ? "Unshare" : "Share"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-2xs text-destructive hover:border-destructive hover:text-destructive"
              onClick={() => act("archive")}
              disabled={!!busy}
            >
              {busy === "archive"
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <Archive className="h-2.5 w-2.5" />}
              Archive
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PreferencesSection ───────────────────────────────────────────────────────

const PRESET_CATEGORIES: { key: (typeof themePresets)[number]["category"]; label: string }[] = [
  { key: "professional", label: "Professional" },
  { key: "expressive",   label: "Expressive" },
  { key: "playful",      label: "Playful" },
  { key: "retro",        label: "Retro" },
];

const APPEARANCE_OPTIONS: { value: AppearanceMode; label: ReactNode; desc: string }[] = [
  { value: "light",  label: <><Sun  className="h-3.5 w-3.5" /> Light</>,  desc: "Always light" },
  { value: "dark",   label: <><Moon className="h-3.5 w-3.5" /> Dark</>,   desc: "Always dark"  },
  { value: "system", label: <><SunMoon className="h-3.5 w-3.5" /> System</>, desc: "Follows OS" },
];

const DENSITY_OPTIONS: { value: DensityCode; label: string; desc: string }[] = [
  { value: "compact",     label: "Compact",     desc: "Tighter spacing" },
  { value: "comfortable", label: "Comfortable", desc: "Balanced (default)" },
  { value: "spacious",    label: "Spacious",    desc: "Generous padding" },
];

export function PreferencesSection({ active }: { active: boolean }) {
  const { appearanceMode, themePreset, densityCode, setAppearanceMode, setThemePreset, setDensityCode } =
    usePreferencesStore();
  const { bff } = useShellSession();

  // Extended prefs from principal_ui_profile
  const [language,   setLanguage]   = useState("en");
  const [timezone,   setTimezone]   = useState("Asia/Dubai");
  const [dateFormat, setDateFormat] = useState("%d/%m/%Y");
  const [weekStart,  setWeekStart]  = useState("1");
  const [homeWs,     setHomeWs]     = useState("finance");
  const [homeMod,    setHomeMod]    = useState("dashboard");
  const [digest,     setDigest]     = useState("daily");

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState<"idle" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saved views
  const [views,        setViews]        = useState<SavedView[]>([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [viewsLoaded,  setViewsLoaded]  = useState(false);

  // Load preferences once
  useEffect(() => {
    if (!active || prefsLoaded) return;
    setPrefsLoaded(true);
    bffFetch<Record<string, unknown>>("/api/user/preferences")
      .then((d) => {
        if (d["language_code"])       setLanguage(String(d["language_code"]));
        if (d["timezone_code"])       setTimezone(String(d["timezone_code"]));
        if (d["date_format"])         setDateFormat(String(d["date_format"]));
        if (d["week_start"] != null)  setWeekStart(String(d["week_start"]));
        if (d["home_workspace_code"]) setHomeWs(String(d["home_workspace_code"]));
        if (d["home_module_code"])    setHomeMod(String(d["home_module_code"]));
        if (d["notification_digest"]) setDigest(String(d["notification_digest"]));
      })
      .catch(() => { /* use defaults */ });
  }, [active, prefsLoaded]);

  // Load saved views once
  useEffect(() => {
    if (!active || viewsLoaded) return;
    setViewsLoaded(true);
    setViewsLoading(true);
    bffFetch<SavedView[]>("/api/user/saved-views")
      .then(setViews)
      .catch(() => setViews([]))
      .finally(() => setViewsLoading(false));
  }, [active, viewsLoaded]);

  // Cleanup save timer
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const markDirty = () => setDirty(true);

  async function handleSave() {
    setSaving(true); setSaveStatus("idle");
    try {
      await bffFetch("/api/user/preferences", {
        method: "PATCH",
        body: {
          appearance_mode:     appearanceMode,
          density_code:        densityCode,
          metadata:            { theme_preset: themePreset, digest },
          language_code:       language   || null,
          timezone_code:       timezone   || null,
          date_format:         dateFormat || null,
          week_start:          weekStart ? Number(weekStart) : null,
          home_workspace_code: homeWs    || null,
          home_module_code:    homeMod   || null,
          notification_digest: digest    || null,
        },
      });
      setSaveStatus("saved"); setDirty(false);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  const handleViewAction = useCallback(
    async (id: string, action: "pin" | "star" | "share" | "archive") => {
      await bffFetch(`/api/user/saved-views/${id}/${action}`, { method: "PATCH" });
      setViews((prev) =>
        action === "archive"
          ? prev.filter((v) => v.id !== id)
          : prev.map((v) =>
              v.id !== id ? v : {
                ...v,
                is_pinned:  action === "pin"   ? !v.is_pinned  : v.is_pinned,
                is_starred: action === "star"  ? !v.is_starred : v.is_starred,
                is_shared:  action === "share" ? !v.is_shared  : v.is_shared,
              },
            ),
      );
    },
    [],
  );

  const activeViews = views.filter((v) => !v.is_archived);

  return (
    <div className="w-full">
      <Banner>
        Preferences follow a cascade:{" "}
        <strong>Platform default → Tenant default → Your overrides</strong>.
        Saving stores values in your{" "}
        <code className="rounded bg-card px-1 font-mono text-2xs">principal_ui_profile</code>.
      </Banner>

      {/* ── Appearance ── */}
      <SectionCard
        title="Appearance"
        icon={Palette}
        managedBy={{ manager: "You", source: "master.principal_ui_preference, master.principal_ui_profile" }}
      >
        {/* Color mode */}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Color mode</p>
            <SourceChip source="principal_ui_profile" />
          </div>
          <ToggleGroup
            value={appearanceMode}
            onChange={(v) => { setAppearanceMode(v); markDirty(); }}
            options={APPEARANCE_OPTIONS}
          />
        </div>

        {/* Theme preset */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Theme preset</p>
            <SourceChip source="principal_ui_profile" />
          </div>
          <div className="space-y-4">
            {PRESET_CATEGORIES.map((cat) => {
              const presets = themePresets.filter((p) => p.category === cat.key);
              return (
                <div key={cat.key}>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {cat.label}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {presets.map((p) => (
                      <PresetCard
                        key={p.value}
                        preset={p}
                        active={themePreset === p.value}
                        onSelect={() => { setThemePreset(p.value as Parameters<typeof setThemePreset>[0]); markDirty(); }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* ── Density ── */}
      <SectionCard
        title="Density"
        icon={Grid3x3}
        managedBy={{ manager: "You", source: "master.principal_ui_profile" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Layout density</p>
          <SourceChip source="principal_ui_profile" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {DENSITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setDensityCode(opt.value); markDirty(); }}
              className={cn(
                "flex flex-1 flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-all",
                densityCode === opt.value
                  ? "border-primary bg-accent"
                  : "border-border hover:border-primary",
              )}
            >
              <span className="text-xs font-semibold text-foreground">{opt.label}</span>
              <span className="text-2xs text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ── Regional ── */}
      <SectionCard
        title="Regional"
        icon={Globe}
        managedBy={{
          manager: "You",
          source: "master.principal_ui_profile",
          editPath: "Overrides tenant_profile defaults",
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {([
            {
              label: "Language",
              key: "language_code",
              value: language,
              setter: setLanguage,
              source: "principal_ui_profile",
              options: [
                { value: "en", label: "English" },
                { value: "ar", label: "العربية" },
                { value: "fr", label: "Français" },
                { value: "de", label: "Deutsch" },
                { value: "hi", label: "हिंदी" },
                { value: "ta", label: "தமிழ்" },
              ],
            },
            {
              label: "Timezone",
              key: "timezone_code",
              value: timezone,
              setter: setTimezone,
              source: "principal_ui_profile",
              options: [
                { value: "Asia/Dubai",       label: "Asia/Dubai (GST +4)" },
                { value: "Asia/Kolkata",     label: "Asia/Kolkata (IST +5:30)" },
                { value: "UTC",              label: "UTC +0" },
                { value: "Europe/London",    label: "Europe/London" },
                { value: "America/New_York", label: "America/New York" },
                { value: "Asia/Singapore",   label: "Asia/Singapore (SGT +8)" },
              ],
            },
            {
              label: "Date Format",
              key: "date_format",
              value: dateFormat,
              setter: setDateFormat,
              source: "tenant_profile",
              options: [
                { value: "%d/%m/%Y", label: "DD/MM/YYYY" },
                { value: "%m/%d/%Y", label: "MM/DD/YYYY" },
                { value: "%Y-%m-%d", label: "YYYY-MM-DD" },
                { value: "%d-%b-%Y", label: "DD-Mon-YYYY" },
              ],
            },
            {
              label: "Week Starts On",
              key: "week_start",
              value: weekStart,
              setter: setWeekStart,
              source: "tenant_profile",
              options: [
                { value: "0", label: "Sunday" },
                { value: "1", label: "Monday" },
                { value: "6", label: "Saturday" },
              ],
            },
          ] as const).map(({ label, value, setter, source, options }) => (
            <div key={label}>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">{label}</label>
                <SourceChip source={source} />
              </div>
              <Select value={value} onValueChange={(v) => { setter(v); markDirty(); }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Navigation Defaults ── */}
      <SectionCard
        title="Navigation Defaults"
        icon={Settings}
        managedBy={{
          manager: "You",
          source: "master.principal_ui_profile",
          editPath: "Controls landing workspace/module on login",
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Home Workspace</label>
              <SourceChip source="principal_ui_profile" />
            </div>
            <Select value={homeWs} onValueChange={(v) => { setHomeWs(v); markDirty(); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["finance", "procurement", "hrm", "asset"].map((ws) => (
                  <SelectItem key={ws} value={ws} className="text-sm capitalize">{ws}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-2xs text-muted-foreground">First workspace shown on login</p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Home Module</label>
              <SourceChip source="principal_ui_profile" />
            </div>
            <Select value={homeMod} onValueChange={(v) => { setHomeMod(v); markDirty(); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["dashboard", "inbox", "reports"].map((m) => (
                  <SelectItem key={m} value={m} className="text-sm capitalize">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-2xs text-muted-foreground">Landing module within workspace</p>
          </div>
        </div>
        <Separator className="my-3" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Active Organization</span>
          <span className="text-sm text-foreground">
            {bff.activeOrg ? bff.activeOrg.replace("--", " / ") : "—"}
          </span>
        </div>
      </SectionCard>

      {/* ── Notifications ── */}
      <SectionCard
        title="Notifications"
        icon={Bell}
        managedBy={{
          manager: "You",
          source: "master.principal_ui_preference",
          editPath: "preference_code: notification_digest",
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Digest frequency</p>
          <SourceChip source="principal_ui_profile" />
        </div>
        <ToggleGroup
          value={digest}
          onChange={(v) => { setDigest(v); markDirty(); }}
          options={[
            { value: "realtime", label: "Realtime" },
            { value: "hourly",   label: "Hourly"   },
            { value: "daily",    label: "Daily"    },
            { value: "weekly",   label: "Weekly"   },
          ]}
        />
        <p className="mt-2 text-2xs text-muted-foreground">
          How often you receive notification summary emails.
        </p>
      </SectionCard>

      {/* ── Saved Views ── */}
      <SectionCard
        title="Saved Views"
        icon={Lock}
        badge={
          <Badge variant="secondary" className="text-2xs">
            {activeViews.length} active
          </Badge>
        }
        managedBy={{
          manager: "You",
          source: "master.saved_view",
          editPath: "Manage per-module view presets",
        }}
      >
        {viewsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-3/4 rounded-md" />
          </div>
        ) : activeViews.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No saved views yet. Views are created from module list pages.
          </p>
        ) : (
          <div className="space-y-2">
            {activeViews.map((v) => (
              <SavedViewCard key={v.id} view={v} onAction={handleViewAction} />
            ))}
          </div>
        )}
        <p className="mt-3 text-2xs text-muted-foreground">
          <strong>Pin</strong> — show in sidebar ·{" "}
          <strong>Star</strong> — personal favourite ·{" "}
          <strong>Share</strong> — visible to team members ·{" "}
          <strong>Archive</strong> — hides from all lists.
        </p>
      </SectionCard>

      {/* ── Sticky save bar ── */}
      {dirty && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-t-lg border-t border-border bg-card px-4 py-3 shadow-md">
          <span className="text-xs">
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-success">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1 text-destructive">
                <XCircle className="h-3 w-3" /> Failed to save
              </span>
            )}
            {saveStatus === "idle" && (
              <span className="text-muted-foreground">Unsaved changes</span>
            )}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPrefsLoaded(false); setDirty(false); }}
              disabled={saving}
            >
              <RotateCcw className="mr-1.5 h-3 w-3" /> Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving
                ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                : <Save className="mr-1.5 h-3 w-3" />}
              {saving ? "Saving…" : "Save Preferences"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
