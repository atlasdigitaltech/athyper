/**
 * @athyper/entity-runtime — EntityHeader type contracts (Phase 1)
 *
 * These types are the single locked contract for all header surfaces:
 * create, view, and edit. The model is self-describing — the adapter
 * populates only the fields that apply and the header renders accordingly.
 *
 * Priority rows:
 *   P1    identity + actions    — always visible
 *   P1.5  exceptions            — always visible when present, never collapses
 *   P2    facts                 — critical KPI cells (total, supplier, dates)
 *   P3    statuses              — secondary dimensions (Accounting, Settlement…)
 *   P4    progress              — lifecycle rail, default open only on early stages
 *   P5    tabs                  — always present in detail/edit mode
 *
 * Rendering contract per HeaderMode:
 *   "expanded"  → P1 + P1.5 + P2 full grid + P3 + P4 timeline + audit + P5
 *   "collapsed" → P1 + P1.5 + P2 single summary cell + P3 + P5
 *   "pinned"    → P1 + P3 compact + P5  (sticky top-0 applied by the header)
 *
 * Sticky ownership:
 *   EntityWorkspaceShell owns the scroll boundary (overflow-y-auto container).
 *   EntityHeader applies sticky top-0 z-30 internally when mode === "pinned".
 *   Neither component applies sticky for any other mode.
 */

import type { SemanticIntent } from "@athyper/theme/semantic-colors";

// ── Header display mode ─────────────────────────────────────────────────────

/**
 * Header display mode — mirrors document-runtime HeaderMode.
 * Declared here so entity-runtime consumers have one import.
 *
 * Sticky ownership rule:
 *   "pinned" → EntityHeader applies sticky top-0 z-30 internally.
 *   EntityWorkspaceShell provides the scroll container; it never applies sticky.
 */
export type HeaderMode = "expanded" | "collapsed" | "pinned";

// ── P1 ─────────────────────────────────────────────────────────────────────

/**
 * The primary identification row: type chip, document number, lifecycle status.
 * Always rendered regardless of HeaderMode.
 *
 * Rule: identity.status holds exactly ONE lifecycle status (Draft, Approved, etc.).
 * Secondary operational statuses (Accounting, Settlement) go in HeaderStatusDimension[].
 */
export interface HeaderIdentity {
  /** Inverted-fill chip label, e.g. "INVOICE", "PURCHASE ORDER". */
  typeLabel: string;
  /**
   * When set, the type chip becomes a link to the entity list page.
   * e.g. "/app/purchase_invoice"
   * Rendering: standalone chip → <Link>; merged back+chip pill → chip text is <Link>.
   */
  typeHref?: string;
  /** Tooltip shown on the type chip (e.g. "View all invoices"). Phase 5 rendering. */
  typeTooltip?: string;
  /**
   * Primary document number or creation label.
   * Create surface: "New"
   * View/edit surface: business key, e.g. "PI-202604-QNBTBC"
   */
  number: string;
  /**
   * Entity display name shown inline after the code in P1 row.
   * Driven by display_config.title_field — no hardcoding.
   * e.g. "Athyper Group Holdings" for a supplier record.
   */
  name?: string;
  /**
   * Inline classification shown after the name with a "·" separator.
   * e.g. "Contractor" for a supplier, "Manufacturer" for another.
   * Driven by display_config.master_config.classification_field — no hardcoding.
   */
  classification?: string;
  /**
   * Copy-on-click behavior for the number field.
   * "copy"  → clicking the number copies it to clipboard (default for view/edit)
   * "none"  → plain text, no copy affordance (use for create surface where number is "New")
   * Absent  → treated as "copy"
   */
  identifierAction?: "copy" | "none";
  /** Main lifecycle / document status — singular, always one. */
  status: {
    label: string;
    intent: SemanticIntent;
  };
  /** Optional version badge, e.g. "v2". */
  version?: string;
}

