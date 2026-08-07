/**
 * @athyper/platform-icons — Entity Class Icon Registry
 *
 * Maps entity_class values (from control.entity_class_profile) to Lucide icons.
 * Used by entity runtime page headers and metadata studio.
 *
 * Entity classes determine which rendering runtime handles the entity:
 *   REFERENCE, MASTER, CONTROL, DIMENSION → master/ runtime
 *   DOCUMENT, DOCUMENT_RELATION           → document/ runtime
 *   LEDGER, LOG, AGGREGATE                → ledger/ runtime
 *   RELATION                              → embedded in parent
 */
import {
  Database,
  FileBadge,
  Settings,
  FileSpreadsheet,
  FileInput,
  BookOpen,
  ScrollText,
  BarChart3,
  Atom,
  Link2,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

const ENTITY_CLASS_ICON_MAP: Record<string, LucideIcon> = {
  REFERENCE:         Database,        // Shared lookup tables
  MASTER:            FileBadge,       // Standing business records
  CONTROL:           Settings,        // Configuration entities
  DOCUMENT:          FileSpreadsheet, // Transaction documents
  DOCUMENT_RELATION: FileInput,       // Document child tables
  LEDGER:            BookOpen,        // Posted fact records
  LOG:               ScrollText,      // Audit/log records
  AGGREGATE:         BarChart3,       // Pre-computed summaries
  DIMENSION:         Atom,            // Dimension values
  RELATION:          Link2,           // Link/association tables
};

/** Fallback icon for unknown entity class values. */
const FALLBACK_ICON: LucideIcon = CircleHelp;

function normalizeEntityClass(entityClass: string | null | undefined): string {
  return entityClass?.trim().toUpperCase() ?? "";
}

/**
 * Get the icon for an entity class.
 *
 * @param entityClass - e.g. "MASTER", "DOCUMENT", "LEDGER"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getEntityClassIcon(entityClass: string | null | undefined): LucideIcon {
  return ENTITY_CLASS_ICON_MAP[normalizeEntityClass(entityClass)] ?? FALLBACK_ICON;
}

/** Get all registered entity class keys. */
export function getRegisteredEntityClasses(): string[] {
  return Object.keys(ENTITY_CLASS_ICON_MAP);
}
