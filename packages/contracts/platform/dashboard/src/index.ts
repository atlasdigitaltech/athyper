export const EXPERIENCE_SURFACE_SCHEMA = "athyper-experience-surface/1" as const;

export type ExperienceSurfaceKind = "home" | "workspace" | "module" | "entity-collection" | "entity-create" | "entity-detail";
export type ExperienceVisual =
  | Readonly<{ kind: "icon"; key: string }>
  | Readonly<{ kind: "image"; assetRef: string; alt: string; focalPoint?: Readonly<{ x: number; y: number }> }>;
export interface ExperienceActionRef { readonly action: string; readonly label: string; readonly input?: Readonly<Record<string, string | number | boolean>>; }
interface BlockBase { readonly id: string; readonly title?: string; readonly span?: 1 | 2 | 3 | 4; }
export type ExperienceBlock =
  | (BlockBase & Readonly<{ type: "heading"; text: string; level?: 2 | 3 }>)
  | (BlockBase & Readonly<{ type: "text"; text: string }>)
  | (BlockBase & Readonly<{ type: "card"; body?: string; visual?: ExperienceVisual; actions?: readonly ExperienceActionRef[] }>)
  | (BlockBase & Readonly<{ type: "chart"; dataSource: string; visualization: "bar" | "line" | "donut" | "metric" }>)
  | (BlockBase & Readonly<{ type: "shortcut"; body?: string; visual?: ExperienceVisual; actions: readonly ExperienceActionRef[] }>)
  | (BlockBase & Readonly<{ type: "onboarding"; steps: readonly Readonly<{ label: string; action?: ExperienceActionRef }>[] }>)
  | (BlockBase & Readonly<{ type: "quick-list"; dataSource: string; emptyText?: string }>)
  | (BlockBase & Readonly<{ type: "number-card"; dataSource: string; format?: "number" | "currency" | "percent" }>)
  | (BlockBase & Readonly<{ type: "extension"; extension: string; config?: Readonly<Record<string, unknown>> }>);

export interface ExperienceSurface {
  readonly schema: typeof EXPERIENCE_SURFACE_SCHEMA;
  readonly id: string;
  readonly revision: number;
  readonly scope: Readonly<{ kind: ExperienceSurfaceKind; plane: "studio" | "neon" | "mesh"; workspaceCode?: string; moduleCode?: string; entityCode?: string }>;
  readonly title: string;
  readonly eyebrow?: string;
  readonly description?: string;
  readonly visual?: ExperienceVisual;
  readonly blocks: readonly ExperienceBlock[];
}
export interface ExperienceRegistryPolicy { readonly dataSources: ReadonlySet<string>; readonly actions: ReadonlySet<string>; readonly extensions: ReadonlySet<string>; readonly assetRefPattern?: RegExp; }
export interface PublishedExperienceLayer { readonly layer: "shared" | "tenant"; readonly surface: ExperienceSurface; }
export interface PersonalSurfaceArrangement { readonly schema: "athyper-experience-arrangement/1"; readonly surfaceId: string; readonly baseRevision: number; readonly order?: readonly string[]; readonly hidden?: readonly string[]; readonly spans?: Readonly<Record<string, 1 | 2 | 3 | 4>>; }
export interface EffectiveExperienceSurface {
  readonly surface: ExperienceSurface;
  readonly provenance: Readonly<{ systemRevision: number; sharedRevision?: number; tenantRevision?: number; personalRevision?: number; personalApplied: boolean }>;
}

const codePattern = /^[a-z][a-z0-9_.-]{1,126}$/;
const assetPattern = /^(?:asset|brand):[a-z][a-z0-9_./-]{1,254}$/;

