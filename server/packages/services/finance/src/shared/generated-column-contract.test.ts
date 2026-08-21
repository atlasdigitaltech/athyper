import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("finance generated-column write contract", () => {
  it("never names any generated ledger/document column in repository writes", async () => {
    const generated = new Map<string, Set<string>>();
    for (const ddl of ["../../../../../db/ddl/planes/neon/ledger/03_tables.sql", "../../../../../db/ddl/planes/neon/document/03_tables.sql"]) {
      const source = await readFile(new URL(ddl, import.meta.url), "utf8");
      for (const table of source.matchAll(/CREATE\s+TABLE\s+([^\s(]+)\s*\(([\s\S]*?)\n\);/gi)) {
        const columns = new Set<string>();
        for (const declaration of table[2]!.matchAll(/^\s*([a-z][a-z0-9_]*)\s+[^\n]*(?:\n\s+GENERATED\s+ALWAYS\s+AS[^\n]*)?/gim)) {
          if (/GENERATED\s+ALWAYS\s+AS/i.test(declaration[0])) columns.add(declaration[1]!.toLowerCase());
        }
        if (columns.size) generated.set(table[1]!.toLowerCase(), columns);
      }
    }
    expect(generated.size).toBeGreaterThan(0);
    const roots = [new URL("../", import.meta.url)];
    const repositories: URL[] = [];
    for (const root of roots) await collectRepositories(root, repositories);
    expect(repositories.length).toBeGreaterThan(0);
    for (const repository of repositories) {
      const source = await readFile(repository, "utf8");
      for (const statement of writeStatements(source)) {
        const relation = statement.match(/(?:INSERT\s+INTO|UPDATE)\s+([^\s(]+)/i)?.[1]?.toLowerCase();
        if (!relation) continue;
        const written = writtenColumns(statement);
        for (const column of generated.get(relation) ?? []) expect(written, `${repository.pathname} writes generated column ${relation}.${column}`).not.toContain(column);
      }
    }
  });
});

async function collectRepositories(directory: URL, result: URL[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) await collectRepositories(child, result);
    else if (/^kysely-.*-repositor(?:y|ies)\.ts$/.test(entry.name)) result.push(child);
  }
}

function writeStatements(source: string): readonly string[] { return [...source.matchAll(/(?:INSERT\s+INTO|UPDATE)\s+[\s\S]*?(?=`|$)/gi)].map(match => match[0]!); }
function writtenColumns(statement: string): readonly string[] {
  const insert = statement.match(/INSERT\s+INTO\s+[^\s(]+\s*\(([^)]*)\)/i);
  if (insert) return insert[1]!.split(",").map(column => column.trim().toLowerCase());
  const set = statement.match(/\bSET\s+([\s\S]*?)(?:\bFROM\b|\bWHERE\b|\bRETURNING\b|$)/i)?.[1] ?? "";
  return [...set.matchAll(/(?:^|,)\s*([a-z][a-z0-9_]*)\s*=/gi)].map(match => match[1]!.toLowerCase());
}
