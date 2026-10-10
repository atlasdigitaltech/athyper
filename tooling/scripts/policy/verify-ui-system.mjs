#!/usr/bin/env node
// Application-wide design-system rules (docs/architecture/application-experience/ui-system-standard.md).
//
// Sibling of policy:design-system (colour literals, inline styles, icons) and
// policy:style-tokens (typography). This policy covers layout and control rules:
//
//   breakpoint-scale  @media/@container widths use the rem scale in the theme
//                     (BREAKPOINT_SCALE in tokens.ts); px, em and off-scale rem are rejected.
//                     matchMedia() literals in scripts follow the same viewport scale, so
//                     script and stylesheet switch layout at one width (use viewportQuery)
//   control-height    fixed heights in the control range (1.5rem-4rem) on interactive
//                     elements (buttons, fields, options, rows, tabs, toggles) bypass
//                     density; use --a-control-height, --a-touch-target or --a-density-*
//                     tokens. Media sizes (avatars, icons, thumbnails, skeletons) are
//                     deliberately fixed and are not controls.
//   raw-radius        border radii use --a-radius-* (0, inherit and 50% circles stay literal)
//   raw-layer         z-index of 10 or more is a page layer; use --a-z-* tokens
//   brand-text        text and icons coloured with --a-brand, the identity fill, which
//                     does not adapt to dark mode; use --a-primary
//   native-select     <select>/<Select> renders an operating-system popup that ignores
//                     the type scale and density; use SearchableSelect, SegmentedControl
//                     or ChoiceChips
//
// Existing debt is ratcheted per file and per rule, so a file cannot trade one
// rule for another. `--report` prints the per-area scorecard across these rules
// and the colour and typography policies (run it with tsx).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareToRatchet,
  describeImprovements,
  describeRegressions,
  loadRatchet,
  renderRatchet,
  writeRatchet,
} from "./violation-ratchet.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const RATCHET_PATH = "governance/config/governance/ui-system-ratchet.json";
const UPDATE_COMMAND = "pnpm policy:ui-system --update-ratchet";
const TOKEN_SOURCE = "packages/platform/foundation/theme/src/tokens.ts";

