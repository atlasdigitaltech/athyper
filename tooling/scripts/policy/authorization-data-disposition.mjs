#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");
const policyPath = resolve(
  repositoryRoot,
  "governance/config/governance/authorization-data-disposition-policy.v1.json",
);
const inventoryPath = resolve(
  repositoryRoot,
  "governance/config/governance/authorization-data-disposition-inventory.v1.json",
);
const markdownPath = resolve(
  repositoryRoot,
  "governance/policy/reports/authorization/inventories/authorization-data-disposition-inventory.md",
);
const ddlRoot = resolve(repositoryRoot, "server/db/ddl");
const checkOnly = process.argv.includes("--check");
const artifactsOnly = process.argv.includes("--artifacts-only");

const policy = JSON.parse(await readFile(policyPath, "utf8"));
const sqlFiles = await listFiles(ddlRoot, (path) => path.endsWith(".sql"));
const discovered = new Map();
const relationPatterns = [
  {
    objectKind: "table",
    pattern:
      /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)\s*\.\s*("?[\w]+"?)/gim,
  },
  {
    objectKind: "materialized_view",
    pattern:
      /\bCREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)\s*\.\s*("?[\w]+"?)/gim,
  },
  {
    objectKind: "foreign_table",
    pattern:
      /\bCREATE\s+FOREIGN\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)\s*\.\s*("?[\w]+"?)/gim,
  },
];

for (const absolutePath of sqlFiles) {
  const content = await readFile(absolutePath, "utf8");
  const scannable = stripSqlComments(content);
  for (const relationPattern of relationPatterns) {
    for (const match of scannable.matchAll(relationPattern.pattern)) {
      const schema = unquote(match[1]).toLowerCase();
      const table = unquote(match[2]).toLowerCase();
      if (schema.includes("%") || table.includes("%")) continue;
      const id = `${schema}.${table}`;
      const line = scannable.slice(0, match.index).split(/\r?\n/).length;
      const definition = {
        path: slash(relative(repositoryRoot, absolutePath)),
        line,
      };
      const current = discovered.get(id) ?? {
        id,
        schema,
        table,
        objectKind: relationPattern.objectKind,
        definitions: [],
      };
      if (current.objectKind !== relationPattern.objectKind) {
        throw new Error(
          `${id} is declared as both ${current.objectKind} and ${relationPattern.objectKind}.`,
        );
      }
      if (!current.definitions.some(
        (item) => item.path === definition.path && item.line === definition.line,
      )) {
        current.definitions.push(definition);
      }
      discovered.set(id, current);
    }
  }
}

const duplicateRuntimeRegistrations = [];
for (const [id, registration] of Object.entries(policy.runtimeTableOverrides ?? {})) {
  const [schema, table, ...extra] = id.split(".");
  if (
    !schema ||
    !table ||
    extra.length > 0 ||
    !/^[a-z][a-z0-9_]*$/.test(schema) ||
    !/^[a-z][a-z0-9_]*$/.test(table)
  ) {
    throw new Error(`Invalid runtime table id ${JSON.stringify(id)}.`);
  }
  if (
    typeof registration.definitionPath !== "string" ||
    registration.definitionPath.trim() === ""
  ) {
    throw new Error(`Runtime table ${id} requires definitionPath.`);
  }
  const definitionPath = resolve(repositoryRoot, registration.definitionPath);
  const relativeDefinitionPath = relative(repositoryRoot, definitionPath);
  if (
    relativeDefinitionPath === ".." ||
    relativeDefinitionPath.startsWith("../") ||
    relativeDefinitionPath.startsWith("..\\")
  ) {
    throw new Error(`Runtime table ${id} definitionPath escapes the repository.`);
  }
  await readFile(definitionPath, "utf8").catch(() => {
    throw new Error(
      `Runtime table ${id} definitionPath does not exist: ${registration.definitionPath}`,
    );
  });
  if (discovered.has(id)) {
    duplicateRuntimeRegistrations.push(id);
    continue;
  }
  discovered.set(id, {
    id,
    schema,
    table,
    objectKind: "table",
    definitions: [{
      path: slash(registration.definitionPath),
      line: null,
    }],
    runtimeRegistered: true,
  });
}

