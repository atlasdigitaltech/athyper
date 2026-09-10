import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLoopbackDatabaseTarget, isLocalDatabaseHost } from '../../lib/database-target.js';
import { parseArgs } from '../../operations/repair/repair-tenant-ledger-hashes.js';

test('database target validation supports URL IPv6 loopback and rejects malformed private hosts', () => {
  assert.equal(assertLoopbackDatabaseTarget('postgres://user@[::1]:5432/athyper_neon','athyper_neon').hostname,'[::1]');
  for (const host of ['::1','[::1]','127.0.0.1','192.168.1.2']) assert.ok(isLocalDatabaseHost(host));
  for (const host of ['10...1','10. .0.1','10.0x1.0.1','172.16..1','example.com']) assert.equal(isLocalDatabaseHost(host),false,host);
  assert.throws(() => assertLoopbackDatabaseTarget('postgres://user@[::2]/athyper_neon','athyper_neon'));
});
test('ledger CLI preserves equals signs in URLs and validates the selected plane', () => {
  const url='postgres://user:dummy%3Dvalue@localhost/athyper_neon?sslmode=disable&application_name=repair';
  assert.equal(parseArgs([`--db=${url}`]).connectionString,url);
  assert.equal(parseArgs(['--db',url]).connectionString,url);
  assert.throws(() => parseArgs(['--db',url,'--plane=neonn']),/Invalid --plane/);
});
