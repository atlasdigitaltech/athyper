#!/usr/bin/env tsx
/**
 * Behavioral Atlas conversation RLS verification.
 *
 * Requires a privileged DATABASE_URL for fixture setup and a NOBYPASSRLS
 * RLS_APP_ROLE (normally athyperapp_test) for the actual assertions. Every
 * fixture is rolled back.
 */

import postgres from "postgres";

const databaseUrl = process.env["DATABASE_URL"];
const appRole = process.env["RLS_APP_ROLE"]?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
if (!appRole || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(appRole)) {
  throw new Error(
    "A safe RLS_APP_ROLE is required; Atlas RLS verification never runs as a bypass role",
  );
}

type Transaction = postgres.TransactionSql;

type Fixture = {
  conversationId: string;
  inputMessageId: string;
  outputMessageId: string;
  runId: string;
};

async function setScope(
  sql: Transaction,
  tenantId: string,
  principalId: string,
  plane: "neon" | "mesh" | "admin",
) {
  await sql`SELECT
    set_config('app.current_tenant_id', ${tenantId}, true),
    set_config('app.current_principal_id', ${principalId}, true),
    set_config('app.current_atlas_plane', ${plane}, true)
  `;
}

async function createFixture(
  sql: Transaction,
  input: {
    tenantId: string;
    ownerId: string;
    title: string;
    extraParticipants?: Array<{ principalId: string; revoked: boolean }>;
  },
): Promise<Fixture> {
  await setScope(sql, input.tenantId, input.ownerId, "neon");

  const ids = await sql<{
    conversation_id: string;
    input_message_id: string;
    output_message_id: string;
    run_id: string;
    client_request_id: string;
  }[]>`
    SELECT
      shared.uuidv7() AS conversation_id,
      shared.uuidv7() AS input_message_id,
      shared.uuidv7() AS output_message_id,
      shared.uuidv7() AS run_id,
      shared.uuidv7() AS client_request_id
  `;
  const allocated = ids[0];
  if (!allocated) throw new Error("Unable to allocate Atlas fixture IDs");

  await sql`
    INSERT INTO master.conversation
      (id, tenant_id, type, title, status, created_by)
    VALUES
      (${allocated.conversation_id}, ${input.tenantId}, 'atlas_agent',
       ${input.title}, 'active', ${input.ownerId})
  `;
  await sql`
    INSERT INTO master.atlas_thread
      (conversation_id, tenant_id, plane, owner_principal_id,
       retention_policy_id, expires_at, created_by)
    VALUES
      (${allocated.conversation_id}, ${input.tenantId}, 'neon',
       ${input.ownerId}, 'atlas-rls-test-v1',
       now() + interval '1 day', ${input.ownerId})
  `;
  await sql`
    INSERT INTO master.conversation_participant
      (tenant_id, conversation_id, principal_id, role, created_by)
    VALUES
      (${input.tenantId}, ${allocated.conversation_id},
       ${input.ownerId}, 'owner', ${input.ownerId})
  `;
  for (const participant of input.extraParticipants ?? []) {
    await sql`
      INSERT INTO master.conversation_participant
        (tenant_id, conversation_id, principal_id, role, left_at, created_by)
      VALUES
        (${input.tenantId}, ${allocated.conversation_id},
         ${participant.principalId}, 'member',
         ${participant.revoked ? new Date() : null}, ${input.ownerId})
    `;
  }
  await sql`
    INSERT INTO master.atlas_message
      (id, tenant_id, conversation_id, plane, role, content_blocks,
       status, run_id, terminal_at, created_by)
    VALUES
      (${allocated.input_message_id}, ${input.tenantId},
       ${allocated.conversation_id}, 'neon', 'user',
       '[{"type":"text","text":"synthetic RLS input"}]'::jsonb,
       'completed', ${allocated.run_id}, now(), ${input.ownerId})
  `;
  await sql`
    INSERT INTO master.atlas_message
      (id, tenant_id, conversation_id, plane, role, content_blocks,
       status, run_id, parent_message_id, created_by)
    VALUES
      (${allocated.output_message_id}, ${input.tenantId},
       ${allocated.conversation_id}, 'neon', 'assistant', '[]'::jsonb,
       'pending', ${allocated.run_id}, ${allocated.input_message_id},
       ${input.ownerId})
  `;
  await sql`
    INSERT INTO event.atlas_run
      (id, tenant_id, conversation_id, plane, principal_id,
       client_request_id, input_message_id, output_message_id,
       status, created_by)
    VALUES
      (${allocated.run_id}, ${input.tenantId}, ${allocated.conversation_id},
       'neon', ${input.ownerId}, ${allocated.client_request_id},
       ${allocated.input_message_id}, ${allocated.output_message_id},
       'started', ${input.ownerId})
  `;

  return {
    conversationId: allocated.conversation_id,
    inputMessageId: allocated.input_message_id,
    outputMessageId: allocated.output_message_id,
    runId: allocated.run_id,
  };
}

