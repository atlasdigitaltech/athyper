/** Deploy compiled source changes to local source API and NEON, preserving base images and rollback. */
import {
  existsSync, readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  openSync, closeSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const root = `${homedir()}/.athyper/instances/dev/deployments/task-rules-${Date.now()}`;
mkdirSync(root, { recursive: true, mode: 0o700 });
const selectedService = process.argv.includes("--studio-only") ? "studio-web" : process.argv.includes("--worker-only") ? "worker" : process.argv.includes("--scheduler-only") ? "scheduler" : process.argv.includes("--neon-only")
  ? "neon-web"
  : process.argv.includes("--api-only")
    ? "api"
    : null;
const receipts = selectedService && existsSync("governance/policy/reports/task-rules-deployment.dev.json")
  ? JSON.parse(
      readFileSync(
        "governance/policy/reports/task-rules-deployment.dev.json",
      ),
    ).receipts.filter((r) => r.service !== selectedService)
  : [];
for (const service of selectedService
  ? [selectedService]
  : ["api", "worker", "scheduler", "neon-web", "studio-web"]) {
  const container = `athyper-dev-source-${service}-1`,
    before = JSON.parse(docker(["inspect", container]))[0],
    dir = `${root}/${service}`;
  mkdirSync(dir);
  const base = `athyper-runtime:p1a-${service}-base-${before.Image.slice(7, 19)}`;
  const baseImage = ["worker","scheduler"].includes(service) ? JSON.parse(docker(["inspect","athyper-dev-source-api-1"]))[0].Image : before.Image;
  const baseInfo=JSON.parse(docker(["image","inspect",baseImage]))[0];
  if(baseInfo.RootFS.Layers.length>100){
    // Preserve the running DEV filesystem/config while bounding overlay depth.
    const exported=`${dir}/runtime-base.tar`, fd=openSync(exported,"w",0o600);
    try{execFileSync("docker",["export",["worker","scheduler"].includes(service)?"athyper-dev-source-api-1":container],{stdio:["ignore",fd,"pipe"]});}finally{closeSync(fd);}
    const changes=[];
    for(const value of baseInfo.Config.Env??[])changes.push("--change",`ENV ${value.slice(0,value.indexOf("="))}=${JSON.stringify(value.slice(value.indexOf("=")+1))}`);
    for(const [key,value] of Object.entries({ENTRYPOINT:baseInfo.Config.Entrypoint,CMD:baseInfo.Config.Cmd,WORKDIR:baseInfo.Config.WorkingDir,USER:baseInfo.Config.User}))if(value&&(!Array.isArray(value)||value.length))changes.push("--change",`${key} ${Array.isArray(value)?JSON.stringify(value):value}`);
    docker(["import",...changes,exported,base]);
  }else docker(["tag", baseImage, base]);
  let recipe = `FROM ${base}\n`;
  const files = [];
  if (!["neon-web","studio-web"].includes(service)) {
    for (const [group, pkg, paths] of [
      ["adapters", "search-meilisearch", ["meilisearch-index.js"]],
      ["contracts", "control-admin", ["index.js", "process-selection.js"]],
      ["contracts", "governance", ["index.js", "process-selection.js"]],
      ["contracts", "documents", ["documents.js", "ports.js"]],
      ["services", "documents", ["document-service.js", "document-routes.js", "kysely-document-repositories.js"]],
      ["platform", "workflow", ["authoring.js", "index.js", "task-approval-runner.js", "task-governance.js", "task-edit-rules.js", "workflow-service.js", "approvals.js", "sla-automation.js"]],
      ["platform", "ai", ["business-partner-tools.js"]],
      ["platform", "notifications", ["notification-planner.js", "durable-delivery.js", "notification-routes.js"]],
      [
        "services",
        "master-data",
        [
          "business-partner-request-service.js", "business-partner-request-validator.js",
          "business-partner-case-view.js",
          "kysely-business-partner-case-repository.js",
          "business-partner-onboarding-cycle.js",
          "business-partner-eligibility-service.js", "supplier-onboarding-completion.js", "supplier-activation-readiness.js", "kysely-business-partner-eligibility-repository.js", "index.js",
        ],
      ],
      ["contracts", "master-data", ["business-partner-requests.js"]],
      [
        "platform",
        "policy",
        [
          "index.js", "policy-authoring-service.js", "task-edit-policy.js", "kysely-policy-authoring-repository.js",
          "policy-service.js",
          "kysely-policy-repository.js",
          "cached-policy-repository.js",
        ],
      ],
      [
        "platform",
        "control-admin",
        [
          "index.js",
          "cycle/process-selection-compiler.js",
          "cycle/process-selection-publication.js",
          "cycle/process-selection-catalog.js",
          "cycle/cycle-config-service.js",
        ],
      ],
      [
        "platform",
        "governance",
        [
          "index.js",
          "process-selection/process-selection-service.js",
          "process-selection/kysely-process-selection-evidence.js",
          "process-selection/kysely-process-document-intent.js",
          "routes/process-selection-routes.js",
          "routes/route-validation.js", "cycles/cycle-execution-services.js", "cycles/kysely-cycle-execution-repository.js", "routes/governance-routes.js",
        ],
      ],
    ]) {
      const name = `@athyper/server-${group === "contracts" ? "contract" : group === "services" ? "service" : group === "adapters" ? "adapter" : "platform"}-${pkg}`,
        target = docker([
          "exec",
          ["worker","scheduler"].includes(service) ? "athyper-dev-source-api-1" : container,
          "readlink",
          "-f",
          `/app/server/node_modules/${name}`,
        ]).trim();
      for (const path of paths)
        files.push({
          source: `server/packages/${group}/${pkg}/dist/${path}`,
          target: `${target}/dist/${path}`,
        });
    }
    for (const file of [
      "register-services.js", "register-adapters.js", "create-container.js",
      "supplier-process-edit-policy.js", "task-edit-policy-authoring.js", "task-rule-publication.js",
      "supplier-process-selection.js", "supplier-information-sla.js",
      "supplier-process-workflow.js",
      "supplier-process-submission.js",
      "supplier-process-tasks.js",
      "supplier-process-task-routes.js",
      "supplier-process-documents.js", "supplier-process-communications.js",
      "supplier-process-document-runtime.js",
    ])
      files.push({
        source: `server/apps/platform-host/dist/composition/${file}`,
        target: `/app/server/dist/composition/${file}`,
      });
    for (const [i, f] of files.entries()) {
      mkdirSync(dirname(`${dir}/rootfs${f.target}`), {recursive:true});
      copyFileSync(f.source, `${dir}/rootfs${f.target}`);
      f.hash = createHash("sha256")
        .update(readFileSync(f.source))
        .digest("hex");
      
    }
    recipe += "COPY rootfs/ /\n";
  } else {
    const plane = service === "studio-web" ? "studio" : "neon";
    cpSync(`apps/${plane}/.next/standalone/apps/${plane}`, `${dir}/${plane}`, {
      recursive: true,
      verbatimSymlinks: true,
    });
    cpSync(`apps/${plane}/.next/static`, `${dir}/${plane}/.next/static`, {
      recursive: true,
    });
    recipe +=
      `USER root\nRUN rm -rf /app/apps/${plane}/.next\nCOPY --chown=node:node ${plane}/ /app/apps/${plane}/\nUSER node\n`;
  }
  writeFileSync(`${dir}/Dockerfile`, recipe);
  const tag = `athyper-runtime:p1a-${service}-${Date.now()}`;
  docker(["build", "-t", tag, dir]);
  const image = docker(["image", "inspect", "--format", "{{.Id}}", tag]).trim();
  if (["neon-web","studio-web"].includes(service))
    docker([
      "run",
      "--rm",
      "--entrypoint",
      "node",
      image,
      "-e",
      "require.resolve('next',{paths:['/app/apps/" + (service === "studio-web" ? "studio" : "neon") + "']})",
    ]);
  if (!["neon-web","studio-web"].includes(service))
    docker([
      "run",
      "--rm",
      "--entrypoint",
      "node",
      image,
      "--input-type=module",
      "-e",
      "await import('./dist/composition/register-services.js')",
    ]);
  const override = `${dir}/override.json`,
    rollback = `${dir}/rollback.json`;
  writeFileSync(
    override,
    JSON.stringify({ services: { [service]: { image } } }),
  );
  writeFileSync(
    rollback,
    JSON.stringify({ services: { [service]: { image: before.Image } } }),
  );
  const config =
    before.Config.Labels["com.docker.compose.project.config_files"].split(",");
  docker([
    "compose",
    "-p",
    before.Config.Labels["com.docker.compose.project"],
    ...config.flatMap((x) => ["-f", x]),
    "-f",
    override,
    "up",
    "-d",
    "--no-deps",
    "--no-build",
    service,
  ]);
  let healthy = false;
  for (let probe=0;probe<30;probe++) {
    const state=JSON.parse(docker(["inspect",container]))[0].State;
    if(state.Running && (!state.Health || state.Health.Status==="healthy")){ healthy=true; break; }
    if(!state.Running) break;
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(!healthy) {
    docker(["compose","-p",before.Config.Labels["com.docker.compose.project"],...config.flatMap(x=>["-f",x]),"-f",rollback,"up","-d","--no-deps","--no-build",service]);
    throw Error(`Deployment failed health qualification; restored previous ${service} image`);
  }
  receipts.push({
    service,
    image,
    beforeImage: before.Image,
    override,
    rollback,
    files,
  });
  writeFileSync(`${dir}/receipt.json`, JSON.stringify(receipts.at(-1), null, 2));
  // Independent service builds may finish out of order; merge only this completed service.
  if (existsSync("governance/policy/reports/task-rules-deployment.dev.json")) {
    const current = JSON.parse(readFileSync("governance/policy/reports/task-rules-deployment.dev.json", "utf8")).receipts;
    const completed = receipts.at(-1);
    receipts.splice(0, receipts.length, ...current.filter(r => r.service !== service), completed);
  }
  writeFileSync(
    "governance/policy/reports/task-rules-deployment.dev.json",
    JSON.stringify({ at: new Date().toISOString(), receipts }, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify(receipts.map(({ service, image }) => ({ service, image }))),
);
