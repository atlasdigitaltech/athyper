import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const QUIET = process.argv.includes("--quiet");

/**
 * Real post-reorg layout. The pre-reorg roots (`packages/shared`,
 * `packages/planes/design`, `packages/product-deprecated/runtime-ui`,
 * `packages/domain/finance`) no longer exist; `walk()` silently skipped them so
 * the audit reported "Findings: 0" while never reaching the stylesheets that
 * render into `apps/*`.
 */
const SCAN_ROOTS = [
  "apps/neon",
  "apps/mesh",
  "apps/studio",
  "packages/platform",
  "packages/planes",
] as const;

const FILE_EXTENSIONS = new Set([".css", ".scss", ".ts", ".tsx"]);
const STYLESHEET = /\.(?:css|scss)$/;
const SOURCE = /\.(?:[jt]sx?)$/;
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

type Severity = "error" | "warn";

interface RuleMatch {
  index: number;
  match: string;
}

interface Rule {
  name: string;
  severity: Severity;
  description: string;
  find: (content: string, file: string) => RuleMatch[];
}

/**
 * Rule-scoped exemptions. A token-authority file legitimately declares literal
 * values for the vocabulary everything else consumes, so it is exempt from the
 * literal-value rules — but not from every rule, and no other file is exempt.
 */
const RULE_ALLOWLIST: { pattern: RegExp; rules: "*" | Set<string> }[] = [
  { pattern: /^packages\/platform\/foundation\/theme\/src\//, rules: "*" },
  {
    pattern: /^packages\/platform\/foundation\/brand\/src\//,
    rules: new Set([
      "raw-hex-color",
      "direct-palette-utility",
      "raw-css-typography",
    ]),
  },
];

function isAllowlisted(file: string, ruleName: string): boolean {
  return RULE_ALLOWLIST.some(
    (entry) =>
      entry.pattern.test(file) &&
      (entry.rules === "*" || entry.rules.has(ruleName)),
  );
}

function regexFinder(pattern: RegExp): Rule["find"] {
  return (content) => {
    const matches: RuleMatch[] = [];
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      matches.push({ index: match.index ?? 0, match: match[0] });
    }
    return matches;
  };
}

const CSS_WIDE_KEYWORDS = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);
const ALLOWED_FONT_WEIGHT = new Set(["normal", ...CSS_WIDE_KEYWORDS]);
const ALLOWED_FONT_SIZE = new Set([...CSS_WIDE_KEYWORDS]);

/**
 * Declaration-level scan for raw `font-size` / `font-weight` in stylesheets.
 *
 * SCOPE: absolute `font-size` and numeric/keyword `font-weight`. `line-height`
 * and `letter-spacing` are the sibling `raw-css-tracking-leading` rule (Phase 7).
 * Still unenforced: the `font` shorthand (only ever `font:inherit` here) and
 * `em`-relative `font-size` (compounds — a distinct concern). `font-size:0` is a
 * layout primitive (icon buttons, visually-hidden text), not a scale step.
 *
 * Works on minified, multi-rule-per-line CSS: it matches the declaration, not a
 * line. A value is left alone when it references `var()`, or is `clamp()` /
 * `min()` / `max()` — bespoke fluid type is an intentional escape hatch, and
 * every one in this codebase has a distinct responsive range.
 *
 * The leading `(?<![\w-])` keeps custom-property definitions such as
 * `--a-font-size-md: 1rem` from matching — those declare tokens, they do not
 * consume raw literals.
 */
const TYPOGRAPHY_DECLARATION =
  /(?<![\w-])(font-size|font-weight)\s*:\s*([^;}{]+)/gi;
