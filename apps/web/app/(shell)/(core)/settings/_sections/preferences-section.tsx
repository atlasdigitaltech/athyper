"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  Archive, Bell, Check, ChevronDown, ChevronRight, Globe, Grid3x3,
  Loader2, Lock, Moon, Palette, Pin, RotateCcw, Save, Settings,
  Share2, Star, Sun, SunMoon, XCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { themePresets } from "@athyper/theme/presets";
import { DEFAULT_USER_DATE_FORMAT } from "@athyper/runtime-shared/preferences";
import {
  Badge, Button, Card, CardContent,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator, Skeleton,
} from "@athyper/ui/primitives";
import { usePreferencesStore, type AppearanceMode, type DensityCode, type LanguageCode } from "@/stores/preferences/usePreferencesStore";
import { useShellSession } from "@/components/providers/SessionProvider";
import { useIntl, useFormatRich } from "@/components/providers/IntlProvider";
import { bffFetch } from "@/lib/bff-fetch";
import { normalizeLanguageCode, normalizePreferencesForBootstrap, readPreferenceMetadata } from "@/lib/preferences/ui-profile";
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

/**
 * Module-scope option definitions hold message IDs only. Localised label/desc
 * strings are resolved inside the component via formatMessage so the dropdowns
 * stay live-translatable.
 */
const PRESET_CATEGORY_DEFS: { key: (typeof themePresets)[number]["category"]; labelId: string }[] = [
  { key: "professional", labelId: "settings.preferences.themeCategory.professional" },
  { key: "expressive",   labelId: "settings.preferences.themeCategory.expressive" },
  { key: "playful",      labelId: "settings.preferences.themeCategory.playful" },
  { key: "retro",        labelId: "settings.preferences.themeCategory.retro" },
];

const APPEARANCE_OPTION_DEFS: { value: AppearanceMode; icon: ReactNode; labelId: string; descId: string }[] = [
  { value: "light",  icon: <Sun     className="h-3.5 w-3.5" />, labelId: "settings.preferences.appearance.light",  descId: "settings.preferences.appearance.lightDesc"  },
  { value: "dark",   icon: <Moon    className="h-3.5 w-3.5" />, labelId: "settings.preferences.appearance.dark",   descId: "settings.preferences.appearance.darkDesc"   },
  { value: "system", icon: <SunMoon className="h-3.5 w-3.5" />, labelId: "settings.preferences.appearance.system", descId: "settings.preferences.appearance.systemDesc" },
];

const DENSITY_OPTION_DEFS: { value: DensityCode; labelId: string; descId: string }[] = [
  { value: "compact",     labelId: "settings.preferences.density.compact",     descId: "settings.preferences.density.compactDesc"     },
  { value: "comfortable", labelId: "settings.preferences.density.comfortable", descId: "settings.preferences.density.comfortableDesc" },
  { value: "spacious",    labelId: "settings.preferences.density.spacious",    descId: "settings.preferences.density.spaciousDesc"    },
];

const HOME_WORKSPACE_DEFS: { value: string; labelId: string }[] = [
  { value: "CORE", labelId: "settings.preferences.workspace.core" },
  { value: "FIN",  labelId: "settings.preferences.workspace.fin"  },
  { value: "SCM",  labelId: "settings.preferences.workspace.scm"  },
  { value: "COM",  labelId: "settings.preferences.workspace.com"  },
  { value: "PPL",  labelId: "settings.preferences.workspace.ppl"  },
  { value: "PRS",  labelId: "settings.preferences.workspace.prs"  },
  { value: "OPS",  labelId: "settings.preferences.workspace.ops"  },
  { value: "AST",  labelId: "settings.preferences.workspace.ast"  },
  { value: "PTR",  labelId: "settings.preferences.workspace.ptr"  },
];

