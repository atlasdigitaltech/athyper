import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
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
  readonly roleLens?: "all" | "supplier" | "customer";
}

export interface EntityRuntimeSectionHandler {
  read(input: {
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
export interface EntityRuntimeSummaryHandlerRegistry {
  get(provider: string): EntityRuntimeSummaryHandler | undefined;
}

export interface EntityRuntimeSectionHandlerRegistry {
  get(handlerKey: string): EntityRuntimeSectionHandler | undefined;
  /** Platform capability bindings are selected by published service key, never entity code. */
  getService?(serviceKey: string): EntityRuntimeSectionHandler | undefined;
}

export function createEntityRuntimeResourceService(options: {
  readonly reader: PinnedCompiledEntityReader;
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
      return Object.freeze({ releaseId: model.release.release.releaseId, releaseHash: model.release.release.releaseHash, plan, header });
    },
    async summary(input: {
      readonly context: VerifiedRequestContext;
      readonly entityCode: string;
      readonly recordId: string;
      readonly surfaceKey: string;
      readonly resourceContext?: EntityRuntimeResourceContext;
    }) {
      const model = await resolveSurface(options.reader, input.context, input.entityCode, input.surfaceKey);
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
          return Object.freeze({ key: card.key, state: "ready" as const, data: await handler.read({ context: input.context, release: model.release, core: model.core, recordId: input.recordId, ...(input.resourceContext ? { resourceContext: input.resourceContext } : {}), requestCache }) });
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
      const handler = sectionHandler(options.sections, section);
      if (!handler) throw new EntityRuntimeResourceError(503, "ENTITY_RUNTIME_SECTION_HANDLER_UNAVAILABLE");
      let result: { readonly revision: string; readonly data: unknown };
      try {
        result = await handler.read({ context: input.context, release: model.release, core: model.core, section, recordId: input.recordId, limit: Math.min(100, Math.max(1, input.limit ?? 25)), ...(input.cursor ? { cursor: input.cursor } : {}), ...(input.resourceContext ? { resourceContext: input.resourceContext } : {}) });
      } catch (error) {
        // A registered reader may require a resolved business context. Preserve that
        // expected state without exposing a domain exception as a generic 500.
        if (isContextRequired(error))
          throw new EntityRuntimeResourceError(409, "ENTITY_RUNTIME_CONTEXT_REQUIRED", "Select an authorized organization and company context for this section.");
        throw error;
      }
      return Object.freeze({
        releaseId: model.release.release.releaseId,
        releaseHash: model.release.release.releaseHash,
        sectionKey: input.sectionKey,
        presentation: browserSectionPresentation(model.core, section),
        ...result,
      });
    },
  });
}

export class EntityRuntimeResourceError extends Error {
  constructor(readonly status: 403 | 409 | 503, readonly code: string, message = code) { super(message); }
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
function browserSectionPresentation(core: CompiledEntityArtifactV2, section: CompiledEntityArtifactV2) {
  const labels = new Map(array(core.content.fields).flatMap((value) => {
    if (!record(value) || typeof value.key !== "string") return [];
    return [[value.key, localized(value.label)] as const];
  }));
  const fields = array(section.content.fieldBindings).flatMap((value) => {
    const key = record(value) && typeof value.fieldKey === "string" ? value.fieldKey : undefined;
    return key ? [Object.freeze({ key, ...(labels.get(key) ? { label: labels.get(key)! } : {}) })] : [];
  });
  const childCollections = array(section.content.childCollections).flatMap((value) => {
    if (!record(value) || typeof value.key !== "string" || typeof value.rendererKey !== "string") return [];
    const childFields = array(value.fieldBindings).flatMap((binding) => {
      const key = record(binding) && typeof binding.fieldKey === "string" ? binding.fieldKey : undefined;
      return key ? [Object.freeze({ key, ...(labels.get(key) ? { label: labels.get(key)! } : {}) })] : [];
    });
    return [Object.freeze({ key: value.key, rendererKey: value.rendererKey, fields: Object.freeze(childFields) })];
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
function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return !!value && typeof value === "object" && !Array.isArray(value); }
function localized(value: unknown): Readonly<{ readonly labelKey: string; readonly defaultText: string }> | undefined {
  if (!record(value) || typeof value.labelKey !== "string" || typeof value.defaultText !== "string") return undefined;
  return Object.freeze({ labelKey: value.labelKey, defaultText: value.defaultText });
}
