export * from "./kysely-saved-view-repository.js";
export * from "./saved-view-routes.js";

export type PlatformPlane = "studio" | "neon" | "mesh";
export type SavedViewScope = "personal" | "shared" | "system";
export type SavedViewStatus = "active" | "inactive" | "archived";
export type SavedViewFlag = "pinned" | "starred";

export interface SavedView {
  readonly id: string;
  readonly tenantId: string;
  readonly ownerPrincipalId?: string;
  readonly createdBy?: string;
  readonly scope: SavedViewScope;
  readonly surfaceCode: string;
  readonly entityCode: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly state: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly status: SavedViewStatus;
  readonly version: number;
}

export interface SavedViewPresentation extends SavedView {
  readonly isDefault: boolean;
  readonly isPinned: boolean;
  readonly isStarred: boolean;
}

export interface SavedViewScopeContext {
  readonly planeKey: PlatformPlane;
  readonly tenantId: string;
  readonly principalId: string;
}

export interface SavedViewRepository {
  list(query: SavedViewScopeContext & { surfaceCode?: string; entityCode?: string; includeArchived?: boolean }): Promise<readonly SavedView[]>;
  get(query: SavedViewScopeContext & { id: string; includeArchived?: boolean }): Promise<SavedView | undefined>;
  create(planeKey: PlatformPlane, view: SavedView): Promise<SavedView | void>;
  replace(planeKey: PlatformPlane, view: SavedView, expectedVersion: number): Promise<number | undefined>;
  archive?(scope: SavedViewScopeContext, id: string): Promise<boolean>;
  setScope?(scope: SavedViewScopeContext, id: string, nextScope: Exclude<SavedViewScope, "system">): Promise<boolean>;
  clone?(scope: SavedViewScopeContext, source: SavedView, clone: SavedView): Promise<SavedView | void>;
  updateFlag?(scope: SavedViewScopeContext, id: string, flag: SavedViewFlag, enabled?: boolean): Promise<{ enabled: boolean }>;
  getPreference?(scope: SavedViewScopeContext, code: string, surfaceCode: string): Promise<unknown>;
  setPreference?(scope: SavedViewScopeContext, code: string, surfaceCode: string, value: unknown): Promise<void>;
  clearDefaultIfMatches?(scope: SavedViewScopeContext, entityCode: string, id: string): Promise<void>;
  clearPreference?(scope: SavedViewScopeContext, code: string, surfaceCode: string): Promise<void>;
}

export class SavedViewVersionConflict extends Error {
  constructor() { super("Saved view was changed by another request"); this.name = "SavedViewVersionConflict"; }
}

export class SavedViewError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "SavedViewError"; }
}

