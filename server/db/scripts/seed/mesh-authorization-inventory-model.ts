export const meshTableClassifications = [
  "aggregate_root",
  "aggregate_child",
  "reference_configuration_root",
  "sensitive_overlay",
  "immutable_evidence",
  "projection_derived_state",
  "technical_work_state",
  "pending_review",
] as const;

export type MeshTableClassification = typeof meshTableClassifications[number];
export type MeshReviewStatus = "reviewed" | "pending_review";
export type MeshWriterKind = "user_service" | "worker" | "projection_reconciler" | "database_only";
export type MeshPermissionKind = "entity_operation" | "capability" | "system_action";
export type MeshScopeKind = "tenant" | "network_account" | "network_relationship" | "resource";
export type MeshParticipantRule = "single_owner" | "initiator_only" | "counterparty_only" | "either_participant" | "both_participants";

export interface MeshReviewedTableDefinition {
  readonly table: string;
  readonly slice: string;
  readonly businessDomain: string;
  readonly classification: Exclude<MeshTableClassification, "pending_review">;
  readonly aggregateRoots: readonly string[];
  readonly writerKind: MeshWriterKind;
  readonly writerOwner: string;
  readonly externallyReadable: boolean;
  readonly externallyWritable: boolean;
  readonly sensitivity: "standard" | "confidential" | "restricted";
  readonly requiredScopeKinds: readonly MeshScopeKind[];
  readonly notes?: string;
}

export interface MeshOperationCoordinate {
  readonly scopeKind: MeshScopeKind;
  readonly coordinateKey: string;
  readonly coordinateRole: "target" | "actor_account" | "buyer_account" | "supplier_account" | "buyer_tenant" | "supplier_tenant";
  readonly authorizationRequired: boolean;
}

export interface MeshOperationDefinition {
  readonly entityCode: string;
  readonly operationKey: string;
  readonly permissionCode: string;
  readonly permissionKind: MeshPermissionKind;
  readonly storageRoot: string;
  readonly coordinates: readonly MeshOperationCoordinate[];
  readonly participantRule: MeshParticipantRule;
  readonly riskTier: "low" | "medium" | "high" | "critical";
  readonly requiresMfa: boolean;
  readonly requiresSod: boolean;
  readonly serviceOwner: string;
}

export interface MeshLifecycleTransition {
  readonly code: string;
  readonly from: readonly string[];
  readonly to: string;
  readonly permissionCode: string;
}

export interface MeshLifecycleDefinition {
  readonly entityCode: string;
  readonly storageRoot: string;
  readonly statusField: string;
  readonly transitions: readonly MeshLifecycleTransition[];
}

export interface MeshReviewedSlicesContract {
  readonly contractVersion: "athyper.authorization.mesh-reviewed-slices.v1";
  readonly plane: "mesh";
  readonly tables: readonly MeshReviewedTableDefinition[];
  readonly operations: readonly MeshOperationDefinition[];
  readonly lifecycles: readonly MeshLifecycleDefinition[];
}

export interface StudioMeshNetworkBoundaryContract {
  readonly contractVersion: "athyper.authorization.studio-mesh-network-boundary.v1";
  readonly source: {
    readonly plane: "studio";
    readonly orchestrationTables: readonly string[];
    readonly authorizationProjectionTables: readonly string[];
    readonly directMeshSql: false;
    readonly grantsMeshBusinessAuthority: false;
    readonly mayCreateOrAcceptRelationship: false;
  };
  readonly target: {
    readonly plane: "mesh";
    readonly applierKind: "plane_local_provisioner";
    readonly applierOwner: string;
    readonly implementationStatus: "required_not_implemented" | "implemented";
    readonly requiresExactDatabasePlane: true;
    readonly defaultNetworkAccountStatus: "pending";
    readonly forbidsAuthorizationCatalogMutation: true;
    readonly forbidsBusinessActivation: true;
    readonly forbidsRelationshipMutation: true;
  };
  readonly trustIamCeiling: {
    readonly projectedScopeKind: "network_account";
    readonly requiredCeilingMode: "exact";
    readonly networkRoleCeilingRequired: true;
    readonly relationshipScopeMode: "derived_descendant_per_participant";
    readonly missingOrSuspendedProjection: "deny";
    readonly roleCeilingViolation: "deny";
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
    readonly trustIamProjectionMeans: "network_account_and_role_ceiling_only";
    readonly meshAccountActiveMeans: "plane_local_network_activation";
    readonly meshRelationshipActiveMeans: "bilateral_participant_acceptance";
  };
  readonly resource: {
    readonly resourceKind: "network_account";
    readonly targetTable: "mesh.network_account";
    readonly createScopeKind: "tenant";
    readonly createScopeCoordinateKey: "tenantId";
    readonly allowedCommandOperations: readonly ["apply", "retain"];
    readonly retention: "retain_legal_and_audit";
    readonly applyConstraint: "create_pending_or_update_existing_pending";
    readonly allowedDesiredStateFields: readonly string[];
    readonly immutableAfterCreateFields: readonly string[];
    readonly activationPermissionCode: string;
  };
  readonly bilateralRules: {
    readonly bothAccountCoordinatesRequired: true;
    readonly bothTenantCoordinatesRequired: true;
    readonly initiatorCannotAccept: true;
    readonly bothAccountsMustBeActive: true;
    readonly relationshipMustBeActiveForExchange: true;
    readonly missingParticipantCoordinate: "deny";
  };
  readonly requiredBeforeEnforcement: readonly string[];
}

