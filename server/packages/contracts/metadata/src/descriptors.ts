import type { PlaneKey } from "@athyper/server-foundation/context";

export type EntityFieldType = "string" | "text" | "integer" | "decimal" | "boolean" | "date" | "datetime" | "uuid" | "enum" | "reference" | "json";

export interface EntityFieldDescriptor {
  readonly key: string;
  readonly storagePath: string;
  readonly type: EntityFieldType;
  readonly required: boolean;
  readonly writableOn: readonly ("create" | "patch")[];
  readonly filterable?: boolean;
  readonly sortable?: boolean;
  readonly searchable?: boolean;
  /** Authorization evaluated before query projection; denied fields never reach the repository SELECT list. */
  readonly readPermissionCode?: string;
  /** Authorization evaluated during mutation admission for every submitted field. */
  readonly writePermissionCode?: string;
  readonly classification?: "public" | "internal" | "confidential" | "pii" | "sensitive_pii";
  readonly retentionPolicyCode?: string;
  readonly validation?: Readonly<Record<string, unknown>>;
}

export interface EntityAggregateCollectionDescriptor {
  readonly code: string;
  readonly entityCode: string;
  readonly parentField: string;
  readonly allowedOperations: readonly ("create" | "update" | "delete" | "replace")[];
}

export interface EntityRegisteredActionDescriptor {
  readonly code: string;
  readonly handlerKey: string;
  readonly permissionCode: string;
  readonly asyncThreshold?: number;
}

export interface EntityOperationDescriptor {
  readonly code: string;
  readonly permissionCode: string;
}

export interface EntityLifecycleTransitionDescriptor {
  readonly code: string;
  readonly from: readonly string[];
  readonly to: string;
  readonly permissionCode: string;
}

export type EntityPolicyBindingStage = "authorization" | "precondition" | "validation" | "postcondition" | "masking";
export type EntityPolicyEnforcement = "enforce" | "warn" | "observe";

/** Compiled composition coordinate; the policy body remains owned by local control tables. */
export interface EntityPolicyBindingDescriptor {
  readonly key: string;
  readonly policyDefinitionId: string;
  readonly policyVersionNo: number;
  readonly stage: EntityPolicyBindingStage;
  readonly enforcement: EntityPolicyEnforcement;
  readonly priority: number;
  readonly operationCode?: string;
  readonly fieldKey?: string;
  readonly inputMapping: Readonly<Record<string, unknown>>;
}

export interface EntityRuntimeDescriptor {
  readonly schema: "athyper.entity-runtime-descriptor/1.0";
  readonly entityCode: string;
  readonly planeKey: PlaneKey;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly contractHash: string;
  readonly compiledHash: string;
  readonly storage: {
    readonly schema: string;
    readonly object: string;
    readonly idField: string;
    readonly tenantField?: string;
    readonly versionField?: string;
    readonly softDeleteField?: string;
    readonly statusField?: string;
  };
  readonly fields: readonly EntityFieldDescriptor[];
  readonly operations: Readonly<Record<string, EntityOperationDescriptor>>;
  readonly lifecycle?: { readonly transitions: readonly EntityLifecycleTransitionDescriptor[] };
  readonly aggregate?: { readonly collections: readonly EntityAggregateCollectionDescriptor[] };
  readonly actions?: readonly EntityRegisteredActionDescriptor[];
  readonly policyBindings?: readonly EntityPolicyBindingDescriptor[];
}

export interface EntityDescriptorCoordinate {
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: PlaneKey;
  readonly entityCode: string;
}
