"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity, Bell, Building2, FileText, LogOut, MessageSquare,
  Palette, ShieldCheck, ShieldAlert, User,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { PageFrame } from "@athyper/surface-kit";
import {
  Badge, Button,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator, overlayScrimVariants,
} from "@athyper/ui/primitives";

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

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "profile",       label: "Profile",              icon: User        },
  { id: "identity",      label: "Identity & Access",    icon: ShieldCheck },
  { id: "security",      label: "Security & MFA",       icon: ShieldAlert },
  { id: "preferences",   label: "Preferences",          icon: Palette     },
  { id: "notifications", label: "Notifications",        icon: Bell        },
  { id: "tenant",        label: "Tenant Administration",icon: Building2,  adminOnly: true },
  { id: "diagnostics",   label: "Diagnostics",          icon: Activity,   adminOnly: true },
  { id: "docs",          label: "Documentation",        icon: FileText    },
  { id: "feedback",      label: "Feedback",             icon: MessageSquare },
];

const SECTION_TITLES: Record<SectionId, string> = {
  profile:       "Profile",
  identity:      "Identity & Access",
  security:      "Security & MFA",
  preferences:   "Preferences",
  notifications: "Notifications",
  tenant:        "Tenant Administration",
  diagnostics:   "Diagnostics",
  docs:          "Documentation",
  feedback:      "Feedback",
};

const VALID_SECTIONS = NAV_ITEMS.map((i) => i.id);

// ─── SettingsContent ──────────────────────────────────────────────────────────

function SettingsContent() {
  const searchParams = useSearchParams();
  const raw = (searchParams.get("section") ?? "profile") as SectionId;

  const [active,     setActive]     = useState<SectionId>(VALID_SECTIONS.includes(raw) ? raw : "profile");
  const [showLogout, setShowLogout] = useState(false);

  const activated = useRef<Set<SectionId>>(new Set([active]));

  function go(id: SectionId) {
    activated.current.add(id);
    setActive(id);
  }

  return (
    <PageFrame title="Settings" description="Manage your profile, security, and preferences">
      <div className="flex gap-0">

        {/* ── Sidebar (desktop ≥ lg) ── */}
        <aside className="hidden w-[220px] shrink-0 pr-8 lg:block">
          <nav className="sticky top-8 flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm leading-5 transition-colors",
                    isActive
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  {item.adminOnly && <Badge variant="secondary" className="shrink-0 text-xs">Admin</Badge>}
                </button>
              );
            })}

            <Separator className="my-2" />

            <button
              type="button"
              onClick={() => setShowLogout(true)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm leading-5 text-destructive transition-colors hover:bg-muted"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="text-left">Sign out</span>
            </button>
          </nav>
        </aside>

        {/* ── Content pane ── */}
        <div className="min-w-0 flex-1">
          {/* Mobile nav */}
          <div className="mb-4 lg:hidden">
            <Select value={active} onValueChange={(v) => go(v as SectionId)}>
              <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NAV_ITEMS.map((item) => (
                  <SelectItem key={item.id} value={item.id} className="text-sm">{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <h2 className="mb-4 text-sm font-semibold text-foreground">{SECTION_TITLES[active]}</h2>

          {/* Sections — keep-alive on first activation */}
          <div className={active === "profile"       ? "block" : "hidden"}>
            {activated.current.has("profile")       && <ProfileSection       active={active === "profile"} />}
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
