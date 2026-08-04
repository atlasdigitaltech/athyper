import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(scriptDir, "../..");
const ddlRoot = resolve(dbRoot, "ddl");

const commonTables = new Set([
  "ai_action_policy",
  "ai_confidence_threshold",
  "ai_drift_baseline",
  "atlas_conversation_retention_policy",
  "atlas_tenant_provider_credential",
  "atlas_tenant_provider_credential_epoch",
  "ai_tool_invocation",
  "atlas_run",
  "ai_agent_call",
  "ai_agent_run",
  "ai_calibration_log",
  "ai_call_transcript",
  "ai_call_transcript_default",
  "ai_feedback_log",
  "ai_inference_log",
  "ai_monitoring_log",
  "atlas_knowledge_chunk",
  "atlas_knowledge_revision",
  "atlas_knowledge_source",
  "atlas_message",
  "atlas_thread",
]);

const adminTables = new Set([
  "atlas_support_session",
]);

const sources = {
  "03_tables.sql": ["control/01_tables.sql", "event/01_tables.sql", "log/01_tables.sql", "master/01_tables.sql"],
  "05_constraints.sql": ["control/03_constraints.sql", "event/03_constraints.sql", "log/03_constraints.sql", "master/03_constraints.sql"],
  "06_indexes.sql": ["control/04_indexes.sql", "event/04_indexes.sql", "log/04_indexes.sql", "master/04_indexes.sql"],
  "07_functions.sql": ["control/02_pre_constraint.sql", "control/05_functions.sql", "event/02_pre_constraint.sql", "event/05_functions.sql", "log/02_pre_constraint.sql", "log/05_functions.sql", "master/02_pre_constraint.sql", "master/05_functions.sql"],
  "08_triggers.sql": ["control/06_triggers.sql", "event/06_triggers.sql", "log/06_triggers.sql", "master/06_triggers.sql"],
  "10_rls.sql": ["control/08_rls.sql", "event/08_rls.sql", "log/08_rls.sql", "master/08_rls.sql"],
  "11_grants.sql": ["control/08_rls.sql", "event/08_rls.sql", "log/08_rls.sql", "master/08_rls.sql"],
};

