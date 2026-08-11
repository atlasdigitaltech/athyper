import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ProcessHeartbeat {
  readonly path: string;
  stop(): Promise<void>;
}

export async function startProcessHeartbeat(
  mode: "worker" | "scheduler",
  intervalMs = 10_000,
): Promise<ProcessHeartbeat> {
  const path = join(tmpdir(), `athyper-${mode}.heartbeat`);
  const pushUrl = process.env[`STATUSWATCH_${mode.toUpperCase()}_PUSH_URL`]?.trim();
  const update = async () => {
    await writeFile(path, new Date().toISOString(), "utf8");
    if (pushUrl) void pushHeartbeat(pushUrl, mode);
  };
  await update();
  const timer = setInterval(() => { void update(); }, intervalMs);
  timer.unref();
  return {
    path,
    async stop() {
      clearInterval(timer);
      await unlink(path).catch(() => undefined);
    },
  };
}

async function pushHeartbeat(url: string, mode: string): Promise<void> {
  try {
    const target = new URL(url);
    target.searchParams.set("status", "up");
    target.searchParams.set("msg", `${mode} process heartbeat`);
    const response = await fetch(target, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Statuswatch returned HTTP ${response.status}`);
  } catch (error) {
    console.warn(
      `[${mode}] statuswatch_push_failed`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
