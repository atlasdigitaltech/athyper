import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { createOperationsPlan } from "./operations.mjs";
import { runReadOnly, runtimeRoot as configuredRuntimeRoot } from "./io.mjs";
import { createValidator } from "./schema.mjs";

const PROJECT = "athyper-operations";

function timestamp(date) { return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z"); }
function atomicJson(path, document) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}
function sourceRevision(repoRoot) {
  const result = runReadOnly("git", ["-C", repoRoot, "rev-parse", "HEAD"]);
  return /^[a-f0-9]{40}$/u.test(result.stdout) ? result.stdout : "unknown";
}
function assertSecret(path) {
  if (!existsSync(path)) throw new Error(`Required secret is absent: ${path}`);
  const stat = statSync(path);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 || !readFileSync(path, "utf8").trim()) throw new Error(`Required secret is not a non-empty owner-only file: ${path}`);
}
function commandError(args, result) { return new Error(`docker ${args.join(" ")} failed: ${result.stderr || result.error || `exit ${result.status}`}`); }
function defaultRun(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: options.cwd, env: options.env ?? process.env, encoding: "utf8", timeout: options.timeout ?? 600_000, windowsHide: true });
  return { ok: result.status === 0, status: result.status ?? 1, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").trim(), error: result.error?.message };
}
function running(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function stopForwarder(pidPath) {
  if (!existsSync(pidPath)) return;
  const pid = Number(readFileSync(pidPath, "utf8").trim());
  if (Number.isInteger(pid) && pid > 1 && running(pid)) process.kill(pid, "SIGTERM");
  unlinkSync(pidPath);
}
function defaultStartForwarder(repoRoot, directory, revision) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stdout = openSync(join(directory, "forwarder.log"), "a", 0o600);
  const stderr = openSync(join(directory, "forwarder-error.log"), "a", 0o600);
  const child = spawn(process.execPath, [join(repoRoot, "deploy/stackctl/src/docker-log-forwarder.mjs"),
    "--project", "athyper-dev", "--endpoint", "http://127.0.0.1:53901/loki/api/v1/push",
    "--instance", "dev", "--environment", "development", "--source-revision", revision,
    "--heartbeat", join(directory, "heartbeat"), "--since", "5m"],
  { detached: true, stdio: ["ignore", stdout, stderr], cwd: repoRoot });
  child.unref(); closeSync(stdout); closeSync(stderr);
  writeFileSync(join(directory, "forwarder.pid"), `${child.pid}\n`, { mode: 0o600 });
  return child.pid;
}

