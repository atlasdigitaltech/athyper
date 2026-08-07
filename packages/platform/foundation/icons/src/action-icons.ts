/**
 * @athyper/platform-icons — Action Icon Registry
 *
 * Maps entity operation handler types and common action verbs to Lucide icons.
 * Used by runtime action bars and the
 * command palette (shell/CommandPalette.tsx).
 *
 * Handler types from control.entity_operation.handler_type:
 *   NAVIGATE, API, MODAL, INLINE
 *
 * Common action verbs correspond to icon_override values in
 * control.entity_operation. The metadata-client resolves which icon
 * to use per entity; this registry is the lookup table it calls.
 */
import {
  ExternalLink,
  Send,
  PanelRight,
  Pencil,
  Plus,
  Trash2,
  Copy,
  Download,
  Upload,
  Eye,
  CheckCircle,
  FileCheck,
  XCircle,
  Ban,
  CircleSlash,
  Forward,
  RotateCcw,
  ArrowRight,
  Archive,
  Printer,
  Filter,
  Search,
  MoreHorizontal,
  Terminal,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

// ── Handler Type Icons ──────────────────────────────────────────

const HANDLER_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  NAVIGATE: ExternalLink,
  API:      Send,
  MODAL:    PanelRight,
  INLINE:   Pencil,
};

/** Fallback icon for unknown handler types and action verbs. */
const FALLBACK_ICON: LucideIcon = CircleHelp;

function normalizeHandlerType(handlerType: string | null | undefined): string {
  return handlerType?.trim().toUpperCase() ?? "";
}

function normalizeAction(action: string | null | undefined): string {
  return action?.trim().toLowerCase() ?? "";
}

/**
 * Get the icon for an operation handler type.
 *
 * @param handlerType - "NAVIGATE" | "API" | "MODAL" | "INLINE"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getHandlerTypeIcon(handlerType: string | null | undefined): LucideIcon {
  return HANDLER_TYPE_ICON_MAP[normalizeHandlerType(handlerType)] ?? FALLBACK_ICON;
}

// ── Common Action Icons ─────────────────────────────────────────

const ACTION_ICON_MAP: Record<string, LucideIcon> = {
  create:    Plus,
  edit:      Pencil,
  delete:    Trash2,
  copy:      Copy,
  duplicate: Copy,
  view:      Eye,
  export:    Download,
  import:    Upload,
  approve:            CheckCircle,  // workflow approval step
  reject:             XCircle,
  deny:               XCircle,
  submit:             Send,
  post:               FileCheck,    // GL posting (document finalized) — not CheckCircle (approve)
  cancel:             Ban,
  void:               CircleSlash,  // document voided/nullified
  delegate:           Forward,
  reverse:            RotateCcw,
  reverse_document:   RotateCcw,
  status_transition:  ArrowRight,   // generic lifecycle step forward
  archive:            Archive,
  print:              Printer,
  filter:             Filter,
  search:             Search,
  more:               MoreHorizontal,
  command:            Terminal,
};

/**
 * Get the icon for a common action verb or icon_override value.
 *
 * @param action - e.g. "create", "approve", "export"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getActionIcon(action: string | null | undefined): LucideIcon {
  return ACTION_ICON_MAP[normalizeAction(action)] ?? FALLBACK_ICON;
}

/** Get all registered action verbs. */
export function getRegisteredActions(): string[] {
  return Object.keys(ACTION_ICON_MAP);
}