export const SOURCE_ROOTS = ["apps", "packages", "deploy/config/iam/themes"];
const STYLESHEET = /\.(?:css|scss)$/;
const COMPONENT = /\.[jt]sx$/;
const SCRIPT = /\.(?:[jt]sx?|mjs)$/;
const TEST_FILE = /\.(?:test|spec)\.[jt]sx?$/;
/** Files that define the vocabulary the rules point to. */
const RULE_AUTHORITIES = [
  { pattern: /^packages\/platform\/foundation\/theme\/src\//, rules: "*" },
  // The Select primitive is where the one native element lives until it is retired.
  {
    pattern: /^packages\/platform\/foundation\/ui\/src\/index\.tsx$/,
    rules: new Set(["native-select"]),
  },
];

export const RULES = Object.freeze({
  "breakpoint-scale": "use the theme breakpoint scale in rem",
  "control-height":
    "size controls with --a-control-height, --a-touch-target or --a-density-* tokens",
  "raw-radius": "use --a-radius-* tokens",
  "raw-layer": "use --a-z-* layer tokens",
  "brand-tint-text":
    "put text on --a-selection-subtle with --a-selection-subtle-foreground; --a-brand-soft is not a text background in every theme",
  "brand-text":
    "colour text and icons with --a-primary; --a-brand is the identity fill",
  "native-select": "use SearchableSelect, SegmentedControl or ChoiceChips",
});

/**
 * Breakpoint values in rem from the theme. With `{ viewport: true }` the
 * container-only tiers (CONTAINER_ONLY_BREAKPOINTS) are left out: they describe
 * a component inside a side panel, never the viewport.
 */
export function readBreakpointScale(source, { viewport = false } = {}) {
  const match = source.match(
    /export const BREAKPOINT_SCALE = Object\.freeze\(\{([^}]*)\}\)/,
  );
  if (!match) throw new Error(`${TOKEN_SOURCE} must export BREAKPOINT_SCALE`);
  const containerOnly = new Set(
    [
      ...(
        source.match(
          /CONTAINER_ONLY_BREAKPOINTS[^=]*=[^[]*\[([^\]]*)\]/,
        )?.[1] ?? ""
      ).matchAll(/"(\w+)"/g),
    ].map((entry) => entry[1]),
  );
  const values = [...match[1].matchAll(/(\w+):\s*(\d+(?:\.\d+)?)/g)]
    .filter((entry) => !viewport || !containerOnly.has(entry[1]))
    .map((entry) => Number(entry[2]));
  if (!values.length)
    throw new Error(`${TOKEN_SOURCE} BREAKPOINT_SCALE is empty`);
  return values;
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function remOf(value) {
  const match = value.trim().match(/^(-?\d*\.?\d+)(px|rem)$/);
  if (!match) return undefined;
  return match[2] === "px" ? Number(match[1]) / 16 : Number(match[1]);
}

/** The selector list of the rule that contains `index` (minified or not). */
export function selectorAt(css, index) {
  const open = css.lastIndexOf("{", index);
  const start = Math.max(
    css.lastIndexOf("}", open),
    css.lastIndexOf("{", open - 1),
    css.lastIndexOf(";", open),
  );
  return css
    .slice(start + 1, open)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}
/** Selectors that size something a person operates: a control, option or row. */
const INTERACTIVE_SELECTOR =
  /\b(?:button|summary|input|select|textarea|option|label)\b|\[role=|trigger|toggle|chip|__tab|tab-list|-row\b|__row|toolbar|__control|-control\b|__button|-button\b|__option|__item|picker|>div\b/;
/** The element each selector in a list sizes: its last compound selector, so
 * `.menu>summary>.avatar` sizes the avatar (media), not the summary. */
export function subjects(selectorList) {
  const parts = [];
  let depth = 0, start = 0;
  for (let index = 0; index < selectorList.length; index += 1) {
    const char = selectorList[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(selectorList.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(selectorList.slice(start));
  return parts.map((selector) => {
    let level = 0, cut = 0;
    const text = selector.trim();
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === "(" || char === "[") level += 1;
      else if (char === ")" || char === "]") level -= 1;
      else if (level === 0 && /[\s>+~]/.test(char)) cut = index + 1;
    }
    return text.slice(cut);
  });
}
const HEIGHT_DECLARATION =
  /(?<![\w-])(height|min-height|block-size|min-block-size)\s*:\s*([^;}{]+)/g;
const RADIUS_DECLARATION =
  /(?<![\w-])(border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius)\s*:\s*([^;}{]+)/g;
const LAYER_DECLARATION = /(?<![\w-])z-index\s*:\s*([^;}{]+)/g;
const BRAND_TEXT =
  /(?<![\w-])(color|fill|stroke|caret-color)\s*:\s*var\(--a-brand\)/g;
const ALLOWED_RADIUS = /^(?:0(?:px|rem)?|inherit|initial|unset|50%)$/;

export function auditStylesheet(css, scale, viewportScale = scale) {
  const findings = [];
  for (const match of css.matchAll(/@(media|container)([^{]*)\{/g)) {
    const tiers = match[1] === "media" ? viewportScale : scale;
    const allowed = new Set(tiers);
    for (const length of match[2].matchAll(/(\d*\.?\d+)(px|em|rem)\b/g)) {
      const [text, amount, unit] = length;
      if (unit === "rem" && allowed.has(Number(amount))) continue;
      findings.push({
        rule: "breakpoint-scale",
        line: lineAt(css, match.index),
        detail: `@${match[1]} ${text} is not one of ${tiers.map((value) => `${value}rem`).join(", ")}`,
      });
    }
  }
  for (const match of css.matchAll(HEIGHT_DECLARATION)) {
    const value = match[2].replace(/\s*!important$/, "").trim();
    const rem = remOf(value);
    if (rem === undefined || rem < 1.5 || rem > 4) continue;
    if (!subjects(selectorAt(css, match.index)).some((subject) => INTERACTIVE_SELECTOR.test(subject))) continue;
    findings.push({
      rule: "control-height",
      line: lineAt(css, match.index),
      detail: `${match[1]}: ${value}`,
    });
  }
  for (const match of css.matchAll(RADIUS_DECLARATION)) {
    const value = match[2].replace(/\s*!important$/, "").trim();
    if (
      /var\(/.test(value) ||
      value.split(/\s+/).every((part) => ALLOWED_RADIUS.test(part))
    )
      continue;
    findings.push({
      rule: "raw-radius",
      line: lineAt(css, match.index),
      detail: `${match[1]}: ${value}`,
    });
  }
  for (const match of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const body = match[2];
    if (
      /(?<![\w-])background(?:-color)?\s*:\s*var\(--a-brand-soft\)/.test(
        body,
      ) &&
      /(?<![\w-])color\s*:\s*var\(--a-primary\)/.test(body)
    )
      findings.push({
        rule: "brand-tint-text",
        line: lineAt(css, match.index + match[1].length),
        detail: `${match[1].trim().slice(0, 60)}: text on --a-brand-soft`,
      });
  }
  for (const match of css.matchAll(BRAND_TEXT))
    findings.push({
      rule: "brand-text",
      line: lineAt(css, match.index),
      detail: `${match[1]}: var(--a-brand)`,
    });
  for (const match of css.matchAll(LAYER_DECLARATION)) {
    const value = Number(match[1].replace(/\s*!important$/, "").trim());
    if (Number.isFinite(value) && value >= 10)
      findings.push({
        rule: "raw-layer",
        line: lineAt(css, match.index),
        detail: `z-index: ${value}`,
      });
  }
  return findings;
}

/** Returns `{ rule, line, detail }` findings for one component source. */
export function auditComponent(source) {
  const findings = [];
  source.split("\n").forEach((line, index) => {
    const match = line.match(/<(select|Select)\b/);
    if (match)
      findings.push({
        rule: "native-select",
        line: index + 1,
        detail: `<${match[1]}>`,
      });
  });
  return findings;
}

/** Width queries written as matchMedia() literals in a script. */
export function auditScript(source, viewportScale) {
  const allowed = new Set(viewportScale);
  const findings = [];
  for (const match of source.matchAll(/matchMedia\(\s*(["'`])([^"'`]*)\1/g))
    for (const length of match[2].matchAll(/(\d*\.?\d+)(px|em|rem)\b/g)) {
      if (length[2] === "rem" && allowed.has(Number(length[1]))) continue;
      findings.push({
        rule: "breakpoint-scale",
        line: lineAt(source, match.index),
        detail: `matchMedia ${length[0]} is not one of ${viewportScale.map((value) => `${value}rem`).join(", ")}; use viewportQuery`,
      });
    }
  return findings;
}

function exempt(file, rule) {
  return RULE_AUTHORITIES.some(
    (entry) =>
      entry.pattern.test(file) &&
      (entry.rules === "*" || entry.rules.has(rule)),
  );
}

function generated(name) {
  return (
    ["node_modules", "dist", "coverage", ".turbo", ".git"].includes(name) ||
    name.startsWith(".next")
  );
}

function filesBelow(root, relative) {
  let entries;
  try {
    entries = readdirSync(path.join(root, relative), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries.flatMap((entry) => {
    const child = path.posix.join(relative, entry.name);
    if (generated(entry.name)) return [];
    if (entry.isDirectory()) return filesBelow(root, child);
    return STYLESHEET.test(entry.name) ||
      (SCRIPT.test(entry.name) && !TEST_FILE.test(entry.name))
      ? [child]
      : [];
  });
}

/** Every finding as `{ file, rule, line, detail }`. */
export function analyzeUiSystem(options = {}) {
  const root = options.root ?? repoRoot;
  const tokens = options.scale
    ? undefined
    : readFileSync(path.join(root, TOKEN_SOURCE), "utf8");
  const scale = options.scale ?? readBreakpointScale(tokens);
  const viewportScale =
    options.viewportScale ??
    (tokens ? readBreakpointScale(tokens, { viewport: true }) : scale);
  const files = (options.sourceRoots ?? SOURCE_ROOTS).flatMap((directory) =>
    filesBelow(root, directory),
  );
  return files.flatMap((file) => {
    const source = readFileSync(path.join(root, file), "utf8");
    const findings = STYLESHEET.test(file)
      ? auditStylesheet(source, scale, viewportScale)
      : [
          ...(COMPONENT.test(file) ? auditComponent(source) : []),
          ...auditScript(source, viewportScale),
        ];
    return findings
      .filter((finding) => !exempt(file, finding.rule))
      .map((finding) => ({ file, ...finding }));
  });
}

/** Ratchet key: a file can only burn a rule's debt down, never trade it for another rule. */
export function ratchetKey(finding) {
  return `${finding.file}#${finding.rule}`;
}

/** Scorecard areas, first match wins. */
export const AREAS = [
  ["Theme tokens", /^packages\/platform\/foundation\/(theme|brand)\//],
  ["Foundation UI", /^packages\/platform\/foundation\//],
  ["Shell, Home, Activity", /^packages\/platform\/shell\//],
  ["Atlas", /^packages\/platform\/ai\//],
  ["Entity runtime", /^packages\/platform\/entity\//],
  ["Collaboration", /^packages\/platform\/communications\//],
  ["IAM (in app)", /^packages\/platform\/iam\//],
  ["IAM sign-in theme", /^deploy\/config\/iam\//],
  ["Other platform", /^packages\/platform\//],
  ["Plane packages", /^packages\/planes\//],
  ["Studio app", /^apps\/studio\//],
  ["Neon and Mesh apps", /^apps\/(neon|mesh)\//],
  ["Docs sites", /^apps\/docs-/],
  ["Other", /./],
];

export function areaOf(file) {
  return AREAS.find(([, pattern]) => pattern.test(file))[0];
}

/** `rows[area][column] = count` for the given `{ file, column }` findings. */
export function scorecard(findings) {
  const rows = new Map(AREAS.map(([area]) => [area, new Map()]));
  for (const { file, column } of findings) {
    const row = rows.get(areaOf(file));
    row.set(column, (row.get(column) ?? 0) + 1);
  }
  return rows;
}

async function report(findings) {
  const { analyzeDesignSystem } = await import("./verify-design-system.mjs");
  const { collectFindings } = await import("./audit-style-tokens.ts");
  const { violations } = await analyzeDesignSystem();
  const columns = [...Object.keys(RULES), "colour", "typography"];
  const all = [
    ...findings.map(({ file, rule }) => ({ file, column: rule })),
    ...violations
      .filter((violation) => violation.includes(" literal color "))
      .map((violation) => ({
        file: violation.split(":")[0],
        column: "colour",
      })),
    ...collectFindings({ root: repoRoot })
      .filter(
        (finding) =>
          /typography|tracking-leading/.test(finding.rule.name) &&
          finding.rule.severity === "error",
      )
      .map((finding) => ({ file: finding.file, column: "typography" })),
  ];
  const rows = scorecard(all);
  const header = ["Area", ...columns, "total"];
  const lines = [header.join(" | "), header.map(() => "---").join(" | ")];
  const totals = new Map();
  for (const [area, row] of rows) {
    const counts = columns.map((column) => row.get(column) ?? 0);
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (!total) continue;
    columns.forEach((column, index) =>
      totals.set(column, (totals.get(column) ?? 0) + counts[index]),
    );
    lines.push([area, ...counts, total].join(" | "));
  }
  const grand = columns.map((column) => totals.get(column) ?? 0);
  lines.push(
    [
      "**All areas**",
      ...grand,
      grand.reduce((sum, count) => sum + count, 0),
    ].join(" | "),
  );
  console.log(lines.map((line) => `| ${line} |`).join("\n"));
}

async function main() {
  const findings = analyzeUiSystem();
  const ratchetPath = path.join(repoRoot, RATCHET_PATH);
  const keys = findings.map(ratchetKey);

  if (process.argv.includes("--report")) return report(findings);
  if (process.argv.includes("--update-ratchet")) {
    writeRatchet(
      ratchetPath,
      renderRatchet(
        "policy:ui-system",
        keys,
        "Layout and control debt predating the application-wide UI system standard; keys are <file>#<rule>. Fix down; never up.",
      ),
    );
    console.log(
      `Wrote ${RATCHET_PATH}: ${findings.length} finding(s) across ${new Set(keys).size} file/rule pair(s).`,
    );
    return;
  }

  const comparison = compareToRatchet(loadRatchet(ratchetPath), keys);
  if (comparison.regressions.length) {
    const grown = new Set(comparison.regressions.map(({ file }) => file));
    console.error(
      "New UI system findings:\n" +
        findings
          .filter((finding) => grown.has(ratchetKey(finding)))
          .map(
            (finding) =>
              `- ${finding.file}:${finding.line} ${finding.rule}: ${finding.detail}; ${RULES[finding.rule]}`,
          )
          .join("\n"),
    );
    console.error(
      "\n" +
        describeRegressions("UI system findings", comparison, UPDATE_COMMAND),
    );
    process.exit(1);
  }
  const improvements = describeImprovements(comparison, UPDATE_COMMAND);
  if (improvements) console.log(improvements);
  const byRule = Object.keys(RULES).map(
    (rule) =>
      `${rule} ${findings.filter((finding) => finding.rule === rule).length}`,
  );
  console.log(
    `UI system policy passed the ratchet: ${findings.length} known finding(s), none new (${byRule.join(", ")}).`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
