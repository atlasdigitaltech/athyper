import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";

export interface EntityPagePlan {
  readonly entityCode: string;
  readonly releaseId: string;
  readonly releaseHash: string;
  readonly surfaceKey: string;
  /** Header fields are one projection, shared by breadcrumb/title/status rendering. */
  readonly headerFieldKeys: readonly string[];
  /** Only authorized sections are disclosed to the browser. */
  readonly sections: readonly EntityPageSectionPlan[];
  readonly initialSectionKeys: readonly string[];
  /** Authorized record-mode navigation, projected from the compiled surface. */
  readonly navigation?: EntityPageNavigationPlan;
  /** Declarative summary cards. Each provider reauthorizes its data separately. */
  readonly summaryView?: EntityPageSummaryViewPlan;
  /** Advisory, localized actions. The command endpoint reauthorizes every invocation. */
  readonly actions: readonly EntityPageActionPlan[];
}

export interface EntityPageNavigationPlan {
  readonly tabs: readonly EntityPageNavigationTabPlan[];
}
export interface EntityPageNavigationTabPlan {
  readonly key: string;
  readonly label: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
  readonly provider: "360" | "section";
  readonly sectionKeys: readonly string[];
}
export interface EntityPageSummaryViewPlan {
  readonly cards: readonly EntityPageSummaryCardPlan[];
}
export interface EntityPageSummaryCardPlan {
  readonly key: string;
  readonly label: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
  readonly provider: string;
  readonly rendererKey: string;
}

export interface EntityPageActionPlan {
  readonly operationKey: string;
  readonly placement: "toolbar" | "menu";
  readonly interaction: "start_flow" | "command";
  readonly label: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
}

export interface EntityPageSectionPlan {
  readonly key: string;
  readonly presentationRef: string;
  /** Localization is projected from the admitted surface; renderer code owns translation. */
  readonly label?: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
  readonly loadPolicy: "initial" | "visible" | "active";
}

/**
 * Produces a browser-safe page plan from immutable Core and surface artifacts.
 * It neither reads a record nor evaluates permissions; callers pass only their
 * admitted permission codes and separately project record data.
 */