export interface MeshTableCoverageRow {
  readonly table: string;
  readonly ddlSource: string;
  readonly hasStatus: boolean;
  readonly hasVersion: boolean;
  readonly repositoryReferences: readonly string[];
  readonly writerReferences: readonly string[];
  readonly reviewStatus: MeshReviewStatus;
  readonly slice: string;
  readonly businessDomain: string | null;
  readonly classification: MeshTableClassification;
  readonly aggregateRoots: readonly string[];
  readonly writerKind: MeshWriterKind | null;
  readonly writerOwner: string | null;
  readonly externallyReadable: boolean | null;
  readonly externallyWritable: boolean | null;
  readonly sensitivity: "standard" | "confidential" | "restricted" | null;
  readonly requiredScopeKinds: readonly MeshScopeKind[];
  readonly notes?: string;
}

export interface MeshRlsQualification {
  readonly broadParticipantForAllTables: readonly string[];
  readonly currentUserBroadWriteTables: readonly string[];
}

export interface MeshInventoryValidation {
  readonly errors: readonly string[];
  readonly releaseBlockers: readonly string[];
}

const canonicalPermission = /^mesh\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const relation = /^(master|document|mesh)\.[a-z][a-z0-9_]*$/;
const rootClass = new Set<MeshTableClassification>(["aggregate_root", "reference_configuration_root"]);

