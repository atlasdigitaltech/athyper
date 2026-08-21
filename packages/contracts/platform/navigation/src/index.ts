export interface NavigationModule { readonly code: string; readonly name: string; readonly iconKey?: string; readonly primaryWorkspaceCode?: string; }
export interface NavigationWorkspace { readonly code: string; readonly name: string; readonly iconKey?: string; readonly sortOrder: number; readonly modules: readonly string[]; }
export interface NavigationCatalog { readonly schemaVersion: 1; readonly revision: string; readonly workspaces: readonly NavigationWorkspace[]; readonly modules: readonly NavigationModule[]; }

export function parseNavigationCatalog(value: unknown): NavigationCatalog {
  const record = object(value, "navigation catalog");
  if (record.schemaVersion !== 1) throw new TypeError("schemaVersion must be 1");
  const modules = array(record.modules, "modules").map((candidate, index) => {
    const item = object(candidate, `modules[${index}]`);
    const iconKey = optionalCode(item.iconKey, `modules[${index}].iconKey`);
    const primaryWorkspaceCode = optionalCode(item.primaryWorkspaceCode, `modules[${index}].primaryWorkspaceCode`);
    return Object.freeze({ code: code(item.code, `modules[${index}].code`), name: text(item.name, `modules[${index}].name`), ...(iconKey ? { iconKey } : {}), ...(primaryWorkspaceCode ? { primaryWorkspaceCode } : {}) });
  });
  const moduleCodes = new Set(modules.map((item) => item.code));
  if (moduleCodes.size !== modules.length) throw new TypeError("module codes must be unique");
  const workspaces = array(record.workspaces, "workspaces").map((candidate, index) => {
    const item = object(candidate, `workspaces[${index}]`);
    const members = codes(item.modules, `workspaces[${index}].modules`);
    for (const member of members) if (!moduleCodes.has(member)) throw new TypeError(`workspace references unknown module ${member}`);
    const sortOrder = item.sortOrder;
    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0) throw new TypeError(`workspaces[${index}].sortOrder must be a non-negative integer`);
    const iconKey = optionalCode(item.iconKey, `workspaces[${index}].iconKey`);
    return Object.freeze({ code: code(item.code, `workspaces[${index}].code`), name: text(item.name, `workspaces[${index}].name`), ...(iconKey ? { iconKey } : {}), sortOrder, modules: members });
  });
  if (new Set(workspaces.map((item) => item.code)).size !== workspaces.length) throw new TypeError("workspace codes must be unique");
  return Object.freeze({ schemaVersion: 1, revision: text(record.revision, "revision"), workspaces: Object.freeze(workspaces), modules: Object.freeze(modules) });
}

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Record<string, unknown>; }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return value; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty`); return value.trim(); }
function code(value: unknown, name: string): string { const result = text(value, name); if (!/^[a-z][a-z0-9_.-]{1,62}$/.test(result)) throw new TypeError(`${name} must be a catalog code`); return result; }
function optionalCode(value: unknown, name: string): string | undefined { return value === undefined ? undefined : code(value, name); }
function codes(value: unknown, name: string): readonly string[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return Object.freeze([...new Set(value.map((item, index) => code(item, `${name}[${index}]`)))]); }