export function executeOperationsOperation(repoRoot, operation, mode, options = {}, dependencies = {}) {
  if (!new Set(["up", "down"]).has(operation)) throw new Error(`Unsupported operations operation: ${operation}`);
  const expectedConfirmation = operation === "up" ? mode : "operations";
  if (options.confirm !== expectedConfirmation) throw new Error(`Refusing mutation: pass --confirm ${expectedConfirmation}.`);
  const root = dependencies.runtimeRoot ?? configuredRuntimeRoot();
  const lockParent = join(root, "locks");
  const lockPath = join(lockParent, "stackctl-operation.lock");
  mkdirSync(lockParent, { recursive: true, mode: 0o700 });
  try { mkdirSync(lockPath, { mode: 0o700 }); } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another stackctl mutation holds the controller lock: ${lockPath}`);
    throw error;
  }
  try {
    const validate = createValidator(repoRoot);
    const receiptDirectory = join(root, "operations", "receipts");
    const activePath = join(receiptDirectory, "active.json");
    const forwarderDirectory = join(root, "operations", "log-forwarder");
    const pidPath = join(forwarderDirectory, "forwarder.pid");
    const now = dependencies.now ?? (() => new Date());
    const started = now();
    const id = `${timestamp(started)}-${operation}`;
    const receiptPath = join(receiptDirectory, `${id}.json`);
    const revision = dependencies.sourceRevision ?? sourceRevision(repoRoot);
    const composeFile = join(repoRoot, "deploy/compose/operations/compose.yaml");
    const env = { ...process.env, ATHYPER_RUNTIME_ROOT: root };
    const run = dependencies.run ?? defaultRun;
    const commands = [];
    const invoke = (program, args) => {
      const result = run(program, args, { cwd: repoRoot, env, encoding: "utf8", timeout: 600_000 });
      commands.push({ program, arguments: args, status: result.status ?? (result.ok ? 0 : 1) });
      if (!result.ok) throw new Error(`${program} ${args.join(" ")} failed: ${result.stderr || result.error || `exit ${result.status}`}`);
      return result;
    };
    const compose = (args) => invoke("docker", ["compose", "--project-name", PROJECT, "--file", composeFile, ...args]);
    const writeActive = (state) => atomicJson(activePath, validate({ apiVersion: "athyper.io/v1alpha1", kind: "ActiveInstanceReceipt", metadata: { instance: "operations" }, spec: { project: PROJECT, state, updatedAt: now().toISOString(), sourceRevision: revision, composeFiles: [composeFile] } }, activePath));
    const receipt = (status, artifacts, rollback, error) => {
      const document = { apiVersion: "athyper.io/v1alpha1", kind: "StackOperationReceipt", metadata: { instance: "operations", id }, spec: { operation, status, project: PROJECT, startedAt: started.toISOString(), completedAt: now().toISOString(), sourceRevision: revision, commands, artifacts, rollback, ...(error ? { error } : {}) } };
      validate(document, receiptPath); atomicJson(receiptPath, document); return { ...document, receiptPath };
    };
    const artifacts = { operator: dependencies.operator ?? userInfo().username, mode: mode ?? "lite" };
    let rollback = { attempted: false, succeeded: false };
    try {
      if (operation === "up") {
        if (existsSync(activePath)) {
          const active = validate(JSON.parse(readFileSync(activePath, "utf8")), activePath);
          if (active.spec.project !== PROJECT) throw new Error(`Ownership receipt does not match ${PROJECT}.`);
          if (active.spec.state === "running") throw new Error(`${PROJECT} is already running; stop it before changing mode.`);
        }
        const plan = (dependencies.plan ?? createOperationsPlan)(repoRoot, mode, { runtimeRoot: root, owned: existsSync(activePath) });
        if (plan.blockers.length) throw new Error(`Operations gates are blocked:\n- ${plan.blockers.join("\n- ")}`);
        assertSecret(join(root, "operations", "secrets", "grafana-admin-password"));
        const profiles = plan.composeProfiles.flatMap((profile) => ["--profile", profile]);
        compose([...profiles, "config", "--quiet"]);
        compose([...profiles, "up", "--detach", "--wait", "--remove-orphans"]);
        compose(["exec", "-T", "metrics", "wget", "-q", "--spider", "http://logging:3100/ready"]);
        invoke("curl", ["--fail", "--silent", "--show-error", "http://127.0.0.1:53902/api/health"]);
        invoke("curl", ["--fail", "--silent", "--show-error", "--request", "POST", "--header", "content-type: application/json", "--data", "{\"streams\":[]}", "http://127.0.0.1:53901/loki/api/v1/push"]);
        const pid = (dependencies.startForwarder ?? defaultStartForwarder)(repoRoot, forwarderDirectory, revision);
        artifacts.forwarderPid = pid;
        writeActive("running");
        return receipt("succeeded", artifacts, rollback);
      }
      if (!existsSync(activePath)) throw new Error(`No controller ownership receipt exists for ${PROJECT}: ${activePath}`);
      const active = validate(JSON.parse(readFileSync(activePath, "utf8")), activePath);
      if (active.spec.project !== PROJECT) throw new Error(`Ownership receipt does not match ${PROJECT}.`);
      (dependencies.stopForwarder ?? stopForwarder)(pidPath);
      compose(["down", "--remove-orphans"]);
      writeActive("stopped");
      return receipt("succeeded", artifacts, rollback);
    } catch (error) {
      if (operation === "up" && commands.some(({ arguments: args }) => args.includes("up"))) {
        rollback = { attempted: true, succeeded: false };
        (dependencies.stopForwarder ?? stopForwarder)(pidPath);
        const result = run("docker", ["compose", "--project-name", PROJECT, "--file", composeFile, "down", "--remove-orphans"], { cwd: repoRoot, env });
        commands.push({ program: "docker", arguments: ["compose", "--project-name", PROJECT, "--file", composeFile, "down", "--remove-orphans"], status: result.status ?? (result.ok ? 0 : 1) });
        rollback.succeeded = result.ok;
      }
      receipt(rollback.succeeded ? "rolled-back" : "failed", artifacts, rollback, error.message);
      throw error;
    }
  } finally { rmdirSync(lockPath); }
}
