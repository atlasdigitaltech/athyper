import {
  ENTITY_LIST_RENDERABLE_MODES,
  ENTITY_LIST_VIEW_MODES,
} from "@athyper/contract-platform-entity-list";
import { deriveCanonicalRelations } from "./canonical-relations.js";
import { parsePublishedLearningFixtureSet } from "./published-learning-fixture-schema.js";
import {
  parseRecordMutationPolicy,
  parseRecordPredicates,
} from "@athyper/server-contract-metadata";
import { parseRecordOwnerAccess } from "@athyper/server-contract-metadata";
import { collectionPublicationFromGraph } from "@athyper/server-contract-publication";
import {
  COMMON_REFERENCE_VIEW_PERMISSION,
  assertCommonReferenceGraph,
} from "@athyper/server-contract-metadata";
import {
  capabilityArtifactMembers,
  capabilityAuthoringMode,
  PublicationContractError,
  parseCapabilityBinding,
  parseCapabilityDeclaration,
} from "@athyper/server-contract-publication";
import {
  compileEntityIntakeSurfaces,
  parsePresentationLocalization,
  isCanonicalEntityCode,
} from "@athyper/contract-platform-entity-runtime";
import { compileEntityAi } from "./entity-ai.js";
import { compileRuntimeRestoration } from "./runtime-restoration.js";
import {
  compileEntityAuthorization,
  compileEntityAuthorizationRuntime,
} from "./entity-authorization.js";
import { parseEntityDirectoryScope } from "@athyper/server-contract-metadata";
import {
  parseEntityFormPresentation,
  parseEntityRecordPresentation,
  validateRecordPresentationReferences,
  validateRelatedPresentationOwner,
} from "@athyper/contract-platform-entity-runtime";
import {
  compileCollectionRelationship,
  compileCollectionCompilation,
} from "./collection-relationship.js";
import { compileListExperience } from "./list-experience.js";
import { createHash } from "node:crypto";
import type {
  CompiledMetaEntityArtifact,
  ContractTestReport,
  MetaEntityGraph,
  ValidationIssue,
  ValidationReport,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  entityFieldFilterOperators,
  type EntityFieldType,
  type EntityListFilterOperator,
} from "@athyper/server-contract-metadata";

export const META_ENTITY_COMPILER_VERSION = "1.1.0";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : canonicalJson(value))
    .digest("hex");
}

