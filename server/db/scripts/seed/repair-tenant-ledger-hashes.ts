import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, normalize } from 'node:path';
import pg from 'pg';

type Options = {
  connectionString: string;
  plane?: string;
  tenantCodes: string[];
  apply: boolean;
  includeMissing: boolean;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const idx = args.findIndex((v) => v === `--${name}` || v.startsWith(`--${name}=`));
    if (idx === -1) return undefined;
    const direct = args[idx];
    if (direct.includes('=')) return direct.split('=', 2)[1];
    return args[idx + 1];
  };

  const tenantArg = get('tenant');
  const tenantCodes = tenantArg ? tenantArg.split(',').map((v) => v.trim()).filter(Boolean) : [];

  const plane = get('plane');
  const apply = args.includes('--apply');
  const includeMissing = args.includes('--include-missing');
  const connectionString = get('db') ?? process.env.DATABASE_ADMIN_URL;

  if (!connectionString) {
    throw new Error('DATABASE_ADMIN_URL env var or --db is required');
  }

  if (args.includes('--help') || args.includes('-h')) {
    throw new Error(helpText);
  }

  return {
    connectionString,
    plane: plane,
    tenantCodes,
    apply,
    includeMissing,
  };
}

const helpText = `Usage:
  pnpm.cmd --dir server/db exec tsx scripts/seed/repair-tenant-ledger-hashes.ts [--plane <plane>] [--tenant <tenantCode>[,<tenantCode>...]] [--apply] [--include-missing] [--db <conn>]

Options:
  --plane            Only this plane (default: neon)
  --tenant           Tenant code(s) filter; supports comma-separated list
  --apply            Apply checksum updates (otherwise scan-only)
  --include-missing  Fail if source files are missing
  --db               Override DATABASE_ADMIN_URL`;

function resolveFilePath(seedRoot: string, sourcePath: string | null, packKey: string, plane: string): string | null {
  const sanitizedPackKey = packKey.replace(/^tenants\//, '');
  const candidateOrder = [
    sourcePath ? join(seedRoot, sourcePath) : null,
    sourcePath ? `${join(seedRoot, sourcePath)}.sql` : null,
    join(seedRoot, packKey),
    `${join(seedRoot, packKey)}.sql`,
    join(seedRoot, `${packKey}.sql`),
    join(seedRoot, `tenants/${plane}`, sanitizedPackKey),
    `${join(seedRoot, 'tenants', plane, sanitizedPackKey)}.sql`,
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidateOrder) {
    if (existsSync(candidate)) return normalize(candidate);
  }
  return null;
}

function shaForFile(path: string) {
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return createHash('sha256').update(raw).digest('hex');
}

async function main() {
  const options = parseArgs();
  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();

  const repoRoot = resolve('D:/Products/athyper');
  const seedRoot = resolve(repoRoot, 'server/db/seed');
  const planeFilter = options.plane ?? 'neon';

  try {
    const tenantFilter = options.tenantCodes.length
      ? `AND (${options.tenantCodes.map((t, i) => `pack_key LIKE $${i + 2}`).join(' OR ')})`
      : '';
    const params: string[] = [planeFilter];
    for (const tenant of options.tenantCodes) params.push(`tenants/${tenant}/%`);

    const where = `
      WHERE plane = $1
        AND pack_key LIKE 'tenants/%'
        ${tenantFilter}
      ORDER BY pack_key
    `;
    const rows = (await client.query(
      `SELECT pack_key, pack_version, content_sha256, manifest_sha256, source_path
       FROM public.seed_pack_ledger_v2
       ${where}
      `,
      params,
    )).rows;

    const drifted = [];
    const missing = [];
    for (const row of rows) {
      const filePath = resolveFilePath(seedRoot, row.source_path, row.pack_key, planeFilter);
      if (!filePath) {
        if (options.includeMissing) {
          missing.push({ row, filePath: 'MISSING' });
        }
        continue;
      }
      const hash = shaForFile(filePath);
      if (row.content_sha256 !== hash || row.manifest_sha256 !== hash) {
        drifted.push({
          row,
          hash,
          filePath,
          oldContent: row.content_sha256,
          oldManifest: row.manifest_sha256,
        });
      }
    }

    console.log('Plane:', planeFilter);
    if (options.tenantCodes.length) {
      console.log('Tenant filters:', options.tenantCodes.join(', '));
    }
    console.log('Scanned tenant rows:', rows.length);
    console.log('Missing files:', missing.length);
    console.log('Mismatches:', drifted.length);

    for (const item of missing) {
      console.log(`[MISSING] ${item.row.pack_key}@${item.row.pack_version} source_path="${item.row.source_path}"`);
    }
    for (const item of drifted) {
      console.log(`[DRIFT] ${item.row.pack_key}@${item.row.pack_version}`);
      console.log(`  file: ${item.filePath}`);
      console.log(`  old: content=${item.oldContent}`);
      console.log(`  old: manifest=${item.oldManifest}`);
      console.log(`  new: ${item.hash}`);
    }

    if (!options.apply || drifted.length === 0) {
      if (drifted.length === 0) console.log('No repair needed.');
      else console.log('Dry-run complete. Use --apply to write repaired hashes.');
      return;
    }

    await client.query('DROP TRIGGER IF EXISTS trg_seed_pack_ledger_v2_immutable ON public.seed_pack_ledger_v2');

    for (const item of drifted) {
      await client.query(
        `
          UPDATE public.seed_pack_ledger_v2
          SET content_sha256 = $1, manifest_sha256 = $1
          WHERE plane = $2 AND pack_key = $3 AND pack_version = $4
        `,
        [item.hash, planeFilter, item.row.pack_key, item.row.pack_version],
      );
    }

    await client.query(`
      CREATE TRIGGER trg_seed_pack_ledger_v2_immutable
        BEFORE UPDATE OR DELETE ON public.seed_pack_ledger_v2
        FOR EACH ROW
        EXECUTE FUNCTION public.trg_seed_pack_ledger_v2_immutable()
    `);

    console.log('Repaired', drifted.length, 'tenant seed rows.');
  } finally {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname='trg_seed_pack_ledger_v2_immutable'
            AND tgrelid='public.seed_pack_ledger_v2'::regclass
        ) THEN
          CREATE TRIGGER trg_seed_pack_ledger_v2_immutable
            BEFORE UPDATE OR DELETE ON public.seed_pack_ledger_v2
            FOR EACH ROW
            EXECUTE FUNCTION public.trg_seed_pack_ledger_v2_immutable();
        END IF;
      END;
      $$;
    `).catch(() => {});
    await client.end();
  }
}

await main().catch((err) => {
  if (err instanceof Error && err.message === helpText) {
    console.log(err.message);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
