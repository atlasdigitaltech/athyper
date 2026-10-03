import { resolveEntityStatusTone } from "@athyper/contract-platform-entity-runtime";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { createEntityCapabilityPolicy } from "./entity-capability-policy.js";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import {
  PinnedCompiledEntityReader,
  type CompiledEntityReleaseCoordinate,
  type CompiledEntityResolvedRelease,
} from "@athyper/server-platform-metadata";
import { planEntityPage, type EntityPagePlan } from "./entity-page-planner.js";

export interface EntityRuntimeHeaderRepository {
  readHeader(input: {
    readonly context: VerifiedRequestContext;
    readonly release: CompiledEntityResolvedRelease;
    readonly core: CompiledEntityArtifactV2;
    readonly recordId: string;
    readonly fieldKeys: readonly string[];
  }): Promise<{ readonly revision: string; readonly values: Readonly<Record<string, unknown>> } | null>;
}

export interface EntityRuntimeResourceContext {
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
  readonly asOf?: string;
  /** Entity-specific lens; the registered domain adapter validates its vocabulary. */
  readonly roleLens?: string;
  /** A validated root comment whose direct replies are being paged independently. */
  readonly threadRootId?: string;
  readonly commentFilter?: "mentions";
}

export interface EntityRuntimeSectionHandler {
  read(input: {
    /** Already authorized against this request's pinned metadata release. */
    readonly capability?: Awaited<ReturnType<ReturnType<typeof createEntityCapabilityPolicy>["resolve"]>>;
    readonly context: VerifiedRequestContext;
    readonly release: CompiledEntityResolvedRelease;
    readonly core: CompiledEntityArtifactV2;
    readonly section: CompiledEntityArtifactV2;
    readonly recordId: string;
    readonly limit: number;
    readonly cursor?: string;
    readonly resourceContext?: EntityRuntimeResourceContext;
  }): Promise<{ readonly revision: string; readonly data: unknown }>;
}

export interface EntityRuntimeSummaryHandler {
  /** Required for discovery on normalized runtime-contract detail pages. */
  authorize?(input: Parameters<EntityRuntimeSummaryHandler["read"]>[0]): Promise<boolean>;
  read(input: {
    readonly context: VerifiedRequestContext;
    readonly release: CompiledEntityResolvedRelease;
    readonly core: CompiledEntityArtifactV2;
    readonly recordId: string;
    readonly resourceContext?: EntityRuntimeResourceContext;
    /** Shared only for one summary request; providers may deduplicate a common source. */
    readonly requestCache: Map<string, Promise<unknown>>;
  }): Promise<unknown>;
}

/** Capability readers do not require a fabricated page-section artifact. */
export interface EntityRuntimeCollaborationHandler {
  read(input: Omit<Parameters<EntityRuntimeSectionHandler["read"]>[0], "section">): ReturnType<EntityRuntimeSectionHandler["read"]>;
}
export interface EntityRuntimeSummaryHandlerRegistry {
  get(provider: string): EntityRuntimeSummaryHandler | undefined;
}

export interface EntityRuntimeSectionHandlerRegistry {
  get(handlerKey: string): EntityRuntimeSectionHandler | undefined;
  /** Platform capability bindings are selected by published service key, never entity code. */
  getService?(serviceKey: string): EntityRuntimeCollaborationHandler | undefined;
}

