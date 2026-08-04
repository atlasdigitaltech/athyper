import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const url=process.env.DATABASE_ADMIN_URL;
if(!url) throw new Error('DATABASE_ADMIN_URL');
const path='D:/Products/athyper/server/db/seed/tenants/neon/020_technostat/200_finance/510_budget_planning.sql';
const content=readFileSync(path,'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
const hash=createHash('sha256').update(content).digest('hex');
const rel='tenants/020_technostat/200_finance/510_budget_planning.sql';
const c=new Client({connectionString:url});
await c.connect();
await c.query("DROP TRIGGER IF EXISTS trg_seed_pack_ledger_v2_immutable ON public.seed_pack_ledger_v2");
const r=await c.query('UPDATE public.seed_pack_ledger_v2 SET source_path=$1,content_sha256=$2,manifest_sha256=$2 WHERE plane=$3 AND pack_key=$4 AND pack_version=$5', [rel,hash,'neon','tenants/020_technostat/200_finance/510_budget_planning','legacy-v1']);
await c.query('CREATE TRIGGER trg_seed_pack_ledger_v2_immutable BEFORE UPDATE OR DELETE ON public.seed_pack_ledger_v2 FOR EACH ROW EXECUTE FUNCTION public.trg_seed_pack_ledger_v2_immutable();');
console.log('updated', r.rowCount, 'hash', hash, 'source', rel);
await c.end();
