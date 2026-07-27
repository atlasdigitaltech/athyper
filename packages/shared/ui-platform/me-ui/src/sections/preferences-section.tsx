"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, Check, Globe, Grid3x3,
  Loader2, Lock, Moon, Palette, RotateCcw, Save, Settings,
  Sun, SunMoon, XCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { DEFAULT_PRESET, getPresetMeta, themePresets } from "@athyper/theme/presets";
import {
  Badge, Button,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator,
} from "@athyper/ui/primitives";
import { bffFetch, BffError } from "@athyper/runtime-shared/client";
import type {
  AppearanceMode,
  DensityCode,
  MePreferences,
  MePreferencesPatch,
  MePreferencesPatchResponse,
} from "@athyper/api-contracts/me";
import { SavedViewsSummary } from "@athyper/saved-views-ui";

import {
  Banner, SectionCard, ToggleGroup,
  SourceChip,
} from "../_shared";
import { useMeUI } from "../me-ui-provider";
import type { NavigationModuleOption, NavigationWorkspaceOption } from "../preferences/navigation-defaults";

// ─── Local view-model ────────────────────────────────────────────────────────

interface BaselinePrefs {
  appearanceMode: AppearanceMode;
  themePreset:    string;
  densityCode:    DensityCode;
  languageCode:   string;
  timezone:       string;
  dateFormat:     string;
  weekStart:      string;
  homeWs:         string;
  homeMod:        string;
  digest:         string;
}

interface EntitledModule {
  module_id: string;
  status: string;
  metadata?: Record<string, unknown>;
}

// ─── PresetCard ──────────────────────────────────────────────────────────────

function PresetCard({ preset, active, onSelect }: {
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
        active ? "border-primary bg-accent" : "border-border hover:border-primary",
      )}
    >
      {active && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
      <div className="flex gap-1">
        <div className="h-4 w-4 shrink-0" style={{ borderRadius: preset.previewRadius, backgroundColor: preset.primaryColor }} />
        <div className="h-4 flex-1" style={{ borderRadius: preset.previewRadius, backgroundColor: preset.mutedColor }} />
      </div>
      <p className="pr-5 text-sm font-medium leading-tight text-foreground">{preset.label}</p>
      <p className="line-clamp-2 text-xs leading-tight text-muted-foreground">{preset.description}</p>
    </button>
  );
}

// ─── SavedViewCard ───────────────────────────────────────────────────────────

// ─── Preset categories (label tree) ──────────────────────────────────────────

type PresetCategory = (typeof themePresets)[number]["category"];
const PRESET_CATEGORIES: { key: PresetCategory; label: string }[] = [
  { key: "professional", label: "Professional" },
  { key: "expressive",   label: "Expressive" },
  { key: "playful",      label: "Playful" },
  { key: "retro",        label: "Retro" },
];

// ─── PreferencesSection ──────────────────────────────────────────────────────

/**
 * User-preferences section sourced from /api/me/preferences (GET + PATCH) and
 * /api/me/saved-views (GET + PATCH action). Typed against MePreferences,
 * MePreferencesPatch, and MeSavedView contracts.
 *
 * Theme DOM application is plane-specific; supply it via
 * <MeUIProvider applyThemePreferences={…}>. When omitted, appearance changes
 * save to the runtime but the page reflects them only after the next
 * navigation that reloads the theme stylesheet.
 */
