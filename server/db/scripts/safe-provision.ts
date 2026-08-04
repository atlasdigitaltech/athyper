import { createHash, randomUUID } from "node:crypto";

export type ProvisionPlane = "neon" | "mesh";

export interface QueryClient {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[]; rowCount?: number | null }>;
}

export interface DestructiveResetApproval {
  readonly plane: ProvisionPlane;
  readonly expectedDatabase: string;
  readonly acknowledgement: string;
  readonly disposableEnvironmentMarker: string;
  readonly executionProfile: string;
  readonly approvalLabel: string;
  readonly refreshDisposableFingerprint?: boolean;
}

export interface DestructiveResetCliApproval extends DestructiveResetApproval {
  readonly confirmationShorthandUsed: boolean;
}

export interface SeedPackReceipt {
  readonly plane: ProvisionPlane;
  readonly packKey: string;
  readonly packVersion: string;
  readonly sourcePath: string;
  readonly contentSha256: string;
  readonly manifestSha256: string;
}

const DISPOSABLE_MARKER = "I_UNDERSTAND_DATA_WILL_BE_DESTROYED";
const DEVELOPMENT_CLEAN_RESET_PROFILE = "development_clean_reset";
const DEVELOPMENT_CLEAN_RESET_APPROVAL = "LOCAL-AUTH-V2-RESET";
const RESET_ACKNOWLEDGEMENT: Record<ProvisionPlane, string> = {
  neon: "RESET_NEON",
  mesh: "RESET_MESH",
};
const initializedLedgerClients = new WeakSet<object>();

export function resolveDestructiveResetCliApproval(
  args: readonly string[],
  plane: ProvisionPlane,
  disposableEnvironmentMarker: string | undefined,
): DestructiveResetCliApproval {
  const confirm = readCliOption(args, "--confirm");
  const destructive = args.includes("--reset") || args.includes("--drop-only");
  if (confirm !== undefined && !destructive) {
    throw new Error("--confirm is valid only with --reset or --drop-only");
  }
  if (confirm !== undefined && confirm !== DEVELOPMENT_CLEAN_RESET_APPROVAL) {
    throw new Error(
      `--confirm must equal ${DEVELOPMENT_CLEAN_RESET_APPROVAL}`,
    );
  }

  const shorthand = confirm === DEVELOPMENT_CLEAN_RESET_APPROVAL;
  const exactDatabase = plane === "neon" ? "athyper_neon" : "athyper_mesh";
  const explicitExpectedDatabase = readCliOption(args, "--expected-database");
  const explicitAcknowledgement = readCliOption(
    args,
    "--acknowledge-destructive-reset",
  );
  const explicitExecutionProfile = readCliOption(args, "--execution-profile");
  const explicitApprovalLabel = readCliOption(args, "--approval-label");

  if (
    shorthand
    && (
      (explicitExpectedDatabase !== undefined
        && explicitExpectedDatabase !== exactDatabase)
      || (explicitAcknowledgement !== undefined
        && explicitAcknowledgement !== RESET_ACKNOWLEDGEMENT[plane])
      || (explicitExecutionProfile !== undefined
        && explicitExecutionProfile !== DEVELOPMENT_CLEAN_RESET_PROFILE)
      || (explicitApprovalLabel !== undefined
        && explicitApprovalLabel !== DEVELOPMENT_CLEAN_RESET_APPROVAL)
    )
  ) {
    throw new Error(
      "--confirm conflicts with an explicit destructive-reset guard option",
    );
  }

  return {
    plane,
    expectedDatabase: explicitExpectedDatabase
      ?? (shorthand ? exactDatabase : ""),
    acknowledgement: explicitAcknowledgement
      ?? (shorthand ? RESET_ACKNOWLEDGEMENT[plane] : ""),
    disposableEnvironmentMarker: shorthand
      ? DISPOSABLE_MARKER
      : (disposableEnvironmentMarker ?? ""),
    executionProfile: explicitExecutionProfile
      ?? (shorthand ? DEVELOPMENT_CLEAN_RESET_PROFILE : ""),
    approvalLabel: explicitApprovalLabel
      ?? (shorthand ? DEVELOPMENT_CLEAN_RESET_APPROVAL : ""),
    confirmationShorthandUsed: shorthand,
  };
}

function readCliOption(
  args: readonly string[],
  name: string,
): string | undefined {
  const equalsPrefix = `${name}=`;
  const equalsValue = args.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsValue !== undefined) {
    const value = equalsValue.slice(equalsPrefix.length).trim();
    if (!value) throw new Error(`${name} requires a value`);
    return value;
  }
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

