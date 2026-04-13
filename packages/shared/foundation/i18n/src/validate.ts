/**
 * @athyper/i18n — Translation Validator
 *
 * CLI script that validates all locale message files against English (canonical source).
 *
 *   pnpm --filter @athyper/i18n validate          # report missing keys
 *   pnpm --filter @athyper/i18n validate:strict   # exit 1 on any missing key or empty value
 *
 * Rules:
 *   --normal:  all locales must have every key present in lang/en/common.json
 *   --strict:  additionally, no key may have an empty string value
 *
 * The validator checks common.json for all non-English locales.
 * Per-module dashboard files are optional (missing = not translated yet).
 */
import { i18nConfig } from "./config.ts";

const STRICT = process.argv.includes("--strict");
const CORE_FILE = "common.json";
const CANONICAL_LOCALE = "en";

type Messages = Record<string, string>;

async function loadJson(path: string): Promise<Messages | null> {
  try {
    const { createRequire } = await import("node:module");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const dir = dirname(fileURLToPath(import.meta.url));
    const fullPath = join(dir, "..", path);
    const require = createRequire(import.meta.url);
    return require(fullPath) as Messages;
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

    if (issues.length === 0) {
      console.log(`  ✓ ${locale} — ${Object.keys(messages).length} keys`);
    } else {
      totalIssues += issues.filter((i) => i.startsWith("MISSING") || i.startsWith("EMPTY")).length;
      console.error(`  ✗ ${locale} — ${issues.length} issue(s):`);
      for (const issue of issues) {
        const prefix = issue.startsWith("EXTRA") ? "    ℹ" : "    ✗";
        console.error(`${prefix} ${issue}`);
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
