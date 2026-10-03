import { entitySectionDisplay, entityNavigationProvider, isEntityNavigationKey } from "@athyper/contract-platform-entity-runtime";
import {
  createOperation,
  encodePathSegment,
  type HttpClient,
} from "@athyper/platform-api-client";

export interface EntityRuntimePagePlan {
  readonly entityCode: string;
  readonly releaseId: string;
  readonly releaseHash: string;
  readonly surfaceKey: string;
  readonly headerFieldKeys: readonly string[];
  readonly sections: readonly EntityRuntimeSectionPlan[];
  readonly initialSectionKeys: readonly string[];
  readonly navigation?: EntityRuntimeNavigationPlan;
  readonly summaryView?: EntityRuntimeSummaryViewPlan;
  readonly actions: readonly EntityRuntimeActionPlan[];
}

export interface EntityRuntimeNavigationPlan {
  readonly tabs: readonly EntityRuntimeNavigationTabPlan[];
}
export interface EntityRuntimeNavigationTabPlan {
  readonly key: string;
  readonly label: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
  readonly provider: "overview" | "section";
  readonly sectionDisplay: "continuous" | "selected";
  readonly sectionKeys: readonly string[];
  readonly iconKey?: string;
}
export interface EntityRuntimeSummaryViewPlan {
  readonly cards: readonly EntityRuntimeSummaryCardPlan[];
}
export interface EntityRuntimeSummaryCardPlan {
  readonly key: string;
  readonly label: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
  readonly provider: string;
  readonly rendererKey: string;
}

export interface EntityRuntimeActionPlan {
  readonly operationKey: string;
  readonly placement: "toolbar" | "menu";
  readonly interaction: "start_flow" | "command";
  readonly label: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
}

export interface EntityRuntimeSectionPlan {
  readonly key: string;
  readonly presentationRef: string;
  readonly label?: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
  readonly loadPolicy: "initial" | "visible" | "active";
  readonly iconKey?: string;
}

export interface EntityRuntimeResourceContext {
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
  readonly asOf?: string;
  /** Entity-specific lens; the registered domain adapter validates its vocabulary. */
  readonly roleLens?: string;
  readonly threadRootId?: string;
  readonly commentFilter?: "mentions";
}

export interface EntityRuntimeHeaderResource {
  readonly revision: string;
  readonly values: Readonly<Record<string, unknown>>;
}

export interface EntityRuntimeBootstrapResource {
  readonly releaseId: string;
  readonly releaseHash: string;
  readonly plan: EntityRuntimePagePlan;
  readonly header: EntityRuntimeHeaderResource;
}

export interface EntityRuntimeSummaryResource {
  readonly releaseId: string;
  readonly releaseHash: string;
  readonly revision: string;
  readonly cards: readonly Readonly<{ readonly key: string; readonly state: "ready" | "empty" | "context_required" | "unavailable"; readonly data?: unknown }> [];
}

export interface EntityRuntimeDisplayField {
  readonly unavailableReference?: { readonly labelKey: string; readonly defaultText: string };
  readonly attachmentDownload?: true;
  readonly temporalType?: "date" | "datetime";
  readonly revealOperation?: string;
  readonly revealTargetField?: string;
  readonly maskedPrefix?: string;
  readonly revealPurposes?: readonly { readonly value: string; readonly label: { readonly labelKey: string; readonly defaultText: string } }[];
  readonly key: string;
  readonly label?: { readonly labelKey: string; readonly defaultText: string };
  readonly options?: readonly { readonly value: string; readonly label: { readonly labelKey: string; readonly defaultText: string } }[];
  readonly itemFields?: readonly EntityRuntimeDisplayField[];
}
export interface EntityRuntimeSectionPresentation {
  readonly rendererKey: string;
  /** Optional section-authored copy for an empty collection. */
  readonly emptyState?: Readonly<{ readonly title: string; readonly detail: string }>;
  readonly fields: readonly EntityRuntimeDisplayField[];
  readonly childCollections: readonly Readonly<{ readonly key: string; readonly rendererKey: string; readonly label?: Readonly<{labelKey:string;defaultText:string}>; readonly display?: "disclosure"; readonly description?: string; readonly rowFields?: readonly (readonly EntityRuntimeDisplayField[])[]; readonly fields: readonly EntityRuntimeDisplayField[] }> [];
}
/** Public allowlist shared by drawer and content consumers. */
export interface EntityRuntimeCapability {
  readonly schemaVersion: 1;
  readonly layouts: readonly ("drawer" | "content")[];
  readonly actions: readonly { readonly key: string; readonly concurrency: "none" | "revision"; readonly idempotency: "none" | "required" }[];
  readonly maxTextLength?: number;
  readonly maxDepth?: number;
  readonly maxAttachments?: number;
  readonly maxBatchCount?: number;
  readonly allowedAudiences?: readonly ("public" | "private" | "internal")[];
  readonly defaultAudience?: "public" | "private" | "internal";
  readonly categories?: readonly string[];
  readonly maxFileBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}
