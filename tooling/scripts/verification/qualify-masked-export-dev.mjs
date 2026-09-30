/** DEV-only shared Entity Framework disclosure qualification. No raw descriptor
 * or activation-head updates: draft import, independent enrollment and ordinary
 * publication execution remain separate recorded stages. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactDirectory } from "../artifact-paths.mjs";
import { maskedExportProduct } from "../../../server/apps/platform-host/scripts/qualification/masked-export-product.mjs";
const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const mode = process.argv[2];
const output = process.argv[3]
  ? resolve(process.argv[3])
  : artifactDirectory("masked-export-dev");
const save = (name, value) =>
  writeFileSync(
    join(output, name + ".json"),
    JSON.stringify(value, null, 2) + "\n",
    { mode: 0o600 },
  );
const read = (name) =>
  JSON.parse(readFileSync(join(output, name + ".json"), "utf8"));
const target = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
assert.equal(target.Config.Labels["com.docker.compose.project"], "athyper-dev");
assert.ok(target.State.Running);
mkdirSync(output, { recursive: true, mode: 0o700 });
if (mode === "prepare") {
  const product = maskedExportProduct(root);
  const directory = join(
    root,
    "metadata/products/shared/entities",
    product.definition.entity.entityCode,
  );
  assert.ok(
    !existsSync(directory),
    "Qualification must not overwrite an existing product directory",
  );
  save("product", product);
  mkdirSync(directory);
  try {
    writeFileSync(
      join(directory, "definition.json"),
      JSON.stringify(product, null, 2) + "\n",
    );
    const raw = execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "server/db/scripts/operations/publication/import-dev-reference-product.ts",
        `--product=${directory}`,
        "--confirm=DEV-IMPORT-ENTITY-DRAFT",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    const draft = JSON.parse(raw);
    save("draft", draft);
    assert.ok(draft.publicationPolicyCandidate);
    save("policy-candidate", draft.publicationPolicyCandidate);
    console.log(
      JSON.stringify({
        output,
        changeSetId: draft.publicationPolicyCandidate.changeSetId,
        stage: "draft-prepared",
        published: false,
      }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else if (mode === "catalog") {
  const receipts = [];
  for (const plane of ["studio", "neon", "mesh"]) {
    const input = `BEGIN;
      SELECT set_config('app.database_plane','${plane}',true);
      INSERT INTO authz.permission(canonical_code,permission_kind,module_id,risk_tier,metadata,status,created_by)
      SELECT '${plane}.foundation.principal_disclosure_probe.'||op,'entity_operation',module_id,'low',
        '{"source":"dev:masked-export-qualification:v1"}'::jsonb,'draft','00000000-0000-0000-0000-000000000000'
      FROM authz.permission CROSS JOIN (VALUES ('read'),('export')) AS operations(op) WHERE canonical_code='common.identity.principal.read' AND status='published'
      ON CONFLICT(canonical_code) DO NOTHING;
      DO $$ BEGIN IF (SELECT count(*) FROM authz.permission WHERE canonical_code IN ('${plane}.foundation.principal_disclosure_probe.read','${plane}.foundation.principal_disclosure_probe.export')
        AND permission_kind='entity_operation' AND metadata='{"source":"dev:masked-export-qualification:v1"}'::jsonb) <> 2 THEN RAISE EXCEPTION 'Probe permission identity mismatch'; END IF; END $$;
      INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,created_by)
      SELECT id,'tenant','exact','00000000-0000-0000-0000-000000000000' FROM authz.permission WHERE canonical_code IN ('${plane}.foundation.principal_disclosure_probe.read','${plane}.foundation.principal_disclosure_probe.export')
      ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
      UPDATE authz.permission SET status='published',updated_by='00000000-0000-0000-0000-000000000000',status_changed_by='00000000-0000-0000-0000-000000000000'
      WHERE canonical_code IN ('${plane}.foundation.principal_disclosure_probe.read','${plane}.foundation.principal_disclosure_probe.export') AND status='draft';
      COMMIT;`;
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-dev-db-1",
        "sh",
        "-c",
        `exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_${plane} -v ON_ERROR_STOP=1`,
      ],
      { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    receipts.push({ plane, permissions: 2, grants: 0 });
  }
  save("catalog", { receipts });
  console.log(JSON.stringify({ output, stage: "catalog", receipts }));
} else if (mode === "propose" || mode === "activate") {
  const role = mode === "propose" ? "admin" : "owner";
  const session = JSON.parse(
    readFileSync(
      join(
        homedir(),
        `.athyper/instances/dev/secrets/control-api/login/platform.${role}.json`,
      ),
      "utf8",
    ),
  );
  const claims = JSON.parse(
    Buffer.from(session.accessToken.split(".")[1], "base64url"),
  );
  assert.ok(
    claims.exp * 1000 > Date.now(),
    "Refresh the control-plane session through password/OTP sign-in",
  );
  const pin = mode === "activate" ? read("policy-proposed") : undefined;
  const response = await fetch(
    "https://api.dev.athyper.test/api/studio/publication-policies" +
      (pin ? `/${pin.id}/activate` : ""),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "x-plane": "studio",
        "content-type": "application/json",
      },
      body: JSON.stringify(
        pin ? { expectedHash: pin.hash } : read("policy-candidate"),
      ),
    },
  );
  const body = await response.json();
  save(mode === "propose" ? "policy-proposed" : "policy-active", {
    ...body,
    httpStatus: response.status,
  });
  assert.equal(response.status, 200, JSON.stringify(body));
  console.log(JSON.stringify({ output, stage: mode, ...body }));
} else if (mode === "execute") {
  const pin = read("policy-active");
  const workload = JSON.parse(
    readFileSync(
      join(
        homedir(),
        ".athyper/instances/dev/secrets/dev-publication-athyper/client.json",
      ),
      "utf8",
    ),
  );
  const response = await fetch(
    `https://api.dev.athyper.test/api/studio/publication-policies/${pin.id}/execute`,
    {
      method: "POST",
      headers: {
        "x-plane": "studio",
        "content-type": "application/json",
        "x-publication-author": workload.author,
        "x-publication-publisher": workload.publisher,
      },
      body: JSON.stringify({ version: pin.version, expectedHash: pin.hash }),
    },
  );
  const body = await response.json();
  save("execution", { ...body, httpStatus: response.status });
  assert.equal(response.status, 200, JSON.stringify(body));
  console.log(JSON.stringify({ output, stage: "executed", ...body }));
} else
  throw Error(
    "Use prepare | propose | activate | execute [artifact directory]",
  );
