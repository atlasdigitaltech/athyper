"use client";

/**
 * @athyper/runtime-canvas — useDocumentAffordance
 *
 * Cleanup Plan v5 §5.7 + amendment 9.
 *
 * Action-code-driven affordance resolver. Combines three gates with
 * AND semantics — ANY denial wins, and missing data is denial:
 *
 *   Gate 1: control.entity_action_rule row for (status, action_code)
 *           Missing row = denied (amendment 9 — deny by default)
 *           capability='denied' = denied with reason
 *           capability='requires_permission' = check RBAC
 *
 *   Gate 2: lifecycle state mask (control.entity_lifecycle_state_mask)
 *           If the status's mask says `canEdit=false` AND the action is
 *           an edit action, deny regardless of action rule.
 *
 *   Gate 3: RBAC permission set
 *           If the action rule requires a permission, caller must hold
 *           it in their session permission set.
 *
 * This replaces the PI-named `useEditAffordance` (content-ui) whose
 * surface enum (pc_line, pc_header, ad, header_components_strip) was
 * PI-specific. The new hook is generic across documents.
 */

import { useMemo } from "react";
import type { ActionRule, DocumentRuleSet } from "./useDocumentRules";

// ─── Public types ────────────────────────────────────────────────────

export type ActionAffordance =
  | { allowed: true;  capability: "allowed" | "requires_permission" }
  | { allowed: false; reason: string };

export interface LifecycleStateMask {
  recordStatus: string;
  canEdit:      boolean;
  canDelete:    boolean;
}

export interface PermissionSet {
  has(permission: string): boolean;
}

export interface UseDocumentAffordanceOptions {
  /** Current document status (e.g. "draft", "pending_approval"). */
  status: string;
  /**
   * Generic action code (e.g. "PC.ADD", "PC.REPLACE", "AD.EDIT",
   * "HEADER.SUBMIT"). Convention: <SURFACE>.<VERB>.
   */
  actionCode: string;
  /** Output of useDocumentRules. */
  ruleSet: DocumentRuleSet | null;
  /** Optional lifecycle state masks from descriptor. */
  lifecycleStateMasks?: ReadonlyArray<LifecycleStateMask>;
  /** Optional RBAC permission set. */
  permissions?: PermissionSet;
}

// ─── Action-code helpers ─────────────────────────────────────────────

/**
 * Edit actions are the canonical write verbs. The lifecycle mask gate
 * only kicks in for these — non-edit actions like `preview_postings`
 * stay allowed even when the document is read-only.
 */
const EDIT_VERBS = new Set([
  "ADD",
  "REPLACE",
  "OVERRIDE",
  "DELETE",
  "EDIT",
  "SUBMIT",
  "APPROVE",
  "REJECT",
  "HOLD",
  "RESUME",
  "POST",
  "REVERSE",
  "CANCEL",
]);

function isEditAction(actionCode: string): boolean {
  const verb = actionCode.split(".").pop() ?? "";
  return EDIT_VERBS.has(verb);
}

// ─── Pure resolver (exported for tests) ──────────────────────────────

export function resolveDocumentAffordance(opts: UseDocumentAffordanceOptions): ActionAffordance {
  const { status, actionCode, ruleSet, lifecycleStateMasks, permissions } = opts;

  // ── Gate 0: ruleSet absent (still loading or fetch failed) ─────────
  if (!ruleSet) {
    return { allowed: false, reason: "Rule set not loaded yet." };
  }

  // ── Gate 1: action rule row exists + capability ────────────────────
  const rule: ActionRule | undefined = ruleSet.action_rules[actionCode]?.[status];
  if (!rule) {
    return {
      allowed: false,
      reason: `No action rule for ${actionCode} in ${status} (deny-by-default).`,
    };
  }
  if (rule.capability === "denied") {
    return { allowed: false, reason: rule.reason ?? `Denied in ${status}.` };
  }

  // ── Gate 2: lifecycle state mask ───────────────────────────────────
  // Only applies to edit actions; postings preview and audit reads
  // are not gated by the mask.
  if (lifecycleStateMasks && isEditAction(actionCode)) {
    const mask = lifecycleStateMasks.find((m) => m.recordStatus === status);
    if (mask && !mask.canEdit) {
      return {
        allowed: false,
        reason: `Lifecycle mask disallows edits in ${status}.`,
      };
    }
    if (mask && !mask.canDelete && actionCode.endsWith(".DELETE")) {
      return {
        allowed: false,
        reason: `Lifecycle mask disallows deletes in ${status}.`,
      };
    }
  }

  // ── Gate 3: RBAC permission check ──────────────────────────────────
  if (rule.capability === "requires_permission") {
    if (!rule.required_permission) {
      return {
        allowed: false,
        reason: "Rule requires permission but none specified.",
      };
    }
    if (!permissions) {
      return {
        allowed: false,
        reason: `Missing permission ${rule.required_permission} (no session permissions).`,
      };
    }
    if (!permissions.has(rule.required_permission)) {
      return {
        allowed: false,
        reason: `Missing permission ${rule.required_permission}.`,
      };
    }
    return { allowed: true, capability: "requires_permission" };
  }

  return { allowed: true, capability: "allowed" };
}

// ─── React hook (memoised wrapper) ───────────────────────────────────

export function useDocumentAffordance(opts: UseDocumentAffordanceOptions): ActionAffordance {
  return useMemo(
    () => resolveDocumentAffordance(opts),
    [
      opts.status,
      opts.actionCode,
      opts.ruleSet,
      opts.lifecycleStateMasks,
      opts.permissions,
    ],
  );
}