export interface EntityRuntimeSectionResource {
  readonly capability?: EntityRuntimeCapability;
  readonly releaseId: string;
  readonly releaseHash: string;
  readonly sectionKey: string;
  readonly revision: string;
  readonly presentation: EntityRuntimeSectionPresentation;
  readonly data: unknown;
}

const bootstrap = createOperation<EntityRuntimeBootstrapResource>({
  method: "GET",
  path: ({ entityCode, recordId }) =>
    `/entity-runtime/${encodePathSegment(entityCode)}/records/${encodePathSegment(recordId)}/bootstrap`,
  parse: parseBootstrap,
});
const summary = createOperation<EntityRuntimeSummaryResource>({
  method: "GET",
  path: ({ entityCode, recordId }) =>
    `/entity-runtime/${encodePathSegment(entityCode)}/records/${encodePathSegment(recordId)}/summary`,
  parse: parseSummary,
});
const section = createOperation<EntityRuntimeSectionResource>({
  method: "GET",
  path: ({ entityCode, recordId, sectionKey }) =>
    `/entity-runtime/${encodePathSegment(entityCode)}/records/${encodePathSegment(recordId)}/sections/${encodePathSegment(sectionKey)}`,
  parse: parseSection,
});
const operation = createOperation<Readonly<Record<string, unknown>>, Readonly<{ input: Readonly<Record<string, unknown>> }>>({
  method: "POST",
  path: ({ entityCode, recordId, operationKey }) =>
    `/entity-runtime/${encodePathSegment(entityCode)}/records/${encodePathSegment(recordId)}/operations/${encodePathSegment(operationKey)}`,
  idempotency: "required",
  parse: (value) => Object.freeze({ ...object(value, "entity runtime operation result") }),
});

/** Typed browser boundary for compiled entity resources. It never selects a table or handler. */
export const entityRuntimeClient = Object.freeze({
  collaboration: (client: HttpClient, input: { entityCode: string; recordId: string; kind: "comments" | "attachments"; cursor?: string; threadRootId?: string; commentFilter?: "mentions"; signal?: AbortSignal }) =>
    client.request(createOperation<EntityRuntimeSectionResource>({ method: "GET", path: () => `/entity-runtime/${encodePathSegment(input.entityCode)}/records/${encodePathSegment(input.recordId)}/collaboration/${input.kind}`, parse: parseSection }), {
      query: { ...(input.cursor ? { cursor: input.cursor } : {}), ...(input.threadRootId ? { threadRootId: input.threadRootId } : {}), ...(input.commentFilter ? { commentFilter: input.commentFilter } : {}) }, signal: input.signal,
    }),
  bootstrap: (client: HttpClient, input: { readonly entityCode: string; readonly recordId: string; readonly surfaceKey: string; readonly resourceContext?: EntityRuntimeResourceContext; readonly signal?: AbortSignal }) =>
    client.request(bootstrap, {
      params: { entityCode: input.entityCode, recordId: input.recordId },
      query: { surface: input.surfaceKey, ...resourceContextQuery(input.resourceContext) },
      signal: input.signal,
    }),
  summary: (client: HttpClient, input: { readonly entityCode: string; readonly recordId: string; readonly surfaceKey: string; readonly resourceContext?: EntityRuntimeResourceContext; readonly signal?: AbortSignal }) =>
    client.request(summary, {
      params: { entityCode: input.entityCode, recordId: input.recordId },
      query: { surface: input.surfaceKey, ...resourceContextQuery(input.resourceContext) },
      signal: input.signal,
    }),
  section: (client: HttpClient, input: { readonly entityCode: string; readonly recordId: string; readonly surfaceKey: string; readonly sectionKey: string; readonly cursor?: string; readonly limit?: number; readonly resourceContext?: EntityRuntimeResourceContext; readonly signal?: AbortSignal }) =>
    client.request(section, {
      params: { entityCode: input.entityCode, recordId: input.recordId, sectionKey: input.sectionKey },
      query: { surface: input.surfaceKey, ...resourceContextQuery(input.resourceContext), ...(input.cursor ? { cursor: input.cursor } : {}), ...(input.limit ? { limit: input.limit } : {}) },
      signal: input.signal,
    }),
  operation: (client: HttpClient, input: { readonly entityCode: string; readonly recordId: string; readonly operationKey: string; readonly expectedVersion: number; readonly idempotencyKey: string; readonly input: Readonly<Record<string, unknown>>; readonly signal?: AbortSignal }) =>
    client.request(operation, {
      params: { entityCode: input.entityCode, recordId: input.recordId, operationKey: input.operationKey },
      headers: { "If-Match": String(input.expectedVersion) },
      idempotencyKey: input.idempotencyKey,
      body: { input: input.input },
      signal: input.signal,
    }),
});