export function validateGraph(graph: MetaEntityGraph): ValidationReport {
  const issues: ValidationIssue[] = [];
  const contractHash = sha256(graph);
  if (!isObject(graph))
    return {
      deterministic: true,
      contractHash,
      issues: [
        {
          code: "CONTRACT_SCHEMA_INVALID",
          path: "contractSchema",
          message:
            "A supported graph schema matching its normalized members is required",
        },
      ],
    };
  if (
    [
      "athyper.meta-entity-contract/2.4",
      "athyper.meta-entity-contract/2.5",
    ].includes(String(graph.contractSchema))
  )
    return {
      deterministic: true,
      contractHash,
      issues: [
        {
          code: "NATIVE_GRAPH_RELEASE_COMPILATION_NOT_QUALIFIED",
          path: "contractSchema",
          message:
            "Native whole-graph release lowering is required; legacy decoding cannot publish this source.",
        },
      ],
    };
  if (
    graph.contractSchema !==
    (graph.referenceMembers
      ? "athyper.meta-entity-contract/2.3"
      : graph.ownedLabels
        ? "athyper.meta-entity-contract/2.2"
        : "athyper.meta-entity-contract/2.1")
  ) {
    issues.push({
      code: "CONTRACT_SCHEMA_INVALID",
      path: "contractSchema",
      message:
        "A supported graph schema matching its normalized members is required",
    });
  }
  if (!isObject(graph.entity))
    issues.push({
      code: "GRAPH_BRANCH_INVALID",
      path: "entity",
      message: "entity must be an object",
    });
  for (const branch of REQUIRED_ARRAY_BRANCHES)
    if (!Array.isArray(Reflect.get(graph, branch)))
      issues.push({
        code: "GRAPH_BRANCH_INVALID",
        path: branch,
        message: `${branch} must be an array`,
      });
  for (const branch of OPTIONAL_ARRAY_BRANCHES) {
    const value = Reflect.get(graph, branch);
    if (value !== undefined && !Array.isArray(value))
      issues.push({
        code: "GRAPH_BRANCH_INVALID",
        path: branch,
        message: `${branch} must be an array`,
      });
  }
  if (issues.length)
    return { deterministic: true, contractHash, issues: sorted(issues) };
  try {
    graph = deriveCanonicalRelations(graph);
  } catch (error) {
    return {
      deterministic: true,
      contractHash,
      issues: [
        {
          code: "ENTITY_RELATION_INVALID",
          path: "relations",
          message: (error as Error).message,
        },
      ],
    };
  }
  const entityCode = graph.entity.entityCode;
  const capabilityKeys = new Set<string>();
  for (const [index, member] of (graph.capabilities ?? []).entries()) {
    try {
      if (
        !member ||
        !["comments", "attachments", "activity"].includes(
          member.capabilityKey,
        ) ||
        capabilityKeys.has(member.capabilityKey)
      )
        throw new Error("Unknown or duplicate capability");
      capabilityAuthoringMode(member, `capabilities[${index}]`);
      capabilityKeys.add(member.capabilityKey);
      capabilityArtifactMembers(entityCode, [member]);
    } catch (error) {
      issues.push({
        code:
          error instanceof PublicationContractError
            ? error.code
            : "ENTITY_CAPABILITY_INVALID",
        path: `capabilities[${index}]`,
        message: error instanceof Error ? error.message : "Invalid capability",
      });
    }
  }
  if (
    graph.entity.entityClass !== undefined &&
    ![
      "business",
      "configuration",
      "reference",
      "process",
      "projection",
      "technical",
    ].includes(graph.entity.entityClass)
  )
    issues.push({
      code: "ENTITY_CLASS_INVALID",
      path: "entity.entityClass",
      message: "Entity class must match the native storage domain",
    });
  for (const [index, surface] of (graph.surfaces ?? []).entries())
    if (
      surface.layoutKind !== undefined &&
      !["flow", "grid", "stack", "tabs"].includes(String(surface.layoutKind))
    )
      issues.push({
        code: "SURFACE_LAYOUT_INVALID",
        path: `surfaces.${index}.layoutKind`,
        message: "Surface layout must match the native storage domain",
      });
  if (!isCanonicalEntityCode(entityCode)) {
    issues.push({
      code: "ENTITY_CODE_INVALID",
      path: "entity.entityCode",
      message: "A canonical entity code is required",
    });
  }
  uniqueKeys(graph.fields, "fieldKey", "fields", issues);
  uniqueKeys(graph.operations, "operationKey", "operations", issues);
  uniqueKeys(graph.keys ?? [], "keyKey", "keys", issues);
  uniqueKeys(graph.searchProfiles ?? [], "searchKey", "searchProfiles", issues);
  uniqueKeys(graph.relations ?? [], "relationKey", "relations", issues);
  uniqueKeys(graph.surfaces ?? [], "surfaceKey", "surfaces", issues);
  uniqueKeys(graph.flows ?? [], "flowKey", "flows", issues);
  uniqueKeys(
    graph.operationScopeBindings ?? [],
    "bindingKey",
    "operationScopeBindings",
    issues,
  );
  uniqueKeys(
    graph.policyBindings ?? [],
    "bindingKey",
    "policyBindings",
    issues,
  );
  uniqueKeys(
    graph.fieldPolicyBindings ?? [],
    "bindingKey",
    "fieldPolicyBindings",
    issues,
  );
  uniqueKeys(
    graph.lifecycleBindings ?? [],
    "bindingKey",
    "lifecycleBindings",
    issues,
  );
  uniqueKeys(
    graph.lifecycleOperationBindings ?? [],
    "mappingKey",
    "lifecycleOperationBindings",
    issues,
  );
  uniqueKeys(
    graph.numberingBindings ?? [],
    "bindingKey",
    "numberingBindings",
    issues,
  );
  uniqueKeys(
    graph.changeCaseBindings ?? [],
    "bindingKey",
    "changeCaseBindings",
    issues,
  );
  uniqueKeys(
    graph.fieldReferenceBindings ?? [],
    "bindingKey",
    "fieldReferenceBindings",
    issues,
  );
  uniqueKeys(
    graph.materializationBindings ?? [],
    "bindingKey",
    "materializationBindings",
    issues,
  );
  boundedRows(graph, issues);
  requiredGraphValues(graph, issues);
  const fieldKeys = new Set(
    graph.fields
      .map((field) => field.fieldKey)
      .filter((key): key is string => typeof key === "string"),
  );
  for (const [index, operation] of graph.operations.entries()) {
    for (const key of stringArray(operation.fieldKeys)) {
      if (!fieldKeys.has(key))
        issues.push({
          code: "OPERATION_FIELD_MISSING",
          path: `operations.${index}.fieldKeys`,
          message: `Unknown field ${key}`,
        });
    }
  }
  references(
    graph.keyFields,
    "entityKeyId",
    ids(graph.keys),
    "keyFields",
    issues,
  );
  references(
    graph.keyFields,
    "entityFieldId",
    ids(graph.fields),
    "keyFields",
    issues,
  );
  references(
    graph.searchFields,
    "entitySearchProfileId",
    ids(graph.searchProfiles),
    "searchFields",
    issues,
  );
  references(
    graph.searchFields,
    "entityFieldId",
    ids(graph.fields),
    "searchFields",
    issues,
  );
  references(
    graph.relationTargets,
    "entityRelationId",
    ids(graph.relations),
    "relationTargets",
    issues,
  );
  references(
    graph.relationFields,
    "entityRelationTargetId",
    ids(graph.relationTargets),
    "relationFields",
    issues,
  );
  references(
    graph.relationFields,
    "sourceFieldId",
    ids(graph.fields),
    "relationFields",
    issues,
  );
  references(
    graph.surfaceSections,
    "entitySurfaceId",
    ids(graph.surfaces),
    "surfaceSections",
    issues,
  );
  references(
    graph.surfaceFieldBindings,
    "entitySurfaceId",
    ids(graph.surfaces),
    "surfaceFieldBindings",
    issues,
  );
  references(
    graph.surfaceFieldBindings,
    "entityFieldId",
    ids(graph.fields),
    "surfaceFieldBindings",
    issues,
  );
  references(
    graph.surfaceOperations,
    "entitySurfaceId",
    ids(graph.surfaces),
    "surfaceOperations",
    issues,
  );
  references(
    graph.surfaceOperations,
    "entityOperationId",
    ids(graph.operations),
    "surfaceOperations",
    issues,
  );
  references(
    graph.operationPermissions,
    "entityOperationId",
    ids(graph.operations),
    "operationPermissions",
    issues,
  );
  references(
    graph.operationRules,
    "entityOperationId",
    ids(graph.operations),
    "operationRules",
    issues,
  );
  references(
    graph.operationScopeBindings,
    "entityOperationId",
    ids(graph.operations),
    "operationScopeBindings",
    issues,
  );
  references(
    graph.changeCaseBindings,
    "entityOperationId",
    ids(graph.operations),
    "changeCaseBindings",
    issues,
  );
  references(
    graph.operationContextRequirements,
    "entityOperationId",
    ids(graph.operations),
    "operationContextRequirements",
    issues,
  );
  references(
    graph.fieldReferenceBindings,
    "entityFieldId",
    ids(graph.fields),
    "fieldReferenceBindings",
    issues,
  );
  references(
    graph.materializationFieldMappings,
    "entityMaterializationBindingId",
    ids(graph.materializationBindings),
    "materializationFieldMappings",
    issues,
  );
  const materializationKeys = new Set(
    (graph.materializationBindings ?? []).map((binding) => binding.bindingKey),
  );
  const workflowKeys = new Set((graph.flows ?? []).map((flow) => flow.flowKey));
  for (const [index, binding] of (graph.changeCaseBindings ?? []).entries()) {
    if (binding.workflowKey && !workflowKeys.has(binding.workflowKey))
      issues.push({
        code: "CHANGE_CASE_WORKFLOW_MISSING",
        path: `changeCaseBindings.${index}.workflowKey`,
        message: `Unknown workflow ${binding.workflowKey}`,
      });
    if (
      binding.materializationBindingKey &&
      !materializationKeys.has(binding.materializationBindingKey)
    )
      issues.push({
        code: "CHANGE_CASE_MATERIALIZATION_MISSING",
        path: `changeCaseBindings.${index}.materializationBindingKey`,
        message: `Unknown materialization binding ${binding.materializationBindingKey}`,
      });
  }
  for (const [index, binding] of (
    graph.fieldReferenceBindings ?? []
  ).entries()) {
    const configured =
      Number(Boolean(binding.targetEntityCode)) +
      Number(Boolean(binding.lookupDomain)) +
      Number(Boolean(binding.resolverKey));
    if (configured !== 1)
      issues.push({
        code: "FIELD_REFERENCE_BINDING_INVALID",
        path: `fieldReferenceBindings.${index}`,
        message:
          "Exactly one reference target, lookup domain, or resolver is required",
      });
  }
  references(
    graph.flowSteps,
    "entityFlowId",
    ids(graph.flows),
    "flowSteps",
    issues,
  );
  references(
    graph.flowSteps,
    "entitySurfaceId",
    ids(graph.surfaces),
    "flowSteps",
    issues,
  );
  references(
    graph.fieldPolicyBindings,
    "entityFieldId",
    ids(graph.fields),
    "fieldPolicyBindings",
    issues,
  );
  references(
    graph.lifecycleBindings,
    "entityFieldId",
    ids(graph.fields),
    "lifecycleBindings",
    issues,
  );
  references(
    graph.numberingBindings,
    "entityFieldId",
    ids(graph.fields),
    "numberingBindings",
    issues,
  );
  optionalReferences(
    graph.surfaceFieldBindings,
    "entitySurfaceSectionId",
    ids(graph.surfaceSections),
    "surfaceFieldBindings",
    issues,
  );
  optionalReferences(
    graph.surfaceOperations,
    "entitySurfaceSectionId",
    ids(graph.surfaceSections),
    "surfaceOperations",
    issues,
  );
  optionalReferences(
    graph.flows,
    "entryOperationId",
    ids(graph.operations),
    "flows",
    issues,
  );
  optionalReferences(
    graph.flows,
    "completionOperationId",
    ids(graph.operations),
    "flows",
    issues,
  );
  optionalReferences(
    graph.surfaceSections,
    "parentSectionId",
    ids(graph.surfaceSections),
    "surfaceSections",
    issues,
  );
  optionalReferences(
    graph.surfaceOperations,
    "confirmationSurfaceId",
    ids(graph.surfaces),
    "surfaceOperations",
    issues,
  );
  references(
    graph.lifecycleOperationBindings,
    "entityLifecycleBindingId",
    ids(graph.lifecycleBindings),
    "lifecycleOperationBindings",
    issues,
  );
  references(
    graph.lifecycleOperationBindings,
    "entityOperationId",
    ids(graph.operations),
    "lifecycleOperationBindings",
    issues,
  );
  optionalReferences(
    graph.policyBindings,
    "entityOperationId",
    ids(graph.operations),
    "policyBindings",
    issues,
  );
  optionalReferences(
    graph.fieldPolicyBindings,
    "entityOperationId",
    ids(graph.operations),
    "fieldPolicyBindings",
    issues,
  );
  optionalReferences(
    graph.numberingBindings,
    "entityOperationId",
    ids(graph.operations),
    "numberingBindings",
    issues,
  );
  validateOwners(graph, issues);
  for (const surface of graph.surfaces ?? []) {
    for (const marker of ["baselineImport", "authorizationSuccessor"]) {
      if (
        Object.prototype.hasOwnProperty.call(surface.layoutConfig ?? {}, marker)
      )
        issues.push({
          code: "IMPORTED_BASELINE_PUBLICATION_RETIRED",
          path: `surfaces.layoutConfig.${marker}`,
          message:
            "Create a native successor with current resource and authorization bindings; imported-baseline publication is retired.",
        });
    }
  }
  validateListSurfaces(graph, issues);
  try {
    compileEntityIntakeSurfaces(graph as unknown as Record<string, unknown>);
  } catch (cause) {
    issues.push({
      code: "INTAKE_SURFACE_INVALID",
      path: "surfaces",
      message:
        cause instanceof Error ? cause.message : "Invalid intake surface",
    });
  }
  try {
    compileEntityAuthorization(graph);
    compileEntityAuthorizationRuntime(graph);
  } catch (cause) {
    issues.push({
      code: "ENTITY_AUTHORIZATION_INVALID",
      path: "surfaces.authorization",
      message:
        cause instanceof Error
          ? cause.message
          : "Invalid authorization profile",
    });
  }
  try {
    compileCollectionRelationship(graph);
  } catch (cause) {
    issues.push({
      code: "COLLECTION_RELATIONSHIP_INVALID",
      path: "surfaces.layoutConfig.collectionRelationship",
      message:
        cause instanceof Error
          ? cause.message
          : "Invalid collection relationship",
    });
  }
  try {
    compileEntityAi(graph);
  } catch (cause) {
    issues.push({
      code: "ENTITY_AI_INVALID",
      path: "surfaces.layoutConfig.ai",
      message:
        cause instanceof Error ? cause.message : "Invalid entity AI contract",
    });
  }
  try {
    compileRuntimeRestoration({
      ...graph,
      authorization: compileEntityAuthorization(graph),
      authorizationRuntime: compileEntityAuthorizationRuntime(graph),
      ai: compileEntityAi(graph),
    });
  } catch (cause) {
    issues.push({
      code: "RUNTIME_RESTORATION_INVALID",
      path: "surfaces.layoutConfig.runtimeRestoration",
      message:
        cause instanceof Error ? cause.message : "Invalid restoration payload",
    });
  }
  return { deterministic: true, contractHash, issues: sorted(issues) };
}

