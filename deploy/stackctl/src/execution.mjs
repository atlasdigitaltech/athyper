import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { userInfo } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { inspectRemainingGates } from "./gates.mjs";
import { runtimeRoot as configuredRuntimeRoot, runReadOnly } from "./io.mjs";
import { loadModel } from "./model.mjs";
import { createPlan } from "./plan.mjs";
import { checkPolicy } from "./policy.mjs";
import { createValidator } from "./schema.mjs";
import { loadStagingProviderEnvironment } from "./provider-config.mjs";

const OPERATIONS = new Set(["up", "down", "restart", "backup", "restore"]);
const BACKUP_ID = /^[0-9]{8}T[0-9]{6}Z$/u;
const PLATFORM_PROJECT = "athyper-platform";
const PLATFORM_SECRETS = ["tls.crt", "tls.key"];
const DATABASES = ["athyper_iam", "athyper_neon", "athyper_mesh", "athyper_studio"];
const MIGRATION_RUNNERS = new Set(["db-migration", "db-forward-migration"]);

function timestamp(date) {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function atomicJson(path, document) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function uniqueOperationPath(directory, baseId) {
  let id = baseId;
  let path = join(directory, `${id}.json`);
  for (let suffix = 2; existsSync(path); suffix += 1) {
    id = `${baseId}-${suffix}`;
    path = join(directory, `${id}.json`);
  }
  return { id, path };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function defaultRun(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    timeout: options.timeout ?? 600_000,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    error: result.error?.message,
  };
}

function assertSecret(path) {
  if (!existsSync(path)) throw new Error(`Required secret is absent: ${path}`);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error(`Required secret is not a regular file: ${path}`);
  if ((stat.mode & 0o077) !== 0) throw new Error(`Required secret must be owner-only: ${path}`);
  if (!readFileSync(path, "utf8").trim()) throw new Error(`Required secret is empty: ${path}`);
}

function sourceRevision(repoRoot) {
  const result = runReadOnly("git", ["-C", repoRoot, "rev-parse", "HEAD"]);
  return /^[a-f0-9]{40}$/u.test(result.stdout) ? result.stdout : "unknown";
}

function imageEnvironment(model) {
  return Object.fromEntries(model.imageSet.spec.images.map(({ id, reference }) => [
    `ATHYPER_IMAGE_${id.toUpperCase().replaceAll("-", "_")}`,
    reference,
  ]));
}

function instanceEnvironment(model, root) {
  const postgres = model.instance.spec.debugPorts?.postgres;
  const providerEnvironment = model.instance.spec.mode === "staging"
    ? loadStagingProviderEnvironment(root).environment
    : {};
  return {
    ...process.env,
    ...providerEnvironment,
    ATHYPER_RUNTIME_ROOT: root,
    ATHYPER_RUNTIME_UID: String(process.getuid?.() ?? 1000),
    ATHYPER_RUNTIME_GID: String(process.getgid?.() ?? 1000),
    ATHYPER_INSTANCE: model.instance.metadata.id,
    ATHYPER_DOMAIN_SUFFIX: model.instance.spec.domainSuffix,
    ...(postgres ? { ATHYPER_POSTGRES_BIND: postgres } : {}),
    ...imageEnvironment(model),
  };
}

function deploymentRevision(repoRoot, model) {
  const imageRevision = model.imageSet.spec.sourceRevision;
  return /^[a-f0-9]{40}$/u.test(imageRevision) && !/^0{40}$/u.test(imageRevision)
    ? imageRevision
    : sourceRevision(repoRoot);
}

function composePrefix(project, files) {
  return ["compose", "--project-name", project, ...files.flatMap((file) => ["--file", file])];
}

function safeBackupDirectory(root, instanceId, backupId) {
  if (!BACKUP_ID.test(backupId)) throw new Error(`Invalid backup ID: ${backupId}`);
  const parent = resolve(root, "backups", instanceId);
  const target = resolve(parent, backupId);
  if (!target.startsWith(`${parent}${sep}`)) throw new Error("Backup path escapes the instance backup root.");
  return target;
}

function artifact(path, extra = {}) {
  const bytes = readFileSync(path);
  if (bytes.length === 0) throw new Error(`Backup artifact is empty: ${path}`);
  return {
    ...extra,
    file: basename(path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
  };
}

function treeSha256(root) {
  const hash = createHash("sha256");
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        hash.update(path.slice(root.length + 1));
        hash.update("\0");
        hash.update(readFileSync(path));
        hash.update("\0");
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

function readActive(validate, root, instanceId, project, requiredState) {
  const path = join(root, "instances", instanceId, "receipts", "active.json");
  if (!existsSync(path)) throw new Error(`No controller ownership receipt exists for ${instanceId}: ${path}`);
  const receipt = validate(readJson(path), path);
  if (receipt.metadata.instance !== instanceId || receipt.spec.project !== project) {
    throw new Error(`Ownership receipt does not match ${instanceId}/${project}.`);
  }
  if (requiredState && receipt.spec.state !== requiredState) {
    throw new Error(`Instance ${instanceId} is ${receipt.spec.state}; ${requiredState} is required.`);
  }
  return { path, receipt };
}

function readPlatformActive(validate, root, requiredState) {
  const path = join(root, "platform", "receipts", "active.json");
  if (!existsSync(path)) throw new Error(`No controller ownership receipt exists for ${PLATFORM_PROJECT}: ${path}`);
  const receipt = validate(readJson(path), path);
  if (receipt.metadata.instance !== "platform" || receipt.spec.project !== PLATFORM_PROJECT) {
    throw new Error(`Ownership receipt does not match platform/${PLATFORM_PROJECT}.`);
  }
  if (requiredState && receipt.spec.state !== requiredState) {
    throw new Error(`Platform is ${receipt.spec.state}; ${requiredState} is required.`);
  }
  return { path, receipt };
}

function readMigrationReceipt(validate, root, instanceId, project) {
  const path = join(root, "instances", instanceId, "receipts", "migration.json");
  if (!existsSync(path)) {
    throw new Error(`Preserved-database startup requires an existing migration receipt: ${path}`);
  }
  const receipt = validate(readJson(path), path);
  if (receipt.metadata.instance !== instanceId || receipt.spec.project !== project) {
    throw new Error(`Migration receipt does not match ${instanceId}/${project}.`);
  }
  return { path, receipt };
}

function assertConfirmation(instanceId, options) {
  if (options.confirm !== instanceId) {
    throw new Error(`Refusing mutation: pass --confirm ${instanceId}.`);
  }
}

function admissionBlockers(repoRoot, instanceId, receiptState, dependencies) {
  const policy = (dependencies.policy ?? checkPolicy)(repoRoot);
  const gates = (dependencies.gates ?? inspectRemainingGates)(repoRoot);
  const plan = (dependencies.plan ?? createPlan)(repoRoot, instanceId);
  const infrastructureGateNames = [
    "machinePhaseStatus",
    "coldStart",
    "stackV1Disposition",
    "stackV1ExportIntake",
    "stackV1Restore",
  ];
  const blockers = [
    ...policy.errors,
    ...infrastructureGateNames.flatMap((name) => (
      gates.gates[name].status === "blocked" ? gates.gates[name].problems : []
    )),
    ...plan.blockers.filter((problem) => !(
      receiptState && problem.includes("already owns Docker resources")
    ) && !(
      receiptState === "running" && problem.includes("already listening")
    )),
  ];
  if (!plan.services?.some(({ id }) => MIGRATION_RUNNERS.has(id))) {
    blockers.push("No executable database migration service is selected; application startup cannot bypass the migration gate.");
  }
  return { blockers: [...new Set(blockers)], plan };
}

function commandError(program, args, result) {
  const detail = result.stderr || result.error || `exit ${result.status}`;
  return new Error(`${program} ${args.join(" ")} failed: ${detail}`);
}

function executeLocked(repoRoot, operation, instanceId, options = {}, dependencies = {}) {
  if (!OPERATIONS.has(operation)) throw new Error(`Unsupported stack operation: ${operation}`);
  assertConfirmation(instanceId, options);
  const model = loadModel(repoRoot, instanceId);
  const validate = createValidator(repoRoot);
  const root = dependencies.runtimeRoot ?? configuredRuntimeRoot();
  const project = model.instance.spec.composeProject;
  const receiptDirectory = join(root, "instances", instanceId, "receipts");
  const activePath = join(receiptDirectory, "active.json");
  const now = dependencies.now ?? (() => new Date());
  const started = now();
  const operationLocation = uniqueOperationPath(receiptDirectory, `${timestamp(started)}-${operation}`);
  const operationId = operationLocation.id;
  const operationPath = operationLocation.path;
  const revision = dependencies.sourceRevision ?? deploymentRevision(repoRoot, model);
  const run = dependencies.run ?? defaultRun;
  const commands = [];
  const artifacts = { operator: dependencies.operator ?? userInfo().username };
  let rollback = { attempted: false, succeeded: false };
  let receiptStatus = "failed";
  const files = createPlan(repoRoot, instanceId, {
    infrastructureGates: {
      blockers: [],
      qualification: { path: "execution" },
      cold: { path: "execution" },
      disposition: { path: "execution" },
      intake: { path: "execution" },
      restore: { path: "execution" },
    },
    runtimeRoot: root,
    secretProblem: () => null,
    listeningPorts: () => new Set(),
    liveProjectObjects: () => ({ containers: [], networks: [], volumes: [] }),
  }).sources.compose;
  const env = instanceEnvironment(model, root);
  const ddlSha256 = treeSha256(join(repoRoot, "server", "db", "ddl"));
  const forwardMigrationSha256 = treeSha256(join(repoRoot, "server", "db", "migrations"));
  env.ATHYPER_DDL_SHA256 = ddlSha256;
  const invoke = (program, args, commandOptions = {}) => {
    const result = run(program, args, { cwd: repoRoot, env, ...commandOptions });
    commands.push({ program, arguments: args, status: result.status ?? (result.ok ? 0 : 1) });
    if (!result.ok) throw commandError(program, args, result);
    return result;
  };
  const compose = (args, selectedProject = project, selectedFiles = files) => (
    invoke("docker", [...composePrefix(selectedProject, selectedFiles), ...args])
  );
  const writeActive = (state) => {
    const document = {
      apiVersion: "athyper.io/v1alpha1",
      kind: "ActiveInstanceReceipt",
      metadata: { instance: instanceId },
      spec: { project, state, updatedAt: now().toISOString(), sourceRevision: revision, composeFiles: files },
    };
    validate(document, activePath);
    atomicJson(activePath, document);
  };
  const writePlatformActive = (platformFile) => {
    const path = join(root, "platform", "receipts", "active.json");
    const document = {
      apiVersion: "athyper.io/v1alpha1",
      kind: "ActiveInstanceReceipt",
      metadata: { instance: "platform" },
      spec: {
        project: PLATFORM_PROJECT,
        state: "running",
        updatedAt: now().toISOString(),
        sourceRevision: revision,
        composeFiles: [platformFile],
      },
    };
    validate(document, path);
    atomicJson(path, document);
  };
  const writeMigrationReceipt = (mode, migrationSha256) => {
    const path = join(receiptDirectory, "migration.json");
    const document = {
      apiVersion: "athyper.io/v1alpha1",
      kind: "FoundationMigrationReceipt",
      metadata: { instance: instanceId },
      spec: {
        project,
        completedAt: now().toISOString(),
        sourceRevision: revision,
        ddlSha256: migrationSha256,
        mode,
      },
    };
    validate(document, path);
    atomicJson(path, document);
  };
  const existingActive = existsSync(activePath)
    ? readActive(validate, root, instanceId, project).receipt
    : null;

  try {
    if (operation === "up") {
      if (options.preserveDatabase && instanceId !== "dev") {
        throw new Error("--preserve-database is restricted to the DEV instance.");
      }
      if (options.initializeDatabase && !["qa", "stg"].includes(instanceId)) {
        throw new Error("--initialize-database is restricted to QA and STG instances.");
      }
      if (options.initializeDatabase && options.preserveDatabase) {
        throw new Error("--initialize-database and --preserve-database are mutually exclusive.");
      }
      if (options.initializeDatabase && existsSync(join(receiptDirectory, "migration.json"))) {
        throw new Error("Database initialization already has a migration receipt; use normal forward-only startup.");
      }
      const preservedMigration = options.preserveDatabase
        ? readMigrationReceipt(validate, root, instanceId, project)
        : null;
      const admission = admissionBlockers(repoRoot, instanceId, existingActive?.spec.state, dependencies);
      if (admission.blockers.length) {
        throw new Error(`Execution gates are blocked:\n- ${admission.blockers.join("\n- ")}`);
      }
      for (const name of PLATFORM_SECRETS) assertSecret(join(root, "platform", "secrets", name));
      const platformFile = admission.plan.sources.platformCompose;
      const platformArgs = composePrefix(PLATFORM_PROJECT, [platformFile]);
      const platformContainers = invoke("docker", ["ps", "-aq", "--filter", `label=com.docker.compose.project=${PLATFORM_PROJECT}`]);
      const platformNetworks = invoke("docker", ["network", "ls", "-q", "--filter", `label=com.docker.compose.project=${PLATFORM_PROJECT}`]);
      const platformReceiptPath = join(root, "platform", "receipts", "active.json");
      if (platformContainers.stdout || platformNetworks.stdout) {
        readPlatformActive(validate, root, "running");
      } else if (existsSync(platformReceiptPath)) {
        readPlatformActive(validate, root);
      }
      invoke("docker", [...platformArgs, "config", "--quiet"]);
      compose(["config", "--quiet"]);
      invoke("docker", [...platformArgs, "up", "--detach", "--wait"]);
      writePlatformActive(platformFile);
      try {
        const migrationRunner = model.selected.some(({ id }) => id === "db-forward-migration")
          ? "db-forward-migration"
          : "db-migration";
        const migrationMode = migrationRunner === "db-forward-migration"
          ? "forward-migrations"
          : "fresh-database-foundation";
        const migrationSha256 = migrationRunner === "db-forward-migration"
          ? forwardMigrationSha256
          : ddlSha256;
        compose(["up", "--detach", "--wait", "db"]);
        compose(["run", "--rm", "db-init"]);
        if (options.initializeDatabase) {
          compose(["run", "--rm", "db-migration"]);
          compose(["run", "--rm", "db-migration-baseline"]);
          compose(["run", "--rm", "db-forward-migration"]);
          artifacts.migrationMode = "fresh-database-foundation-baselined";
          artifacts.migrationSha256 = forwardMigrationSha256;
          artifacts.foundationSha256 = ddlSha256;
          writeMigrationReceipt("fresh-database-foundation-baselined", forwardMigrationSha256);
        } else if (preservedMigration) {
          artifacts.migrationMode = "preserved-existing-database";
          artifacts.migrationReceipt = preservedMigration.path;
          artifacts.migrationSha256 = preservedMigration.receipt.spec.ddlSha256;
        } else {
          compose(["run", "--rm", migrationRunner]);
          artifacts.migrationMode = migrationMode;
          artifacts.migrationSha256 = migrationSha256;
          writeMigrationReceipt(migrationMode, migrationSha256);
        }
        compose(["up", "--detach", "--wait", "--remove-orphans"]);
      } catch (error) {
        rollback = { attempted: true, succeeded: false };
        const result = run("docker", [...composePrefix(project, files), "down", "--remove-orphans"], { cwd: repoRoot, env });
        commands.push({ program: "docker", arguments: [...composePrefix(project, files), "down", "--remove-orphans"], status: result.status ?? (result.ok ? 0 : 1) });
        rollback.succeeded = result.ok;
        if (rollback.succeeded) writeActive("stopped");
        receiptStatus = result.ok ? "rolled-back" : "failed";
        throw error;
      }
      writeActive("running");
      receiptStatus = "succeeded";
    } else if (operation === "down") {
      readActive(validate, root, instanceId, project);
      compose(["down", "--remove-orphans"]);
      writeActive("stopped");
      receiptStatus = "succeeded";
    } else if (operation === "restart") {
      readActive(validate, root, instanceId, project, "running");
      const service = options.service;
      if (service && !new Set(model.selected.map(({ id }) => id)).has(service)) {
        throw new Error(`Service ${service} is not selected by instance ${instanceId}.`);
      }
      compose(["restart", ...(service ? [service] : [])]);
      writeActive("running");
      if (service) artifacts.service = service;
      receiptStatus = "succeeded";
    } else if (operation === "backup") {
      readActive(validate, root, instanceId, project, "running");
      const backupId = timestamp(started);
      const directory = safeBackupDirectory(root, instanceId, backupId);
      if (existsSync(directory)) throw new Error(`Backup already exists: ${directory}`);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      chmodSync(directory, 0o700);
      const globals = join(directory, "postgres-globals.sql");
      const dumps = DATABASES.map((database) => ({ database, path: join(directory, `${database}.dump`) }));
      compose(["exec", "-T", "db", "sh", "-ec", "export PGPASSWORD=\"$(cat /run/secrets/postgres-password)\"; pg_dumpall --username postgres --globals-only --no-role-passwords --file /tmp/athyper-postgres-globals.sql"]);
      for (const { database } of dumps) {
        compose(["exec", "-T", "db", "sh", "-ec", `export PGPASSWORD=\"$(cat /run/secrets/postgres-password)\"; pg_dump --username postgres --format custom --dbname ${database} --file /tmp/${database}.dump`]);
      }
      let copyError;
      let cleanup;
      try {
        compose(["cp", "db:/tmp/athyper-postgres-globals.sql", globals]);
        for (const { database, path } of dumps) compose(["cp", `db:/tmp/${database}.dump`, path]);
      } catch (error) {
        copyError = error;
      } finally {
        const cleanupArgs = [
          ...composePrefix(project, files), "exec", "-T", "db", "rm", "-f",
          "/tmp/athyper-postgres-globals.sql", ...DATABASES.map((database) => `/tmp/${database}.dump`),
        ];
        cleanup = run("docker", cleanupArgs, { cwd: repoRoot, env });
        commands.push({ program: "docker", arguments: cleanupArgs, status: cleanup.status ?? (cleanup.ok ? 0 : 1) });
      }
      if (copyError) throw copyError;
      if (!cleanup.ok) throw commandError("docker", ["compose", "exec", "db", "rm", "backup-temporary-files"], cleanup);
      for (const path of [globals, ...dumps.map(({ path }) => path)]) chmodSync(path, 0o600);
      const backup = {
        apiVersion: "athyper.io/v1alpha1",
        kind: "StackBackup",
        metadata: { instance: instanceId, id: backupId },
        spec: {
          createdAt: started.toISOString(), project, sourceRevision: revision,
          database: {
            format: "postgres-custom-per-database",
            globals: artifact(globals),
            dumps: dumps.map(({ database, path }) => artifact(path, { database })),
          },
        },
      };
      const manifestPath = join(directory, "backup.json");
      validate(backup, manifestPath);
      atomicJson(manifestPath, backup);
      artifacts.backupId = backupId;
      artifacts.manifest = manifestPath;
      receiptStatus = "succeeded";
    } else if (operation === "restore") {
      const backupId = options.backupId;
      if (options.confirmRestore !== backupId) throw new Error(`Refusing restore: pass --confirm-restore ${backupId}.`);
      const directory = safeBackupDirectory(root, instanceId, backupId);
      const manifestPath = join(directory, "backup.json");
      const backup = validate(readJson(manifestPath), manifestPath);
      if (backup.metadata.instance !== instanceId || backup.metadata.id !== backupId) throw new Error("Backup identity does not match the restore target.");
      const backupArtifacts = [backup.spec.database.globals, ...backup.spec.database.dumps];
      for (const item of backupArtifacts) {
        const path = join(directory, item.file);
        const bytes = readFileSync(path);
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== item.sha256 || bytes.length !== item.sizeBytes) {
          throw new Error(`Backup integrity verification failed: ${item.file}`);
        }
      }
      const restoreProject = `${project}-restore-${backupId.toLowerCase()}`;
      const globals = backup.spec.database.globals;
      const globalsPath = join(directory, globals.file);
      compose(["config", "--quiet"], restoreProject);
      compose(["up", "--detach", "--wait", "db"], restoreProject);
      try {
        compose(["cp", globalsPath, `db:/tmp/${globals.file}`], restoreProject);
        compose(["exec", "-T", "db", "sh", "-ec", `export PGPASSWORD=\"$(cat /run/secrets/postgres-password)\"; sed '/^CREATE ROLE postgres;$/d' /tmp/${globals.file} | psql --set=ON_ERROR_STOP=1 --username postgres --dbname postgres`], restoreProject);
        compose(["run", "--rm", "db-init"], restoreProject);
        for (const item of backup.spec.database.dumps) {
          const path = join(directory, item.file);
          compose(["cp", path, `db:/tmp/${item.file}`], restoreProject);
          compose(["exec", "-T", "db", "sh", "-ec", `export PGPASSWORD=\"$(cat /run/secrets/postgres-password)\"; pg_restore --username postgres --clean --if-exists --dbname ${item.database} /tmp/${item.file}`], restoreProject);
        }
        compose(["exec", "-T", "db", "psql", "--username", "postgres", "--dbname", "postgres", "--tuples-only", "--command", "SELECT 1"], restoreProject);
      } finally {
        compose(["exec", "-T", "db", "rm", "-f", `/tmp/${globals.file}`, ...backup.spec.database.dumps.map((item) => `/tmp/${item.file}`)], restoreProject);
        compose(["down", "--remove-orphans"], restoreProject);
      }
      const volume = `${restoreProject}_db-data`;
      invoke("docker", ["volume", "inspect", volume]);
      artifacts.backupId = backupId;
      artifacts.restoreProject = restoreProject;
      artifacts.restoreVolume = volume;
      receiptStatus = "succeeded";
    }
  } catch (error) {
    const receipt = {
      apiVersion: "athyper.io/v1alpha1",
      kind: "StackOperationReceipt",
      metadata: { instance: instanceId, id: operationId },
      spec: {
        operation, status: receiptStatus, project, startedAt: started.toISOString(), completedAt: now().toISOString(),
        sourceRevision: revision, commands, artifacts, rollback, error: error.message,
      },
    };
    validate(receipt, operationPath);
    atomicJson(operationPath, receipt);
    error.receipt = operationPath;
    throw error;
  }

  const receipt = {
    apiVersion: "athyper.io/v1alpha1",
    kind: "StackOperationReceipt",
    metadata: { instance: instanceId, id: operationId },
    spec: {
      operation, status: receiptStatus, project, startedAt: started.toISOString(), completedAt: now().toISOString(),
      sourceRevision: revision, commands, artifacts, rollback,
    },
  };
  validate(receipt, operationPath);
  atomicJson(operationPath, receipt);
  return { ...receipt, receiptPath: operationPath };
}

export function executeStackOperation(repoRoot, operation, instanceId, options = {}, dependencies = {}) {
  if (!OPERATIONS.has(operation)) throw new Error(`Unsupported stack operation: ${operation}`);
  if (!/^[a-z][a-z0-9-]{1,31}$/u.test(instanceId)) throw new Error(`Invalid instance ID: ${instanceId}`);
  assertConfirmation(instanceId, options);
  const root = dependencies.runtimeRoot ?? configuredRuntimeRoot();
  const lockParent = join(root, "locks");
  const lockPath = join(lockParent, "stackctl-operation.lock");
  mkdirSync(lockParent, { recursive: true, mode: 0o700 });
  chmodSync(lockParent, 0o700);
  try {
    mkdirSync(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(`Another stackctl mutation holds the controller lock: ${lockPath}`);
    }
    throw error;
  }
  try {
    return executeLocked(repoRoot, operation, instanceId, options, { ...dependencies, runtimeRoot: root });
  } finally {
    rmdirSync(lockPath);
  }
}