function resourceContextQuery(value?: EntityRuntimeResourceContext): Readonly<Record<string, string>> {
  if (!value) return {};
  return {
    ...(value.operatingOrganizationId ? { operatingOrganizationId: value.operatingOrganizationId } : {}),
    ...(value.companyCodeId ? { companyCodeId: value.companyCodeId } : {}),
    ...(value.legalEntityId ? { legalEntityId: value.legalEntityId } : {}),
    ...(value.asOf ? { asOf: value.asOf } : {}),
    ...(value.roleLens ? { roleLens: value.roleLens } : {}),
    ...(value.threadRootId ? { threadRootId: value.threadRootId } : {}),
    ...(value.commentFilter ? { commentFilter: value.commentFilter } : {}),
  };
}

function parseBootstrap(value: unknown): EntityRuntimeBootstrapResource {
  const root = object(value, "entity runtime bootstrap");
  const plan = object(root.plan, "entity runtime page plan");
  const sections = array(plan.sections, "entity runtime page plan.sections").map((value, index) => {
    const item = object(value, `entity runtime page plan.sections[${index}]`);
    const loadPolicy = item.loadPolicy;
    if (loadPolicy !== "initial" && loadPolicy !== "visible" && loadPolicy !== "active") invalid("entity runtime section load policy");
    return Object.freeze({
      key: key(item.key, "entity runtime section key"),
      presentationRef: text(item.presentationRef, "entity runtime section presentation reference"),
      ...(localized(item.label) ? { label: localized(item.label) } : {}),
      loadPolicy,
      ...iconKeyOf(item.iconKey),
    });
  });
  const initialSectionKeys = array(plan.initialSectionKeys, "entity runtime page plan.initialSectionKeys").map((item) => key(item, "entity runtime initial section key"));
  const navigation = plan.navigation === undefined ? undefined : parseNavigation(plan.navigation, sections);
  const summaryView = plan.summaryView === undefined ? undefined : parseSummaryView(plan.summaryView);
  const actions = array(plan.actions, "entity runtime page plan.actions").map((value, index) => {
    const item = object(value, `entity runtime page plan.actions[${index}]`);
    const placement = item.placement, interaction = item.interaction, label = localized(item.label);
    if ((placement !== "toolbar" && placement !== "menu") || (interaction !== "start_flow" && interaction !== "command") || !label) invalid("entity runtime action");
    return Object.freeze({ operationKey: key(item.operationKey, "entity runtime action operation key"), placement, interaction, label });
  });
  if (new Set(sections.map((item) => item.key)).size !== sections.length) invalid("duplicate entity runtime section");
  if (initialSectionKeys.some((item) => !sections.some((section) => section.key === item))) invalid("entity runtime initial section");
  const header = object(root.header, "entity runtime header");
  return Object.freeze({
    releaseId: text(root.releaseId, "entity runtime release id"),
    releaseHash: sha256(root.releaseHash, "entity runtime release hash"),
    plan: Object.freeze({
      entityCode: key(plan.entityCode, "entity runtime entity code"),
      releaseId: text(plan.releaseId, "entity runtime plan release id"),
      releaseHash: sha256(plan.releaseHash, "entity runtime plan release hash"),
      surfaceKey: key(plan.surfaceKey, "entity runtime surface key"),
      headerFieldKeys: Object.freeze(array(plan.headerFieldKeys, "entity runtime header fields").map((item) => key(item, "entity runtime header field"))),
      sections: Object.freeze(sections),
      initialSectionKeys: Object.freeze(initialSectionKeys),
      ...(navigation ? { navigation } : {}),
      ...(summaryView ? { summaryView } : {}),
      actions: Object.freeze(actions),
    }),
    header: Object.freeze({
      revision: text(header.revision, "entity runtime header revision"),
      values: Object.freeze({ ...object(header.values, "entity runtime header values") }),
    }),
  });
}