const HOME_MODULE_DEFS_BY_WORKSPACE: Record<string, { value: string; labelId: string }[]> = {
  CORE: [
    { value: "FND",  labelId: "settings.preferences.module.fnd"  },
    { value: "META", labelId: "settings.preferences.module.meta" },
    { value: "IAM",  labelId: "settings.preferences.module.iam"  },
    { value: "AUD",  labelId: "settings.preferences.module.aud"  },
    { value: "NTF",  labelId: "settings.preferences.module.ntf"  },
  ],
  FIN: [
    { value: "ACC",      labelId: "settings.preferences.module.acc"      },
    { value: "PAY",      labelId: "settings.preferences.module.pay"      },
    { value: "TREASURY", labelId: "settings.preferences.module.treasury" },
    { value: "BUDGET",   labelId: "settings.preferences.module.budget"   },
  ],
  SCM: [
    { value: "SRM",       labelId: "settings.preferences.module.srm"       },
    { value: "SOURCE",    labelId: "settings.preferences.module.source"    },
    { value: "CONTRACT",  labelId: "settings.preferences.module.contract"  },
    { value: "BUY",       labelId: "settings.preferences.module.buy"       },
    { value: "INVENTORY", labelId: "settings.preferences.module.inventory" },
  ],
  COM: [
    { value: "CRM",  labelId: "settings.preferences.module.crm"  },
    { value: "SALE", labelId: "settings.preferences.module.sale" },
  ],
  PPL: [
    { value: "HR",      labelId: "settings.preferences.module.hr"      },
    { value: "PAYROLL", labelId: "settings.preferences.module.payroll" },
  ],
  PRS: [
    { value: "PRJCOST", labelId: "settings.preferences.module.prjcost" },
    { value: "ITSM",    labelId: "settings.preferences.module.itsm"    },
  ],
  OPS: [
    { value: "MAINT", labelId: "settings.preferences.module.maint" },
    { value: "MFG",   labelId: "settings.preferences.module.mfg"   },
  ],
  AST: [
    { value: "ASSET",     labelId: "settings.preferences.module.asset"     },
    { value: "ASSETREMS", labelId: "settings.preferences.module.assetrems" },
    { value: "ASSETFM",   labelId: "settings.preferences.module.assetfm"   },
  ],
  PTR: [
    { value: "PCON", labelId: "settings.preferences.module.pcon" },
    { value: "OMI",  labelId: "settings.preferences.module.omi"  },
    { value: "IMO",  labelId: "settings.preferences.module.imo"  },
    { value: "LOGX", labelId: "settings.preferences.module.logx" },
  ],
};

interface PrefsBaseline {
  appearanceMode: AppearanceMode;
  themePreset: string;
  densityCode: DensityCode;
  languageCode: LanguageCode;
  timezone: string;
  dateFormat: string;
  weekStart: string;
  homeWs: string;
  homeMod: string;
  digest: string;
}