function splitSql(source) {
  const statements = [];
  let start = 0;
  let quote = null;
  let dollar = null;
  let lineComment = false;
  let blockDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (c === "\n") lineComment = false;
      continue;
    }
    if (blockDepth > 0) {
      if (c === "/" && next === "*") { blockDepth += 1; i += 1; }
      else if (c === "*" && next === "/") { blockDepth -= 1; i += 1; }
      continue;
    }
    if (dollar) {
      if (source.startsWith(dollar, i)) {
        i += dollar.length - 1;
        dollar = null;
      }
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (next === quote) i += 1;
        else quote = null;
      }
      continue;
    }
    if (c === "-" && next === "-") { lineComment = true; i += 1; continue; }
    if (c === "/" && next === "*") { blockDepth = 1; i += 1; continue; }
    if (c === "'" || c === "\"") { quote = c; continue; }
    if (c === "$") {
      const match = source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) { dollar = match[0]; i += dollar.length - 1; continue; }
    }
    if (c === ";") {
      const statement = source.slice(start, i + 1).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function qualifiedTablePattern(tables) {
  const names = [...tables].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(?:(?:control|event|log|master)[.]|"(?:control|event|log|master)"[.]"?)(?:${names})"?\\b`, "i");
}

function functionIdentity(statement) {
  const match = statement.match(/CREATE(?: OR REPLACE)? FUNCTION\s+(?:"?([a-z_][a-z0-9_]*)"?[.])"?([a-z_][a-z0-9_]*)"?\s*\(([^)]*)\)/i);
  return match ? { schema: match[1], name: match[2], args: match[3] } : null;
}

function referencedFunctions(statement) {
  const refs = new Set();
  for (const match of statement.matchAll(/\b(?:FUNCTION|PROCEDURE)\s+"?([a-z_][a-z0-9_]*)"?[.]"?([a-z_][a-z0-9_]*)"?\s*\(/gi)) {
    refs.add(`${match[1]}.${match[2]}`);
  }
  return refs;
}

function transform(statement, movedFunctions) {
  let result = statement;
  for (const table of new Set([...commonTables, ...adminTables])) {
    result = result
      .replaceAll(`"${table}"`, `"${table}"`)
      .replace(new RegExp(`\\b(?:control|event|log|master)[.]${table}\\b`, "g"), `ai.${table}`)
      .replace(new RegExp(`"(?:control|event|log|master)"[.]"${table}"`, "g"), `"ai"."${table}"`);
  }
  result = result
    .replace(/\bmaster[.]conversation_participant\b/g, "document.conversation_participant")
    .replace(/"master"[.]"conversation_participant"/g, "\"document\".\"conversation_participant\"")
    .replace(/\bmaster[.]conversation\b/g, "document.conversation")
    .replace(/"master"[.]"conversation"/g, "\"document\".\"conversation\"");
  result = result.replace(
    /(SET search_path TO 'pg_catalog', )'(?:control|event|log|master)'/g,
    "$1'ai'",
  );
  for (const identity of movedFunctions) {
    const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result
      .replace(new RegExp(`\\b${escaped}\\b`, "g"), `ai.${identity.split(".")[1]}`)
      .replace(new RegExp(`"${escaped.replace(".", "\"[.]\"")}"`, "g"), `"ai"."${identity.split(".")[1]}"`);
  }
  result = result
    .replace(/\blog[.]trg_prevent_mutation\b/g, "ai.trg_prevent_mutation")
    .replace(/"log"[.]"trg_prevent_mutation"/g, "\"ai\".\"trg_prevent_mutation\"");
  const tableMatch = result.match(/ALTER TABLE(?: ONLY)?\s+"?ai"?[.]"?([a-z_][a-z0-9_]*)"?/i);
  const constraintMatch = result.match(/ADD CONSTRAINT\s+"?([a-z_][a-z0-9_]*)"?/i);
  const qualifiedConstraintName = tableMatch && constraintMatch
    ? `${tableMatch[1]}_${constraintMatch[1]}`
    : null;
  if (
    qualifiedConstraintName
    && !constraintMatch[1].startsWith(`${tableMatch[1]}_`)
    && Buffer.byteLength(qualifiedConstraintName, "utf8") <= 63
  ) {
    result = result.replace(
      constraintMatch[0],
      `ADD CONSTRAINT "${qualifiedConstraintName}"`,
    );
  }
  const indexMatch = result.match(
    /CREATE(?: UNIQUE)? INDEX\s+"?([a-z_][a-z0-9_]*)"?\s+ON\s+"?ai"?[.]"?([a-z_][a-z0-9_]*)"?/i,
  );
  const qualifiedIndexName = indexMatch
    ? `${indexMatch[2]}_${indexMatch[1]}`
    : null;
  if (
    qualifiedIndexName
    && !indexMatch[1].startsWith(`${indexMatch[2]}_`)
    && Buffer.byteLength(qualifiedIndexName, "utf8") <= 63
  ) {
    result = result.replace(
      indexMatch[0],
      indexMatch[0].replace(indexMatch[1], qualifiedIndexName),
    );
  }
  return result;
}

async function loadStatements(paths) {
  const all = [];
  for (const path of paths) {
    const content = await readFile(resolve(ddlRoot, path), "utf8");
    all.push(...splitSql(content));
  }
  return all;
}