function parseNavigation(value: unknown, sections: readonly EntityRuntimeSectionPlan[]): EntityRuntimeNavigationPlan {
  const root = object(value, "entity runtime navigation");
  const tabs = array(root.tabs, "entity runtime navigation.tabs").map((value, index) => {
    const item = object(value, `entity runtime navigation.tabs[${index}]`);
    const provider = entityNavigationProvider(item.provider);
    const label = localized(item.label);
    if (!provider || !label) invalid("entity runtime navigation tab");
    const sectionKeys = array(item.sectionKeys, "entity runtime navigation tab sections").map((keyValue) => key(keyValue, "entity runtime navigation section key"));
    if (!sectionKeys.length || sectionKeys.some((sectionKey) => !sections.some((section) => section.key === sectionKey))) invalid("entity runtime navigation tab sections");
    return Object.freeze({ key: navigationKey(item.key, "entity runtime navigation tab key"), label, provider, sectionDisplay: entitySectionDisplay(item.sectionDisplay, provider), sectionKeys: Object.freeze(sectionKeys), ...iconKeyOf(item.iconKey) });
  });
  if (!tabs.length || new Set(tabs.map((tab) => tab.key)).size !== tabs.length || tabs.filter((tab) => tab.provider === "overview").length > 1) invalid("entity runtime navigation");
  return Object.freeze({ tabs: Object.freeze(tabs) });
}
function parseSummaryView(value: unknown): EntityRuntimeSummaryViewPlan {
  const root = object(value, "entity runtime summary view");
  const cards = array(root.cards, "entity runtime summary cards").map((value, index) => {
    const item = object(value, `entity runtime summary cards[${index}]`);
    const label = localized(item.label);
    if (!label) invalid("entity runtime summary card");
    return Object.freeze({ key: key(item.key, "entity runtime summary card key"), label, provider: key(item.provider, "entity runtime summary card provider"), rendererKey: key(item.rendererKey, "entity runtime summary card renderer") });
  });
  if (!cards.length || cards.length > 12 || new Set(cards.map((card) => card.key)).size !== cards.length) invalid("entity runtime summary view");
  return Object.freeze({ cards: Object.freeze(cards) });
}

function parseSummary(value: unknown): EntityRuntimeSummaryResource {
  const root = object(value, "entity runtime summary");
  const cards = array(root.cards, "entity runtime summary cards").map((value, index) => {
    const item = object(value, `entity runtime summary card ${index}`);
    const state = item.state;
    if (state !== "ready" && state !== "empty" && state !== "context_required" && state !== "unavailable") invalid("entity runtime summary state");
    return Object.freeze({ key: key(item.key, "entity runtime summary card key"), state, ...(state === "ready" && item.data !== undefined ? { data: item.data } : {}) });
  });
  return Object.freeze({ releaseId: text(root.releaseId, "entity runtime summary release id"), releaseHash: sha256(root.releaseHash, "entity runtime summary release hash"), revision: text(root.revision, "entity runtime summary revision"), cards: Object.freeze(cards) });
}