export function createEntityRuntimeResourceService(options: {
  readonly publishedSummary?: (input: { context: VerifiedRequestContext; entityCode: string; recordId: string; resourceContext?: EntityRuntimeResourceContext }, release: CompiledEntityResolvedRelease) => Promise<unknown>;
  readonly capabilities?: ReturnType<typeof createEntityCapabilityPolicy>;
  readonly reader: PinnedCompiledEntityReader;
  readonly displayChoices?: (context: VerifiedRequestContext, catalog: string, values?: readonly string[]) => Promise<readonly { value: string; label: { labelKey: string; defaultText: string } }[]>;
  readonly headers: EntityRuntimeHeaderRepository;
  readonly sections: EntityRuntimeSectionHandlerRegistry;
  readonly summaries?: EntityRuntimeSummaryHandlerRegistry;
}) {
  return Object.freeze({
    async bootstrap(input: {
      readonly context: VerifiedRequestContext;
      readonly entityCode: string;
      readonly recordId: string;
      readonly surfaceKey: string;
    }) {
      const model = await resolveSurface(options.reader, input.context, input.entityCode, input.surfaceKey);
      if (!model) return null;
      const plan = await pagePlan(options.reader, input.context, model.release, model.core, model.surface, input.surfaceKey);
      const header = await options.headers.readHeader({
        context: input.context,
        release: model.release,
        core: model.core,
        recordId: input.recordId,
        fieldKeys: plan.headerFieldKeys,
      });
      if (!header) return null;
      const headerCatalogs = new Map<string, ReturnType<NonNullable<typeof options.displayChoices>>>();
      const displayLabels = Object.fromEntries((await Promise.all(array(model.core.content.fields).map(async field => {
        if (!record(field) || typeof field.key !== "string" || !Object.hasOwn(header.values, field.key)) return [];
        const lookup = record(field.display) && record(field.display.lookup) ? field.display.lookup : {};
        if (field.dataType !== "enum" && typeof lookup.code !== "string" && !Array.isArray(lookup.options)) return [];
        let choices = array(lookup.options);
        if (typeof lookup.code === "string") {
          if (!options.displayChoices) throw new EntityRuntimeResourceError(503, "ENTITY_ENUM_LABEL_UNAVAILABLE");
          const key = `${lookup.code}:${String(header.values[field.key])}`;
          if (!headerCatalogs.has(key)) headerCatalogs.set(key, publishedDisplayChoices(options.displayChoices, input.context, lookup.code, [model.core], [String(header.values[field.key])]));
          choices = [...await headerCatalogs.get(key)!];
        }
        const option = choices.find(option=>record(option)&&option.value===header.values[field.key as string]);
        return [[field.key, record(option) ? localized(option.label)?.defaultText ?? null : null]];
      }))).flat());
      const headerDefinition = record(model.surface.content.header) ? model.surface.content.header : {};
      const statusField = typeof headerDefinition.statusField === "string" ? headerDefinition.statusField : undefined;
      const statusTone = resolveEntityStatusTone(statusField ? header.values[statusField] : undefined, headerDefinition.statusTones);
      return Object.freeze({ releaseId: model.release.release.releaseId, releaseHash: model.release.release.releaseHash, plan, header: {...header,values:{...header.values,displayLabels,statusTone}} });
    },
    async summary(input: {
      readonly context: VerifiedRequestContext;
      readonly entityCode: string;
      readonly recordId: string;
      readonly surfaceKey: string;
      readonly resourceContext?: EntityRuntimeResourceContext;
    }) {
      const release = await options.reader.resolve(coordinate(input.context, input.entityCode));
      if (!release) return null;
      // Retained compiled experiences may contain both a runtime contract and
      // an explicit legacy surface. Keep that surface on its established path;
      // normalized publications need no fabricated presentation artifact.
      if (release.artifactIndex.has(`${input.entityCode}/runtime`) && !release.artifactIndex.has(`${input.entityCode}/presentation.${input.surfaceKey}`)) {
        if (input.surfaceKey !== "detail") return null;
        return options.publishedSummary ? options.publishedSummary(input, release) : null;
      }
      const model = await options.reader.surfaceModel({ ...coordinate(input.context, input.entityCode), releaseId: release.release.releaseId, releaseHash: release.release.releaseHash }, input.surfaceKey);
      if (!model) return null;
      const plan = await pagePlan(options.reader, input.context, model.release, model.core, model.surface, input.surfaceKey);
      if (!plan.summaryView || !options.summaries) return null;
      const header = await options.headers.readHeader({ context: input.context, release: model.release, core: model.core, recordId: input.recordId, fieldKeys: plan.headerFieldKeys });
      if (!header) return null;
      const requestCache = new Map<string, Promise<unknown>>();
      const cards = await Promise.all(plan.summaryView.cards.map(async (card) => {
        const handler = options.summaries!.get(card.provider);
        if (!handler) return Object.freeze({ key: card.key, state: "unavailable" as const });
        try {
          const data = await handler.read({ context: input.context, release: model.release, core: model.core, recordId: input.recordId, ...(input.resourceContext ? { resourceContext: input.resourceContext } : {}), requestCache });
          const definition = record(model.surface.content.summaryView) ? array(model.surface.content.summaryView.cards).find(value=>record(value)&&value.key===card.key) : undefined;
          const fields = await Promise.all((record(definition)?array(definition.displayFields):[]).map(async field=>{
            if(!record(field)||!record(field.display)||!record(field.display.lookup)||typeof field.display.lookup.code!=="string") return field;
            if(!options.displayChoices) throw new EntityRuntimeResourceError(503,"ENTITY_ENUM_LABEL_UNAVAILABLE");
            return {...field,dataType:"enum",display:{lookup:{options:await publishedDisplayChoices(options.displayChoices,input.context,field.display.lookup.code,[model.core,model.surface])}}};
          }));
          const presentation = browserSectionPresentation({...model.core,content:{fields}}, {...model.surface,content:{fieldBindings:fields.filter(record).map(f=>({fieldKey:f.key}))}}, {});
          return Object.freeze({ key: card.key, state: "ready" as const, data: record(data)?{...data,displayFields:presentation.fields}:data });
        } catch (error) {
          if (isContextRequired(error)) return Object.freeze({ key: card.key, state: "context_required" as const });
          return Object.freeze({ key: card.key, state: "unavailable" as const });
        }
      }));
      return Object.freeze({ releaseId: model.release.release.releaseId, releaseHash: model.release.release.releaseHash, revision: header.revision, cards: Object.freeze(cards) });
    },
    async section(input: {
      readonly context: VerifiedRequestContext;
      readonly entityCode: string;
      readonly recordId: string;
      readonly surfaceKey: string;
      readonly sectionKey: string;
      readonly limit?: number;
      readonly cursor?: string;
      readonly resourceContext?: EntityRuntimeResourceContext;
    }) {
      const model = await resolveSurface(options.reader, input.context, input.entityCode, input.surfaceKey);
      if (!model) return null;
      const plan = await pagePlan(options.reader, input.context, model.release, model.core, model.surface, input.surfaceKey, input.sectionKey);
      // Omission is deliberate: denied sections must not disclose their existence.
      if (!plan.sections.some((section) => section.key === input.sectionKey)) return null;
      const section = await options.reader.section(model.release, input.sectionKey);
      const kind=section.content.rendererKey==="platform.comments.v1"?"comments":section.content.rendererKey==="platform.attachments.v1"?"attachments":undefined;
      if (kind && input.cursor && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.cursor))
        throw new EntityRuntimeResourceError(403, "ENTITY_RUNTIME_RESOURCE_INVALID");
      const capability=kind && options.capabilities ? await options.capabilities.resolve({...input,kind,action:"read"},model.release) : undefined;
      if(kind && !capability) throw new EntityRuntimeResourceError(403,"ENTITY_CAPABILITY_DENIED");
      const handler = sectionHandler(options.sections, section);
      if (!handler) throw new EntityRuntimeResourceError(503, "ENTITY_RUNTIME_SECTION_HANDLER_UNAVAILABLE");
      let result: { readonly revision: string; readonly data: unknown };
      try {
        result = await handler.read({ capability, context: input.context, release: model.release, core: model.core, section, recordId: input.recordId, limit: Math.min(100, Math.max(1, input.limit ?? 25)), ...(input.cursor ? { cursor: input.cursor } : {}), ...(input.resourceContext ? { resourceContext: input.resourceContext } : {}) });
      } catch (error) {
        // A registered reader may require a resolved business context. Preserve that
        // expected state without exposing a domain exception as a generic 500.
        if (isContextRequired(error))
          throw new EntityRuntimeResourceError(409, "ENTITY_RUNTIME_CONTEXT_REQUIRED", "Select an authorized organization and company context for this section.");
        throw error;
      }
      const cores = new Map<string, CompiledEntityArtifactV2>();
      const catalogCache = new Map<string, ReturnType<NonNullable<typeof options.displayChoices>>>();
      const refs = [section.content.coreRef, ...array(section.content.childCollections).map(child => record(child) ? child.coreRef : undefined)];
      for (const ref of refs) {
        if (typeof ref !== "string" || cores.has(ref)) continue;
        const key = ref.replace(/\.json$/, "");
        const source = key === model.core.artifactKey ? model.core : await options.reader.artifactByKey(model.release, key, "core");
        const hydrate = async (field: unknown): Promise<unknown> => {
          if (!record(field) || !record(field.display)) return field;
          const nested = field.display.itemFields ? {itemFields:await Promise.all(array(field.display.itemFields).map(hydrate))} : {};
          if (!record(field.display.lookup) || typeof field.display.lookup.code !== "string") return {...field,display:{...field.display,...nested}};
          if (!options.displayChoices) throw new EntityRuntimeResourceError(503, "ENTITY_ENUM_LABEL_UNAVAILABLE");
          const catalog = field.display.lookup.code;
          const ids: string[]=[];
          const collect=(value:unknown):void=>{if(Array.isArray(value))value.forEach(collect);else if(record(value)){if(typeof field.key==='string'&&typeof value[field.key]==='string')ids.push(value[field.key] as string);Object.values(value).forEach(child=>{if(child&&typeof child==='object')collect(child);});}};
          collect(result.data);
          const values = [...new Set(ids)].sort();
          const cacheKey = catalog + JSON.stringify(values);
          if (!catalogCache.has(cacheKey)) catalogCache.set(cacheKey, values.length
            ? publishedDisplayChoices(options.displayChoices, input.context, catalog, [source, section], values)
            : Promise.resolve([]));
          const choices = await catalogCache.get(cacheKey)!;
          return { ...field, dataType: "enum", display: { ...field.display, ...nested, lookup: { ...field.display.lookup, options: choices } } };
        };
        const fields = await Promise.all(array(source.content.fields).map(hydrate));
        cores.set(ref, { ...source, content: { ...source.content, fields } });
      }
      return Object.freeze({
        releaseId: model.release.release.releaseId,
        releaseHash: model.release.release.releaseHash,
        sectionKey: input.sectionKey,
        presentation: browserSectionPresentation(cores.get(String(section.content.coreRef)) ?? model.core, section, result.data, cores),
        ...(capability ? {capability:capability.projection} : {}),
        ...result,
      });
    },
  });
}

