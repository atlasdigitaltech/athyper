/**
 * @athyper/platform-icons — Workspace Icon Registry
 *
 * Maps workspace keys to Lucide icons across all three application planes.
 * Used by the workbench shell and sidebar workspace headers.
 *
 * Keys match the published `code` column in control.workspace.
 */
import {
  // ── Athyper Plane ─────────────────────────────────────────────
  Sparkles,        // Atlas AI Studio
  LayoutTemplate,  // Entity Studio
  Blocks,          // Platform Foundation
  ShieldCheck,     // TrustIAM Studio
  Layers,          // Plans & Entitlements Studio
  Activity,        // Observability Studio
  MessageSquare,   // Communications Studio (Bell reserved for NTF module)
  Cable,           // Integration & Automation Studio
  Network,         // Extension Studio
  Settings,        // Platform Operations Studio

  // ── Neon Plane ────────────────────────────────────────────────
  Coins,           // Finance
  Link,            // Supply Chain
  Users,           // Commercial
  UserCog,         // People
  FolderKanban,    // Projects & Services
  Cog,             // Operations
  Building2,       // Assets & Facilities

  // ── Mesh Plane ────────────────────────────────────────────────
  Handshake,       // Partner Collaboration

  // ── Fallback ─────────────────────────────────────────────────
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

const WORKSPACE_ICON_MAP: Record<string, LucideIcon> = {

  // ═══════════════════════════════════════════════════════════════
  // ATHYPER PLANE
  // ═══════════════════════════════════════════════════════════════
  "atlas-ai-studio":               Sparkles,       // Atlas AI Studio
  "entity-studio":                 LayoutTemplate, // Entity Studio
  "platform-foundation":           Blocks,         // Platform Foundation
  "trustiam-studio":               ShieldCheck,    // TrustIAM Studio
  "plans-entitlements-studio":     Layers,         // Plans & Entitlements Studio
  "observability-studio":          Activity,       // Observability Studio
  "communications-studio":         MessageSquare,  // Communications Studio
  "integration-automation-studio": Cable,          // Integration & Automation Studio
  "extension-studio":              Network,        // Extension Studio
  "platform-operations-studio":    Settings,       // Platform Operations Studio

  // ═══════════════════════════════════════════════════════════════
  // NEON PLANE
  // ═══════════════════════════════════════════════════════════════
  "finance":           Coins,        // Finance workspace
  "supply-chain":      Link,         // Supply Chain workspace
  "commercial":        Users,        // Commercial workspace (CRM + Sales)
  "people":            UserCog,      // People workspace (HR + Payroll)
  "projects-services": FolderKanban, // Projects & Services workspace
  "operations":        Cog,          // Operations workspace (Manufacturing + Maintenance)
  "assets-facilities": Building2,    // Assets & Facilities workspace

  // ═══════════════════════════════════════════════════════════════
  // MESH PLANE
  // ═══════════════════════════════════════════════════════════════
  "partner-collaboration": Handshake, // Partner Collaboration workspace
};

/** Fallback icon for unknown workspace keys. */
const FALLBACK_ICON: LucideIcon = CircleHelp;

function normalizeWorkspaceKey(workspaceKey: string | null | undefined): string {
  return workspaceKey?.trim().toLowerCase() ?? "";
}

/**
 * Get the icon component for a workspace.
 *
 * @param workspaceKey - e.g. "finance", "atlas-ai-studio", "partner-collaboration"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getWorkspaceIcon(workspaceKey: string | null | undefined): LucideIcon {
  return WORKSPACE_ICON_MAP[normalizeWorkspaceKey(workspaceKey)] ?? FALLBACK_ICON;
}

/** Check if a workspace key has a registered icon. */
export function hasWorkspaceIcon(workspaceKey: string | null | undefined): boolean {
  return normalizeWorkspaceKey(workspaceKey) in WORKSPACE_ICON_MAP;
}

/** Get all registered workspace keys. */
export function getRegisteredWorkspaceKeys(): string[] {
  return Object.keys(WORKSPACE_ICON_MAP);
}

/**
 * Resolve a workspace icon — seed-driven (icon_key column) when available,
 * hard-coded fallback otherwise.
 *
 * @param key          Workspace key e.g. "finance"
 * @param icon_key     Value of control.workspace.icon_key — null until seeded
 * @param getEntityIconFn Injected to avoid circular imports
 */
export function resolveWorkspaceIcon(
  key: string,
  icon_key: string | null | undefined,
  getEntityIconFn: (key: string) => LucideIcon,
): LucideIcon {
  if (icon_key) {
    const seeded = getEntityIconFn(icon_key);
    if (seeded !== CircleHelp) return seeded;
  }
  return WORKSPACE_ICON_MAP[normalizeWorkspaceKey(key)] ?? FALLBACK_ICON;
}