/**
 * A single CTA in the header action cluster.
 *
 * Rendering rule by placement:
 *   "primary"   → visible CTA, rendered first
 *   "secondary" → visible if measured width allows, otherwise overflow
 *   "overflow"  → always in More menu
 *   "danger"    → separated danger group, always in More menu
 *
 * Actions sorted ascending by `order` before render.
 * `pending` drives a spinner on the button without disabling it globally.
 * `icon` is a string key resolved to a Lucide component via the icon registry;
 *  unknown keys fall back to CircleHelp. Never pass a component reference here
 *  because actions may originate from server/config payloads.
 */
export interface HeaderAction {
  id: string;
  label: string;
  placement: "primary" | "secondary" | "overflow" | "danger";
  /** Lower number renders first within the same placement bucket. */
  order: number;
  disabled?: boolean;
  /** Shown as tooltip when the action is disabled. */
  disabledReason?: string;
  /** True while an async operation (Post, Save, Submit) is in-flight. */
  pending?: boolean;
  /** Icon registry key, e.g. "send", "check", "x". Fallback: CircleHelp. */
  icon?: string;
  onSelect?: () => void | Promise<void>;
  /**
   * Visual group within the overflow ("More") dropdown.
   *   "lifecycle" — domain-specific state transitions (Deactivate, Block, Archive…)
   *   "record"    — generic CRUD ops (Copy, Delete, Export…)
   * Unset items are rendered between the two sections.
   */
  group?: "lifecycle" | "record";
}

// ── P1.5 ───────────────────────────────────────────────────────────────────

/**
 * A blocking or advisory exception rendered directly below the identity row.
 * Never collapses, never scrolls horizontally.
 * Errors with isBlocking=true also disable all non-danger actions.
 */
export interface HeaderException {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** When true, disables all non-danger header actions. */
  isBlocking?: boolean;
  /** Contextual scope: "header" | "line" | "payment" | "workflow" */
  scope?: string;
  /** Line number when scope is "line". */
  lineNumber?: number;
  /** Inline action label, e.g. "Review matching". */
  resolutionLabel?: string;
  /** Route href for the inline resolution action. */
  resolutionPath?: string;
}

// ── P2 ─────────────────────────────────────────────────────────────────────

/**
 * A single KPI cell in the critical facts strip.
 *
 * Collapsed mode: only the xl=true cell (typically Invoice Total) is shown
 * as a compact one-liner alongside the identity row.
 * Expanded mode: all cells rendered in a horizontal scroll strip.
 *
 * valueType drives rendering hints (monospace for codes, colour for amounts).
 */
export interface HeaderFact {
  id: string;
  label: string;
  value: string;
  subValue?: string;
  valueType?: "text" | "code" | "date" | "amount" | "enum";
  intent?: SemanticIntent;
  /** Hero/large cell (e.g. invoice total). Shown alone in collapsed summary. */
  xl?: boolean;
  /** ISO currency code shown alongside an amount value. */
  currency?: string;
}

// ── P3 ─────────────────────────────────────────────────────────────────────

/**
 * Secondary operational status dimension.
 * Covers Accounting, Settlement, Reconciliation, Matching, etc.
 *
 * Rule: these are explicitly NOT P1 (lifecycle) status. Putting lifecycle
 * status here will make the header visually noisy and semantically ambiguous.
 * Lifecycle status belongs in HeaderIdentity.status only.
 */
export interface HeaderStatusDimension {
  /** Stable machine ID: "accounting" | "settlement" | "reconciliation" | "matching" */
  id: string;
  /** Human label shown before the chip: "Accounting" */
  label: string;
  /** Status value shown in the chip: "Unposted", "Unpaid", "Unmatched" */
  value: string;
  intent: SemanticIntent;
}

// ── P4 ─────────────────────────────────────────────────────────────────────

export type SlaStatus =
  | "on_track"
  | "at_risk"
  | "breached"
  | "completed_ok"
  | "completed_late";

