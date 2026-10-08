import {
  candidateTable,
  validateCleanupScope,
} from "./entity-cleanup-plan.mjs";
const ident = (v) => '"' + v.replaceAll('"', '""') + '"';
const literal = (v) => "'" + v.replaceAll("'", "''") + "'";
/** Scoped local disposal only. Preserve roots, all nonselected rows and every FK.
 * User triggers are restored inside the same table-locked transaction. */
export function scopedNativeResetSql(plan, primaryKeys, triggers, database) {
  validateCleanupScope(plan.scope);
  if (
    plan.blockers.length ||
    !plan.tables.length ||
    !/^athyper_studio$|^entity_restore_[a-f0-9]{30,32}$/.test(database)
  )
    throw Error("LOCAL_RESET_SCOPE_NOT_READY");
  const entries = plan.tables.map((t) => {
    if (!candidateTable(t.schema, t.table) || !t.keys.length)
      throw Error("LOCAL_RESET_TABLE_INVALID");
    const columns = primaryKeys.find(
      (k) => k.schema === t.schema && k.table === t.table,
    )?.columns;
    if (!columns?.length || t.keys.some((k) => k.length !== columns.length))
      throw Error("LOCAL_RESET_KEYS_INVALID");
    const table = ident(t.schema) + "." + ident(t.table);
    const tuple =
      "jsonb_build_array(" +
      columns.map((c) => ident(c) + "::text").join(",") +
      ")";
    const keys = literal(JSON.stringify(t.keys)) + "::jsonb";
    return {
      table,
      scope: `${tuple} IN (SELECT value FROM jsonb_array_elements(${keys}))`,
      count: t.keys.length,
    };
  });
  const names = new Set(plan.tables.map((t) => t.schema + "." + t.table));
  const guarded = triggers.filter((t) => names.has(t.schema + "." + t.table));
  if (guarded.some((t) => !["O", "A"].includes(t.enabled)))
    throw Error("LOCAL_RESET_DISABLED_PREDECESSOR_GUARD");
  const statements = entries
    .map((e) => `DELETE FROM ${e.table} WHERE ${e.scope}`)
    .map(literal)
    .join(",");
  const change = entries.find(
    (e) => e.table === '"metadata"."entity_change_set"',
  );
  if (!change) throw Error("LOCAL_RESET_CHANGESETS_REQUIRED");
  const revisions = entries.find(
    (e) => e.table === '"snapshot"."entity_contract_revision"',
  );
  return `SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $reset$ BEGIN IF current_database()<>${literal(database)} THEN RAISE EXCEPTION 'LOCAL_RESET_DATABASE_MISMATCH'; END IF; END $reset$;
${entries.map((e) => `LOCK TABLE ${e.table} IN ACCESS EXCLUSIVE MODE;`).join("\n")}
${entries.map((e) => `DO $count$ BEGIN IF (SELECT count(*) FROM ${e.table} WHERE ${e.scope})<>${e.count} THEN RAISE EXCEPTION 'LOCAL_RESET_ROWS_CHANGED'; END IF; END $count$;`).join("\n")}
${guarded.map((t) => `ALTER TABLE ${ident(t.schema)}.${ident(t.table)} DISABLE TRIGGER ${ident(t.name)};`).join("\n")}
-- Break only the legacy draft/release cycle on rows which are about to be discarded.
UPDATE ${change.table} SET base_release_id=NULL,parent_change_set_id=NULL WHERE ${change.scope};
${revisions ? `UPDATE ${revisions.table} SET base_release_id=NULL WHERE ${revisions.scope};` : ""}
DO $delete$ DECLARE commands text[]:=ARRAY[${statements}]; pending text[]; command text; progressed boolean; failed_constraint text; errors text[]; BEGIN
 LOOP pending:=ARRAY[]::text[];errors:=ARRAY[]::text[];progressed:=false;
 FOREACH command IN ARRAY commands LOOP
  BEGIN EXECUTE command; progressed:=true;
  EXCEPTION WHEN foreign_key_violation THEN GET STACKED DIAGNOSTICS failed_constraint=CONSTRAINT_NAME; errors:=array_append(errors,failed_constraint); pending:=array_append(pending,command); END;
 END LOOP;
 IF cardinality(pending)=0 THEN EXIT; END IF;
 IF NOT progressed THEN RAISE EXCEPTION 'LOCAL_RESET_UNRESOLVED_FK_DEPENDENCY:%',errors; END IF;
 commands:=pending;
 END LOOP;
END $delete$;
SET CONSTRAINTS ALL IMMEDIATE;
${entries.map((e) => `DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM ${e.table} WHERE ${e.scope}) THEN RAISE EXCEPTION 'LOCAL_RESET_ROWS_REMAIN'; END IF; END $empty$;`).join("\n")}
${guarded.map((t) => `ALTER TABLE ${ident(t.schema)}.${ident(t.table)} ENABLE ${t.enabled === "A" ? "ALWAYS " : ""}TRIGGER ${ident(t.name)};`).join("\n")}`;
}
