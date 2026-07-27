"use client";

import { useEffect, useMemo, useState, type ElementType, type ReactNode } from "react";
import { Building2, Network, Palette, ShieldCheck, User } from "lucide-react";
import type {
  EffectiveSetting,
  EffectiveSettingsResponse,
  SettingsScopeKind,
  SettingsScopeRef,
} from "@athyper/api-contracts/me";
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { emitSurfaceEvent } from "@athyper/runtime-shared/observability";
import { useMeUI } from "./me-ui-provider";
import { IdentitySection } from "./sections/identity-section";
import { PreferencesSection } from "./sections/preferences-section";
import { ProfileSection } from "./sections/profile-section";
import { TenantContextSection } from "./sections/tenant-context-section";

export type SettingsPlane = "admin" | "neon" | "mesh";

export interface SettingsSectionRegistration {
  id: string;
  label: string;
  icon: ElementType;
  scopes: readonly SettingsScopeKind[];
  planes?: readonly SettingsPlane[];
  requiredPermission?: string;
  sensitive?: boolean;
  render?: (active: boolean) => ReactNode;
}

export interface SettingsWorkspaceProps {
  plane: SettingsPlane;
  path?: readonly string[];
  permissions?: readonly string[];
  scopes?: readonly SettingsScopeRef[];
  navigate: (href: string) => void;
  extras?: readonly SettingsSectionRegistration[];
}

const PERSONAL_SCOPE: SettingsScopeRef = { kind: "personal", id: "me", label: "Personal" };

export const SETTINGS_SCOPE_MATRIX: Record<SettingsPlane, readonly SettingsScopeKind[]> = {
  neon: ["personal", "tenant", "organization", "company", "purchasing-org"],
  admin: ["personal", "tenant", "platform"],
  mesh: ["personal", "network-account"],
};

export interface SettingsSessionAccess {
  activeOrg: string | null;
  supportMode?: boolean;
  organizations?: Record<string, { tenantId?: string; roles?: readonly string[] }>;
}

export function deriveSettingsAccess(plane: SettingsPlane, session: SettingsSessionAccess): {
  permissions: string[];
  scopes: SettingsScopeRef[];
} {
  const scopes: SettingsScopeRef[] = [PERSONAL_SCOPE];
  const membership = session.activeOrg ? session.organizations?.[session.activeOrg] : undefined;
  const roles = new Set(membership?.roles ?? []);
  const tenantAdmin = roles.has("tenant-admin");
  const platformAdmin = roles.has("platform-admin");
  const permissions: string[] = [];

  if (tenantAdmin || platformAdmin) {
    permissions.push(
      "settings.read",
      "settings.organization.read",
      "settings.purchasing-org.read",
      "settings.network-account.read",
      "settings.diagnostics.read",
    );
  }
  if (platformAdmin) permissions.push("settings.*");
  if (platformAdmin && session.supportMode) permissions.push("settings.platform.support");

  if (membership?.tenantId && (tenantAdmin || platformAdmin)) {
    scopes.push({ kind: "tenant", id: membership.tenantId, label: "Tenant" });
  }
  if (plane === "neon" && session.activeOrg && (tenantAdmin || platformAdmin)) {
    scopes.push({ kind: "organization", id: session.activeOrg, label: "Organization / legal entity" });
  }
  if (plane === "mesh" && session.activeOrg) {
    scopes.push({ kind: "network-account", id: session.activeOrg, label: "Network account" });
  }
  if (plane === "admin" && platformAdmin && session.supportMode) {
    scopes.push({ kind: "platform", id: "platform", label: "Platform support" });
  }

  return { permissions, scopes };
}

const REGISTRY: readonly SettingsSectionRegistration[] = [
  { id: "profile", label: "Profile", icon: User, scopes: ["personal"], render: (active) => <ProfileSection active={active} /> },
  { id: "identity", label: "Identity & access", icon: ShieldCheck, scopes: ["personal"], render: (active) => <IdentitySection active={active} /> },
  { id: "preferences", label: "Preferences", icon: Palette, scopes: ["personal"], render: (active) => <PreferencesSection active={active} /> },
  { id: "context", label: "Tenant context", icon: Building2, scopes: ["personal"], render: (active) => <TenantContextSection active={active} /> },
  { id: "general", label: "General", icon: Building2, scopes: ["tenant", "organization", "company", "platform"], requiredPermission: "settings.read" },
  { id: "purchasing", label: "Purchasing", icon: Building2, scopes: ["organization"], planes: ["neon"], requiredPermission: "settings.organization.read" },
  { id: "documents", label: "Documents", icon: Building2, scopes: ["purchasing-org"], planes: ["neon"], requiredPermission: "settings.purchasing-org.read" },
  { id: "delivery", label: "Delivery", icon: Network, scopes: ["network-account"], planes: ["mesh"], requiredPermission: "settings.network-account.read" },
  { id: "support", label: "Support controls", icon: ShieldCheck, scopes: ["platform"], planes: ["admin"], requiredPermission: "settings.platform.support" },
];