export function validateMeshAuthorizationInventory(input: {
  readonly discoveredTables: readonly string[];
  readonly coverage: readonly MeshTableCoverageRow[];
  readonly contract: MeshReviewedSlicesContract;
  readonly networkBoundary?: StudioMeshNetworkBoundaryContract;
  readonly rlsQualification?: MeshRlsQualification;
  readonly strict?: boolean;
}): MeshInventoryValidation {
  const errors: string[] = [];
  const releaseBlockers: string[] = [];
  const discovered = new Set(input.discoveredTables);
  const rows = new Map<string, MeshTableCoverageRow>();
  for (const row of input.coverage) {
    if (!relation.test(row.table)) errors.push(`invalid table coordinate: ${row.table}`);
    if (rows.has(row.table)) errors.push(`duplicate coverage row: ${row.table}`);
    rows.set(row.table, row);
  }
  for (const table of discovered) if (!rows.has(table)) errors.push(`unclassified table: ${table}`);
  for (const table of rows.keys()) if (!discovered.has(table)) errors.push(`coverage table is not present in Mesh DDL: ${table}`);

  const reviewed = new Map<string, MeshReviewedTableDefinition>();
  for (const definition of input.contract.tables) {
    if (reviewed.has(definition.table)) errors.push(`duplicate reviewed table: ${definition.table}`);
    reviewed.set(definition.table, definition);
    if (!discovered.has(definition.table)) errors.push(`reviewed table is not present in Mesh DDL: ${definition.table}`);
    if (!definition.writerOwner.trim()) errors.push(`unowned writer: ${definition.table}`);
    if (!definition.aggregateRoots.length) errors.push(`reviewed table has no aggregate root: ${definition.table}`);
    if (!definition.requiredScopeKinds.length) errors.push(`reviewed table has no scope: ${definition.table}`);
  }
  for (const definition of input.contract.tables) {
    for (const coordinate of definition.aggregateRoots) {
      const root = reviewed.get(coordinate);
      if (!root) errors.push(`aggregate root is not reviewed: ${definition.table}/${coordinate}`);
      else if (!rootClass.has(root.classification)) errors.push(`aggregate root has an invalid classification: ${definition.table}/${coordinate}`);
    }
  }
  for (const row of input.coverage) {
    if (row.reviewStatus === "reviewed") {
      if (row.classification === "pending_review") errors.push(`reviewed table is unclassified: ${row.table}`);
      if (!row.writerOwner || !row.writerKind) errors.push(`unowned writer: ${row.table}`);
      if (!row.aggregateRoots.length) errors.push(`reviewed table has no aggregate root: ${row.table}`);
    } else releaseBlockers.push(`pending table review: ${row.table}`);
  }

  const operations = new Map<string, MeshOperationDefinition>();
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
    else if (!rootClass.has(storage.classification)) errors.push(`child published as generic CRUD: ${operation.storageRoot}/${operation.operationKey}`);
    if (!operation.coordinates.length) errors.push(`operation has no scope coordinates: ${key}`);
    const coordinateKeys = new Set<string>();
    for (const coordinate of operation.coordinates) {
      if (!coordinate.coordinateKey.trim()) errors.push(`operation scope coordinate missing: ${key}/${coordinate.scopeKind}`);
      if (coordinateKeys.has(coordinate.coordinateKey)) errors.push(`duplicate operation coordinate: ${key}/${coordinate.coordinateKey}`);
      coordinateKeys.add(coordinate.coordinateKey);
    }
    if (!operation.coordinates.some((coordinate) => coordinate.authorizationRequired)) {
      errors.push(`operation has no authorization coordinate: ${key}`);
    }
    if (!operation.serviceOwner.trim()) errors.push(`operation has no service owner: ${key}`);
    if (operation.riskTier === "critical" && (!operation.requiresMfa || !operation.requiresSod)) {
      errors.push(`critical operation lacks MFA or SoD: ${key}`);
    }
    validateNetworkOperation(operation, errors);
  }

  for (const lifecycle of input.contract.lifecycles) {
    const storage = rows.get(lifecycle.storageRoot);
    if (!storage || storage.classification !== "aggregate_root") errors.push(`lifecycle root is not a reviewed aggregate: ${lifecycle.storageRoot}`);
    if (!lifecycle.statusField.trim()) errors.push(`lifecycle status field is missing: ${lifecycle.entityCode}`);
    const transitionCodes = new Set<string>();
    for (const transition of lifecycle.transitions) {
      if (transitionCodes.has(transition.code)) errors.push(`duplicate lifecycle transition: ${lifecycle.entityCode}/${transition.code}`);
      transitionCodes.add(transition.code);
      if (!transition.from.length || !transition.to.trim()) errors.push(`incomplete lifecycle transition: ${lifecycle.entityCode}/${transition.code}`);
      const operation = operations.get(`${lifecycle.entityCode}:${transition.code}`);
      if (!operation || operation.permissionCode !== transition.permissionCode) errors.push(`lifecycle operation binding missing: ${lifecycle.entityCode}/${transition.code}`);
      else if (operation.storageRoot !== lifecycle.storageRoot) errors.push(`lifecycle operation storage mismatch: ${lifecycle.entityCode}/${transition.code}`);
    }
  }

  if (input.networkBoundary) validateNetworkBoundary(input.networkBoundary, rows, operations, errors, releaseBlockers);
  if (input.rlsQualification) {
    if (input.rlsQualification.broadParticipantForAllTables.length) {
      releaseBlockers.push(`broad participant FOR ALL mutation RLS: ${input.rlsQualification.broadParticipantForAllTables.join(", ")}`);
    }
    if (input.rlsQualification.currentUserBroadWriteTables.length) {
      releaseBlockers.push(`CURRENT_USER broad-write RLS on reviewed tables: ${input.rlsQualification.currentUserBroadWriteTables.join(", ")}`);
    }
  }
  if (input.strict && releaseBlockers.length) errors.push(...releaseBlockers);
  return { errors: [...new Set(errors)].sort(), releaseBlockers: [...new Set(releaseBlockers)].sort() };
}

