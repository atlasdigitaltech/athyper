/**
 * @athyper/platform-i18n — Translation Validator
 *
 * CLI script that validates all locale message files against English (canonical source).
 *
 *   pnpm --filter @athyper/platform-i18n validate          # report missing keys
 *   pnpm --filter @athyper/platform-i18n validate:strict   # exit 1 on any missing key or empty value
 *
 * Rules:
 *   --normal:  all locales must have every key present in lang/en/common.json
 *   --strict:  additionally, no key may have an empty string value
 *
 * The validator checks common.json for all non-English locales.
 * Per-module dashboard files are optional (missing = not translated yet).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { i18nConfig } from "./config.ts";

const STRICT = process.argv.includes("--strict");
const CORE_FILE = "common.json";
const CANONICAL_LOCALE = "en";

type Messages = Record<string, string>;

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadJson(path: string): Promise<Messages | null> {
  try {
    const content = await readFile(join(packageRoot, path), "utf8");
    return JSON.parse(content) as Messages;
  } catch {
    return null;
  }
}

async function validate(): Promise<void> {
  const canonical = await loadJson(`lang/${CANONICAL_LOCALE}/${CORE_FILE}`);
  if (!canonical) {
    console.error(`✗ Cannot load canonical source: lang/${CANONICAL_LOCALE}/${CORE_FILE}`);
    process.exit(1);
  }

  const canonicalKeys = Object.keys(canonical);
  console.log(`Canonical locale: ${CANONICAL_LOCALE} — ${canonicalKeys.length} keys\n`);

  const nonEnglishLocales = i18nConfig.locales.filter((l) => l !== CANONICAL_LOCALE);
  let totalIssues = 0;

  for (const locale of nonEnglishLocales) {
    const messages = await loadJson(`lang/${locale}/${CORE_FILE}`);
    const issues: string[] = [];

    if (!messages) {
      console.warn(`  ⚠ ${locale}: lang/${locale}/${CORE_FILE} not found — skipping`);
      continue;
    }

    // Check for missing keys
    for (const key of canonicalKeys) {
      if (!(key in messages)) {
        issues.push(`MISSING key: ${key}`);
      } else if (STRICT && messages[key]!.trim() === "") {
        issues.push(`EMPTY value: ${key}`);
      }
    }

    // Check for extra keys not in canonical (informational)
    const extraKeys = Object.keys(messages).filter((k) => !(k in canonical));
    if (extraKeys.length > 0) {
      for (const k of extraKeys) {
        issues.push(`EXTRA key (not in en): ${k}`);
      }
    }

    // Separate blocking issues (MISSING/EMPTY) from informational extras (EXTRA).
    const blockingIssues = issues.filter((i) => i.startsWith("MISSING") || i.startsWith("EMPTY"));
    const infoIssues = issues.filter((i) => i.startsWith("EXTRA"));

    if (blockingIssues.length === 0 && infoIssues.length === 0) {
      console.log(`  ✓ ${locale} — ${Object.keys(messages).length} keys`);
    } else {
      totalIssues += blockingIssues.length;
      const summary = [
        blockingIssues.length > 0 ? `${blockingIssues.length} blocking` : null,
        infoIssues.length > 0 ? `${infoIssues.length} extra (info)` : null,
      ].filter(Boolean).join(", ");
      if (blockingIssues.length > 0) {
        console.error(`  ✗ ${locale} — ${summary}:`);
      } else {
        console.log(`  ✓ ${locale} — ${summary}:`);
      }
      for (const issue of issues) {
        if (issue.startsWith("EXTRA")) {
          console.log(`    ℹ ${issue}`);
        } else {
          console.error(`    ✗ ${issue}`);
        }
      }
    }
  }

  console.log(`\nValidation complete. Mode: ${STRICT ? "strict" : "normal"}`);

  if (totalIssues > 0) {
    console.error(`${totalIssues} blocking issue(s) found.`);
    process.exit(1);
  } else {
    console.log("All locales valid.");
  }
}

void validate();
