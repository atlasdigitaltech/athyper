#!/usr/bin/env tsx
/**
 * Behavioral Phase 7C governed-tool RLS and lifecycle verification.
 *
 * Requires a privileged DATABASE_URL for rolled-back fixture setup and a
 * NOBYPASSRLS RLS_APP_ROLE (normally athyperapp_test) for actual assertions.
 */

import postgres from "postgres";

const databaseUrl = process.env["DATABASE_URL"];
const appRole = process.env["RLS_APP_ROLE"]?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
if (!appRole || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(appRole)) {
  throw new Error(
    "A safe RLS_APP_ROLE is required; Atlas tool verification never runs as a bypass role",
  );
}

type Transaction = postgres.TransactionSql;
type Plane = "neon" | "mesh" | "admin";

type RunFixture = {
  threadId: string;
  runId: string;
};

const INPUT_HASH = "1".repeat(64);
const RESULT_HASH = "2".repeat(64);
const CONFIRMATION_HASH = "3".repeat(64);
const IDEMPOTENCY_KEY = "atlas-tool-rls-command-1";

async function setScope(
  sql: Transaction,
  tenantId: string,
  principalId: string,
  plane: Plane,
) {
  await sql`SELECT
    set_config('app.current_tenant_id', ${tenantId}, true),
    set_config('app.current_principal_id', ${principalId}, true),
    set_config('app.current_atlas_plane', ${plane}, true)
  `;
}

async function createRunFixture(
  sql: Transaction,
  input: {
    tenantId: string;
    ownerId: string;
    title: string;
    participantId?: string;
  },
): Promise<RunFixture> {
  await setScope(sql, input.tenantId, input.ownerId, "neon");

  const [ids] = await sql<{
    thread_id: string;
    input_message_id: string;
    output_message_id: string;
    run_id: string;
    client_request_id: string;
  }[]>`
    SELECT
      shared.uuidv7() AS thread_id,
      shared.uuidv7() AS input_message_id,
      shared.uuidv7() AS output_message_id,
      shared.uuidv7() AS run_id,
      shared.uuidv7() AS client_request_id
  `;
  if (!ids) throw new Error("Unable to allocate Atlas tool fixture IDs");

  await sql`
    INSERT INTO document.conversation
      (id, tenant_id, type, title, status, created_by)
    VALUES
      (${ids.thread_id}, ${input.tenantId}, 'atlas_agent',
       ${input.title}, 'active', ${input.ownerId})
  `;
  await sql`
    INSERT INTO ai.atlas_thread
      (conversation_id, tenant_id, plane, owner_principal_id,
       retention_policy_id, expires_at, created_by)
    VALUES
      (${ids.thread_id}, ${input.tenantId}, 'neon', ${input.ownerId},
       'atlas-tools-rls-v1', now() + interval '1 day', ${input.ownerId})
  `;
  await sql`
    INSERT INTO document.conversation_participant
      (tenant_id, conversation_id, principal_id, role, created_by)
    VALUES
      (${input.tenantId}, ${ids.thread_id}, ${input.ownerId},
       'owner', ${input.ownerId})
  `;
  if (input.participantId) {
    await sql`
      INSERT INTO document.conversation_participant
        (tenant_id, conversation_id, principal_id, role, created_by)
      VALUES
        (${input.tenantId}, ${ids.thread_id}, ${input.participantId},
         'member', ${input.ownerId})
    `;
  }
  await sql`
    INSERT INTO ai.atlas_message
      (id, tenant_id, conversation_id, plane, role, content_blocks,
       status, run_id, terminal_at, created_by)
    VALUES
      (${ids.input_message_id}, ${input.tenantId}, ${ids.thread_id}, 'neon',
       'user', '[{"type":"text","text":"synthetic tool verification"}]'::jsonb,
       'completed', ${ids.run_id}, now(), ${input.ownerId})
  `;
  await sql`
    INSERT INTO ai.atlas_message
      (id, tenant_id, conversation_id, plane, role, content_blocks,
       status, run_id, parent_message_id, created_by)
    VALUES
      (${ids.output_message_id}, ${input.tenantId}, ${ids.thread_id}, 'neon',
       'assistant', '[]'::jsonb, 'pending', ${ids.run_id},
       ${ids.input_message_id}, ${input.ownerId})
  `;
  await sql`
    INSERT INTO ai.atlas_run
      (id, tenant_id, conversation_id, plane, principal_id,
       client_request_id, input_message_id, output_message_id,
       status, created_by)
    VALUES
      (${ids.run_id}, ${input.tenantId}, ${ids.thread_id}, 'neon',
       ${input.ownerId}, ${ids.client_request_id}, ${ids.input_message_id},
       ${ids.output_message_id}, 'started', ${input.ownerId})
  `;

  return { threadId: ids.thread_id, runId: ids.run_id };
}

