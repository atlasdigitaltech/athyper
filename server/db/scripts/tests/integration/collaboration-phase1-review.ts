/** Repository regressions against an explicitly labelled disposable database; rolls back all fixtures. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { createKyselyCollaborationRepository } from "../../../../packages/platform/collaboration/src/index.js";
import { createKyselyAttachmentRepository } from "../../../../packages/services/attachments/src/kysely-attachment-repository.js";
import type { VerifiedRequestContext } from "../../../../packages/contracts/auth/src/index.js";

const container = process.argv[2];
assert.ok(container && /^athyper-ca07-local-/.test(container));
const info = JSON.parse(
  execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
)[0];
assert.equal(info.Config.Labels["athyper.environment"], "disposable_local");
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({
      host: info.NetworkSettings.Networks.bridge.IPAddress,
      user: "postgres",
      database: "athyper_neon",
      options: "-c app.database_plane=neon",
      max: 2,
    }),
  }),
});
const zero = "00000000-0000-0000-0000-000000000000";
const context = {
  tenantId: zero,
  principalId: zero,
  planeKey: "neon",
} as VerifiedRequestContext;
const comments = createKyselyCollaborationRepository();
const attachments = createKyselyAttachmentRepository("review-fixture");
const rollback = new Error("rollback review fixtures");
try {
  await db.transaction().execute(async (tx) => {
    await sql`SELECT set_config('app.current_tenant_id',${zero},true),set_config('app.current_principal_id',${zero},true)`.execute(
      tx,
    );
    await sql`SET LOCAL ROLE athyperapp`.execute(tx);
    const record = randomUUID(),
      series = randomUUID(),
      attachmentId = randomUUID();
    const identity = {
      planeKey: "neon" as const,
      tenantId: zero,
      principalId: zero,
      attachmentId,
    };
    await sql`INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES(${series}::uuid,${zero}::uuid,${zero}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO document.attachment(id,tenant_id,series_id,file_name,content_type,size_bytes,sha256,storage_bucket,storage_key,status,is_active,is_virus_scanned,uploaded_by,metadata,created_by)
      VALUES(${attachmentId}::uuid,${zero}::uuid,${series}::uuid,'test.pdf','application/pdf',4,repeat('a',64),'review-fixture','review-file','active',true,true,${zero}::uuid,${JSON.stringify({ entity_type: "business_partner", entity_id: record })}::jsonb,${zero}::uuid)`.execute(
      tx,
    );
    // The same uploader may not smuggle bytes from another record into a comment.
    await sql`SAVEPOINT foreign_record`.execute(tx);
    await assert.rejects(
      comments.create(
        {
          context,
          entityType: "business_partner",
          entityId: randomUUID(),
          text: "Foreign attachment",
          attachmentIds: [attachmentId],
        },
        [],
        tx,
      ),
      /Every attachment must be active/,
    );
    await sql`ROLLBACK TO SAVEPOINT foreign_record`.execute(tx);
    const comment = await comments.create(
      {
        context,
        entityType: "business_partner",
        entityId: record,
        text: "Own record attachment",
        attachmentIds: [attachmentId],
      },
      [],
      tx,
    );
    assert.equal(comment.revision, 1);
    const renamed = await attachments.rename!(
      identity,
      { displayName: "Reviewed", expectedSeriesRevision: "1" },
      tx,
    );
    assert.equal(renamed?.id, attachmentId);
    assert.equal(
      await attachments.rename!(
        identity,
        { displayName: "Stale", expectedSeriesRevision: "1" },
        tx,
      ),
      null,
    );
    assert.ok(
      await attachments.rename!(
        identity,
        { displayName: "Next", expectedSeriesRevision: "2" },
        tx,
      ),
    );
    // Replacing the final comment pin must orphan every active version in its
    // series. The returned IDs are the durable cleanup intent consumed by the
    // collaboration service's transactional outbox write.
    const removedFinalPin = await comments.edit(
      { context, commentId: comment.id, text: "No attachment", expectedRevision: 1, attachmentIds: [] },
      [],
      tx,
    );
    assert.deepEqual(removedFinalPin?.orphanedAttachmentIds, [attachmentId]);
    assert.deepEqual((await sql<{status:string;is_active:boolean}>`SELECT status,is_active FROM document.attachment WHERE id=${attachmentId}::uuid`.execute(tx)).rows, [{status:"orphaned",is_active:false}]);
    // Replacing a pin with itself and removing one of two comment pins must
    // retain the series. Only removal of the final shared pin can orphan it.
    const sharedSeries=randomUUID(),sharedAttachment=randomUUID();
    await sql`INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES(${sharedSeries}::uuid,${zero}::uuid,${zero}::uuid)`.execute(tx);
    await sql`INSERT INTO document.attachment(id,tenant_id,series_id,file_name,content_type,size_bytes,sha256,storage_bucket,storage_key,status,is_active,is_virus_scanned,uploaded_by,metadata,created_by) VALUES(${sharedAttachment}::uuid,${zero}::uuid,${sharedSeries}::uuid,'shared.pdf','application/pdf',4,repeat('b',64),'review-fixture','review-shared','active',true,true,${zero}::uuid,${JSON.stringify({entity_type:"business_partner",entity_id:record})}::jsonb,${zero}::uuid)`.execute(tx);
    const firstPin=await comments.create({context,entityType:"business_partner",entityId:record,text:"First shared pin",attachmentIds:[sharedAttachment]},[],tx);
    assert.deepEqual((await comments.edit({context,commentId:firstPin.id,text:"Keep shared pin",expectedRevision:1,attachmentIds:[sharedAttachment]},[],tx))?.orphanedAttachmentIds,[]);
    const secondPin=await comments.create({context,entityType:"business_partner",entityId:record,text:"Second shared pin",attachmentIds:[sharedAttachment]},[],tx);
    assert.deepEqual((await comments.edit({context,commentId:firstPin.id,text:"First pin removed",expectedRevision:2,attachmentIds:[]},[],tx))?.orphanedAttachmentIds,[]);
    assert.equal((await sql<{status:string}>`SELECT status FROM document.attachment WHERE id=${sharedAttachment}::uuid`.execute(tx)).rows[0]?.status,"active");
    assert.deepEqual((await comments.edit({context,commentId:secondPin.id,text:"Final shared pin removed",expectedRevision:1,attachmentIds:[]},[],tx))?.orphanedAttachmentIds,[sharedAttachment]);
    await sql`UPDATE document.attachment_series SET retention_until=now()+interval '1 year',updated_by=${zero}::uuid WHERE id=${series}::uuid`.execute(
      tx,
    );
    const retained = await attachments.loadForMaintenance!(identity, tx);
    assert.ok(
      retained?.retentionUntil &&
        Date.parse(retained.retentionUntil) > Date.now(),
    );
    await sql`UPDATE document.attachment SET status='orphaned',is_active=false,updated_by=${zero}::uuid WHERE id=${attachmentId}::uuid`.execute(
      tx,
    );
    assert.ok(
      !(
        await attachments.listRetentionCandidates!(
          { tenantId: zero, before: new Date().toISOString(), limit: 100 },
          tx,
        )
      ).includes(attachmentId),
    );
    // Final unlink must make every unreferenced version eligible for reconciliation.
    const unlinkedSeries = randomUUID(),
      first = randomUUID(),
      second = randomUUID();
    await sql`INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES(${unlinkedSeries}::uuid,${zero}::uuid,${zero}::uuid)`.execute(
      tx,
    );
    for (const [id, version] of [
      [first, 1],
      [second, 2],
    ] as const)
      await sql`INSERT INTO document.attachment(id,tenant_id,series_id,version_no,parent_attachment_id,file_name,storage_bucket,storage_key,status,is_active,uploaded_by,created_by)
        VALUES(${id}::uuid,${zero}::uuid,${unlinkedSeries}::uuid,${version},${version === 2 ? first : null}::uuid,'version.pdf','review-fixture',${id},'active',true,${zero}::uuid,${zero}::uuid)`.execute(
        tx,
      );
    await sql`INSERT INTO document.attachment_link(tenant_id,entity_type,entity_id,attachment_series_id,link_kind,created_by)
      VALUES(${zero}::uuid,'business_partner',${record},${unlinkedSeries}::uuid,'context',${zero}::uuid)`.execute(
      tx,
    );
    assert.deepEqual(
      await attachments.unlink!(
        { ...identity, attachmentId: second },
        { entityType: "business_partner", entityId: record },
        tx,
      ),
      { unlinked: true, orphaned: true },
    );
    const versions = (
      await sql<{
        status: string;
      }>`SELECT status FROM document.attachment WHERE series_id=${unlinkedSeries}::uuid`.execute(
        tx,
      )
    ).rows;
    assert.deepEqual(
      versions.map((v) => v.status),
      ["orphaned", "orphaned"],
    );
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
  console.log(
    "PASS: cross-record association denial, comment-pin reconciliation, shared-pin retention, series revision conflict, effective retention, candidate exclusion, all-version orphaning (all rolled back)",
  );
} finally {
  await db.destroy();
}
