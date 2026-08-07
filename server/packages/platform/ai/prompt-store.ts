/**
 * PromptStore — loads versioned prompt templates from the filesystem.
 *
 * Prompts live at: server/packages/services/ai/prompts/{key}.txt
 * (or .md — both are accepted).
 *
 * Each loaded prompt is hashed with SHA-256 at read time so every inference
 * log row records the exact prompt version used.  A hash mismatch between
 * what was logged and what is on disk surfaces prompt drift immediately.
 *
 * The store caches resolved prompts in memory for the process lifetime.
 * A file change requires a process restart (intentional — CI validates
 * prompt files; hot-swapping in production is not permitted).
 */

import { createHash }           from "node:crypto";
import { readFile, readdir }    from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { fileURLToPath }        from "node:url";

const PROMPTS_DIR = resolve(
  fileURLToPath(import.meta.url),
  "..", "prompts",
);

interface PromptEntry {
  text:    string;
  version: string;  // first 12 chars of SHA-256 hex
  hash:    string;  // full SHA-256 hex
}

export class PromptStore {
  private readonly cache = new Map<string, PromptEntry>();
  private initialized    = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    // Pre-load all .txt / .md files in the prompts directory
    let files: string[] = [];
    try {
      files = await readdir(PROMPTS_DIR);
    } catch {
      // Prompts dir absent in early dev — non-fatal; individual gets will throw
      this.initialized = true;
      return;
    }
    await Promise.all(files.map(async (file) => {
      const ext = extname(file);
      if (ext !== ".txt" && ext !== ".md") return;
      const key = file.slice(0, -ext.length);
      await this._load(key, join(PROMPTS_DIR, file));
    }));
    this.initialized = true;
  }

  async get(key: string): Promise<PromptEntry | null> {
    if (this.cache.has(key)) return this.cache.get(key)!;

    // Try loading on-demand (supports adding prompts at runtime in tests)
    for (const ext of [".txt", ".md"]) {
      try {
        await this._load(key, join(PROMPTS_DIR, `${key}${ext}`));
        return this.cache.get(key)!;
      } catch { /* try next extension */ }
    }
    return null;
  }

  private async _load(key: string, filePath: string): Promise<void> {
    const text = await readFile(filePath, "utf8");
    const hash = createHash("sha256").update(text).digest("hex");
    this.cache.set(key, { text, version: hash.slice(0, 12), hash });
  }
}
