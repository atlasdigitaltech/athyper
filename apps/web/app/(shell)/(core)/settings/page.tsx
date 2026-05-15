"use client";

/**
 * /settings — User & Tenant Settings
 *
 * Typography scale (Geist Sans, from tailwind.config):
 *   text-2xs = 10px  — badges, table headers, meta/note lines
 *   text-xs  = 12px  — field labels, table cells, nav items, hints
 *   text-sm  = 13px  — field values, card content, card titles
 *   text-base= 14px  — section h2, hero name
 *
 * Colors — only semantic theme tokens (no hardcoded values):
 *   text-foreground / text-muted-foreground / text-success / text-destructive
 *   bg-accent / bg-muted / bg-secondary / bg-card
 */

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity, Bell, Building2, FileText, LogOut, MessageSquare,
  Palette, ShieldCheck, ShieldAlert, User,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { PageFrame } from "@athyper/ui/layout";
import {
  Badge, Button,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator, overlayScrimVariants,
} from "@athyper/ui/primitives";

// ─── Section imports ──────────────────────────────────────────────────────────

import { useIntl } from "@/components/providers/IntlProvider";
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
  | "profile"
  | "identity"
  | "security"
  | "preferences"
  | "notifications"
  | "tenant"
  | "diagnostics"
  | "docs"
  | "feedback";

const NAV_ITEMS: {
  id: SectionId;
  labelId: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}[] = [
  { id: "profile",       labelId: "settings.nav.profile",       icon: User        },
  { id: "identity",      labelId: "settings.nav.identity",      icon: ShieldCheck },
  { id: "security",      labelId: "settings.nav.security",      icon: ShieldAlert },
  { id: "preferences",   labelId: "settings.nav.preferences",   icon: Palette     },
  { id: "notifications", labelId: "settings.nav.notifications", icon: Bell        },
  { id: "tenant",        labelId: "settings.nav.tenant",        icon: Building2,  adminOnly: true },
  { id: "diagnostics",   labelId: "settings.nav.diagnostics",   icon: Activity,   adminOnly: true },
  { id: "docs",          labelId: "settings.nav.docs",          icon: FileText    },
  { id: "feedback",      labelId: "settings.nav.feedback",      icon: MessageSquare },
];

const SECTION_TITLE_IDS: Record<SectionId, string> = {
  profile:       "settings.nav.profile",
  identity:      "settings.nav.identity",
  security:      "settings.nav.security",
  preferences:   "settings.nav.preferences",
  notifications: "settings.section.notifications.title",
  tenant:        "settings.nav.tenant",
  diagnostics:   "settings.nav.diagnostics",
  docs:          "settings.nav.docs",
  feedback:      "settings.nav.feedback",
};

const VALID_SECTIONS = NAV_ITEMS.map((i) => i.id);

// ─── SettingsContent ──────────────────────────────────────────────────────────

function SettingsContent() {
  const searchParams = useSearchParams();
  const { formatMessage } = useIntl();
  const raw = (searchParams.get("section") ?? "profile") as SectionId;

  const [active,     setActive]     = useState<SectionId>(VALID_SECTIONS.includes(raw) ? raw : "profile");
  const [showLogout, setShowLogout] = useState(false);

  // Keep sections alive — don't unmount on tab switch, just hide
  const activated = useRef<Set<SectionId>>(new Set([active]));

  function go(id: SectionId) {
    activated.current.add(id);
    setActive(id);
  }

  return (
    <PageFrame title={formatMessage({ id: "settings.page.title" }) as string} description={formatMessage({ id: "settings.page.description" }) as string}>
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
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors",
                    isActive
                      ? "bg-accent font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">{formatMessage({ id: item.labelId })}</span>
                  {item.adminOnly && (
                    <Badge variant="secondary" className="shrink-0 text-2xs">{formatMessage({ id: "settings.badge.admin" })}</Badge>
                  )}
                </button>
              );
            })}

            <Separator className="my-2" />

            <button
              type="button"
              onClick={() => setShowLogout(true)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-destructive transition-colors hover:bg-muted"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span className="text-left">{formatMessage({ id: "settings.logout.label" })}</span>
            </button>
          </nav>
        </aside>

        {/* ── Content pane ── */}
        <div className="min-w-0 flex-1">
          {/* Mobile nav */}
          <div className="mb-4 lg:hidden">
            <Select value={active} onValueChange={(v) => go(v as SectionId)}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NAV_ITEMS.map((item) => (
                  <SelectItem key={item.id} value={item.id} className="text-sm">
                    {formatMessage({ id: item.labelId })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Section heading */}
          <h2 className="mb-4 text-base font-semibold text-foreground">
            {formatMessage({ id: SECTION_TITLE_IDS[active] })}
          </h2>

          {/* Sections — rendered on first activation, hidden (not unmounted) after */}
          <div className={active === "profile"     ? "block" : "hidden"}>
            {activated.current.has("profile")     && <ProfileSection     active={active === "profile"} />}
          </div>
          <div className={active === "identity"    ? "block" : "hidden"}>
            {activated.current.has("identity")    && <IdentitySection    active={active === "identity"} />}
          </div>
          <div className={active === "security"    ? "block" : "hidden"}>
            {activated.current.has("security")    && <MfaSection         active={active === "security"} />}
          </div>
          <div className={active === "preferences" ? "block" : "hidden"}>
            {activated.current.has("preferences") && <PreferencesSection active={active === "preferences"} />}
          </div>
          <div className={active === "notifications" ? "block" : "hidden"}>
            {activated.current.has("notifications") && <NotificationsSection active={active === "notifications"} />}
          </div>
          <div className={active === "tenant"      ? "block" : "hidden"}>
            {activated.current.has("tenant")      && <TenantSection      active={active === "tenant"} />}
          </div>
          <div className={active === "diagnostics" ? "block" : "hidden"}>
            {activated.current.has("diagnostics") && <DiagnosticsSection active={active === "diagnostics"} />}
          </div>
          <div className={active === "docs"        ? "block" : "hidden"}>
            {activated.current.has("docs")        && <DocsSection />}
          </div>
          <div className={active === "feedback"    ? "block" : "hidden"}>
            {activated.current.has("feedback")    && <FeedbackSection />}
          </div>
        </div>
      </div>

      {/* ── Log-out confirmation dialog ── */}
      {showLogout && (
        <div
          className={cn(
            "fixed inset-0 z-modal flex items-center justify-center",
            overlayScrimVariants({ tone: "command" }),
          )}
          onClick={() => setShowLogout(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-foreground">{formatMessage({ id: "settings.logout.confirmTitle" })}</h3>
            <p className="mb-5 text-sm text-muted-foreground">
              {formatMessage({ id: "settings.logout.confirmMessage" })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowLogout(false)}>
                {formatMessage({ id: "settings.logout.cancel" })}
              </Button>
              <a href="/logout">
                <Button variant="destructive" size="sm">{formatMessage({ id: "settings.logout.label" })}</Button>
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