const ZERO_LENGTH = /^0(?:px|rem|em|%)?$/i;
const EM_RELATIVE = /^-?\d*\.?\d+em$/i;
const FLUID_FUNCTION = /^(?:clamp|min|max)\(/i;

function findRawCssTypography(content: string, file: string): RuleMatch[] {
  if (!STYLESHEET.test(file)) return [];
  const matches: RuleMatch[] = [];
  for (const match of content.matchAll(TYPOGRAPHY_DECLARATION)) {
    const property = match[1].toLowerCase();
    const value = match[2]
      .trim()
      .replace(/\s*!important$/i, "")
      .trim();
    if (!value || /var\(/i.test(value)) continue;
    const allowed =
      property === "font-weight" ? ALLOWED_FONT_WEIGHT : ALLOWED_FONT_SIZE;
    if (allowed.has(value.toLowerCase())) continue;
    if (
      property === "font-size" &&
      (ZERO_LENGTH.test(value) ||
        EM_RELATIVE.test(value) ||
        FLUID_FUNCTION.test(value))
    ) {
      continue;
    }
    matches.push({ index: match.index ?? 0, match: `${property}: ${value}` });
  }
  return matches;
}

/**
 * Stock Tailwind type-scale / weight-ramp utilities that bypass the token
 * system. The theme's `@theme inline` block redefines `text-2xs|xs|sm|body|md|
 * lg|title|display` and `font-normal|regular|medium|strong` to `--a-*` tokens
 * and drops every other stock key, so `text-xl` / `font-bold` produce no utility
 * — this rule is what fails the PR. Matched with any leading variant chain
 * (`hover:`, `md:`, `dark:`, `group-hover:` …) and anywhere inside a string
 * literal, so `clsx()` / `cn()` / `cva()` / template-literal class lists are
 * covered, not only `className="…"`.
 *
 * `text-<color>` (e.g. `text-danger`) is a colour utility, not typography, and
 * is not matched. `leading-*` / `tracking-*` are Phase 7.
 */
const STOCK_TAILWIND_TYPOGRAPHY =
  /(?:[a-z][a-z0-9-]*:)*(?:text-(?:base|xl|[2-9]xl)|font-(?:thin|extralight|light|semibold|bold|extrabold|black))\b/g;
const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

function findStockTailwindTypography(
  content: string,
  file: string,
): RuleMatch[] {
  if (!SOURCE.test(file)) return [];
  const matches: RuleMatch[] = [];
  for (const literal of content.matchAll(STRING_LITERAL)) {
    const body = literal[2];
    if (!body || !/[a-z]-/.test(body)) continue;
    for (const hit of body.matchAll(STOCK_TAILWIND_TYPOGRAPHY)) {
      matches.push({
        index: (literal.index ?? 0) + 1 + (hit.index ?? 0),
        match: hit[0],
      });
    }
  }
  return matches;
}

// Phase 7 sibling of raw-css-typography: raw `line-height` / `letter-spacing`
// declarations. `normal` / CSS-wide keywords and unitless-1-via-token are fine;
// `line-height` embedded in a `font` shorthand is not matched (the shorthand is
// only ever `font:inherit` in this codebase).
const TRACKING_LEADING_DECLARATION =
  /(?<![\w-])(line-height|letter-spacing)\s*:\s*([^;}{]+)/gi;
const LEADING_LETTER_KEYWORDS = new Set(["normal", ...CSS_WIDE_KEYWORDS]);

function findRawTrackingLeading(content: string, file: string): RuleMatch[] {
  if (!STYLESHEET.test(file)) return [];
  const matches: RuleMatch[] = [];
  for (const match of content.matchAll(TRACKING_LEADING_DECLARATION)) {
    const property = match[1].toLowerCase();
    const value = match[2]
      .trim()
      .replace(/\s*!important$/i, "")
      .trim();
    if (!value || /var\(/i.test(value)) continue;
    if (LEADING_LETTER_KEYWORDS.has(value.toLowerCase())) continue;
    matches.push({ index: match.index ?? 0, match: `${property}: ${value}` });
  }
  return matches;
}

const RULES: Rule[] = [
  {
    name: "raw-hex-color",
    severity: "error",
    description:
      "Use theme variables, semantic color classes, or documented brand/data exceptions.",
    find: regexFinder(/(?<!&)#[0-9A-Fa-f]{3,8}\b/g),
  },
  {
    name: "arbitrary-color-utility",
    severity: "error",
    description:
      "Use semantic Tailwind tokens instead of arbitrary color utilities.",
    find: regexFinder(
      /\b(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration|shadow|caret|accent)-\[[^\]]*(?:#|rgb|rgba|hsl|hsla|oklch|lch|lab|white|black|gray|slate|zinc|blue|red|green|yellow|amber|orange)[^\]]*\]/g,
    ),
  },
  {
    name: "arbitrary-pixel-typography",
    severity: "error",
    description:
      "Use typography tokens such as text-doc-support, text-doc-badge, or component variants.",
    find: regexFinder(
      /\b(?:text|leading|tracking|font)-\[(?:-?\d+(?:\.\d+)?(?:px|rem|em)|-?\d+(?:\.\d+)?)\]/g,
    ),
  },
  {
    name: "raw-css-typography",
    severity: "error",
    description:
      "Use --a-font-size-* / --a-font-weight-* tokens instead of raw font-size / font-weight values in CSS.",
    find: findRawCssTypography,
  },
  {
    name: "raw-css-tracking-leading",
    severity: "error",
    description:
      "Use --a-line-height-* / --a-tracking-* tokens instead of raw line-height / letter-spacing values in CSS.",
    find: findRawTrackingLeading,
  },
  {
    name: "stock-tailwind-typography",
    severity: "error",
    description:
      "Use the tokenised scale (text-2xs/xs/sm/body/md/lg/title/display, font-normal/regular/medium/strong) instead of stock Tailwind type utilities.",
    find: findStockTailwindTypography,
  },
  {
    name: "direct-palette-utility",
    severity: "warn",
    description:
      "Prefer theme semantic colors; allow only documented overlays, vendor marks, and inspected data swatches.",
    find: regexFinder(
      /\b(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration|shadow|caret|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/[0-9]+)?\b/g,
    ),
  },
];

interface Finding {
  file: string;
  line: number;
  column: number;
  match: string;
  rule: Rule;
}

function toRepoPath(root: string, path: string): string {
  return relative(root, path).replace(/\\/g, "/");
}

function extensionOf(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(join(dir, entry.name), files);
      continue;
    }

    const file = join(dir, entry.name);
    if (FILE_EXTENSIONS.has(extensionOf(file))) files.push(file);
  }

  return files;
}

function lineColumnFor(
  content: string,
  index: number,
): { line: number; column: number } {
  const before = content.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines[lines.length - 1]!.length + 1 };
}

export interface AuditOptions {
  root?: string;
  scanRoots?: readonly string[];
}

export function collectFindings(options: AuditOptions = {}): Finding[] {
  const root = options.root ?? ROOT;
  const scanRoots = options.scanRoots ?? SCAN_ROOTS;
  const findings: Finding[] = [];
  const files = scanRoots.flatMap((scanRoot) => walk(join(root, scanRoot)));

  for (const absolutePath of files) {
    const file = toRepoPath(root, absolutePath);
    const content = readFileSync(absolutePath, "utf8");

    for (const rule of RULES) {
      if (isAllowlisted(file, rule.name)) continue;
      for (const { index, match } of rule.find(content, file)) {
        const position = lineColumnFor(content, index);
        findings.push({
          file,
          line: position.line,
          column: position.column,
          match,
          rule,
        });
      }
    }
  }

  return findings;
}

function printSummary(findings: Finding[]): void {
  const byRule = new Map<string, Finding[]>();
  for (const finding of findings) {
    const existing = byRule.get(finding.rule.name) ?? [];
    existing.push(finding);
    byRule.set(finding.rule.name, existing);
  }

  console.log("Style token audit");
  console.log(`Mode: ${STRICT ? "strict" : "warning"}`);
  console.log(`Findings: ${findings.length}`);

  for (const rule of RULES) {
    const items = byRule.get(rule.name) ?? [];
    const label = rule.severity.toUpperCase();
    console.log(`- ${rule.name} (${label}): ${items.length}`);
    if (!QUIET && items.length > 0) {
      for (const item of items.slice(0, 12)) {
        console.log(`  ${item.file}:${item.line}:${item.column} ${item.match}`);
      }
      if (items.length > 12) console.log(`  ... ${items.length - 12} more`);
    }
  }
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  const findings = collectFindings();
  printSummary(findings);

  const errors = findings.filter(
    (finding) => finding.rule.severity === "error",
  );
  if (STRICT && errors.length > 0) {
    console.error(
      `Strict style token audit failed with ${errors.length} error findings.`,
    );
    process.exit(1);
  }
}