async function insertInvocation(
  sql: Transaction,
  input: {
    tenantId: string;
    principalId: string;
    fixture: RunFixture;
    toolCallId: string;
    operationClass?: "unresolved" | "read" | "propose" | "mutate";
    riskClass?: "unknown" | "low" | "medium" | "high" | "critical";
    autonomyDecision?: "not_evaluated" | "denied" | "suggest" | "assist" | "auto";
    inputHash?: string | null;
    confirmation?: boolean;
    confirmationHash?: string;
  },
): Promise<string> {
  const confirmation = input.confirmation ?? false;
  const operationClass = input.operationClass ?? "read";
  const resolvedTool = operationClass !== "unresolved";
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO ai.ai_tool_invocation (
      tenant_id, thread_id, run_id, plane, principal_id,
      tool_call_id, tool_code, tool_version, action_code, input_hash,
      operation_class, risk_class, autonomy_decision,
      permission_snapshot, policy_snapshot, profile_snapshot,
      authorization_epoch, policy_revision, profile_revision,
      proposal_summary, confirmation_required, confirmation_policy,
      confirmation_token_hash, confirmation_expires_at, created_by
    )
    VALUES (
      ${input.tenantId}, ${input.fixture.threadId}, ${input.fixture.runId},
      'neon', ${input.principalId}, ${input.toolCallId},
      'atlas_catalog_help', ${resolvedTool ? "1.0.0" : null},
      ${resolvedTool ? "atlas_tool_read" : null},
      ${input.inputHash === undefined ? INPUT_HASH : input.inputHash},
      ${operationClass}, ${input.riskClass ?? "low"},
      ${input.autonomyDecision ?? "auto"},
      '{"decision":"allowed","permissions":["ai.agent.use"]}'::jsonb,
      '{"source":"atlas-tools-rls","decision":"allowed"}'::jsonb,
      '{"profile":"neon","tool_enabled":true}'::jsonb,
      1, 'atlas-tools-policy-v1', 'atlas-tools-profile-v1',
      'Synthetic governed tool proposal',
      ${confirmation}, ${confirmation ? "explicit" : "none"},
      ${confirmation ? (input.confirmationHash ?? CONFIRMATION_HASH) : null},
      ${confirmation ? new Date(Date.now() + 300_000) : null},
      ${input.principalId}
    )
    RETURNING id
  `;
  if (!row) throw new Error("Unable to create Atlas tool invocation fixture");
  return row.id;
}

async function assertSqlState(
  label: string,
  expectedCodes: string[],
  action: (savepoint: Transaction) => Promise<unknown>,
  sql: Transaction,
) {
  let rejected = false;
  try {
    await sql.savepoint(action);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (!expectedCodes.includes(code)) throw error;
    rejected = true;
  }
  if (!rejected) {
    throw new Error(`${label}: operation unexpectedly succeeded`);
  }
  console.log(`PASS ${label}`);
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  const tenants = await sql<{ id: string }[]>`
    SELECT id
      FROM master.tenant
     WHERE status = 'active'
       AND code <> 'system'
     ORDER BY code
     LIMIT 2
  `;
  if (tenants.length < 2) {
    throw new Error(
      "Atlas tool RLS verification requires two active non-system tenants",
    );
  }
  const tenantA = tenants[0]!.id;
  const tenantB = tenants[1]!.id;

  const principalsA = await sql<{ id: string }[]>`
    SELECT id
      FROM master.principal
     WHERE tenant_id = ${tenantA}
       AND status = 'active'
     ORDER BY id
     LIMIT 3
  `;
  const principalsB = await sql<{ id: string }[]>`
    SELECT id
      FROM master.principal
     WHERE tenant_id = ${tenantB}
       AND status = 'active'
     ORDER BY id
     LIMIT 1
  `;
  if (principalsA.length < 3 || principalsB.length < 1) {
    throw new Error(
      "Atlas tool RLS verification requires three active principals in tenant A and one in tenant B",
    );
  }

  await sql.begin(async (trx) => {
    const ownerA = principalsA[0]!.id;
    const participantA = principalsA[1]!.id;
    const otherA = principalsA[2]!.id;
    const ownerB = principalsB[0]!.id;

    await trx.unsafe(`SET LOCAL ROLE ${appRole}`);
    const fixtureA = await createRunFixture(trx, {
      tenantId: tenantA,
      ownerId: ownerA,
      participantId: participantA,
      title: "Synthetic Atlas tool owner A",
    });
    const readInvocationId = await insertInvocation(trx, {
      tenantId: tenantA,
      principalId: ownerA,
      fixture: fixtureA,
      toolCallId: "call-read-1",
    });
    console.log("PASS owner can persist a governed read-only proposal");

    await trx`
      UPDATE ai.ai_tool_invocation
         SET status = 'executing',
             execution_guard_snapshot =
               '{"auth_epoch":"matched","permission":"allowed","lifecycle":"not_applicable"}'::jsonb,
             execution_auth_epoch = 1,
             execution_policy_revision = 'atlas-tools-policy-v1',
             executing_at = now(),
             updated_by = ${ownerA}
       WHERE tenant_id = ${tenantA}
         AND id = ${readInvocationId}
    `;
    await trx`
      UPDATE ai.ai_tool_invocation
         SET status = 'completed',
             result_hash = ${RESULT_HASH},
             evidence_refs =
               '[{"evidence_id":"synthetic-catalog-v1","kind":"catalog"}]'::jsonb,
             terminal_at = now(),
             duration_ms = 10,
             updated_by = ${ownerA}
       WHERE tenant_id = ${tenantA}
         AND id = ${readInvocationId}
    `;
    console.log("PASS read-only proposal follows proposed to executing to completed");

    await assertSqlState(
      "terminal invocation mutation is rejected",
      ["55000"],
      async (savepoint) => {
        await savepoint`
          UPDATE ai.ai_tool_invocation
             SET terminal_at = now(),
                 updated_by = ${ownerA}
           WHERE id = ${readInvocationId}
        `;
      },
      trx,
    );

    const unknownInvocationId = await insertInvocation(trx, {
      tenantId: tenantA,
      principalId: ownerA,
      fixture: fixtureA,
      toolCallId: "call-unknown-1",
      operationClass: "unresolved",
      riskClass: "unknown",
      autonomyDecision: "not_evaluated",
      inputHash: null,
    });
    await assertSqlState(
      "unresolved proposal cannot enter confirmed state",
      ["23514"],
      async (savepoint) => {
        await savepoint`
          UPDATE ai.ai_tool_invocation
             SET status = 'confirmed',
                 updated_by = ${ownerA}
           WHERE id = ${unknownInvocationId}
        `;
      },
      trx,
    );
    await trx`
      UPDATE ai.ai_tool_invocation
         SET status = 'denied',
             autonomy_decision = 'denied',
             permission_snapshot =
               '{"decision":"denied","reason":"unknown_tool"}'::jsonb,
             policy_snapshot =
               '{"decision":"denied","gate":"registry"}'::jsonb,
             profile_snapshot =
               '{"profile":"neon","tool_enabled":false}'::jsonb,
             policy_revision = 'atlas-tools-policy-v1',
             proposal_summary = 'Resolved unknown-tool registry denial',
             terminal_error_class = 'unknown_tool',
             terminal_at = now(),
             duration_ms = 1,
             updated_by = ${ownerA}
       WHERE id = ${unknownInvocationId}
    `;
    console.log("PASS unresolved tool proposal resolves once to a durable denial");

    const cancelledInvocationId = await insertInvocation(trx, {
      tenantId: tenantA,
      principalId: ownerA,
      fixture: fixtureA,
      toolCallId: "call-cancel-1",
    });
    await trx`
      UPDATE ai.ai_tool_invocation
         SET status = 'executing',
             execution_guard_snapshot =
               '{"auth_epoch":"matched","permission":"allowed"}'::jsonb,
             execution_auth_epoch = 1,
             execution_policy_revision = 'atlas-tools-policy-v1',
             executing_at = now(),
             updated_by = ${ownerA}
       WHERE id = ${cancelledInvocationId}
    `;
    await trx`
      UPDATE ai.ai_tool_invocation
         SET status = 'cancelled',
             terminal_error_class = 'request_cancelled',
             terminal_at = now(),
             duration_ms = 2,
             updated_by = ${ownerA}
       WHERE id = ${cancelledInvocationId}
    `;
    console.log("PASS cancellation terminalizes an executing invocation");

    const confirmedInvocationId = await insertInvocation(trx, {
      tenantId: tenantA,
      principalId: ownerA,
      fixture: fixtureA,
      toolCallId: "call-confirm-1",
      operationClass: "mutate",
      riskClass: "medium",
      autonomyDecision: "assist",
      confirmation: true,
      confirmationHash: CONFIRMATION_HASH,
    });
    await trx`
      UPDATE ai.ai_tool_invocation
         SET status = 'confirmed',
             confirmation_actor_id = ${ownerA},
             confirmation_at = now(),
             updated_by = ${ownerA}
       WHERE id = ${confirmedInvocationId}
    `;
    await assertSqlState(
      "confirmation replay is rejected",
      ["55000"],
      async (savepoint) => {
        await savepoint`
          UPDATE ai.ai_tool_invocation
             SET confirmation_at = now(),
                 updated_by = ${ownerA}
           WHERE id = ${confirmedInvocationId}
        `;
      },
      trx,
    );
    await trx`
      UPDATE ai.ai_tool_invocation
         SET status = 'executing',
             execution_guard_snapshot =
               '{"auth_epoch":"matched","permission":"allowed","row_version":"matched"}'::jsonb,
             execution_auth_epoch = 1,
             execution_policy_revision = 'atlas-tools-policy-v1',
             downstream_command_idempotency_key = ${IDEMPOTENCY_KEY},
             executing_at = now(),
             updated_by = ${ownerA}
       WHERE id = ${confirmedInvocationId}
    `;
    console.log("PASS confirmed mutation requires execution recheck and idempotency");

    const duplicateIdempotencyId = await insertInvocation(trx, {
      tenantId: tenantA,
      principalId: ownerA,
      fixture: fixtureA,
      toolCallId: "call-confirm-2",
      operationClass: "mutate",
      riskClass: "medium",
      autonomyDecision: "assist",
      confirmation: true,
      confirmationHash: "4".repeat(64),
    });
    await trx`
      UPDATE ai.ai_tool_invocation
         SET status = 'confirmed',
             confirmation_actor_id = ${ownerA},
             confirmation_at = now(),
             updated_by = ${ownerA}
       WHERE id = ${duplicateIdempotencyId}
    `;
    await assertSqlState(
      "downstream idempotency replay is rejected",
      ["23505"],
      async (savepoint) => {
        await savepoint`
          UPDATE ai.ai_tool_invocation
             SET status = 'executing',
                 execution_guard_snapshot =
                   '{"auth_epoch":"matched","permission":"allowed","row_version":"matched"}'::jsonb,
                 execution_auth_epoch = 1,
                 execution_policy_revision = 'atlas-tools-policy-v1',
                 downstream_command_idempotency_key = ${IDEMPOTENCY_KEY},
                 executing_at = now(),
                 updated_by = ${ownerA}
           WHERE id = ${duplicateIdempotencyId}
        `;
      },
      trx,
    );

    const [ownerCount] = await trx<{ count: number }[]>`
      SELECT count(*)::int AS count
        FROM ai.ai_tool_invocation
       WHERE thread_id = ${fixtureA.threadId}
    `;
    if (Number(ownerCount?.count) !== 5) {
      throw new Error(`owner expected 5 invocations, received ${ownerCount?.count}`);
    }
    console.log("PASS owner sees all governed invocations in the owned thread");

    await setScope(trx, tenantA, participantA, "neon");
    const [participantCount] = await trx<{ count: number }[]>`
      SELECT count(*)::int AS count
        FROM ai.ai_tool_invocation
       WHERE thread_id = ${fixtureA.threadId}
    `;
    if (Number(participantCount?.count) !== 0) {
      throw new Error(
        `participant unexpectedly saw ${participantCount?.count} invocation rows`,
      );
    }
    console.log("PASS active transcript participant cannot read authorization snapshots");

    await assertSqlState(
      "non-owner cannot forge an invocation",
      ["42501", "23514"],
      async (savepoint) => {
        await insertInvocation(savepoint, {
          tenantId: tenantA,
          principalId: participantA,
          fixture: fixtureA,
          toolCallId: "call-forged-1",
        });
      },
      trx,
    );

    await setScope(trx, tenantA, ownerA, "mesh");
    const [wrongPlaneCount] = await trx<{ count: number }[]>`
      SELECT count(*)::int AS count
        FROM ai.ai_tool_invocation
       WHERE thread_id = ${fixtureA.threadId}
    `;
    if (Number(wrongPlaneCount?.count) !== 0) {
      throw new Error("wrong-plane principal saw governed invocation rows");
    }
    console.log("PASS wrong plane fails closed");

    await trx.unsafe("RESET ROLE");
    const fixtureB = await createRunFixture(trx, {
      tenantId: tenantB,
      ownerId: ownerB,
      title: "Synthetic Atlas tool owner B",
    });
    await trx.unsafe(`SET LOCAL ROLE ${appRole}`);
    await setScope(trx, tenantB, ownerB, "neon");
    await insertInvocation(trx, {
      tenantId: tenantB,
      principalId: ownerB,
      fixture: fixtureB,
      toolCallId: "call-tenant-b-1",
    });
    const [tenantBCount] = await trx<{ count: number }[]>`
      SELECT count(*)::int AS count
        FROM ai.ai_tool_invocation
       WHERE thread_id IN (${fixtureA.threadId}, ${fixtureB.threadId})
    `;
    if (Number(tenantBCount?.count) !== 1) {
      throw new Error(
        `tenant B expected one visible invocation, received ${tenantBCount?.count}`,
      );
    }
    console.log("PASS cross-tenant rows are isolated");

    await assertSqlState(
      "tenant application role has no hard-delete path",
      ["42501"],
      async (savepoint) => {
        await savepoint`
          DELETE FROM ai.ai_tool_invocation
           WHERE id = ${readInvocationId}
        `;
      },
      trx,
    );

    await trx.unsafe("RESET ROLE");
    await setScope(trx, tenantA, ownerA, "neon");
    await assertSqlState(
      "run principal mismatch is rejected even on privileged path",
      ["23514"],
      async (savepoint) => {
        await insertInvocation(savepoint, {
          tenantId: tenantA,
          principalId: otherA,
          fixture: fixtureA,
          toolCallId: "call-wrong-principal-1",
        });
      },
      trx,
    );

    const purgeFixture = await createRunFixture(trx, {
      tenantId: tenantA,
      ownerId: ownerA,
      title: "Synthetic Atlas tool purge",
    });
    await trx.unsafe(`SET LOCAL ROLE ${appRole}`);
    const purgeInvocationId = await insertInvocation(trx, {
      tenantId: tenantA,
      principalId: ownerA,
      fixture: purgeFixture,
      toolCallId: "call-purge-1",
    });
    await trx.unsafe("RESET ROLE");
    await trx.unsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await trx`
      DELETE FROM document.conversation
       WHERE tenant_id = ${tenantA}
         AND id = ${purgeFixture.threadId}
    `;
    const [purged] = await trx<{ count: number }[]>`
      SELECT count(*)::int AS count
        FROM ai.ai_tool_invocation
       WHERE id = ${purgeInvocationId}
    `;
    if (Number(purged?.count) !== 0) {
      throw new Error("governed thread purge left a tool invocation orphan");
    }
    console.log("PASS governed thread purge cascades tool invocation rows");

    throw new Error("__atlas_tools_rls_rollback__");
  });
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== "__atlas_tools_rls_rollback__"
  ) {
    throw error;
  }
} finally {
  await sql.end();
}

console.log("Atlas governed-tool behavioral RLS verification passed.");
