const fs = require("node:fs"),
  cp = require("node:child_process"),
  path = require("node:path"),
  os = require("node:os"),
  ts = require(process.cwd() + "/node_modules/typescript");
const run = (...args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 20e6,
  });
const apply = process.argv.includes("--apply");
if (apply)
  throw Error(
    "Use the coordinated admission rollout after qualification; this helper only builds.",
  );
const c = "athyper-dev-api-1",
  before = JSON.parse(run("inspect", c))[0];
const dir = path.join(
  os.homedir(),
  ".athyper/instances/dev/deployments/atlas-inference-reliability-" +
    new Date().toISOString().replace(/[:.]/g, "-"),
);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const spec = JSON.parse(
  run(
    "compose",
    ...before.Config.Labels["com.docker.compose.project.config_files"]
      .split(",")
      .flatMap((f) => ["-f", f]),
    "config",
    "--format",
    "json",
  ),
);
const escape = (v) =>
  typeof v === "string"
    ? v.replaceAll("$", "$$")
    : Array.isArray(v)
      ? v.map(escape)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, v]) => [k, escape(v)]))
        : v;
spec.services.api.image = before.Image;
delete spec.services.api.build;
fs.writeFileSync(dir + "/rollback.json", JSON.stringify(escape(spec)), {
  mode: 0o600,
});
const transpile = (s) =>
  ts.transpileModule(s, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
const files = [
  [
    "ollama-index",
    "server/packages/adapters/ai-ollama/src/index.ts",
    "/app/server/node_modules/.pnpm/@athyper+server-adapter-ai-ollama@file+server+packages+adapters+ai-ollama/node_modules/@athyper/server-adapter-ai-ollama/dist/index.js",
  ],
  [
    "agent-runtime",
    "server/packages/platform/ai/src/agent-runtime.ts",
    "/app/server/node_modules/.pnpm/@athyper+server-platform-ai@file+server+packages+platform+ai/node_modules/@athyper/server-platform-ai/dist/agent-runtime.js",
  ],
  [
    "atlas-semantic-index",
    "server/apps/platform-host/src/composition/atlas-semantic-index.ts",
    "/app/server/dist/composition/atlas-semantic-index.js",
  ],
  ...[
    "atlas-inference-admission",
    "atlas-attachment-knowledge",
    "atlas-document-grounding",
    "register-services",
  ].map((name) => [
    name,
    `server/apps/platform-host/src/composition/${name}.ts`,
    `/app/server/dist/composition/${name}.js`,
  ]),
];
for (const [name, source] of files)
  fs.writeFileSync(
    dir + "/" + name + ".js",
    transpile(fs.readFileSync(source, "utf8")),
    { mode: 0o600 },
  );
const deployedRegistration = run(
  "exec",
  c,
  "node",
  "-e",
  "process.stdout.write(require('node:fs').readFileSync('/app/server/dist/composition/register-services.js','utf8'))",
);
let registration = deployedRegistration.replace(
  /import \{ OllamaModelProvider \}/,
  "import { configureSharedAtlasInferenceAdmission, OllamaModelProvider }",
);
if (
  registration === deployedRegistration &&
  !registration.includes("configureSharedAtlasInferenceAdmission")
)
  throw Error("Unexpected deployed Atlas import");
if (!registration.includes("import { RedisInferenceAdmission }"))
  registration =
    'import { RedisInferenceAdmission } from "./atlas-inference-admission.js";\n' +
    registration;
const anchor =
  'const semanticConfigPath = process.env["ATLAS_SEMANTIC_RETRIEVAL_CONFIG_PATH"]';
if (!registration.includes(anchor))
  throw Error("Unexpected deployed Atlas composition");
if (
  !registration.includes(
    "configureSharedAtlasInferenceAdmission(new RedisInferenceAdmission(container.adapters.redisCache?.client))",
  )
)
  registration = registration.replace(
    anchor,
    "configureSharedAtlasInferenceAdmission(new RedisInferenceAdmission(container.adapters.redisCache?.client));\n    " +
      anchor,
  );
fs.writeFileSync(dir + "/register-services.js", registration, { mode: 0o600 });
run("tag", before.Image, "athyper-runtime-server:inference-reliability-base");
fs.writeFileSync(
  dir + "/Dockerfile",
  `FROM athyper-runtime-server:inference-reliability-base\n` +
    files
      .map(
        ([name, , target]) => `COPY --chown=node:node ${name}.js ${target}\n`,
      )
      .join(""),
);
const image = "athyper-runtime-server:distributed-inference-20260910";
fs.writeFileSync(dir + "/build.log", run("build", "-t", image, dir), {
  mode: 0o600,
});
run(
  "run",
  "--rm",
  "--entrypoint",
  "node",
  image,
  "--input-type=module",
  "-e",
  'await import("./dist/composition/register-services.js")',
);
if (JSON.parse(run("inspect", c))[0].Id !== before.Id)
  throw Error("Deployment changed during build");
spec.services.api.image = image;
fs.writeFileSync(dir + "/rollout.json", JSON.stringify(escape(spec)), {
  mode: 0o600,
});
if (apply)
  fs.writeFileSync(
    dir + "/rollout.log",
    run(
      "compose",
      "-f",
      dir + "/rollout.json",
      "up",
      "-d",
      "--no-deps",
      "--pull",
      "never",
      "api",
    ),
    { mode: 0o600 },
  );
const receipt = {
  observedAt: new Date().toISOString(),
  applied: apply,
  baseImage: before.Image,
  image,
  imageDigest: JSON.parse(run("image", "inspect", image))[0].Id,
  deploymentDirectory: dir,
  sourceFiles: files.map(([, source]) => ({
    path: source,
    sha256: require("node:crypto")
      .createHash("sha256")
      .update(fs.readFileSync(source))
      .digest("hex"),
  })),
  deploymentStrategy:
    "transpile changed modules; patch the deployed composition narrowly",
  artifacts: files.map(([name, , target]) => ({
    target,
    sha256: require("node:crypto")
      .createHash("sha256")
      .update(fs.readFileSync(dir + "/" + name + ".js"))
      .digest("hex"),
  })),
  moduleImportPassed: true,
};
fs.writeFileSync(
  "docs/examples/atlas-f6/distributed-inference-build.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