const unknownSchemas = [];
const tableRows = [...discovered.values()]
  .sort((left, right) => left.id.localeCompare(right.id))
  .map((object) => {
    const runtime = policy.runtimeTableOverrides?.[object.id];
    const exact = runtime
      ? {
          dataClass: runtime.dataClass,
          disposition: runtime.disposition,
          retention: runtime.retention,
          evidence: runtime.evidence,
        }
      : policy.tableOverrides[object.id];
    const fallback = policy.schemaDefaults[object.schema];
    if (!exact && !fallback) unknownSchemas.push(object.id);
    const decision = exact ?? fallback ?? {
      dataClass: "unknown",
      disposition: "unclassified",
      retention: "unclassified",
      evidence: "missing policy",
    };
    return {
      ...object,
      decisionSource: runtime
        ? "exact_runtime_table_override"
        : exact ? "exact_table_override" : fallback ? "schema_default" : "none",
      ...decision,
      approvalStatus: policy.approval.status,
    };
  });

const externalRows = [...policy.externalObjects]
  .sort((left, right) => left.id.localeCompare(right.id))
  .map((object) => ({
    ...object,
    approvalStatus: policy.approval.status,
  }));

const policyHash = sha256(canonicalJson(withoutApprovalVolatility(policy)));
const body = {
  schemaVersion: 1,
  policyId: policy.policyId,
  policyHash,
  source: slash(relative(repositoryRoot, policyPath)),
  summary: summarize(tableRows, externalRows),
  gates: {
    everyDiscoveredTableHasOneDisposition:
      unknownSchemas.length === 0 &&
      duplicateRuntimeRegistrations.length === 0 &&
      tableRows.every((row) => Boolean(row.disposition) && row.disposition !== "unclassified"),
    everyExternalObjectHasOneDisposition:
      externalRows.every((row) => Boolean(row.disposition)),
    allDispositionsApproved:
      policy.approval.status === "approved" &&
      approvalText(policy.approval.dataOwner) &&
      approvalText(policy.approval.securityApprover) &&
      approvalText(policy.approval.recordsRetentionApprover) &&
      approvalText(policy.approval.operationsApprover) &&
      approvalText(policy.approval.ticket) &&
      nonBlank(policy.approval.approvedAt) &&
      Number.isFinite(Date.parse(policy.approval.approvedAt)) &&
      Date.parse(policy.approval.approvedAt) <= Date.now() &&
      policy.approval.approvedPolicyHash === policyHash,
    unknownTables: unknownSchemas,
    duplicateRuntimeRegistrations,
    approvalStatus: policy.approval.status,
  },
  approval: policy.approval,
  tables: tableRows,
  externalObjects: externalRows,
  dynamicObjectFamilies: policy.dynamicObjectFamilies,
};
const inventory = `${JSON.stringify(body, null, 2)}\n`;
const markdown = renderMarkdown(body);

if (checkOnly) {
  const currentInventory = await readFile(inventoryPath, "utf8").catch(() => "");
  const currentMarkdown = await readFile(markdownPath, "utf8").catch(() => "");
  const failures = [];
  if (currentInventory !== inventory) failures.push(slash(relative(repositoryRoot, inventoryPath)));
  if (currentMarkdown !== markdown) failures.push(slash(relative(repositoryRoot, markdownPath)));
  if (!artifactsOnly && !body.gates.everyDiscoveredTableHasOneDisposition) {
    failures.push(`unclassified tables: ${unknownSchemas.join(", ")}`);
  }
  if (!artifactsOnly && duplicateRuntimeRegistrations.length > 0) {
    failures.push(
      `runtime table registrations also declared in DDL: ${duplicateRuntimeRegistrations.join(", ")}`,
    );
  }
  if (failures.length > 0) {
    process.stderr.write(
      `Authorization data-disposition drift:\n${failures.map((item) => `- ${item}`).join("\n")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Authorization disposition inventory is current (${tableRows.length} tables, ${externalRows.length} external objects).\n`,
    );
  }
} else {
  await writeFile(inventoryPath, inventory, "utf8");
  await writeFile(markdownPath, markdown, "utf8");
  process.stdout.write(
    `WROTE ${slash(relative(repositoryRoot, inventoryPath))} and ${slash(relative(repositoryRoot, markdownPath))}\n`,
  );
}

