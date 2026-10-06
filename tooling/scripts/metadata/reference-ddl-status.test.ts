import { strict as assert } from "node:assert";
import { test } from "node:test";
import { referenceDdlStatus } from "./reference-ddl-status.js";
const document =
  "### `metadata.entity_target`\n\n**DDL status:** proposed table.\n\n| `target_plane` | text |\n| `position` | integer |\n\n### `metadata.entity_navigation_placement`\n\n**DDL status:** proposed table.\n";
const ddl = [
  {
    path: "metadata/supplement.sql",
    sql: "CREATE TABLE metadata.entity_target (\n target_plane text,\n position integer\n);\n",
  },
];
test("generates reproducible supplemental DDL presence without rewriting target dictionaries", () => {
  const output = referenceDdlStatus(document, ddl, ["entity_target"]);
  assert.match(output, /all listed column names occur/);
  assert.match(
    output,
    /not equivalence of target types\/rules or deployed qualification/,
  );
  assert.match(
    output,
    /entity_navigation_placement`\n\n\*\*DDL status:\*\* proposed table/,
  );
  assert.equal(referenceDdlStatus(output, ddl, ["entity_target"]), output);
  assert.equal(
    referenceDdlStatus(
      output.replace("all listed column names occur", "stale"),
      ddl,
      ["entity_target"],
    ),
    output,
  );
});
test("captures missing target columns and changes evidence on supplemental SQL changes", () => {
  const before = referenceDdlStatus(document, ddl, ["entity_target"]);
  const after = referenceDdlStatus(
    document,
    [
      {
        ...ddl[0]!,
        sql: ddl[0]!.sql.replace(
          " position integer",
          " other_position integer",
        ),
      },
    ],
    ["entity_target"],
  );
  assert.match(
    after,
    /target columns absent from this CREATE TABLE: `position`/,
  );
  assert.notEqual(after, before);
});
test("rejects missing or ambiguous source evidence and document anchors", () => {
  assert.throws(
    () => referenceDdlStatus(document, [], ["entity_target"]),
    /DECLARATION_INVALID/,
  );
  assert.throws(
    () => referenceDdlStatus(document, [...ddl, ...ddl], ["entity_target"]),
    /DECLARATION_INVALID/,
  );
  assert.throws(
    () => referenceDdlStatus(document + document, ddl, ["entity_target"]),
    /HEADING_INVALID/,
  );
  assert.throws(
    () =>
      referenceDdlStatus(
        document.replace("**DDL status:** proposed table.\n", ""),
        ddl,
        ["entity_target"],
      ),
    /STATUS_INVALID/,
  );
});
