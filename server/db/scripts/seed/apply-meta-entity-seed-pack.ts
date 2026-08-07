#!/usr/bin/env tsx
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

interface MetaEntitySeedPack {
  readonly packId: string;
  readonly version: string;
  readonly databasePlane: "athyper";
  readonly manifest: string;
  readonly defaultProfile: "core";
  readonly legacyDiscovery: false;
  readonly targetSchemas: readonly string[];
  readonly files: readonly string[];
  readonly profiles: Readonly<Record<"core" | "validation", readonly string[]>>;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../..");
const packRoot = resolve(databaseRoot, "seed/meta-entity");

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedPath(path: string): string {
  return relative(packRoot, path).split(sep).join("/");
}

function parseManifest(source: string): string[] {
  return source.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function main(): Promise<void> {
  const config = JSON.parse(
    await readFile(resolve(packRoot, "pack.v1.json"), "utf8"),
  ) as MetaEntitySeedPack;
  if (config.packId !== "athyper.meta-entity"
      || config.databasePlane !== "athyper"
      || config.legacyDiscovery !== false) {
    throw new Error("Meta Entity seed-pack identity or boundary is invalid.");
  }

  const manifestSource = await readFile(resolve(packRoot, config.manifest), "utf8");
  const manifestFiles = parseManifest(manifestSource);
  if (JSON.stringify(manifestFiles) !== JSON.stringify(config.files)) {
    throw new Error("pack.v1.json files must exactly match the ordered manifest.");
  }
  if (new Set(manifestFiles).size !== manifestFiles.length) {
    throw new Error("Meta Entity seed manifest contains duplicate paths.");
  }

  const profile = argument("--profile") ?? config.defaultProfile;
  if (profile !== "core" && profile !== "validation") {
    throw new Error("Meta Entity --profile must be core or validation.");
  }
  const selectedFiles = config.profiles[profile];
  if (!selectedFiles?.length
      || selectedFiles.some((path) => !manifestFiles.includes(path))
      || JSON.stringify(selectedFiles) !== JSON.stringify(
        manifestFiles.filter((path) => selectedFiles.includes(path)),
      )) {
    throw new Error(`Meta Entity ${profile} profile is not an ordered manifest subset.`);
  }

  const sources: Array<{ path: string; sql: string }> = [];
  for (const manifestPath of selectedFiles) {
    const absolutePath = resolve(packRoot, manifestPath);
    const relativePath = normalizedPath(absolutePath);
    if (relativePath !== manifestPath || relativePath.startsWith("../")) {
      throw new Error(`Unsafe Meta Entity seed path: ${manifestPath}`);
    }
    if (!manifestPath.endsWith(".sql")) {
      throw new Error(`Meta Entity seed entries must be SQL: ${manifestPath}`);
    }
    sources.push({ path: manifestPath, sql: await readFile(absolutePath, "utf8") });
  }

  const manifestSha256 = sha256(manifestSource);
  const contentSha256 = sha256(
    [`profile=${profile}`, ...sources.map((source) => `${source.path}\0${source.sql}`)].join("\0"),
  );
  const effectiveVersion = `${config.version}-${profile}`;
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(JSON.stringify({
      packId: config.packId,
      version: effectiveVersion,
      profile,
      files: sources.length,
      manifestSha256,
      contentSha256,
    }, null, 2) + "\n");
    return;
  }

  const connectionString = argument("--database-url")
    ?? process.env["META_ENTITY_DATABASE_URL"]
    ?? process.env["DATABASE_URL"];
  const expectedDatabase = argument("--expected-database");
  if (!connectionString || !expectedDatabase) {
    throw new Error(
      "Use META_ENTITY_DATABASE_URL (or --database-url) and --expected-database. "
      + "The explicit database guard is required.",
    );
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const identity = await client.query<{
      database_name: string;
      session_user_name: string;
    }>("SELECT current_database() AS database_name, session_user AS session_user_name");
    const databaseName = identity.rows[0]?.database_name;
    if (databaseName !== expectedDatabase) {
      throw new Error(
        `Database guard rejected ${databaseName ?? "unknown"}; expected ${expectedDatabase}.`,
      );
    }

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.database_plane', 'athyper', true)");
    await client.query(
      "SELECT set_config('app.current_principal_id', '00000000-0000-0000-0000-000000000000', true)",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.meta_entity_seed_pack_ledger (
        pack_id          text NOT NULL,
        pack_version     text NOT NULL,
        manifest_sha256  text NOT NULL,
        content_sha256   text NOT NULL,
        source_path      text NOT NULL,
        registered_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
        registered_by   text NOT NULL DEFAULT session_user,
        PRIMARY KEY (pack_id, pack_version),
        CONSTRAINT meta_entity_seed_pack_id_chk
          CHECK (pack_id = 'athyper.meta-entity'),
        CONSTRAINT meta_entity_seed_pack_version_chk
          CHECK (pack_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
        CONSTRAINT meta_entity_seed_pack_manifest_sha_chk
          CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
        CONSTRAINT meta_entity_seed_pack_content_sha_chk
          CHECK (content_sha256 ~ '^[0-9a-f]{64}$')
      );
      CREATE TABLE IF NOT EXISTS public.meta_entity_seed_pack_execution (
        execution_id    uuid PRIMARY KEY,
        pack_id         text NOT NULL,
        pack_version    text NOT NULL,
        content_sha256  text NOT NULL,
        applied_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
        applied_by      text NOT NULL DEFAULT session_user,
        CONSTRAINT meta_entity_seed_pack_execution_fk
          FOREIGN KEY (pack_id, pack_version)
          REFERENCES public.meta_entity_seed_pack_ledger (pack_id, pack_version),
        CONSTRAINT meta_entity_seed_execution_sha_chk
          CHECK (content_sha256 ~ '^[0-9a-f]{64}$')
      );
      CREATE OR REPLACE FUNCTION public.trg_meta_entity_seed_pack_immutable()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog
      AS $function$
      BEGIN
        RAISE EXCEPTION 'meta_entity_seed_pack_ledger is immutable';
      END
      $function$;
      DROP TRIGGER IF EXISTS trg_meta_entity_seed_pack_immutable
        ON public.meta_entity_seed_pack_ledger;
      CREATE TRIGGER trg_meta_entity_seed_pack_immutable
        BEFORE UPDATE OR DELETE ON public.meta_entity_seed_pack_ledger
        FOR EACH ROW EXECUTE FUNCTION public.trg_meta_entity_seed_pack_immutable();
      REVOKE ALL ON public.meta_entity_seed_pack_ledger FROM PUBLIC;
      REVOKE ALL ON public.meta_entity_seed_pack_execution FROM PUBLIC;
    `);

    const existing = await client.query<{
      manifest_sha256: string;
      content_sha256: string;
      source_path: string;
    }>(`
      SELECT manifest_sha256, content_sha256, source_path
        FROM public.meta_entity_seed_pack_ledger
       WHERE pack_id = $1 AND pack_version = $2
    `, [config.packId, effectiveVersion]);
    const registered = existing.rows[0];
    if (registered && (
      registered.manifest_sha256 !== manifestSha256
      || registered.content_sha256 !== contentSha256
      || registered.source_path !== `server/db/seed/meta-entity#${profile}`
    )) {
      throw new Error(
        `Immutable Meta Entity seed-pack drift: ${config.packId}@${effectiveVersion}.`,
      );
    }
    if (!registered) {
      await client.query(`
        INSERT INTO public.meta_entity_seed_pack_ledger (
          pack_id, pack_version, manifest_sha256, content_sha256, source_path
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        config.packId,
        effectiveVersion,
        manifestSha256,
        contentSha256,
        `server/db/seed/meta-entity#${profile}`,
      ]);
    }

    for (const source of sources) {
      await client.query(source.sql);
    }
    await client.query(`
      INSERT INTO public.meta_entity_seed_pack_execution (
        execution_id, pack_id, pack_version, content_sha256
      ) VALUES ($1, $2, $3, $4)
    `, [randomUUID(), config.packId, effectiveVersion, contentSha256]);
    await client.query("COMMIT");
    process.stdout.write(
      `META_ENTITY_SEED_OK ${config.packId}@${effectiveVersion} profile=${profile} files=${sources.length} sha256=${contentSha256}\n`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

await main();
