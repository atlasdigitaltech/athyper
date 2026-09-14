#!/usr/bin/env node
/** Personal DEV application mode switch. Existing containers/data remain recoverable. */
import { spawnSync } from "node:child_process";
import { sourceIdentity } from "./evidence.mjs";
import { processIdentity } from "./supervisor.mjs";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
  rmdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, generateKeyPairSync } from "node:crypto";

export const APPLICATIONS = [
  "api",
  "worker",
  "scheduler",
  "studio-web",
  "neon-web",
  "mesh-web",
];
const project = "athyper-dev-source";
const jsonRead = (path) => JSON.parse(readFileSync(path, "utf8"));
const digest = (value) => createHash("sha256").update(value).digest("hex");
function run(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${args[0]} ${args[1]} failed${result.error ? `: ${result.error.message}` : ""}; inspect private operation log`,
    );
  return result.stdout;
}
const docker = (...args) => run(["docker", ...args]);
function containers(name) {
  const ids = docker(
    "ps",
    "-aq",
    "--filter",
    `label=com.docker.compose.project=${name}`,
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return ids.length ? JSON.parse(docker("inspect", ...ids)) : [];
}
const service = (c) => c.Config.Labels["com.docker.compose.service"];
function privateJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
}
export function sourceCompose(
  originals,
  checkout,
  image,
  uid,
  gid,
  previewRoot,
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image))
    throw new Error("Source toolchain requires an immutable local image ID");
  const services = {},
    networks = {},
    volumes = {};
  for (const name of APPLICATIONS) {
    const c = originals.find((c) => service(c) === name);
    if (!c || c.Config.Labels["com.docker.compose.project"] !== "athyper-dev")
      throw new Error(`Existing DEV ${name} container required`);
    const environment = Object.fromEntries(
      c.Config.Env.map((item) => {
        const at = item.indexOf("=");
        return [item.slice(0, at), item.slice(at + 1)];
      }),
    );
    if (
      environment.ATHYPER_DOMAIN_SUFFIX &&
      environment.ATHYPER_DOMAIN_SUFFIX !== "dev.athyper.test"
    )
      throw new Error("Only the personal local DEV instance is supported");
    Object.assign(environment, {
      ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
      ATHYPER_LOCAL_SOURCE: "1",
      ATHYPER_SOURCE_CHECKOUT: checkout,
      NODE_OPTIONS: "--max-old-space-size=3072",
    });
    if (["studio-web", "neon-web"].includes(name)) {
      environment.AUTH_SESSION_IDLE_TTL_SECONDS = "7200";
      environment.AUTH_SESSION_ABSOLUTE_TTL_SECONDS = "43200";
    }
    const scopedSearch =
      !name.endsWith("-web") &&
      c.Mounts.some((m) =>
        ["/run/secrets/search-master-key", "/run/searchcore"].includes(
          m.Destination,
        ),
      );
    const mounts = c.Mounts.filter(
      (m) =>
        !scopedSearch ||
        !["/run/secrets/search-master-key", "/run/searchcore"].includes(
          m.Destination,
        ),
    ).map((m) => {
      if (m.Type !== "bind")
        throw new Error(
          `Unexpected application volume ${name}; explicit migration required`,
        );
      return {
        type: "bind",
        source: m.Source,
        target: m.Destination,
        read_only: !m.RW,
      };
    });
    if (scopedSearch) {
      const existing = c.Mounts.find(
        (m) => m.Destination === "/run/searchcore",
      );
      if (
        existing &&
        (existing.Type !== "volume" ||
          existing.Name !== "athyper-dev_searchcore-key" ||
          existing.RW)
      )
        throw new Error(
          "Unexpected DEV search key volume; explicit migration required",
        );
      volumes["searchcore-key"] = {
        external: true,
        name: "athyper-dev_searchcore-key",
      };
      mounts.push({
        type: "volume",
        source: "searchcore-key",
        target: "/run/searchcore",
        read_only: true,
      });
    }
    mounts.push({ type: "bind", source: checkout, target: checkout });
    if (previewRoot && !name.endsWith("-web")) {
      Object.assign(environment, {
        ATHYPER_LOCAL_WORKSPACE: "1",
        ATHYPER_LOCAL_PREVIEW_ROOT: "/athyper/local-preview",
      });
      mounts.push({
        type: "bind",
        source: previewRoot,
        target: "/athyper/local-preview",
        read_only: name !== "api",
      });
      if (name === "api") {
        environment.ATHYPER_LOCAL_PREVIEW_SIGNING_KEY_FILE =
          "/run/secrets/local-preview-private";
        mounts.push({
          type: "bind",
          source: join(previewRoot, "../preview-private.pem"),
          target: "/run/secrets/local-preview-private",
          read_only: true,
        });
      }
    }
    const connections = {};
    for (const network of Object.keys(c.NetworkSettings.Networks)) {
      networks[network] = { external: true, name: network };
      connections[network] = { aliases: [name] };
    }
    const web = name.endsWith("-web");
    services[name] = {
      image,
      init: true,
      user: `${uid}:${gid}`,
      entrypoint: c.Config.Entrypoint,
      command: c.Config.Cmd,
      working_dir: checkout,
      environment,
      volumes: mounts,
      networks: connections,
      extra_hosts: c.HostConfig.ExtraHosts ?? [],
      restart: "no",
      stop_grace_period: "30s",
      mem_limit: "4g",
      cpus: 2,
      security_opt: ["no-new-privileges:true"],
      cap_drop: ["ALL"],
      labels: {
        "io.athyper.dev-workspace": "source-v1",
        "io.athyper.dev-workspace.checkout": checkout,
      },
      healthcheck: {
        test: [
          "CMD",
          "node",
          "-e",
          web
            ? 'fetch("http://127.0.0.1:3000/").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'
            : name === "api"
              ? 'fetch("http://127.0.0.1:4000/readyz").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'
              : `const fs=require('fs');if(Date.now()-fs.statSync('/tmp/athyper-${name}.heartbeat').mtimeMs>45000)process.exit(1)`,
        ],
        interval: "10s",
        timeout: "5s",
        retries: 24,
        start_period: "30s",
      },
    };
  }
  return {
    name: project,
    services,
    networks,
    ...(Object.keys(volumes).length ? { volumes } : {}),
  };
}
export function resumeSourceCompose(saved, baseline, checkout, image) {
  if (baseline?.checkout !== checkout || saved?.name !== project)
    throw new Error(
      "Saved DEV workspace belongs to another checkout or project",
    );
  if (!/^sha256:[a-f0-9]{64}$/.test(image))
    throw new Error("Source toolchain requires an immutable local image ID");
  const config = structuredClone(saved);
  if (Object.keys(config.services ?? {}).length !== APPLICATIONS.length)
    throw new Error("Complete saved DEV source configuration required");
  for (const name of APPLICATIONS) {
    const definition = config.services[name];
    if (
      definition?.labels?.["io.athyper.dev-workspace"] !== "source-v1" ||
      definition.labels["io.athyper.dev-workspace.checkout"] !== checkout ||
      definition.environment?.ATHYPER_SOURCE_CHECKOUT !== checkout ||
      definition.environment.ATHYPER_LOCAL_SOURCE !== "1" ||
      definition.environment.ATHYPER_DOMAIN_SUFFIX !== "dev.athyper.test" ||
      definition.working_dir !== checkout ||
      !definition.volumes?.some(
        (mount) =>
          mount.type === "bind" &&
          mount.source === checkout &&
          mount.target === checkout,
      )
    )
      throw new Error(`Invalid saved DEV source configuration for ${name}`);
    definition.image = image;
    definition.mem_limit = "4g";
    definition.cpus = 2;
    definition.environment.NODE_OPTIONS = "--max-old-space-size=3072";
  }
  return config;
}

function schemaSnapshot(db) {
  return Object.fromEntries(
    ["studio", "neon", "mesh"].map((plane) => [
      plane,
      digest(
        docker(
          "exec",
          db.Id,
          "pg_dump",
          "-U",
          "postgres",
          "--schema-only",
          "--no-owner",
          "--no-privileges",
          `athyper_${plane}`,
        )
          .split("\n")
          .filter(
            (line) =>
              !line.startsWith("\\restrict ") &&
              !line.startsWith("\\unrestrict "),
          )
          .join("\n"),
      ),
    ]),
  );
}
export async function main(args = process.argv.slice(2)) {
  const mode = args[0],
    preset = args[1] === "--preset" ? args[2] : "devfull";
  if (
    !["devsimple", "devfull"].includes(preset) ||
    ![1, 3].includes(args.length) ||
    (args.length === 3 && (args[1] !== "--preset" || mode !== "source")) ||
    !["source", "container", "legacy", "build", "recover", "status"].includes(
      mode,
    )
  )
    throw new Error(
      "Use pnpm dev:workspace source [--preset devsimple|devfull] | build | container | legacy | recover | status",
    );
  const checkout = resolve(import.meta.dirname, "../../.."),
    root = join(homedir(), ".athyper/instances/dev/workspace");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const endpoint = JSON.parse(
    docker("context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"),
  );
  if (
    !endpoint.startsWith("unix://") ||
    (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix://"))
  )
    throw new Error("Requires the local Unix Docker daemon");
  if (mode === "recover") {
    const lock = join(root, "operation.lock"),
      shared = join(homedir(), ".athyper/locks/stackctl-operation.lock"),
      owner = join(shared, "workspace-owner.json");
    if (!existsSync(lock) || !existsSync(owner))
      throw new Error(
        "No recoverable workspace-owned lock; do not remove another controller's lock",
      );
    const record = jsonRead(lock),
      sharedOwner = jsonRead(owner);
    if (
      record.checkout !== checkout ||
      record.token !== sharedOwner.token ||
      !Number.isInteger(record.pid) ||
      !record.startTime
    )
      throw new Error("Unrecognized workspace lock ownership");
    if (processIdentity(record.pid) === record.startTime)
      throw new Error("Workspace operation is still running");
    const processes = run(["ps", "-eo", "args"]);
    if (
      /(?:^|\n)(?:\S*\/)?docker(?:-(?:compose|buildx)|\s+(?:compose|buildx))\b/m.test(
        processes,
      )
    )
      throw new Error(
        "Docker Compose/build process is still running; wait before recovery",
      );
    if (readdirSync(shared).some((name) => name !== "workspace-owner.json"))
      throw new Error("Shared lock contains unrecognized state");
    unlinkSync(lock);
    unlinkSync(owner);
    rmdirSync(shared);
    console.log(
      "Recovered abandoned workspace locks. Containers and data were not changed; inspect status before switching mode.",
    );
    return;
  }
  const originals = containers("athyper-dev"),
    sources = containers(project);
  for (const c of sources)
    if (c.Config.Labels["io.athyper.dev-workspace.checkout"] !== checkout)
      throw new Error("Another checkout owns source mode");
  if (mode === "status") {
    const active = originals.filter(
        (c) => APPLICATIONS.includes(service(c)) && c.State.Running,
      ),
      source = sources.filter((c) => c.State.Running);
    console.log(
      JSON.stringify(
        {
          mode:
            active.length && source.length
              ? "conflict"
              : source.length
                ? source[0].Config.Env.includes("ATHYPER_LOCAL_SOURCE=1")
                  ? "source"
                  : "container"
                : active.length
                  ? "legacy"
                  : "stopped",
          legacyApplications: active.map((c) => service(c)),
          workspaceApplications: source.map((c) => ({
            service: service(c),
            health: c.State.Health?.Status,
          })),
          urls: ["studio", "neon", "mesh", "api", "iam"].map(
            (app) => `https://${app}.dev.athyper.test`,
          ),
        },
        null,
        2,
      ),
    );
    return;
  }
  const stackLock = join(homedir(), ".athyper/locks/stackctl-operation.lock");
  mkdirSync(join(homedir(), ".athyper/locks"), {
    recursive: true,
    mode: 0o700,
  });
  mkdirSync(stackLock, { mode: 0o700 });
  const lock = join(root, "operation.lock");
  let fd;
  try {
    fd = openSync(lock, "wx", 0o600);
  } catch (error) {
    rmdirSync(stackLock);
    throw error;
  }
  const owner = {
    pid: process.pid,
    startTime: processIdentity(process.pid),
    checkout,
    mode,
    token: crypto.randomUUID(),
  };
  writeFileSync(fd, JSON.stringify(owner));
  closeSync(fd);
  privateJson(join(stackLock, "workspace-owner.json"), owner);
  const log = openSync(join(root, "operation.log"), "a", 0o600);
  const mutate = (...args) =>
    run(["docker", ...args], { stdio: ["ignore", log, log] });
  try {
    const selected = originals.filter((c) => APPLICATIONS.includes(service(c)));
    const missing = APPLICATIONS.filter(
      (name) => !selected.some((c) => service(c) === name),
    );
    if (missing.length && mode !== "source")
      throw new Error(
        `Missing legacy DEV applications: ${missing.join(", ")}. Source mode can resume from its saved configuration.`,
      );
    const db = originals.find((c) => service(c) === "db");
    if (!db) throw new Error("Existing DEV database required");
    if (mode === "build") {
      const before = await sourceIdentity(checkout),
        tag = `workspace-${before.treeSha256.slice(0, 12)}`;
      run(
        [
          "docker",
          "buildx",
          "bake",
          "--file",
          "deploy/docker-bake.hcl",
          "--set",
          "*.labels.io.athyper.local-preview.protocol=1",
          "runtime-server",
          "neon-web",
          "mesh-web",
          "studio-web",
        ],
        {
          cwd: checkout,
          env: {
            ...process.env,
            LOCAL_TAG: tag,
            SOURCE_REVISION: `working-tree-${before.treeSha256}`,
          },
          stdio: ["ignore", log, log],
        },
      );
      const after = await sourceIdentity(checkout);
      if (before.treeSha256 !== after.treeSha256)
        throw new Error(
          "Source changed during the development build; built images were not adopted. Run build again after edits settle.",
        );
      const images = Object.fromEntries(
        ["runtime-server", "neon-web", "mesh-web", "studio-web"].map((name) => [
          name,
          docker(
            "image",
            "inspect",
            `athyper/${name}:${tag}`,
            "--format",
            "{{.Id}}",
          ).trim(),
        ]),
      );
      privateJson(join(root, "development-images.json"), {
        schemaVersion: 1,
        checkout,
        sourceTreeSha256: before.treeSha256,
        images,
        releaseQualified: false,
        at: new Date().toISOString(),
      });
      console.log(
        "Development images built and bound to the checkout tree. Use pnpm dev:workspace container.",
      );
      return;
    }
    if (mode === "source") {
      const image = docker(
        "image",
        "inspect",
        "node:24.19.0-bookworm-slim",
        "--format",
        "{{.Id}}",
      ).trim();
      const previewRoot = join(root, "preview");
      mkdirSync(previewRoot, { recursive: true, mode: 0o700 });
      if (!existsSync(join(root, "preview-private.pem"))) {
        const pair = generateKeyPairSync("ed25519");
        writeFileSync(
          join(root, "preview-private.pem"),
          pair.privateKey.export({ type: "pkcs8", format: "pem" }),
          { mode: 0o600, flag: "wx" },
        );
        writeFileSync(
          join(previewRoot, "public.pem"),
          pair.publicKey.export({ type: "spki", format: "pem" }),
          { mode: 0o600, flag: "wx" },
        );
      }
      const baseline = join(root, "baseline.json");
      const fullFile = join(root, "source.full.compose.json");
      const config = missing.length
        ? resumeSourceCompose(
            jsonRead(
              existsSync(fullFile)
                ? fullFile
                : join(root, "source.compose.json"),
            ),
            jsonRead(baseline),
            checkout,
            image,
          )
        : sourceCompose(
            originals,
            checkout,
            image,
            process.getuid(),
            process.getgid(),
            previewRoot,
          );
      // Keep all six definitions so devsimple can later return to devfull
      // even after the legacy containers have been removed.
      privateJson(fullFile, config);
      if (preset === "devsimple") {
        delete config.services["studio-web"];
        delete config.services["mesh-web"];
        for (const service of Object.values(config.services)) {
          service.mem_limit = "2g";
          service.cpus = 1;
          service.environment.NODE_OPTIONS = "--max-old-space-size=1536";
        }
      }
      const file = join(root, "source.compose.json");
      privateJson(file, config);
      mutate("compose", "-p", project, "-f", file, "config", "--quiet");
      // Preserve all databases before the first use. Never initialize or reset this workspace.
      if (!db.State.Running) mutate("start", db.Id);
      for (let n = 0; n < 60; n++) {
        try {
          docker("exec", db.Id, "pg_isready", "-U", "postgres");
          break;
        } catch {
          if (n === 59) throw new Error("DEV database did not become ready");
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (!existsSync(baseline)) {
        const stamp = Date.now();
        for (const plane of ["studio", "neon", "mesh"]) {
          const out = openSync(
            join(root, `${plane}-${stamp}.dump`),
            "wx",
            0o600,
          );
          try {
            run(
              [
                "docker",
                "exec",
                db.Id,
                "pg_dump",
                "-U",
                "postgres",
                "-Fc",
                `athyper_${plane}`,
              ],
              { stdio: ["ignore", out, log] },
            );
          } finally {
            closeSync(out);
          }
        }
        privateJson(baseline, {
          checkout,
          containers: selected.map((c) => ({ id: c.Id, image: c.Image })),
          schemas: schemaSnapshot(db),
          at: new Date().toISOString(),
        });
      }
      const baselineState = JSON.parse(readFileSync(baseline));
      if (baselineState.checkout !== checkout)
        throw new Error("Another checkout owns the DEV workspace");
      const managed = join(homedir(), ".athyper/local-dev/active.json");
      if (existsSync(managed))
        run(
          [
            process.execPath,
            join(checkout, "tooling/scripts/local-dev/cli.mjs"),
            "down",
          ],
          { stdio: ["ignore", log, log] },
        );
      if (selected.length)
        mutate("stop", "--time", "30", ...selected.map((c) => c.Id));
      const supporting = originals.filter(
        (c) =>
          !APPLICATIONS.includes(service(c)) && !service(c).endsWith("-init"),
      );
      if (supporting.length) mutate("start", ...supporting.map((c) => c.Id));
      const ingress = containers("athyper-platform");
      if (ingress.length) mutate("start", ...ingress.map((c) => c.Id));
      for (let attempt = 0; attempt < 180; attempt++) {
        const pending = containers("athyper-dev").filter(
          (c) =>
            supporting.some((s) => s.Id === c.Id) &&
            c.State.Health &&
            c.State.Health.Status !== "healthy",
        );
        if (!pending.length) break;
        if (attempt === 179)
          throw new Error(
            `Infrastructure readiness failed: ${pending.map(service).join(", ")}`,
          );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (sources.length)
        mutate("stop", "--time", "30", ...sources.map((c) => c.Id));
      try {
        mutate(
          "compose",
          "-p",
          project,
          "-f",
          file,
          "up",
          "-d",
          "--remove-orphans",
          "--wait",
          "--wait-timeout",
          "300",
        );
      } catch (error) {
        mutate("compose", "-p", project, "-f", file, "stop");
        // Restore original images only if no schema mutation occurred.
        if (
          !missing.length &&
          JSON.stringify(schemaSnapshot(db)) ===
            JSON.stringify(baselineState.schemas)
        )
          mutate("start", ...selected.map((c) => c.Id));
        throw error;
      }
    } else {
      const baseline = JSON.parse(readFileSync(join(root, "baseline.json")));
      if (
        baseline.checkout !== checkout ||
        selected.some(
          (c) =>
            !baseline.containers.some(
              (saved) => saved.id === c.Id && saved.image === c.Image,
            ),
        )
      )
        throw new Error(
          "Original DEV images changed; review compatibility before adopting a new baseline",
        );
      if (
        JSON.stringify(schemaSnapshot(db)) !== JSON.stringify(baseline.schemas)
      )
        throw new Error(
          "DEV schema changed in source mode; qualify compatible images before container mode",
        );
      if (mode === "container") {
        const built = jsonRead(join(root, "development-images.json"));
        if (built.checkout !== checkout)
          throw new Error("Development images belong to another checkout");
        const config = sourceCompose(
          originals,
          checkout,
          built.images["runtime-server"],
          process.getuid(),
          process.getgid(),
          join(root, "preview"),
        );
        for (const [name, definition] of Object.entries(config.services)) {
          const original = selected.find((c) => service(c) === name);
          definition.image =
            built.images[name.endsWith("-web") ? name : "runtime-server"];
          const image = JSON.parse(
            docker("image", "inspect", definition.image),
          )[0];
          if (
            image.Config.Labels?.["org.opencontainers.image.revision"] !==
              `working-tree-${built.sourceTreeSha256}` ||
            image.Config.Labels?.["io.athyper.local-preview.protocol"] !== "1"
          )
            throw new Error(
              "Development image provenance or preview support mismatch",
            );
          definition.environment.ATHYPER_LOCAL_SOURCE = "0";
          definition.environment.NODE_ENV = "production";
          definition.working_dir = original.Config.WorkingDir;
          definition.volumes = definition.volumes.filter(
            (mount) => mount.target !== checkout,
          );
        }
        const file = join(root, "container.compose.json");
        privateJson(file, config);
        mutate("compose", "-p", project, "-f", file, "config", "--quiet");
        mutate("stop", "--time", "30", ...selected.map((c) => c.Id));
        if (sources.length)
          mutate("stop", "--time", "30", ...sources.map((c) => c.Id));
        try {
          mutate(
            "compose",
            "-p",
            project,
            "-f",
            file,
            "up",
            "-d",
            "--remove-orphans",
            "--wait",
            "--wait-timeout",
            "300",
          );
        } catch (error) {
          mutate("compose", "-p", project, "-f", file, "stop");
          mutate(
            "compose",
            "-p",
            project,
            "-f",
            join(root, "source.compose.json"),
            "up",
            "-d",
            "--wait",
            "--wait-timeout",
            "300",
          );
          privateJson(join(root, "mode.json"), {
            mode: "source",
            preset: "devfull",
            checkout,
            at: new Date().toISOString(),
          });
          throw error;
        }
      } else {
        if (sources.length)
          mutate("stop", "--time", "30", ...sources.map((c) => c.Id));
        mutate("start", ...selected.map((c) => c.Id));
      }
    }
    privateJson(join(root, "mode.json"), {
      mode,
      preset,
      checkout,
      at: new Date().toISOString(),
    });
    console.log(
      `DEV ${mode} mode selected. URLs and IAM remain https://<app>.dev.athyper.test`,
    );
  } finally {
    closeSync(log);
    unlinkSync(lock);
    unlinkSync(join(stackLock, "workspace-owner.json"));
    rmdirSync(stackLock);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
