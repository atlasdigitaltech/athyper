"use client";

/**
 * AppContextPanel — live-data wrapper around ContextPanel.
 *
 * Given an activeWorkspaceKey:
 *   - "core" → renders Core ContextPanel with grouped core modules
 *   - <workspace key> → finds the matching workspace group and renders its modules
 *   - null → renders nothing
 *
 * Derives module pages from MODULE_PAGES static map for the currently active module.
 * Page links are marked active by comparing against the current pathname.
 *
 * Accepts accentColor from AppShellLayout (workbench theme) and forwards to ContextPanel.
 */

import { useRouter, usePathname } from "next/navigation";
import { Inbox, CheckCircle2 } from "lucide-react";
import { ContextPanel } from "@athyper/shell";
import { deriveNavTree, deriveCoreModules, CORE_GROUPS, MODULE_PAGES } from "@athyper/navigation";
import { useShellSession } from "@/components/providers/SessionProvider";
import { getWorkbenchLabel } from "@/lib/auth/workbench-config";

export interface AppContextPanelProps {
  activeWorkspaceKey: string | null;
  onClose?: () => void;
  inboxCount?: number;
  /** Workbench accent hex forwarded from AppShellLayout. */
  accentColor?: string;
}

export function AppContextPanel({
  activeWorkspaceKey,
  onClose,
  inboxCount = 0,
  accentColor,
}: AppContextPanelProps) {
  const { runtime, bff } = useShellSession();
  const router = useRouter();
  const pathname = usePathname();

  if (!runtime || !activeWorkspaceKey) return null;

  // Build nav data
  const navTree = deriveNavTree(runtime.modules);
  const platformItems = deriveCoreModules(runtime.platform, runtime.modules);
  const workbenchLabel = bff.activeWorkbench
    ? getWorkbenchLabel(bff.activeWorkbench)
    : "";

  // Active module from pathname: /module/{code} or /platform/{code}
  const pathParts = pathname.split("/");
  const activeModuleCode =
    (pathParts[1] === "module" || pathParts[1] === "core")
      ? (pathParts[2]?.toUpperCase() ?? null)
      : null;

  // Page sub-links for the active module
  const modulePages = activeModuleCode
    ? (MODULE_PAGES[activeModuleCode] ?? []).map((p) => ({
        key: p.key,
        label: p.label,
        href: p.withModuleParam ? `${p.href}?module=${activeModuleCode}` : p.href,
        active:
          pathname === p.href ||
          pathname.startsWith(p.href + "/") ||
          (p.withModuleParam && pathname.startsWith(p.href)),
      }))
    : [];

  // ── Core panel ────────────────────────────────────────────────────────────
  if (activeWorkspaceKey === "core") {
    const coreGroups = CORE_GROUPS
      .map((g) => ({
        label: g.label,
        modules: platformItems.filter((m) => g.codes.includes(m.code)),
      }))
      .filter((g) => g.modules.length > 0);

    return (
      <ContextPanel
        title="Core"
        subtitle="Cross-cutting modules · workspace_id = NULL"
        modules={platformItems}
        platformGroups={coreGroups}
        activeModuleCode={activeModuleCode}
        isPlatform
        onModuleSelect={(code) => router.push(`/core/${code.toLowerCase()}`)}
        onClose={onClose}
      />
    );
  }

  // ── Workspace panel ───────────────────────────────────────────────────────
  const workspace = navTree.find((ws) => ws.key === activeWorkspaceKey);
  if (!workspace) return null;

  const modules = workspace.modules.map((m) => ({
    code: m.code,
    label: m.label,
    icon: m.icon,
  }));

  return (
    <ContextPanel
      title={workspace.label}
      subtitle={`${workbenchLabel} · ${modules.length} module${modules.length !== 1 ? "s" : ""}`}
      pinnedItems={[
        {
          key: "queue",
          label: "My queue",
          icon: Inbox,
          badge: inboxCount,
          onClick: () => router.push("/inbox"),
        },
        {
          key: "approvals",
          label: "Approvals",
          icon: CheckCircle2,
          onClick: () => router.push("/inbox?tab=approvals"),
        },
      ]}
      modules={modules}
      pages={modulePages}
      activeModuleCode={activeModuleCode}
      accentColor={accentColor}
      onModuleSelect={(code) => router.push(`/module/${code.toLowerCase()}`)}
      onClose={onClose}
    />
  );
}
