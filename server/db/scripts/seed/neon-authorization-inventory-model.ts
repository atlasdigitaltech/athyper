export const neonTableClassifications = [
  "aggregate_root",
  "aggregate_child",
  "reference_configuration_root",
  "sensitive_overlay",
  "immutable_evidence",
  "projection_derived_state",
  "technical_work_state",
  "pending_review",
] as const;

export type NeonTableClassification = typeof neonTableClassifications[number];
export type NeonReviewStatus = "reviewed" | "pending_review";
export type NeonWriterKind = "user_service" | "worker" | "projection_reconciler" | "database_only";
export type NeonPermissionKind = "entity_operation" | "capability" | "system_action";
export type NeonScopeKind = "tenant" | "workspace" | "module" | "company_code" | "legal_entity"
  | "operating_organization" | "network_account" | "network_relationship" | "resource";

export interface ReviewedTableDefinition {
  readonly table: string;
  readonly slice: string;
  readonly businessDomain: string;
  readonly classification: Exclude<NeonTableClassification, "pending_review">;
  readonly aggregateRoot: string;
  readonly writerKind: NeonWriterKind;
  readonly writerOwner: string;
  readonly externallyReadable: boolean;
  readonly externallyWritable: boolean;
  readonly sensitivity: "standard" | "confidential" | "restricted";
  readonly requiredScopeKinds: readonly NeonScopeKind[];
  readonly notes?: string;
}

export interface NeonOperationDefinition {
  readonly entityCode: string;
  readonly operationKey: string;
  readonly permissionCode: string;
  readonly permissionKind: NeonPermissionKind;
  readonly storageRoot: string;
  readonly requiredScopeKinds: readonly NeonScopeKind[];
  readonly scopeCoordinateKeys: Readonly<Record<string, string>>;
  readonly riskTier: "low" | "medium" | "high" | "critical";
  readonly requiresMfa: boolean;
  readonly requiresSod: boolean;
  readonly serviceOwner: string;
}

export interface NeonLifecycleTransition {
  readonly code: string;
  readonly from: readonly string[];
  readonly to: string;
  readonly permissionCode: string;
}

export interface NeonLifecycleDefinition {
  readonly entityCode: string;
  readonly storageRoot: string;
  readonly statusField: string;
  readonly versionField?: string;
  readonly transitions: readonly NeonLifecycleTransition[];
}

export interface NeonReviewedSlicesContract {
  readonly contractVersion: "athyper.authorization.neon-reviewed-slices.v1";
  readonly plane: "neon";
  readonly tables: readonly ReviewedTableDefinition[];
  readonly operations: readonly NeonOperationDefinition[];
  readonly lifecycles: readonly NeonLifecycleDefinition[];
}

export type StudioNeonOrganizationResourceKind = "legal_entity" | "company_code" | "operating_organization";
export type OnboardingCommandOperation = "apply" | "retain";

export interface StudioNeonOrganizationResourceContract {
  readonly resourceKind: StudioNeonOrganizationResourceKind;
  readonly targetTable: string;
  readonly createScopeKind: NeonScopeKind;
  readonly createScopeCoordinateKey: string;
  readonly allowedCommandOperations: readonly OnboardingCommandOperation[];
  readonly retention: "retain_legal_and_audit";
  readonly applyConstraint: "create_draft_or_update_existing_draft";
  readonly allowedDesiredStateFields: readonly string[];
  readonly immutableAfterCreateFields: readonly string[];
  readonly activationPermissionCode: string;
}

export interface StudioNeonOrganizationBoundaryContract {
  readonly contractVersion: "athyper.authorization.studio-neon-organization-boundary.v1";
  readonly source: {
    readonly plane: "studio";
    readonly orchestrationTables: readonly string[];
    readonly authorizationProjectionTables: readonly string[];
    readonly directNeonSql: false;
    readonly grantsNeonBusinessAuthority: false;
  };
  readonly target: {
    readonly plane: "neon";
    readonly applierKind: "plane_local_provisioner";
    readonly applierOwner: string;
    readonly implementationStatus: "required_not_implemented" | "implemented";
    readonly requiresExactDatabasePlane: true;
    readonly defaultCreateStatus: "draft";
    readonly forbidsAuthorizationCatalogMutation: true;
    readonly forbidsBusinessActivation: true;
  };
  readonly commandBoundary: {
    readonly schemaVersion: 1;
    readonly exactAudienceBinding: true;
    readonly authenticatedServiceActor: true;
    readonly allowlistedCommandCode: true;
    readonly targetTenantBinding: true;
    readonly desiredVersionAndHash: true;
    readonly idempotencyFingerprint: true;
    readonly staleAndSameVersionConflictDenial: true;
    readonly atomicMutationReceiptAndOutbox: true;
  };
  readonly lifecycleSeparation: {
    readonly keycloakAdmissionMeans: "identity_organization_and_assurance_only";
    readonly onboardingActiveMeans: "orchestration_converged";
    readonly trustIamProjectionMeans: "authorization_scope_ceiling_only";
    readonly neonActiveMeans: "plane_local_business_activation";
  };
  readonly resources: readonly StudioNeonOrganizationResourceContract[];
  readonly requiredBeforeEnforcement: readonly string[];
}