export function runContractTests(graph: MetaEntityGraph): ContractTestReport {
  const results = [...(graph.tests ?? [])]
    .sort((a, b) => compareText(a.key, b.key))
    .map((test) => {
      if (test.assertion === "learning_fixture_set") {
        try {
          if (test.path !== "entity")
            throw new TypeError("Fixture declaration path must be entity");
          parsePublishedLearningFixtureSet(
            test.expected,
            String(graph.entity.entityCode),
          );
          return { key: test.key, passed: true };
        } catch {
          return {
            key: test.key,
            passed: false,
            message: "Invalid learning fixture declaration",
          };
        }
      }
      const actual = readPath(graph, test.path);
      const passed =
        test.assertion === "path_exists"
          ? actual !== undefined
          : canonicalJson(actual) === canonicalJson(test.expected);
      return {
        key: test.key,
        passed,
        ...(passed ? {} : { message: `Assertion failed at ${test.path}` }),
      };
    });
  return {
    contractHash: sha256(graph),
    passed: results.every((result) => result.passed),
    results,
  };
}

export function compileGraph(
  graph: MetaEntityGraph,
): CompiledMetaEntityArtifact {
  if (graph.referenceMembers)
    throw new Error("NORMALIZED_REFERENCE_PUBLICATION_NOT_QUALIFIED");
  if (graph.ownedLabels)
    throw new Error("NORMALIZED_LABEL_PUBLICATION_NOT_QUALIFIED");
  const validation = validateGraph(graph);
  if (validation.issues.length) throw new Error("META_ENTITY_GRAPH_INVALID");
  graph = deriveCanonicalRelations(graph);
  const commonReference = (graph.operationPermissions ?? []).some(
    (p) => p.permissionCode === COMMON_REFERENCE_VIEW_PERMISSION,
  );
  if (commonReference) assertCommonReferenceGraph(graph);
  const ai = compileEntityAi(graph);
  const authorization = compileEntityAuthorization(graph);
  const authorizationRuntime = compileEntityAuthorizationRuntime(graph);
  const listPresentation = compileListPresentation(graph);
  const recordSurfaces = (graph.surfaces ?? []).filter(
    (surface) =>
      surface.status !== "deprecated" &&
      surface.layoutConfig?.["recordPresentation"] !== undefined,
  );
  if (recordSurfaces.length > 1)
    throw new Error("Only one record presentation may be published per entity");
  const recordPresentation = recordSurfaces[0]
    ? parseEntityRecordPresentation(
        recordSurfaces[0].layoutConfig!["recordPresentation"],
      )
    : undefined;
  if (recordPresentation)
    validateRecordPresentationReferences(
      recordPresentation,
      graph.fields.map((field) => field.fieldKey),
      graph.operations
        .filter((operation) => operation.status !== "deprecated")
        .map((operation) => operation.operationKey),
    );
  if (recordPresentation?.related)
    validateRelatedPresentationOwner(
      recordPresentation.related,
      graph.entity.entityCode,
      recordPresentation.entityRelationships,
    );
  const formBindings = (graph.surfaces ?? []).filter(
    (surface) =>
      surface.status !== "deprecated" &&
      surface.layoutConfig?.formPresentation !== undefined,
  );
  if (formBindings.length > 1) throw TypeError("Ambiguous form presentation");
  const formPresentation = formBindings[0]
    ? parseEntityFormPresentation(
        formBindings[0].layoutConfig!.formPresentation,
        graph.fields.map((field) => field.fieldKey),
      )
    : undefined;
  const directoryRules = (graph.surfaces ?? []).flatMap((surface) =>
    surface.layoutConfig?.["directoryScope"] === undefined
      ? []
      : [parseEntityDirectoryScope(surface.layoutConfig["directoryScope"])],
  );
  for (const rule of directoryRules) {
    for (const key of [
      rule.fieldBinding?.companyField,
      rule.fieldBinding?.organizationField,
    ]) {
      if (key === undefined) continue;
      const field = graph.fields.find((field) => field.fieldKey === key);
      if (
        !field ||
        field.dataType !== "uuid" ||
        field.writeMode !== "read_only" ||
        field.valueOrigin !== "stored"
      )
        throw new TypeError(
          "Directory scope requires an immutable stored UUID field: " + key,
        );
    }
  }
  if (directoryRules.length > 1)
    throw new TypeError("Only one directory scope rule is allowed");
  const ownerAccessBindings = (graph.surfaces ?? []).flatMap((surface) =>
    surface.layoutConfig?.ownerAccess === undefined
      ? []
      : [parseRecordOwnerAccess(surface.layoutConfig.ownerAccess)],
  );
  if (ownerAccessBindings.length > 1)
    throw new Error("Ambiguous record owner access");
  const ownerAccess = ownerAccessBindings[0];
  if (
    ownerAccess &&
    (!graph.runtimeProfiles?.every((profile) => profile.tenantFieldKey) ||
      !graph.fields.some(
        (field) =>
          field.fieldKey === ownerAccess.ownerField &&
          field.dataType === "uuid" &&
          field.writeMode === "read_only",
      ))
  )
    throw new Error(
      "Owner access requires tenant storage and an immutable UUID owner field",
    );
  const predicateSets = (graph.surfaces ?? []).flatMap((surface) =>
    surface.layoutConfig?.recordPredicates === undefined
      ? []
      : [parseRecordPredicates(surface.layoutConfig.recordPredicates)],
  );
  if (
    predicateSets.length > 1 ||
    predicateSets[0]?.some(
      (p) =>
        !graph.fields.some(
          (f) => f.fieldKey === p.field && f.valueOrigin === "stored",
        ),
    )
  )
    throw Error("Invalid record predicate binding");
  const mutationPolicies = (graph.surfaces ?? []).flatMap((surface) =>
    surface.layoutConfig?.mutationPolicy === undefined
      ? []
      : [parseRecordMutationPolicy(surface.layoutConfig.mutationPolicy)],
  );
  if (mutationPolicies.length > 1) throw Error("Ambiguous mutation policy");
  const collectionRelationship = compileCollectionRelationship(graph);
  const collectionCompilation = compileCollectionCompilation(graph);
  const collectionConfiguration = collectionPublicationFromGraph(graph);
  const descriptor = canonicalValue({
    ...(commonReference
      ? { referenceCapability: COMMON_REFERENCE_VIEW_PERMISSION }
      : {}),
    ...(collectionConfiguration ? { collectionConfiguration } : {}),
    ...(authorization ? { authorization } : {}),
    ...(authorizationRuntime ? { authorizationRuntime } : {}),
    ...(ai ? { ai } : {}),
    ...(directoryRules[0] ? { directoryScope: directoryRules[0] } : {}),
    ...(collectionRelationship ? { collectionRelationship } : {}),
    ...(collectionCompilation ? { collectionCompilation } : {}),
    ...(recordPresentation ? { recordPresentation } : {}),
    ...(formPresentation ? { formPresentation } : {}),
    ...(ownerAccess ? { ownerAccess } : {}),
    ...(predicateSets[0] ? { recordPredicates: predicateSets[0] } : {}),
    ...(mutationPolicies[0] ? { mutationPolicy: mutationPolicies[0] } : {}),
    entity: graph.entity,
    ...(graph.capabilities?.length
      ? capabilityArtifactMembers(graph.entity.entityCode, graph.capabilities)
      : {}),
    fields: graph.fields,
    keys: graph.keys ?? [],
    keyFields: graph.keyFields ?? [],
    searchProfiles: graph.searchProfiles ?? [],
    searchFields: graph.searchFields ?? [],
    relations: graph.relations ?? [],
    relationTargets: graph.relationTargets ?? [],
    relationFields: graph.relationFields ?? [],
    operations: graph.operations,
    changeCaseBindings: graph.changeCaseBindings ?? [],
    operationContextRequirements: graph.operationContextRequirements ?? [],
    fieldReferenceBindings: graph.fieldReferenceBindings ?? [],
    materializationBindings: graph.materializationBindings ?? [],
    materializationFieldMappings: graph.materializationFieldMappings ?? [],
    operationPermissions: graph.operationPermissions ?? [],
    operationRules: graph.operationRules ?? [],
    operationScopeBindings: graph.operationScopeBindings ?? [],
    surfaces: graph.surfaces ?? [],
    surfaceSections: graph.surfaceSections ?? [],
    surfaceFieldBindings: graph.surfaceFieldBindings ?? [],
    surfaceOperations: graph.surfaceOperations ?? [],
    flows: graph.flows ?? [],
    flowSteps: graph.flowSteps ?? [],
    lifecycleBindings: graph.lifecycleBindings ?? [],
    lifecycleOperationBindings: graph.lifecycleOperationBindings ?? [],
    policyBindings: graph.policyBindings ?? [],
    fieldPolicyBindings: graph.fieldPolicyBindings ?? [],
    numberingBindings: graph.numberingBindings ?? [],
    classProfiles: graph.classProfiles ?? [],
    runtimeProfiles: graph.runtimeProfiles ?? [],
    ...(listPresentation ? { listPresentation } : {}),
  }) as Readonly<Record<string, unknown>>;
  return {
    schema: "athyper.entity-runtime-descriptor/1.0",
    compiler: {
      name: "@athyper/meta-entity-compiler",
      version: META_ENTITY_COMPILER_VERSION,
    },
    contractHash: validation.contractHash,
    descriptorHash: sha256(descriptor),
    descriptor,
  };
}

