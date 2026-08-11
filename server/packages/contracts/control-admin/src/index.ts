export const controlAdminErrorCodes = [
  "CONTROL_ADMIN_INVALID_COMMAND",
  "CONTROL_ADMIN_IDEMPOTENCY_CONFLICT",
  "CONTROL_ADMIN_EXPECTED_VERSION_CONFLICT",
  "CONTROL_ADMIN_PERMISSION_DENIED",
  "CONTROL_ADMIN_NOT_FOUND",
  "CONTROL_ADMIN_CYCLE_TYPE_NOT_FOUND",
  "CONTROL_ADMIN_CYCLE_TEMPLATE_NOT_FOUND",
  "CONTROL_ADMIN_CYCLE_TEMPLATE_INVALID",
  "CONTROL_ADMIN_DESIRED_STATE_TARGET_MISMATCH",
  "CONTROL_ADMIN_DESIRED_STATE_HASH_INVALID",
  "CONTROL_ADMIN_DESIRED_STATE_SIGNATURE_INVALID",
  "CONTROL_ADMIN_DEFINITION_NOT_FOUND",
  "CONTROL_ADMIN_OVERRIDE_NOT_ALLOWED",
  "CONTROL_ADMIN_INVALID_VALUE",
  "CONTROL_ADMIN_INVALID_EFFECTIVE_RANGE",
  "CONTROL_ADMIN_REFERENCE_IN_USE",
  "CONTROL_ADMIN_VERSION_CONFLICT",
  "CONTROL_ADMIN_ROUNDING_OVERLAP",
  "CONTROL_ADMIN_BANK_RULE_INVALID",
  "CONTROL_ADMIN_CONNECTOR_INVALID",
  "CONTROL_ADMIN_LIFECYCLE_INVALID",
] as const;
export type ControlAdminErrorCode = (typeof controlAdminErrorCodes)[number];
export interface ControlAdminPageRequest { readonly limit?: number; readonly cursor?: string; }
export interface ControlAdminPage<T> { readonly items: readonly T[]; readonly nextCursor?: string; readonly hasMore: boolean; }
export interface ControlAdminCommand<T extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> { readonly commandId: string; readonly idempotencyKey: string; readonly requestFingerprint: string; readonly expectedVersion?: number; readonly tenantId?: string; readonly principalId: string; readonly payload: T; }
export type ControlAdminResult<T> = { readonly kind: "applied" | "replayed"; readonly value: T; readonly version: number } | { readonly kind: "version_conflict"; readonly expectedVersion: number; readonly actualVersion: number };
export interface MutableAdminRepository<T, Transaction = unknown> { execute(command: ControlAdminCommand, transaction: Transaction): Promise<ControlAdminResult<T>>; }
export interface CatalogReader<T> { get(code: string, version?: number): Promise<T | null>; list(page: ControlAdminPageRequest): Promise<ControlAdminPage<T>>; }
export const controlAdminPermissions = { catalogRead: "control.catalog.read", catalogPublish: "control.catalog.publish", tenantOverrideManage: "control.tenant_override.manage", financeConfigManage: "control.finance_config.manage", cycleTemplateManage: "control.cycle_template.manage", connectorManage: "control.connector.manage" } as const;
export * from "./control-services.js";
export * from "./cycle-config.js";
