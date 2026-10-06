import { createHash } from "node:crypto";

/** Generates only the admitted reference dictionary's DDL evidence annotations.
 * Dictionary rationale and unimplemented target properties remain reviewed text. */
export function referenceDdlStatus(
  blueprint: string,
  sources: readonly { readonly path: string; readonly sql: string }[],
  tables: readonly string[],
): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([...sources].sort((a, b) => a.path.localeCompare(b.path))),
    )
    .digest("hex");
  let result = blueprint;
  for (const table of tables) {
    if (!/^[a-z_]+$/.test(table)) throw Error("REFERENCE_DDL_TABLE_INVALID");
    const heading = "### `metadata." + table + "`";
    const start = result.indexOf(heading + "\n");
    if (start < 0 || result.indexOf(heading + "\n", start + 1) >= 0)
      throw Error("REFERENCE_DICTIONARY_HEADING_INVALID: " + table);
    const next = result.indexOf("\n### ", start + heading.length);
    const end = next < 0 ? result.length : next;
    const section = result.slice(start, end);
    const columns = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map(
      (m) => m[1]!,
    );
    if (!columns.length || new Set(columns).size !== columns.length)
      throw Error("REFERENCE_DICTIONARY_COLUMNS_INVALID: " + table);
    const declarations = sources.flatMap((source) =>
      [
        ...source.sql.matchAll(
          new RegExp(
            `CREATE TABLE(?: IF NOT EXISTS)? metadata\\.${table} \\(([\\s\\S]*?)\\n\\);`,
            "g",
          ),
        ),
      ].map((m) => ({ path: source.path, body: m[1]! })),
    );
    if (declarations.length !== 1)
      throw Error("REFERENCE_DDL_DECLARATION_INVALID: " + table);
    const declaration = declarations[0]!;
    const missing = columns.filter(
      (column) =>
        !new RegExp(
          `(?:^|\\n|,)\\s*${column}\\s+[a-zA-Z_][a-zA-Z0-9_.]*(?:\\[\\])?`,
        ).test(declaration.body),
    );
    const status = `<!-- reference-ddl:${table}:generated:start -->\n**DDL status:** table declared in \`${declaration.path}\`; ${missing.length ? `target columns absent from this CREATE TABLE: ${missing.map((c) => "`" + c + "`").join(", ")}` : "all listed column names occur in this CREATE TABLE"}. This is source-DDL presence evidence, not equivalence of target types/rules or deployed qualification. Full metadata DDL inventory hash: \`${hash}\`.\n<!-- reference-ddl:${table}:generated:end -->`;
    const existing = new RegExp(
      `<!-- reference-ddl:${table}:generated:start -->[\\s\\S]*?<!-- reference-ddl:${table}:generated:end -->`,
    );
    const plain = /^\*\*DDL status:\*\*[^\n]*/gm;
    let updated: string;
    if (existing.test(section)) {
      updated = section.replace(existing, status);
      if ((updated.match(plain) ?? []).length !== 1)
        throw Error("REFERENCE_DICTIONARY_STATUS_INVALID: " + table);
    } else {
      if ((section.match(plain) ?? []).length !== 1)
        throw Error("REFERENCE_DICTIONARY_STATUS_INVALID: " + table);
      updated = section.replace(plain, status);
    }
    result = result.slice(0, start) + updated + result.slice(end);
  }
  return result;
}