export class EntityRuntimeResourceError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message = code) { super(message); }
}

function isContextRequired(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { status?: unknown }).status === 409;
}

async function resolveSurface(reader: PinnedCompiledEntityReader, context: VerifiedRequestContext, entityCode: string, surfaceKey: string) {
  return reader.surfaceModel(coordinate(context, entityCode), surfaceKey);
}
function coordinate(context: VerifiedRequestContext, entityCode: string): CompiledEntityReleaseCoordinate {
  return { tenantId: context.tenantId, principalId: context.principalId, planeKey: context.planeKey, entityCode };
}
async function pagePlan(reader: PinnedCompiledEntityReader, context: VerifiedRequestContext, release: CompiledEntityResolvedRelease, core: CompiledEntityArtifactV2, surface: CompiledEntityArtifactV2, surfaceKey: string, activeSectionKey?: string): Promise<EntityPagePlan> {
  const operation = await reader.operation(release);
  return planEntityPage({ release: release.release, core, surface, operation, grantedPermissions: new Set(context.permissions.allowed), ...(activeSectionKey ? { activeSectionKey } : {}) });
}
function sectionHandler(registry: EntityRuntimeSectionHandlerRegistry, section: CompiledEntityArtifactV2): EntityRuntimeSectionHandler | undefined {
  const binding = section.content.dataBinding;
  if (!binding || typeof binding !== "object" || Array.isArray(binding))
    throw new EntityRuntimeResourceError(503, "ENTITY_RUNTIME_SECTION_BINDING_UNSUPPORTED");
  const value = binding as Record<string, unknown>;
  if (value.kind === "registered_service" && typeof value.handlerKey === "string") return registry.get(value.handlerKey);
  if (typeof value.serviceKey === "string") return registry.getService?.(value.serviceKey);
  throw new EntityRuntimeResourceError(503, "ENTITY_RUNTIME_SECTION_BINDING_UNSUPPORTED");
}


