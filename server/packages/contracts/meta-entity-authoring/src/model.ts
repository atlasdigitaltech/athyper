export type ChangeSetStatus = "draft" | "in_review" | "approved" | "rejected" | "abandoned" | "published";
export type AuthoringPlane = "studio" | "neon" | "mesh";

export interface MetaEntityChangeSet {
  readonly id: string;
  readonly tenantId: string | null;
  readonly entityId: string;
  readonly entityCode: string;
  readonly branchCode: string;
  readonly status: ChangeSetStatus;
  /** Canonical optimistic revision backed by metadata.entity_change_set.lock_version. */
  readonly revision: number;
  readonly createdBy: string;
  readonly submittedBy?: string;
  readonly reviewedBy?: string;
  readonly approvedBy?: string;
}

export interface MetaEntityDescriptor { readonly entityCode:string; readonly entityClass?:string; readonly ownershipModel?:string }
export interface MetaEntityField { readonly id?:string;readonly fieldKey:string;readonly description?:string;readonly dataType:string;readonly typeConfig:Readonly<Record<string,unknown>>;readonly cardinality?:string;readonly valueOrigin?:string;readonly writeMode?:string;readonly storagePath?:string;readonly defaultSpec?:Readonly<Record<string,unknown>>;readonly computationSpec?:Readonly<Record<string,unknown>>;readonly validationSpec?:Readonly<Record<string,unknown>>;readonly dataClassification?:string;readonly retentionPolicyCode?:string;readonly status?:"active"|"deprecated";readonly replacementFieldKey?:string;readonly deprecatedSinceReleaseNo?:number;readonly plannedRemovalReleaseNo?:number }
export interface MetaEntityOperation { readonly id?:string;readonly operationKey:string;readonly fieldKeys?:readonly string[];readonly operationKind:string;readonly label:string;readonly description?:string;readonly handlerKey?:string;readonly permissionCode?:string;readonly executionMode?:string;readonly idempotencyMode?:string;readonly inputSurfaceKey?:string;readonly confirmationSurfaceKey?:string;readonly resultSurfaceKey?:string;readonly requiresMfa?:boolean;readonly auditEventCode:string;readonly status?:"active"|"deprecated";readonly replacementOperationKey?:string;readonly deprecatedSinceReleaseNo?:number;readonly plannedRemovalReleaseNo?:number }
export interface MetaEntityKey { readonly id?:string;readonly keyKey:string;readonly keyKind:string;readonly uniquenessScope:string;readonly nullSemantics?:string;readonly status?:"active"|"deprecated";readonly replacementKeyKey?:string;readonly deprecatedSinceReleaseNo?:number;readonly plannedRemovalReleaseNo?:number }
export interface MetaEntityKeyField { readonly id?:string;readonly entityKeyId:string;readonly entityFieldId:string;readonly position:number }
export interface MetaEntitySearchProfile { readonly id?:string;readonly searchKey:string;readonly searchKind:string;readonly queryOperator?:string;readonly minimumQueryLength?:number;readonly languageCode?:string;readonly normalizationMode?:string;readonly isDefault?:boolean;readonly status?:"active"|"deprecated";readonly replacementSearchKey?:string;readonly deprecatedSinceReleaseNo?:number;readonly plannedRemovalReleaseNo?:number }
export interface MetaEntitySearchField { readonly id?:string;readonly entitySearchProfileId:string;readonly entityFieldId:string;readonly position:number;readonly matchMode:string;readonly weight?:number }
export interface MetaEntityRelation { readonly id?:string;readonly relationKey:string;readonly relationKind:string;readonly resolutionKind:string;readonly ownershipMode?:string;readonly mutationMode?:string;readonly onDelete?:string;readonly onUpdate?:string;readonly inverseRelationKey?:string;readonly status?:"active"|"deprecated";readonly replacementRelationKey?:string;readonly deprecatedSinceReleaseNo?:number;readonly plannedRemovalReleaseNo?:number }
export interface MetaEntityRelationTarget { readonly id?:string;readonly entityRelationId:string;readonly relationTargetKey:string;readonly targetEntityId:string;readonly targetKeyKey:string;readonly discriminatorValue?:string;readonly isDefault?:boolean }
export interface MetaEntityRelationField { readonly id?:string;readonly entityRelationTargetId:string;readonly sourceFieldId:string;readonly targetFieldKey:string;readonly position:number }
export interface MetaEntitySurface { readonly id?:string;readonly surfaceKey:string;readonly surfaceKind:string;readonly title:string;readonly description?:string;readonly layoutKind?:string;readonly layoutConfig?:Readonly<Record<string,unknown>>;readonly isDefault?:boolean;readonly status?:"active"|"deprecated";readonly replacementSurfaceKey?:string;readonly deprecatedSinceReleaseNo?:number;readonly plannedRemovalReleaseNo?:number }
export interface MetaEntitySurfaceSection { readonly id?:string;readonly entitySurfaceId:string;readonly sectionKey:string;readonly parentSectionId?:string;readonly sectionKind?:string;readonly title?:string;readonly description?:string;readonly position:number;readonly columnCount?:number;readonly collapsible?:boolean;readonly collapsedByDefault?:boolean;readonly layoutConfig?:Readonly<Record<string,unknown>> }
export interface MetaEntitySurfaceFieldBinding { readonly id?:string;readonly entitySurfaceId:string;readonly entitySurfaceSectionId?:string;readonly entityFieldId:string;readonly bindingKey:string;readonly position:number;readonly labelOverride?:string;readonly helpText?:string;readonly placeholder?:string;readonly widgetKey?:string;readonly columnSpan?:number;readonly showRequiredIndicator?:boolean;readonly displayConfig?:Readonly<Record<string,unknown>>;readonly visibilityRule?:Readonly<Record<string,unknown>>;readonly editabilityRule?:Readonly<Record<string,unknown>>;readonly status?:"active"|"deprecated" }
export interface MetaEntityOperationPermission { readonly id?:string;readonly entityOperationId:string;readonly targetPlane:"neon"|"mesh";readonly permissionCode:string;readonly permissionKind:string;readonly status?:"active"|"deprecated" }
export interface MetaEntitySurfaceOperation { readonly id?:string;readonly entitySurfaceId:string;readonly entityOperationId:string;readonly placementKey:string;readonly interactionTarget:string;readonly position:number;readonly entitySurfaceSectionId?:string;readonly selectionMode?:string;readonly labelOverride?:string;readonly iconKey?:string;readonly presentationVariant?:string;readonly confirmationSurfaceId?:string;readonly visibilityRule?:Readonly<Record<string,unknown>>;readonly status?:"active"|"deprecated" }
export interface MetaEntityOperationRule { readonly id?:string;readonly entityOperationId:string;readonly ruleKey:string;readonly decision:string;readonly priority?:number;readonly planeCode?:AuthoringPlane;readonly lifecycleStateCode?:string;readonly lifecycleTransitionCode?:string;readonly requiredCapabilityCode?:string;readonly reasonCode?:string;readonly status?:"active"|"deprecated" }
export interface MetaEntityOperationScopeBinding { readonly id?:string;readonly entityOperationId:string;readonly bindingKey:string;readonly targetPlane:"neon"|"mesh";readonly decisionMode:string;readonly scopeKind:string;readonly coordinateSource:string;readonly coordinateKey?:string;readonly resolverKey?:string;readonly missingValueBehavior?:"deny";readonly status?:"active"|"deprecated" }
export interface MetaEntityFlow { readonly id?:string;readonly flowKey:string;readonly flowKind:string;readonly title:string;readonly description?:string;readonly navigationMode?:string;readonly entryOperationId?:string;readonly completionOperationId?:string;readonly allowDraftResume?:boolean;readonly status?:"active"|"deprecated";readonly replacementFlowKey?:string;readonly deprecatedSinceReleaseNo?:number;readonly plannedRemovalReleaseNo?:number }
export interface MetaEntityFlowStep { readonly id?:string;readonly entityFlowId:string;readonly entitySurfaceId:string;readonly stepKey:string;readonly position:number;readonly titleOverride?:string;readonly description?:string;readonly entryCondition?:Readonly<Record<string,unknown>>;readonly completionCondition?:Readonly<Record<string,unknown>>;readonly isOptional?:boolean }
export interface MetaEntityPolicyBinding { readonly id?:string;readonly bindingKey:string;readonly policyDefinitionId:string;readonly entityOperationId?:string;readonly bindingStage:string;readonly enforcement?:string;readonly priority?:number;readonly inputMapping?:Readonly<Record<string,unknown>>;readonly status?:"active"|"deprecated" }
export interface MetaEntityFieldPolicyBinding extends Omit<MetaEntityPolicyBinding,"entityOperationId"> { readonly entityFieldId:string;readonly entityOperationId?:string }
export interface MetaEntityLifecycleBinding { readonly id?:string;readonly bindingKey:string;readonly entityFieldId:string;readonly targetPlane:AuthoringPlane;readonly lifecycleCode:string;readonly lifecycleRevision:number;readonly required?:boolean;readonly status?:"active"|"deprecated" }
export interface MetaEntityLifecycleOperationBinding { readonly id?:string;readonly entityLifecycleBindingId:string;readonly entityOperationId:string;readonly mappingKey:string;readonly transitionCode:string;readonly status?:"active"|"deprecated" }
export interface MetaEntityNumberingBinding { readonly id?:string;readonly bindingKey:string;readonly entityFieldId:string;readonly entityOperationId?:string;readonly targetPlane:"neon"|"mesh";readonly policyCode:string;readonly policyRevision:number;readonly assignmentMode:"automatic"|"manual";readonly required?:boolean;readonly status?:"active"|"deprecated" }
export interface MetaEntityClassProfile { readonly entityClass:string;readonly profileVersion:number;readonly fallbackName:string;readonly description:string;readonly defaultBackingKind:string;readonly defaultApiExposure:string;readonly defaultReadMode:string;readonly defaultWriteMode:string;readonly defaultConcurrencyMode:string;readonly defaultChangePolicy:string }
export interface MetaEntityRuntimeProfile { readonly id?:string;readonly profileKey?:"default";readonly backingKind:string;readonly storagePlane?:AuthoringPlane;readonly storageSchema?:string;readonly storageObject?:string;readonly apiExposure:string;readonly readMode:string;readonly writeMode:string;readonly readHandlerKey?:string;readonly writeHandlerKey?:string;readonly createMode?:string;readonly concurrencyMode?:string;readonly recordVersionFieldKey?:string;readonly tenantFieldKey?:string;readonly softDeleteFieldKey?:string;readonly draftTtlHours?:number }