function validateNetworkOperation(operation: MeshOperationDefinition, errors: string[]): void {
  const key = `${operation.entityCode}:${operation.operationKey}`;
  const coordinates = new Map(operation.coordinates.map((coordinate) => [coordinate.coordinateKey, coordinate]));
  if (operation.entityCode === "network_account") {
    const expected = operation.operationKey === "create" ? "tenantId" : "networkAccountId";
    if (!coordinates.get(expected)?.authorizationRequired) errors.push(`network-account authorization coordinate missing: ${key}/${expected}`);
    if (operation.participantRule !== "single_owner") errors.push(`network-account operation has a bilateral participant rule: ${key}`);
  }
  if (operation.entityCode !== "network_relationship") return;
  const expectedContext = [
    ["actorNetworkAccountId", "network_account", "actor_account"],
    ["buyerNetworkAccountId", "network_account", "buyer_account"],
    ["supplierNetworkAccountId", "network_account", "supplier_account"],
    ["buyerTenantId", "tenant", "buyer_tenant"],
    ["supplierTenantId", "tenant", "supplier_tenant"],
  ] as const;
  for (const [coordinateKey, scopeKind, coordinateRole] of expectedContext) {
    const coordinate = coordinates.get(coordinateKey);
    if (!coordinate) errors.push(`bilateral relationship coordinate missing: ${key}/${coordinateKey}`);
    else if (coordinate.scopeKind !== scopeKind || coordinate.coordinateRole !== coordinateRole) errors.push(`bilateral relationship coordinate is misbound: ${key}/${coordinateKey}`);
  }
  if (!coordinates.get("actorNetworkAccountId")?.authorizationRequired) errors.push(`relationship actor account coordinate missing: ${key}/actorNetworkAccountId`);
  if (operation.operationKey === "request" && coordinates.has("networkRelationshipId")) {
    errors.push(`relationship request contains a nonexistent relationship coordinate: ${key}`);
  } else if (operation.operationKey !== "request" && !coordinates.get("networkRelationshipId")?.authorizationRequired) {
    errors.push(`relationship authorization coordinate missing: ${key}/networkRelationshipId`);
  } else if (operation.operationKey !== "request") {
    const relationship = coordinates.get("networkRelationshipId")!;
    if (relationship.scopeKind !== "network_relationship" || relationship.coordinateRole !== "target") errors.push(`relationship target coordinate is misbound: ${key}`);
  }
  const expectedRules: Readonly<Record<string, MeshParticipantRule>> = {
    read: "either_participant",
    request: "initiator_only",
    accept: "counterparty_only",
    reject: "counterparty_only",
    suspend: "either_participant",
    resume: "both_participants",
    terminate: "either_participant",
  };
  if (expectedRules[operation.operationKey] !== operation.participantRule) errors.push(`unsafe relationship participant rule: ${key}`);
  if (["create", "update", "delete", "manage"].includes(operation.operationKey)) errors.push(`generic relationship mutation is forbidden: ${key}`);
  if (["accept", "resume"].includes(operation.operationKey) && (!operation.requiresMfa || !operation.requiresSod)) errors.push(`bilateral activation lacks MFA or SoD: ${key}`);
}