export function parseExperienceSurface(value: unknown, policy: ExperienceRegistryPolicy): ExperienceSurface {
  const root = object(value, "surface");
  if (root.schema !== EXPERIENCE_SURFACE_SCHEMA) throw new TypeError(`surface.schema must be ${EXPERIENCE_SURFACE_SCHEMA}`);
  const scope = parseScope(root.scope);
  const blocks = array(root.blocks, "surface.blocks").map((block, index) => parseBlock(block, `surface.blocks[${index}]`, policy));
  if (blocks.length > 48) throw new TypeError("surface.blocks exceeds 48 blocks");
  if (new Set(blocks.map((block) => block.id)).size !== blocks.length) throw new TypeError("surface block ids must be unique");
  return Object.freeze({ schema: EXPERIENCE_SURFACE_SCHEMA, id: code(root.id, "surface.id"), revision: integer(root.revision, "surface.revision", 1), scope, title: text(root.title, "surface.title", 120), ...optionalText(root.eyebrow, "eyebrow", "surface.eyebrow", 120), ...optionalText(root.description, "description", "surface.description", 500), ...optionalVisual(root.visual, "surface.visual", policy), blocks: Object.freeze(blocks) });
}

export function resolvePublishedExperience(system: ExperienceSurface, layers: readonly PublishedExperienceLayer[]): ExperienceSurface {
  let resolved = system;
  for (const layerName of ["shared", "tenant"] as const) {
    const candidates = layers.filter((candidate) => candidate.layer === layerName);
    if (candidates.length > 1) throw new TypeError(`only one published ${layerName} override is allowed`);
    const candidate = candidates[0]?.surface;
    if (!candidate) continue;
    if (candidate.id !== system.id || JSON.stringify(candidate.scope) !== JSON.stringify(system.scope)) throw new TypeError(`${layerName} override scope does not match ${system.id}`);
    resolved = candidate;
  }
  return resolved;
}

