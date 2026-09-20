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
  readonly provider: "360" | "section";
  readonly sectionKeys: readonly string[];
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
}

export interface EntityRuntimeResourceContext {
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
  readonly asOf?: string;
  readonly roleLens?: "all" | "supplier" | "customer";
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

export interface EntityRuntimeSectionPresentation {
  readonly rendererKey: string;
  /** Optional section-authored copy for an empty collection. */
  readonly emptyState?: Readonly<{ readonly title: string; readonly detail: string }>;
  readonly fields: readonly Readonly<{ readonly key: string; readonly label?: Readonly<{ readonly labelKey: string; readonly defaultText: string }> }> [];
  readonly childCollections: readonly Readonly<{ readonly key: string; readonly rendererKey: string; readonly fields: readonly Readonly<{ readonly key: string; readonly label?: Readonly<{ readonly labelKey: string; readonly defaultText: string }> }> [] }> [];
}
export interface EntityRuntimeSectionResource {
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
    const provider = item.provider;
    const label = localized(item.label);
    if ((provider !== "360" && provider !== "section") || !label) invalid("entity runtime navigation tab");
    const sectionKeys = array(item.sectionKeys, "entity runtime navigation tab sections").map((keyValue) => key(keyValue, "entity runtime navigation section key"));
    if (!sectionKeys.length || sectionKeys.some((sectionKey) => !sections.some((section) => section.key === sectionKey))) invalid("entity runtime navigation tab sections");
    return Object.freeze({ key: navigationKey(item.key, "entity runtime navigation tab key"), label, provider, sectionKeys: Object.freeze(sectionKeys) });
  });
  if (!tabs.length || new Set(tabs.map((tab) => tab.key)).size !== tabs.length || tabs.filter((tab) => tab.provider === "360").length > 1) invalid("entity runtime navigation");
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
    data: root.data,
  });
}

function parsePresentation(value: unknown): EntityRuntimeSectionPresentation {
  const root = object(value, "entity runtime section presentation");
  const field = (value: unknown, name: string) => {
    const item = object(value, name);
    return Object.freeze({ key: key(item.key, `${name}.key`), ...(localized(item.label) ? { label: localized(item.label) } : {}) });
  };
  const collections = array(root.childCollections, "entity runtime section child collections").map((value, index) => {
    const item = object(value, `entity runtime child collection ${index}`);
    return Object.freeze({ key: key(item.key, "entity runtime child collection key"), rendererKey: text(item.rendererKey, "entity runtime child collection renderer"), fields: Object.freeze(array(item.fields, "entity runtime child collection fields").map((fieldValue, fieldIndex) => field(fieldValue, `entity runtime child collection ${index}.fields[${fieldIndex}]`))) });
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
function navigationKey(value: unknown, name: string): string { const result = text(value, name); if (result !== "360" && !/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(result)) invalid(name); return result; }
function sha256(value: unknown, name: string): string { const result = text(value, name); if (!/^sha256:[a-f0-9]{64}$/.test(result)) invalid(name); return result; }
function localized(value: unknown): Readonly<{ readonly labelKey: string; readonly defaultText: string }> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.labelKey !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(item.labelKey) || typeof item.defaultText !== "string" || !item.defaultText.trim()) return undefined;
  return Object.freeze({ labelKey: item.labelKey, defaultText: item.defaultText });
}
function invalid(name: string): never { throw new TypeError(`${name} is invalid`); }