export function parseSettingsPath(path: readonly string[] | undefined): { scope: SettingsScopeRef; sectionId: string } {
  if (!path?.length) return { scope: PERSONAL_SCOPE, sectionId: "profile" };
  if (path[0] === "personal") return { scope: PERSONAL_SCOPE, sectionId: path[1] ?? "profile" };
  const kind = path[0] as SettingsScopeKind;
  return {
    scope: { kind, id: path[1] ?? "", label: path[1] ?? kind },
    sectionId: path[2] ?? "general",
  };
}

export function settingsHref(scope: SettingsScopeRef, sectionId: string): string {
  return scope.kind === "personal"
    ? `/settings/personal/${encodeURIComponent(sectionId)}`
    : `/settings/${encodeURIComponent(scope.kind)}/${encodeURIComponent(scope.id)}/${encodeURIComponent(sectionId)}`;
}

export function legacySettingsHref(section: string | null, plane: SettingsPlane): string {
  const aliases: Record<string, string> = {
    profile: "profile",
    identity: "identity",
    security: "identity",
    preferences: "preferences",
    notifications: "notifications",
    "tenant-context": "context",
  };
  const sectionId = section ? aliases[section] : undefined;
  if (sectionId) return `/settings/personal/${sectionId}`;
  return plane === "mesh" ? "/settings/personal/profile" : "/settings/personal/profile";
}

function canSee(section: SettingsSectionRegistration, plane: SettingsPlane, scope: SettingsScopeRef, permissions: Set<string>) {
  if (!SETTINGS_SCOPE_MATRIX[plane].includes(scope.kind)) return false;
  if (!section.scopes.includes(scope.kind)) return false;
  if (section.planes && !section.planes.includes(plane)) return false;
  if (!section.requiredPermission) return true;
  return permissions.has(section.requiredPermission) || permissions.has("settings.*");
}