export function applyPersonalArrangement(surface: ExperienceSurface, arrangement: PersonalSurfaceArrangement | undefined): ExperienceSurface {
  if (!arrangement) return surface;
  if (arrangement.schema !== "athyper-experience-arrangement/1" || arrangement.surfaceId !== surface.id || arrangement.baseRevision !== surface.revision) return surface;
  const known = new Set(surface.blocks.map((block) => block.id));
  const hidden = new Set((arrangement.hidden ?? []).filter((id) => known.has(id)));
  const rank = new Map((arrangement.order ?? []).filter((id) => known.has(id)).map((id, index) => [id, index]));
  const blocks = surface.blocks.filter((block) => !hidden.has(block.id)).map((block) => {
    const span = arrangement.spans?.[block.id];
    return span ? Object.freeze({ ...block, span }) : block;
  }).sort((left, right) => (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  return Object.freeze({ ...surface, blocks: Object.freeze(blocks) });
}

export function parsePersonalSurfaceArrangement(value: unknown): PersonalSurfaceArrangement {
  const root = object(value, "arrangement");
  if (root.schema !== "athyper-experience-arrangement/1") throw new TypeError("arrangement.schema must be athyper-experience-arrangement/1");
  const surfaceId = code(root.surfaceId, "arrangement.surfaceId");
  const baseRevision = integer(root.baseRevision, "arrangement.baseRevision", 1);
  const order = root.order === undefined ? undefined : uniqueCodes(root.order, "arrangement.order");
  const hidden = root.hidden === undefined ? undefined : uniqueCodes(root.hidden, "arrangement.hidden");
  let spans: Readonly<Record<string, 1 | 2 | 3 | 4>> | undefined;
  if (root.spans !== undefined) {
    const candidates = object(root.spans, "arrangement.spans");
    const parsed: Record<string, 1 | 2 | 3 | 4> = {};
    for (const [key, candidate] of Object.entries(candidates)) parsed[code(key, "arrangement.spans key")] = oneOf(candidate, [1, 2, 3, 4] as const, `arrangement.spans.${key}`);
    spans = Object.freeze(parsed);
  }
  return Object.freeze({ schema: "athyper-experience-arrangement/1", surfaceId, baseRevision, ...(order ? { order } : {}), ...(hidden ? { hidden } : {}), ...(spans ? { spans } : {}) });
}

export function resolveEffectiveExperience(system: ExperienceSurface, layers: readonly PublishedExperienceLayer[], arrangement?: PersonalSurfaceArrangement, revisions: Readonly<{ sharedRevision?: number; tenantRevision?: number; personalRevision?: number }> = {}): EffectiveExperienceSurface {
  const published = resolvePublishedExperience(system, layers);
  const personalApplied = arrangement?.surfaceId === published.id && arrangement.baseRevision === published.revision;
  return Object.freeze({
    surface: applyPersonalArrangement(published, arrangement),
    provenance: Object.freeze({ systemRevision: system.revision, ...revisions, personalApplied }),
  });
}

function parseScope(value: unknown): ExperienceSurface["scope"] {
  const item = object(value, "surface.scope");
  const kind = oneOf(item.kind, ["home", "workspace", "module", "entity-collection", "entity-create", "entity-detail"] as const, "surface.scope.kind");
  const plane = oneOf(item.plane, ["studio", "neon", "mesh"] as const, "surface.scope.plane");
  const result: { kind: ExperienceSurfaceKind; plane: "studio" | "neon" | "mesh"; workspaceCode?: string; moduleCode?: string; entityCode?: string } = { kind, plane };
  if (item.workspaceCode !== undefined) result.workspaceCode = code(item.workspaceCode, "surface.scope.workspaceCode");
  if (item.moduleCode !== undefined) result.moduleCode = code(item.moduleCode, "surface.scope.moduleCode");
  if (item.entityCode !== undefined) result.entityCode = code(item.entityCode, "surface.scope.entityCode");
  if (kind !== "home" && !result.workspaceCode) throw new TypeError("non-home surfaces require workspaceCode");
  if (["module", "entity-collection", "entity-create", "entity-detail"].includes(kind) && !result.moduleCode) throw new TypeError(`${kind} requires moduleCode`);
  if (kind.startsWith("entity-") && !result.entityCode) throw new TypeError(`${kind} requires entityCode`);
  return Object.freeze(result);
}

function parseBlock(value: unknown, path: string, policy: ExperienceRegistryPolicy): ExperienceBlock {
  const item = object(value, path);
  const base = { id: code(item.id, `${path}.id`), ...optionalText(item.title, "title", `${path}.title`, 120), ...(item.span === undefined ? {} : { span: oneOf(item.span, [1, 2, 3, 4] as const, `${path}.span`) }) };
  switch (item.type) {
    case "heading": return Object.freeze({ ...base, type: "heading", text: text(item.text, `${path}.text`, 200), ...(item.level === undefined ? {} : { level: oneOf(item.level, [2, 3] as const, `${path}.level`) }) });
    case "text": return Object.freeze({ ...base, type: "text", text: text(item.text, `${path}.text`, 2000) });
    case "card": return Object.freeze({ ...base, type: "card", ...optionalText(item.body, "body", `${path}.body`, 1000), ...optionalVisual(item.visual, `${path}.visual`, policy), ...(item.actions === undefined ? {} : { actions: actions(item.actions, `${path}.actions`, policy) }) });
    case "chart": return Object.freeze({ ...base, type: "chart", dataSource: registryRef(item.dataSource, policy.dataSources, `${path}.dataSource`), visualization: oneOf(item.visualization, ["bar", "line", "donut", "metric"] as const, `${path}.visualization`) });
    case "shortcut": { const refs = actions(item.actions, `${path}.actions`, policy); if (!refs.length) throw new TypeError(`${path}.actions must not be empty`); return Object.freeze({ ...base, type: "shortcut", ...optionalText(item.body, "body", `${path}.body`, 1000), ...optionalVisual(item.visual, `${path}.visual`, policy), actions: refs }); }
    case "onboarding": return Object.freeze({ ...base, type: "onboarding", steps: Object.freeze(array(item.steps, `${path}.steps`).map((step, index) => { const candidate = object(step, `${path}.steps[${index}]`); return Object.freeze({ label: text(candidate.label, `${path}.steps[${index}].label`, 120), ...(candidate.action === undefined ? {} : { action: parseAction(candidate.action, `${path}.steps[${index}].action`, policy) }) }); })) });
    case "quick-list": return Object.freeze({ ...base, type: "quick-list", dataSource: registryRef(item.dataSource, policy.dataSources, `${path}.dataSource`), ...optionalText(item.emptyText, "emptyText", `${path}.emptyText`, 200) });
    case "number-card": return Object.freeze({ ...base, type: "number-card", dataSource: registryRef(item.dataSource, policy.dataSources, `${path}.dataSource`), ...(item.format === undefined ? {} : { format: oneOf(item.format, ["number", "currency", "percent"] as const, `${path}.format`) }) });
    case "extension": return Object.freeze({ ...base, type: "extension", extension: registryRef(item.extension, policy.extensions, `${path}.extension`), ...(item.config === undefined ? {} : { config: object(item.config, `${path}.config`) }) });
    default: throw new TypeError(`${path}.type is unsupported`);
  }
}

function actions(value: unknown, path: string, policy: ExperienceRegistryPolicy) { return Object.freeze(array(value, path).map((action, index) => parseAction(action, `${path}[${index}]`, policy))); }
function parseAction(value: unknown, path: string, policy: ExperienceRegistryPolicy): ExperienceActionRef { const item = object(value, path); return Object.freeze({ action: registryRef(item.action, policy.actions, `${path}.action`), label: text(item.label, `${path}.label`, 80), ...(item.input === undefined ? {} : { input: scalarRecord(item.input, `${path}.input`) }) }); }
function optionalVisual(value: unknown, path: string, policy: ExperienceRegistryPolicy): { visual?: ExperienceVisual } { if (value === undefined) return {}; const item = object(value, path); if (item.kind === "icon") return { visual: Object.freeze({ kind: "icon", key: code(item.key, `${path}.key`) }) }; if (item.kind === "image") { const assetRef = text(item.assetRef, `${path}.assetRef`, 255); if (!(policy.assetRefPattern ?? assetPattern).test(assetRef)) throw new TypeError(`${path}.assetRef is not governed`); return { visual: Object.freeze({ kind: "image", assetRef, alt: text(item.alt, `${path}.alt`, 160), ...(item.focalPoint === undefined ? {} : { focalPoint: point(item.focalPoint, `${path}.focalPoint`) }) }) }; } throw new TypeError(`${path}.kind is invalid`); }
function registryRef(value: unknown, registry: ReadonlySet<string>, path: string): string { const result = code(value, path); if (!registry.has(result)) throw new TypeError(`${path} references unregistered ${result}`); return result; }
function scalarRecord(value: unknown, path: string): Readonly<Record<string, string | number | boolean>> { const item = object(value, path); for (const [key, candidate] of Object.entries(item)) if (!codePattern.test(key) || !["string", "number", "boolean"].includes(typeof candidate)) throw new TypeError(`${path}.${key} must be scalar`); return Object.freeze(item as Record<string, string | number | boolean>); }
function point(value: unknown, path: string) { const item = object(value, path); return Object.freeze({ x: coordinate(item.x, `${path}.x`), y: coordinate(item.y, `${path}.y`) }); }
function coordinate(value: unknown, path: string) { if (typeof value !== "number" || value < 0 || value > 1) throw new TypeError(`${path} must be between 0 and 1`); return value; }
function object(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`); return value as Record<string, unknown>; }
function array(value: unknown, path: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`); return value; }
function uniqueCodes(value: unknown, path: string): readonly string[] { const result = array(value, path).map((item, index) => code(item, `${path}[${index}]`)); if (new Set(result).size !== result.length) throw new TypeError(`${path} must not contain duplicates`); return Object.freeze(result); }
function text(value: unknown, path: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new TypeError(`${path} must be 1-${max} characters`); return value.trim(); }
function code(value: unknown, path: string): string { const result = text(value, path, 127); if (!codePattern.test(result)) throw new TypeError(`${path} must be a catalog code`); return result; }
function optionalText(value: unknown, key: string, path: string, max: number): Record<string, string> { return value === undefined ? {} : { [key]: text(value, path, max) }; }
function optionalCode(value: unknown, key: string, path: string): Record<string, string> { return value === undefined ? {} : { [key]: code(value, path) }; }
function integer(value: unknown, path: string, min: number): number { if (typeof value !== "number" || !Number.isInteger(value) || value < min) throw new TypeError(`${path} must be an integer >= ${min}`); return value; }
function oneOf<const T extends readonly unknown[]>(value: unknown, values: T, path: string): T[number] { if (!values.includes(value)) throw new TypeError(`${path} is invalid`); return value as T[number]; }
