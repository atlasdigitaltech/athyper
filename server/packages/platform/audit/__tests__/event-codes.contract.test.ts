/**
 * CI contract-alignment test — verifies that every exported event code in
 * event-codes.ts matches at least one active audit_event_contract row, and
 * every exported reason code in reason-codes.ts matches the seed catalog.
 *
 * Runs against the local dev DB (DATABASE_URL env var).
 * Skipped automatically when DATABASE_URL is absent (CI with no DB sidecar).
 *
 * Run explicitly:
 *   pnpm --filter @athyper/svc-audit test __tests__/event-codes.contract.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "kysely";
import type { Kysely } from "kysely";

// ── All exported event code values ────────────────────────────────────────────

import {
  Pci, Pii, Audit,
  IamAuth, IamSession, IamAuthz, IamGeneral,
  RecordAccess, Record,
  Period, Inbox, Integration, Import,
  AiSupport, Ai,
  Schema, Notification, Config, System, Action,
} from "../event-codes.js";

import { ReasonCode } from "../reason-codes.js";

const ALL_EVENT_CODES: string[] = [
  ...Object.values(Pci),
  ...Object.values(Pii),
  ...Object.values(Audit),
  ...Object.values(IamAuth),
  ...Object.values(IamSession),
  ...Object.values(IamAuthz),
  ...Object.values(IamGeneral),
  ...Object.values(RecordAccess),
  ...Object.values(Record),
  ...Object.values(Period),
  ...Object.values(Inbox),
  ...Object.values(Integration),
  ...Object.values(Import),
  ...Object.values(AiSupport),
  ...Object.values(Ai),
  ...Object.values(Schema),
  ...Object.values(Notification),
  ...Object.values(Config),
  ...Object.values(System),
  ...Object.values(Action),
];

const ALL_REASON_CODES: string[] = Object.values(ReasonCode);

// ── DB setup ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env["DATABASE_URL"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | null = null;

beforeAll(async () => {
  if (!DATABASE_URL) return;
  const { Kysely, PostgresDialect } = await import("kysely");
  const { default: pg } = await import("pg");
  db = new Kysely({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: DATABASE_URL, max: 1 }) }),
  });
});

afterAll(async () => {
  await db?.destroy();
});

// ── Event code tests ──────────────────────────────────────────────────────────

describe("event-codes.ts → audit_event_contract alignment", () => {
  it.skipIf(!DATABASE_URL)("every exported event code matches an active contract pattern", async () => {
    const unmatched: string[] = [];

    for (const code of ALL_EVENT_CODES) {
      const row = await sql<{ contract_code: string }>`
        SELECT code AS contract_code
          FROM master.audit_event_contract
         WHERE status = 'active'
           AND ${code} ~ event_code_pattern
         ORDER BY priority
         LIMIT 1
      `.execute(db!);

      if (row.rows.length === 0) {
        unmatched.push(code);
      }
    }

    expect(
      unmatched,
      `These event codes have no matching active contract:\n${unmatched.map(c => `  "${c}"`).join("\n")}`,
    ).toHaveLength(0);
  });

  it.skipIf(!DATABASE_URL)("all 22 active contracts have at least one representative code", async () => {
    const contracts = await sql<{ code: string; pattern: string }>`
      SELECT code, event_code_pattern AS pattern
        FROM master.audit_event_contract
       WHERE status = 'active'
         AND code <> 'entity_row_change_event'  -- DB trigger only, no app constants
       ORDER BY priority
    `.execute(db!);

    const uncovered: string[] = [];

    for (const contract of contracts.rows) {
      const hasMatch = ALL_EVENT_CODES.some(c => new globalThis.RegExp(contract.pattern).test(c));
      if (!hasMatch) {
        uncovered.push(`${contract.code} (${contract.pattern})`);
      }
    }

    expect(
      uncovered,
      `These contracts have no representative event code exported:\n${uncovered.map(c => `  ${c}`).join("\n")}`,
    ).toHaveLength(0);
  });
});

// ── Reason code tests ─────────────────────────────────────────────────────────

describe("reason-codes.ts → seed_audit_reason_catalog alignment", () => {
  it.skipIf(!DATABASE_URL)("every exported reason code exists in at least one tenant's catalog", async () => {
    const unmatched: string[] = [];

    for (const code of ALL_REASON_CODES) {
      const row = await sql<{ code: string }>`
        SELECT code
          FROM master.audit_reason_code
         WHERE code = ${code}
           AND origin = 'platform_seed'
           AND status = 'active'
         LIMIT 1
      `.execute(db!);

      if (row.rows.length === 0) {
        unmatched.push(code);
      }
    }

    expect(
      unmatched,
      `These reason codes are not in master.audit_reason_code (origin=platform_seed):\n${unmatched.map(c => `  "${c}"`).join("\n")}`,
    ).toHaveLength(0);
  });

  it("exported reason code count matches seed (35)", () => {
    expect(ALL_REASON_CODES).toHaveLength(35);
  });

  it("no duplicate reason codes exported", () => {
    const unique = new Set(ALL_REASON_CODES);
    expect(unique.size).toBe(ALL_REASON_CODES.length);
  });
});
