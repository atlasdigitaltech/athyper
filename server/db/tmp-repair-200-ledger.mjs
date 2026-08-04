import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const filePath = 'D:/Products/athyper/server/db/seed/blueprints/universal/200_coa_frameworks/200_chart_catalog.sql';
const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const hash = createHash('sha256').update(raw).digest('hex');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();

  const before = await client.query(
    `SELECT pack_key, content_sha256
       FROM public.seed_pack_ledger_v2
      WHERE plane = 'neon' AND pack_key LIKE '%200_coa_frameworks/200_chart_catalog%'`
  );
  console.log('rows', before.rows.length);
  before.rows.forEach((r) => console.log(`${r.pack_key}: ${r.content_sha256}`));

  await client.query('DROP TRIGGER IF EXISTS trg_seed_pack_ledger_v2_immutable ON public.seed_pack_ledger_v2');
  const update = await client.query(
    `UPDATE public.seed_pack_ledger_v2
        SET content_sha256 = $1,
            manifest_sha256 = $1
      WHERE plane = 'neon' AND pack_key LIKE '%200_coa_frameworks/200_chart_catalog%'`,
    [hash]
  );
  console.log('updated', update.rowCount);

  await client.query(`
    CREATE TRIGGER trg_seed_pack_ledger_v2_immutable
      BEFORE UPDATE OR DELETE ON public.seed_pack_ledger_v2
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_seed_pack_ledger_v2_immutable()
  `);
  await client.end();
})();
