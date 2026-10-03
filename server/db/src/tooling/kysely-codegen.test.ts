import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);

test("nullable columns can be omitted on insert while selected rows retain their nullable field", () => {
  const directory = mkdtempSync(join(tmpdir(), "athyper-codegen-"));
  try {
    const schema = join(directory, "schema.prisma");
    writeFileSync(schema, "model probe {\n  id Int @id\n  note String?\n}\n");
    execFileSync(process.execPath, [fileURLToPath(new URL("../../prisma/kysely-generate-from-ast.mjs", import.meta.url)), "--schema", schema, "--output", directory], { stdio: ["pipe", "pipe", "pipe"] });
    symlinkSync(fileURLToPath(new URL("../../node_modules", import.meta.url)), join(directory, "node_modules"), "dir");
    writeFileSync(join(directory, "insert-check.ts"), `import type { Insertable, Selectable } from "kysely";
import type { probe } from "./types";
const omitted: Insertable<probe> = { id: 1 };
const explicitNull: Insertable<probe> = { id: 1, note: null };
const selected: Selectable<probe> = { id: 1, note: null };
// @ts-expect-error selected rows always contain the nullable column
const missingSelectedColumn: Selectable<probe> = { id: 1 };
`);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true, types: [], noEmit: true }, files: ["insert-check.ts"] }));
    assert.doesNotThrow(() => execFileSync(process.execPath, [require.resolve("typescript/lib/tsc.js"), "-p", join(directory, "tsconfig.json")], { stdio: ["pipe", "pipe", "pipe"] }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
