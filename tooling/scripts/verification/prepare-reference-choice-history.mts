/** Read-only DEV graph preparation; no authoring or publication writes. */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { KyselyMetaEntityAuthoringRepository } from "../../../server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.js";
import {
  sha256,
  validateGraph,
  compileGraph,
  runContractTests,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { withBusinessPartnerReferenceHistory } from "../../../server/db/scripts/provisioning/business-partner-data-surfaces.js";
const require = createRequire(
  new URL("../../../server/apps/platform-host/package.json", import.meta.url),
);
const { Kysely, PostgresDialect } = require("kysely");
const client = {
  release() {},
  async query(query: string, parameters: unknown[] = []) {
    if (!/^SELECT\s/i.test(query)) throw Error("Read-only preparation");
    const sql = query.replace(/\$(\d+)/g, (_, n) => {
      const value = parameters[Number(n) - 1];
      if (typeof value !== "string") throw Error("String parameter required");
      return "'" + value.replaceAll("'", "''") + "'";
    });
    const raw = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-dev-db-1",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "athyper_studio",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: `SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM (${sql}) q;`,
        encoding: "utf8",
      },
    );
    return { rows: JSON.parse(raw) };
  },
};
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: { connect: async () => client, end: async () => {} },
  }),
});
const repo = new KyselyMetaEntityAuthoringRepository(db);
const id = "be767e01-f36d-434f-91f3-67bff689a367";
const before = await repo.get(id);
const graph = await repo.loadGraph(id);
const after = await repo.get(id);
if (!before || before.revision !== after?.revision)
  throw Error("Graph changed during preparation");
const upgraded = withBusinessPartnerReferenceHistory(graph);
const validation = validateGraph(upgraded),
  tests = runContractTests(upgraded),
  compiled = compileGraph(upgraded);
if (validation.issues.length || !tests.passed)
  throw Error(JSON.stringify({ issues: validation.issues, tests }));
const changes =
  upgraded.surfaceFieldBindings?.flatMap((b, i) =>
    JSON.stringify(b) !== JSON.stringify(graph.surfaceFieldBindings?.[i])
      ? [{ id: b.id, fieldKey: b.fieldKey, lookup: b.displayConfig?.lookup }]
      : [],
  ) ?? [];
const root = join(homedir(), ".athyper/qualification/reference-choice-history");
mkdirSync(root, { recursive: true, mode: 0o700 });
writeFileSync(
  join(root, "before.json"),
  JSON.stringify(graph, null, 2) + "\n",
  { mode: 0o600 },
);
writeFileSync(
  join(root, "prepared.json"),
  JSON.stringify(upgraded, null, 2) + "\n",
  { mode: 0o600 },
);
const path =
  "governance/policy/reports/reference-choice-history-activation.dev.json";
const receipt = JSON.parse(readFileSync(path, "utf8"));
receipt.metadata = {
  status: "prepared_pending_studio_authentication",
  changeSetId: id,
  expectedRevision: before.revision,
  beforeHash: sha256(graph),
  contractHash: compiled.contractHash,
  changes,
  validationPassed: true,
  contractTestsPassed: true,
  preparedGraph: join(root, "prepared.json"),
};
writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt.metadata, null, 2));
await db.destroy();
