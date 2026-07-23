"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { PageFrame, SurfaceHeader } from "@athyper/surface-kit";
import {
  Badge, Button,
  overlayScrimVariants,
} from "@athyper/ui/primitives";
import { MeUIProvider } from "@athyper/me-ui";
import { bffFetch } from "@/lib/bff-fetch";
import { applyThemePreferences } from "@/lib/preferences/theme-dom";
import { useShellPublicSession } from "../AppShellClient";

import { ProfileSection       } from "./_sections/profile-section";
import { IdentitySection      } from "./_sections/identity-section";
import { MfaSection           } from "./_sections/mfa-section";
import { PreferencesSection   } from "./_sections/preferences-section";
import { NotificationsSection } from "./_sections/notifications-section";
import { TenantSection        } from "./_sections/tenant-section";
import { DiagnosticsSection   } from "./_sections/diagnostics-section";
import { DocsSection          } from "./_sections/docs-section";
import { FeedbackSection      } from "./_sections/feedback-section";

// ─── Navigation ───────────────────────────────────────────────────────────────

type SectionId =
  | "profile" | "identity" | "security" | "preferences"
  | "notifications" | "tenant" | "diagnostics" | "docs" | "feedback";

const NAV_ITEMS: { id: SectionId; label: string; adminOnly?: boolean }[] = [
  { id: "profile",       label: "Profile" },
  { id: "identity",      label: "Identity & Access" },
  { id: "security",      label: "Security & MFA" },
  { id: "preferences",   label: "Preferences" },
  { id: "notifications", label: "Notifications" },
  { id: "tenant",        label: "Tenant Administration", adminOnly: true },
  { id: "diagnostics",   label: "Diagnostics", adminOnly: true },
  { id: "docs",          label: "Documentation" },
  { id: "feedback",      label: "Feedback" },
];

const VALID_SECTIONS = NAV_ITEMS.map((i) => i.id);

// ─── SettingsContent ──────────────────────────────────────────────────────────

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shellSession = useShellPublicSession();
  const bff = {
    ...shellSession,
    email: shellSession.email ?? "—",
  };
  const raw = (searchParams.get("section") ?? "profile") as SectionId;

  const [active,     setActive]     = useState<SectionId>(VALID_SECTIONS.includes(raw) ? raw : "profile");
  const [showLogout, setShowLogout] = useState(false);

  const activated = useRef<Set<SectionId>>(new Set([active]));
  const initials = shellSession.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const [tenantCode, entityCode] = (shellSession.activeOrg ?? "").split("--");
  const tenantLabel = entityCode || tenantCode || "—";

  useEffect(() => {
    const next = VALID_SECTIONS.includes(raw) ? raw : "profile";
    activated.current.add(next);
    setActive(next);
  }, [raw]);

  function go(id: SectionId) {
    activated.current.add(id);
    setActive(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", id);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  }

  return (
    <MeUIProvider bffFetch={bffFetch} session={bff} applyThemePreferences={applyThemePreferences}>
    <PageFrame>
      <SurfaceHeader
        kind="record"
        eyebrow="Settings"
        title={shellSession.displayName}
        subtitle={bff.email}
        leadingVariant="plain"
        leading={
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-medium text-primary-foreground shadow-sm">
            {initials}
          </span>
        }
        status={<Badge variant="success">Active</Badge>}
        facts={[
          { key: "tenant", label: "Tenant:", value: tenantLabel },
          { key: "workspace", label: "Workspace:", value: shellSession.activeWorkbench ?? "user" },
        ]}
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowLogout(true)}>
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </Button>
        }
        navigation={NAV_ITEMS.map((item) => ({
          key: item.id,
          label: item.label,
          href: `/settings?section=${item.id}`,
          active: active === item.id,
          badge: item.adminOnly
            ? <Badge variant="secondary" className="text-xs">Admin</Badge>
            : undefined,
          onSelect: () => go(item.id),
        }))}
        navigationLabel="Settings sections"
        className="mb-4"
      />
      <div className="min-w-0">
          {/* Sections — keep-alive on first activation */}
          <div className={active === "profile"       ? "block" : "hidden"}>
            {activated.current.has("profile")       && <ProfileSection       active={active === "profile"} showSummary={false} />}
          </div>
          <div className={active === "identity"      ? "block" : "hidden"}>
            {activated.current.has("identity")      && <IdentitySection      active={active === "identity"} />}
          </div>
          <div className={active === "security"      ? "block" : "hidden"}>
            {activated.current.has("security")      && <MfaSection           active={active === "security"} />}
          </div>
          <div className={active === "preferences"   ? "block" : "hidden"}>
            {activated.current.has("preferences")   && <PreferencesSection   active={active === "preferences"} />}
          </div>
          <div className={active === "notifications" ? "block" : "hidden"}>
            {activated.current.has("notifications") && <NotificationsSection active={active === "notifications"} />}
          </div>
          <div className={active === "tenant"        ? "block" : "hidden"}>
            {activated.current.has("tenant")        && <TenantSection        active={active === "tenant"} />}
          </div>
          <div className={active === "diagnostics"   ? "block" : "hidden"}>
            {activated.current.has("diagnostics")   && <DiagnosticsSection   active={active === "diagnostics"} />}
          </div>
          <div className={active === "docs"          ? "block" : "hidden"}>
            {activated.current.has("docs")          && <DocsSection />}
          </div>
          <div className={active === "feedback"      ? "block" : "hidden"}>
            {activated.current.has("feedback")      && <FeedbackSection />}
          </div>
      </div>

      {/* ── Sign-out confirmation ── */}
      {showLogout && (
        <div
          className={cn("fixed inset-0 z-modal flex items-center justify-center", overlayScrimVariants({ tone: "command" }))}
          onClick={() => setShowLogout(false)}
        >
          <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-medium text-foreground">Sign out?</h3>
            <p className="mb-5 text-sm text-muted-foreground">
              You will be signed out of this session. Any unsaved changes will be lost.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowLogout(false)}>Cancel</Button>
              <a href="/logout">
                <Button variant="destructive" size="sm">Sign out</Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
    </MeUIProvider>
  );
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="h-full animate-pulse bg-muted/20" />}>
      <SettingsContent />
    </Suspense>
  );
}
