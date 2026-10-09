import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPublicationPolicyEnrollment } from "./policy-enrollment.js";
import { parseNativeCompilationRecoveryPolicy } from "./native-compilation-recovery-policy.js";

// Actual DEV database and restricted control role, entirely rolled back.
// Synthetic request contexts qualify persistence boundaries, never human approval.
it.skipIf(process.env.NATIVE_COMPILATION_RECOVERY_POSTGRES !== "1")(
  "atomically replaces native recovery, preserves original policy and rolls back failed audit",
  async () => {
    const file = process.env.NATIVE_RECOVERY_CANDIDATE;
    if (!file) throw Error("NATIVE_RECOVERY_CANDIDATE required");
    const policy = parseNativeCompilationRecoveryPolicy(
      JSON.parse(readFileSync(file, "utf8")),
    );
    policy.policyId = `qualification.native.${randomUUID()}`;
    const c = JSON.parse(
      execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
        encoding: "utf8",
      }),
    )[0];
    if (
      !c.State.Running ||
      c.Config.Labels["com.docker.compose.project"] !== "athyper-dev"
    )
      throw Error("DEV required");
    const env = Object.fromEntries(
      c.Config.Env.map((v: string) => [
        v.slice(0, v.indexOf("=")),
        v.slice(v.indexOf("=") + 1),
      ]),
    );
    const secret = c.Mounts.find(
      (m: { Destination: string }) =>
        m.Destination === env.POSTGRES_PASSWORD_FILE,
    )?.Source;
    if (!secret?.includes("/.athyper/instances/dev/secrets/"))
      throw Error("DEV secret required");
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: new Pool({
          host: (
            Object.values(c.NetworkSettings.Networks)[0] as {
              IPAddress: string;
            }
          ).IPAddress,
          user: env.POSTGRES_USER,
          password: readFileSync(secret, "utf8").trim(),
          database: "athyper_studio",
          max: 1,
        }),
      }),
    });
    const rollback = Error("qualification rollback");
    try {
      const original = (
        await sql<{
          policy: {
            plan: { members: { authorId: string; reviewerId: string }[] };
          };
        }>`SELECT action_config->'policy' policy FROM control.policy_rule WHERE policy_definition_id=${policy.originalPolicy.id}::uuid`.execute(
          db,
        )
      ).rows[0]!.policy;
      const principals = (
        await sql<{
          id: string;
          auth_epoch: number;
        }>`SELECT id,auth_epoch FROM master.principal WHERE tenant_id=${policy.authorityTenantId}::uuid AND id=ANY(${[original.plan.members[0]!.authorId, original.plan.members[0]!.reviewerId]}::uuid[])`.execute(
          db,
        )
      ).rows;
      const context = (id: string) =>
        ({
          principalId: id,
          tenantId: policy.authorityTenantId,
          planeKey: "studio",
          realmKey: "platform-control",
          assurance: "elevated",
          authEpoch: principals.find((p) => p.id === id)!.auth_epoch,
          requestId: randomUUID(),
        }) as VerifiedRequestContext;
      const admin = context(original.plan.members[0]!.authorId),
        owner = context(original.plan.members[0]!.reviewerId);
      const baseline = (
        await sql`SELECT id,status,definition_hash FROM control.policy_definition WHERE entity_type='metadata.publication' ORDER BY id`.execute(
          db,
        )
      ).rows;
      await expect(
        db.transaction().execute(async (tx) => {
          await sql`SET LOCAL lock_timeout='3s'`.execute(tx);
          const pins = (
            await sql<{
              id: string;
              hash: string;
            }>`SELECT d.id,d.definition_hash hash FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id WHERE d.tenant_id=${policy.authorityTenantId}::uuid AND d.status='active' AND r.action_config#>>'{policy,schema}'='athyper.dev-native-compilation-recovery/1' AND r.action_config#>>'{policy,originalPolicy,id}'=${policy.originalPolicy.id}`.execute(
              tx,
            )
          ).rows;
          expect(pins).toHaveLength(1);
          let count = 0,
            failAudit = false;
          const bound = new Proxy(tx, {
            get(target, key) {
              if (key === "transaction")
                return () => ({
                  setIsolationLevel: () => ({
                    execute: async (fn: (t: typeof tx) => Promise<unknown>) => {
                      const name = `native_recovery_${++count}`;
                      await sql.raw(`SAVEPOINT ${name}`).execute(tx);
                      try {
                        const result = await fn(tx);
                        await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(tx);
                        return result;
                      } catch (e) {
                        await sql
                          .raw(`ROLLBACK TO SAVEPOINT ${name}`)
                          .execute(tx);
                        await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(tx);
                        throw e;
                      }
                    },
                  }),
                });
              const v = Reflect.get(target, key);
              return typeof v === "function" ? v.bind(target) : v;
            },
          });
          const service = createPublicationPolicyEnrollment({
            database: bound,
            authorizer: {
              authorize: async () => ({
                allowed: true,
                reason: "qualification",
              }),
            },
            audit: {
              async record(event, transaction) {
                const r = (
                  await sql<{
                    id: string;
                  }>`SELECT audit.append_event(p_event_code:=${event.eventCode},p_operation:='execute'::audit.operation_d,p_entity_type:=${event.entityType!},p_entity_id:=${event.entityId!}::uuid,p_outcome:='success'::audit.outcome_d,p_severity:='critical'::audit.event_severity_d,p_context:=${JSON.stringify(event.metadata)}::jsonb) id`.execute(
                    transaction!,
                  )
                ).rows[0]!;
                if (failAudit) throw Error("audit failure after write");
                return {
                  ...event,
                  id: r.id,
                  occurredAt: new Date().toISOString(),
                };
              },
            },
            signer: {
              sign: async () => {
                throw Error("unexpected signing");
              },
              verify: async () => false,
            },
            environment: "local",
            instance: "dev",
            domainSuffix: "dev.athyper.test",
            authority: {
              tenantId: policy.authorityTenantId,
              realmKey: "platform-control",
              issuer: "https://iam.dev.athyper.test/realms/platform-control",
              audience: "athyper-platform-control-api",
            },
          });
          await sql`SET LOCAL ROLE athyper_control_api`.execute(tx);
          const pending = await service.propose(admin, policy);
          await expect(
            service.activate(owner, pending.id, pending.hash),
          ).rejects.toThrow("ALREADY_ACTIVE");
          await expect(
            service.replace(admin, pending.id, pending.hash, pins),
          ).rejects.toThrow();
          await expect(
            service.replace(owner, pending.id, pending.hash, [
              { ...pins[0]!, hash: "0".repeat(64) },
            ]),
          ).rejects.toThrow();
          failAudit = true;
          await expect(
            service.replace(owner, pending.id, pending.hash, pins),
          ).rejects.toThrow("audit failure after write");
          failAudit = false;
          const status = async (id: string) =>
            (
              await sql<{
                status: string;
              }>`SELECT status FROM control.policy_definition WHERE id=${id}::uuid`.execute(
                tx,
              )
            ).rows[0]!.status;
          expect(await status(pending.id)).toBe("pending_approval");
          expect(await status(pins[0]!.id)).toBe("active");
          expect(
            await service.replace(owner, pending.id, pending.hash, pins),
          ).toMatchObject({ status: "active", replayed: false });
          expect(await status(pending.id)).toBe("active");
          expect(await status(pins[0]!.id)).toBe("retired");
          expect(await status(policy.originalPolicy.id)).toBe("active");
          expect(
            await service.replace(owner, pending.id, pending.hash, pins),
          ).toMatchObject({ replayed: true });
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(
        (
          await sql`SELECT id,status,definition_hash FROM control.policy_definition WHERE entity_type='metadata.publication' ORDER BY id`.execute(
            db,
          )
        ).rows,
      ).toEqual(baseline);
    } finally {
      await db.destroy();
    }
  },
  60000,
);