async function visibleCounts(
  sql: Transaction,
  conversationIds: string[],
): Promise<{ conversations: number; threads: number; messages: number; runs: number }> {
  const [row] = await sql<{
    conversations: number;
    threads: number;
    messages: number;
    runs: number;
  }[]>`
    SELECT
      (SELECT count(*)::int FROM master.conversation
        WHERE id = ANY(${conversationIds}::uuid[])) AS conversations,
      (SELECT count(*)::int FROM master.atlas_thread
        WHERE conversation_id = ANY(${conversationIds}::uuid[])) AS threads,
      (SELECT count(*)::int FROM master.atlas_message
        WHERE conversation_id = ANY(${conversationIds}::uuid[])) AS messages,
      (SELECT count(*)::int FROM event.atlas_run
        WHERE conversation_id = ANY(${conversationIds}::uuid[])) AS runs
  `;
  if (!row) throw new Error("RLS count query returned no row");
  return row;
}

function assertCounts(
  label: string,
  actual: { conversations: number; threads: number; messages: number; runs: number },
  expected: { conversations: number; threads: number; messages: number; runs: number },
) {
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (Number(actual[key]) !== expected[key]) {
      throw new Error(
        `${label}: expected ${key}=${expected[key]}, received ${actual[key]}`,
      );
    }
  }
  console.log(`PASS ${label}`);
}

