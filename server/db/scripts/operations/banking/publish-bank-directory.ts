/** Publish an identical governed release into one plane; default is a rolled-back rehearsal. */
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import type { BankDirectoryRelease } from "../../../../packages/contracts/master-data/src/bank-directory.js";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const plane = args.find((arg) => arg.startsWith("--plane="))?.slice(8);
if (!file || !["neon", "mesh", "studio"].includes(plane ?? "") || args.some(arg => arg.startsWith("--") && arg !== "--apply" && !arg.startsWith("--plane="))) {
  throw new Error("Usage: publish-bank-directory.ts release.json --plane=neon|mesh|studio [--apply]");
}
const release = JSON.parse(await readFile(file, "utf8")) as BankDirectoryRelease;
if (!Number.isSafeInteger(release.version) || release.version < 1 || !/^[a-f0-9]{64}$/.test(release.contentHash ?? "")) throw new Error("Release requires a positive version and a SHA-256 contentHash");
const connectionString = process.env.BANK_DIRECTORY_DATABASE_ADMIN_URL;
if (!connectionString || new URL(connectionString).pathname !== `/athyper_${plane}`) throw new Error("BANK_DIRECTORY_DATABASE_ADMIN_URL must target the selected plane");
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT shared.publish_bank_directory($1::uuid,$2::bigint,$3::timestamptz,$4::jsonb,$5::jsonb,$6::text)", [release.id,release.version,release.publishedAt,JSON.stringify(release.sources),JSON.stringify(release.payload),release.contentHash]);
  const active = await client.query("SELECT r.id,r.version,r.content_hash FROM shared.bank_directory_activation a JOIN shared.bank_directory_release r ON r.id=a.release_id");
  await client.query(args.includes("--apply") ? "COMMIT" : "ROLLBACK");
  console.log(JSON.stringify({ plane, mode: args.includes("--apply") ? "applied" : "rehearsed_rolled_back", activeRelease: active.rows[0] }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { await client.end(); }