export interface MetaEntityGraph {
  readonly contractSchema: "athyper.meta-entity-contract/2.1";
  readonly entity: MetaEntityDescriptor;
  readonly classProfiles?:readonly MetaEntityClassProfile[];readonly runtimeProfiles?:readonly MetaEntityRuntimeProfile[];
  readonly fields: readonly MetaEntityField[];readonly keys?:readonly MetaEntityKey[];readonly keyFields?:readonly MetaEntityKeyField[];
  readonly searchProfiles?:readonly MetaEntitySearchProfile[];readonly searchFields?:readonly MetaEntitySearchField[];
  readonly relations?:readonly MetaEntityRelation[];readonly relationTargets?:readonly MetaEntityRelationTarget[];readonly relationFields?:readonly MetaEntityRelationField[];
  readonly operations: readonly MetaEntityOperation[];readonly operationPermissions?:readonly MetaEntityOperationPermission[];readonly operationRules?:readonly MetaEntityOperationRule[];readonly operationScopeBindings?:readonly MetaEntityOperationScopeBinding[];
  readonly surfaces?: readonly MetaEntitySurface[];readonly surfaceSections?:readonly MetaEntitySurfaceSection[];readonly surfaceFieldBindings?:readonly MetaEntitySurfaceFieldBinding[];readonly surfaceOperations?:readonly MetaEntitySurfaceOperation[];
  readonly flows?:readonly MetaEntityFlow[];readonly flowSteps?:readonly MetaEntityFlowStep[];
  readonly lifecycleBindings?: readonly MetaEntityLifecycleBinding[];readonly lifecycleOperationBindings?:readonly MetaEntityLifecycleOperationBinding[];
  readonly policyBindings?: readonly MetaEntityPolicyBinding[];readonly fieldPolicyBindings?:readonly MetaEntityFieldPolicyBinding[];readonly numberingBindings?:readonly MetaEntityNumberingBinding[];
  readonly tests?: readonly ContractTestCase[];
}

export interface ContractTestCase {
  readonly key: string;
  readonly assertion: "path_exists" | "path_equals";
  readonly path: string;
  readonly expected?: unknown;
}

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ValidationReport {
  readonly deterministic: true;
  readonly contractHash: string;
  readonly issues: readonly ValidationIssue[];
}

export interface ContractTestReport {
  readonly contractHash: string;
  readonly passed: boolean;
  readonly results: readonly { readonly key: string; readonly passed: boolean; readonly message?: string }[];
}

export interface CompiledMetaEntityArtifact {
  readonly schema: "athyper.entity-runtime-descriptor/1.0";
  readonly compiler: { readonly name: "@athyper/meta-entity-compiler"; readonly version: string };
  readonly contractHash: string;
  readonly descriptorHash: string;
  readonly descriptor: Readonly<Record<string, unknown>>;
}

export interface SignedMetaEntityArtifact extends CompiledMetaEntityArtifact {
  readonly signatureAlgorithm: string;
  readonly signingKeyId: string;
  readonly signature: string;
}

export interface BreakGlassEvidence {
  readonly reason: string;
  readonly ticketReference: string;
  readonly authorizedBy: string;
  readonly occurredAt: string;
}