export function canonicalSourceText(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export function sha256Source(value: string): string {
  return createHash("sha256").update(canonicalSourceText(value)).digest("hex");
}

export function seedPackVersion(source: string): string {
  const match = canonicalSourceText(source).match(
    /^\s*--\s*seed-pack-version:\s*([a-zA-Z0-9][a-zA-Z0-9._-]{0,63})\s*$/m,
  );
  return match?.[1] ?? "legacy-v1";
}

export function assertPlaneFileBoundary(
  plane: ProvisionPlane,
  paths: readonly string[],
): void {
  const normalized = paths.map((path) => path.replace(/\\/g, "/"));
  const forbidden = normalized.filter((path) => {
    if (plane === "neon") {
      return path.startsWith("ddl/mesh/")
        || path.startsWith("ddl/mesh_log/")
        || path.startsWith("ddl/mesh_control/")
        || path.startsWith("mesh/")
        || path.startsWith("seed/tenants/mesh/");
    }
    return path.startsWith("ddl/master/")
      || path.startsWith("ddl/control/")
      || path.startsWith("ddl/document/")
      || path.startsWith("ddl/event/")
      || path.startsWith("ddl/log/")
      || path.startsWith("seed/tenants/neon/")
      || path.startsWith("seed/tenants/admin/")
      || path.startsWith("neon/")
      || path.startsWith("admin/");
  });
  if (forbidden.length > 0) {
    throw new Error(
      `${plane} provision discovered opposite-plane files: ${
        forbidden.join(", ")
      }`,
    );
  }
}

export async function acquireProvisionLock(
  client: QueryClient,
  plane: ProvisionPlane,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_lock(hashtextextended($1, 0))",
    [`athyper:wave6:provision:${plane}`],
  );
}