async function assertWriteDenied(
  label: string,
  sql: Transaction,
  action: (savepoint: Transaction) => Promise<unknown>,
) {
  let denied = false;
  try {
    await sql.savepoint(async (savepoint) => {
      await action(savepoint);
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code !== "42501") throw error;
    denied = true;
  }
  if (!denied) {
    throw new Error(`${label}: write unexpectedly succeeded`);
  }
  console.log(`PASS ${label}`);
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  const tenants = await sql<{ id: string }[]>`
    SELECT id FROM master.tenant
    WHERE status = 'active' AND code <> 'system'
    ORDER BY code
    LIMIT 2
  `;
  if (tenants.length < 2) {
    throw new Error("Atlas RLS verification requires two active non-system tenants");
  }
  const tenantA = tenants[0]!.id;
  const tenantB = tenants[1]!.id;

  const principalsA = await sql<{ id: string }[]>`
    SELECT id FROM master.principal
    WHERE tenant_id = ${tenantA} AND status = 'active'
    ORDER BY id
    LIMIT 3
  `;
  const principalsB = await sql<{ id: string }[]>`
    SELECT id FROM master.principal
    WHERE tenant_id = ${tenantB} AND status = 'active'
    ORDER BY id
    LIMIT 1
  `;
  if (principalsA.length < 3 || principalsB.length < 1) {
    throw new Error(
      "Atlas RLS verification requires three active principals in tenant A and one in tenant B",
    );
  }

  await sql.begin(async (trx) => {
    const ownerA = principalsA[0]!.id;
    const activeParticipant = principalsA[1]!.id;
    const revokedParticipant = principalsA[2]!.id;
    const ownerB = principalsB[0]!.id;

    await trx.unsafe(`SET LOCAL ROLE ${appRole}`);
    const ownedA = await createFixture(trx, {
      tenantId: tenantA,
      ownerId: ownerA,
      title: "Synthetic owner A thread",
      extraParticipants: [
        { principalId: activeParticipant, revoked: false },
        { principalId: revokedParticipant, revoked: true },
      ],
    });
    await trx.unsafe("RESET ROLE");
    console.log("PASS application role can create a durable Atlas thread and run");

    const nonOwnedA = await createFixture(trx, {
      tenantId: tenantA,
      ownerId: activeParticipant,
      title: "Synthetic same-tenant non-owned thread",
    });
    const ownedB = await createFixture(trx, {
      tenantId: tenantB,
      ownerId: ownerB,
      title: "Synthetic tenant B thread",
    });
    const purgeCandidate = await createFixture(trx, {
      tenantId: tenantA,
      ownerId: ownerA,
      title: "Synthetic governed-purge thread",
    });

    await trx.unsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await trx`
      DELETE FROM master.conversation
       WHERE tenant_id = ${tenantA}
         AND id = ${purgeCandidate.conversationId}
    `;
    await trx.unsafe("SET CONSTRAINTS ALL IMMEDIATE");
    const [purged] = await trx<{
      conversations: number;
      participants: number;
      threads: number;
      messages: number;
      runs: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM master.conversation
          WHERE id = ${purgeCandidate.conversationId}) AS conversations,
        (SELECT count(*)::int FROM master.conversation_participant
          WHERE conversation_id = ${purgeCandidate.conversationId}) AS participants,
        (SELECT count(*)::int FROM master.atlas_thread
          WHERE conversation_id = ${purgeCandidate.conversationId}) AS threads,
        (SELECT count(*)::int FROM master.atlas_message
          WHERE conversation_id = ${purgeCandidate.conversationId}) AS messages,
        (SELECT count(*)::int FROM event.atlas_run
          WHERE conversation_id = ${purgeCandidate.conversationId}) AS runs
    `;
    if (
      !purged ||
      Object.values(purged).some((value) => Number(value) !== 0)
    ) {
      throw new Error(
        `governed purge did not cascade all Atlas rows: ${JSON.stringify(purged)}`,
      );
    }
    console.log("PASS governed hard purge cascades the complete Atlas thread graph");

    await trx.unsafe(`SET LOCAL ROLE ${appRole}`);

    const allIds = [
      ownedA.conversationId,
      nonOwnedA.conversationId,
      ownedB.conversationId,
    ];

    await setScope(trx, tenantA, ownerA, "neon");
    const finalizedMessages = await trx<{ id: string }[]>`
      UPDATE master.atlas_message
         SET content_blocks =
               '[{"type":"text","text":"synthetic terminal response"}]'::jsonb,
             status = 'completed',
             terminal_at = now(),
             updated_by = ${ownerA}
       WHERE tenant_id = ${tenantA}
         AND id = ${ownedA.outputMessageId}
      RETURNING id
    `;
    const finalizedRuns = await trx<{ id: string }[]>`
      UPDATE event.atlas_run
         SET status = 'completed',
             terminal_at = now(),
             updated_by = ${ownerA}
       WHERE tenant_id = ${tenantA}
         AND id = ${ownedA.runId}
      RETURNING id
    `;
    if (finalizedMessages.length !== 1 || finalizedRuns.length !== 1) {
      throw new Error("owner could not finalize the durable Atlas run");
    }
    console.log("PASS owner can atomically finalize the durable message and run");

    assertCounts(
      "owner sees own thread; same-tenant non-owner and tenant B fail closed",
      await visibleCounts(trx, allIds),
      { conversations: 1, threads: 1, messages: 2, runs: 1 },
    );

    await setScope(trx, tenantA, activeParticipant, "neon");
    assertCounts(
      "active participant sees authorized thread plus owned thread",
      await visibleCounts(trx, allIds),
      { conversations: 2, threads: 2, messages: 4, runs: 2 },
    );
    await assertWriteDenied(
      "active participant is read-only and cannot append to the owner's thread",
      trx,
      async (savepoint) => {
        await savepoint`
          INSERT INTO master.atlas_message
            (tenant_id, conversation_id, plane, role, content_blocks,
             status, terminal_at, created_by)
          VALUES
            (${tenantA}, ${ownedA.conversationId}, 'neon', 'user',
             '[{"type":"text","text":"must be rejected"}]'::jsonb,
             'completed', now(), ${activeParticipant})
        `;
      },
    );

    await setScope(trx, tenantA, revokedParticipant, "neon");
    assertCounts(
      "revoked participant fails closed",
      await visibleCounts(trx, allIds),
      { conversations: 0, threads: 0, messages: 0, runs: 0 },
    );

    await setScope(trx, tenantA, ownerA, "mesh");
    assertCounts(
      "wrong Atlas plane fails closed",
      await visibleCounts(trx, allIds),
      { conversations: 0, threads: 0, messages: 0, runs: 0 },
    );

    await setScope(trx, tenantB, ownerB, "neon");
    assertCounts(
      "tenant B sees only tenant B thread",
      await visibleCounts(trx, allIds),
      { conversations: 1, threads: 1, messages: 2, runs: 1 },
    );

    throw new Error("__atlas_rls_rollback__");
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== "__atlas_rls_rollback__") {
    throw error;
  }
} finally {
  await sql.end();
}

console.log("Atlas conversation behavioral RLS verification passed.");