export interface HeaderProgressStage {
  key: string;
  label: string;
  reachedAt?: string;
  actor?: string;
  targetAt?: string;
  /** Human-readable duration, e.g. "2h 30m". */
  durationLabel?: string;
  slaStatus?: SlaStatus;
  slaTargetHours?: number;
}

/**
 * Lifecycle progress rail or wizard stepper.
 *
 * kind governs two behaviours:
 *   "wizard"    → rail label = "Steps"; auto-open when stages.length ≤ 5
 *   "lifecycle" → rail label = "Timeline"; auto-open when stepIndex ≤ 1 && stages.length ≥ 4
 * Omitting kind behaves as "lifecycle" for backward compatibility.
 */
export interface HeaderProgress {
  stages: HeaderProgressStage[];
  /** Stable key of the current active stage. */
  currentKey: string;
  /** 0-based index of the current stage. Used for auto-open logic. */
  stepIndex: number;
  /**
   * Discriminator: "wizard" for multi-step intake flows; "lifecycle" for document stages.
   * Defaults to "lifecycle" when absent.
   */
  kind?: "wizard" | "lifecycle";
  /** Optional copy hint for the next required action. */
  nextActionCopy?: string;
}

// ── P5 ─────────────────────────────────────────────────────────────────────

/**
 * A single tab in the tab strip.
 *
 * Counts are typically lazy: render tabs immediately with countPending=true,
 * then patch via EntityHeaderController.patchTabCount() as queries resolve.
 * Never block tab rendering waiting for count queries.
 */
export interface HeaderTab {
  id: string;
  label: string;
  /** Optional href for link-style tab navigation. */
  href?: string;
  /** Badge count. Absent until resolved. */
  count?: number;
  /** True while the count query is in-flight. Renders a subtle loading indicator. */
  countPending?: boolean;
  disabled?: boolean;
}

// ── Audit ──────────────────────────────────────────────────────────────────

/** Shown in expanded mode below the process row. */
export interface HeaderAuditMeta {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  statusChangedAt?: string;
  statusChangedBy?: string;
}

// ── Freshness ──────────────────────────────────────────────────────────────

/**
 * Data freshness state:
 *   "fresh"    → fetched recently, no visual indicator needed
 *   "aging"    → older than the soft threshold; show a subtle "X min ago" chip
 *   "stale"    → old enough to warrant a refresh prompt
 *   "disabled" → soft-refresh is not available for this record
 */
export type HeaderFreshnessState = "fresh" | "aging" | "stale" | "disabled";

/**
 * Soft-refresh affordance for the identity bar.
 *
 * Rendering: inline chip next to the document number — "Synced just now" / "3 min ago".
 * Clicking the chip (when not disabled/pending) triggers onRefresh().
 * Phase 5 wires the rendering; this type locks the contract now.
 */
export interface HeaderFreshness {
  /** ISO timestamp of the last successful fetch. */
  fetchedAt: string;
  state: HeaderFreshnessState;
  /** Human-readable label, e.g. "Synced just now", "3 min ago". */
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** True while a refresh is in-flight. */
  pending?: boolean;
  onRefresh: () => Promise<void>;
}

// ── Root model ─────────────────────────────────────────────────────────────

/**
 * EntityHeaderModel — the single locked contract for create, view, and edit.
 *
 * The header is model-driven, not mode-driven:
 *   - facts absent   → fact rail does not render
 *   - tabs absent    → tab strip does not render
 *   - progress absent → progress row does not render
 *
 * Create adapters produce lean models (identity + actions only).
 * View/edit adapters produce rich models (all fields populated).
 * The header renders whatever the model contains — no conditional logic on mode.
 */
