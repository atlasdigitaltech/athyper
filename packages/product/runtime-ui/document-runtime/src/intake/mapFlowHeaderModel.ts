import type { FlowBundle } from "@athyper/api-contracts/documents";
import type { EntityHeaderModel } from "@athyper/entity-runtime/header";
import { appEntityListHref } from "@athyper/runtime-shared/core";

export interface MapFlowHeaderOptions {
  onCancel?: () => void;
  /** When true the Exit action is rendered as disabled. */
  submitting?: boolean;
  /**
   * Override the chip label. If omitted, derived from bundle.label by stripping
   * leading action verbs ("Create", "New", "Add", "Edit", "Update").
   * Alwaysd before rendering.
   */
  entityTypeLabel?: string;
  /**
   * Entity code (e.g. "purchase_invoice"). When provided, the type chip becomes
   * a link to the entity list page at /app/\{entityCode\}.
   */
  entityCode?: string;
  /** Active steps after client-side skip_when evaluation. */
  steps?: FlowBundle["steps"];
}

const ACTION_VERB_RE = /^(create|new|add|edit|update)\s+/i;

/**
 * Produces an EntityHeaderModel for a FlowWizard create surface.
 *
 * - progress.kind is set to "wizard" so EntityProgressRow uses "Steps" label
 *   and the rail auto-opens for short flows (≤ 5 steps).
 * - typeLabel strips leading action verbs from bundle.label so "Create Invoice"
 *   becomes "INVOICE" — consistent with the view-surface chip.
 */
export function mapFlowHeaderModel(
  bundle: FlowBundle,
  stepIndex: number,
  options?: MapFlowHeaderOptions,
): EntityHeaderModel {
  const sortedSteps = [...(options?.steps ?? bundle.steps)].sort((a, b) => a.sort_order - b.sort_order);

  const rawLabel = options?.entityTypeLabel ?? bundle.label.replace(ACTION_VERB_RE, "");
  const typeLabel = rawLabel.toUpperCase();

  return {
    identity: {
      typeLabel,
      typeHref: options?.entityCode ? appEntityListHref(options.entityCode) : undefined,
      number: "New",
      identifierAction: "none",
      status: { label: "Draft", intent: "neutral" },
    },
    progress: {
      kind: "wizard",
      currentKey: sortedSteps[stepIndex]?.step_key ?? sortedSteps[0]?.step_key ?? "",
      stepIndex,
      stages: sortedSteps.map(step => ({ key: step.step_key, label: step.label })),
    },
    actions: options?.onCancel
      ? [{
          id: "cancel",
          label: "Exit",
          placement: "secondary" as const,
          order: 99,
          disabled: options.submitting,
          onSelect: options.onCancel,
        }]
      : [],
  };
}
