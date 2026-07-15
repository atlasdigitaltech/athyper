/**
 * FieldRow shared types.
 *
 * FieldRow is a plane-agnostic primitive consumed by all three apps
 * (neon / mesh / admin) to render a single key + value row in both
 * view and edit modes with guaranteed height parity.
 *
 * The mode swap inside a document object-page must never change layout —
 * see `docs/architecture/document-object-page.md` (forthcoming).
 */

export type FieldRowDensity = "compact" | "default" | "comfortable";

/**
 * Why a field cannot be edited in the current context.
 * Drives tooltip text and icon affordance in the Read variant.
 *
 * - `status_locked` — current document status disallows edits to this field
 *   (e.g. supplier on a posted invoice). Surfaced from `editable_in_status`.
 * - `permission_locked` — user lacks field-level mutate permission via RBAC.
 * - `pii_masked` — value is masked; user must request access to unmask.
 * - `readonly` — declared read-only in metadata.
 * - `computed` — derived/calculated value (e.g. totals); not user-editable.
 * - `system` — managed by the system (e.g. created_at, etag).
 */
export type LockedFieldReason =
  | "status_locked"
  | "permission_locked"
  | "pii_masked"
  | "readonly"
  | "computed"
  | "system";

export interface FieldRowSpacing {
  /** Total row min-height (CSS length, e.g. "2.25rem"). */
  minHeight: string;
  /** Vertical padding applied to the content cell. */
  paddingY: string;
}

export const FIELD_ROW_SPACING: Record<FieldRowDensity, FieldRowSpacing> = {
  compact: {
    minHeight: "var(--field-row-h-compact, 2rem)",
    paddingY: "0.125rem",
  },
  default: {
    minHeight: "var(--field-row-h-default, 2.25rem)",
    paddingY: "0.25rem",
  },
  comfortable: {
    minHeight: "var(--field-row-h-comfortable, 2.75rem)",
    paddingY: "0.5rem",
  },
};