export function planEntityPage(input: {
  readonly release: { readonly releaseId: string; readonly releaseHash: string };
  readonly core: CompiledEntityArtifactV2;
  readonly surface: CompiledEntityArtifactV2;
  /** The pinned Operation artifact is the authority for action availability. */
  readonly operation?: CompiledEntityArtifactV2;
  readonly grantedPermissions: ReadonlySet<string>;
  readonly activeSectionKey?: string;
}): EntityPagePlan {
  if (input.core.artifactType !== "core" || input.surface.artifactType !== "presentation_surface")
    throw new TypeError("ENTITY_PAGE_PLAN_ARTIFACT_TYPE_INVALID");
  if (input.core.entityCode !== input.surface.entityCode || input.core.plane !== input.surface.plane)
    throw new TypeError("ENTITY_PAGE_PLAN_ARTIFACT_COORDINATE_MISMATCH");
  const coreFields = new Set(
    array(input.core.content.fields).flatMap((value) => record(value) && typeof value.key === "string" ? [value.key] : []),
  );
  const header = record(input.surface.content.header) ? input.surface.content.header : {};
  const headerFieldKeys = uniqueStrings([
    header.titleField,
    header.codeField,
    header.statusField,
  ]).filter((key) => coreFields.has(key));
  const sections = array(input.surface.content.sections).flatMap((value, index) => {
    if (!record(value) || typeof value.sectionKey !== "string" || typeof value.presentationRef !== "string")
      throw new TypeError(`ENTITY_PAGE_PLAN_SECTION_INVALID:${index}`);
    const permission = value.viewPermission;
    if (typeof permission !== "string") throw new TypeError(`ENTITY_PAGE_PLAN_SECTION_PERMISSION_INVALID:${value.sectionKey}`);
    if (!input.grantedPermissions.has(permission)) return [];
    return [Object.freeze({
      key: safeKey(value.sectionKey),
      presentationRef: safeReference(value.presentationRef),
      ...(localized(value.label) ? { label: localized(value.label) } : {}),
      loadPolicy: value.sectionKey === input.activeSectionKey ? "active" : value.sectionKey === "overview" ? "initial" : "visible",
    })];
  });
  if (new Set(sections.map((section) => section.key)).size !== sections.length)
    throw new TypeError("ENTITY_PAGE_PLAN_SECTION_DUPLICATE");
  const navigation = navigationPlan(input.surface.content.navigation, sections);
  const summaryView = summaryViewPlan(input.surface.content.summaryView);
  const operations = input.operation ? operationActions(input.operation, input.grantedPermissions) : new Set<string>();
  const actions = array(input.surface.content.actions).flatMap((value, index) => {
    if (!record(value)) throw new TypeError(`ENTITY_PAGE_PLAN_ACTION_INVALID:${index}`);
    const operationKey = safeOperationKey(value.operationKey);
    const placement = value.placement;
    const interaction = value.interaction;
    const label = localized(value.label);
    if ((placement !== "toolbar" && placement !== "menu") || (interaction !== "start_flow" && interaction !== "command"))
      throw new TypeError(`ENTITY_PAGE_PLAN_ACTION_INVALID:${operationKey}`);
    // A pre-label active release remains readable during a rolling upgrade. It is
    // never rendered as an English fallback; the successor release must publish it.
    if (!label) return [];
    if (!operations.has(operationKey)) return [];
    return [Object.freeze({ operationKey, placement, interaction, label })];
  });
  return Object.freeze({
    entityCode: input.core.entityCode,
    releaseId: input.release.releaseId,
    releaseHash: input.release.releaseHash,
    surfaceKey: requiredString(input.surface.content.surfaceKey, "ENTITY_PAGE_PLAN_SURFACE_KEY_INVALID"),
    headerFieldKeys: Object.freeze(headerFieldKeys),
    sections: Object.freeze(sections),
    initialSectionKeys: Object.freeze(sections.filter((section) => section.loadPolicy === "initial" || section.loadPolicy === "active").map((section) => section.key)),
    ...(navigation ? { navigation } : {}),
    ...(summaryView ? { summaryView } : {}),
    actions: Object.freeze(actions),
  });
}

