import { sql, type Transaction } from "kysely";
import type { ContactChallenge, ContactChallengeRepository } from "./local-contact-challenge.js";
type Tx = Transaction<Record<string, never>>;
export class KyselyContactChallengeRepository implements ContactChallengeRepository<Tx> {
  async insert(c: ContactChallenge, tx: Tx) {
    await sql`INSERT INTO master.local_contact_challenge(id,tenant_id,principal_id,contact_id,value,token_hash,expires_at)
      VALUES (${c.id}::uuid,${c.tenantId}::uuid,${c.principalId}::uuid,${c.contactId}::uuid,${c.value},${c.tokenHash},${c.expiresAt}::timestamptz)`.execute(tx);
  }
  async lock(tenantId: string, id: string, tx: Tx) {
    const result = await sql<ContactChallenge>`SELECT id::text,tenant_id::text AS "tenantId",principal_id::text AS "principalId",contact_id::text AS "contactId",value,token_hash AS "tokenHash",to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt",consumed_at::text AS "consumedAt" FROM master.local_contact_challenge WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid FOR UPDATE`.execute(tx);
    return result.rows[0];
  }
  async consume(tenantId: string, id: string, tx: Tx) {
    await sql`UPDATE master.local_contact_challenge SET consumed_at=statement_timestamp() WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND consumed_at IS NULL`.execute(tx);
  }
  async attempt(tenantId: string, principalId: string, operation: string, tx: Tx) {
    const result = await sql<{ attempts: number }>`INSERT INTO master.local_contact_challenge_limit(tenant_id,principal_id,operation,window_start,attempts)
      VALUES (${tenantId}::uuid,${principalId}::uuid,${operation},statement_timestamp(),1)
      ON CONFLICT (tenant_id,principal_id,operation) DO UPDATE SET
        attempts=CASE WHEN local_contact_challenge_limit.window_start<=statement_timestamp()-interval '10 minutes' THEN 1 ELSE local_contact_challenge_limit.attempts+1 END,
        window_start=CASE WHEN local_contact_challenge_limit.window_start<=statement_timestamp()-interval '10 minutes' THEN statement_timestamp() ELSE local_contact_challenge_limit.window_start END
      RETURNING attempts`.execute(tx);
    return result.rows[0]!.attempts;
  }
}
