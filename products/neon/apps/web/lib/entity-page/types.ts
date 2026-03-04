// lib/entity-page/types.ts
//
// Frontend descriptor types matching the backend API response shape.
// These are intentionally decoupled from @athyper/core/meta to keep
// the frontend bundle free of server-side dependencies.

export type ReasonCode =
  | "ok"
  | "policy_denied"
  | "terminal_state"
  | "approval_pending"
  | "approval_rejected"
  | "approval_canceled"
  | "validation_failed"
  | "not_found"
  | "no_lifecycle";

export type ViewMode = "view" | "edit" | "create";

export interface BadgeDescriptor {
  code: string;
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline" | "warning" | "success";
}

export type ActionGroup = "lifecycle" | "approval" | "entity" | "posting";

export interface ActionDescriptor {
  code: string;
  label: string;
  handler: `${ActionGroup}.${string}`;
  variant: "default" | "destructive" | "outline" | "secondary";
  enabled: boolean;
  disabledReason?: ReasonCode;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
}

export interface TabDescriptor {
  code: string;
  label: string;
  enabled: boolean;
}

export interface SectionDescriptor {
  code: string;
  label: string;
  columns: number;
  fields: string[];
}

export interface EntityPageStaticDescriptor {
  entityName: string;
  entityClass?: string;
  featureFlags: Record<string, boolean>;
  compiledModelHash: string;
  tabs: TabDescriptor[];
  sections: SectionDescriptor[];
}

export interface EntityPageDynamicDescriptor {
  entityName: string;
  entityId: string;
  resolvedViewMode: ViewMode;
  viewModeReason?: ReasonCode;
  currentState?: {
    stateId: string;
    stateCode: string;
    stateName: string;
    isTerminal: boolean;
  };
  badges: BadgeDescriptor[];
  actions: ActionDescriptor[];
  approval?: {
    instanceId: string;
    status: string;
    myTasks: Array<{ id: string; status: string }>;
  };
  permissions: Record<string, boolean>;
}

export interface ActionExecutionResult {
  success: boolean;
  actionCode: string;
  error?: {
    reasonCode: ReasonCode;
    blockedBy: string;
    details: Array<{ message: string }>;
  };
}