function ScopedSettingEditor({
  plane,
  scope,
  section,
}: {
  plane: SettingsPlane;
  scope: SettingsScopeRef;
  section: SettingsSectionRegistration;
}) {
  const { bffFetch } = useMeUI();
  const [response, setResponse] = useState<EffectiveSettingsResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error" | "conflict">("loading");

  const endpoint = `/api/me/settings/effective?scopeKind=${encodeURIComponent(scope.kind)}&scopeId=${encodeURIComponent(scope.id)}&section=${encodeURIComponent(section.id)}`;
  useEffect(() => {
    setStatus("loading");
    bffFetch<EffectiveSettingsResponse>(endpoint)
      .then((data) => {
        setResponse(data);
        setDraft(Object.fromEntries(data.settings.map((setting) => [setting.key, setting.effectiveValue])));
        setDirty(false);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [bffFetch, endpoint]);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  async function save() {
    if (!response) return;
    setStatus("saving");
    const startedAt = performance.now();
    try {
      const next = await bffFetch<EffectiveSettingsResponse>(endpoint, {
        method: "PATCH",
        headers: {
          "If-Match": response.etag,
          ...(section.sensitive ? { "X-Step-Up-Required": "mfa" } : {}),
        },
        body: { values: draft },
      });
      setResponse(next);
      setDirty(false);
      setStatus("ready");
      emitSettingChanged(plane, scope, section.id, performance.now() - startedAt, "success");
    } catch (reason) {
      const code = typeof reason === "object" && reason && "status" in reason ? Number(reason.status) : 0;
      const conflict = code === 409 || code === 412;
      setStatus(conflict ? "conflict" : "error");
      emitSettingChanged(
        plane,
        scope,
        section.id,
        performance.now() - startedAt,
        conflict ? "conflict" : code === 401 || code === 403 ? "denied" : "failure",
      );
    }
  }

  if (status === "loading") return <p className="text-sm text-muted-foreground">Loading effective settings…</p>;
  if (!response) return <div role="alert" className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">Settings could not be loaded.</div>;

  return (
    <div className="space-y-4">
      {response.settings.map((setting: EffectiveSetting) => (
        <label key={setting.key} className="block rounded-lg border border-border p-4">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {setting.key}
            {setting.inherited && <Badge variant="outline" className="text-xs">Inherited from {setting.sourceScope.kind}</Badge>}
            {!setting.overrideAllowed && <Badge variant="secondary" className="text-xs">Managed</Badge>}
          </span>
          <input
            className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
            value={typeof draft[setting.key] === "string" ? String(draft[setting.key]) : JSON.stringify(draft[setting.key] ?? "")}
            disabled={!setting.overrideAllowed || !setting.editableScope}
            onChange={(event) => { setDraft((current) => ({ ...current, [setting.key]: event.target.value })); setDirty(true); }}
          />
          <span className="mt-2 block text-xs text-muted-foreground">
            Version {setting.version}{setting.updatedBy ? ` · Updated by ${setting.updatedBy}` : ""}
          </span>
        </label>
      ))}
      {response.historyHref && <a className="text-sm text-primary hover:underline" href={response.historyHref}>View change history</a>}
      {(dirty || status === "conflict" || status === "error") && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-lg">
          <p role="status" className="text-sm text-muted-foreground">
            {status === "conflict" ? "These settings changed elsewhere. Reload before saving." : status === "error" ? "Save failed." : "You have unsaved changes."}
          </p>
          <Button onClick={() => void save()} disabled={!dirty || status === "saving" || status === "conflict"}>
            {status === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SettingsWorkspace({ plane, path, permissions = [], scopes = [PERSONAL_SCOPE], navigate, extras = [] }: SettingsWorkspaceProps) {
  const requested = parseSettingsPath(path);
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const availableScopes = useMemo(
    () => scopes.filter((scope) => SETTINGS_SCOPE_MATRIX[plane].includes(scope.kind)),
    [plane, scopes],
  );
  const matchedScope = availableScopes.find((scope) => scope.kind === requested.scope.kind && scope.id === requested.scope.id);
  const scopeDenied = path?.length ? !matchedScope : false;
  const activeScope = matchedScope ?? availableScopes[0] ?? PERSONAL_SCOPE;
  const sections = [...REGISTRY, ...extras].filter((section) => canSee(section, plane, activeScope, permissionSet));
  const active = sections.find((section) => section.id === requested.sectionId) ?? sections[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside>
        <Select value={`${activeScope.kind}:${activeScope.id}`} onValueChange={(value) => {
          const scope = availableScopes.find((candidate) => `${candidate.kind}:${candidate.id}` === value);
          if (scope) navigate(settingsHref(scope, scope.kind === "personal" ? "profile" : "general"));
        }}>
          <SelectTrigger aria-label="Settings scope"><SelectValue /></SelectTrigger>
          <SelectContent>{availableScopes.map((scope) => <SelectItem key={`${scope.kind}:${scope.id}`} value={`${scope.kind}:${scope.id}`}>{scope.label ?? scope.id}</SelectItem>)}</SelectContent>
        </Select>
        <nav aria-label="Settings sections" className="mt-3 space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button key={section.id} type="button" onClick={() => navigate(settingsHref(activeScope, section.id))}
                className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm", active?.id === section.id ? "bg-accent font-medium" : "text-muted-foreground hover:bg-muted")}>
                <Icon className="h-4 w-4" aria-hidden />{section.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0" aria-labelledby="settings-section-title">
        {scopeDenied ? (
          <div role="alert" className="rounded-lg border border-destructive/40 p-5">
            <h1 id="settings-section-title" className="text-lg font-semibold">Settings scope unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">This scope is not present in your capability-filtered settings grants.</p>
          </div>
        ) : (
          <>
        <h1 id="settings-section-title" className="mb-1 text-xl font-semibold">{active?.label ?? "Settings"}</h1>
        <p className="mb-5 text-sm text-muted-foreground">{activeScope.label ?? activeScope.id} · {activeScope.kind}</p>
        {active?.render ? active.render(true) : active ? <ScopedSettingEditor plane={plane} scope={activeScope} section={active} /> : (
          <div role="alert" className="rounded-md border p-4 text-sm">No settings sections are available for this scope.</div>
        )}
          </>
        )}
      </section>
    </div>
  );
}

function emitSettingChanged(
  plane: SettingsPlane,
  scope: SettingsScopeRef,
  sectionId: string,
  durationMs: number,
  result: "success" | "failure" | "denied" | "conflict",
): void {
  const scopeType = scope.kind === "network-account"
    ? "network_account"
    : scope.kind === "purchasing-org"
      ? "purchasing_org"
      : scope.kind === "organization" || scope.kind === "company"
        ? "organization"
        : scope.kind === "platform"
          ? "platform"
          : "tenant";
  emitSurfaceEvent({
    name: "setting_changed",
    plane,
    scopeType,
    scopeId: scope.kind === "personal" ? undefined : scope.id,
    surfaceCode: `settings.${sectionId}`,
    route: settingsHref(scope, sectionId),
    durationMs,
    result,
  });
}
