import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import {
  NumberingAllocationService,
  NumberingExhaustedError,
} from "../../../packages/services/numbering-runtime/src/numbering-allocation.service.js";

const databaseUrl = process.env["NUMBERING_VERIFY_ADMIN_URL"];
if (!databaseUrl) throw new Error("NUMBERING_VERIFY_ADMIN_URL is required");
const systemTenant = "00000000-0000-0000-0000-000000000000";
const systemPrincipal = systemTenant;
const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl, max: 24 }) }) });
const service = new NumberingAllocationService(db, "neon");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const policyIds: string[] = [];

async function createPolicy(
  code: string,
  options: { reset?: string; format?: string; maximum?: number | null; scope?: string } = {},
): Promise<string> {
  const id = randomUUID();
  policyIds.push(id);
  const reset    = options.reset ?? "never";
  const timezone = reset.startsWith("calendar_") ? "UTC" : null;
  const scope    = options.scope ?? "tenant";
  await sql`INSERT INTO control.numbering_policy (
    id,tenant_id,policy_code,policy_revision,name,format_template,sequence_width,start_value,increment_by,
    maximum_value,scope_kind,reset_kind,timezone_code,status,activated_at,activated_by,created_by
  ) VALUES (${id}::uuid,NULL,${code},1,${code},${options.format ?? "T-{seq}"},4,1,1,
    ${options.maximum ?? null},${scope},${reset},${timezone},'active',now(),${systemPrincipal}::uuid,${systemPrincipal}::uuid)`.execute(db);
  return id;
}

function command(policyCode: string, occurredAt = "2026-08-02T00:00:00Z", tenantId = systemTenant, extra: Record<string, unknown> = {}) {
  return {
    allocationId: randomUUID(), tenantId, principalId: systemPrincipal, targetPlane: "neon" as const,
    policyCode, policyRevision: 1, occurredAt, ...extra,
  };
}

try {
  // ── 1. Sequential allocation ──────────────────────────────────────────────
  const sequentialCode = `smoke.sequential.${suffix}`;
  await createPolicy(sequentialCode);
  const first  = await service.allocate(command(sequentialCode));
  const second = await service.allocate(command(sequentialCode));
  if (first.allocatedValue !== 1 || second.allocatedValue !== 2 || first.formattedNumber !== "T-0001" || second.rowVersion !== 2) {
    throw new Error(`Sequential allocation failed: ${JSON.stringify({ first, second })}`);
  }

  // ── 2. Concurrent allocation (gap-free uniqueness) ────────────────────────
  const concurrentCode = `smoke.concurrent.${suffix}`;
  await createPolicy(concurrentCode);
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => service.allocate(command(concurrentCode))));
  const values = concurrent.map((item) => item.allocatedValue).sort((a, b) => a - b);
  if (JSON.stringify(values) !== JSON.stringify(Array.from({ length: 20 }, (_, i) => i + 1))) {
    throw new Error(`Concurrent values are not gap-free and unique: ${JSON.stringify(values)}`);
  }

  // ── 3. Rollback does not consume a number ─────────────────────────────────
  const rollbackCode = `smoke.rollback.${suffix}`;
  await createPolicy(rollbackCode);
  try {
    await db.transaction().execute(async (tx) => {
      await service.allocateWithinTransaction(tx, command(rollbackCode));
      throw new Error("EXPECTED_ROLLBACK");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "EXPECTED_ROLLBACK") throw error;
  }
  const afterRollback = await service.allocate(command(rollbackCode));
  if (afterRollback.allocatedValue !== 1) throw new Error(`Rollback consumed a number: ${JSON.stringify(afterRollback)}`);

  // ── 4. Calendar-year rollover (independent counter partitions) ────────────
  const rolloverCode = `smoke.rollover.${suffix}`;
  await createPolicy(rolloverCode, { reset: "calendar_year", format: "Y-{yyyy}-{seq}" });
  const yearOne = await service.allocate(command(rolloverCode, "2026-12-31T12:00:00Z"));
  const yearTwo = await service.allocate(command(rolloverCode, "2027-01-01T12:00:00Z"));
  if (yearOne.allocatedValue !== 1 || yearTwo.allocatedValue !== 1 || yearOne.resetBucket === yearTwo.resetBucket) {
    throw new Error(`Rollover did not create independent partitions: ${JSON.stringify({ yearOne, yearTwo })}`);
  }

  // ── 5. Exhaustion guard ───────────────────────────────────────────────────
  const exhaustionCode = `smoke.exhaustion.${suffix}`;
  await createPolicy(exhaustionCode, { maximum: 2 });
  await service.allocate(command(exhaustionCode));
  await service.allocate(command(exhaustionCode));
  let exhausted = false;
  try { await service.allocate(command(exhaustionCode)); }
  catch (error) { exhausted = error instanceof NumberingExhaustedError; }
  if (!exhausted) throw new Error("Exhausted policy accepted another allocation");

  // ── 6. Tenant isolation ───────────────────────────────────────────────────
  const otherTenantResult = await sql<{ id: string }>`SELECT id FROM master.tenant WHERE id<>${systemTenant}::uuid ORDER BY id LIMIT 1`.execute(db);
  const otherTenant = otherTenantResult.rows[0]?.id;
  if (!otherTenant) throw new Error("A second comparison tenant is required");
  const tenancyCode = `smoke.tenancy.${suffix}`;
  await createPolicy(tenancyCode);
  const systemNumber = await service.allocate(command(tenancyCode, undefined, systemTenant));
  const otherNumber  = await service.allocate(command(tenancyCode, undefined, otherTenant));
  if (systemNumber.allocatedValue !== 1 || otherNumber.allocatedValue !== 1 || systemNumber.counterId === otherNumber.counterId) {
    throw new Error(`Tenant partitions are not isolated: ${JSON.stringify({ systemNumber, otherNumber })}`);
  }

  // ── 7. Idempotency — same allocationId replays without incrementing ───────
  const idempotencyCode = `smoke.idempotency.${suffix}`;
  await createPolicy(idempotencyCode);
  const idempotentCmd = command(idempotencyCode);
  const fresh    = await service.allocate(idempotentCmd);
  const replayed = await service.allocate(idempotentCmd);
  if (fresh.idempotencySource !== "fresh" || replayed.idempotencySource !== "replayed") {
    throw new Error(`idempotencySource incorrect: fresh=${fresh.idempotencySource}, replayed=${replayed.idempotencySource}`);
  }
  if (fresh.allocatedValue !== replayed.allocatedValue || fresh.formattedNumber !== replayed.formattedNumber) {
    throw new Error(`Replayed result differs from original: ${JSON.stringify({ fresh, replayed })}`);
  }
  const afterReplay = await service.allocate(command(idempotencyCode));
  if (afterReplay.allocatedValue !== 2) {
    throw new Error(`Counter advanced past idempotent replay: expected 2, got ${afterReplay.allocatedValue}`);
  }

  process.stdout.write(
    "NUMBERING_ALLOCATION_SMOKE_OK sequential=2 concurrent=20 rollback=1 rollover=2 exhaustion=blocked tenants=2 idempotency=replayed\n",
  );
} finally {
  if (policyIds.length) {
    await sql`DELETE FROM runtime_meta.entity_number_counter WHERE numbering_policy_id=ANY(${policyIds}::uuid[])`.execute(db).catch(() => undefined);
    await sql`DELETE FROM control.numbering_policy WHERE id=ANY(${policyIds}::uuid[])`.execute(db).catch(() => undefined);
  }
  await db.destroy();
}