export function PreferencesSection({ active }: { active: boolean }) {
  const { session, applyThemePreferences } = useMeUI();

  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>("system");
  const [themePreset,    setThemePreset]    = useState(DEFAULT_PRESET);
  const [densityCode,    setDensityCode]    = useState<DensityCode>("compact");
  const [languageCode,   setLanguageCode]   = useState("en");
  const [timezone,       setTimezone]       = useState("Asia/Dubai");
  const [dateFormat,     setDateFormat]     = useState("%d/%m/%Y");
  const [weekStart,      setWeekStart]      = useState("1");
  const [homeWs,         setHomeWs]         = useState("FIN");
  const [homeMod,        setHomeMod]        = useState("ACC");
  const [digest,         setDigest]         = useState("daily");

  const [prefsLoaded, setPrefsLoaded]  = useState(false);
  const [dirty,       setDirty]        = useState(false);
  const [saving,      setSaving]       = useState(false);
  const [saveStatus,  setSaveStatus]   = useState<"idle" | "saved" | "error" | "warn">("idle");
  const [saveMessage, setSaveMessage]  = useState<string | null>(null);
  const [homeWorkspaces, setHomeWorkspaces] = useState<NavigationWorkspaceOption[]>([]);
  const [homeModulesByWorkspace, setHomeModulesByWorkspace] = useState<Record<string, NavigationModuleOption[]>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baselineRef = useRef<BaselinePrefs | null>(null);

  function applyThemeFromValues(b: BaselinePrefs) {
    applyThemePreferences?.({
      appearance_mode: b.appearanceMode,
      density_code:    b.densityCode,
      theme_preset:    b.themePreset,
      language_code:   b.languageCode,
    });
  }

  useEffect(() => {
    if (!active || prefsLoaded) return;
    setPrefsLoaded(true);
    bffFetch<MePreferences>("/api/me/preferences")
      .then((d) => {
        const meta         = d.metadata ?? {};
        const nextMode     = d.appearance_mode ?? "system";
        const persistedPreset = String(
          d.theme_preset ?? meta["theme_preset"] ?? DEFAULT_PRESET,
        );
        const nextPreset = getPresetMeta(persistedPreset)?.value ?? DEFAULT_PRESET;
        const nextDens     = d.density_code ?? "compact";
        const nextLang     = d.language_code ?? "en";
        const nextTz       = d.timezone_code ?? "Asia/Dubai";
        const nextDateFmt  = d.date_format ?? "%d/%m/%Y";
        const nextWeek     = d.week_start != null ? String(d.week_start) : "1";
        const nextHomeWs   = d.home_workspace_code ?? "FIN";
        const nextHomeMod  = d.home_module_code ?? "ACC";
        const nextDigest   = d.notification_digest ?? "daily";

        setAppearanceMode(nextMode);
        setThemePreset(nextPreset);
        setDensityCode(nextDens);
        setLanguageCode(nextLang);
        setTimezone(nextTz);
        setDateFormat(nextDateFmt);
        setWeekStart(nextWeek);
        setHomeWs(nextHomeWs);
        setHomeMod(nextHomeMod);
        setDigest(nextDigest);

        const baseline: BaselinePrefs = {
          appearanceMode: nextMode, themePreset: nextPreset, densityCode: nextDens,
          languageCode: nextLang, timezone: nextTz, dateFormat: nextDateFmt,
          weekStart: nextWeek, homeWs: nextHomeWs, homeMod: nextHomeMod, digest: nextDigest,
        };
        baselineRef.current = baseline;
        applyThemeFromValues(baseline);
        setDirty(false);
      })
      .catch(() => { /* use defaults */ });
  }, [active, prefsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) return;
    bffFetch<EntitledModule[]>("/api/relay/platform/modules")
      .then((rows) => {
        const modules: Record<string, NavigationModuleOption[]> = {};
        const labels = new Map<string, string>();
        for (const row of rows.filter((item) => item.status === "active")) {
          const meta = row.metadata ?? {};
          const workspace = typeof meta["workspace_code"] === "string" ? meta["workspace_code"] : "CORE";
          const workspaceLabel = typeof meta["workspace_name"] === "string" ? meta["workspace_name"] : workspace;
          const value = typeof meta["module_code"] === "string" ? meta["module_code"] : row.module_id;
          const label = typeof meta["module_name"] === "string" ? meta["module_name"] : value;
          labels.set(workspace, workspaceLabel);
          (modules[workspace] ??= []).push({ value, label });
        }
        setHomeWorkspaces([...labels].map(([value, label]) => ({ value, label })));
        setHomeModulesByWorkspace(modules);
      })
      .catch(() => {
        setHomeWorkspaces([]);
        setHomeModulesByWorkspace({});
      });
  }, [active]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  async function handleSave() {
    setSaving(true); setSaveStatus("idle"); setSaveMessage(null);
    let autoReset = true;
    try {
      const payload: MePreferencesPatch = {
        appearance_mode:     appearanceMode,
        density_code:        densityCode,
        theme_preset:        themePreset,
        metadata:            { theme_preset: themePreset, notification_digest: digest },
        language_code:       languageCode   || null,
        timezone_code:       timezone       || null,
        date_format:         dateFormat     || null,
        week_start:          weekStart ? Number(weekStart) : null,
        home_workspace_code: homeWs         || null,
        home_module_code:    homeMod        || null,
        notification_digest: digest         || null,
      };
      const result = await bffFetch<MePreferencesPatchResponse>("/api/me/preferences", {
        method: "PATCH",
        body: payload,
      });
      if (!result.ok) {
        setSaveStatus("warn");
        setSaveMessage("No active organization — select one to persist preferences.");
        autoReset = false;
        return;
      }
      const next: BaselinePrefs = {
        appearanceMode, themePreset, densityCode, languageCode,
        timezone, dateFormat, weekStart, homeWs, homeMod, digest,
      };
      baselineRef.current = next;
      applyThemeFromValues(next);
      setSaveStatus("saved"); setDirty(false);
    } catch (err) {
      setSaveStatus("error");
      if (err instanceof BffError) setSaveMessage(err.message);
    } finally {
      setSaving(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (autoReset) {
        saveTimer.current = setTimeout(() => { setSaveStatus("idle"); setSaveMessage(null); }, 3000);
      }
    }
  }

  function handleDiscard() {
    const b = baselineRef.current;
    if (!b) { setDirty(false); return; }
    setAppearanceMode(b.appearanceMode);
    setThemePreset(b.themePreset);
    setDensityCode(b.densityCode);
    setLanguageCode(b.languageCode);
    setTimezone(b.timezone);
    setDateFormat(b.dateFormat);
    setWeekStart(b.weekStart);
    setHomeWs(b.homeWs);
    setHomeMod(b.homeMod);
    setDigest(b.digest);
    applyThemeFromValues(b);
    setDirty(false); setSaveStatus("idle");
  }

  const homeModOpts = homeModulesByWorkspace[homeWs] ?? [];

  const appearanceOptions: { value: AppearanceMode; label: ReactNode; desc: string }[] = [
    { value: "light",  label: <><Sun     className="h-3.5 w-3.5" /> Light</>,  desc: "Always light" },
    { value: "dark",   label: <><Moon    className="h-3.5 w-3.5" /> Dark</>,   desc: "Always dark" },
    { value: "system", label: <><SunMoon className="h-3.5 w-3.5" /> System</>, desc: "Follows OS" },
  ];
  const densityOptions: { value: DensityCode; label: string; desc: string }[] = [
    { value: "compact",     label: "Compact",     desc: "Tight spacing — default" },
    { value: "comfortable", label: "Comfortable", desc: "Balanced spacing" },
    { value: "spacious",    label: "Spacious",    desc: "Relaxed — easier reading" },
  ];

  return (
    <div className="w-full">
      <Banner>
        <strong>Preferences</strong> are saved to your profile and apply across all devices. Changes take effect after saving.
      </Banner>

      <SectionCard
        title="Appearance"
        icon={Palette}
        managedBy={{ manager: "You", source: "master.principal_ui_preference, master.principal_ui_profile" }}
      >
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Color mode</p>
            <SourceChip source="principal_ui_profile" />
          </div>
          <ToggleGroup<AppearanceMode>
            value={appearanceMode}
            onChange={(v) => { setAppearanceMode(v); setDirty(true); }}
            options={appearanceOptions}
          />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Theme preset</p>
            <SourceChip source="principal_ui_profile" />
          </div>
          <div className="space-y-4">
            {PRESET_CATEGORIES.map((cat) => {
              const presets = themePresets.filter((p) => p.category === cat.key);
              if (presets.length === 0) return null;
              return (
                <div key={cat.key}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{cat.label}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {presets.map((p) => (
                      <PresetCard
                        key={p.value}
                        preset={p}
                        active={themePreset === p.value}
                        onSelect={() => { setThemePreset(p.value); setDirty(true); }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Layout Density" icon={Grid3x3} managedBy={{ manager: "You", source: "master.principal_ui_profile" }}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Layout density</p>
          <SourceChip source="principal_ui_profile" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {densityOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setDensityCode(opt.value); setDirty(true); }}
              className={cn(
                "flex flex-1 flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-all",
                densityCode === opt.value ? "border-primary bg-accent" : "border-border hover:border-primary",
              )}
            >
              <span className="text-sm font-medium leading-5 text-foreground">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Regional"
        icon={Globe}
        managedBy={{ manager: "You", source: "master.principal_ui_profile", editPath: "Overrides tenant_profile defaults" }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {([
            { label: "Language", key: "language", value: languageCode, setter: setLanguageCode, source: "principal_ui_profile",
              options: [{ value: "en", label: "English" }, { value: "ar", label: "العربية" }, { value: "fr", label: "Français" }, { value: "de", label: "Deutsch" }, { value: "hi", label: "हिंदी" }, { value: "ta", label: "தமிழ்" }] },
            { label: "Timezone", key: "timezone", value: timezone, setter: setTimezone, source: "principal_ui_profile",
              options: [{ value: "Asia/Dubai", label: "Asia/Dubai (GST +4)" }, { value: "Asia/Kolkata", label: "Asia/Kolkata (IST +5:30)" }, { value: "UTC", label: "UTC +0" }, { value: "Europe/London", label: "Europe/London" }, { value: "America/New_York", label: "America/New York" }, { value: "Asia/Singapore", label: "Asia/Singapore (SGT +8)" }] },
            { label: "Date Format", key: "date_format", value: dateFormat, setter: setDateFormat, source: "tenant_profile",
              options: [{ value: "%d/%m/%Y", label: "DD/MM/YYYY" }, { value: "%m/%d/%Y", label: "MM/DD/YYYY" }, { value: "%Y-%m-%d", label: "YYYY-MM-DD" }, { value: "%d-%b-%Y", label: "DD-Mon-YYYY" }] },
            { label: "Week Starts On", key: "week_start", value: weekStart, setter: setWeekStart, source: "tenant_profile",
              options: [{ value: "0", label: "Sunday" }, { value: "1", label: "Monday" }, { value: "6", label: "Saturday" }] },
          ] as const).map(({ label, key, value, setter, source, options }) => (
            <div key={key}>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium leading-5 text-muted-foreground">{label}</label>
                <SourceChip source={source} />
              </div>
              <Select value={value} onValueChange={(v) => { (setter as (v: string) => void)(v); setDirty(true); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Navigation Defaults"
        icon={Settings}
        managedBy={{ manager: "You", source: "master.principal_ui_profile", editPath: "Controls landing workspace/module on login" }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium leading-5 text-muted-foreground">Home Workspace</label>
              <SourceChip source="principal_ui_profile" />
            </div>
            <Select value={homeWs} onValueChange={(v) => {
              setHomeWs(v);
              const firstMod = homeModulesByWorkspace[v]?.[0]?.value;
              setHomeMod(firstMod ?? "");
              setDirty(true);
            }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {homeWorkspaces.map((ws) => <SelectItem key={ws.value} value={ws.value} className="text-sm">{ws.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">The workspace you land on after login.</p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium leading-5 text-muted-foreground">Home Module</label>
              <SourceChip source="principal_ui_profile" />
            </div>
            <Select value={homeMod} onValueChange={(v) => { setHomeMod(v); setDirty(true); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {homeModOpts.map((m) => <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Default module within the selected workspace.</p>
          </div>
        </div>
        <Separator className="my-3" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Active organization</span>
          <span className="text-sm font-medium text-foreground">{session.activeOrg ? session.activeOrg.replace("--", " / ") : "—"}</span>
        </div>
      </SectionCard>

      <SectionCard
        title="Notification Digest"
        icon={Lock}
        managedBy={{ manager: "You", source: "master.principal_ui_preference", editPath: "preference_code: notification_digest" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">How often to batch email notifications</p>
          <SourceChip source="principal_ui_profile" />
        </div>
        <ToggleGroup<string>
          value={digest}
          onChange={(v) => { setDigest(v); setDirty(true); }}
          options={[
            { value: "realtime", label: "Real-time" },
            { value: "hourly",   label: "Hourly" },
            { value: "daily",    label: "Daily" },
            { value: "weekly",   label: "Weekly" },
          ]}
        />
        <p className="mt-2 text-xs text-muted-foreground">Controls the email digest frequency. In-app notifications are always real-time.</p>
      </SectionCard>

      <SectionCard
        title="Saved Views"
        icon={Lock}
        managedBy={{ manager: "You", source: "master.saved_view", editPath: "/saved-views" }}
      >
        <SavedViewsSummary fetcher={bffFetch} />
      </SectionCard>

      {(dirty || saveStatus !== "idle") && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-t-xl border-t border-border bg-card px-4 py-3 shadow-lg">
          <span className="text-sm leading-5">
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1.5 text-success">
                <Check className="h-3.5 w-3.5 shrink-0" /> Saved successfully
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1.5 text-destructive">
                <XCircle className="h-3.5 w-3.5 shrink-0" /> {saveMessage ?? "Failed to save — please try again"}
              </span>
            )}
            {saveStatus === "warn" && (
              <span className="flex items-center gap-1.5 text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {saveMessage ?? "Preferences not saved"}
              </span>
            )}
            {saveStatus === "idle" && dirty && (
              <span className="text-muted-foreground">You have unsaved changes</span>
            )}
          </span>
          {dirty && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDiscard} disabled={saving}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Discard
              </Button>
              <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