/** Compiles the default Studio list surface into the target-neutral runtime list contract. */
export function compileListPresentation(
  graph: MetaEntityGraph,
): Readonly<Record<string, unknown>> | undefined {
  const surfaces = (graph.surfaces ?? []).filter(
    (surface) =>
      surface.surfaceKind === "list" && surface.status !== "deprecated",
  );
  const surface =
    surfaces.find((candidate) => candidate.isDefault) ??
    [...surfaces].sort((left, right) =>
      compareText(left.surfaceKey, right.surfaceKey),
    )[0];
  if (!surface?.id) return undefined;
  const fieldKeys = new Map(
    graph.fields.flatMap((field) =>
      field.id ? [[field.id, field.fieldKey] as const] : [],
    ),
  );
  const bindings = (graph.surfaceFieldBindings ?? [])
    .filter(
      (binding) =>
        binding.entitySurfaceId === surface.id &&
        binding.status !== "deprecated" &&
        fieldKeys.has(binding.entityFieldId),
    )
    .sort(
      (left, right) =>
        left.position - right.position ||
        compareText(left.bindingKey, right.bindingKey),
    );
  const columns = bindings
    .filter((binding) => binding.displayConfig?.["defaultVisible"] !== false)
    .map((binding) => fieldKeys.get(binding.entityFieldId)!);
  const config = isObject(surface.layoutConfig) ? surface.layoutConfig : {};
  const configuredState = isObject(config["defaultState"])
    ? config["defaultState"]
    : {};
  const supportedModes = stringArray(config["supportedModes"]).filter((mode) =>
    (ENTITY_LIST_VIEW_MODES as readonly string[]).includes(mode),
  );
  const searchConfig = isObject(config["search"]) ? config["search"] : {};
  const defaultSearch =
    (graph.searchProfiles ?? []).find(
      (profile) => profile.isDefault && profile.status !== "deprecated",
    ) ??
    (graph.searchProfiles ?? []).find(
      (profile) => profile.status !== "deprecated",
    );
  const limitsConfig = isObject(config["limits"]) ? config["limits"] : {};
  const state = {
    ...(typeof configuredState["query"] === "string"
      ? { query: configuredState["query"] }
      : {}),
    ...(Array.isArray(configuredState["filters"])
      ? { filters: configuredState["filters"] }
      : {}),
    ...(Array.isArray(configuredState["sort"])
      ? { sort: configuredState["sort"] }
      : {}),
    ...(typeof configuredState["group"] === "string"
      ? { group: configuredState["group"] }
      : {}),
    columns,
    density: ["compact", "comfortable", "spacious"].includes(
      String(configuredState["density"]),
    )
      ? configuredState["density"]
      : "comfortable",
    mode: supportedModes.includes(String(configuredState["mode"]))
      ? configuredState["mode"]
      : (supportedModes[0] ?? "table"),
  };
  return {
    schemaVersion: 1,
    experience: compileListExperience(graph, surface),
    title: surface.title,
    ...(config["localizedLabels"] === undefined
      ? {}
      : {
          localizedLabels: parsePresentationLocalization(
            config["localizedLabels"],
          ),
        }),
    ...(config["filterPresentation"] !== undefined
      ? { filterPresentation: config["filterPresentation"] }
      : {}),
    ...(surface.description ? { description: surface.description } : {}),
    identityField:
      typeof config["identityField"] === "string"
        ? config["identityField"]
        : columns[0],
    defaultState: state,
    supportedModes: supportedModes.length
      ? supportedModes
      : [...ENTITY_LIST_RENDERABLE_MODES],
    search: {
      ...(typeof searchConfig["profileKey"] === "string"
        ? { profileKey: searchConfig["profileKey"] }
        : defaultSearch
          ? { profileKey: defaultSearch.searchKey }
          : {}),
      minimumQueryLength:
        integerValue(searchConfig["minimumQueryLength"]) ??
        defaultSearch?.minimumQueryLength ??
        1,
    },
    limits: {
      defaultPageSize: integerValue(limitsConfig["defaultPageSize"]) ?? 25,
      allowedPageSizes: integerArray(limitsConfig["allowedPageSizes"]) ?? [
        25, 50, 100,
      ],
      maxSortLevels: integerValue(limitsConfig["maxSortLevels"]) ?? 3,
      countMode: ["none", "cached", "approximate", "exact"].includes(
        String(limitsConfig["countMode"]),
      )
        ? limitsConfig["countMode"]
        : "none",
    },
  };
}

