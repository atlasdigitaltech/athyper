/** Real ledger qualification; controlled authorization/consent ports; all fixture writes roll back. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createKyselySlaAutomationRepository } from "../../../server/packages/platform/workflow/src/index.js";
import { createSupplierProcessCommunications } from "../../../server/apps/platform-host/src/composition/supplier-process-communications.js";
import {
  createNotificationPlanner,
  createDurableNotificationDeliveryRepository,
} from "../../../server/packages/platform/notifications/src/index.js";
const require = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
);
const { Pool } = require("pg"),
  { Kysely, PostgresDialect, sql } = require("kysely");
const host = execFileSync(
  "docker",
  [
    "inspect",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
    "athyper-dev-db-1",
  ],
  { encoding: "utf8" },
).trim();
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host,
      user: "postgres",
      database: "athyper_neon",
      password: readFileSync(
        `${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`,
        "utf8",
      ).trim(),
    }),
  }),
});
const tenant = "44444444-4444-4444-8444-444444444444",
  actor = "cca94907-7519-5871-8e3c-6b11aa545c93";
const report: any = {
  at: new Date().toISOString(),
  boundary:
    "Real PostgreSQL planner/delivery ledger and retained real document outcomes; controlled authorization and consent ports; rollback only",
  checks: [],
};
const rollback = new Error("ROLLBACK_FIXTURES");
try {
  await db.transaction().execute(async (tx: any) => {
    await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true),set_config('app.database_plane','neon',true)`.execute(
      tx,
    );
    await sql`UPDATE control.supplier_communication_policy SET enabled_from='2000-01-01' WHERE tenant_id=${tenant}::uuid`.execute(
      tx,
    );
    const transactions: any = {
      run: (_plane: any, _scope: any, work: any) => work(tx),
    };
    let allow = true,
      artifactAllow = true,
      consented = true;
    const consent: any = { checkAt: async () => ({ consented }) };
    const adapter = createSupplierProcessCommunications({
      transactions,
      consent,
      authorizer: { authorize: async () => ({ allowed: allow }) } as any,
      authorizeArtifact: async () => {
        if (!artifactAllow) throw Error("ARTIFACT_DENIED");
      },
    });
    const planner = createNotificationPlanner({
      transactions,
      consent,
      policy: adapter.policy,
    });
    const active = (
      await sql`SELECT i.id,i.payload,a.case_id FROM document.work_item i JOIN governance.process_attempt a ON a.id=(i.payload->>'attemptId')::uuid AND a.tenant_id=i.tenant_id JOIN document.entity_case c ON c.id=a.case_id WHERE i.tenant_id=${tenant}::uuid AND i.status='open' AND c.status IN ('submitted','in_review') ORDER BY i.created_at DESC LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
    assert.ok(active, "Fresh live open task required");
    await sql`SAVEPOINT sla_fixture`.execute(tx);
    const row = (
      await sql`SELECT * FROM document.work_item WHERE tenant_id=${tenant}::uuid AND id=${active.id}::uuid`.execute(
        tx,
      )
    ).rows[0];
    const repository = createKyselySlaAutomationRepository();
    const candidate: any = {
      id: row.id,
      tenantId: tenant,
      title: row.title,
      assigneePrincipalId: row.assignee_principal_id,
      dueAt: new Date(row.due_at).toISOString(),
      rowVersion: Number(row.row_version),
      payload: row.payload,
      reminderAt: new Date().toISOString(),
      reminderIndex: 0,
    };
    assert.equal(
      await repository.recordReminder!(
        { candidate, actorPrincipalId: actor, now: new Date().toISOString() },
        tx,
      ),
      true,
    );
    assert.equal(
      await repository.recordReminder!(
        { candidate, actorPrincipalId: actor, now: new Date().toISOString() },
        tx,
      ),
      false,
    );
    const changed = (
      await sql`SELECT * FROM document.work_item WHERE tenant_id=${tenant}::uuid AND id=${active.id}::uuid`.execute(
        tx,
      )
    ).rows[0];
    assert.deepEqual(
      changed.payload.eligibility_evidence,
      row.payload.eligibility_evidence,
    );
    assert.equal(changed.assignee_principal_id, row.assignee_principal_id);
    assert.equal(
      await repository.record(
        {
          candidate: { ...candidate, rowVersion: Number(changed.row_version) },
          actorPrincipalId: actor,
          now: new Date().toISOString(),
          escalatedTo: actor,
        },
        tx,
      ),
      true,
    );
    assert.equal(
      (
        await sql`SELECT assignee_principal_id FROM document.work_item WHERE tenant_id=${tenant}::uuid AND id=${active.id}::uuid`.execute(
          tx,
        )
      ).rows[0].assignee_principal_id,
      row.assignee_principal_id,
    );
    await sql`ROLLBACK TO SAVEPOINT sla_fixture`.execute(tx);
    report.checks.push({
      realSlaCommands: true,
      reminderReplayCreatesNoWork: true,
      escalationPreservesVotingAssignment: true,
    });

    const reminder: any = {
      id: randomUUID(),
      planeKey: "neon",
      tenantId: tenant,
      actorPrincipalId: actor,
      eventCode: "workflow.work_item.reminder",
      entityType: "workflow.work_item",
      entityId: active.id,
      occurredAt: new Date().toISOString(),
      payload: { reminder_at: "2026-09-14T15:00:00Z" },
    };
    const current: any = await adapter.policy.prepare(reminder, tx);
    assert.ok(current);
    assert.equal(current.payload.communication.workItemId, active.id);
    const target = current.recipientPrincipalIds[0];
    assert.equal(
      await adapter.policy.authorizeRecipient(current, target, "in_app", tx),
      true,
    );
    await sql`SAVEPOINT stale_task`.execute(tx);
    await sql`UPDATE document.work_item SET status='cancelled' WHERE tenant_id=${tenant}::uuid AND id=${active.id}::uuid`.execute(
      tx,
    );
    assert.equal(
      await adapter.policy.authorizeRecipient(current, target, "in_app", tx),
      false,
    );
    await sql`ROLLBACK TO SAVEPOINT stale_task`.execute(tx);
    const submitted = (
      await sql`SELECT * FROM event.outbox WHERE tenant_id=${tenant}::uuid AND entity_id=${active.case_id}::uuid AND event_type='entity.case.submitted' ORDER BY created_at DESC LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
    const submission: any = await adapter.policy.prepare(
      {
        ...reminder,
        id: submitted.id,
        eventCode: submitted.event_type,
        entityType: submitted.entity_type,
        entityId: submitted.entity_id,
        payload: submitted.payload,
        occurredAt: new Date(submitted.created_at).toISOString(),
      },
      tx,
    );
    assert.equal(submission.eventCode, "supplier.onboarding.notice.submitted");
    assert.deepEqual(submission.recipientPrincipalIds, [actor]);
    report.checks.push({
      liveSubmissionMicrosecondTimestamp: true,
      requesterOnly: true,
      currentReminderEligible: true,
      closedTaskReminderSuppressed: true,
    });
    const rows = (
      await sql`SELECT o.* FROM event.outbox o JOIN governance.process_document_job j ON j.id=(o.payload->>'jobId')::uuid AND j.tenant_id=o.tenant_id JOIN governance.process_attempt a ON a.id=j.attempt_id AND a.tenant_id=j.tenant_id WHERE o.tenant_id=${tenant}::uuid AND o.event_type='process.document.ready' AND j.status='ready' AND j.purpose IN ('decision_document','activation_confirmation') AND a.attempt_number=(SELECT max(a2.attempt_number) FROM governance.process_attempt a2 WHERE a2.tenant_id=a.tenant_id AND a2.case_id=a.case_id) ORDER BY o.created_at DESC`.execute(
        tx,
      )
    ).rows;
    assert.ok(rows.length >= 2);
    for (const purpose of ["decision_document", "activation_confirmation"]) {
      const o = rows.find((r: any) => r.payload.purpose === purpose);
      assert.ok(o, purpose);
      await sql`SAVEPOINT gate_failure_fixture`.execute(tx);
      const beforeGate = (
        await sql`SELECT status,row_version FROM document.entity_case WHERE id=${o.payload.coordinate.caseId}::uuid AND tenant_id=${tenant}::uuid`.execute(
          tx,
        )
      ).rows;
      for (let n = 0; n < 5; n++)
        await sql`SELECT document.command_process_document_job(${tenant}::uuid,${o.payload.jobId}::uuid,'gate_failed',NULL::uuid,'{"code":"P7_CONTROLLED_GATE_FAILURE"}'::jsonb,${actor}::uuid)`.execute(
          tx,
        );
      const failed = (
        await sql`SELECT * FROM event.outbox WHERE tenant_id=${tenant}::uuid AND entity_id=${o.payload.jobId}::uuid AND event_type='process.document.gate_failed' ORDER BY (payload->>'failureCount')::integer DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      assert.ok(failed);
      assert.ok(Number(failed.payload.failureCount) >= 5);
      const attention: any = await adapter.policy.prepare(
        {
          id: failed.id,
          planeKey: "neon",
          tenantId: tenant,
          actorPrincipalId: actor,
          eventCode: failed.event_type,
          entityType: failed.entity_type,
          entityId: failed.entity_id,
          payload: failed.payload,
          occurredAt: new Date(failed.created_at).toISOString(),
        },
        tx,
      );
      assert.equal(attention.eventCode, "supplier.onboarding.notice.attention");
      assert.deepEqual(
        (
          await sql`SELECT status,row_version FROM document.entity_case WHERE id=${o.payload.coordinate.caseId}::uuid AND tenant_id=${tenant}::uuid`.execute(
            tx,
          )
        ).rows,
        beforeGate,
      );
      await sql`ROLLBACK TO SAVEPOINT gate_failure_fixture`.execute(tx);
      report.checks.push({
        purpose,
        persistentGateFailureCommitted: true,
        operationalNoticeSelected: true,
        businessOutcomeUnchanged: true,
      });
      const source: any = {
        id: o.id,
        planeKey: "neon",
        tenantId: tenant,
        actorPrincipalId: o.actor_id,
        eventCode: o.event_type,
        entityType: o.entity_type,
        entityId: o.entity_id,
        payload: o.payload,
        occurredAt: new Date(o.created_at).toISOString(),
      };
      const prepared: any = await adapter.policy.prepare(source, tx);
      assert.ok(prepared);
      assert.equal(
        prepared.payload.communication.documentJobId,
        o.payload.jobId,
      );
      const replay: any = await adapter.policy.prepare(
        { ...source, id: randomUUID() },
        tx,
      );
      assert.equal(replay.id, prepared.id);
      await planner.plan(source);
      await planner.plan({ ...source, id: randomUUID() });
      const messages = (
        await sql`SELECT * FROM event.notification_message WHERE tenant_id=${tenant}::uuid AND metadata->>'source_event_id'=${prepared.id}`.execute(
          tx,
        )
      ).rows;
      assert.equal(messages.length, 1);
      const deliveries = (
        await sql`SELECT * FROM event.notification_delivery WHERE tenant_id=${tenant}::uuid AND message_id=${messages[0].id}::uuid`.execute(
          tx,
        )
      ).rows;
      assert.ok(deliveries.length);
      const row = deliveries.find((d: any) => d.channel === "in_app");
      assert.ok(row);
      const delivery: any = {
        id: row.id,
        messageId: row.message_id,
        tenantId: tenant,
        planeKey: "neon",
        principalId: row.recipient_id,
        actorPrincipalId: actor,
        channel: "in_app",
        recipientAddress: row.recipient_addr,
        payload: row.channel_detail,
        attemptCount: 1,
        maxAttempts: 1,
        workerId: "p7-rollback",
      };
      assert.equal((await adapter.authorizeDelivery(delivery)).allowed, true);
      const email = deliveries.find((d: any) => d.channel === "email");
      assert.ok(email, "Pilot email contacts required");
      const emailDelivery = {
        ...delivery,
        id: email.id,
        channel: "email",
        recipientAddress: email.recipient_addr,
        payload: email.channel_detail,
      };
      assert.equal(
        (await adapter.authorizeDelivery(emailDelivery)).allowed,
        true,
      );
      await sql`SAVEPOINT contact_expiry`.execute(tx);
      await sql`UPDATE master.contact_link SET effective_until=now()-interval '1 second' WHERE tenant_id=${tenant}::uuid AND owner_id=${emailDelivery.principalId}::uuid AND channel_type='email' AND effective_from<now()-interval '1 second'`.execute(tx);
      assert.equal((await adapter.authorizeDelivery(emailDelivery)).allowed,false);
      await sql`ROLLBACK TO SAVEPOINT contact_expiry`.execute(tx);
      consented = false;
      assert.equal(
        (await adapter.authorizeDelivery(emailDelivery)).allowed,
        false,
      );
      consented = true;
      assert.equal(
        (
          await adapter.authorizeDelivery({
            ...emailDelivery,
            recipientAddress: "changed@example.invalid",
          })
        ).allowed,
        false,
      );
      report.checks.push({
        purpose,
        consentRevocationSuppressesDelivery: true,
        expiredContactSuppressesDelivery: true,
        changedDestinationSuppressesDelivery: true,
      });
      artifactAllow = false;
      assert.equal((await adapter.authorizeDelivery(delivery)).allowed, false);
      artifactAllow = true;
      allow = false;
      assert.equal((await adapter.authorizeDelivery(delivery)).allowed, false);
      allow = true;
      const forged = {
        ...delivery,
        payload: {
          data: {
            ...prepared.payload,
            communication: {
              ...prepared.payload.communication,
              selectionId: randomUUID(),
            },
          },
        },
      };
      assert.equal((await adapter.authorizeDelivery(forged)).allowed, false);
      const before = (
        await sql`SELECT status,row_version FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND id=${prepared.entityId}::uuid`.execute(
          tx,
        )
      ).rows;
      const repository = createDurableNotificationDeliveryRepository({
        transactions,
        onTerminalFailure: adapter.onTerminalFailure,
      });
      await repository.complete(
        delivery,
        {
          delivered: false,
          retryable: false,
          error: "P7_CONTROLLED_TRANSPORT_FAILURE",
          durationMs: 1,
        },
        actor,
      );
      await adapter.onTerminalFailure(delivery, "same failure", tx);
      const notices = (
        await sql`SELECT id FROM event.outbox WHERE tenant_id=${tenant}::uuid AND event_key=${"supplier-notice-failure:" + delivery.messageId}`.execute(
          tx,
        )
      ).rows;
      assert.equal(notices.length, 1);
      const failureSource=(await sql`SELECT * FROM event.outbox WHERE tenant_id=${tenant}::uuid AND id=${notices[0].id}::uuid`.execute(tx)).rows[0];
      const safeAttention:any=await adapter.policy.prepare({id:failureSource.id,planeKey:'neon',tenantId:tenant,actorPrincipalId:actor,eventCode:failureSource.event_type,entityType:failureSource.entity_type,entityId:failureSource.entity_id,payload:{...failureSource.payload,caseUrl:'https://untrusted.invalid'},occurredAt:new Date(failureSource.created_at).toISOString()},tx);
      assert.ok(safeAttention);assert.ok(safeAttention.payload.caseUrl.startsWith('https://neon.dev.athyper.test/'));assert.equal(new URL(safeAttention.payload.caseUrl).searchParams.get('attemptId'),prepared.payload.communication.attemptId);

      assert.deepEqual(
        (
          await sql`SELECT status,row_version FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND id=${prepared.entityId}::uuid`.execute(
            tx,
          )
        ).rows,
        before,
      );
      report.checks.push({
        purpose,
        canonicalReplayOneMessage: true,
        artifactPermissionRechecked: true,
        casePermissionRechecked: true,
        wrongSelectionSuppressed: true,
        terminalFailureOneOperationalNotice: true,
        businessOutcomeUnchanged: true,
      });
    }
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
  report.rolledBack = true;
  report.passed = true;
} finally {
  await db.destroy();
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-communications-db.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
