import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dependencyPlan,
  buildDependencies,
  watchDependencies,
} from "./dependencies.mjs";
import { applicationEnvironment } from "./applications.mjs";
import { readJson, hash } from "./model.mjs";
import { writeJson, setOperationSignal } from "./runtime.mjs";

const configurationHash = (plan) =>
  hash(
    JSON.stringify({
      apps: plan.apps,
      ports: plan.ports,
      origins: plan.origins,
      resources: plan.resources,
    }),
  );

export function processIdentity(pid) {
  try {
    const fields = readFileSync(`/proc/${pid}/stat`, "utf8")
      .split(") ")[1]
      .split(" ");
    return fields[0] === "Z" ? null : fields[19];
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
export function supervisorState(plan) {
  const path = join(plan.root, "processes.json");
  if (!existsSync(path)) return null;
  const state = readJson(path);
  if (state.environment !== plan.id || state.checkout !== plan.checkout)
    throw new Error("Foreign source supervisor state");
  return {
    ...state,
    alive: Boolean(
      state.startTime && processIdentity(state.pid) === state.startTime,
    ),
  };
}
export async function stopApplications(plan) {
  const state = supervisorState(plan);
  if (!state) return;
  if (!state.alive) {
    for (const child of Object.values(state.processes ?? {})) {
      if (child.startTime && processIdentity(child.pid) === child.startTime) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
        for (
          let retry = 0;
          retry < 100 && processIdentity(child.pid) === child.startTime;
          retry++
        )
          await new Promise((resolve) => setTimeout(resolve, 250));
        if (processIdentity(child.pid) === child.startTime)
          process.kill(-child.pid, "SIGKILL");
      }
    }
    return;
  }
  process.kill(-state.pid, "SIGTERM");
  for (let retry = 0; retry < 100; retry++) {
    if (!supervisorState(plan)?.alive) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (supervisorState(plan)?.alive) process.kill(-state.pid, "SIGKILL");
}
export async function probeApplications(plan) {
  const modes = ["api", "worker", "scheduler", ...plan.apps];
  const checks = await Promise.all(
    modes.map(async (mode) => {
      const endpoint = ["worker", "scheduler"].includes(mode)
        ? `http://127.0.0.1:${plan.ports[`${mode}Metrics`]}/metrics`
        : `http://127.0.0.1:${plan.ports[mode]}${mode === "api" ? "/readyz" : "/"}`;
      try {
        const response = await fetch(endpoint, {
          redirect: "manual",
          signal: AbortSignal.timeout(2000),
          headers: {
            host: new URL(plan.origins[mode] ?? plan.origins.api).host,
          },
        });
        return {
          mode,
          status: response.status,
          ready: response.status >= 200 && response.status < 400,
        };
      } catch {
        return { mode, ready: false };
      }
    }),
  );
  return { ready: checks.every((check) => check.ready), checks };
}

export async function launchApplications(plan, { signal } = {}) {
  signal?.throwIfAborted();
  const current = supervisorState(plan);
  if (
    current?.alive &&
    current.state === "ready" &&
    current.configurationSha256 === configurationHash(plan) &&
    JSON.stringify(current.apps) === JSON.stringify(plan.apps) &&
    (await probeApplications(plan)).ready
  )
    return current;
  await stopApplications(plan);
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), join(plan.root, "manifest.json")],
    {
      detached: true,
      stdio: "ignore",
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    },
  );
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  for (let retry = 0; retry < 240; retry++) {
    if (signal?.aborted) {
      await stopApplications(plan);
      signal.throwIfAborted();
    }
    const state = supervisorState(plan);
    if (
      state?.pid === child.pid &&
      ["ready", "failed", "stopped"].includes(state.state)
    ) {
      if (state.state !== "ready")
        throw new Error(
          `Source startup failed: ${state.error}. See ${plan.root}/*-source.log`,
        );
      return state;
    }
    if (!processIdentity(child.pid))
      throw new Error(
        `Source supervisor exited; inspect ${plan.root}/processes.json`,
      );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await stopApplications(plan);
  throw new Error("Source readiness timed out");
}
async function supervise(plan) {
  const state = {
    schemaVersion: 1,
    configurationSha256: configurationHash(plan),
    environment: plan.id,
    checkout: plan.checkout,
    pid: process.pid,
    startTime: processIdentity(process.pid),
    state: "starting",
    apps: plan.apps,
    processes: {},
    at: new Date().toISOString(),
  };
  const save = () => writeJson(join(plan.root, "processes.json"), state);
  const children = [];
  const controller = new AbortController();
  setOperationSignal(controller.signal);
  let closeWatches = () => {};
  let stopping = false;
  function shutdown(error) {
    if (stopping) return;
    stopping = true;
    state.state = error ? "failed" : "stopped";
    if (error) state.error = String(error);
    save();
    closeWatches();
    controller.abort();
    const alive = children.filter(
      (child) => child.exitCode === null && child.signalCode === null,
    );
    for (const child of alive) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    const force = setTimeout(() => {
      for (const child of alive) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
      process.exit(error ? 1 : 0);
    }, 22000);
    Promise.all(
      alive.map(
        (child) => new Promise((resolve) => child.once("close", resolve)),
      ),
    ).then(() => {
      clearTimeout(force);
      process.exit(error ? 1 : 0);
    });
  }
  process.once("SIGINT", () => shutdown());
  process.once("SIGTERM", () => shutdown());
  save();
  try {
    const graph = await dependencyPlan(plan);
    await buildDependencies(plan, graph);
    state.dependencies = {
      packages: graph.length,
      compiled: graph.filter((item) => item.build).map((item) => item.name),
    };
    closeWatches = watchDependencies(
      plan,
      graph,
      (receipt) => {
        state.lastDependencyBuild = receipt;
        save();
      },
      (error) => shutdown(error),
    );
    if (stopping) return;
    for (const mode of ["api", "worker", "scheduler", ...plan.apps]) {
      const frontend = plan.apps.includes(mode);
      if (frontend) {
        for (const name of [
          ".env",
          ".env.local",
          ".env.development",
          ".env.development.local",
        ])
          if (existsSync(join(plan.checkout, "apps", mode, name)))
            throw new Error(
              `Move ${mode}/${name} before isolated startup: Next would inherit unmanaged configuration`,
            );
      }
      const binary = join(
        plan.checkout,
        frontend
          ? `apps/${mode}/node_modules/.bin/next`
          : "node_modules/.bin/tsx",
      );
      const args = frontend
        ? [
            "dev",
            join(plan.checkout, "apps", mode),
            "--hostname",
            "127.0.0.1",
            "--port",
            String(plan.ports[mode]),
          ]
        : [
            "watch",
            "--tsconfig",
            join(plan.checkout, "server/apps/platform-host/tsconfig.json"),
            join(plan.checkout, "server/apps/platform-host/src/main.ts"),
          ];
      const child = spawn(binary, args, {
        cwd: plan.root,
        detached: true,
        env: applicationEnvironment(plan, mode),
        stdio: ["ignore", "pipe", "pipe"],
      });
      children.push(child);
      state.processes[mode] = {
        pid: child.pid,
        startTime: processIdentity(child.pid),
      };
      const log = join(plan.root, `${mode}-source.log`);
      const output = (chunk) => {
        if (existsSync(log) && statSync(log).size > 5 * 1024 * 1024)
          renameSync(log, `${log}.1`);
        appendFileSync(log, chunk, { mode: 0o600 });
      };
      child.stdout.on("data", output);
      child.stderr.on("data", output);
      child.once("error", (error) => shutdown(error));
      child.once("exit", (code) => {
        if (!stopping) shutdown(`${mode} exited (${code})`);
      });
      save();
    }
    for (const mode of ["api", "worker", "scheduler", ...plan.apps]) {
      let ready = false;
      for (let retry = 0; retry < 180 && !stopping; retry++) {
        try {
          const endpoint = ["worker", "scheduler"].includes(mode)
            ? `http://127.0.0.1:${plan.ports[`${mode}Metrics`]}/metrics`
            : `http://127.0.0.1:${plan.ports[mode]}${mode === "api" ? "/readyz" : "/"}`;
          const response = await fetch(endpoint, {
            redirect: "manual",
            signal: AbortSignal.timeout(2000),
          });
          if (response.status >= 200 && response.status < 400) {
            ready = true;
            break;
          }
        } catch {
          /* server still compiling */
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!ready) throw new Error(`${mode} readiness failed`);
    }
    if (!stopping) {
      state.state = "ready";
      save();
    }
  } catch (error) {
    shutdown(error);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await supervise(readJson(process.argv[2]));
}
