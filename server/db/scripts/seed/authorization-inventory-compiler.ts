import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

export type DiscoveredTable = {
  readonly table: string;
  readonly ddlSource: string;
  readonly hasStatus: boolean;
  readonly hasVersion: boolean;
};

export async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as T;
}

export async function discoverInventoryTables(
  dbRoot: string,
  sourcePath: string,
  schemas: readonly string[],
): Promise<DiscoveredTable[]> {
  const source = await readFile(resolve(dbRoot, sourcePath), "utf8");
  const schemaPattern = schemas.join("|");
  const pattern = new RegExp(`^CREATE TABLE\\s+((?:${schemaPattern})\\.[a-z][a-z0-9_]*)`, "gm");
  const matches = [...source.matchAll(pattern)];
  return matches.map((match, index) => {
    const body = source.slice(match.index!, matches[index + 1]?.index ?? source.length);
    return {
      table: match[1]!,
      ddlSource: sourcePath,
      hasStatus: /^\s+(?:status|state|lifecycle_status)\s+/m.test(body),
      hasVersion: /^\s+(?:row_version|version|lock_version)\s+/m.test(body),
    };
  });
}

export async function loadInventorySourceCache(
  repositoryRoot: string,
  roots: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const paths = (await Promise.all(roots.map((root) => walk(resolve(repositoryRoot, root)))))
    .flat()
    .filter(sourceFile)
    .sort();
  return new Map(await Promise.all(paths.map(async (path) => [path, await readFile(path, "utf8")] as const)));
}

export function inventoryReferences(
  table: string,
  files: ReadonlyMap<string, string>,
  dbRoot: string,
  writersOnly: boolean,
): string[] {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const writer = new RegExp(
    "(?:insertInto|updateTable|deleteFrom)\\(\\s*[\"'`]" + escaped
      + "[\"'`]|\\b(?:insert\\s+into|update|delete\\s+from|truncate(?:\\s+table)?)\\s+" + escaped + "\\b",
    "i",
  );
  const output: string[] = [];
  for (const [path, source] of files) {
    if (writersOnly ? writer.test(source) : source.includes(table)) output.push(relativeToDb(dbRoot, path));
  }
  return output.sort();
}

export function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) seen.has(value) ? duplicates.add(value) : seen.add(value);
  return [...duplicates].sort();
}

export function relativeToDb(dbRoot: string, path: string): string {
  return relative(dbRoot, path).replace(/\\/g, "/");
}

export function artifactWithDigest<T extends Record<string, unknown>>(body: T): T & { readonly sha256: string } {
  return { ...body, sha256: createHash("sha256").update(canonical(body)).digest("hex") };
}

export async function publishInventoryArtifacts(options: {
  readonly check: boolean;
  readonly outputRoot: string;
  readonly outputPath: string;
  readonly reportPath: string;
  readonly artifact: Record<string, unknown>;
  readonly report: string;
  readonly staleMessage: string;
}): Promise<void> {
  const jsonSource = `${JSON.stringify(options.artifact, null, 2)}\n`;
  if (options.check) {
    const [existingJson, existingReport] = await Promise.all([
      readFile(options.outputPath, "utf8"),
      readFile(options.reportPath, "utf8"),
    ]);
    if (existingJson !== jsonSource || existingReport !== options.report) throw new Error(options.staleMessage);
    return;
  }
  await mkdir(options.outputRoot, { recursive: true });
  await Promise.all([
    writeFile(options.outputPath, jsonSource),
    writeFile(options.reportPath, options.report),
  ]);
}

function sourceFile(path: string): boolean {
  return [".ts", ".tsx", ".js", ".mjs"].includes(extname(path))
    && !/[\\/](?:node_modules|dist|coverage|generated|__tests__|__fixtures__)[\\/]/.test(path)
    && !/\.(?:test|spec|d)\.(?:ts|tsx|js|mjs)$/.test(path);
}

async function walk(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "dist", "coverage", ".git"].includes(entry.name)) output.push(...await walk(path));
    } else if (entry.isFile()) output.push(path);
  }
  return output;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
