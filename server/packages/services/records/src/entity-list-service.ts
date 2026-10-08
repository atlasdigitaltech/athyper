import { resolveCardContent, resolveListBoard } from "./list-board.js";
import { authorizeEntityOperation } from "@athyper/server-contract-auth";
import { createEntityReferenceReader, type EntityReferenceRequest, type EntityReferencePage } from "./entity-reference-reader.js";
import { usesEntityBackendAuthorization } from "./entity-backend-authorizer.js";
import { exportableClassification } from "./transfer/export-admission.js";
import { resolveIntakeFormChoices } from "./intake-form-choices.js";
import { authorizeListContextDiscovery } from "./list-context-discovery.js";
import { readablePresentationLocalization } from "@athyper/contract-platform-entity-runtime";
import { fieldWriteAuthorizationResource } from "./field-validation.js";
import {
  humanizeIdentifier,
  entityTransferWorkspaces,
  parseEntityDetailDescriptor,
  parseEntityDetailRead,
  type EntityDetailReadV1,
  parseEntityFormDescriptor,
  parseEntityRecordPresentation,
  readableRecordPresentation,
  readableEntitySectionComponent,
} from "@athyper/contract-platform-entity-runtime";
import {
  createRelationshipStandardViewSources,
  availableStandardViews,
  resolveStandardView,
  type StandardViewSources,
} from "./standard-views.js";
import {
  effectiveListActions,
  effectiveEntityNavigation,
  type EntityAttentionCountResolver,
} from "./list-experience.js";
import {
  ENTITY_LIST_RENDERABLE_MODES,
  resolveEntityText,
  type EffectiveListActionV1,
  type EffectiveEntitySectionV1,
  fallbackQuickFields,
  preferredFilterOperator,
} from "@athyper/contract-platform-entity-list";
import { createHash } from "node:crypto";
import type {
  EntityListDataOperationsV1,
  EntityListDescriptorV1,
  EntityListResultV1,
  JsonValue,
  ListFieldDescriptorV1,
  ListFilterOperator,
  ListFilterV1,
  ListSortV1,
  ListUnavailableModeV1,
  ListViewMode,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityDetailDescriptorV1,
  EntityFormDescriptorV1,
  EntityRecordV1,
  EntitySurfaceFieldV1,
} from "@athyper/contract-platform-entity-runtime";
import type {
  Authorizer,
  EffectiveAuthorizationScope,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  EntityFieldDescriptor,
  EntityListDefaultStateDescriptor,
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import type {
  ListRecordsQuery,
  RecordCollectionScopeResolution,
  RecordCollectionScopeResolver,
  RecordQueryService,
} from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";
import { recordFieldFilterOperators } from "./list-query-policy.js";
import { descriptorFor, type RecordListExecutor } from "./query-service.js";
import {
  authorizeRecordListRead,
  readableRecordFields,
} from "./record-read-access.js";

export interface EntityListService {
  referenceChoices(context: VerifiedRequestContext, entityCode: string, request: EntityReferenceRequest): Promise<EntityReferencePage>;
  applicationDescriptor(
    context: VerifiedRequestContext,
    entityCode: string,
    scopeCoordinate?: ListRecordsQuery["scopeCoordinate"],
  ): Promise<
    import("@athyper/contract-platform-entity-list").EntityApplicationDescriptorV1
  >;
  descriptor(
    context: VerifiedRequestContext,
    entityCode: string,
    scopeCoordinate?: ListRecordsQuery["scopeCoordinate"],
    filterChoiceField?: string,
  ): Promise<EntityListDescriptorV1>;
  formDescriptor(
    context: VerifiedRequestContext,
    entityCode: string,
    mode: "create" | "edit",
    recordId?: string,
  ): Promise<EntityFormDescriptorV1>;
  detailDescriptor(
    context: VerifiedRequestContext,
    entityCode: string,
    recordId?: string,
    timing?: (stage: string, durationMs: number) => void,
  ): Promise<EntityDetailDescriptorV1>;
  detailRead(context: VerifiedRequestContext, entityCode: string, recordId: string,
    timing?: (stage: string, durationMs: number) => void,
    scopeCoordinate?: ListRecordsQuery["scopeCoordinate"]): Promise<EntityDetailReadV1>;
  record(
    context: VerifiedRequestContext,
    entityCode: string,
    recordId: string,
  ): Promise<EntityRecordV1>;
  list(query: ListRecordsQuery): Promise<EntityListResultV1>;
  /** The caller's own record of an owner-scoped entity (its owner field names the
   * caller), through the same authorized list execution; 404 when there is not exactly one. */
  ownRecord(context: VerifiedRequestContext, entityCode: string): Promise<{ readonly recordId: string }>;
}

export const ENTITY_LIST_MAX_SORT_LEVELS = 3;

export function createEntityListService(options: {
  readonly formChoices?: (context: VerifiedRequestContext, sourceKey: string) => Promise<readonly {value:string;label:string;data?:Readonly<Record<string,string|boolean|readonly string[]>>}[]>;
  readonly filterChoices?: (
    context: VerifiedRequestContext,
    fields: readonly EntityFieldDescriptor[],
  ) => Promise<
    Readonly<
      Record<string, NonNullable<ListFieldDescriptorV1["filterOptions"]>>
    >
  >;
  readonly standardViewSources?: StandardViewSources;
  readonly activity?: (input: { context: VerifiedRequestContext; entityCode: string; recordId: string }) => Promise<boolean>;
  readonly collaboration?: (input: { context: VerifiedRequestContext; entityCode: string; recordId: string }) => Promise<readonly ("comments" | "attachments")[]>;
  readonly summary?: (input: { context: VerifiedRequestContext; entityCode: string; recordId: string; releaseId: string }) => Promise<import("@athyper/contract-platform-entity-runtime").EntityRecordSummaryViewV1 | undefined>;
  readonly metadata: MetadataReader;
  readonly authorizer: Authorizer;
  readonly listExecutor: RecordListExecutor;
  readonly queries?: RecordQueryService;
  readonly collectionScopes?: RecordCollectionScopeResolver;
  readonly attentionCounts?: Readonly<
    Record<string, EntityAttentionCountResolver>
  >;
}): EntityListService {
  const references = createEntityReferenceReader(options);
  async function referencePresentation(context: VerifiedRequestContext, descriptor: EntityRuntimeDescriptor, data: Readonly<Record<string, unknown>>) {
    const resolved = await references.presentation(context, descriptor, data);
    return Object.keys(resolved.references).length ? resolved : {};
  }
  const standardViewSources = {
    ...createRelationshipStandardViewSources(options.authorizer),
    ...options.standardViewSources,
  };
  async function compileDetail(
      context: VerifiedRequestContext,
      entityCode: string,
      recordId?: string,
      timing: (stage: string, durationMs: number) => void = () => {},
      scopeCoordinate?: ListRecordsQuery["scopeCoordinate"],
    ) {
      let previous = performance.now();
      const stage = (name: string) => {
        const now = performance.now();
        timing(name, now - previous);
        previous = now;
      };
      const measured = async <T>(name: string, work: () => Promise<T> | T): Promise<T> => {
        const started = performance.now();
        try { return await work(); } finally { timing(name, performance.now() - started); }
      };
      if (recordId && !options.queries)
        throw new RecordServiceError(503, "ENTITY_RECORD_ADAPTER_UNAVAILABLE", "The record adapter is unavailable");
      const admitted = recordId && options.queries?.getWithProjection
        ? await options.queries.getWithProjection({ context, entityCode, recordId, scopeCoordinate }) : undefined;
      const descriptor = admitted?.descriptor ?? await descriptorFor(options.metadata, context, entityCode);
      stage(admitted ? "authorized_record" : "metadata");
      if (!admitted) await requireOperation(
        options.authorizer,
        context,
        descriptor,
        "read",
        recordId,
      );
      stage("authorization");
      let data = admitted?.data;
      if (recordId) {
        data = admitted ? admitted.data : (await options.queries!.get({ context, entityCode, recordId, scopeCoordinate })).data;
        if (!data)
          throw new RecordServiceError(
            404,
            "ENTITY_RECORD_NOT_FOUND",
            "The governed record was not found",
          );
      }
      stage("record");
      const readable = admitted?.readableFields ?? await readableRecordFields(
        options.authorizer,
        context,
        descriptor,
      );
      stage("fields");
      if (!readable.length)
        throw new RecordServiceError(
          403,
          "ENTITY_DETAIL_FIELDS_FORBIDDEN",
          "No fields are readable for this entity detail",
        );
      const actions: {
        code: string;
        label: string;
        kind: "edit" | "transition";
      }[] = [];
      if (
        descriptor.operations["patch"] &&
        (await operationAllowed(
          options.authorizer,
          context,
          descriptor,
          "patch",
          recordId,
        ))
      )
        actions.push({ code: "edit", label: "Edit", kind: "edit" });
      for (const transition of descriptor.lifecycle?.transitions ?? [])
        if (
          (
            await options.authorizer.authorize({
              context,
              permissionCode: transition.permissionCode,
              resource: {
                tenantId: context.tenantId,
                entityCode,
                operationKey: "transition",
                transitionCode: transition.code,
              },
            })
          ).allowed
        )
          actions.push({
            code: transition.code,
            label: humanizeIdentifier(transition.code),
            kind: "transition",
          });
      stage("actions");
      const fields = readable.map((field) => surfaceField(field, true, descriptor));
      const identity = descriptor.listPresentation?.identityField;
      const titleField =
        identity && readable.some((field) => field.key === identity)
          ? identity
          : (readable.find(
              (field) => field.storagePath === descriptor.storage.idField,
            )?.key ?? readable[0]!.key);
      const authorizedRelationships: string[] = [];
      const relationshipCapabilities: Record<string, { create: boolean }> = {};
      if (recordId) for (const relation of descriptor.recordPresentation?.entityRelationships ?? []) {
        const child = await options.metadata.getEntityDescriptor(context, relation.targetEntity);
        if (child && await operationAllowed(options.authorizer, context, child, "list")) {
          authorizedRelationships.push(relation.key);
          // Parent admission has succeeded. The mutation endpoint independently
          // locks relationship fields and rechecks create permission.
          relationshipCapabilities[relation.key] = { create: await operationAllowed(options.authorizer, context, child, "create") };
        }
      }
      stage("relationships");
      const presentation = readableRecordPresentation(
        descriptor.recordPresentation ??
          parseEntityRecordPresentation({
            schemaVersion: 1,
            titleField,
            iconKey: descriptor.listPresentation?.experience?.header.iconKey,
            sections: [
              {
                key: "overview",
                label: "Overview",
                localizedLabel: {labelKey: "detail.overview", defaultText: "Overview"},
                fields: fields.map((field) => field.key),
              },
            ],
            actions: [
              {
                key: "edit",
                label: "Edit",
                operationKey: "patch",
                placement: "primary",
              },
            ],
          }),
        fields.map((field) => field.key),
        actions.map((action) =>
          action.kind === "edit" ? "patch" : action.code,
        ),
        titleField,
        authorizedRelationships,
      );
      // These read-only hooks are independent, but none may run before record
      // admission and readable-field projection have succeeded. No transaction
      // is passed between these independently scoped read providers.
      const [collaboration, summaryView, activity] = await Promise.all([
        measured("collaboration", () => recordId && options.collaboration ? options.collaboration({ context, entityCode, recordId }) : []),
        measured("summary", () => recordId && options.summary ? options.summary({ context, entityCode, recordId, releaseId: descriptor.releaseId }) : undefined),
        measured("activity", () => recordId && options.activity ? options.activity({context,entityCode,recordId}) : false),
      ]);
      const detail = parseEntityDetailDescriptor({
        schema: "athyper.entity-detail-descriptor/1",
        ...(entityLabels(descriptor).localization ? { localizedLabels: authorizedPresentationLocalization(descriptor, entityLabels(descriptor).localization, fields.map(field => field.key)) } : {}),
        collaboration,
        relationshipCapabilities,
        activity,
        presentation: { ...presentation, localizedLabels: authorizedPresentationLocalization(descriptor, presentation.localizedLabels, fields.map(field => field.key)), badges: presentation.badges.filter(badge => !maskedPresentationField(descriptor, badge.field)), summaryView },
        plane: descriptor.planeKey,
        entity: {
          code: entityCode,
          label: entityLabels(descriptor).singular,
          pluralLabel: entityLabels(descriptor).plural,
        },
        revision: surfaceRevision(descriptor, {
          entityCode,
          fields,
          actions,
          titleField,
          presentation,
        }),
        titleField,
        referenceSummaryFields: (descriptor.listPresentation?.defaultState?.columns ?? descriptor.listPresentation?.defaultColumns ?? [titleField]).filter(key => fields.some(field => field.key === key) && !maskedPresentationField(descriptor, key)).slice(0, 8),
        fields,
        actions,
      });
      return { descriptor: detail, record: data ? {...normalizeRecord(descriptor, data, readable.map(field => field.key)), ...await referencePresentation(context,descriptor,data)} : undefined };
  }
  return Object.freeze({
    async referenceChoices(context: VerifiedRequestContext, entityCode: string, request: EntityReferenceRequest) {
      return references.lookup(context, await descriptorFor(options.metadata,context,entityCode), request);
    },
    async applicationDescriptor(
      context: VerifiedRequestContext,
      entityCode: string,
      scopeCoordinate?: ListRecordsQuery["scopeCoordinate"],
    ) {
      const descriptor = await descriptorFor(
          options.metadata,
          context,
          entityCode,
        ),
        collectionScope = await resolveCollectionScope(
          options.collectionScopes,
          context,
          descriptor,
          scopeCoordinate,
        );
      if (collectionScope.status === "forbidden")
        throw new RecordServiceError(
          403,
          collectionScope.code,
          collectionScope.message,
        );
      const actions = await effectiveListActions(
          options.authorizer,
          context,
          descriptor,
          collectionScope,
        ),
        navigation = await effectiveEntityNavigation(
          options.authorizer,
          context,
          descriptor,
          collectionScope,
          options.attentionCounts,
        );
      const experience = descriptor.listPresentation?.experience;
      if (experience?.application) {
        if (!navigation.length && !actions.length)
          throw new RecordServiceError(
            403,
            "ENTITY_APPLICATION_FORBIDDEN",
            "No entity application sections are accessible",
          );
      } else
        await authorizeRecordListRead(
          options.authorizer,
          context,
          descriptor,
          collectionScope.status === "ready"
            ? collectionScope.authorizationResource
            : undefined,
        );
      const title = experience
        ? resolveEntityText(experience.header.title)
        : (descriptor.listPresentation?.title ?? humanizeIdentifier(entityCode));
      return Object.freeze({
        schemaVersion: 1 as const,
        ...(descriptor.listPresentation?.localizedLabels ? { localizedLabels: authorizedPresentationLocalization(descriptor, descriptor.listPresentation.localizedLabels, []) } : {}),
        plane: descriptor.planeKey,
        entity: Object.freeze({
          code: entityCode,
          label: title,
          pluralLabel: title,
        }),
        revision: surfaceRevision(descriptor, experience ?? { title }),
        surface: Object.freeze({
          key: "entity_application",
          title,
          ...(experience ? { header: experience.header } : {}),
          ...(descriptor.listPresentation?.description
            ? { description: descriptor.listPresentation.description }
            : {}),
        }),
        actions,
        ...(descriptor.intakeFlows?.length ? {intakeFlows: descriptor.intakeFlows} : {}),
        ...(descriptor.intakeSurfaces?.length ? {intakeSurfaces: await resolveIntakeFormChoices(descriptor.intakeSurfaces,options.formChoices?source=>options.formChoices!(context,source):undefined)} : {}),
        navigation,
        ...(experience?.application
          ? { application: experience.application }
          : {}),
        scope: Object.freeze({
          ...(collectionScope.workContext
            ? { workContext: collectionScope.workContext }
            : {}),
          status: collectionScope.status,
          labels: collectionScope.labels,
          fingerprint: scopeFingerprint(
            context,
            descriptor,
            undefined,
            collectionScope,
          ),
        }),
      });
    },
    async descriptor(
      context: VerifiedRequestContext,
      entityCode: string,
      scopeCoordinate?: ListRecordsQuery["scopeCoordinate"],
      filterChoiceField?: string,
    ) {
      const descriptor = await descriptorFor(
        options.metadata,
        context,
        entityCode,
      );
      const collectionScope = await resolveCollectionScope(
        options.collectionScopes,
        context,
        descriptor,
        scopeCoordinate,
      );
      if (collectionScope.status === "forbidden")
        throw new RecordServiceError(
          403,
          collectionScope.code,
          collectionScope.message,
        );
      const authorization =
        collectionScope.status === "context_required" &&
        collectionScope.workContext &&
        options.collectionScopes
          ? await authorizeListContextDiscovery({
              authorizer: options.authorizer,
              context,
              descriptor,
              resolution: collectionScope,
              resolver: options.collectionScopes,
            })
          : await authorizeRecordListRead(
              options.authorizer,
              context,
              descriptor,
              collectionScope.status === "ready"
                ? collectionScope.authorizationResource
                : undefined,
            );
      const readable = await readableRecordFields(
        options.authorizer,
        context,
        descriptor,
      );
      const dataOperations = await effectiveDataOperations(
        options.authorizer,
        context,
        descriptor,
        readable,
        authorization.scope,
        collectionScope,
      );
      const actions = await effectiveListActions(
        options.authorizer,
        context,
        descriptor,
        collectionScope,
      );
      const navigation = await effectiveEntityNavigation(
        options.authorizer,
        context,
        descriptor,
        collectionScope,
        options.attentionCounts,
      );
      const queryFields = queryableListFields(descriptor, readable);
      const choiceFields = queryFields.filter(field => field.filterable && field.key === filterChoiceField);
      const choices = filterChoiceField && choiceFields.length
        ? ((await options.filterChoices?.(
            context,
            choiceFields,
          )) ?? {})
        : {};
      const filterFields = queryFields.map((field) =>
        choices[field.key]
          ? {
              ...field,
              validation: { ...field.validation, options: choices[field.key] },
            }
          : field,
      );
      return {
        ...compileEntityListDescriptor(
          context,
          descriptor,
          filterFields,
          authorization.scope,
          collectionScope,
          dataOperations,
          actions,
          navigation,
        ),
        standardViews: await availableStandardViews(
          context,
          { ...descriptor, fields: readable },
          standardViewSources,
        ),
      };
    },
    async formDescriptor(
      context: VerifiedRequestContext,
      entityCode: string,
      mode: "create" | "edit",
      recordId?: string,
    ) {
      const descriptor = await descriptorFor(
        options.metadata,
        context,
        entityCode,
      );
      const operation = mode === "create" ? "create" : "patch";
      await requireOperation(
        options.authorizer,
        context,
        descriptor,
        operation,
        mode === "edit" ? recordId : undefined,
      );
      if (mode === "edit")
        await requireOperation(options.authorizer, context, descriptor, "read", recordId);
      const readable = new Set(
        (
          await readableRecordFields(options.authorizer, context, descriptor)
        ).map((field) => field.key),
      );
      const presentation = descriptor.formPresentation?.[mode];
      const inputKeys = presentation ? new Set(presentation.sections.flatMap(section => section.fields)) : undefined;
      const fields = await Promise.all(
        descriptor.fields.map(async (field) => {
          if (inputKeys && !inputKeys.has(field.key)) return undefined;
          const writable =
            field.writableOn.includes(operation) &&
            (!field.writePermissionCode ||
              (
                await options.authorizer.authorize({
                  context,
                  permissionCode: field.writePermissionCode,
                  resource: fieldWriteAuthorizationResource(context, entityCode, operation, field.key),
                })
              ).allowed);
          // Create forms contain user inputs only; server-owned values remain server-derived.
          if (!writable && (mode === "create" || !presentation)) return undefined;
          if (!readable.has(field.key) && !writable) return undefined;
          return { ...surfaceField(field, !writable, descriptor), ...(presentation?.help[field.key] ? { helpText: presentation.help[field.key] } : {}) };
        }),
      );
      const visible = fields.filter((field): field is EntitySurfaceFieldV1 =>
        Boolean(field),
      );
      if (!visible.some((field) => !field.readOnly))
        throw new RecordServiceError(
          403,
          "ENTITY_FORM_FIELDS_FORBIDDEN",
          "No fields are writable for this entity form",
        );
      const labels = entityLabels(descriptor),
        label = labels.singular,
        projection = { entityCode, mode, fields: visible, operation, sections: presentation?.sections ?? descriptor.recordPresentation?.sections };
      return parseEntityFormDescriptor({
        schema: "athyper.entity-form-descriptor/1",
        ...(labels.localization ? { localizedLabels: authorizedPresentationLocalization(descriptor, labels.localization, visible.map(field => field.key)) } : {}),
        plane: descriptor.planeKey,
        entity: {
          code: entityCode,
          label,
          pluralLabel: labels.plural,
        },
        revision: surfaceRevision(descriptor, projection),
        mode,
        title: mode === "create" ? `New ${label}` : `Edit ${label}`,
        description: `${mode === "create" ? "Create" : "Update"} a governed ${label.toLocaleLowerCase()} record.`,
        fields: visible,
        sections: (() => {
          const admitted = new Set(visible.map(field => field.key));
          const used = new Set<string>();
          return (presentation?.sections ?? descriptor.recordPresentation?.sections ?? []).flatMap(section => {
            const fields = section.fields.filter(key => admitted.has(key) && !used.has(key));
            fields.forEach(key => used.add(key));
            const component = readableEntitySectionComponent(section.component, fields);
            return fields.length ? [{ key: section.key, label: section.label, fields, ...(component ? {component} : {}) }] : [];
          });
        })(),
        submit: {
          operation,
          label: presentation?.submitLabel ?? (mode === "create" ? `Create ${label}` : `Save ${label}`),
        },
      });
    },
    async detailDescriptor(...args: Parameters<EntityListService["detailDescriptor"]>) {
      return (await compileDetail(...args)).descriptor;
    },
    async detailRead(...args: Parameters<EntityListService["detailRead"]>) {
      const result = await compileDetail(...args);
      return parseEntityDetailRead(result);
    },
    async record(
      context: VerifiedRequestContext,
      entityCode: string,
      recordId: string,
    ) {
      if (!options.queries)
        throw new RecordServiceError(
          503,
          "ENTITY_RECORD_ADAPTER_UNAVAILABLE",
          "The normalized entity record adapter is unavailable",
        );
      const descriptor = await descriptorFor(
          options.metadata,
          context,
          entityCode,
        ),
        result = await options.queries.get({ context, entityCode, recordId }),
        data = result.data;
      if (!data)
        throw new RecordServiceError(
          404,
          "ENTITY_RECORD_NOT_FOUND",
          "The governed record was not found",
        );
      return {...normalizeRecord(descriptor, data), ...await referencePresentation(context,descriptor,data)};
    },
    async ownRecord(context: VerifiedRequestContext, entityCode: string) {
      const descriptor = await descriptorFor(options.metadata, context, entityCode),
        ownerField = descriptor.ownerAccess?.ownerField;
      // The record is the principal itself (owner field = record id, as for `principal`):
      // its id is the caller's principal id; the governed read confirms the caller may see it.
      if (ownerField && ownerField === descriptor.storage.idField) {
        if (!options.queries)
          throw new RecordServiceError(503, "ENTITY_RECORD_ADAPTER_UNAVAILABLE", "The normalized entity record adapter is unavailable");
        const { data } = await options.queries.get({ context, entityCode, recordId: context.principalId });
        if (!data)
          throw new RecordServiceError(404, "ENTITY_OWN_RECORD_NOT_FOUND", "No single record is owned by the caller");
        return Object.freeze({ recordId: context.principalId });
      }
      // Otherwise the same rule as the ownership standard view: the owner field must be published filterable.
      if (!ownerField || !descriptor.fields.find((field) => field.key === ownerField)?.filterable)
        throw new RecordServiceError(404, "ENTITY_OWN_RECORD_UNSUPPORTED", "This entity has no owner-scoped records");
      const { result, descriptor: executed } = await options.listExecutor.execute({
        context,
        entityCode,
        filters: [{ field: ownerField, operator: "eq", value: context.principalId }],
        limit: 2,
        fields: [],
      }).catch((error: unknown) => {
        // A caller who may not read the owner field cannot resolve an own record.
        if (error instanceof RecordServiceError && error.code === "FILTER_FIELD_NOT_ALLOWED")
          throw new RecordServiceError(404, "ENTITY_OWN_RECORD_NOT_FOUND", "No single record is owned by the caller");
        throw error;
      });
      const ids = result.data.map((row) => row[executed.storage.idField]).filter((id): id is string => typeof id === "string");
      if (ids.length !== 1)
        throw new RecordServiceError(404, "ENTITY_OWN_RECORD_NOT_FOUND", "No single record is owned by the caller");
      return Object.freeze({ recordId: ids[0]! });
    },
    async list(query: ListRecordsQuery) {
      if ((query.sort?.length ?? 0) > 10)
        throw new RecordServiceError(
          400,
          "TOO_MANY_SORT_FIELDS",
          "Entity lists support at most ten sort fields",
        );
      const resolvedQuery = query.standardViewKey
        ? await resolveStandardView(
            query,
            await descriptorFor(
              options.metadata,
              query.context,
              query.entityCode,
            ),
            standardViewSources,
          )
        : query;
      const execution = await options.listExecutor.execute(resolvedQuery);
      const {
        descriptor,
        collectionScope,
        authorization,
        readableFields: readable,
        responseFields,
        result,
      } = execution;
      const dataOperations = await effectiveDataOperations(
        options.authorizer,
        query.context,
        descriptor,
        readable,
        authorization.scope,
        collectionScope,
      );
      const safeDescriptor = compileEntityListDescriptor(
        query.context,
        descriptor,
        readable,
        authorization.scope,
        collectionScope,
        dataOperations,
      );
      const displayValues = await references.labelsMany(query.context, descriptor, result.data);
      const rows = result.data.map((source, index) => {
        const rawId = source[descriptor.storage.idField];
        if (typeof rawId !== "string" && typeof rawId !== "number")
          throw new RecordServiceError(
            500,
            "RECORD_IDENTITY_INVALID",
            `Record ${index} has no serializable identity`,
          );
        const values: Record<string, JsonValue> = {};
        for (const field of responseFields) {
          const value = jsonValue(source[field.key]);
          if (value !== undefined) values[field.key] = value;
        }
        const version = recordVersion(descriptor.storage.versionField
          ? source[descriptor.storage.versionField] : undefined);
        return Object.freeze({
          ...(Object.keys(displayValues[index]!).length ? {displayValues: displayValues[index]} : {}),
          id: String(rawId),
          ...(version !== undefined ? { version } : {}),
          values: Object.freeze(values),
        });
      });
      return Object.freeze({
        schemaVersion: 1,
        descriptorHash: safeDescriptor.revision.descriptorHash,
        scopeFingerprint: safeDescriptor.scope.fingerprint,
        queryHash: digest({
          entityCode: query.entityCode,
          scopeFingerprint: safeDescriptor.scope.fingerprint,
          limit: query.limit ?? safeDescriptor.limits.defaultPageSize,
          cursor: query.cursor ?? null,
          fields: query.fields ?? [],
          standardViewKey: query.standardViewKey ?? null,
          recordIds: query.recordIds ? [...query.recordIds].sort() : [],
          filters: query.filters ?? [],
          sort: query.sort ?? [],
          group: query.group ?? null,
          search: query.search ?? null,
          countMode: query.countMode ?? "none",
        }),
        rows: Object.freeze(rows),
        pagination: Object.freeze({
          pageSize: result.pagination.pageSize,
          hasNext: result.pagination.hasMore,
          ...(result.pagination.nextCursor
            ? { nextCursor: result.pagination.nextCursor }
            : {}),
          hasPrevious: false,
          ...(result.pagination.total !== undefined
            ? { total: result.pagination.total }
            : {}),
          countMode: result.pagination.countMode,
          ...((query.countMode ?? "none") !== result.pagination.countMode
            ? { requestedCountMode: query.countMode ?? "none" }
            : {}),
        }),
        ...(result.groups
          ? {
              groups: Object.freeze(
                result.groups.map((group) =>
                  Object.freeze({
                    value: jsonValue(group.value) ?? null,
                    label: formatGroupLabel(group.value),
                    count: group.count,
                  }),
                ),
              ),
            }
          : {}),
      });
    },
  });
}

async function requireOperation(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  operation: string,
  recordId?: string,
): Promise<void> {
  if (
    !(await operationAllowed(
      authorizer,
      context,
      descriptor,
      operation,
      recordId,
    ))
  )
    throw new RecordServiceError(
      descriptor.operations[operation] ? 403 : 409,
      descriptor.operations[operation]
        ? "FORBIDDEN"
        : "ENTITY_OPERATION_UNAVAILABLE",
      `Entity ${operation} operation is not available`,
    );
}
async function operationAllowed(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  operation: string,
  recordId?: string,
): Promise<boolean> {
  const published = descriptor.operations[operation],
    permissionCode = published?.permissionCode;
  if (!published) return false;
  return (
    await authorizeEntityOperation(authorizer, {
      context,
      permissionCode,
      resource:
        published.authorizationMode === "permission_only"
          ? { tenantId: context.tenantId }
          : {
              tenantId: context.tenantId,
              entityCode: descriptor.entityCode,
              operationKey: operation,
              resourceCode: descriptor.entityCode,
              ...(recordId ? { recordId } : {}),
            },
    })
  ).allowed;
}
function enumOptionLabel(field: EntityFieldDescriptor, value: string): string {
  const labels = field.validation?.["optionLabels"];
  const label = labels && typeof labels === "object" ? Reflect.get(labels, value) : undefined;
  return typeof label === "string" && label.trim() ? label : humanizeIdentifier(value);
}
function surfaceField(
  field: EntityFieldDescriptor,
  readOnly: boolean,
  descriptor: EntityRuntimeDescriptor,
): EntitySurfaceFieldV1 {
  const masked = descriptor.authorization?.fieldPolicies.some(policy =>
    policy.representation === "masked" && policy.fields.includes(field.key));
  const raw = !masked && Array.isArray(field.validation?.["options"])
    ? field.validation["options"]
    : [];
  const options = raw.flatMap((candidate) =>
    typeof candidate === "string"
      ? [{ value: candidate, label: enumOptionLabel(field, candidate) }]
      : candidate &&
          typeof candidate === "object" &&
          !Array.isArray(candidate) &&
          typeof Reflect.get(candidate, "value") === "string"
        ? [
            {
              value: String(Reflect.get(candidate, "value")),
              label:
                typeof Reflect.get(candidate, "label") === "string"
                  ? String(Reflect.get(candidate, "label"))
                  : humanizeIdentifier(String(Reflect.get(candidate, "value"))),
            },
          ]
        : [],
  );
  return Object.freeze({
    key: field.key,
    label: field.list?.label ?? humanizeIdentifier(field.key),
    kind: !masked && field.keyReference ? "reference" : field.type,
    ...(!masked && field.keyReference ? {referenceLookup: {dependencies: field.keyReference.fields.filter(mapping => mapping.source !== field.key).map(mapping => mapping.source)}} : {}),
    required: field.required,
    readOnly,
    ...(options.length ? { options: Object.freeze(options) } : {}),
  });
}
function surfaceRevision(
  descriptor: EntityRuntimeDescriptor,
  projection: unknown,
) {
  return Object.freeze({
    release: descriptor.releaseNo,
    descriptorHash: normalizeDigest(descriptor.compiledHash),
    surfaceHash: digest(projection),
  });
}

/** Presentation and choice providers must honor the same published query-use
 * boundary as the executor. Masked values cannot become filter enumerations. */
function queryableListFields(descriptor: EntityRuntimeDescriptor, fields: readonly EntityFieldDescriptor[]): readonly EntityFieldDescriptor[] {
  if (!descriptor.authorization) return fields;
  return fields.map(field => {
    const policy = descriptor.authorization!.fieldPolicies.find(policy => policy.fields.includes(field.key));
    const allowed = (use: "filter" | "sort" | "group" | "search") => policy?.representation === "plain" && policy.queryUses.includes(use);
    return {
      ...field,
      filterable: field.filterable === true && allowed("filter"),
      sortable: field.sortable === true && allowed("sort"),
      searchable: field.searchable === true && allowed("search"),
      list: { ...field.list, groupable: field.list?.groupable === true && allowed("group"), ...(!allowed("group") ? { aggregations: [] } : {}) },
    };
  });
}

export function compileEntityListDescriptor(
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  readableFields: readonly EntityFieldDescriptor[],
  scope?: EffectiveAuthorizationScope,
  collectionScope?: RecordCollectionScopeResolution,
  dataOperations?: EntityListDataOperationsV1,
  actions: readonly EffectiveListActionV1[] = [],
  navigation: readonly EffectiveEntitySectionV1[] = [],
): EntityListDescriptorV1 {
  readableFields = queryableListFields(descriptor, readableFields);
  if (!readableFields.length)
    throw new RecordServiceError(
      403,
      "ENTITY_LIST_FIELDS_FORBIDDEN",
      "No fields are readable for this entity list",
    );
  // Storage identity is used for routes and selection, never presentation.
  // UUID references remain internal; readable labels belong in published fields.
  readableFields = readableFields.filter(
    field => field.type !== "uuid" && field.storagePath !== descriptor.storage.idField,
  );
  if (!readableFields.length)
    throw new RecordServiceError(
      503,
      "ENTITY_LIST_PRESENTATION_REQUIRED",
      "Publish a readable business field for this entity list",
    );
  // The executor searches the published search profile as a whole. Do not
  // advertise a partial profile that would still query a forbidden member.
  const searchAdmitted = descriptor.fields.filter(field => field.searchable).every(field => readableFields.some(visible => visible.key === field.key && visible.searchable));
  const configuredIdentity = descriptor.listPresentation?.identityField;
  const identityKey =
    configuredIdentity &&
    readableFields.some((field) => field.key === configuredIdentity)
      ? configuredIdentity
      : readableFields.find(field => field.key === descriptor.recordPresentation?.titleField)?.key
        ?? readableFields[0]!.key;
  const configuredColumnList =
    descriptor.listPresentation?.defaultState?.columns ??
    descriptor.listPresentation?.defaultColumns ??
    [];
  const configuredColumns = new Set(configuredColumnList);
  const hasConfiguredColumns = configuredColumns.size > 0;
  // The record title is published once, on the record presentation. Lists
  // reuse it as the `title` role so record cards need no second declaration.
  const recordTitleKey = descriptor.recordPresentation?.titleField;
  const fields: ListFieldDescriptorV1[] = readableFields.map((field, index) => {
    const masked = maskedPresentationField(descriptor, field.key);
    const options = !masked && (field.filterable || field.type === "enum") ? filterOptions(field) : [];
    const semanticRole = masked ? undefined :
      field.list?.semanticRole ??
      (field.key === recordTitleKey && field.key !== identityKey ? "title" : undefined);
    const statusTones = masked ? undefined : field.list?.statusTones ?? descriptor.recordPresentation?.badges.find(badge => badge.field === field.key)?.tones;
    return Object.freeze({
      key: field.key,
    label: field.list?.label ?? humanizeIdentifier(field.key),
      ...(field.list?.columnGroup
        ? { columnGroup: field.list.columnGroup }
        : {}),
      valueKind:
        field.keyReference || field.list?.semanticRole === "country_code" ? "reference" : field.type,
      ...(!masked && field.keyReference ? { referenceLookup: { dependencies: field.keyReference.fields.filter(mapping => mapping.source !== field.key).map(mapping => mapping.source) } } : {}),
      ...(semanticRole ? { semanticRole } : {}),
      ...(field.list?.cardPriority
        ? { cardPriority: field.list.cardPriority }
        : {}),
      ...(statusTones ? { statusTones } : {}),
      ...(field.list?.rendererKey
        ? { rendererKey: field.list.rendererKey }
        : {}),
      ...(options.length ? { filterOptions: options } : {}),
      defaultVisible:
        field.key === identityKey ||
        (hasConfiguredColumns
          ? configuredColumns.has(field.key)
          : (field.list?.defaultVisible ??
            (index < 8 &&
              !["confidential", "pii", "sensitive_pii"].includes(
                field.classification ?? "internal",
              )))),
      defaultOrder:
        hasConfiguredColumns && configuredColumns.has(field.key)
          ? configuredColumnList.indexOf(field.key)
          : (field.list?.defaultOrder ?? index),
      ...(field.list?.defaultWidth
        ? { defaultWidth: field.list.defaultWidth }
        : {}),
      filterOperators: field.filterable
        ? configuredFilterOperators(field)
        : Object.freeze([]),
      sortable: field.sortable === true,
      groupable: field.list?.groupable === true,
      aggregations: Object.freeze(field.list?.aggregations ?? []),
    });
  });
  const ordered = Object.freeze(
    [...fields]
      .sort(
        (left, right) =>
          Number(right.key === identityKey) -
            Number(left.key === identityKey) ||
          left.defaultOrder - right.defaultOrder ||
          left.key.localeCompare(right.key),
      )
      .map((field, index) => Object.freeze({ ...field, defaultOrder: index })),
  );
  const columns = Object.freeze(
    ordered.filter((field) => field.defaultVisible).map((field) => field.key),
  );
  const label = humanizeIdentifier(descriptor.entityCode);
  const contextRequired =
    collectionScope?.status === "context_required" ||
    Boolean(
      descriptor.directoryScope?.mode !== "tenant" &&
      scope &&
      !scope.tenantWide &&
      (collectionScope?.status !== "ready" ||
        !collectionScope.constraints.length),
    );
  const scopeLabels = collectionScope?.labels.length
    ? collectionScope.labels
    : [
        {
          key: "access",
          label: "Scope",
          value: contextRequired
            ? "Work context required"
            : "All permitted tenant records",
        },
      ];
  const configuredLimits = descriptor.listPresentation?.limits;
  const masked = (key: string) => maskedPresentationField(descriptor, key);
  const boardResolution = descriptor.listPresentation?.board
    ? resolveListBoard({
        board: descriptor.listPresentation.board,
        countMode: configuredLimits?.countMode ?? descriptor.listPresentation.countMode ?? "none",
        fields: ordered,
        entityFields: descriptor.fields,
        masked,
      })
    : undefined;
  const board = boardResolution && "board" in boardResolution ? boardResolution.board : undefined;
  const cardContent = descriptor.listPresentation?.cardContent
    ? resolveCardContent({ cardContent: descriptor.listPresentation.cardContent, fields: ordered, masked })
    : undefined;
  const { supported: modes, unavailable: unavailableModes } = resolveModes(
    descriptor.listPresentation?.supportedModes,
    boardResolution && "unavailable" in boardResolution ? boardResolution.unavailable : board ? undefined : "LIST_MODE_UNSUPPORTED",
  );
  const pageSizes = normalizePageSizes(
    configuredLimits?.allowedPageSizes ??
      descriptor.listPresentation?.allowedPageSizes,
  );
  const requestedPageSize =
    configuredLimits?.defaultPageSize ??
    descriptor.listPresentation?.defaultPageSize;
  const defaultPageSize = pageSizes.includes(requestedPageSize ?? -1)
    ? requestedPageSize!
    : pageSizes[0]!;
  const maxSortLevels =
    configuredLimits?.maxSortLevels ?? ENTITY_LIST_MAX_SORT_LEVELS;
  const configuredState = descriptor.listPresentation?.defaultState;
  const defaultSort = normalizeDefaultSort(
    configuredState?.sort ?? descriptor.listPresentation?.defaultSort,
    ordered,
    maxSortLevels,
  );
  const defaultFilters = normalizeDefaultFilters(
    configuredState?.filters,
    ordered,
  );
  const defaultGroup =
    configuredState?.group &&
    ordered.some(
      (field) => field.key === configuredState.group && field.groupable,
    )
      ? configuredState.group
      : undefined;
  const defaultMode =
    configuredState?.mode && modes.includes(configuredState.mode)
      ? configuredState.mode
      : modes[0]!;
  const minimumQueryLength =
    descriptor.listPresentation?.search?.minimumQueryLength ?? 1;
  const filterPresentation = resolveFilterPresentation(descriptor, ordered);
  const surfaceProjection = {
    entityCode: descriptor.entityCode,
    fields: ordered,
    modes,
    pageSizes,
    maxSortLevels,
    defaultSort,
    defaultFilters,
    defaultGroup,
    defaultMode,
    ...(unavailableModes.length ? { unavailableModes } : {}),
    ...(board ? { board } : {}),
    ...(cardContent ? { cardContent } : {}),
    minimumQueryLength,
    filterPresentation,
    experience: descriptor.listPresentation?.experience,
  };
  return Object.freeze({
    schemaVersion: 1,
    serverViews: true,
    ...(descriptor.listPresentation?.localizedLabels ? { localizedLabels: authorizedPresentationLocalization(descriptor, descriptor.listPresentation.localizedLabels, fields.map(field => field.key)) } : {}),
    plane: descriptor.planeKey,
    entity: Object.freeze({
      code: descriptor.entityCode,
      label,
      pluralLabel: pluralize(label),
      identityField: identityKey,
      ...(descriptor.detailRouteTemplate
        ? { detailRouteTemplate: descriptor.detailRouteTemplate }
        : {}),
    }),
    revision: Object.freeze({
      release: descriptor.releaseNo,
      descriptorHash: normalizeDigest(descriptor.compiledHash),
      surfaceHash: digest(surfaceProjection),
    }),
    surface: Object.freeze({
      key: "default_list",
      title: descriptor.listPresentation?.experience
        ? resolveEntityText(descriptor.listPresentation.experience.header.title)
        : (descriptor.listPresentation?.title ?? descriptor.entityCode),
      ...(descriptor.listPresentation?.experience
        ? { header: descriptor.listPresentation.experience.header }
        : {}),
      ...(descriptor.listPresentation?.description
        ? { description: descriptor.listPresentation.description }
        : {}),
      defaultState: Object.freeze({
        ...(searchAdmitted && configuredState?.query ? { query: configuredState.query } : {}),
        filters: defaultFilters,
        sort: defaultSort,
        ...(defaultGroup ? { group: defaultGroup } : {}),
        columns,
        density:
          configuredState?.density ??
          descriptor.listPresentation?.defaultDensity ??
          "comfortable",
        mode: defaultMode,
      }),
      supportedModes: modes,
      ...(unavailableModes.length ? { unavailableModes } : {}),
      ...(board ? { board } : {}),
      ...(cardContent ? { cardContent } : {}),
      search: Object.freeze({
        ...(searchAdmitted && descriptor.listPresentation?.search?.profileKey
          ? { profileKey: descriptor.listPresentation.search.profileKey }
          : {}),
        minimumQueryLength,
      }),
      filterPresentation,
    }),
    fields: ordered,
    actions,
    navigation,
    ...(descriptor.listPresentation?.experience?.application
      ? { application: descriptor.listPresentation.experience.application }
      : {}),
    ...(descriptor.listPresentation?.experience?.currentSurfaceKey
      ? {
          currentSurfaceKey:
            descriptor.listPresentation.experience.currentSurfaceKey,
        }
      : {}),
    ...(dataOperations ? { dataOperations } : {}),
    scope: Object.freeze({
      ...(collectionScope &&
      collectionScope.status !== "forbidden" &&
      collectionScope.workContext
        ? { workContext: collectionScope.workContext }
        : {}),
      ...(descriptor.directoryScope?.quickFilters
        ? { quickFilters: descriptor.directoryScope.quickFilters }
        : {}),
      ...(descriptor.directoryScope?.filters
        ? { filterKinds: descriptor.directoryScope.filters }
        : {}),
      status: contextRequired ? "context_required" : "ready",
      labels: Object.freeze(scopeLabels),
      fingerprint: scopeFingerprint(
        context,
        descriptor,
        scope,
        collectionScope,
      ),
    }),
    limits: Object.freeze({
      defaultPageSize,
      allowedPageSizes: pageSizes,
      maxSortLevels,
      countMode:
        configuredLimits?.countMode ??
        descriptor.listPresentation?.countMode ??
        "none",
    }),
  });
}

async function effectiveDataOperations(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  readable: readonly EntityFieldDescriptor[],
  scope?: EffectiveAuthorizationScope,
  collectionScope?: RecordCollectionScopeResolution,
): Promise<EntityListDataOperationsV1> {
  const resource =
    collectionScope?.status === "ready"
      ? collectionScope.authorizationResource
      : { entityCode: descriptor.entityCode };
  const allowed = async (operation: "import" | "export") => {
    const published = descriptor.operations[operation];
    const permission = published?.permissionCode;
    return published
      ? {
          permission,
          allowed: (
            await authorizeEntityOperation(authorizer, {
              context,
              permissionCode: permission,
              resource: { ...resource, tenantId: context.tenantId, entityCode: descriptor.entityCode, operationKey: operation, ...(usesEntityBackendAuthorization(authorizer, context, descriptor)
                ? {entityCode: descriptor.entityCode, operationKey: operation, authorizationDescriptorHash: descriptor.compiledHash} : {}) },
              observation: {
                entityCode: descriptor.entityCode,
                operationKey: operation,
                surface: "transfer",
                phase: "discover",
              },
            })
          ).allowed,
        }
      : undefined;
  };
  const [exportAuthority, importAuthority] = await Promise.all([
    allowed("export"),
    allowed("import"),
  ]);
  const enabled = (
    permission?: string,
    maxRecords?: number,
    requiresPreflight = false,
    requiresApproval = false,
  ) =>
    Object.freeze({
      state: "enabled" as const,
      ...(maxRecords ? { maxRecords } : {}),
      ...(permission ? { requiredPermission: permission } : {}),
      requiresPreflight,
      requiresApproval,
    });
  const disabled = (
    permission: string | undefined,
    code: string,
    message: string,
    requiresApproval = false,
  ) =>
    Object.freeze({
      state: "disabled" as const,
      ...(permission ? { requiredPermission: permission } : {}),
      requiresPreflight: true,
      requiresApproval,
      disabledReason: Object.freeze({ code, message }),
    });
  const hidden = Object.freeze({
    state: "hidden" as const,
    requiresPreflight: false,
    requiresApproval: false,
  });
  const config = descriptor.listPresentation?.dataOperations;
  const exportMax = config?.exportMaxRecords ?? 250_000,
    importMax = config?.importMaxRows ?? 50_000;
  const exportable = readable.filter(field => exportableClassification(field.classification) &&
    (!usesEntityBackendAuthorization(authorizer, context, descriptor) || descriptor.authorization!.fieldPolicies.some(policy =>
      policy.fields.includes(field.key) && policy.representation === "plain" && policy.queryUses.includes("export"))));
  const serverExport = exportAuthority?.allowed && exportable.length
    ? enabled(exportAuthority.permission, exportMax, true)
    : hidden;
  const adapterReady = Boolean(config?.importAdapterKey);
  const parentScoped =
    collectionScope?.status === "ready" &&
    (collectionScope.constraints ?? []).some(
      (constraint) => constraint.kind === "entity.parent.v1",
    );
  const serverImport = !importAuthority?.allowed || parentScoped
    ? hidden
    : !adapterReady
      ? disabled(
          importAuthority.permission,
          "GOVERNED_IMPORT_ADAPTER_REQUIRED",
          "A tested plane-owned import adapter has not been published for this entity.",
          true,
        )
      : enabled(importAuthority.permission, importMax, true);
  const createFields = readable
      .filter((field) => field.writableOn.includes("create"))
      .map((field) => field.key),
    patchFields = readable
      .filter((field) => field.writableOn.includes("patch"))
      .map((field) => field.key),
    importable = [...new Set([...createFields, ...patchFields])];
  const importModes = new Set(
    config?.importOperations ?? ["create", "update", "upsert"],
  );
  const modeAllowed = async (
    mode: "create" | "update" | "upsert" | "delete" | "replace",
  ) => {
    const permissions = config?.importOperationPermissions?.[mode] ?? [];
    if (!importModes.has(mode)) return false;
    const decisions = await Promise.all(
      permissions.map((permissionCode) =>
        authorizer.authorize({ context, permissionCode, resource }),
      ),
    );
    return decisions.every((decision) => decision.allowed);
  };
  const [
    createAllowed,
    updateAllowed,
    upsertAllowed,
    deleteAllowed,
    replaceAllowed,
  ] = await Promise.all([
    modeAllowed("create"),
    modeAllowed("update"),
    modeAllowed("upsert"),
    modeAllowed("delete"),
    modeAllowed("replace"),
  ]);
  const exportFormats = Object.freeze(
    config?.exportFormats?.length
      ? [...new Set(config.exportFormats)]
      : (["xlsx", "csv", "json", "ndjson"] as const),
  );
  const importFormats = Object.freeze(
    config?.importFormats?.length
      ? [...new Set(config.importFormats)]
      : (["csv", "json"] as const),
  );
  return Object.freeze({
    ...(entityTransferWorkspaces[descriptor.planeKey] ? { workspaceHref: entityTransferWorkspaces[descriptor.planeKey] } : {}),
    export: Object.freeze({
      currentPage: serverExport,
      selected: serverExport,
      filtered: serverExport,
      all:
        exportAuthority?.allowed &&
        config?.allowEntireEntityExport === true &&
        scope?.tenantWide
          ? serverExport
          : hidden,
      formats: exportFormats,
      defaultFormat: exportFormats[0]!,
      exportableFields: Object.freeze(exportable.map((field) => field.key)),
      asynchronousThreshold: config?.asynchronousThreshold ?? 5_000,
    }),
    import: Object.freeze({
      create:
        importAuthority?.allowed &&
        importModes.has("create") &&
        createAllowed &&
        createFields.length
          ? serverImport
          : hidden,
      update:
        importAuthority?.allowed &&
        importModes.has("update") &&
        updateAllowed &&
        patchFields.length
          ? serverImport
          : hidden,
      upsert:
        importAuthority?.allowed &&
        importModes.has("upsert") &&
        upsertAllowed &&
        createFields.length &&
        patchFields.length
          ? serverImport
          : hidden,
      delete:
        importAuthority?.allowed && importModes.has("delete") && deleteAllowed
          ? serverImport
          : hidden,
      replace:
        importAuthority?.allowed &&
        importModes.has("replace") &&
        replaceAllowed &&
        createFields.length &&
        patchFields.length
          ? serverImport
          : hidden,
      downloadTemplate:
        importAuthority?.allowed &&
        config?.allowTemplateDownload !== false &&
        importable.length
          ? enabled(importAuthority.permission)
          : hidden,
      formats: importFormats,
      defaultFormat: importFormats[0]!,
      importableFields: Object.freeze(importable),
      maxFileBytes: config?.importMaxFileBytes ?? 25 * 1024 * 1024,
      maxRows: importMax,
      draftOnly: config?.draftOnly ?? descriptor.planeKey === "studio",
    }),
  });
}

function filterOptions(
  field: EntityFieldDescriptor,
): readonly Readonly<{ value: string | number | boolean; label: string }>[] {
  const configured = field.validation?.["options"];
  if (!Array.isArray(configured) || configured.length > 500)
    return Object.freeze([]);
  const options = configured.flatMap((candidate) => {
    if (["string", "number", "boolean"].includes(typeof candidate))
      return [
        {
          value: candidate as string | number | boolean,
          label: enumOptionLabel(field, String(candidate)),
        },
      ];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      return [];
    const value = Reflect.get(candidate, "value"),
      label = Reflect.get(candidate, "label");
    return ["string", "number", "boolean"].includes(typeof value) &&
      typeof label === "string" &&
      label.trim()
      ? [{ value: value as string | number | boolean, label: label.trim() }]
      : [];
  });
  return Object.freeze(options);
}

/** Splits declared modes into those this service can project and those it
 * cannot. Unrenderable declarations are reported, never silently dropped. */
function resolveModes(
  value: readonly ListViewMode[] | undefined,
  /** Why Board cannot be offered to this viewer, or undefined when it can. */
  boardUnavailable: string | undefined,
): {
  readonly supported: readonly ListViewMode[];
  readonly unavailable: readonly ListUnavailableModeV1[];
} {
  const renderable = new Set<ListViewMode>(ENTITY_LIST_RENDERABLE_MODES);
  if (!boardUnavailable) renderable.add("board");
  const declared = [...new Set(value ?? ENTITY_LIST_RENDERABLE_MODES)];
  const supported = declared.filter((mode) => renderable.has(mode));
  return Object.freeze({
    supported: Object.freeze(supported.length ? supported : ["table" as const]),
    unavailable: Object.freeze(
      declared
        .filter((mode) => !renderable.has(mode))
        .map((mode) => Object.freeze({ mode, code: mode === "board" && boardUnavailable ? boardUnavailable : "LIST_MODE_UNSUPPORTED" })),
    ),
  });
}
function normalizePageSizes(
  value: readonly number[] | undefined,
): readonly number[] {
  const sizes = [
    ...new Set(
      (value ?? [25, 50, 100]).filter(
        (size) => Number.isInteger(size) && size >= 1 && size <= 100,
      ),
    ),
  ].sort((left, right) => left - right);
  return Object.freeze(sizes.length ? sizes : [50]);
}
function normalizeDefaultSort(
  value: readonly ListSortV1[] | undefined,
  fields: readonly ListFieldDescriptorV1[],
  maxSortLevels: number,
): readonly ListSortV1[] {
  const sortable = new Set(
    fields.filter((field) => field.sortable).map((field) => field.key),
  );
  const seen = new Set<string>();
  const normalized: ListSortV1[] = [];
  for (const sort of value ?? []) {
    if (normalized.length === maxSortLevels) break;
    if (!sortable.has(sort.field) || seen.has(sort.field)) continue;
    seen.add(sort.field);
    normalized.push(
      Object.freeze({
        field: sort.field,
        direction: sort.direction,
        ...(sort.nulls ? { nulls: sort.nulls } : {}),
      }),
    );
  }
  return Object.freeze(normalized);
}

function configuredFilterOperators(
  field: EntityFieldDescriptor,
): ListFieldDescriptorV1["filterOperators"] {
  const operators = recordFieldFilterOperators(field);
  return field.list?.semanticRole === "country_code"
    ? operators.filter((operator) =>
        ["eq", "ne", "in", "is_null", "is_not_null"].includes(operator),
      )
    : operators;
}

function resolveFilterPresentation(
  descriptor: EntityRuntimeDescriptor,
  fields: readonly ListFieldDescriptorV1[],
): EntityListDescriptorV1["surface"]["filterPresentation"] {
  const byKey = new Map(fields.map((field) => [field.key, field])),
    configured =
      descriptor.listPresentation?.filterPresentation?.quickFields ?? [];
  const metadata = configured
    .flatMap((item) => {
      const field = byKey.get(item.field);
      if (!field?.filterOperators.length) return [];
      const defaultOperator =
        item.defaultOperator &&
        field.filterOperators.includes(
          item.defaultOperator as ListFilterOperator,
        )
          ? (item.defaultOperator as ListFilterOperator)
          : preferredFilterOperator(field);
      return [Object.freeze({ field: field.key, defaultOperator })];
    })
    .slice(0, 4);
  const quickFields = metadata.length ? metadata : fallbackQuickFields(fields);
  return Object.freeze({
    quickFields: Object.freeze(quickFields),
    source: metadata.length ? "metadata" : "fallback",
    allowUserPinning:
      descriptor.listPresentation?.filterPresentation?.allowUserPinning ===
      true,
  });
}

function normalizeDefaultFilters(
  value: EntityListDefaultStateDescriptor["filters"],
  fields: readonly ListFieldDescriptorV1[],
): readonly ListFilterV1[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const filters: ListFilterV1[] = [];
  for (const filter of value ?? []) {
    const field = byKey.get(filter.field);
    if (!field?.filterOperators.includes(filter.operator)) continue;
    const normalized =
      filter.value === undefined ? undefined : jsonValue(filter.value);
    if (filter.value !== undefined && normalized === undefined) continue;
    filters.push(
      Object.freeze({
        field: filter.field,
        operator: filter.operator,
        ...(normalized !== undefined ? { value: normalized } : {}),
      }),
    );
  }
  return Object.freeze(filters);
}

function formatGroupLabel(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => jsonValue(item) ?? null);
  if (typeof value === "object")
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).flatMap(
          ([key, item]) => {
            const normalized = jsonValue(item);
            return normalized === undefined ? [] : [[key, normalized]];
          },
        ),
      ),
    );
  return String(value);
}

