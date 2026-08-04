import { Client } from 'pg';

(async () => {
  const pattern = process.argv[2] || '%';
  const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();
  const res = await client.query(
    `SELECT pack_key, content_sha256
       FROM public.seed_pack_ledger_v2
      WHERE pack_key LIKE $1
      ORDER BY pack_key`,
    [pattern]
  );
  console.log(res.rows);
  await client.end();
})();