export interface EntityHeaderModel {
  /** P1 — always visible. */
  identity: HeaderIdentity;
  /** P1 — always visible. Sorted by `order` before render. */
  actions: HeaderAction[];
  /**
   * Soft-refresh affordance. When present, renders an inline freshness chip
   * in the identity bar. Phase 5 wires the visual; field is contract-locked here.
   */
  freshness?: HeaderFreshness;
  /** P1.5 — always visible when present, never collapses. */
  exceptions?: HeaderException[];
  /** P2 — critical KPI cells. */
  facts?: HeaderFact[];
  /** P3 — secondary operational status dimensions. */
  statuses?: HeaderStatusDimension[];
  /** P4 — lifecycle progress rail. */
  progress?: HeaderProgress;
  /** P5 — tab strip. */
  tabs?: HeaderTab[];
  /** Shown in expanded mode only. */
  audit?: HeaderAuditMeta;
}

// ── Controller ─────────────────────────────────────────────────────────────

/**
 * EntityHeaderController — shell/page interface for patching lazy tab counts.
 *
 * Usage pattern:
 *   const [model, controller] = useEntityHeaderModel(initialModel);
 *   // as async queries resolve:
 *   useEffect(() => { controller.patchTabCount("comments", commentCount); }, [commentCount]);
 */
export interface EntityHeaderController {
  model: EntityHeaderModel;
  /** Update the count badge on a tab. No-op if tabId is not found. */
  patchTabCount(tabId: string, count: number): void;
  /** Set/clear the loading indicator on a tab count. */
  patchTabPending(tabId: string, pending: boolean): void;
}

// ── Edit-mode dirty state ──────────────────────────────────────────────────

/**
 * The result of EntityEditState.save().
 *
 * Behavior contract:
 *   ok: true        → shell clears isDirty, updates lastSavedAt
 *   ok: false       → shell keeps isDirty; surfaces errors to the form and/or header
 *   fieldErrors     → keyed by field id; form fields render inline error messages
 *   globalError     → surfaced in P1.5 exception strip as severity "error"
 *   conflict        → optimistic-lock or concurrent-edit collision; shell shows
 *                     a "reload / compare / overwrite" decision modal
 */
export type EntityEditSaveResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors?: Record<string, string>;
      globalError?: string;
      conflict?: {
        message: string;
        /** Server-side version identifier for comparison UI. */
        serverVersion?: string;
      };
    };

/**
 * EntityEditState — the complete dirty-state contract for edit mode.
 *
 * Owned by EntityWorkspaceShell and provided via context.
 * Header consumes it only as display/action input:
 *   isDirty=true   → status badge shows "Unsaved changes" (warning intent)
 *   isSaving=true  → Save action has pending=true
 *   save()         → triggered by Save button and Cmd+S shortcut
 *   discard()      → triggered by Cancel button and Escape shortcut
 *
 * Storage: Zustand store keyed "${entity}:${id}" so dirty state survives
 * tab switches without triggering re-renders in unrelated components.
 *
 * Navigation blocking: EntityWorkspaceShell uses useBlocker() when
 * isDirty=true to show a confirm modal instead of the browser prompt.
 */
export interface EntityEditState {
  isDirty: boolean;
  /** Field ids that have unsaved changes. Enables per-field dirty indicators. */
  dirtyFields: string[];
  isSaving: boolean;
  lastSavedAt?: string;
  save(): Promise<EntityEditSaveResult>;
  discard(): void;
}

// ── Adapter interface ──────────────────────────────────────────────────────

/**
 * Context passed to every adapter's build() function.
 * Kept minimal for now — extend as adapter needs grow across entity types.
 */
export interface HeaderAdapterContext {
  permissions: string[];
  locale?: string;
}

/**
 * EntityHeaderAdapter<TInput> — the seam between raw server data and EntityHeaderModel.
 *
 * Every entity type that uses EntityHeader registers one adapter.
 * The shell looks up the adapter and calls build(); new entities add an
 * adapter without touching the shell or header component.
 *
 * Example:
 *   export const apInvoiceHeaderAdapter: EntityHeaderAdapter<ApInvoiceDetail> = {
 *     build(invoice, ctx) { return { identity: { ... }, actions: [ ... ] }; }
 *   };
 */
export interface EntityHeaderAdapter<TInput> {
  build(input: TInput, ctx: HeaderAdapterContext): EntityHeaderModel;
}