export function createSavedViewService(repository: SavedViewRepository, ids: () => string = () => crypto.randomUUID()) {
  const requireMethod = <Key extends keyof SavedViewRepository>(key: Key): NonNullable<SavedViewRepository[Key]> => {
    const method = repository[key];
    if (!method) throw new SavedViewError(503, "SAVED_VIEW_CAPABILITY_UNAVAILABLE", `Saved-view ${String(key)} capability is unavailable`);
    return method as NonNullable<SavedViewRepository[Key]>;
  };
  const load = async (scope: SavedViewScopeContext, id: string, includeArchived = false) => {
    const view = await repository.get({ ...scope, id, ...(includeArchived ? { includeArchived: true } : {}) });
    if (!view) throw new SavedViewError(404, "SAVED_VIEW_NOT_FOUND", "Saved view was not found");
    return view;
  };
  const requireOwner = (scope: SavedViewScopeContext, view: SavedView) => {
    // Sharing clears owner_principal_id; created_by retains write authority.
    const writer = view.scope === "personal" ? view.ownerPrincipalId : view.createdBy;
    if (view.scope === "system" || writer !== scope.principalId) {
      throw new SavedViewError(403, "SAVED_VIEW_FORBIDDEN", "Saved view is not writable by this principal");
    }
  };
  const flags = async (scope: SavedViewScopeContext) => {
    const read = repository.getPreference;
    const [pinned, starred] = read ? await Promise.all([
      read(scope, "saved_view.pinned", "saved_views"),
      read(scope, "saved_view.starred", "saved_views"),
    ]) : [[], []];
    return { pinned: idSet(pinned), starred: idSet(starred) };
  };
  return {
    async list(scope: SavedViewScopeContext, query: { surfaceCode?: string; entityCode?: string; includeArchived?: boolean } = {}): Promise<readonly SavedViewPresentation[]> {
      const [views, currentFlags] = await Promise.all([repository.list({ ...scope, ...query }), flags(scope)]);
      const defaults = repository.getPreference
        ? new Map(await Promise.all([...new Set(views.map((view) => view.entityCode))].map(async (entityCode) => [entityCode, preferenceViewId(await repository.getPreference!(scope, "saved_view.default", entityCode))] as const)))
        : new Map<string, string | undefined>();
      return views.map((view) => ({ ...view, isDefault: defaults.get(view.entityCode) === view.id, isPinned: currentFlags.pinned.has(view.id), isStarred: currentFlags.starred.has(view.id) }));
    },
    async create(scope: SavedViewScopeContext, input: Omit<SavedView, "id" | "tenantId" | "ownerPrincipalId" | "createdBy" | "version" | "scope" | "status" | "metadata"> & { description?: string; metadata?: Readonly<Record<string, unknown>> }) {
      const view: SavedView = { ...input, id: ids(), tenantId: scope.tenantId, ownerPrincipalId: scope.principalId, createdBy: scope.principalId, scope: "personal", status: "active", metadata: input.metadata ?? {}, version: 1 };
      return await repository.create(scope.planeKey, view) ?? view;
    },
    async replace(scope: SavedViewScopeContext, id: string, expectedVersion: number, changes: Partial<Pick<SavedView, "name" | "state" | "description">>, entityCode?: string) {
      const current = await load(scope, id); requireOwner(scope, current);
      requireEntity(current, entityCode);
      const version = await repository.replace(scope.planeKey, { ...current, ...changes }, expectedVersion);
      if (version === undefined) throw new SavedViewVersionConflict();
      return { ...current, ...changes, version };
    },
    async remove(scope: SavedViewScopeContext, id: string, entityCode?: string): Promise<void> {
      const current = await load(scope, id); requireOwner(scope, current);
      requireEntity(current, entityCode);
      if (!await requireMethod("archive")(scope, id)) throw new SavedViewError(404, "SAVED_VIEW_NOT_FOUND", "Saved view was not found");
      if (repository.clearDefaultIfMatches) {
        await repository.clearDefaultIfMatches(scope, current.entityCode, id);
        return;
      }
      const currentDefault = preferenceViewId(await repository.getPreference?.(scope, "saved_view.default", current.entityCode));
      if (currentDefault === id) await repository.clearPreference?.(scope, "saved_view.default", current.entityCode);
    },
    async setDefault(scope: SavedViewScopeContext, entityCode: string, id: string): Promise<void> {
      const current = await load(scope, id);
      if (current.entityCode !== entityCode) throw new SavedViewError(409, "SAVED_VIEW_ENTITY_MISMATCH", "Saved view belongs to another entity");
      await requireMethod("setPreference")(scope, "saved_view.default", entityCode, { viewId: id });
    },
    async clearDefault(scope: SavedViewScopeContext, entityCode: string): Promise<void> {
      await requireMethod("clearPreference")(scope, "saved_view.default", entityCode);
    },
    async toggleFlag(scope: SavedViewScopeContext, id: string, flag: SavedViewFlag, desired?: boolean): Promise<{ enabled: boolean }> {
      await load(scope, id);
      if (repository.updateFlag) return repository.updateFlag(scope, id, flag, desired);
      const code = `saved_view.${flag}`;
      const existing = idSet(await repository.getPreference?.(scope, code, "saved_views"));
      const enabled = desired ?? !existing.has(id);
      existing.delete(id);
      if (enabled) existing.add(id);
      await requireMethod("setPreference")(scope, code, "saved_views", { viewIds: [...existing].sort() });
      return { enabled };
    },
    async setShared(scope: SavedViewScopeContext, id: string, shared: boolean): Promise<void> {
      const current = await load(scope, id); requireOwner(scope, current);
      if (!await requireMethod("setScope")(scope, id, shared ? "shared" : "personal")) throw new SavedViewError(409, "SAVED_VIEW_SCOPE_CONFLICT", "Saved view scope could not be changed");
    },
    async archive(scope: SavedViewScopeContext, id: string): Promise<void> { await this.remove(scope, id); },
    async clone(scope: SavedViewScopeContext, sourceId: string, name?: string) {
      const source = await load(scope, sourceId);
      const clone: SavedView = { ...source, id: ids(), ownerPrincipalId: scope.principalId, createdBy: scope.principalId, scope: "personal", code: `clone_${source.code.slice(0, 108)}_${ids().replace(/-/g, "").slice(0, 12)}`, name: name === undefined ? `${Array.from(source.name).slice(0, 144).join("")} (Personal copy)` : validName(name), status: "active", version: 1 };
      return await requireMethod("clone")(scope, source, clone) ?? clone;
    },
  };
}

function idSet(value: unknown): Set<string> {
  const values = Array.isArray(value) ? value : value && typeof value === "object" ? Reflect.get(value, "viewIds") : [];
  return new Set(Array.isArray(values) ? values.filter((item): item is string => typeof item === "string") : []);
}
function preferenceViewId(value: unknown): string | undefined { const id = value && typeof value === "object" ? Reflect.get(value, "viewId") : undefined; return typeof id === "string" ? id : undefined; }

function validName(value: string): string {
  if (!value.trim() || Array.from(value.trim()).length > 160) throw new SavedViewError(400, "SAVED_VIEW_INVALID", "name must contain 1 to 160 characters");
  return value.trim();
}

function requireEntity(view: SavedView, entityCode?: string): void {
  if (entityCode !== undefined && view.entityCode !== entityCode)
    throw new SavedViewError(409, "SAVED_VIEW_ENTITY_MISMATCH", "Saved view belongs to another entity");
}