export async function ensureResetGuardTable(
  client: QueryClient,
): Promise<void> {
  await client.query("CREATE SCHEMA IF NOT EXISTS public");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.database_reset_guard_v2 (
      plane                       text PRIMARY KEY,
      database_name               text NOT NULL,
      environment_class           text NOT NULL,
      destructive_reset_allowed   boolean NOT NULL DEFAULT false,
      schema_fingerprint_sha256   text NOT NULL,
      approval_ticket             text NOT NULL,
      marked_at                   timestamptz NOT NULL DEFAULT now(),
      marked_by                   text NOT NULL DEFAULT session_user,
      CONSTRAINT database_reset_guard_v2_plane_chk
        CHECK (plane IN ('neon', 'mesh')),
      CONSTRAINT database_reset_guard_v2_environment_chk
        CHECK (environment_class IN ('disposable_local', 'disposable_ci')),
      CONSTRAINT database_reset_guard_v2_sha_chk
        CHECK (schema_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT database_reset_guard_v2_ticket_chk
        CHECK (btrim(approval_ticket) <> '')
    )
  `);
  await client.query("REVOKE ALL ON public.database_reset_guard_v2 FROM PUBLIC");
}

export async function assertDestructiveResetAllowed(
  client: QueryClient,
  approval: DestructiveResetApproval,
): Promise<void> {
  if (
    approval.disposableEnvironmentMarker !== DISPOSABLE_MARKER
    || approval.acknowledgement !== RESET_ACKNOWLEDGEMENT[approval.plane]
    || approval.executionProfile !== DEVELOPMENT_CLEAN_RESET_PROFILE
    || approval.approvalLabel !== DEVELOPMENT_CLEAN_RESET_APPROVAL
    || !approval.expectedDatabase.trim()
  ) {
    throw new Error(
      "destructive reset requires development_clean_reset, "
        + "LOCAL-AUTH-V2-RESET, the disposable marker, exact database, "
        + "and plane acknowledgement",
    );
  }
  await ensureResetGuardTable(client);
  const identity = await client.query<{
    database_name: string;
    guard_database_name: string | null;
    environment_class: string | null;
    approval_label: string | null;
    destructive_reset_allowed: boolean | null;
    schema_fingerprint_sha256: string | null;
    opposite_schema_count: string | number;
  }>(`
    SELECT
      current_database() AS database_name,
      guard.database_name AS guard_database_name,
      guard.environment_class,
      guard.approval_ticket AS approval_label,
      guard.destructive_reset_allowed,
      guard.schema_fingerprint_sha256,
      (
        SELECT count(*)
        FROM pg_namespace
        WHERE nspname = ANY(
          CASE $1
            WHEN 'neon' THEN ARRAY['mesh', 'metadata']
            ELSE ARRAY['ledger', 'metadata', 'aggregate']
          END
        )
      ) AS opposite_schema_count
    FROM (SELECT 1) seed
    LEFT JOIN public.database_reset_guard_v2 guard
      ON guard.plane = $1
  `, [approval.plane]);
  const row = identity.rows[0];
  const currentSchemaFingerprint = await readSchemaFingerprintSha256(
    client,
    approval.plane,
  );
  if (
    !row
    || row.database_name !== approval.expectedDatabase
    || row.guard_database_name !== row.database_name
    || row.destructive_reset_allowed !== true
    || row.environment_class !== "disposable_local"
    || row.approval_label !== DEVELOPMENT_CLEAN_RESET_APPROVAL
    || !/^[0-9a-f]{64}$/.test(row.schema_fingerprint_sha256 ?? "")
    || Number(row.opposite_schema_count) !== 0
  ) {
    throw new Error(
      `${approval.plane} destructive reset database identity/marker mismatch`,
    );
  }

  if (row.schema_fingerprint_sha256 !== currentSchemaFingerprint) {
    if (!approval.refreshDisposableFingerprint) {
      throw new Error(
        `${approval.plane} destructive reset database identity/marker mismatch`,
      );
    }
    const refreshed = await client.query(`
      UPDATE public.database_reset_guard_v2
      SET
        schema_fingerprint_sha256 = $2,
        marked_at = now(),
        marked_by = session_user
      WHERE plane = $1
        AND database_name = $3
        AND environment_class = 'disposable_local'
        AND destructive_reset_allowed = true
        AND approval_ticket = $4
    `, [
      approval.plane,
      currentSchemaFingerprint,
      approval.expectedDatabase,
      DEVELOPMENT_CLEAN_RESET_APPROVAL,
    ]);
    if (refreshed.rowCount !== 1) {
      throw new Error(
        `${approval.plane} destructive reset marker refresh failed`,
      );
    }
  }
}

export async function readSchemaFingerprintSha256(
  client: QueryClient,
  plane: ProvisionPlane,
): Promise<string> {
  const commonSchemas = [
    "ai", "audit", "authz", "control", "document", "event", "governance",
    "log", "master", "ops", "public", "runtime_meta", "shared", "snapshot",
  ];
  const ownedSchemas = plane === "neon"
    ? [...commonSchemas, "aggregate", "ledger"]
    : [...commonSchemas, "mesh"];
  const result = await client.query<{
    object_identity: string;
  }>(`
    SELECT format(
      '%s.%s:%s',
      namespace.nspname,
      class.relname,
      class.relkind
    ) AS object_identity
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = ANY($1::text[])
      AND class.relkind = ANY(ARRAY['r', 'p', 'v', 'm', 'S']::"char"[])
    ORDER BY namespace.nspname, class.relname, class.relkind
  `, [ownedSchemas]);
  return createHash("sha256")
    .update(result.rows.map((row) => row.object_identity).join("\n"))
    .digest("hex");
}

export async function ensureSeedLedger(
  client: QueryClient,
): Promise<void> {
  if (initializedLedgerClients.has(client)) return;
  await client.query("CREATE SCHEMA IF NOT EXISTS public");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.seed_pack_ledger_v2 (
      plane               text NOT NULL,
      pack_key            text NOT NULL,
      pack_version        text NOT NULL,
      source_path         text NOT NULL,
      content_sha256      text NOT NULL,
      manifest_sha256     text NOT NULL,
      registered_at       timestamptz NOT NULL DEFAULT now(),
      registered_by       text NOT NULL DEFAULT session_user,
      PRIMARY KEY (plane, pack_key, pack_version),
      CONSTRAINT seed_pack_ledger_v2_plane_chk
        CHECK (plane IN ('neon', 'mesh')),
      CONSTRAINT seed_pack_ledger_v2_key_chk
        CHECK (
          length(pack_key) BETWEEN 2 AND 512
          AND pack_key ~ '^[a-zA-Z0-9][a-zA-Z0-9/_.:@-]+$'
        ),
      CONSTRAINT seed_pack_ledger_v2_version_chk
        CHECK (pack_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
      CONSTRAINT seed_pack_ledger_v2_content_sha_chk
        CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT seed_pack_ledger_v2_manifest_sha_chk
        CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$')
    )
  `);
  await client.query(`
    ALTER TABLE public.seed_pack_ledger_v2
      DROP CONSTRAINT IF EXISTS seed_pack_ledger_v2_key_chk;
    ALTER TABLE public.seed_pack_ledger_v2
      ADD CONSTRAINT seed_pack_ledger_v2_key_chk
      CHECK (
        length(pack_key) BETWEEN 2 AND 512
        AND pack_key ~ '^[a-zA-Z0-9][a-zA-Z0-9/_.:@-]+$'
      )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.seed_pack_execution_v2 (
      execution_id        uuid PRIMARY KEY,
      plane               text NOT NULL,
      pack_key            text NOT NULL,
      pack_version        text NOT NULL,
      content_sha256      text NOT NULL,
      execution_mode      text NOT NULL,
      applied_at          timestamptz NOT NULL DEFAULT now(),
      applied_by          text NOT NULL DEFAULT session_user,
      CONSTRAINT seed_pack_execution_v2_pack_fk
        FOREIGN KEY (plane, pack_key, pack_version)
        REFERENCES public.seed_pack_ledger_v2
          (plane, pack_key, pack_version),
      CONSTRAINT seed_pack_execution_v2_mode_chk
        CHECK (execution_mode IN ('clean', 'upgrade', 'forced_reseed')),
      CONSTRAINT seed_pack_execution_v2_sha_chk
        CHECK (content_sha256 ~ '^[0-9a-f]{64}$')
    )
  `);
  await client.query(`
    CREATE OR REPLACE FUNCTION public.trg_seed_pack_ledger_v2_immutable()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      RAISE EXCEPTION 'seed_pack_ledger_v2 is immutable';
    END
    $function$;
    DROP TRIGGER IF EXISTS trg_seed_pack_ledger_v2_immutable
      ON public.seed_pack_ledger_v2;
    CREATE TRIGGER trg_seed_pack_ledger_v2_immutable
      BEFORE UPDATE OR DELETE ON public.seed_pack_ledger_v2
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_seed_pack_ledger_v2_immutable()
  `);
  await client.query("REVOKE ALL ON public.seed_pack_ledger_v2 FROM PUBLIC");
  await client.query("REVOKE ALL ON public.seed_pack_execution_v2 FROM PUBLIC");
  initializedLedgerClients.add(client);
}