export function PreferencesSection({ active }: { active: boolean }) {
  const { appearanceMode, themePreset, densityCode, languageCode, setAppearanceMode, setThemePreset, setDensityCode, setLanguageCode, setTimezoneCode, setDateFormat: setStoreDateFormat, seedFromBootstrap } =
    usePreferencesStore();
  const { bff } = useShellSession();
  const { formatMessage } = useIntl();
  const formatRich = useFormatRich();

  // Extended prefs from principal_ui_profile
  const [timezone,   setTimezone]   = useState("Asia/Dubai");
  const [dateFormat, setDateFormat] = useState(DEFAULT_USER_DATE_FORMAT);
  const [weekStart,  setWeekStart]  = useState("1");
  const [homeWs,     setHomeWs]     = useState("FIN");
  const [homeMod,    setHomeMod]    = useState("ACC");
  const [digest,     setDigest]     = useState("daily");

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState<"idle" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Localised option arrays — rebuild on locale change so dropdown labels stay live.
  const appearanceOptions = APPEARANCE_OPTION_DEFS.map((o) => ({
    value: o.value,
    label: (<>{o.icon} {formatMessage({ id: o.labelId })}</>) as ReactNode,
    desc: formatMessage({ id: o.descId }),
  }));
  const densityOptions = DENSITY_OPTION_DEFS.map((o) => ({
    value: o.value,
    label: formatMessage({ id: o.labelId }),
    desc: formatMessage({ id: o.descId }),
  }));
  const homeWorkspaceOptions = HOME_WORKSPACE_DEFS.map((o) => ({
    value: o.value,
    label: formatMessage({ id: o.labelId }),
  }));
  const homeModuleDefs = HOME_MODULE_DEFS_BY_WORKSPACE[homeWs] ?? HOME_MODULE_DEFS_BY_WORKSPACE.FIN ?? [];
  const homeModuleOptions = homeModuleDefs.map((o) => ({
    value: o.value,
    label: formatMessage({ id: o.labelId }),
  }));
  // Snapshot of the last server-loaded values; used by Discard to revert
  // every field (including Zustand-backed appearance/theme/density).
  const baselineRef = useRef<PrefsBaseline | null>(null);

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
        // Seed Zustand store from the server response (handles legacy snake_case
        // and metadata-nested theme_preset). This is what Discard reverts to.
        seedFromBootstrap(normalizePreferencesForBootstrap(d));
        const metadata = readPreferenceMetadata(d);

        const nextTz     = d["timezone_code"]       ? String(d["timezone_code"])       : "Asia/Dubai";
        const nextDateFmt= d["date_format"]         ? String(d["date_format"])         : DEFAULT_USER_DATE_FORMAT;
        const nextWeek   = d["week_start"] != null  ? String(d["week_start"])          : "1";
        const nextHomeWs = d["home_workspace_code"] ? String(d["home_workspace_code"]) : "FIN";
        const nextHomeMod= d["home_module_code"]    ? String(d["home_module_code"])    : "ACC";
        const nextDigest = d["notification_digest"]
          ? String(d["notification_digest"])
          : (typeof metadata["digest"] === "string" ? metadata["digest"] : "daily");

        setTimezone(nextTz);
        setDateFormat(nextDateFmt);
        setTimezoneCode(nextTz);
        setStoreDateFormat(nextDateFmt);
        setWeekStart(nextWeek);
        setHomeWs(nextHomeWs);
        setHomeMod(nextHomeMod);
        setDigest(nextDigest);

        // Snapshot baseline AFTER seeding. Read appearance/theme/density back
        // from the store since seedFromBootstrap normalises them.
        const store = usePreferencesStore.getState();
        baselineRef.current = {
          appearanceMode: store.appearanceMode,
          themePreset: store.themePreset,
          densityCode: store.densityCode,
          languageCode: store.languageCode,
          timezone: nextTz,
          dateFormat: nextDateFmt,
          weekStart: nextWeek,
          homeWs: nextHomeWs,
          homeMod: nextHomeMod,
          digest: nextDigest,
        };
        // Loading the baseline shouldn't leave the form looking dirty.
        setDirty(false);
      })
      .catch(() => { /* use defaults */ });
  }, [active, prefsLoaded, seedFromBootstrap, setStoreDateFormat, setTimezoneCode]);

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
          language_code:       languageCode   || null,
          timezone_code:       timezone   || null,
          date_format:         dateFormat || null,
          week_start:          weekStart ? Number(weekStart) : null,
          home_workspace_code: homeWs    || null,
          home_module_code:    homeMod   || null,
          notification_digest: digest    || null,
        },
      });
      // Update baseline so a follow-up Discard reverts to what we just saved,
      // not to the previous server values.
      baselineRef.current = {
        appearanceMode, themePreset, densityCode, languageCode,
        timezone, dateFormat, weekStart, homeWs, homeMod, digest,
      };
      setSaveStatus("saved"); setDirty(false);
      setTimezoneCode(timezone);
      setStoreDateFormat(dateFormat);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  function handleDiscard() {
    const b = baselineRef.current;
    if (!b) { setDirty(false); return; }
    setAppearanceMode(b.appearanceMode);
    setThemePreset(b.themePreset as Parameters<typeof setThemePreset>[0]);
    setDensityCode(b.densityCode);
    setLanguageCode(b.languageCode);
    setTimezone(b.timezone);
    setDateFormat(b.dateFormat);
    setTimezoneCode(b.timezone);
    setStoreDateFormat(b.dateFormat);
    setWeekStart(b.weekStart);
    setHomeWs(b.homeWs);
    setHomeMod(b.homeMod);
    setDigest(b.digest);
    setDirty(false);
    setSaveStatus("idle");
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
        {formatRich(
          { id: "settings.preferences.banner" },
          {
            strong: (chunks) => <strong>{chunks}</strong>,
            code: (chunks) => (
              <code className="rounded bg-card px-1 font-mono text-2xs">{chunks}</code>
            ),
          },
        )}
      </Banner>

      {/* ── Appearance ── */}
      <SectionCard
        title={formatMessage({ id: "settings.section.appearance" })}
        icon={Palette}
        managedBy={{ manager: "You", source: "master.principal_ui_preference, master.principal_ui_profile" }}
      >
        {/* Color mode */}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{formatMessage({ id: "settings.preferences.colorMode" })}</p>
            <SourceChip source="principal_ui_profile" />
          </div>
          <ToggleGroup
            value={appearanceMode}
            onChange={(v) => { setAppearanceMode(v); markDirty(); }}
            options={appearanceOptions}
          />
        </div>

        {/* Theme preset */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{formatMessage({ id: "settings.preferences.themePreset" })}</p>
            <SourceChip source="principal_ui_profile" />
          </div>
          <div className="space-y-4">
            {PRESET_CATEGORY_DEFS.map((cat) => {
              const presets = themePresets.filter((p) => p.category === cat.key);
              return (
                <div key={cat.key}>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatMessage({ id: cat.labelId })}
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
        title={formatMessage({ id: "settings.section.density" })}
        icon={Grid3x3}
        managedBy={{ manager: "You", source: "master.principal_ui_profile" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{formatMessage({ id: "settings.preferences.layoutDensity" })}</p>
          <SourceChip source="principal_ui_profile" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {densityOptions.map((opt) => (
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
        title={formatMessage({ id: "settings.section.regional" })}
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
              label: formatMessage({ id: "user.language" }),
              key: "language_code",
              value: languageCode,
              setter: (v: string) => setLanguageCode(normalizeLanguageCode(v) ?? "en"),
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
              label: formatMessage({ id: "settings.preferences.regional.timezone" }),
              key: "timezone_code",
              value: timezone,
              setter: (v: string) => { setTimezone(v); setTimezoneCode(v); },
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
              label: formatMessage({ id: "settings.preferences.regional.dateFormat" }),
              key: "date_format",
              value: dateFormat,
              setter: (v: string) => { setDateFormat(v); setStoreDateFormat(v); },
              source: "principal_ui_profile",
              options: [
                { value: "%d %b %Y", label: "DD Mon YYYY" },
                { value: "%d/%m/%Y", label: "DD/MM/YYYY" },
                { value: "%m/%d/%Y", label: "MM/DD/YYYY" },
                { value: "%Y-%m-%d", label: "YYYY-MM-DD" },
                { value: "%d-%b-%Y", label: "DD-Mon-YYYY" },
              ],
            },
            {
              label: formatMessage({ id: "settings.preferences.regional.weekStartsOn" }),
              key: "week_start",
              value: weekStart,
              setter: setWeekStart,
              source: "tenant_profile",
              options: [
                { value: "0", label: formatMessage({ id: "settings.preferences.regional.weekday.sunday" }) },
                { value: "1", label: formatMessage({ id: "settings.preferences.regional.weekday.monday" }) },
                { value: "6", label: formatMessage({ id: "settings.preferences.regional.weekday.saturday" }) },
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
        title={formatMessage({ id: "settings.section.navigation" })}
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
              <label className="text-xs font-medium text-muted-foreground">{formatMessage({ id: "settings.preferences.navigation.homeWorkspace" })}</label>
              <SourceChip source="principal_ui_profile" />
            </div>
            <Select
              value={homeWs}
              onValueChange={(v) => {
                setHomeWs(v);
                // Module is FK-scoped to workspace; snap to the first module of
                // the new workspace whenever the current selection wouldn't be valid.
                setHomeMod(HOME_MODULE_DEFS_BY_WORKSPACE[v]?.[0]?.value ?? "");
                markDirty();
              }}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {homeWorkspaceOptions.map((ws) => (
                  <SelectItem key={ws.value} value={ws.value} className="text-sm">{ws.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-2xs text-muted-foreground">{formatMessage({ id: "settings.preferences.navigation.firstWorkspace" })}</p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">{formatMessage({ id: "settings.preferences.navigation.homeModule" })}</label>
              <SourceChip source="principal_ui_profile" />
            </div>
            <Select value={homeMod} onValueChange={(v) => { setHomeMod(v); markDirty(); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {homeModuleOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-2xs text-muted-foreground">{formatMessage({ id: "settings.preferences.navigation.landingModule" })}</p>
          </div>
        </div>
        <Separator className="my-3" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{formatMessage({ id: "settings.preferences.navigation.activeOrg" })}</span>
          <span className="text-sm text-foreground">
            {bff.activeOrg ? bff.activeOrg.replace("--", " / ") : "—"}
          </span>
        </div>
      </SectionCard>

      {/* ── Notifications ── */}
      <SectionCard
        title={formatMessage({ id: "settings.section.notifications" })}
        icon={Bell}
        managedBy={{
          manager: "You",
          source: "master.principal_ui_preference",
          editPath: "preference_code: notification_digest",
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{formatMessage({ id: "settings.preferences.notifications.digestFrequency" })}</p>
          <SourceChip source="principal_ui_profile" />
        </div>
        <ToggleGroup
          value={digest}
          onChange={(v) => { setDigest(v); markDirty(); }}
          options={[
            { value: "realtime", label: formatMessage({ id: "settings.preferences.notifications.realtime" }) as string },
            { value: "hourly",   label: formatMessage({ id: "settings.preferences.notifications.hourly"   }) as string },
            { value: "daily",    label: formatMessage({ id: "settings.preferences.notifications.daily"    }) as string },
            { value: "weekly",   label: formatMessage({ id: "settings.preferences.notifications.weekly"   }) as string },
          ]}
        />
        <p className="mt-2 text-2xs text-muted-foreground">
          {formatMessage({ id: "settings.preferences.notifications.howOften" })}
        </p>
      </SectionCard>

      {/* ── Saved Views ── */}
      <SectionCard
        title={formatMessage({ id: "settings.section.savedViews" })}
        icon={Lock}
        badge={
          <Badge variant="secondary" className="text-2xs">
            {formatMessage({ id: "settings.preferences.savedViews.activeCount" }, { count: activeViews.length })}
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
            {formatMessage({ id: "settings.preferences.savedViews.empty" })}
          </p>
        ) : (
          <div className="space-y-2">
            {activeViews.map((v) => (
              <SavedViewCard key={v.id} view={v} onAction={handleViewAction} />
            ))}
          </div>
        )}
        <p className="mt-3 text-2xs text-muted-foreground">
          {formatRich(
            { id: "settings.preferences.savedViews.legend" },
            { strong: (chunks) => <strong>{chunks}</strong> },
          )}
        </p>
      </SectionCard>

      {/* ── Sticky save bar ── */}
      {/* Keep the bar mounted while there's a status to show, otherwise the
          "Saved"/"Failed" feedback unmounts the moment dirty flips to false. */}
      {(dirty || saveStatus !== "idle") && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-t-lg border-t border-border bg-card px-4 py-3 shadow-md">
          <span className="text-xs">
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-success">
                <Check className="h-3 w-3" /> {formatMessage({ id: "settings.preferences.status.saved" })}
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1 text-destructive">
                <XCircle className="h-3 w-3" /> {formatMessage({ id: "settings.preferences.status.failed" })}
              </span>
            )}
            {saveStatus === "idle" && dirty && (
              <span className="text-muted-foreground">{formatMessage({ id: "settings.preferences.status.unsaved" })}</span>
            )}
          </span>
          {dirty && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                disabled={saving}
              >
                <RotateCcw className="mr-1.5 h-3 w-3" /> {formatMessage({ id: "settings.preferences.actions.discard" })}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving
                  ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  : <Save className="mr-1.5 h-3 w-3" />}
                {formatMessage({ id: saving ? "settings.preferences.actions.saving" : "settings.preferences.actions.save" })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
