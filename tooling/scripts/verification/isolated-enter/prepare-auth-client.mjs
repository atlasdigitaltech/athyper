import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import assert from "node:assert/strict";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const proof = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-enter-access-20260912.application.dev.json",
  ),
);
assert.ok(proof.grantsApplied && Date.now() < Date.parse(proof.effectiveUntil));
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 2000000,
  });
// Capture in memory and write only to a private file. Never log credentials.
const env = JSON.parse(
  run([
    "exec",
    "athyper-dev-source-neon-web-1",
    "node",
    "--input-type=module",
    "-e",
    `import{readFileSync,readdirSync}from'node:fs';const pid=readdirSync('/proc').find(p=>/^\\d+$/.test(p)&&readFileSync('/proc/'+p+'/cmdline','utf8').startsWith('next-server'));if(!pid)throw Error('NEON_PROCESS_MISSING');const env=Object.fromEntries(readFileSync('/proc/'+pid+'/environ','utf8').split('\\0').filter(v=>v.includes('=')).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));console.log(JSON.stringify(Object.fromEntries(Object.entries(env).filter(([k])=>/^(SESSION_|KEYCLOAK_|NEON_KEYCLOAK_|AUTH_CONFIGURATION_REVISION$|REDIS_URL$|NODE_ENV$|RUNTIME_API_URL$)/.test(k)))));`,
  ]),
);
env.KEYCLOAK_INTERNAL_BASE_URL = "http://athyper-dev-iam-1:8080";
fs.writeFileSync(
  root + "/auth-client.env",
  Object.entries(env)
    .map(([k, v]) => k + "=" + v)
    .join("\n") + "\n",
  { mode: 0o600, flag: "wx" },
);
const jwks = JSON.parse(
  run([
    "exec",
    "athyper-dev-source-neon-web-1",
    "node",
    "--input-type=module",
    "-e",
    `const r=await fetch('http://iam:8080/realms/athyper/protocol/openid-connect/certs');if(!r.ok)throw Error('JWKS_FETCH_FAILED');console.log(JSON.stringify(await r.json()));`,
  ]),
);
assert.ok(
  Array.isArray(jwks.keys) &&
    jwks.keys.length &&
    !jwks.keys.some((k) => k.d || k.p || k.q || k.k),
);
const expiresAt = new Date(
  Math.min(Date.now() + 60 * 60 * 1000, Date.parse(proof.effectiveUntil)),
).toISOString();
fs.writeFileSync(
  root + "/jwks.json",
  JSON.stringify({ capturedAt: new Date().toISOString(), expiresAt, jwks }),
  { mode: 0o600, flag: "wx" },
);
fs.writeFileSync(
  root + "/jwks-server.cjs",
  `const{createServer}=require('node:http'),{readFileSync}=require('node:fs');createServer((req,res)=>{const d=JSON.parse(readFileSync('/trust/jwks.json'));if(req.method!=='GET'||req.url!=='/realms/athyper/protocol/openid-connect/certs'||Date.now()>=Date.parse(d.expiresAt)){res.writeHead(503).end();return;}res.setHeader('content-type','application/json');res.end(JSON.stringify(d.jwks));}).listen(8080);`,
  { mode: 0o600, flag: "wx" },
);
run([
  "run",
  "-d",
  "--name",
  "athyper-bp-enter-jwks",
  "--network",
  "athyper-bp-enter-isolated",
  "--network-alias",
  "iam",
  "--mount",
  "type=bind,src=" + root + "/jwks.json,dst=/trust/jwks.json,readonly",
  "--mount",
  "type=bind,src=" + root + "/jwks-server.cjs,dst=/trust/server.cjs,readonly",
  "--entrypoint",
  "node",
  "--no-healthcheck",
  proof.image,
  "/trust/server.cjs",
]);
run([
  "run",
  "-d",
  "--name",
  "athyper-bp-enter-auth-client",
  "--network",
  "athyper-dev_app",
  "--env-file",
  root + "/auth-client.env",
  "--mount",
  "type=bind,src=" + process.cwd() + "/tests/e2e/.auth,dst=/auth,readonly",
  "--mount",
  "type=bind,src=" +
    root +
    "/session-client.mjs,dst=/app/server/qualification-client/session-client.mjs,readonly",
  "--entrypoint",
  "node",
  "--no-healthcheck",
  proof.image,
  "-e",
  "setInterval(()=>{},3600000)",
]);
run([
  "network",
  "connect",
  "athyper-bp-enter-isolated",
  "athyper-bp-enter-auth-client",
]);
console.log({
  prepared: true,
  publicKeyCount: jwks.keys.length,
  publicKeysExpireAt: expiresAt,
  clientHasListeningPort: false,
  runtimeImageUnchanged: true,
});
