/** Clone-only runtime infrastructure privileges and an empty isolated object bucket. */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
const root =
  homedir() +
  "/.athyper/instances/dev/deployments/bp-release-20-isolated-20260911";
const run = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const c = JSON.parse(run(["inspect", "athyper-bp-r20-db"]))[0];
if (
  Object.keys(c.NetworkSettings.Networks).join(",") !==
  "athyper-bp-r20-isolated"
)
  throw Error("DEDICATED_DATABASE_REQUIRED");
run([
  "exec",
  "athyper-bp-r20-db",
  "psql",
  "-X",
  "-U",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  "GRANT athyperapp TO athyper_worker;",
]);
for (const plane of ["studio", "neon", "mesh"])
  run([
    "exec",
    "athyper-bp-r20-db",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `ALTER DATABASE athyper_${plane} SET app.database_plane='${plane}';`,
  ]);
run([
  "run",
  "--rm",
  "--network",
  "athyper-bp-r20-isolated",
  "--env-file",
  root + "/runtime.env",
  "--entrypoint",
  "node",
  "sha256:3fbbbaa376286770d3d8f0563cc72015f67aabfcc4fe4223531fd8005317143c",
  "--input-type=module",
  "-e",
  `import{createRequire}from'node:module';const r=createRequire(import.meta.resolve('@athyper/server-adapter-object-storage-s3'));const{S3Client,CreateBucketCommand,HeadBucketCommand}=r('@aws-sdk/client-s3');const c=new S3Client({endpoint:process.env.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.APP_S3_ACCESS_KEY,secretAccessKey:process.env.APP_S3_SECRET_KEY}});try{await c.send(new HeadBucketCommand({Bucket:process.env.S3_BUCKET}));}catch(e){if(e.$metadata?.httpStatusCode!==404)throw e;await c.send(new CreateBucketCommand({Bucket:process.env.S3_BUCKET}));}c.destroy();`,
]);
console.log(
  JSON.stringify({
    initialized: true,
    cloneOnly: true,
    businessGrantsChanged: false,
  }),
);