export interface NeonTableCoverageRow {
  readonly table: string;
  readonly ddlSource: string;
  readonly hasStatus: boolean;
  readonly hasVersion: boolean;
  readonly repositoryReferences: readonly string[];
  readonly writerReferences: readonly string[];
  readonly reviewStatus: NeonReviewStatus;
  readonly slice: string;
  readonly businessDomain: string | null;
  readonly classification: NeonTableClassification;
  readonly aggregateRoot: string | null;
  readonly writerKind: NeonWriterKind | null;
  readonly writerOwner: string | null;
  readonly externallyReadable: boolean | null;
  readonly externallyWritable: boolean | null;
  readonly sensitivity: "standard" | "confidential" | "restricted" | null;
  readonly requiredScopeKinds: readonly NeonScopeKind[];
  readonly notes?: string;
}

export interface NeonInventoryValidation {
  readonly errors: readonly string[];
  readonly releaseBlockers: readonly string[];
}

const canonicalPermission = /^neon\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const relation = /^(master|document)\.[a-z][a-z0-9_]*$/;
const scopeCoordinate: Readonly<Record<NeonScopeKind, string | null>> = {
  tenant: "tenantId",
  workspace: "workspaceId",
  module: "moduleId",
  company_code: "companyCodeId",
  legal_entity: "legalEntityId",
  operating_organization: "operatingOrganizationId",
  network_account: "networkAccountId",
  network_relationship: "networkRelationshipId",
  resource: "resourceId",
};

