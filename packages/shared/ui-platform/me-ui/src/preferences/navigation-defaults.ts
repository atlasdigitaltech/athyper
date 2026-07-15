/**
 * Workspace / module tree used by the PreferencesSection navigation-defaults
 * picker. These are static labels matching shared.workspace and shared.module
 * code values — the runtime PATCH /me/preferences validates the submitted
 * `home_workspace_code` against shared.workspace.code so a user can't save an
 * unknown value.
 *
 * Future work: replace this hardcoded table with a fetch against
 * /api/platform/modules (or a dedicated /api/me/navigation-tree endpoint) so
 * tenant entitlements stay reflected. The shape exported here matches what a
 * dynamic loader would resolve to, so the swap is local to this file.
 */

export interface NavigationModuleOption {
  value: string;
  label: string;
}

export interface NavigationWorkspaceOption {
  value: string;
  label: string;
}

export const HOME_WORKSPACES: readonly NavigationWorkspaceOption[] = [
  { value: "CORE", label: "Core" },
  { value: "FIN",  label: "Finance" },
  { value: "SCM",  label: "Supply Chain" },
  { value: "COM",  label: "Commercial" },
  { value: "PPL",  label: "People" },
  { value: "PRS",  label: "Projects" },
  { value: "OPS",  label: "Operations" },
  { value: "AST",  label: "Assets" },
] as const;

export const HOME_MODULES_BY_WS: Record<string, readonly NavigationModuleOption[]> = {
  CORE: [
    { value: "FND",  label: "Foundation" },
    { value: "META", label: "Metadata" },
    { value: "IAM",  label: "IAM" },
    { value: "AUD",  label: "Audit" },
    { value: "NTF",  label: "Notifications" },
  ],
  FIN: [
    { value: "ACC",      label: "Accounting" },
    { value: "PAY",      label: "Payments" },
    { value: "TREASURY", label: "Treasury" },
    { value: "BUDGET",   label: "Budget" },
  ],
  SCM: [
    { value: "SRM",       label: "Supplier Relations" },
    { value: "SOURCE",    label: "Sourcing" },
    { value: "CONTRACT",  label: "Contracts" },
    { value: "BUY",       label: "Purchasing" },
    { value: "INVENTORY", label: "Inventory" },
  ],
  COM: [
    { value: "CRM",  label: "CRM" },
    { value: "SALE", label: "Sales" },
  ],
  PPL: [
    { value: "HR",      label: "HR" },
    { value: "PAYROLL", label: "Payroll" },
  ],
  PRS: [
    { value: "PRJCOST", label: "Project Costing" },
    { value: "ITSM",    label: "ITSM" },
  ],
  OPS: [
    { value: "MAINT", label: "Maintenance" },
    { value: "MFG",   label: "Manufacturing" },
  ],
  AST: [
    { value: "ASSET",     label: "Asset Management" },
    { value: "ASSETREMS", label: "Real Estate" },
    { value: "ASSETFM",   label: "Facilities" },
  ],
} as const;
