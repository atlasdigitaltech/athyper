import type { ReactNode } from "react";
import type { SemanticIntent } from "@athyper/theme/semantic-colors";

export type HeaderMode = "expanded" | "collapsed" | "pinned";

export interface HeaderIdentity {
  typeLabel: string;
  typeHref?: string;
  typeTooltip?: string;
  number: string;
  name?: string;
  classification?: string;
  identifierAction?: "copy" | "none";
  status: {
    label: string;
    intent: SemanticIntent;
  };
  version?: string;
}

export interface HeaderAction {
  id: string;
  label: string;
  placement: "primary" | "secondary" | "overflow" | "danger";
  order: number;
  disabled?: boolean;
  disabledReason?: string;
  pending?: boolean;
  icon?: string;
  onSelect?: () => void | Promise<void>;
  group?: "lifecycle" | "record" | "workflow_task";
}

export interface HeaderException {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  isBlocking?: boolean;
  scope?: string;
  lineNumber?: number;
  resolutionLabel?: string;
  resolutionPath?: string;
}

export interface HeaderFact {
  id: string;
  label: string;
  value: string;
  subValue?: string;
  valueType?: "text" | "code" | "date" | "amount" | "enum";
  intent?: SemanticIntent;
  xl?: boolean;
  currency?: string;
}

export interface HeaderStatusDimension {
  id: string;
  label: string;
  value: string;
  intent: SemanticIntent;
}

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
  durationLabel?: string;
  slaStatus?: SlaStatus;
  slaTargetHours?: number;
}

export interface HeaderProgress {
  stages: HeaderProgressStage[];
  currentKey: string;
  stepIndex: number;
  kind?: "wizard" | "lifecycle";
  nextActionCopy?: string;
}

/**
 * Compact edit-state indicator rendered alongside the tab label.
 * Independent of `count` so tabs can show both a count (e.g. 12 line items)
 * and an indicator (e.g. unsaved changes / validation error in section).
 */
export type HeaderTabBadge =
  | { type: "dirty" }
  | { type: "error"; count?: number };

export interface HeaderTab {
  id: string;
  label: string;
  href?: string;
  count?: number;
  countPending?: boolean;
  /** Edit-state indicator (dirty / error). Used by object-page sections. */
  badge?: HeaderTabBadge;
  disabled?: boolean;
}

export type HeaderFreshnessState = "fresh" | "aging" | "stale" | "disabled";

export interface HeaderFreshness {
  fetchedAt: string;
  state: HeaderFreshnessState;
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
  pending?: boolean;
  onRefresh: () => Promise<void>;
}

export interface HeaderAudit {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  statusChangedAt?: string;
  statusChangedBy?: string;
}

export type HeaderAuditMeta = HeaderAudit;

export interface EntityHeaderModel {
  identity: HeaderIdentity;
  actions: HeaderAction[];
  freshness?: HeaderFreshness;
  exceptions?: HeaderException[];
  facts?: HeaderFact[];
  statuses?: HeaderStatusDimension[];
  progress?: HeaderProgress;
  tabs?: HeaderTab[];
  audit?: HeaderAudit;
}

export interface PlatformPanelIcon {
  id: string;
  label: string;
  icon: ReactNode;
  count?: number;
  countPending?: boolean;
  disabled?: boolean;
}

export interface EntityHeaderController {
  model: EntityHeaderModel;
  patchTabCount(tabId: string, count: number): void;
  patchTabPending(tabId: string, pending: boolean): void;
}

export interface HeaderAdapterContext {
  permissions: string[];
  locale?: string;
}

export interface EntityHeaderAdapter<TInput> {
  build(input: TInput, ctx: HeaderAdapterContext): EntityHeaderModel;
}