export function validateNeonAuthorizationInventory(input: {
  readonly discoveredTables: readonly string[];
  readonly coverage: readonly NeonTableCoverageRow[];
  readonly contract: NeonReviewedSlicesContract;
  readonly organizationBoundary?: StudioNeonOrganizationBoundaryContract;
  readonly strict?: boolean;
}): NeonInventoryValidation {
  const errors: string[] = [];
  const releaseBlockers: string[] = [];
  const discovered = new Set(input.discoveredTables);
  const rows = new Map<string, NeonTableCoverageRow>();
  for (const row of input.coverage) {
    if (!relation.test(row.table)) errors.push(`invalid table coordinate: ${row.table}`);
    if (rows.has(row.table)) errors.push(`duplicate coverage row: ${row.table}`);
    rows.set(row.table, row);
  }
  for (const table of discovered) if (!rows.has(table)) errors.push(`unclassified table: ${table}`);
  for (const table of rows.keys()) if (!discovered.has(table)) errors.push(`coverage table is not present in Neon DDL: ${table}`);

  const reviewed = new Map<string, ReviewedTableDefinition>();
  for (const definition of input.contract.tables) {
    if (reviewed.has(definition.table)) errors.push(`duplicate reviewed table: ${definition.table}`);
    reviewed.set(definition.table, definition);
    if (!discovered.has(definition.table)) errors.push(`reviewed table is not present in Neon DDL: ${definition.table}`);
    if (!definition.writerOwner.trim()) errors.push(`unowned writer: ${definition.table}`);
    if (!definition.requiredScopeKinds.length) errors.push(`reviewed table has no scope: ${definition.table}`);
  }
  for (const definition of input.contract.tables) {
    const root = reviewed.get(definition.aggregateRoot);
    if (!root) errors.push(`aggregate root is not reviewed: ${definition.table}/${definition.aggregateRoot}`);
    else if (root.classification !== "aggregate_root" && root.classification !== "reference_configuration_root") {
      errors.push(`aggregate root has an invalid classification: ${definition.table}/${definition.aggregateRoot}`);
    }
  }

  for (const row of input.coverage) {
    if (row.reviewStatus === "reviewed") {
      if (row.classification === "pending_review") errors.push(`reviewed table is unclassified: ${row.table}`);
      if (!row.writerOwner || !row.writerKind) errors.push(`unowned writer: ${row.table}`);
      if (!row.aggregateRoot) errors.push(`reviewed table has no aggregate root: ${row.table}`);
    } else {
      releaseBlockers.push(`pending table review: ${row.table}`);
    }
  }

  const operations = new Map<string, NeonOperationDefinition>();
  const permissionCodes = new Set<string>();
  for (const operation of input.contract.operations) {
    const key = `${operation.entityCode}:${operation.operationKey}`;
    if (operations.has(key)) errors.push(`duplicate entity operation: ${key}`);
    operations.set(key, operation);
    if (permissionCodes.has(operation.permissionCode)) errors.push(`duplicate permission code: ${operation.permissionCode}`);
    permissionCodes.add(operation.permissionCode);
    if (!canonicalPermission.test(operation.permissionCode)) errors.push(`non-canonical permission: ${operation.permissionCode}`);
    const segments = operation.permissionCode.split(".");
    if (segments[2] !== operation.entityCode || segments[3] !== operation.operationKey) {
      errors.push(`permission does not match entity operation: ${operation.permissionCode}`);
    }
    const storage = rows.get(operation.storageRoot);
    if (!storage) errors.push(`operation storage root is missing: ${operation.storageRoot}`);
    else if (storage.classification !== "aggregate_root" && storage.classification !== "reference_configuration_root") {
      errors.push(`child published as generic CRUD: ${operation.storageRoot}/${operation.operationKey}`);
    }
    if (!operation.requiredScopeKinds.length) errors.push(`operation has no scope coordinates: ${key}`);
    for (const scope of operation.requiredScopeKinds) {
      const expected = scopeCoordinate[scope];
      if (!expected || operation.scopeCoordinateKeys[scope] !== expected) {
        errors.push(`operation scope coordinate missing: ${key}/${scope}`);
      }
    }
    for (const scope of Object.keys(operation.scopeCoordinateKeys)) {
      if (!operation.requiredScopeKinds.includes(scope as NeonScopeKind)) {
        errors.push(`unexpected operation scope coordinate: ${key}/${scope}`);
      }
    }
    if (!operation.serviceOwner.trim()) errors.push(`operation has no service owner: ${key}`);
  }

  for (const lifecycle of input.contract.lifecycles) {
    const storage = rows.get(lifecycle.storageRoot);
    if (!storage || storage.classification !== "aggregate_root") {
      errors.push(`lifecycle root is not a reviewed aggregate: ${lifecycle.storageRoot}`);
    }
    if (!lifecycle.statusField.trim()) errors.push(`lifecycle status field is missing: ${lifecycle.entityCode}`);
    const transitionCodes = new Set<string>();
    for (const transition of lifecycle.transitions) {
      if (transitionCodes.has(transition.code)) errors.push(`duplicate lifecycle transition: ${lifecycle.entityCode}/${transition.code}`);
      transitionCodes.add(transition.code);
      if (!transition.from.length || !transition.to.trim()) errors.push(`incomplete lifecycle transition: ${lifecycle.entityCode}/${transition.code}`);
      const operation = operations.get(`${lifecycle.entityCode}:${transition.code}`);
      if (!operation || operation.permissionCode !== transition.permissionCode) {
        errors.push(`lifecycle operation binding missing: ${lifecycle.entityCode}/${transition.code}`);
      } else if (operation.storageRoot !== lifecycle.storageRoot) {
        errors.push(`lifecycle operation storage mismatch: ${lifecycle.entityCode}/${transition.code}`);
      }
    }
  }

  if (input.organizationBoundary) validateOrganizationBoundary(
    input.organizationBoundary,
    rows,
    operations,
    errors,
    releaseBlockers,
  );

  if (input.strict && releaseBlockers.length) errors.push(...releaseBlockers);
  return { errors: [...new Set(errors)].sort(), releaseBlockers: [...new Set(releaseBlockers)].sort() };
}

