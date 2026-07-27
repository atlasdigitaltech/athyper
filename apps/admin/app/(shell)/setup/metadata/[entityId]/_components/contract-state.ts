export type JsonRecord = Record<string, unknown>;

export const CONTRACT_OWNER_SECTIONS = [
  "catalog",
  "runtime",
  "version_contract",
  "fields",
  "relations",
  "surfaces",
  "operations",
  "lifecycle",
  "numbering",
  "policy",
  "flows",
] as const;

export type ContractSectionKey = typeof CONTRACT_OWNER_SECTIONS[number];

/** Remove read-model envelope fields before strict Contract v2 validation. */
export function toAuthoredContract(contract: JsonRecord): JsonRecord {
  const { version_status: _versionStatus, ...authored } = contract;
  return authored;
}

export interface ContractIssue {
  path: string;
  code?: string;
  message: string;
  severity?: "error" | "warning" | "info";
}

export function jsonPointer(parts: readonly (string | number)[]): string {
  return `/${parts.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Produces leaf-level JSON Pointer paths so owners and validation controls can be indexed. */
export function changedPaths(
  before: unknown,
  after: unknown,
  parts: readonly (string | number)[] = [],
): string[] {
  if (equal(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const paths = Array.from({ length: Math.max(before.length, after.length) }, (_, index) =>
      changedPaths(before[index], after[index], [...parts, index])).flat();
    return paths.length ? paths : [jsonPointer(parts)];
  }
  if (before && after && typeof before === "object" && typeof after === "object"
      && !Array.isArray(before) && !Array.isArray(after)) {
    const keys = new Set([...Object.keys(before as JsonRecord), ...Object.keys(after as JsonRecord)]);
    const paths = [...keys].flatMap((key) =>
      changedPaths((before as JsonRecord)[key], (after as JsonRecord)[key], [...parts, key]));
    return paths.length ? paths : [jsonPointer(parts)];
  }
  return [jsonPointer(parts)];
}

export function ownerForPath(path: string): ContractSectionKey | null {
  const owner = path.split("/")[1]?.replaceAll("~1", "/").replaceAll("~0", "~");
  return CONTRACT_OWNER_SECTIONS.includes(owner as ContractSectionKey)
    ? owner as ContractSectionKey
    : null;
}

export function dirtyPathsByOwner(
  base: JsonRecord,
  working: JsonRecord,
): Partial<Record<ContractSectionKey, string[]>> {
  const grouped: Partial<Record<ContractSectionKey, string[]>> = {};
  for (const path of changedPaths(base, working)) {
    const owner = ownerForPath(path);
    if (owner) (grouped[owner] ??= []).push(path);
  }
  return grouped;
}

export function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function valueAt(root: unknown, pointer: string): { present: boolean; value: unknown } {
  let current = root;
  for (const encoded of pointer.split("/").slice(1)) {
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { present: false, value: undefined };
      current = current[index];
    } else if (current && typeof current === "object" && key in (current as JsonRecord)) {
      current = (current as JsonRecord)[key];
    } else {
      return { present: false, value: undefined };
    }
  }
  return { present: true, value: current };
}

function setAt(root: JsonRecord, pointer: string, source: unknown): void {
  const parts = pointer.split("/").slice(1).map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  if (!parts.length) return;
  let current: unknown = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]!;
    const next = parts[index + 1]!;
    if (Array.isArray(current)) {
      const arrayIndex = Number(key);
      current[arrayIndex] ??= /^\d+$/.test(next) ? [] : {};
      current = current[arrayIndex];
    } else {
      const record = current as JsonRecord;
      record[key] ??= /^\d+$/.test(next) ? [] : {};
      current = record[key];
    }
  }
  const key = parts.at(-1)!;
  if (Array.isArray(current)) {
    const index = Number(key);
    if (source === undefined) current.splice(index, 1);
    else current[index] = clone(source);
  } else if (source === undefined) {
    delete (current as JsonRecord)[key];
  } else {
    (current as JsonRecord)[key] = clone(source);
  }
}

export interface RebaseResult {
  document: JsonRecord;
  conflicts: string[];
  localPaths: string[];
  remotePaths: string[];
}

/** Three-way rebase. Non-overlapping local edits are replayed onto the latest server document. */
export function rebaseContract(
  base: JsonRecord,
  local: JsonRecord,
  remote: JsonRecord,
): RebaseResult {
  const localPaths = changedPaths(base, local);
  const remotePaths = changedPaths(base, remote);
  const conflicts = localPaths.filter((path) => remotePaths.some((remotePath) => pathsOverlap(path, remotePath)));
  const document = clone(remote);
  for (const path of localPaths) {
    if (conflicts.includes(path)) continue;
    const localValue = valueAt(local, path);
    setAt(document, path, localValue.present ? localValue.value : undefined);
  }
  return { document, conflicts, localPaths, remotePaths };
}

export function resolveRebaseConflict(
  document: JsonRecord,
  local: JsonRecord,
  path: string,
  resolution: "local" | "remote",
): JsonRecord {
  if (resolution === "remote") return document;
  const next = clone(document);
  const value = valueAt(local, path);
  setAt(next, path, value.present ? value.value : undefined);
  return next;
}

export function issuesByPath(issues: readonly ContractIssue[]): Record<string, ContractIssue[]> {
  return issues.reduce<Record<string, ContractIssue[]>>((index, issue) => {
    const normalized = issue.path.startsWith("/") ? issue.path : `/${issue.path.replaceAll(".", "/")}`;
    (index[normalized] ??= []).push(issue);
    return index;
  }, {});
}
