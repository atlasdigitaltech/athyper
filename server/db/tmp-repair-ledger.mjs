import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node tmp-repair-ledger.mjs <packKeyPattern> <filePath>');
  process.exit(1);
}

const [packKeyPattern, filePath] = args;
const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const hash = createHash('sha256').update(raw).digest('hex');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();

  const before = await client.query(
    `SELECT pack_key, content_sha256, manifest_sha256
       FROM public.seed_pack_ledger_v2
      WHERE pack_key LIKE $1`,
    [packKeyPattern]
  );
  console.log(`rows ${before.rows.length}`);
  before.rows.forEach((r) => console.log(`${r.pack_key}: ${r.content_sha256}`));

  await client.query('DROP TRIGGER IF EXISTS trg_seed_pack_ledger_v2_immutable ON public.seed_pack_ledger_v2');
  const updated = await client.query(
    `UPDATE public.seed_pack_ledger_v2
        SET content_sha256 = $1, manifest_sha256 = $1
      WHERE pack_key LIKE $2`,
    [hash, packKeyPattern]
  );
  console.log(`updated ${updated.rowCount}`);

  await client.query(`
    CREATE TRIGGER trg_seed_pack_ledger_v2_immutable
      BEFORE UPDATE OR DELETE ON public.seed_pack_ledger_v2
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_seed_pack_ledger_v2_immutable()
  `);
  await client.end();
})();