/** Browser-safe renderer projection; handler/storage/policy internals never leave the server. */
type DisplayField = { unavailableReference?: { labelKey: string; defaultText: string }; key: string; temporalType?: "date" | "datetime"; label?: { labelKey: string; defaultText: string }; options?: readonly { value: string; label: { labelKey: string; defaultText: string } }[]; itemFields?: readonly DisplayField[] };
type SectionPresentation = { rendererKey: string; emptyState?: { title: string; detail: string }; fields: readonly DisplayField[]; childCollections: readonly { key: string; rendererKey: string; fields: readonly DisplayField[]; rowFields?: readonly (readonly DisplayField[])[]; label?: { labelKey: string; defaultText: string }; display?: "disclosure"; description?: string }[] };
function browserSectionPresentation(core: CompiledEntityArtifactV2, section: CompiledEntityArtifactV2, data: unknown, cores = new Map<string, CompiledEntityArtifactV2>()): SectionPresentation {
  const values = record(data) && record(data.values) ? data.values : {};
  const hidden = new Set(array(core.content.fields).flatMap(value =>
    record(value) && typeof value.key === "string" && !fieldVisible(value, values) ? [value.key] : []));
  const labels = new Map(array(core.content.fields).flatMap((value) => {
    if (!record(value) || typeof value.key !== "string") return [];
    return [[value.key, localized(value.label)] as const];
  }));
  const choices = new Map(array(core.content.fields).flatMap(value => {
    if (!record(value) || typeof value.key !== "string" || (value.dataType !== "enum" && !(record(value.display) && record(value.display.lookup) && Array.isArray(value.display.lookup.options)))) return [];
    const lookup = record(value.display) && record(value.display.lookup) ? value.display.lookup : {};
    const options = array(lookup.options).map(option => {
      if (!record(option) || typeof option.value !== "string" || !localized(option.label))
        throw new EntityRuntimeResourceError(503, "ENTITY_ENUM_LABEL_UNAVAILABLE");
      return { value: option.value, label: localized(option.label)! };
    });
    if (!Array.isArray(lookup.options)) throw new EntityRuntimeResourceError(503, "ENTITY_ENUM_LABEL_UNAVAILABLE");
    return [[value.key, options] as const];
  }));
  const fields = array(section.content.fieldBindings).flatMap((value) => {
    const key = record(value) && typeof value.fieldKey === "string" ? value.fieldKey : undefined;
    const label = record(value) ? localized(value.label) ?? (key ? labels.get(key) : undefined) : undefined;
    const dataKey = record(value) && typeof value.dataKey === "string" ? value.dataKey : key;
    const definition = array(core.content.fields).find(field=>record(field)&&field.key===key);
    const nested = record(definition) && record(definition.display) ? array(definition.display.itemFields) : [];
    const itemFields = nested.length ? browserSectionPresentation({...core,content:{fields:nested}}, {...section,content:{fieldBindings:nested.filter(record).map(f=>({fieldKey:f.key}))}}, {}).fields : undefined;
    const rootProtections = array(core.content.protections).filter(p => record(p) && record(p.protectedSource) && p.protectedSource.maskedByFieldKey === key);
    if (rootProtections.length > 1) throw new EntityRuntimeResourceError(503, "ENTITY_PROTECTION_AMBIGUOUS");
    const protection = record(definition) && record(definition.protection) ? definition.protection : rootProtections[0];
    const reveal = record(protection) && record(protection.reveal) ? protection.reveal : undefined;
    const revealOperation = reveal && typeof reveal.operationKey === "string" && typeof core.content.entityCode === "string" ? `${core.content.entityCode}.${reveal.operationKey}` : undefined;
    const revealPurposes = reveal ? array(reveal.purposes).map(value => {
      if (!record(value) || typeof value.value !== "string" || !localized(value.label)) throw new EntityRuntimeResourceError(503, "ENTITY_REVEAL_PURPOSE_UNAVAILABLE");
      return {value:value.value, label:localized(value.label)!};
    }) : undefined;
    const revealTargetField = reveal && typeof reveal.targetField === "string" ? reveal.targetField : "id";
    const maskedPrefix = record(protection) && record(protection.normalProjection) && typeof protection.normalProjection.displayPrefix === "string" ? protection.normalProjection.displayPrefix : undefined;
    return key && dataKey && !hidden.has(key) ? [Object.freeze({ key: dataKey, ...(record(definition) && record(definition.display) && localized(definition.display.unavailableReference) ? { unavailableReference: localized(definition.display.unavailableReference)! } : {}), ...(record(definition) && record(definition.display) && definition.display.attachmentDownload === true && definition.dataType === "uuid" ? {attachmentDownload:true as const} : {}), ...(record(definition) && (definition.dataType === "date" || definition.dataType === "datetime") ? {temporalType:definition.dataType as "date" | "datetime"} : {}), ...(maskedPrefix ? {maskedPrefix} : {}), ...(revealOperation ? {revealOperation, revealPurposes, revealTargetField} : {}), ...(label ? { label } : {}), ...(choices.has(key) ? { options: choices.get(key)! } : {}), ...(itemFields?{itemFields}:{}) })] : [];
  });
  const childCollections = array(section.content.childCollections).flatMap((value) => {
    if (!record(value) || typeof value.key !== "string" || typeof value.rendererKey !== "string") return [];
    const childCore = cores.get(String(value.coreRef));
    const childFields = childCore
      ? browserSectionPresentation(childCore, { ...section, content: { ...value, childCollections: [] } }, {}).fields
      : array(value.fieldBindings).flatMap(binding => record(binding) && typeof binding.fieldKey === "string"
        ? [{ key: binding.fieldKey, ...(localized(binding.label) ? { label: localized(binding.label)! } : {}) }] : []);
    const envelope = record(data) && record(data.data) ? data.data : data;
    const collections = record(envelope) && record(envelope.collections) ? envelope.collections : {};
    const rows = array(collections[value.key]).filter(record);
    const hasFacets = childCore && array(childCore.content.fields).some(field =>
      record(field) && array(field.dynamicFacets).some(facet => record(facet) && facet.facet === "visibility"));
    const rowFields = hasFacets ? rows.map(row => browserSectionPresentation(
      childCore!, { ...section, content: { ...value, childCollections: [] } }, { values: row },
    ).fields) : undefined;
    return [Object.freeze({ key: value.key, rendererKey: value.rendererKey, fields: Object.freeze(childFields),
      ...(rowFields ? { rowFields } : {}),
      ...(localized(value.label) ? {label: localized(value.label)} : {}),
      ...(value.display === "disclosure" ? {display: "disclosure" as const} : {}),
      ...(typeof value.description === "string" ? {description: value.description} : {}) })];
  });
  const empty = record(section.content.emptyState) && typeof section.content.emptyState.title === "string" && section.content.emptyState.title.trim() && typeof section.content.emptyState.detail === "string" && section.content.emptyState.detail.trim()
    ? Object.freeze({ title: section.content.emptyState.title, detail: section.content.emptyState.detail })
    : undefined;
  return Object.freeze({
    rendererKey: typeof section.content.rendererKey === "string" ? section.content.rendererKey : "platform.fields.v1",
    ...(empty ? { emptyState: empty } : {}),
    fields: Object.freeze(fields),
    childCollections: Object.freeze(childCollections),
  });
}
/** Bounded presentation-only equality facet. Unsupported expressions fail hidden;
 * this is never a substitute for the registered reader's field authorization. */
