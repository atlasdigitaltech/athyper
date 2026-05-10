/**
 * @athyper/icons — Action Icon Registry
 *
 * Maps entity operation handler types and common action verbs to Lucide icons.
 * Used by the action bar (entity-runtime/actions/ActionBar.tsx) and
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
  XCircle,
  Forward,
  RotateCcw,
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

/**
 * Get the icon for an operation handler type.
 *
 * @param handlerType - "NAVIGATE" | "API" | "MODAL" | "INLINE"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getHandlerTypeIcon(handlerType: string): LucideIcon {
  return HANDLER_TYPE_ICON_MAP[handlerType] ?? FALLBACK_ICON;
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
  approve:   CheckCircle,
  reject:    XCircle,
  deny:      XCircle,
  submit:    Send,
  post:      CheckCircle,
  delegate:  Forward,
  reverse:   RotateCcw,
  reverse_document: RotateCcw,
  archive:   Archive,
  print:     Printer,
  filter:    Filter,
  search:    Search,
  more:      MoreHorizontal,
  command:   Terminal,
};

/**
 * Get the icon for a common action verb or icon_override value.
 *
 * @param action - e.g. "create", "approve", "export"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getActionIcon(action: string): LucideIcon {
  return ACTION_ICON_MAP[action] ?? FALLBACK_ICON;
}

/** Get all registered action verbs. */
export function getRegisteredActions(): string[] {
  return Object.keys(ACTION_ICON_MAP);
}
