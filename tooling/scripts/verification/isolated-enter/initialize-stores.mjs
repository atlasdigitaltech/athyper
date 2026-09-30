/** Clone-only runtime infrastructure privileges and an empty isolated object bucket. */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
const root =
  homedir() + "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const run = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const c = JSON.parse(run(["inspect", "athyper-bp-enter-db"]))[0];
if (
  Object.keys(c.NetworkSettings.Networks).join(",") !==
  "athyper-bp-enter-isolated"
)
  throw Error("DEDICATED_DATABASE_REQUIRED");
run([
  "exec",
  "athyper-bp-enter-db",
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
    "athyper-bp-enter-db",
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
  "athyper-bp-enter-isolated",
  "--env-file",
  root + "/runtime.env",
  "--entrypoint",
  "node",
  "sha256:671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47",
  "--input-type=module",
  "-e",
  `import{createRequire}from'node:module';const r=createRequire(import.meta.resolve('@athyper/server-adapter-object-storage-s3'));const{S3Client,CreateBucketCommand,HeadBucketCommand,PutObjectCommand}=r('@aws-sdk/client-s3');const c=new S3Client({endpoint:process.env.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.APP_S3_ACCESS_KEY,secretAccessKey:process.env.APP_S3_SECRET_KEY}});for(const Bucket of [process.env.S3_BUCKET_DOCUMENTS,process.env.S3_BUCKET_ARTIFACTS,process.env.S3_BUCKET_TRANSFERS]){try{await c.send(new HeadBucketCommand({Bucket}));}catch(e){if(e.$metadata?.httpStatusCode!==404)throw e;await c.send(new CreateBucketCommand({Bucket}));}}await c.send(new PutObjectCommand({Bucket:process.env.S3_BUCKET_ARTIFACTS,Key:'_probes/artifacts-sentinel',Body:'isolated storage readiness'}));c.destroy();`,
]);
console.log(
  JSON.stringify({
    initialized: true,
    cloneOnly: true,
    businessGrantsChanged: false,
  }),
);