function validateOrganizationBoundary(
  boundary: StudioNeonOrganizationBoundaryContract,
  rows: ReadonlyMap<string, NeonTableCoverageRow>,
  operations: ReadonlyMap<string, NeonOperationDefinition>,
  errors: string[],
  releaseBlockers: string[],
): void {
  if (boundary.contractVersion !== "athyper.authorization.studio-neon-organization-boundary.v1") {
    errors.push("invalid Studio/Neon organization boundary identity");
  }
  if (boundary.source.plane !== "studio" || boundary.target.plane !== "neon") {
    errors.push("organization boundary has a wrong-plane source or target");
  }
  if (boundary.source.directNeonSql !== false) errors.push("Studio organization boundary permits direct Neon SQL");
  if (boundary.source.grantsNeonBusinessAuthority !== false) errors.push("Studio organization boundary grants Neon business authority");
  for (const table of boundary.source.orchestrationTables) {
    if (!/^onboarding\.[a-z][a-z0-9_]*$/.test(table)) errors.push(`organization orchestration source is invalid: ${table}`);
  }
  for (const table of boundary.source.authorizationProjectionTables) {
    if (!/^trustiam\.[a-z][a-z0-9_]*$/.test(table)) errors.push(`organization projection source is invalid: ${table}`);
  }
  if (!boundary.target.applierOwner.trim()) errors.push("organization boundary applier is unowned");
  if (!boundary.target.requiresExactDatabasePlane) errors.push("organization boundary lacks exact database-plane admission");
  if (boundary.target.defaultCreateStatus !== "draft" || !boundary.target.forbidsBusinessActivation) {
    errors.push("Studio organization onboarding can activate Neon business state");
  }
  if (!boundary.target.forbidsAuthorizationCatalogMutation) {
    errors.push("organization provisioner can mutate the authorization catalog");
  }
  for (const [guarantee, enabled] of Object.entries(boundary.commandBoundary)) {
    if (guarantee !== "schemaVersion" && enabled !== true) errors.push(`organization command guarantee disabled: ${guarantee}`);
  }

  const expectedTables: Readonly<Record<StudioNeonOrganizationResourceKind, string>> = {
    legal_entity: "master.legal_entity",
    company_code: "master.company_code",
    operating_organization: "master.operating_organization",
  };
  const seen = new Set<StudioNeonOrganizationResourceKind>();
  for (const resource of boundary.resources) {
    if (seen.has(resource.resourceKind)) errors.push(`duplicate organization boundary resource: ${resource.resourceKind}`);
    seen.add(resource.resourceKind);
    if (resource.targetTable !== expectedTables[resource.resourceKind]) {
      errors.push(`organization boundary target mismatch: ${resource.resourceKind}/${resource.targetTable}`);
    }
    const row = rows.get(resource.targetTable);
    if (!row || row.reviewStatus !== "reviewed" || row.classification !== "aggregate_root") {
      errors.push(`organization boundary target is not a reviewed aggregate: ${resource.targetTable}`);
    }
    const expectedCoordinate = scopeCoordinate[resource.createScopeKind];
    if (!expectedCoordinate || resource.createScopeCoordinateKey !== expectedCoordinate) {
      errors.push(`organization create scope coordinate missing: ${resource.resourceKind}/${resource.createScopeKind}`);
    }
    if (!resource.allowedCommandOperations.includes("apply") || resource.allowedCommandOperations.includes("revoke" as OnboardingCommandOperation)) {
      errors.push(`organization command operation is unsafe: ${resource.resourceKind}`);
    }
    if (resource.retention !== "retain_legal_and_audit" || resource.applyConstraint !== "create_draft_or_update_existing_draft") {
      errors.push(`organization onboarding lifecycle is unsafe: ${resource.resourceKind}`);
    }
    if (!resource.allowedDesiredStateFields.length || !resource.immutableAfterCreateFields.length) {
      errors.push(`organization field policy is incomplete: ${resource.resourceKind}`);
    }
    const allowedFields = new Set(resource.allowedDesiredStateFields);
    if (allowedFields.size !== resource.allowedDesiredStateFields.length) {
      errors.push(`organization desired-state field is duplicated: ${resource.resourceKind}`);
    }
    for (const field of resource.immutableAfterCreateFields) {
      if (!allowedFields.has(field)) errors.push(`organization immutable field is not allowlisted: ${resource.resourceKind}/${field}`);
    }
    for (const forbidden of ["id", "tenantId", "status", "createdBy", "updatedBy"]) {
      if (allowedFields.has(forbidden)) errors.push(`organization desired-state field is target-owned: ${resource.resourceKind}/${forbidden}`);
    }
    const activation = operations.get(`${resource.resourceKind}:activate`);
    if (!activation || activation.permissionCode !== resource.activationPermissionCode
      || !activation.requiresMfa || !activation.requiresSod
      || !["high", "critical"].includes(activation.riskTier)) {
      errors.push(`organization activation gate is incomplete: ${resource.resourceKind}`);
    }
  }
  for (const kind of Object.keys(expectedTables) as StudioNeonOrganizationResourceKind[]) {
    if (!seen.has(kind)) errors.push(`organization boundary resource missing: ${kind}`);
  }
  if (boundary.lifecycleSeparation.keycloakAdmissionMeans !== "identity_organization_and_assurance_only"
    || boundary.lifecycleSeparation.onboardingActiveMeans !== "orchestration_converged"
    || boundary.lifecycleSeparation.trustIamProjectionMeans !== "authorization_scope_ceiling_only"
    || boundary.lifecycleSeparation.neonActiveMeans !== "plane_local_business_activation") {
    errors.push("Studio and Neon organization lifecycles are conflated");
  }
  if (!boundary.requiredBeforeEnforcement.length) errors.push("organization boundary has no enforcement qualification list");
  if (boundary.target.implementationStatus !== "implemented") {
    releaseBlockers.push(`cross-plane applier not implemented: ${boundary.target.applierOwner}`);
  }
}
