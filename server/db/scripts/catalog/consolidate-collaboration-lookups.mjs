import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const planes = ["athyper", "neon", "mesh"];

async function rewrite(relativePath, transform) {
  const path = resolve(relativePath);
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No change produced for ${relativePath}`);
  await writeFile(path, after);
}

for (const plane of planes) {
  const base = `server/db/ddl/planes/${plane}/document`;

  await rewrite(`${base}/03_tables.sql`, (sql) => {
    const start = sql.indexOf("CREATE TABLE document.comment_type");
    const end = sql.indexOf("CREATE TABLE document.attachment");
    if (start < 0 || end < 0 || end <= start) throw new Error(`Table markers missing for ${plane}`);
    return `${sql.slice(0, start)}${sql.slice(end)}`;
  });

  await rewrite(`${base}/05_constraints.sql`, (sql) => {
    const start = sql.indexOf("ALTER TABLE document.attachment");
    if (start < 0) throw new Error(`Constraint marker missing for ${plane}`);
    return sql.slice(start);
  });

  await rewrite(`${base}/08_triggers.sql`, (sql) => {
    const start = sql.indexOf("CREATE TRIGGER trg_attachment_10_creation_guard");
    if (start < 0) throw new Error(`Trigger marker missing for ${plane}`);
    return sql.slice(start);
  });

  await rewrite(`${base}/10_rls.sql`, (sql) => {
    const start = sql.indexOf("ALTER TABLE document.attachment ENABLE ROW LEVEL SECURITY");
    if (start < 0) throw new Error(`RLS marker missing for ${plane}`);
    return sql.slice(start).replace(
      "            'comment_type', 'comment_intent', 'reaction_type',\r\n",
      "",
    ).replace(
      "            'comment_type', 'comment_intent', 'reaction_type',\n",
      "",
    );
  });

  await rewrite(`${base}/11_grants.sql`, (sql) => sql
    .replace(
      /        GRANT SELECT ON\r?\n            document\.comment_type,\r?\n            document\.active_attachment,/,
      "        GRANT SELECT ON\n            document.active_attachment,",
    )
    .replace(
      /        GRANT SELECT, INSERT, UPDATE ON\r?\n            document\.comment_intent,\r?\n            document\.reaction_type\r?\n        TO athyperapp;\r?\n/,
      "",
    ));

  await rewrite(`${base}/07_functions.sql`, (sql) => sql
    .replaceAll(
      `IF NOT EXISTS (
        SELECT 1 FROM document.comment_type
         WHERE code = NEW.context_type AND is_active
    )`,
      `IF NOT control.lookup_value_is_active(
        'document.comment_type', NEW.context_type, NEW.tenant_id
    )`,
    )
    .replace(
      `IF NOT EXISTS (
        SELECT 1 FROM document.comment_intent
         WHERE code = NEW.comment_intent
           AND is_active
           AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
    )`,
      `IF NOT control.lookup_value_is_active(
        'document.comment_intent', NEW.comment_intent, NEW.tenant_id
    )`,
    )
    .replace(
      `IF NOT EXISTS (
        SELECT 1 FROM document.reaction_type
         WHERE code = NEW.reaction_type
           AND is_active
           AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
    )`,
      `IF NOT control.lookup_value_is_active(
        'document.reaction_type', NEW.reaction_type, NEW.tenant_id
    )`,
    ));
}

await rewrite("server/packages/services/metadata/routes/lookup.route.ts", (source) => {
  const start = source.indexOf("      // Collaboration lookups are desired-state document-schema catalogs.");
  const end = source.indexOf("      // Domain header", start);
  if (start < 0 || end < 0) throw new Error("Metadata special-case markers missing");
  return `${source.slice(0, start)}${source.slice(end)}`;
});

console.log("Consolidated collaboration vocabularies into control.lookup_value.");