async function listFiles(root, predicate) {
  const files = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path, predicate));
    else if (entry.isFile() && predicate(path)) files.push(path);
  }
  return files.sort();
}

function unquote(value) {
  return value.replace(/^"|"$/g, "");
}

function stripSqlComments(value) {
  const withoutBlocks = value.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );
  return withoutBlocks.replace(/--[^\r\n]*/g, (comment) => " ".repeat(comment.length));
}

function slash(value) {
  return value.replaceAll("\\", "/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nonBlank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function approvalText(value) {
  return nonBlank(value) &&
    !/\b(?:tbd|todo|pending|unknown|unassigned|placeholder)\b/i.test(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function withoutApprovalVolatility(value) {
  const clone = structuredClone(value);
  clone.approval = {
    status: clone.approval.status,
    dataOwner: clone.approval.dataOwner,
    securityApprover: clone.approval.securityApprover,
    recordsRetentionApprover: clone.approval.recordsRetentionApprover,
    operationsApprover: clone.approval.operationsApprover,
  };
  return clone;
}

function summarize(tables, externalObjects) {
  const byDataClass = {};
  const byDisposition = {};
  for (const row of [...tables, ...externalObjects]) {
    byDataClass[row.dataClass] = (byDataClass[row.dataClass] ?? 0) + 1;
    byDisposition[row.disposition] = (byDisposition[row.disposition] ?? 0) + 1;
  }
  return {
    discoveredTables: tables.length,
    externalObjects: externalObjects.length,
    exactTableOverrides: tables.filter(
      (row) => row.decisionSource === "exact_table_override",
    ).length,
    exactRuntimeTableOverrides: tables.filter(
      (row) => row.decisionSource === "exact_runtime_table_override",
    ).length,
    schemaDefaultedTables: tables.filter(
      (row) => row.decisionSource === "schema_default",
    ).length,
    byDataClass: sortRecord(byDataClass),
    byDisposition: sortRecord(byDisposition),
  };
}

function sortRecord(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function renderMarkdown(inventory) {
  const lines = [
    "# Authorization Wave 0 data-disposition inventory",
    "",
    "> Generated by `node tooling/scripts/policy/authorization-data-disposition.mjs`.",
    "> Edit the policy, not this file.",
    "",
    `- Policy: \`${inventory.policyId}\``,
    `- Policy hash: \`${inventory.policyHash}\``,
    `- Approval: **${inventory.approval.status}**`,
    `- Cataloged database tables: ${inventory.summary.discoveredTables}`,
    `- Exact runtime-created table registrations: ${inventory.summary.exactRuntimeTableOverrides}`,
    `- External object stores/systems: ${inventory.summary.externalObjects}`,
    `- Unclassified tables: ${inventory.gates.unknownTables.length}`,
    "",
    "The checked-in inventory assigns one proposed disposition to every table",
    "discoverable in versioned DDL, every exactly registered runtime-created table,",
    "and every registered external object. Production",
    "use remains blocked until the named data, retention, security, and operations",
    "approvers change the policy status to `approved`, bind `approvedPolicyHash`",
    "to the generated policy hash, and a live `pg_class` overlay finds no extra",
    "or multiply classified runtime objects.",
    "",
    "## Summary by data class",
    "",
    "| Data class | Objects |",
    "| --- | ---: |",
    ...Object.entries(inventory.summary.byDataClass).map(
      ([name, count]) => `| ${name} | ${count} |`,
    ),
    "",
    "## Table dispositions",
    "",
    "| Table | Data class | Disposition | Decision source |",
    "| --- | --- | --- | --- |",
    ...inventory.tables.map(
      (row) =>
        `| \`${row.id}\` | ${row.dataClass} | ${row.disposition} | ${row.decisionSource} |`,
    ),
    "",
    "## External objects",
    "",
    "| Object | Data class | Disposition |",
    "| --- | --- | --- |",
    ...inventory.externalObjects.map(
      (row) => `| \`${row.id}\` | ${row.dataClass} | ${row.disposition} |`,
    ),
    "",
    "## Live-only coverage",
    "",
    "Runtime partitions and tenant/environment-created objects are discovered from",
    "`pg_class` by the live coverage report. A live object absent from this inventory",
    "has no fallback disposition and blocks the Wave 0 gate.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}