function fieldVisible(field: Readonly<Record<string, unknown>>, values: Readonly<Record<string, unknown>>): boolean {
  return array(field.dynamicFacets).every(facet => {
    if (!record(facet) || facet.facet !== "visibility") return true;
    if (facet.engine !== "jsonlogic.v1" || !record(facet.expression)) return false;
    const operands = facet.expression["=="];
    if (!Array.isArray(operands) || operands.length !== 2 || !record(operands[0]) || typeof operands[0].var !== "string"
      || !/^record\.[a-z][a-z0-9_]*$/.test(operands[0].var) || typeof operands[1] !== "string") return false;
    const key = operands[0].var.slice(7);
    if (!Object.hasOwn(values, key)) return false;
    return (values[key] === operands[1] ? facet.valueWhenTrue : facet.valueWhenFalse) === "visible";
  });
}
/** A lookup code is executable only when the exact pinned publication exposes it.
 * The host therefore receives an admitted catalogue, never a client-selected one. */
function publishedDisplayChoices(
  resolve: NonNullable<Parameters<typeof createEntityRuntimeResourceService>[0]["displayChoices"]>,
  context: VerifiedRequestContext,
  catalog: string,
  artifacts: readonly CompiledEntityArtifactV2[],
  values?: readonly string[],
) {
  if (!artifacts.some((artifact) => artifactDeclaresLookup(artifact.content, catalog)))
    throw new EntityRuntimeResourceError(503, "ENTITY_LOOKUP_CATALOG_UNPUBLISHED");
  return resolve(context, catalog, values);
}
function artifactDeclaresLookup(value: unknown, catalog: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => artifactDeclaresLookup(entry, catalog));
  if (!record(value)) return false;
  const lookup = record(value.display) && record(value.display.lookup) ? value.display.lookup : undefined;
  return lookup?.code === catalog || Object.values(value).some((entry) => artifactDeclaresLookup(entry, catalog));
}
function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return !!value && typeof value === "object" && !Array.isArray(value); }
function localized(value: unknown): Readonly<{ readonly labelKey: string; readonly defaultText: string }> | undefined {
  if (!record(value) || typeof value.labelKey !== "string" || typeof value.defaultText !== "string") return undefined;
  return Object.freeze({ labelKey: value.labelKey, defaultText: value.defaultText });
}
