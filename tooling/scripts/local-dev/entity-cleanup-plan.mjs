/** Read-only row disposition planning. Does not authorize or execute deletion. */
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const permittedEvidence = new Set([
  "snapshot.entity_contract_revision",
  "snapshot.entity_contract_test_run",
  "snapshot.entity_numbering_test_artifact",
  "snapshot.entity_release_artifact",
  "snapshot.entity_draft_save",
  "publication.entity_release_link",
  "publication.entity_baseline_release_link",
  "publication.entity_authorization_successor_link",
  "publication.entity_runtime_restoration_link",
  "entity_command_private.operation_bootstrap_source",
]);
export function validateCleanupScope(scope) {
  if (
    !scope ||
    Object.keys(scope).sort().join() !== "database,entityIds,purpose" ||
    scope.database !== "athyper_studio" ||
    typeof scope.purpose !== "string" ||
    !scope.purpose.trim() ||
    !Array.isArray(scope.entityIds) ||
    !scope.entityIds.length ||
    scope.entityIds.length > 32 ||
    scope.entityIds.some((id) => typeof id !== "string" || !uuid.test(id)) ||
    new Set(scope.entityIds).size !== scope.entityIds.length
  )
    throw Error("CLEANUP_SCOPE_INVALID");
  return structuredClone(scope);
}
export function candidateTable(schema, table) {
  return (
    (schema === "metadata" &&
      table.startsWith("entity_") &&
      table !== "entity_class_profile") ||
    permittedEvidence.has(`${schema}.${table}`)
  );
}
/** Ports return primary-key tuples only. Following inbound edges never invents
 * parent rows or pulls an entire publication ledger into the delete scope. */
export async function buildCleanupPlan(input, port) {
  const scope = validateCleanupScope(input);
  const edges = await port.edges();
  const tables = new Map(),
    queue = [],
    blockers = [];
  let total = 0,
    steps = 0;
  function add(schema, table, rows, reason) {
    const name = `${schema}.${table}`;
    const entry = tables.get(name) ?? {
      schema,
      table,
      disposition: "candidate-remove",
      keys: new Map(),
      reasons: new Set(),
    };
    entry.reasons.add(reason);
    const added = [];
    for (const row of rows) {
      if (
        !Array.isArray(row) ||
        !row.length ||
        row.some((v) => v === null || typeof v === "object")
      )
        throw Error("CLEANUP_PRIMARY_KEY_INVALID");
      const key = JSON.stringify(row);
      if (!entry.keys.has(key)) {
        entry.keys.set(key, row);
        added.push(row);
        total++;
      }
    }
    if (total > 50000) throw Error("CLEANUP_ROW_BUDGET_EXCEEDED");
    if (entry.keys.size) tables.set(name, entry);
    if (added.length) queue.push({ schema, table, keys: added });
  }
  for (const table of [
    "entity_change_set",
    "entity_release",
    "entity_field_identity",
  ])
    add(
      "metadata",
      table,
      await port.roots(table, scope.entityIds),
      "explicit product-entity reset scope",
    );
  while (queue.length) {
    if (++steps > 4096) throw Error("CLEANUP_TRAVERSAL_BUDGET_EXCEEDED");
    const target = queue.shift();
    for (const edge of edges.filter(
      (e) => e.targetSchema === target.schema && e.targetTable === target.table,
    )) {
      const matches = await port.children(edge, target.keys);
      const foreign = matches.filter((row) => row.scoped !== true);
      if (foreign.length)
        blockers.push({
          code: "DEPENDENT_OUTSIDE_RESET_SCOPE",
          table: `${edge.sourceSchema}.${edge.sourceTable}`,
          constraint: edge.name,
          keys: foreign.map((row) => row.key),
        });
      const rows = matches
        .filter((row) => row.scoped === true)
        .map((row) => row.key);
      if (!rows.length) continue;
      if (!candidateTable(edge.sourceSchema, edge.sourceTable)) {
        blockers.push({
          code: "PRESERVED_DEPENDENT_REFERENCES_RESET_ROW",
          constraint: edge.name,
          table: `${edge.sourceSchema}.${edge.sourceTable}`,
          keys: rows,
          target: `${target.schema}.${target.table}`,
          targetKeys: target.keys,
        });
        continue;
      }
      add(edge.sourceSchema, edge.sourceTable, rows, edge.name);
    }
  }
  return {
    schema: "entity.local-cleanup-plan/1",
    scope,
    executable: false,
    preserves: [
      "metadata.entity roots",
      "all rows outside candidate closure",
      "IAM/business data",
      "applied migration history",
    ],
    tables: [...tables.values()]
      .map((t) => ({
        ...t,
        keys: [...t.keys.values()],
        reasons: [...t.reasons].sort(),
      }))
      .sort((a, b) =>
        `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`),
      ),
    candidateRows: total,
    blockers,
    outstanding: [
      "logical publication/resource/activation dependency dispositions",
      "fresh complete graphs and production startup",
      "current quiesced backup/restore evidence",
      "final schema and grants installation",
    ],
    // FK reachability is not authority to remove unrelated evidence. A fresh
    // quiesced plan and reviewed logical scope are required by any future writer.
  };
}
