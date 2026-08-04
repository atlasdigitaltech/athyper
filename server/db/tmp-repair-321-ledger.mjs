import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const filePath = resolve('D:/Products/athyper/server/db/seed/blueprints/universal/020_tax/321_tax_types.sql');
const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const hash = createHash('sha256').update(raw).digest('hex');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();

  const before = await client.query(
    `SELECT pack_key, pack_version, content_sha256, manifest_sha256
       FROM public.seed_pack_ledger_v2
      WHERE plane='neon' AND pack_key LIKE '%020_tax/321_tax_types%'`
  );
  console.log('rows', before.rows.length);
  if (before.rows.length) {
    for (const r of before.rows) {
      console.log(`${r.pack_key}@${r.pack_version} current=${r.content_sha256}`);
    }
  }

  await client.query('DROP TRIGGER IF EXISTS trg_seed_pack_ledger_v2_immutable ON public.seed_pack_ledger_v2');
  const result = await client.query(
    `UPDATE public.seed_pack_ledger_v2
        SET content_sha256=$1, manifest_sha256=$1
      WHERE plane='neon' AND pack_key LIKE '%020_tax/321_tax_types%'`,
    [hash],
  );
  console.log('updated', result.rowCount);

  await client.query(`
    CREATE TRIGGER trg_seed_pack_ledger_v2_immutable
      BEFORE UPDATE OR DELETE ON public.seed_pack_ledger_v2
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_seed_pack_ledger_v2_immutable()
  `);
  await client.query('COMMIT');
  await client.end();
})();