async function build(targetTables, outputRoot, includeAdmin) {
  const tablePattern = qualifiedTablePattern(targetTables);
  const layerStatements = {};
  const allFunctions = new Map();
  for (const path of sources["07_functions.sql"]) {
    for (const statement of await loadStatements([path])) {
      const identity = functionIdentity(statement);
      if (identity) allFunctions.set(`${identity.schema}.${identity.name}`, statement);
    }
  }

  const selectedFunctions = new Set();
  for (const [layer, paths] of Object.entries(sources)) {
    const statements = await loadStatements(paths);
    layerStatements[layer] = statements.filter((statement) => {
      if (layer === "10_rls.sql" && /^\s*GRANT\b/i.test(statement)) return false;
      if (layer === "11_grants.sql" && !/^\s*(?:GRANT|REVOKE)\b/i.test(statement)) return false;
      return tablePattern.test(statement);
    });
    for (const statement of layerStatements[layer]) {
      for (const ref of referencedFunctions(statement)) selectedFunctions.add(ref);
      const identity = functionIdentity(statement);
      if (identity) selectedFunctions.add(`${identity.schema}.${identity.name}`);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const identity of [...selectedFunctions]) {
      const definition = allFunctions.get(identity);
      if (!definition) continue;
      for (const ref of referencedFunctions(definition)) {
        if (!selectedFunctions.has(ref) && allFunctions.has(ref)) {
          selectedFunctions.add(ref);
          changed = true;
        }
      }
    }
  }
  if (!includeAdmin) {
    for (const identity of [
      "master.fn_is_atlas_conversation",
      "master.trg_guard_atlas_conversation_mutation",
      "master.trg_guard_atlas_participant_insert",
      "master.trg_guard_atlas_participant_mutation",
    ]) {
      selectedFunctions.add(identity);
    }
  }

  const functionDefinitions = [...selectedFunctions]
    .map((identity) => allFunctions.get(identity))
    .filter(Boolean);
  layerStatements["07_functions.sql"] = [...new Set([
    ...layerStatements["07_functions.sql"],
    ...functionDefinitions,
  ])];

  if (!includeAdmin) {
    const adminPattern = qualifiedTablePattern(adminTables);
    for (const layer of Object.keys(layerStatements)) {
      layerStatements[layer] = layerStatements[layer].filter((statement) => !adminPattern.test(statement));
    }
  }

  await mkdir(outputRoot, { recursive: true });
  if (!includeAdmin) {
    await writeFile(resolve(outputRoot, "00_schema.sql"), [
      "-- Common Atlas AI bounded-context schema.",
      "CREATE SCHEMA ai;",
      "",
    ].join("\n"));
  }

  const movedFunctions = [...selectedFunctions].filter((identity) => allFunctions.has(identity));
  for (const [layer, statements] of Object.entries(layerStatements)) {
    let transformedStatements = [...new Set(statements)]
      .map((statement) => transform(statement, movedFunctions));
    if (includeAdmin && layer === "03_tables.sql") {
      transformedStatements = transformedStatements.map((statement) =>
        statement.replace(
          '"shadow_relationship_id" uuid NOT NULL,',
          '"shadow_membership_id" uuid NOT NULL,',
        ));
    }
    if (includeAdmin && layer === "05_constraints.sql") {
      transformedStatements = transformedStatements.map((statement) => {
        if (
          /ALTER TABLE ONLY\s+"?ai"?[.]"?atlas_support_session"?/i.test(statement)
          && /FOREIGN KEY \(shadow_relationship_id\)/i.test(statement)
        ) {
          return [
            'ALTER TABLE ONLY "ai"."atlas_support_session"',
            '  ADD CONSTRAINT "atlas_support_session_shadow_membership_fk"',
            "  FOREIGN KEY (target_tenant_id, shadow_principal_id, shadow_membership_id)",
            "  REFERENCES authz.plane_membership(tenant_id, principal_id, id)",
            "  ON DELETE RESTRICT;",
          ].join("\n");
        }
        return statement;
      });
    }
    if (!includeAdmin && layer === "05_constraints.sql") {
      transformedStatements = transformedStatements.map((statement) => statement
        .replace(
          "FOREIGN KEY (revision_id) REFERENCES ai.atlas_knowledge_revision(id)",
          "FOREIGN KEY (tenant_id, revision_id) REFERENCES ai.atlas_knowledge_revision(tenant_id, id)",
        )
        .replace(
          "FOREIGN KEY (source_id) REFERENCES ai.atlas_knowledge_source(id)",
          "FOREIGN KEY (tenant_id, source_id) REFERENCES ai.atlas_knowledge_source(tenant_id, id)",
        ));

      // Checks and foreign keys declared on a partitioned parent must propagate
      // to every partition. PostgreSQL rejects ALTER TABLE ONLY for these.
      // The propagated constraints make the extracted child copies redundant;
      // keep child-local keys such as the partition primary key.
      transformedStatements = transformedStatements
        .filter((statement) =>
          !(
            /ALTER TABLE ONLY\s+"?ai"?[.]"?ai_call_transcript_default"?/i.test(statement)
            && /\b(?:CHECK|FOREIGN KEY)\b/i.test(statement)
          ))
        .map((statement) => {
          if (
            /ALTER TABLE ONLY\s+"?ai"?[.]"?ai_call_transcript"?/i.test(statement)
            && /\b(?:CHECK|FOREIGN KEY)\b/i.test(statement)
          ) {
            return statement.replace(
              /ALTER TABLE ONLY(\s+"?ai"?[.]"?ai_call_transcript"?)/i,
              "ALTER TABLE$1",
            );
          }
          return statement;
        });

      transformedStatements.push(
        [
        "ALTER TABLE ONLY ai.atlas_knowledge_source",
        "  ADD CONSTRAINT atlas_knowledge_source_tenant_id_uq UNIQUE (tenant_id, id);",
        ].join("\n"),
        [
        "ALTER TABLE ONLY ai.atlas_knowledge_revision",
        "  ADD CONSTRAINT atlas_knowledge_revision_tenant_id_uq UNIQUE (tenant_id, id);",
        ].join("\n"),
      );

      // Source schemas are merged into ai. A foreign key from an earlier source
      // can reference a unique key declared by a later source, so emit every
      // non-FK constraint before any FK constraint.
      transformedStatements.sort((left, right) =>
        Number(/\bFOREIGN KEY\b/i.test(left)) - Number(/\bFOREIGN KEY\b/i.test(right)));
    }
    let body = transformedStatements.join("\n\n");
    if (!includeAdmin && layer === "10_rls.sql") {
      body += [
        "",
        "ALTER TABLE ai.ai_call_transcript_default ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE ai.ai_call_transcript_default FORCE ROW LEVEL SECURITY;",
      ].join("\n");
    }
    if (!includeAdmin && layer === "08_triggers.sql") {
      body += [
        "",
        "CREATE TRIGGER trg_conversation_atlas_mutation_guard",
        "BEFORE UPDATE ON document.conversation",
        "FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_atlas_conversation_mutation();",
        "",
        "CREATE CONSTRAINT TRIGGER trg_conversation_participant_atlas_cursor_check",
        "AFTER INSERT OR UPDATE ON document.conversation_participant",
        "DEFERRABLE INITIALLY DEFERRED",
        "FOR EACH ROW EXECUTE FUNCTION ai.trg_validate_atlas_participant_cursor();",
        "",
        "CREATE TRIGGER trg_conversation_participant_atlas_insert_guard",
        "BEFORE INSERT ON document.conversation_participant",
        "FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_atlas_participant_insert();",
        "",
        "CREATE TRIGGER trg_conversation_participant_atlas_mutation_guard",
        "BEFORE UPDATE ON document.conversation_participant",
        "FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_atlas_participant_mutation();",
      ].join("\n");
    }
    if (!includeAdmin && layer === "11_grants.sql") {
      body = [
        "REVOKE ALL ON SCHEMA ai FROM PUBLIC;",
        "GRANT USAGE ON SCHEMA ai TO athyperapp, athyperadmin;",
        "",
        body,
      ].join("\n");
    }
    if (includeAdmin && layer === "11_grants.sql") {
      body = [
        "GRANT USAGE ON SCHEMA ai TO athyperadmin_atlas_maintenance;",
        "",
        body,
      ].join("\n");
    }
    await writeFile(resolve(outputRoot, layer), [
      "-- Generated from the extracted live Atlas AI contract.",
      "-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs",
      "",
      body,
      "",
    ].join("\n"));
  }
}

await build(commonTables, resolve(ddlRoot, "common/ai"), false);
await build(adminTables, resolve(ddlRoot, "planes/athyper/ai"), true);
