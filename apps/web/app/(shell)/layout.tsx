import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  getServerSession,
  toShellSessionProps,
  parseOrgAlias,
} from "@/lib/server/get-server-session";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { EntitySelector } from "@/components/navigation/EntitySelector";
import { WorkbenchToggle } from "@/components/navigation/WorkbenchToggle";
import { DelegationBanner } from "@/components/delegation/DelegationBanner";
import { DelegationIndicator } from "@/components/delegation/DelegationIndicator";
import { AppTopbar } from "@/components/shell/AppTopbar";
import { AppShellLayout } from "@/components/shell/AppShellLayout";
import { RuntimeProvider } from "@/components/providers/RuntimeProvider";
import { UserMenu } from "@/components/shell/UserMenu";
import { SessionErrorBanner } from "@/components/shell/SessionErrorBanner";

/**
 * Authenticated shell layout — Server Component
 *
 * Reads the BFF session from Redis and passes it to the client-side
 * SessionProvider. All shell chrome is hydrated with real session data
 * from the first render.
 *
 * Shell variant resolution (admin | partner | user):
 *   Resolved here from session.role and session.moduleGrants.
 *   NOT expressed as separate URL routes — the same URL space serves all
 *   variants. AppShellLayout reads the shell variant from ShellSessionContext
 *   and adjusts chrome (nav rail icons, context panel sections, topbar actions)
 *   accordingly. Route groups in this directory are purely for layout
 *   inheritance and code organisation, never for variant separation.
 *
 * Route group structure under (shell)/:
 *   (core)             — Universal pages: /dashboard, /dashboards, /inbox, /notifications,
 *                        /saved-views, /settings
 *   (workspace-home)   — Domain launcher pages: /finance, /supply-chain, /people, etc.
 *   (workbench)        — Immersive analytics workbenches: /finance/coa, /finance/gl,
 *                        /finance/admin, /finance/close, /finance/reports, /finance/views/[viewCode]
 *   (runtime)          — Entity runtime: /app/[entity], /app/[entity]/[id], etc.
 *                        Unified for master (family="master") and document (family="document")
 *                        entities — behavior driven by entity metadata, not the URL.
 *   (platform-runtime) — Module/core redirectors: /module/[code], /core/[code]
 *   (admin)            — Admin-only setup and tooling: /setup/tenant, /setup/metadata,
 *                        /setup/metadata/modules, /setup/blueprints, /metadata-studio
 *
 * Component tree (v2 — spec-aligned rail + panel layout):
 *   ShellRouteLayout (Server Component)
 *   └─ SessionProvider (Client, receives initialSession prop)
 *      └─ RuntimeProvider (Client, registerDefaults + setClients on activeOrg change)
 *         └─ AppShellLayout (Client)
 *            ├─ ShellLayout
 *            │  ├─ Topbar ← AppTopbar (brand · EntitySelector · ScopeChips · WorkbenchToggle · UserMenu)
 *            │  ├─ NavRail ← AppNavRail (workspace icons · inbox badge)
 *            │  ├─ ContextPanel ← AppContextPanel (module list · pages)
 *            │  └─ {children}
 *            └─ CommandPalette + NotifPanel (portaled)
 */
export default async function ShellRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const initialSession = toShellSessionProps(session);

  return (
    <SessionProvider initialSession={initialSession}>
      <RuntimeProvider>
        <AppShellLayout
          topbar={
            <AppTopbar
              tenantSlot={<EntitySelector />}
              workbenchToggle={<WorkbenchToggle />}
              delegationIndicator={<DelegationIndicator />}
              userSlot={<UserMenu />}
            />
          }
          banner={
            <>
              <SessionErrorBanner />
              <DelegationBanner />
            </>
          }
        >
          {children}
        </AppShellLayout>
      </RuntimeProvider>
    </SessionProvider>
  );
}