function parseSection(value: unknown): EntityRuntimeSectionResource {
  const root = object(value, "entity runtime section");
  return Object.freeze({
    releaseId: text(root.releaseId, "entity runtime section release id"),
    releaseHash: sha256(root.releaseHash, "entity runtime section release hash"),
    sectionKey: key(root.sectionKey, "entity runtime section key"),
    revision: text(root.revision, "entity runtime section revision"),
    presentation: parsePresentation(root.presentation),
    ...(root.capability === undefined ? {} : {capability: parseCapability(root.capability)}),
    data: root.data,
  });
}

function parseCapability(value: unknown): EntityRuntimeCapability {
  const root = object(value, "entity capability");
  if (root.schemaVersion !== 1) invalid("entity capability version");
  const layouts = array(root.layouts, "capability layouts").map(value => {
    if(value !== "drawer" && value !== "content") invalid("capability layout");
    return value as "drawer" | "content";
  });
  const actions = array(root.actions, "capability actions").map(value => {
    const action = object(value, "capability action");
    if(action.concurrency !== "none" && action.concurrency !== "revision") invalid("capability concurrency");
    if(action.idempotency !== "none" && action.idempotency !== "required") invalid("capability idempotency");
    return {key: key(action.key,"capability action key"), concurrency:action.concurrency as "none" | "revision", idempotency:action.idempotency as "none" | "required"};
  });
  const positive = (value: unknown): number => { if(!Number.isSafeInteger(value) || Number(value)<1) invalid("capability limit"); return Number(value); };
  const audience = (value: unknown): "public" | "private" | "internal" => {if(value!=="public" && value!=="private" && value!=="internal") invalid("capability audience");return value as "public" | "private" | "internal";};
  const nonnegative = (value:unknown) => {if(value===0)return 0;return positive(value);};
  return Object.freeze({schemaVersion:1,layouts,actions,
    ...(root.maxDepth===undefined?{}:{maxDepth:nonnegative(root.maxDepth)}),
    ...(root.maxAttachments===undefined?{}:{maxAttachments:nonnegative(root.maxAttachments)}),
    ...(root.maxBatchCount===undefined?{}:{maxBatchCount:positive(root.maxBatchCount)}),
    ...(root.categories===undefined?{}:{categories:array(root.categories,"capability categories").map(value=>key(value,"capability category"))}),
    ...(root.allowedAudiences===undefined?{}:{allowedAudiences:array(root.allowedAudiences,"capability audiences").map(audience)}),
    ...(root.defaultAudience===undefined?{}:{defaultAudience:audience(root.defaultAudience)}),
    ...(root.maxTextLength === undefined ? {} : {maxTextLength:positive(root.maxTextLength)}),
    ...(root.maxFileBytes === undefined ? {} : {maxFileBytes:positive(root.maxFileBytes)}),
    ...(root.allowedContentTypes === undefined ? {} : {allowedContentTypes:array(root.allowedContentTypes,"capability MIME types").map(value=>text(value,"capability MIME type"))}),
  });
}

