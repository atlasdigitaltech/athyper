/** Disposable PostgreSQL qualification. No deployed target or credentials accepted. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { KyselyAtlasRunRepository } from "@athyper/server-platform-ai/kysely-run-repository";
import { KyselyAtlasThreadRepository } from "@athyper/server-platform-ai/kysely-thread-repository";
import { KyselyAtlasResponseFeedbackStore } from "@athyper/server-platform-ai/response-feedback";
import { atlasGuidance, parseAtlasIntent } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const dbRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../../../../db",
);
const token = randomUUID(),
  container = `athyper-atlas-f3-${token.slice(0, 8)}`;
if (process.argv.length > 2)
  throw Error("This test accepts no deployed target");
async function command(program: string, args: string[]) {
  return new Promise<string>((ok, fail) => {
    const child = spawn(program, args, {
      cwd: dbRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    child.stdout.on("data", (v) => (out += v));
    child.stderr.on("data", (v) => (err += v));
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0
        ? ok(out.trim())
        : fail(Error(`${program} failed: ${err.slice(-5000)}`)),
    );
  });
}
const docker = (...args: string[]) => command("docker", args);
let created = false;
try {
  await docker(
    "run",
    "-d",
    "--name",
    container,
    "--label",
    `athyper.atlas-f3=${token}`,
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16.13-bookworm",
  );
  created = true;
  for (let i = 0; ; i++) {
    try {
      await docker("exec", container, "pg_isready", "-U", "postgres");
      break;
    } catch (e) {
      if (i === 40) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const [inspection] = JSON.parse(await docker("inspect", container));
  assert.equal(inspection.Config.Labels["athyper.atlas-f3"], token);
  await docker(
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-c",
    "CREATE ROLE athyper_runtime NOLOGIN NOBYPASSRLS",
  );
  const port = Number(inspection.NetworkSettings.Ports["5432/tcp"][0].HostPort);
  for (const plane of ["neon", "mesh", "studio"] as const) {
    await command("pnpm", [
      "exec",
      "tsx",
      "scripts/provisioning/foundation-runner.ts",
      `--plane=${plane}`,
      `--container=${container}`,
    ]);
    console.log(`PASS ${plane}: fresh canonical foundation`);
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({
          host: "127.0.0.1",
          port,
          user: "postgres",
          database: `athyper_${plane}`,
          max: 2,
        }),
      }),
    });
    try {
      await sql`GRANT athyperapp TO athyper_runtime`.execute(db);
      // Reconstruct the immediately preceding shape, then prove the forward migration.
      await sql
        .raw(
          `ALTER TABLE ai.ai_feedback_log DROP CONSTRAINT ai_feedback_response_coordinate_fk, DROP CONSTRAINT ai_feedback_response_coordinate_chk, DROP COLUMN atlas_response_message_id, DROP COLUMN atlas_response_plane;
    ALTER TABLE ai.atlas_run DROP CONSTRAINT atlas_run_response_coordinate_uq;
    ALTER TABLE ai.ai_agent_run DROP CONSTRAINT ai_agent_run_guidance_chk, DROP CONSTRAINT ai_agent_run_aar_completed_usage_chk, DROP COLUMN guidance_code;
    ALTER TABLE ai.ai_agent_run ADD CONSTRAINT ai_agent_run_aar_completed_usage_chk CHECK(outcome<>'completed' OR usage_source='provider_final' OR (usage_source='unavailable' AND model_call_count=0 AND tool_call_count>0 AND resolved_provider_id IS NULL AND actual_model_id IS NULL));`,
        )
        .execute(db);
      await sql
        .raw(
          readFileSync(
            resolve(dbRoot, "scripts/operations/upgrades/legacy-baseline-20260914/20260910_atlas_intent_feedback.sql"),
            "utf8",
          ),
        )
        .execute(db);
      console.log(`PASS ${plane}: forward migration`);
      const tenantId = randomUUID(),
        principalId = randomUUID(),
        otherPrincipal = randomUUID();
      await sql`INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by) VALUES(${tenantId}::uuid,'atlas_f3','Atlas F3','Atlas F3',${plane},'active',${principalId}::uuid)`.execute(
        db,
      );
      for (const [id, code] of [
        [principalId, "f3_owner"],
        [otherPrincipal, "f3_other"],
      ])
        await sql`INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by) VALUES(${id}::uuid,${tenantId}::uuid,${code},${code},'user',${principalId}::uuid)`.execute(
          db,
        );
      const context: VerifiedRequestContext = {
        planeKey: plane,
        realmKey: plane,
        tenantId,
        principalId,
        authEpoch: 1,
        requestId: randomUUID(),
        profileHash: "test",
        permissions: {
          planeKey: plane,
          tenantId,
          principalId,
          principalFingerprint: "test",
          profileHash: "test",
          schemaHash: "test",
          resolvedAt: 1,
          allowed: [`${plane}.ai.agent.use`],
          denied: [],
          planLocked: [],
          planeExcluded: [],
          entries: [],
          authorizationScopes: [],
        },
      };
      const transactions = {
        async run<T>(
          selected: string,
          actor: { tenantId: string; principalId: string },
          work: (tx: any) => Promise<T>,
        ) {
          assert.equal(selected, plane);
          return db.transaction().execute(async (tx) => {
            await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
            await sql`SELECT set_config('app.current_tenant_id',${actor.tenantId},true),set_config('app.current_principal_id',${actor.principalId},true),set_config('app.database_plane',${plane},true)`.execute(
              tx,
            );
            return work(tx);
          });
        },
      };
      const threads = new KyselyAtlasThreadRepository(transactions),
        runs = new KyselyAtlasRunRepository(transactions),
        feedback = new KyselyAtlasResponseFeedbackStore(transactions);
      const threadId = randomUUID();
      await threads.create({
        context,
        threadId,
        title: "F3 synthetic",
        retention: {
          policyId: "test",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          purgeAfter: null,
          legalHold: false,
        },
      });
      const makeRun = async () => {
        const runId = randomUUID(),
          outputMessageId = randomUUID();
        await runs.begin({
          context,
          runId,
          threadId,
          clientRequestId: randomUUID(),
          inputMessageId: randomUUID(),
          outputMessageId,
          userContent: [{ type: "text", text: "synthetic clarification" }],
          publicModelId: "atlas-fast",
          bindingId: "test",
          bindingRevision: "1",
          policyRevision: "1",
          promptRevision: "1",
          startedAt: new Date().toISOString(),
          replayInput: {
            schemaVersion: 1,
            intent: parseAtlasIntent({
              schemaVersion: 1,
              kind: "clarify",
              strategy: "owner_scope",
              reason: "missing_scope",
              capabilityIds: [],
            }),
          },
        });
        return { runId, outputMessageId };
      };
      const completed = [];
      for (const guidance of [
        "ambiguous",
        "missing_scope",
        "access_denied",
      ] as const) {
        const run = await makeRun();
        await assert.rejects(
          runs.complete({
            context,
            runId: run.runId,
            assistantContent: [
              { type: "text", text: "Unverified arbitrary answer" },
            ],
            replayCompletion: { complete: true, reads: [], guidance },
            completedAt: new Date().toISOString(),
          }),
        );
        const result = await runs.complete({
          context,
          runId: run.runId,
          assistantContent: [{ type: "text", text: atlasGuidance[guidance] }],
          replayCompletion: { complete: true, reads: [], guidance },
          completedAt: new Date().toISOString(),
        });
        assert.equal(result?.status, "completed");
        const ledger = (
          await sql<any>`SELECT * FROM ai.ai_agent_run WHERE id=${run.runId}::uuid`.execute(
            db,
          )
        ).rows[0];
        assert.equal(ledger.guidance_code, guidance);
        assert.equal(ledger.model_call_count, 0);
        assert.equal(ledger.tool_call_count, 0);
        assert.equal(ledger.input_tokens, null);
        assert.equal(ledger.cost_amount, null);
        completed.push(run);
      }
      console.log(
        `PASS ${plane}: real repository zero-model completion and metering, arbitrary prose rejected`,
      );
      const run = completed[0]!;
      const input = {
        schemaVersion: 1,
        feedbackId: randomUUID(),
        runId: run.runId,
        messageId: run.outputMessageId,
        category: "intent",
        verdict: "wrong",
      } as const;
      await feedback.append(context, input);
      await feedback.append(context, input);
      assert.equal(
        Number(
          (
            await sql<any>`SELECT count(*) AS n FROM ai.ai_feedback_log WHERE id=${input.feedbackId}::uuid`.execute(
              db,
            )
          ).rows[0].n,
        ),
        1,
      );
      await assert.rejects(
        feedback.append(context, { ...input, verdict: "correct" }),
        { code: "IDEMPOTENCY_CONFLICT" },
      );
      await assert.rejects(
        feedback.append(context, {
          ...input,
          feedbackId: randomUUID(),
          messageId: completed[1]!.outputMessageId,
        }),
        { code: "PERMISSION_DENIED" },
      );
      await assert.rejects(
        feedback.append(
          {
            ...context,
            principalId: otherPrincipal,
            permissions: {
              ...context.permissions,
              principalId: otherPrincipal,
            },
          },
          { ...input, feedbackId: randomUUID() },
        ),
        { code: "PERMISSION_DENIED" },
      );
      const otherTenant = randomUUID();
      await assert.rejects(
        feedback.append(
          {
            ...context,
            tenantId: otherTenant,
            permissions: { ...context.permissions, tenantId: otherTenant },
          },
          { ...input, feedbackId: randomUUID() },
        ),
        { code: "PERMISSION_DENIED" },
      );
      await assert.rejects(
        sql`INSERT INTO ai.ai_feedback_log(tenant_id,feedback_type,target_id,atlas_response_message_id,atlas_response_plane,submitted_by,created_by) VALUES(${tenantId}::uuid,'atlas_agent',${run.runId}::uuid,${completed[1]!.outputMessageId}::uuid,${plane},${principalId}::uuid,${principalId}::uuid)`.execute(
          db,
        ),
        { code: "23503" },
      );
      console.log(
        `PASS ${plane}: typed feedback, duplicates, mismatched response, actor/tenant isolation and SQL foreign key`,
      );
    } finally {
      await db.destroy();
    }
  }
} finally {
  if (created) await docker("rm", "-f", container);
}
