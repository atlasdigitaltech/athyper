import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAuditSeedSql, main } from './read-audit-seed.mjs';
test('read audit seed is additive, deterministic and defaults to rollback', () => {
  const sql = readAuditSeedSql();
  assert.equal(sql, readAuditSeedSql());
  assert.ok(sql.endsWith('ROLLBACK;'));
  assert.ok(readAuditSeedSql(true).endsWith('COMMIT;'));
  assert.equal((sql.match(/ensure_read_audit\('master.contact_person'/g) ?? []).length, 60);
  assert.equal((sql.match(/ensure_read_audit\('document.comment'/g) ?? []).length, 12);
  assert.ok(sql.includes('fixture collision or drift'));
  assert.doesNotMatch(sql, /\bDELETE\b|\bTRUNCATE\b|\bUPDATE\s+|INSERT INTO authz\./i);
  assert.throws(() => main(['--apply']), /confirm/);
});