function canonicalValue(value: unknown): unknown {
  return canonicalAt(value, "");
}
function canonicalAt(value: unknown, path: string): unknown {
  if (Array.isArray(value)) {
    const values = value.map((item) => canonicalAt(item, path));
    if (!ORDER_INDEPENDENT_ARRAYS.has(path)) return values;
    return [...values].sort((a, b) =>
      compareText(JSON.stringify(a), JSON.stringify(b)),
    );
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => compareText(a, b))
        .map(([key, item]) => [
          key,
          canonicalAt(item, path ? `${path}.${key}` : key),
        ]),
    );
  return value;
}
function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function readPath(root: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? Reflect.get(value, key)
          : undefined,
      root,
    );
}
function uniqueKeys<T extends object>(
  rows: readonly T[],
  property: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = Reflect.get(row, property);
    if (typeof key !== "string" || key.length === 0)
      issues.push({
        code: "GRAPH_KEY_REQUIRED",
        path: `${path}.${index}.${property}`,
        message: `${property} is required`,
      });
    else if (seen.has(key))
      issues.push({
        code: "GRAPH_KEY_DUPLICATE",
        path: `${path}.${index}.${property}`,
        message: `Duplicate ${property} ${key}`,
      });
    else seen.add(key);
  });
}
const ORDER_INDEPENDENT_ARRAYS = new Set([
  "capabilities",
  "classProfiles",
  "runtimeProfiles",
  "fields",
  "keys",
  "keyFields",
  "searchProfiles",
  "searchFields",
  "relations",
  "relationTargets",
  "relationFields",
  "operations",
  "operationPermissions",
  "operationRules",
  "operationScopeBindings",
  "changeCaseBindings",
  "operationContextRequirements",
  "fieldReferenceBindings",
  "materializationBindings",
  "materializationFieldMappings",
  "surfaces",
  "surfaceSections",
  "surfaceFieldBindings",
  "surfaceOperations",
  "flows",
  "flowSteps",
  "lifecycleBindings",
  "lifecycleOperationBindings",
  "policyBindings",
  "fieldPolicyBindings",
  "numberingBindings",
  "tests",
  "operations.fieldKeys",
]);
const REQUIRED_ARRAY_BRANCHES = ["fields", "operations"] as const;
const OPTIONAL_ARRAY_BRANCHES = [
  "capabilities",
  "classProfiles",
  "runtimeProfiles",
  "keys",
  "keyFields",
  "searchProfiles",
  "searchFields",
  "relations",
  "relationTargets",
  "relationFields",
  "operationPermissions",
  "operationRules",
  "operationScopeBindings",
  "changeCaseBindings",
  "operationContextRequirements",
  "fieldReferenceBindings",
  "materializationBindings",
  "materializationFieldMappings",
  "surfaces",
  "surfaceSections",
  "surfaceFieldBindings",
  "surfaceOperations",
  "flows",
  "flowSteps",
  "lifecycleBindings",
  "lifecycleOperationBindings",
  "policyBindings",
  "fieldPolicyBindings",
  "numberingBindings",
  "tests",
] as const;
function ids(rows: readonly { readonly id?: string }[] | undefined) {
  return new Set(
    (rows ?? []).map((row) => row.id).filter((id): id is string => Boolean(id)),
  );
}
function references<T extends object>(
  rows: readonly T[] | undefined,
  property: string,
  targets: Set<string>,
  path: string,
  issues: ValidationIssue[],
) {
  for (const [index, row] of (rows ?? []).entries()) {
    const value = Reflect.get(row, property);
    if (typeof value !== "string" || !targets.has(value))
      issues.push({
        code: "GRAPH_REFERENCE_MISSING",
        path: `${path}.${index}.${property}`,
        message: `Unknown ${property} ${String(value)}`,
      });
  }
}
function optionalReferences<T extends object>(
  rows: readonly T[] | undefined,
  property: string,
  targets: Set<string>,
  path: string,
  issues: ValidationIssue[],
) {
  for (const [index, row] of (rows ?? []).entries()) {
    const value = Reflect.get(row, property);
    if (
      value !== undefined &&
      (typeof value !== "string" || !targets.has(value))
    )
      issues.push({
        code: "GRAPH_REFERENCE_MISSING",
        path: `${path}.${index}.${property}`,
        message: `Unknown ${property} ${String(value)}`,
      });
  }
}

