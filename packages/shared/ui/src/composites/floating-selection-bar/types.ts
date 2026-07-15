/**
 * FloatingSelectionBar — public type contract.
 *
 * The bar is a pure UI primitive: it knows how to render N actions, handle
 * keyboard + focus + portal + overflow + responsive layout, and nothing else.
 * Surface adapters (entity list, line items, runtime list) translate their
 * domain selection state into the `SelectionAction[]` array.
 */

import type { LucideIcon } from "lucide-react";

export type SelectionActionGroup = "primary" | "secondary";
export type SelectionActionVariant = "default" | "destructive";
export type SelectionBadgeTone = "neutral" | "warning" | "error";

export interface SelectionActionShortcut {
  /** Single character key. Matched case-insensitively against `event.key`. */
  key: string;
  /** Require Ctrl (or Cmd on Mac) modifier. */
  ctrl?: boolean;
  /** Require Shift modifier. */
  shift?: boolean;
  /** Require Alt modifier. */
  alt?: boolean;
}

export interface SelectionAction {
  id:        string;
  label:     string;
  icon?:     LucideIcon;
  variant?:  SelectionActionVariant;
  group?:    SelectionActionGroup;
  disabled?: boolean;
  busy?:     boolean;
  hidden?:   boolean;
  badge?:    string;
  badgeTone?:SelectionBadgeTone;
  /** Optional child actions rendered as a dropdown on desktop and a grouped list on mobile. */
  items?: ReadonlyArray<SelectionActionItem>;
  /**
   * Opt-in keyboard shortcut. Bound at the document level only when the
   * parent passes `enableShortcuts={true}`. Surfaces that share key
   * affordances with grids / command palettes should leave shortcuts off.
   */
  shortcut?: SelectionActionShortcut;
  onSelect:  () => void | Promise<void>;
}

export type SelectionActionItem = Pick<
  SelectionAction,
  "id" | "label" | "icon" | "disabled" | "busy" | "variant" | "badge" | "badgeTone" | "onSelect"
>;

export type AutoFocusMode = "never" | "keyboard-only" | "always";

export interface FloatingSelectionBarProps {
  count:         number;
  noun?:         { singular: string; plural: string };
  actions:       SelectionAction[];
  onClear:       () => void;
  busy?:         boolean;
  mobileLayout?: "sheet" | "pill";
  /** `null` disables portal — useful for tests and Storybook. Default: `document.body`. */
  portalTarget?: HTMLElement | null;
  position?:    "bottom" | "top";

  /** Document-level shortcut binding. Default: `false`. */
  enableShortcuts?:     boolean;
  /** Esc clears selection. Default: `true` (safe in all surfaces). */
  enableEscapeToClear?: boolean;

  /** When to auto-focus the first action on open. Default: `"keyboard-only"`. */
  autoFocus?: AutoFocusMode;

  className?: string;
  testId?:    string;
}