function navigationPlan(value: unknown, sections: readonly EntityPageSectionPlan[]): EntityPageNavigationPlan | undefined {
  if (value === undefined) return undefined;
  const raw = record(value) ? value : invalidNavigation();
  const tabs = array(raw.tabs).flatMap((value, index) => {
    if (!record(value)) throw new TypeError(`ENTITY_PAGE_PLAN_NAVIGATION_INVALID:${index}`);
    const provider = value.provider;
    const label = localized(value.label);
    if ((provider !== "360" && provider !== "section") || !label) throw new TypeError(`ENTITY_PAGE_PLAN_NAVIGATION_INVALID:${index}`);
    const requested = provider === "360" ? array(value.sectionKeys) : [value.sectionKey];
    const sectionKeys = requested.flatMap((key) => typeof key === "string" && sections.some((section) => section.key === key) ? [key] : []);
    if (!sectionKeys.length) return [];
    if (new Set(sectionKeys).size !== sectionKeys.length) throw new TypeError(`ENTITY_PAGE_PLAN_NAVIGATION_DUPLICATE_SECTION:${index}`);
    return [Object.freeze({ key: safeNavigationKey(requiredString(value.key, "ENTITY_PAGE_PLAN_NAVIGATION_KEY_INVALID")), label, provider, sectionKeys: Object.freeze(sectionKeys) })];
  });
  if (!tabs.length || new Set(tabs.map((tab) => tab.key)).size !== tabs.length || tabs.filter((tab) => tab.provider === "360").length > 1)
    throw new TypeError("ENTITY_PAGE_PLAN_NAVIGATION_INVALID");
  return Object.freeze({ tabs: Object.freeze(tabs) });
}
function summaryViewPlan(value: unknown): EntityPageSummaryViewPlan | undefined {
  if (value === undefined) return undefined;
  const raw = record(value) ? value : invalidSummary();
  const cards = array(raw.cards).map((value, index) => {
    if (!record(value) || !localized(value.label)) throw new TypeError(`ENTITY_PAGE_PLAN_SUMMARY_INVALID:${index}`);
    return Object.freeze({ key: safeKey(requiredString(value.key, "ENTITY_PAGE_PLAN_SUMMARY_KEY_INVALID")), label: localized(value.label)!, provider: safeKey(requiredString(value.provider, "ENTITY_PAGE_PLAN_SUMMARY_PROVIDER_INVALID")), rendererKey: safeKey(requiredString(value.rendererKey, "ENTITY_PAGE_PLAN_SUMMARY_RENDERER_INVALID")) });
  });
  if (!cards.length || cards.length > 12 || new Set(cards.map((card) => card.key)).size !== cards.length)
    throw new TypeError("ENTITY_PAGE_PLAN_SUMMARY_INVALID");
  return Object.freeze({ cards: Object.freeze(cards) });
}
function invalidNavigation(): never { throw new TypeError("ENTITY_PAGE_PLAN_NAVIGATION_INVALID"); }
function invalidSummary(): never { throw new TypeError("ENTITY_PAGE_PLAN_SUMMARY_INVALID"); }

function operationActions(artifact: CompiledEntityArtifactV2, granted: ReadonlySet<string>): Set<string> {
  if (artifact.artifactType !== "operation") throw new TypeError("ENTITY_PAGE_PLAN_OPERATION_ARTIFACT_TYPE_INVALID");
  return new Set(array(artifact.content.operations).flatMap((value, index) => {
    if (!record(value)) throw new TypeError(`ENTITY_PAGE_PLAN_OPERATION_INVALID:${index}`);
    const key = safeOperationKey(value.key);
    const permission = value.permissionCode;
    // Proposed catalog entries cannot be advertised as executable actions.
    if (value.permissionStatus !== undefined && value.permissionStatus !== "verified") return [];
    return typeof permission === "string" && granted.has(permission) ? [key] : [];
  }));
}

function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return !!value && typeof value === "object" && !Array.isArray(value); }
function uniqueStrings(values: readonly unknown[]): string[] { return [...new Set(values.filter((value): value is string => typeof value === "string"))]; }
function requiredString(value: unknown, code: string): string { if (typeof value !== "string" || !value) throw new TypeError(code); return value; }
function safeKey(value: string): string { if (!/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(value)) throw new TypeError("ENTITY_PAGE_PLAN_SECTION_KEY_INVALID"); return value; }
function safeNavigationKey(value: string): string { if (value !== "360" && !/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(value)) throw new TypeError("ENTITY_PAGE_PLAN_NAVIGATION_KEY_INVALID"); return value; }
function safeOperationKey(value: unknown): string { if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{1,126}$/.test(value)) throw new TypeError("ENTITY_PAGE_PLAN_ACTION_KEY_INVALID"); return value; }
function safeReference(value: string): string { if (!/^[A-Za-z][A-Za-z0-9_./-]{0,255}\.json$/.test(value) || value.includes("..")) throw new TypeError("ENTITY_PAGE_PLAN_SECTION_REFERENCE_INVALID"); return value; }
function localized(value: unknown): Readonly<{ readonly labelKey: string; readonly defaultText: string }> | undefined {
  if (!record(value) || typeof value.labelKey !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(value.labelKey) || typeof value.defaultText !== "string" || !value.defaultText.trim()) return undefined;
  return Object.freeze({ labelKey: value.labelKey, defaultText: value.defaultText });
}