function validateNetworkBoundary(
  boundary: StudioMeshNetworkBoundaryContract,
  rows: ReadonlyMap<string, MeshTableCoverageRow>,
  operations: ReadonlyMap<string, MeshOperationDefinition>,
  errors: string[],
  releaseBlockers: string[],
): void {
  if (boundary.contractVersion !== "athyper.authorization.studio-mesh-network-boundary.v1") errors.push("invalid Studio/Mesh network boundary identity");
  if (boundary.source.plane !== "studio" || boundary.target.plane !== "mesh") errors.push("network boundary has a wrong-plane source or target");
  if (boundary.source.directMeshSql !== false) errors.push("Studio network boundary permits direct Mesh SQL");
  if (boundary.source.grantsMeshBusinessAuthority !== false) errors.push("Studio network boundary grants Mesh business authority");
  for (const table of boundary.source.orchestrationTables) if (!/^onboarding\.[a-z][a-z0-9_]*$/.test(table)) errors.push(`network orchestration source is invalid: ${table}`);
  for (const table of boundary.source.authorizationProjectionTables) if (!/^trustiam\.[a-z][a-z0-9_]*$/.test(table)) errors.push(`network projection source is invalid: ${table}`);
  if (boundary.source.mayCreateOrAcceptRelationship !== false || !boundary.target.forbidsRelationshipMutation) errors.push("Studio onboarding can mutate a bilateral Mesh relationship");
  if (!boundary.target.applierOwner.trim()) errors.push("network boundary applier is unowned");
  if (!boundary.target.requiresExactDatabasePlane) errors.push("network boundary lacks exact database-plane admission");
  if (boundary.target.defaultNetworkAccountStatus !== "pending" || !boundary.target.forbidsBusinessActivation) errors.push("Studio network onboarding can activate Mesh business state");
  if (!boundary.target.forbidsAuthorizationCatalogMutation) errors.push("network provisioner can mutate the authorization catalog");
  if (boundary.commandBoundary.schemaVersion !== 1) errors.push("network command schema version is unsupported");
  for (const [guarantee, enabled] of Object.entries(boundary.commandBoundary)) {
    if (guarantee !== "schemaVersion" && enabled !== true) errors.push(`network command guarantee disabled: ${guarantee}`);
  }
  if (boundary.trustIamCeiling.projectedScopeKind !== "network_account"
    || boundary.trustIamCeiling.requiredCeilingMode !== "exact"
    || !boundary.trustIamCeiling.networkRoleCeilingRequired
    || boundary.trustIamCeiling.relationshipScopeMode !== "derived_descendant_per_participant"
    || boundary.trustIamCeiling.missingOrSuspendedProjection !== "deny"
    || boundary.trustIamCeiling.roleCeilingViolation !== "deny") errors.push("TrustIAM Mesh scope ceiling is incomplete");
  if (boundary.resource.resourceKind !== "network_account"
    || boundary.resource.targetTable !== "mesh.network_account"
    || rows.get(boundary.resource.targetTable)?.classification !== "aggregate_root") errors.push("network boundary target is not a reviewed aggregate");
  if (boundary.resource.createScopeKind !== "tenant" || boundary.resource.createScopeCoordinateKey !== "tenantId") errors.push("network-account create scope coordinate missing");
  if (boundary.resource.applyConstraint !== "create_pending_or_update_existing_pending"
    || boundary.resource.retention !== "retain_legal_and_audit"
    || boundary.resource.allowedCommandOperations.join(",") !== "apply,retain") errors.push("network onboarding lifecycle is unsafe");
  const allowedFields = new Set(boundary.resource.allowedDesiredStateFields);
  if (!allowedFields.size || !boundary.resource.immutableAfterCreateFields.length) errors.push("network-account field policy is incomplete");
  if (allowedFields.size !== boundary.resource.allowedDesiredStateFields.length) errors.push("network-account desired-state field is duplicated");
  for (const field of boundary.resource.immutableAfterCreateFields) if (!allowedFields.has(field)) errors.push(`network-account immutable field is not allowlisted: ${field}`);
  for (const forbidden of ["id", "tenantId", "status", "createdBy", "updatedBy"]) if (allowedFields.has(forbidden)) errors.push(`network-account desired-state field is target-owned: ${forbidden}`);
  const activation = operations.get("network_account:activate");
  if (!activation || activation.permissionCode !== boundary.resource.activationPermissionCode || !activation.requiresMfa || !activation.requiresSod) errors.push("network-account activation gate is incomplete");
  if (!Object.values(boundary.bilateralRules).every((value) => value === true || value === "deny")) errors.push("bilateral relationship rule is incomplete");
  if (boundary.lifecycleSeparation.keycloakAdmissionMeans !== "identity_organization_and_assurance_only"
    || boundary.lifecycleSeparation.onboardingActiveMeans !== "orchestration_converged"
    || boundary.lifecycleSeparation.trustIamProjectionMeans !== "network_account_and_role_ceiling_only"
    || boundary.lifecycleSeparation.meshAccountActiveMeans !== "plane_local_network_activation"
    || boundary.lifecycleSeparation.meshRelationshipActiveMeans !== "bilateral_participant_acceptance") errors.push("Studio and Mesh network lifecycles are conflated");
  if (!boundary.requiredBeforeEnforcement.length) errors.push("network boundary has no enforcement qualification list");
  if (boundary.target.implementationStatus !== "implemented") releaseBlockers.push(`cross-plane applier not implemented: ${boundary.target.applierOwner}`);
}