export async function registerSeedPack(
  client: QueryClient,
  receipt: SeedPackReceipt,
): Promise<"registered" | "matched"> {
  await ensureSeedLedger(client);
  const existing = await client.query<{
    source_path: string;
    content_sha256: string;
    manifest_sha256: string;
  }>(`
    SELECT source_path, content_sha256, manifest_sha256
    FROM public.seed_pack_ledger_v2
    WHERE plane = $1 AND pack_key = $2 AND pack_version = $3
  `, [receipt.plane, receipt.packKey, receipt.packVersion]);
  const row = existing.rows[0];
  if (row) {
    if (
      row.source_path !== receipt.sourcePath
      || row.content_sha256 !== receipt.contentSha256
      || row.manifest_sha256 !== receipt.manifestSha256
    ) {
      throw new Error(
        `immutable seed pack content drift: ${receipt.plane}/${receipt.packKey}@${receipt.packVersion}`,
      );
    }
    return "matched";
  }
  await client.query(`
    INSERT INTO public.seed_pack_ledger_v2 (
      plane, pack_key, pack_version, source_path,
      content_sha256, manifest_sha256
    ) VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    receipt.plane,
    receipt.packKey,
    receipt.packVersion,
    receipt.sourcePath,
    receipt.contentSha256,
    receipt.manifestSha256,
  ]);
  return "registered";
}

export async function recordSeedExecution(
  client: QueryClient,
  receipt: SeedPackReceipt,
  executionMode: "clean" | "upgrade" | "forced_reseed",
): Promise<void> {
  await client.query(`
    INSERT INTO public.seed_pack_execution_v2 (
      execution_id, plane, pack_key, pack_version,
      content_sha256, execution_mode
    ) VALUES ($1::uuid, $2, $3, $4, $5, $6)
  `, [
    randomUUID(),
    receipt.plane,
    receipt.packKey,
    receipt.packVersion,
    receipt.contentSha256,
    executionMode,
  ]);
}

export function seedReceipt(input: {
  readonly plane: ProvisionPlane;
  readonly packKey: string;
  readonly sourcePath: string;
  readonly source: string;
  readonly manifestSha256?: string;
}): SeedPackReceipt {
  const contentSha256 = sha256Source(input.source);
  return {
    plane: input.plane,
    packKey: input.packKey,
    packVersion: seedPackVersion(input.source),
    sourcePath: input.sourcePath.replace(/\\/g, "/"),
    contentSha256,
    manifestSha256: input.manifestSha256 ?? contentSha256,
  };
}