function entityLabels(descriptor: EntityRuntimeDescriptor) {
  const localization = descriptor.listPresentation?.localizedLabels ?? descriptor.recordPresentation?.localizedLabels;
  const singular = localization?.entity?.defaultText ?? humanizeIdentifier(descriptor.entityCode);
  const plural = localization?.title?.defaultText ?? descriptor.listPresentation?.title ?? pluralize(singular);
  return { singular, plural, localization };
}

function pluralize(value: string): string {
  return /[^aeiou]y$/i.test(value)
    ? `${value.slice(0, -1)}ies`
    : /s$/i.test(value)
      ? value
      : `${value}s`;
}
function normalizeDigest(value: string): string {
  return /^(?:sha256:)?[a-f0-9]{64}$/.test(value) ? value : digest(value);
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function scopeFingerprint(
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  scope?: EffectiveAuthorizationScope,
  collectionScope?: RecordCollectionScopeResolution,
): string {
  return digest({
    planeKey: context.planeKey,
    tenantId: context.tenantId,
    principalFingerprint: context.permissions.principalFingerprint,
    authEpoch: context.authEpoch,
    profileHash: context.profileHash,
    schemaHash: context.permissions.schemaHash,
    descriptorHash: descriptor.compiledHash,
    scope: scope ?? null,
    workContext:
      collectionScope && collectionScope.status !== "forbidden"
        ? (collectionScope.workContext ?? null)
        : null,
    collectionScope:
      collectionScope?.status === "ready"
        ? collectionScope.fingerprintMaterial
        : (collectionScope?.status ?? null),
  });
}

async function resolveCollectionScope(
  resolver: RecordCollectionScopeResolver | undefined,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  coordinate?: ListRecordsQuery["scopeCoordinate"],
): Promise<RecordCollectionScopeResolution> {
  if (!resolver && (coordinate?.parentEntityCode || coordinate?.parentRecordId || coordinate?.relationshipKey || coordinate?.parentDescriptorHash))
    throw new RecordServiceError(403, "ENTITY_PARENT_ACCESS_DENIED", "Related record scope is unavailable");
  if (resolver)
    return resolver.resolve({
      context,
      descriptor,
      operationCode: "read",
      ...(coordinate ? { coordinate } : {}),
    });
  return Object.freeze({
    status: "ready",
    authorizationResource: Object.freeze({}),
    constraints: Object.freeze([]),
    labels: Object.freeze([]),
    fingerprintMaterial: Object.freeze({ mode: "tenant" }),
  });
}

function normalizeRecord(descriptor: EntityRuntimeDescriptor, data: Readonly<Record<string, unknown>>, readable?: readonly string[]): EntityRecordV1 {
      const rawId = data[descriptor.storage.idField];
      if (typeof rawId !== "string" && typeof rawId !== "number")
        throw new RecordServiceError(
          500,
          "RECORD_IDENTITY_INVALID",
          "The record has no serializable identity",
        );
      const values = Object.fromEntries(
        descriptor.fields.filter(field => !readable || readable.includes(field.key)).flatMap((field) =>
          Object.hasOwn(data, field.key) ? [[field.key, data[field.key]]] : [],
        ),
      );
      const version = recordVersion(descriptor.storage.versionField
        ? data[descriptor.storage.versionField] : undefined);
      return Object.freeze({
        id: String(rawId),
        ...(version === undefined ? {} : { version }),
        values: Object.freeze(values),
      });
}

// PostgreSQL bigint columns arrive as decimal strings. Preserve optimistic
// concurrency coordinates without rounding an unsafe integer.
function recordVersion(value: unknown): number | undefined {
  const numeric = typeof value === "number" || typeof value === "string" && /^[0-9]+$/.test(value)
    ? Number(value) : NaN;
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : undefined;
}

/** Masked values must not disclose their finite domain through label catalogs or header tones. */
function maskedPresentationField(descriptor: EntityRuntimeDescriptor, key: string): boolean {
  return descriptor.authorization?.fieldPolicies.some(policy => policy.representation === "masked" && policy.fields.includes(key)) ?? false;
}
function authorizedPresentationLocalization(descriptor: EntityRuntimeDescriptor, localization: Parameters<typeof readablePresentationLocalization>[0], fields: readonly string[]) {
  const readable = readablePresentationLocalization(localization, fields);
  return readable ? { ...readable, ...(readable.options ? { options: Object.fromEntries(Object.entries(readable.options).filter(([key]) => !maskedPresentationField(descriptor, key))) } : {}) } : undefined;
}