const KEY_PATTERN = /^[a-z][a-z0-9_.-]{0,126}$/;
function boundedRows(graph: MetaEntityGraph, issues: ValidationIssue[]) {
  const branches = Object.entries(graph).filter(([, value]) =>
    Array.isArray(value),
  ) as [string, readonly object[]][];
  for (const [branch, rows] of branches) {
    if (rows.length > 10_000)
      issues.push({
        code: "GRAPH_BRANCH_TOO_LARGE",
        path: branch,
        message: `${branch} exceeds 10000 rows`,
      });
    rows.forEach((row, index) => {
      for (const [property, value] of Object.entries(row)) {
        const path = `${branch}.${index}.${property}`;
        if (typeof value === "string" && value.length > 4_000)
          issues.push({
            code: "GRAPH_VALUE_TOO_LONG",
            path,
            message: `${property} exceeds 4000 characters`,
          });
        if (
          (property === "id" || property.endsWith("Id")) &&
          typeof value === "string" &&
          (value.length < 1 || value.length > 128)
        )
          issues.push({
            code: "GRAPH_ID_INVALID",
            path,
            message: `${property} must contain 1 to 128 characters`,
          });
        if (
          (property.endsWith("Key") || property.endsWith("Code")) &&
          typeof value === "string" &&
          !KEY_PATTERN.test(value)
        )
          issues.push({
            code: "GRAPH_KEY_INVALID",
            path,
            message: `${property} is not canonical`,
          });
        if (
          (property === "position" ||
            property === "priority" ||
            property.endsWith("Revision")) &&
          (!Number.isSafeInteger(value) ||
            Number(value) < 0 ||
            Number(value) > 1_000_000)
        )
          issues.push({
            code: "GRAPH_NUMBER_INVALID",
            path,
            message: `${property} is outside the supported range`,
          });
      }
    });
  }
  for (const [index, row] of (graph.keyFields ?? []).entries())
    if (row.position < 1 || row.position > 64)
      issues.push({
        code: "GRAPH_POSITION_INVALID",
        path: `keyFields.${index}.position`,
        message: "Key field position must be between 1 and 64",
      });
  for (const [index, row] of (graph.searchFields ?? []).entries())
    if (row.position < 1 || row.position > 256)
      issues.push({
        code: "GRAPH_POSITION_INVALID",
        path: `searchFields.${index}.position`,
        message: "Search field position must be between 1 and 256",
      });
  for (const [index, row] of (graph.relationFields ?? []).entries())
    if (row.position < 1 || row.position > 64)
      issues.push({
        code: "GRAPH_POSITION_INVALID",
        path: `relationFields.${index}.position`,
        message: "Relation field position must be between 1 and 64",
      });
  for (const [index, row] of (graph.numberingBindings ?? []).entries())
    if ((row.assignmentMode === "automatic") !== Boolean(row.entityOperationId))
      issues.push({
        code: "NUMBERING_OPERATION_INVALID",
        path: `numberingBindings.${index}.entityOperationId`,
        message:
          "Automatic numbering requires one operation; manual numbering forbids it",
      });
}
function requiredGraphValues(
  graph: MetaEntityGraph,
  issues: ValidationIssue[],
) {
  if ((graph.runtimeProfiles ?? []).length !== 1)
    issues.push({
      code: "RUNTIME_PROFILE_REQUIRED",
      path: "runtimeProfiles",
      message: "Exactly one default runtime profile is required",
    });
  requiredStrings(
    graph.runtimeProfiles ?? [],
    ["backingKind", "apiExposure", "readMode", "writeMode"],
    "runtimeProfiles",
    issues,
  );
  requiredStrings(graph.fields, ["fieldKey"], "fields", issues);
  graph.fields.forEach((row, index) => {
    const dataType = row.dataType;
    if (typeof dataType !== "string" || !dataType)
      issues.push({
        code: "GRAPH_VALUE_REQUIRED",
        path: `fields.${index}.dataType`,
        message: "dataType is required",
      });
    if (!isObject(row.typeConfig) || row.typeConfig["kind"] !== dataType)
      issues.push({
        code: "FIELD_TYPE_CONFIG_INVALID",
        path: `fields.${index}.typeConfig`,
        message: "typeConfig.kind must equal dataType",
      });
  });
  requiredStrings(
    graph.operations,
    ["operationKey", "operationKind", "label", "auditEventCode"],
    "operations",
    issues,
  );
  requiredStrings(
    graph.keys ?? [],
    ["keyKey", "keyKind", "uniquenessScope"],
    "keys",
    issues,
  );
  requiredStrings(
    graph.searchProfiles ?? [],
    ["searchKey", "searchKind"],
    "searchProfiles",
    issues,
  );
  requiredStrings(
    graph.searchFields ?? [],
    ["entitySearchProfileId", "entityFieldId", "matchMode"],
    "searchFields",
    issues,
  );
  requiredStrings(
    graph.relations ?? [],
    ["relationKey", "relationKind", "resolutionKind"],
    "relations",
    issues,
  );
  requiredStrings(
    graph.relationTargets ?? [],
    ["entityRelationId", "relationTargetKey", "targetEntityId", "targetKeyKey"],
    "relationTargets",
    issues,
  );
  requiredStrings(
    graph.relationFields ?? [],
    ["entityRelationTargetId", "sourceFieldId", "targetFieldKey"],
    "relationFields",
    issues,
  );
  requiredStrings(
    graph.surfaces ?? [],
    ["surfaceKey", "surfaceKind", "title"],
    "surfaces",
    issues,
  );
  requiredStrings(
    graph.operationPermissions ?? [],
    ["entityOperationId", "targetPlane", "permissionCode", "permissionKind"],
    "operationPermissions",
    issues,
  );
}
function requiredStrings(
  rows: readonly object[],
  properties: readonly string[],
  branch: string,
  issues: ValidationIssue[],
) {
  rows.forEach((row, index) =>
    properties.forEach((property) => {
      const value = Reflect.get(row, property);
      if (typeof value !== "string" || !value.trim())
        issues.push({
          code: "GRAPH_VALUE_REQUIRED",
          path: `${branch}.${index}.${property}`,
          message: `${property} is required`,
        });
    }),
  );
}
function validateOwners(graph: MetaEntityGraph, issues: ValidationIssue[]) {
  const sectionSurface = new Map(
    (graph.surfaceSections ?? []).flatMap((row) =>
      row.id ? [[row.id, row.entitySurfaceId] as const] : [],
    ),
  );
  (graph.surfaceFieldBindings ?? []).forEach((row, index) => {
    if (
      row.entitySurfaceSectionId &&
      sectionSurface.get(row.entitySurfaceSectionId) !== row.entitySurfaceId
    )
      issues.push({
        code: "GRAPH_OWNER_MISMATCH",
        path: `surfaceFieldBindings.${index}.entitySurfaceSectionId`,
        message: "Section belongs to a different surface",
      });
  });
  (graph.surfaceOperations ?? []).forEach((row, index) => {
    if (
      row.entitySurfaceSectionId &&
      sectionSurface.get(row.entitySurfaceSectionId) !== row.entitySurfaceId
    )
      issues.push({
        code: "GRAPH_OWNER_MISMATCH",
        path: `surfaceOperations.${index}.entitySurfaceSectionId`,
        message: "Section belongs to a different surface",
      });
  });
  const targetRelation = new Map(
    (graph.relationTargets ?? []).flatMap((row) =>
      row.id ? [[row.id, row.entityRelationId] as const] : [],
    ),
  );
  for (const [index, row] of (graph.relationFields ?? []).entries())
    if (!targetRelation.has(row.entityRelationTargetId)) continue;
  const className = graph.entity.entityClass;
  for (const [index, row] of (graph.classProfiles ?? []).entries())
    if (className && row.entityClass !== className)
      issues.push({
        code: "CLASS_PROFILE_OWNER_MISMATCH",
        path: `classProfiles.${index}.entityClass`,
        message: "Class profile does not match the entity class",
      });
}
function validateListSurfaces(
  graph: MetaEntityGraph,
  issues: ValidationIssue[],
) {
  try {
    collectionPublicationFromGraph(graph);
  } catch (error) {
    issues.push({
      code: "COLLECTION_CONFIGURATION_INVALID",
      path: "surfaces",
      message: (error as Error).message,
    });
  }
  const fieldsById = new Map(
      graph.fields.flatMap((field) =>
        field.id ? [[field.id, field] as const] : [],
      ),
    ),
    fieldsByKey = new Map(graph.fields.map((field) => [field.fieldKey, field]));
  const profiles = new Set(
    (graph.searchProfiles ?? [])
      .filter((profile) => profile.status !== "deprecated")
      .map((profile) => profile.searchKey),
  );
  for (const [surfaceIndex, surface] of (graph.surfaces ?? []).entries()) {
    if (surface.surfaceKind !== "list" || surface.status === "deprecated")
      continue;
    try {
      compileListExperience(graph, surface);
    } catch (cause) {
      issues.push({
        code: "LIST_EXPERIENCE_INVALID",
        path: `surfaces.${surfaceIndex}.layoutConfig.experience`,
        message:
          cause instanceof Error ? cause.message : "Invalid list experience",
      });
    }
    if (!surface.id) {
      issues.push({
        code: "LIST_SURFACE_ID_REQUIRED",
        path: `surfaces.${surfaceIndex}.id`,
        message: "List surfaces require an identity before compilation",
      });
      continue;
    }
    const bindings = (graph.surfaceFieldBindings ?? []).filter(
      (binding) =>
        binding.entitySurfaceId === surface.id &&
        binding.status !== "deprecated",
    );
    const keys = bindings.flatMap((binding) => {
      const field = fieldsById.get(binding.entityFieldId);
      return field ? [field.fieldKey] : [];
    });
    if (!keys.length)
      issues.push({
        code: "LIST_COLUMNS_REQUIRED",
        path: `surfaces.${surfaceIndex}`,
        message: "A list surface requires at least one active field binding",
      });
    if (new Set(keys).size !== keys.length)
      issues.push({
        code: "LIST_COLUMN_DUPLICATE",
        path: `surfaces.${surfaceIndex}`,
        message: "A field may be bound only once to a list surface",
      });
    const config = isObject(surface.layoutConfig) ? surface.layoutConfig : {},
      state = isObject(config["defaultState"]) ? config["defaultState"] : {};
    const identity =
      typeof config["identityField"] === "string"
        ? config["identityField"]
        : keys[0];
    if (identity && !keys.includes(identity))
      issues.push({
        code: "LIST_IDENTITY_NOT_BOUND",
        path: `surfaces.${surfaceIndex}.layoutConfig.identityField`,
        message: `Identity field ${identity} is not bound to the list surface`,
      });
    for (const [index, item] of (Array.isArray(state["sort"])
      ? state["sort"]
      : []
    ).entries()) {
      if (
        !isObject(item) ||
        typeof item["field"] !== "string" ||
        !keys.includes(item["field"])
      )
        issues.push({
          code: "LIST_SORT_FIELD_INVALID",
          path: `surfaces.${surfaceIndex}.layoutConfig.defaultState.sort.${index}`,
          message: "Default sort must reference a bound field",
        });
    }
    for (const [index, item] of (Array.isArray(state["filters"])
      ? state["filters"]
      : []
    ).entries()) {
      if (
        !isObject(item) ||
        typeof item["field"] !== "string" ||
        typeof item["operator"] !== "string" ||
        !keys.includes(item["field"])
      ) {
        issues.push({
          code: "LIST_FILTER_INVALID",
          path: `surfaces.${surfaceIndex}.layoutConfig.defaultState.filters.${index}`,
          message: "Default filter must reference a bound field and operator",
        });
        continue;
      }
      const field = fieldsByKey.get(item["field"]),
        type = field?.dataType as EntityFieldType | undefined;
      if (
        !type ||
        !entityFieldFilterOperators(type).includes(
          item["operator"] as EntityListFilterOperator,
        )
      )
        issues.push({
          code: "LIST_FILTER_OPERATOR_INVALID",
          path: `surfaces.${surfaceIndex}.layoutConfig.defaultState.filters.${index}.operator`,
          message: `Operator ${item["operator"]} is not valid for ${item["field"]}`,
        });
    }
    if (typeof state["group"] === "string") {
      const binding = bindings.find(
        (candidate) =>
          fieldsById.get(candidate.entityFieldId)?.fieldKey === state["group"],
      );
      if (!binding || binding.displayConfig?.["groupable"] !== true)
        issues.push({
          code: "LIST_GROUP_FIELD_INVALID",
          path: `surfaces.${surfaceIndex}.layoutConfig.defaultState.group`,
          message: "Default group must reference a bound groupable field",
        });
    }
    const search = isObject(config["search"]) ? config["search"] : {};
    if (
      typeof search["profileKey"] === "string" &&
      !profiles.has(search["profileKey"])
    )
      issues.push({
        code: "LIST_SEARCH_PROFILE_INVALID",
        path: `surfaces.${surfaceIndex}.layoutConfig.search.profileKey`,
        message: `Unknown search profile ${search["profileKey"]}`,
      });
    const limits = isObject(config["limits"]) ? config["limits"] : {},
      sizes = integerArray(limits["allowedPageSizes"]),
      size = integerValue(limits["defaultPageSize"]);
    if (size !== undefined && sizes && !sizes.includes(size))
      issues.push({
        code: "LIST_PAGE_SIZE_INVALID",
        path: `surfaces.${surfaceIndex}.layoutConfig.limits.defaultPageSize`,
        message: "Default page size must be included in allowed page sizes",
      });
  }
}
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function integerValue(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : undefined;
}
function integerArray(value: unknown): number[] | undefined {
  return Array.isArray(value) &&
    value.every((item) => Number.isSafeInteger(item) && Number(item) > 0)
    ? value.map(Number)
    : undefined;
}
function sorted(issues: ValidationIssue[]) {
  return issues.sort((a, b) =>
    compareText(
      `${a.path}\0${a.code}\0${a.message}`,
      `${b.path}\0${b.code}\0${b.message}`,
    ),
  );
}
function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