function parsePresentation(value: unknown): EntityRuntimeSectionPresentation {
  const root = object(value, "entity runtime section presentation");
  const field = (value: unknown, name: string): EntityRuntimeDisplayField => {
    const item = object(value, name);
    if (item.attachmentDownload !== undefined && item.attachmentDownload !== true) invalid(`${name}.attachmentDownload`);
    const unavailableReference = item.unavailableReference === undefined ? undefined : localized(item.unavailableReference);
    if (item.unavailableReference !== undefined && (!unavailableReference || item.options !== undefined || item.itemFields !== undefined || item.attachmentDownload !== undefined || item.revealOperation !== undefined)) invalid(`${name}.unavailableReference`);
    const options = item.options === undefined ? undefined : array(item.options, `${name}.options`).map(value => {
      const option = object(value, `${name}.option`);
      const label = localized(option.label);
      if (!label) invalid(`${name}.option.label`);
      return { value: text(option.value, `${name}.option.value`), label };
    });
    const revealPurposes = item.revealPurposes === undefined ? undefined : array(item.revealPurposes, `${name}.revealPurposes`).map(value => {
      const option = object(value, `${name}.revealPurpose`); const label = localized(option.label);
      if (!label) invalid(`${name}.revealPurpose.label`);
      return {value:key(option.value, `${name}.revealPurpose.value`), label};
    });
    return Object.freeze({ ...(unavailableReference ? {unavailableReference} : {}), ...(item.attachmentDownload === true ? {attachmentDownload:true as const} : {}), ...(item.temporalType === "date" || item.temporalType === "datetime" ? {temporalType:item.temporalType} : {}), ...(item.revealTargetField === undefined ? {} : {revealTargetField:key(item.revealTargetField, `${name}.revealTargetField`)}), ...(item.maskedPrefix === undefined ? {} : {maskedPrefix:text(item.maskedPrefix, `${name}.maskedPrefix`)}), ...(revealPurposes ? {revealPurposes} : {}), ...(item.revealOperation === undefined ? {} : {revealOperation:key(item.revealOperation, `${name}.revealOperation`)}), key: key(item.key, `${name}.key`), ...(localized(item.label) ? { label: localized(item.label) } : {}), ...(options ? { options } : {}), ...(item.itemFields ? {itemFields:array(item.itemFields,`${name}.itemFields`).map(v=>field(v,`${name}.itemField`))} : {}) });
  };
  const collections = array(root.childCollections, "entity runtime section child collections").map((value, index) => {
    const item = object(value, `entity runtime child collection ${index}`);
    return Object.freeze({ ...(item.rowFields === undefined ? {} : {rowFields: array(item.rowFields, "child row fields").map((row, rowIndex) => array(row, "child row fields entry").map((value, fieldIndex) => field(value, `child row ${rowIndex} field ${fieldIndex}`)))}), key: key(item.key, "entity runtime child collection key"), rendererKey: text(item.rendererKey, "entity runtime child collection renderer"), ...(localized(item.label) ? {label:localized(item.label)} : {}), ...(item.display === "disclosure" ? {display:"disclosure" as const} : {}), ...(typeof item.description === "string" ? {description:item.description} : {}), fields: Object.freeze(array(item.fields, "entity runtime child collection fields").map((fieldValue, fieldIndex) => field(fieldValue, `entity runtime child collection ${index}.fields[${fieldIndex}]`))) });
  });
  const empty = root.emptyState === undefined ? undefined : object(root.emptyState, "entity runtime section empty state");
  const emptyState = empty && typeof empty.title === "string" && empty.title.trim() && typeof empty.detail === "string" && empty.detail.trim()
    ? Object.freeze({ title: empty.title, detail: empty.detail })
    : undefined;
  return Object.freeze({ rendererKey: text(root.rendererKey, "entity runtime section renderer"), ...(emptyState ? { emptyState } : {}), fields: Object.freeze(array(root.fields, "entity runtime section fields").map((fieldValue, index) => field(fieldValue, `entity runtime section fields[${index}]`))), childCollections: Object.freeze(collections) });
}
function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) invalid(name); return value as Record<string, unknown>; }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) invalid(name); return value; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim() || value.length > 512) invalid(name); return value; }
function key(value: unknown, name: string): string { const result = text(value, name); if (!/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(result)) invalid(name); return result; }
function navigationKey(value: unknown, name: string): string { const result = text(value, name); if (!isEntityNavigationKey(result)) invalid(name); return result; }
function sha256(value: unknown, name: string): string { const result = text(value, name); if (!/^sha256:[a-f0-9]{64}$/.test(result)) invalid(name); return result; }
function localized(value: unknown): Readonly<{ readonly labelKey: string; readonly defaultText: string }> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.labelKey !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(item.labelKey) || typeof item.defaultText !== "string" || !item.defaultText.trim()) return undefined;
  return Object.freeze({ labelKey: item.labelKey, defaultText: item.defaultText });
}
function invalid(name: string): never { throw new TypeError(`${name} is invalid`); }

function iconKeyOf(value: unknown): { readonly iconKey?: string } {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,62}$/.test(value) ? { iconKey: value } : {};
}
