/**
 * Shared utilities for athyper-codegen CLI tools.
 *
 * Extracted so both `index.ts` (codegen) and `publish.ts` (db:publish)
 * can reuse the same helpers without duplication.
 */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repository root (tools/codegen → ../../..) */
export const REPO_ROOT = path.resolve(__dirname, "../../..");

/** Framework DB adapter package */
export const DB_DIR = path.join(REPO_ROOT, "framework", "adapters", "db");

/** Prisma schema file */
export const SCHEMA_PATH = path.join(DB_DIR, "src", "prisma", "schema.prisma");

/** Prisma migrations directory */
export const MIGRATIONS_DIR = path.join(DB_DIR, "src", "prisma", "migrations");

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

/**
 * Run a command and stream stdout/stderr to the parent process.
 * Resolves on exit code 0, rejects otherwise.
 */
export function run(
  cmd: string,
  cmdArgs: string[],
  opts: object = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...opts,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${cmd} ${cmdArgs.join(" ")} failed with code ${code}`),
        );
    });
  });
}

/**
 * Run a command and capture stdout as a string.
 * Resolves with stdout on exit code 0, rejects otherwise.
 */
export function runCapture(
  cmd: string,
  cmdArgs: string[],
  opts: object = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Exit code ${code}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/** Create a directory (recursive). */
export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}
