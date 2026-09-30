import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import test from "node:test";

// Redis 7.4 RDB v12 is incompatible with Valkey. Qualify a pure command AOF,
// including absolute expiration and stream consumer-group pending state.
test(
  "Redis 7.4 command AOF migrates to Valkey without losing data",
  { skip: process.env.ATHYPER_REDIS_TESTS !== "true" },
  async () => {
    const name = `valkey-migration-${randomBytes(6).toString("hex")}`;
    const run = (...args) => {
      const r = spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const cli = (...args) => run("exec", name, "redis-cli", "--raw", ...args);
    const wait = async () => {
      for (let n = 0; n < 100; n++) {
        try {
          if (cli("PING") === "PONG") return;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Error("Server not ready");
    };
    try {
      run("volume", "create", name);
      run(
        "run",
        "-d",
        "--name",
        name,
        "--network",
        "none",
        "-v",
        `${name}:/data`,
        "athyper/redis:7.4.8-hardened",
        "redis-server",
        "--appendonly",
        "yes",
        "--aof-use-rdb-preamble",
        "no",
      );
      await wait();
      assert.equal(cli("SET", "session", "value", "PX", "120000"), "OK");
      const expiry = cli("PEXPIRETIME", "session");
      cli("HSET", "job", "data", '{"value":21}', "name", "probe");
      cli("RPUSH", "wait", "job");
      cli("ZADD", "delayed", "123456", "job");
      cli("SADD", "members", "one", "two");
      const id = cli("XADD", "events", "*", "event", "added");
      cli("XGROUP", "CREATE", "events", "workers", "0");
      cli(
        "XREADGROUP",
        "GROUP",
        "workers",
        "consumer",
        "STREAMS",
        "events",
        ">",
      );
      cli("SELECT", "1"); // Other databases are seeded in one invocation below.
      run("exec", name, "redis-cli", "-n", "1", "SET", "other-db", "preserved");
      cli("BGREWRITEAOF");
      for (let n = 0; n < 200; n++) {
        const info = cli("INFO", "persistence");
        if (
          /aof_rewrite_in_progress:0/.test(info) &&
          /aof_last_bgrewrite_status:ok/.test(info)
        )
          break;
        if (n === 199) throw Error("AOF rewrite timed out");
        await new Promise((r) => setTimeout(r, 100));
      }
      run("stop", name);
      run("rm", name);
      run(
        "run",
        "-d",
        "--name",
        name,
        "--network",
        "none",
        "-v",
        `${name}:/data`,
        "athyper/valkey:8.1.10",
        "valkey-server",
        "--appendonly",
        "yes",
      );
      await wait();
      assert.equal(cli("GET", "session"), "value");
      assert.equal(cli("PEXPIRETIME", "session"), expiry);
      assert.equal(cli("HGET", "job", "data"), '{"value":21}');
      assert.equal(cli("LRANGE", "wait", "0", "-1"), "job");
      assert.equal(cli("ZSCORE", "delayed", "job"), "123456");
      assert.equal(cli("SCARD", "members"), "2");
      assert.match(cli("XPENDING", "events", "workers"), new RegExp(id));
      assert.equal(
        run("exec", name, "redis-cli", "-n", "1", "GET", "other-db"),
        "preserved",
      );
      run("restart", name);
      await wait();
      assert.equal(cli("HGET", "job", "name"), "probe");
    } finally {
      spawnSync("docker", ["rm", "-f", name]);
      spawnSync("docker", ["volume", "rm", name]);
    }
  },
);
