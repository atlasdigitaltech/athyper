/** Real PostgreSQL cleanup/race checks; refuses application containers. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import {
  expireCommentDrafts,
  createKyselyCollaborationRepository,
} from "../../../../packages/platform/collaboration/src/index.js";
import type { VerifiedRequestContext } from "../../../../packages/contracts/auth/src/index.js";

const container = process.argv[2];
assert.ok(container && /^(athyper-ca07-local-|athyper-bp-integration-local-)/.test(container));
const info = JSON.parse(
  execFileSync("docker", ["inspect", container!], { encoding: "utf8" }),
)[0];
assert.equal(info.Config.Labels["athyper.environment"], "disposable_local");
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({
      host: info.NetworkSettings.Networks.bridge.IPAddress,
      user: "postgres",
      database: "athyper_neon",
      options: "-c app.database_plane=neon",
      max: 3,
    }),
  }),
});
const zero = "00000000-0000-0000-0000-000000000000";
const context = {
  tenantId: zero,
  principalId: zero,
  planeKey: "neon",
} as VerifiedRequestContext;
const repository = createKyselyCollaborationRepository();
const fixtures: {
  id: string;
  draft: string;
  series: string;
  linked: boolean;
}[] = [];
try {
  await db.transaction().execute(async (tx) => {
    await sql`SELECT set_config('app.current_tenant_id',${zero},true),set_config('app.current_principal_id',${zero},true)`.execute(
      tx,
    );
    await sql`SET LOCAL ROLE athyperapp`.execute(tx);
    const comment = await repository.create(
      {
        context,
        entityType: "business_partner",
        entityId: randomUUID(),
        text: "History fixture",
        visibility: "private",
      },
      [],
      tx,
    );
    const edited = await repository.edit(
      {
        context,
        commentId: comment.id,
        text: "Edited fixture",
        expectedRevision: 1,
      },
      [],
      tx,
    );
    assert.equal(edited?.comment.revision, 2);
    assert.equal(
      await repository.edit(
        { context, commentId: comment.id, text: "Stale", expectedRevision: 1 },
        [],
        tx,
      ),
      null,
    );
    const first = await repository.history!(
      { context, commentId: comment.id, limit: 1 },
      tx,
    );
    assert.equal(first.items[0]?.text, "Edited fixture");
    assert.equal(first.nextRevision, 2);
    const second = await repository.history!(
      {
        context,
        commentId: comment.id,
        limit: 1,
        beforeRevision: first.nextRevision,
      },
      tx,
    );
    assert.equal(second.items[0]?.text, "History fixture");
    assert.equal(second.nextRevision, undefined);
    await assert.rejects(
      repository.history!(
        {
          context: { ...context, principalId: randomUUID() },
          commentId: comment.id,
        },
        tx,
      ),
      /History is unavailable/,
    );
  });
  await db.transaction().execute((tx) => expireCommentDrafts(tx));
  for (const linked of [false, true]) {
    const id = randomUUID(),
      series = randomUUID();
    await db.transaction().execute(async (tx) => {
      const draft = await repository.putDraft(
        {
          context,
          entityType: "business_partner",
          entityId: id,
          text: "Synthetic expiry test",
          draftRetentionDays: 30,
        },
        tx,
      );
      await sql`INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES(${series}::uuid,${zero}::uuid,${zero}::uuid)`.execute(
        tx,
      );
      await sql`INSERT INTO document.attachment(id,tenant_id,series_id,draft_id,file_name,storage_bucket,storage_key,uploaded_by,created_by,retention_until) VALUES(${id}::uuid,${zero}::uuid,${series}::uuid,${draft}::uuid,'fixture.txt','fixture','never-delete',${zero}::uuid,${zero}::uuid,now()+interval '1 year')`.execute(
        tx,
      );
      await sql`INSERT INTO document.attachment_legal_hold(tenant_id,attachment_series_id,reason,placed_by,created_by) VALUES(${zero}::uuid,${series}::uuid,'Synthetic hold',${zero}::uuid,${zero}::uuid)`.execute(
        tx,
      );
      if (linked)
        await sql`INSERT INTO document.attachment_link(tenant_id,entity_type,entity_id,attachment_series_id,pinned_attachment_id,link_kind,created_by) VALUES(${zero}::uuid,'business_partner',${id},${series}::uuid,${id}::uuid,'evidence',${zero}::uuid)`.execute(
          tx,
        );
      await sql`UPDATE document.comment_draft SET expires_at=now()-interval '1 day' WHERE id=${draft}::uuid`.execute(
        tx,
      );
      fixtures.push({ id, draft, series, linked });
    });
  }
  // A save holding the draft lock must be skipped by cleanup, then survive once
  // the refreshed deadline commits. This exercises two real DB connections.
  const saved = fixtures[0]!;
  await db.transaction().execute(async (tx) => {
    await repository.putDraft(
      {
        context,
        entityType: "business_partner",
        entityId: saved.id,
        text: "Refreshed draft",
        draftRetentionDays: 30,
      },
      tx,
    );
    const expired = await db
      .transaction()
      .execute((t) => expireCommentDrafts(t));
    assert.equal(
      expired.length,
      0,
      "shared attachment must not become orphaned",
    );
  });
  const deadline = (
    await sql<{
      live: boolean;
    }>`SELECT expires_at>now()+interval '29 days' AS live FROM document.comment_draft WHERE id=${saved.draft}::uuid`.execute(
      db,
    )
  ).rows[0];
  assert.equal(deadline?.live, true);
  assert.equal(
    (await db.transaction().execute((t) => expireCommentDrafts(t))).length,
    0,
  );
  // Cancellation takes exactly the same safe maintenance path as expiry.
  await db
    .transaction()
    .execute((tx) =>
      repository.deleteDraft(
        zero,
        zero,
        { entityType: "business_partner", entityId: saved.id },
        undefined,
        tx,
      ),
    );
  await assert.rejects(
    db.transaction().execute(async (tx) => {
      await expireCommentDrafts(tx);
      throw new Error("synthetic outbox failure");
    }),
    /synthetic outbox failure/,
  );
  const retained = (
    await sql<{
      status: string;
      draft_id: string;
    }>`SELECT status,draft_id FROM document.attachment WHERE id=${saved.id}::uuid`.execute(
      db,
    )
  ).rows[0];
  assert.equal(retained?.status, "active");
  assert.equal(retained?.draft_id, saved.draft);
  const orphaned = await db
    .transaction()
    .execute((tx) => expireCommentDrafts(tx));
  assert.deepEqual(
    orphaned.map((x) => x.attachmentId),
    [saved.id],
  );
  for (const fixture of fixtures) {
    const row = (
      await sql<{
        status: string;
        draft_id: string | null;
        storage_key: string;
        is_active: boolean;
      }>`SELECT status,draft_id,storage_key,is_active FROM document.attachment WHERE id=${fixture.id}::uuid`.execute(
        db,
      )
    ).rows[0]!;
    assert.equal(row.status, fixture.linked ? "active" : "orphaned");
    assert.equal(row.draft_id, null);
    assert.equal(row.storage_key, "never-delete");
    if (!fixture.linked) assert.equal(row.is_active, false);
    assert.equal(
      (
        await sql`SELECT id FROM document.attachment_legal_hold WHERE attachment_series_id=${fixture.series}::uuid AND released_at IS NULL`.execute(
          db,
        )
      ).rows.length,
      1,
    );
  }
  assert.equal(
    (await db.transaction().execute((tx) => expireCommentDrafts(tx))).length,
    0,
    "cleanup replay must be empty",
  );
  console.log(
    "CA07 PostgreSQL: save/expiry race, renewed deadline, cancellation, shared references, holds and replay passed",
  );
} finally {
  await db.destroy();
}
