import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const RECORD_WORKSPACE_RESOURCES = new Set([
  "core",
  "process",
  "approvals",
  "lifecycle",
  "collections",
  "versions",
  "comments",
  "attachments",
  "activity",
  "support",
]);
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const baseUrl = new URL(required("PERF_NEON_BASE_URL"));
const storageState = resolve(root, process.env.PERF_NEON_STORAGE_STATE || "tests/e2e/.auth/storage-state.json");
const matrixPath = resolve(root, required("PERF_RECORD_WORKSPACE_MATRIX"));
const budgetsPath = resolve(root, process.env.PERF_RECORD_WORKSPACE_BUDGETS || "perf/budgets/record-workspace.v1.json");
const outputDir = resolve(root, process.env.PERF_OUTPUT_DIR || "perf/artifacts/record-workspace");
const repetitions = positiveInt(process.env.PERF_REPETITIONS || "3", "PERF_REPETITIONS");
const settleMs = positiveInt(process.env.PERF_SETTLE_MS || "1000", "PERF_SETTLE_MS");
const surfaceTimeoutMs = positiveInt(
  process.env.PERF_SURFACE_TIMEOUT_MS || "10000",
  "PERF_SURFACE_TIMEOUT_MS",
);
const headless = process.env.PERF_HEADLESS !== "false";
const enforceBudgets = process.env.PERF_ENFORCE_BUDGETS === "true";

const availableStorageState = existsSync(storageState)
  ? storageState
  : existsSync(resolve(root, "tests/e2e/.auth/storage-state.json"))
    ? resolve(root, "tests/e2e/.auth/storage-state.json")
    : null;

if (!availableStorageState) {
  throw new Error(
    `Authenticated storage state not found: ${storageState}. Set PERF_NEON_STORAGE_STATE to a valid Playwright storage-state path.`,
  );
}
if (!existsSync(matrixPath)) throw new Error(`Record workspace matrix not found: ${matrixPath}`);
if (!existsSync(budgetsPath)) throw new Error(`Record workspace budgets not found: ${budgetsPath}`);

const matrix = parseJsonFile(matrixPath);
const budgets = parseJsonFile(budgetsPath);
const profiles = validateMatrix(matrix);
const browser = await chromium.launch({ headless });
const captures = [];

try {
  for (let run = 1; run <= repetitions; run += 1) {
    for (const profile of profiles) captures.push(await captureProfile(profile, run));
  }
} finally {
  await browser.close();
}

const capturedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  kind: "athyper.record-workspace-phase0",
  capturedAt,
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: {
    baseUrl: baseUrl.origin,
    matrix: basename(matrixPath),
    repetitions,
    settleMs,
    surfaceTimeoutMs,
    headless,
  },
  budgets,
  captures,
  summary: summarizeCaptures(captures, budgets),
};

mkdirSync(outputDir, { recursive: true });
const stem = `record-workspace-phase0-${capturedAt.replaceAll(":", "-")}`;
const jsonPath = resolve(outputDir, `${stem}.json`);
const markdownPath = resolve(outputDir, `${stem}.md`);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownPath, renderDashboard(report));
console.log(`Record workspace baseline written to ${jsonPath}`);
console.log(`Record workspace dashboard written to ${markdownPath}`);

if (enforceBudgets && report.summary.budgetViolations.length > 0) {
  console.error(`Record workspace budgets failed with ${report.summary.budgetViolations.length} violation(s).`);
  process.exitCode = 1;
}

async function captureProfile(profile, run) {
  const context = await browser.newContext({ storageState: availableStorageState, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const responses = [];
  page.on("response", (response) => {
    const request = response.request();
    if (!isWorkspaceResponse(response.url())) return;
    responses.push({
      url: redactUrl(response.url()),
      resourceType: request.resourceType(),
      method: request.method(),
      status: response.status(),
      serverTiming: response.headers()["server-timing"] ?? null,
    });
  });
  await page.addInitScript(() => {
    window.__athyperRecordWorkspaceDiagnostics = [];
    window.addEventListener("athyper:record-workspace-observability", (event) => {
      window.__athyperRecordWorkspaceDiagnostics.push(event.detail);
    });
  });

  const actions = [];
  try {
    const navigationStartedAt = Date.now();
    const response = await page.goto(new URL(profile.recordPath, baseUrl).toString(), { waitUntil: "domcontentloaded" });
    if (!response?.ok()) throw new Error(`${profile.entityCode} record navigation failed with ${response?.status() ?? "no response"}`);
    await page.locator(`[data-athyper-record-workspace="${profile.entityCode}"]`).waitFor({ state: "visible" });
    const recordUsableMs = Date.now() - navigationStartedAt;
    await page.waitForTimeout(settleMs);
    actions.push(await readSurfaceResult(page, profile.surfaces[0], recordUsableMs, 0));

    for (const surface of profile.surfaces.slice(1)) {
      const browserStartedAtMs = await page.evaluate(() => performance.now());
      await activateSurface(page, surface);
      const readyMs = await waitForSurfaceActivation(page, surface, browserStartedAtMs);
      await page.waitForTimeout(settleMs);
      actions.push(await readSurfaceResult(page, surface, readyMs, browserStartedAtMs));
    }

    const snapshot = await latestSnapshot(page);
    if (!snapshot) throw new Error(`${profile.entityCode} did not emit record workspace diagnostics.`);
    return {
      run,
      archetype: profile.archetype,
      entityCode: profile.entityCode,
      supportedResources: profile.supportedResources,
      recordPath: redactRecordPath(profile.recordPath),
      recordUsableMs,
      actions,
      snapshot,
      responses,
    };
  } finally {
    await context.close();
  }
}

async function waitForSurfaceActivation(page, surface, startedAtMs) {
  const telemetrySurface = surface.telemetrySurface ?? normalizeSurface(surface.id);
  const markName = `record-workspace:${telemetrySurface}:activated`;
  await page.waitForFunction(
    ({ expectedMark, afterMs }) => performance
      .getEntriesByName(expectedMark, "mark")
      .some((entry) => entry.startTime >= afterMs),
    { expectedMark: markName, afterMs: startedAtMs },
    { timeout: surfaceTimeoutMs },
  );
  const activatedAtMs = await page.evaluate(
    ({ expectedMark, afterMs }) => performance
      .getEntriesByName(expectedMark, "mark")
      .filter((entry) => entry.startTime >= afterMs)
      .at(-1)?.startTime ?? performance.now(),
    { expectedMark: markName, afterMs: startedAtMs },
  );
  return round(activatedAtMs - startedAtMs);
}

async function activateSurface(page, surface) {
  if (surface.kind === "initial") return;
  const name = surface.kind === "tab" ? `Jump to ${surface.label}` : new RegExp(`^${escapeRegExp(surface.label)}(?::|$)`);
  const target = page.getByRole("button", { name }).first();
  if (await target.count() === 0) {
    throw new Error(`Surface '${surface.label}' (${surface.kind}) is not available.`);
  }
  await target.click();
}

async function readSurfaceResult(page, surface, readyMs, browserStartedAtMs) {
  const snapshot = await latestSnapshot(page);
  const requests = snapshot?.requests?.filter((item) => item.startedAtMs >= browserStartedAtMs) ?? [];
  return {
    id: surface.id,
    kind: surface.kind,
    label: surface.label,
    readyMs,
    calls: requests.length,
    totalDurationMs: round(requests.reduce((sum, item) => sum + item.durationMs, 0)),
    maxDurationMs: round(Math.max(0, ...requests.map((item) => item.durationMs))),
  };
}

async function latestSnapshot(page) {
  return page.evaluate(() => window.__athyperRecordWorkspaceDiagnostics?.at(-1) ?? null);
}

function summarizeCaptures(items, budgetContract) {
  const grouped = new Map();
  for (const item of items) {
    const group = grouped.get(item.entityCode) ?? [];
    group.push(item);
    grouped.set(item.entityCode, group);
  }
  const byEntity = [...grouped.values()].map((entityItems) => {
    const first = entityItems[0];
    return {
      archetype: first.archetype,
      entityCode: first.entityCode,
      samples: entityItems.length,
      recordUsableMs: summarizeNumbers(entityItems.map((item) => item.recordUsableMs)),
      calls: summarizeNumbers(entityItems.map((item) => item.snapshot.totals.calls)),
      duplicateCalls: summarizeNumbers(entityItems.map((item) => item.snapshot.totals.duplicateCalls)),
      nPlusOneCalls: summarizeNumbers(entityItems.map((item) => item.snapshot.totals.nPlusOneCalls)),
      resources: mergeResourceMetrics(entityItems),
      surfaces: mergeSurfaceMetrics(entityItems),
    };
  });
  return {
    byEntity,
    budgetViolations: evaluateBudgets(items, budgetContract),
  };
}

function evaluateBudgets(items, budgetContract) {
  const violations = [];
  for (const item of items) {
    if (item.recordUsableMs > budgetContract.timingMs.initialRecordUsable) {
      violations.push(violation(item, "initialRecordUsable", item.recordUsableMs, budgetContract.timingMs.initialRecordUsable));
    }
    if (item.snapshot.totals.duplicateCalls > budgetContract.duplicates.extraCalls) {
      violations.push(violation(item, "duplicateCalls", item.snapshot.totals.duplicateCalls, budgetContract.duplicates.extraCalls));
    }
    if (item.snapshot.nPlusOne.length > budgetContract.nPlusOne.families) {
      violations.push(violation(item, "nPlusOneFamilies", item.snapshot.nPlusOne.length, budgetContract.nPlusOne.families));
    }
    if (item.snapshot.totals.nPlusOneCalls > budgetContract.nPlusOne.calls) {
      violations.push(violation(item, "nPlusOneCalls", item.snapshot.totals.nPlusOneCalls, budgetContract.nPlusOne.calls));
    }
    for (const action of item.actions.slice(1)) {
      if (action.readyMs > budgetContract.timingMs.firstSurfaceReady) {
        violations.push(violation(item, `${action.id}ReadyMs`, action.readyMs, budgetContract.timingMs.firstSurfaceReady));
      }
    }
    const supportedResources = new Set(item.supportedResources);
    for (const resource of item.snapshot.resources) {
      const budget = supportedResources.has(resource.key) ? budgetContract.calls[resource.key] : 0;
      if (typeof budget === "number" && resource.calls > budget) {
        violations.push(violation(item, `${resource.key}Calls`, resource.calls, budget));
      }
    }
  }
  return violations;
}

function violation(item, metric, actual, budget) {
  return { run: item.run, entityCode: item.entityCode, metric, actual, budget };
}

function mergeResourceMetrics(items) {
  const groups = new Map();
  for (const item of items) {
    for (const metric of item.snapshot.resources) {
      const values = groups.get(metric.key) ?? [];
      values.push(metric);
      groups.set(metric.key, values);
    }
  }
  return [...groups.entries()].map(([key, values]) => ({
    key,
    calls: summarizeNumbers(values.map((value) => value.calls)),
    totalDurationMs: summarizeNumbers(values.map((value) => value.totalDurationMs)),
    maxDurationMs: summarizeNumbers(values.map((value) => value.maxDurationMs)),
    transferBytes: summarizeNumbers(values.map((value) => value.totalTransferBytes)),
  }));
}

function mergeSurfaceMetrics(items) {
  const groups = new Map();
  for (const item of items) {
    for (const action of item.actions) {
      const values = groups.get(action.id) ?? [];
      values.push(action);
      groups.set(action.id, values);
    }
  }
  return [...groups.entries()].map(([key, values]) => ({
    key,
    label: values[0]?.label ?? key,
    readyMs: summarizeNumbers(values.map((value) => value.readyMs)),
    calls: summarizeNumbers(values.map((value) => value.calls)),
    totalDurationMs: summarizeNumbers(values.map((value) => value.totalDurationMs)),
  }));
}

function summarizeNumbers(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  return {
    min: sorted[0] ?? 0,
    mean: Math.round(mean * 100) / 100,
    max: sorted.at(-1) ?? 0,
    p95: percentile(sorted, 0.95),
  };
}

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}

function renderDashboard(report) {
  const entityRows = report.summary.byEntity.map((item) =>
    `| ${item.archetype} | ${item.entityCode} | ${item.samples} | ${item.recordUsableMs.p95} | ${item.calls.mean} | ${item.duplicateCalls.mean} | ${item.nPlusOneCalls.mean} |`,
  );
  const resourceRows = report.summary.byEntity.flatMap((item) => item.resources.map((resource) =>
    `| ${item.entityCode} | ${resource.key} | ${resource.calls.mean} | ${resource.totalDurationMs.p95} | ${resource.maxDurationMs.p95} | ${resource.transferBytes.mean} |`,
  ));
  const surfaceRows = report.summary.byEntity.flatMap((item) => item.surfaces.map((surface) =>
    `| ${item.entityCode} | ${surface.label} | ${surface.readyMs.p95} | ${surface.calls.mean} | ${surface.totalDurationMs.p95} |`,
  ));
  const duplicateRows = report.captures.flatMap((capture) => capture.snapshot.duplicates.map((finding) =>
    `| ${capture.entityCode} | ${capture.run} | ${finding.requestKey} | ${finding.calls} | ${finding.totalDurationMs} |`,
  ));
  const nPlusOneRows = report.captures.flatMap((capture) => capture.snapshot.nPlusOne.map((finding) =>
    `| ${capture.entityCode} | ${capture.run} | ${finding.familyKey} | ${finding.calls} | ${finding.distinctInstances} | ${finding.totalDurationMs} |`,
  ));
  const violations = report.summary.budgetViolations.length === 0
    ? "No budget violations."
    : report.summary.budgetViolations.map((item) =>
        `- ${item.entityCode} run ${item.run}: ${item.metric}=${item.actual}, budget=${item.budget}`,
      ).join("\n");
  return `# Record workspace Phase 0 dashboard\n\n` +
    `Captured: ${report.capturedAt}\n\n` +
    `Commit: ${report.commit}\n\n` +
    `| Archetype | Entity | Samples | Record usable p95 ms | Mean calls | Mean duplicate calls | Mean N+1 calls |\n` +
    `|---|---|---:|---:|---:|---:|---:|\n${entityRows.join("\n")}\n\n` +
    `## Resources\n\n` +
    `| Entity | Resource | Mean calls | Total duration p95 ms | Max request p95 ms | Mean transfer bytes |\n` +
    `|---|---|---:|---:|---:|---:|\n${resourceRows.join("\n")}\n\n` +
    `## Surfaces\n\n` +
    `| Entity | Surface | Ready p95 ms | Mean calls | Request duration p95 ms |\n` +
    `|---|---|---:|---:|---:|\n${surfaceRows.join("\n")}\n\n` +
    `## Exact duplicates\n\n` +
    (duplicateRows.length > 0
      ? `| Entity | Run | Request key | Calls | Total duration ms |\n|---|---:|---|---:|---:|\n${duplicateRows.join("\n")}\n\n`
      : `No exact duplicate requests.\n\n`) +
    `## N+1 families\n\n` +
    (nPlusOneRows.length > 0
      ? `| Entity | Run | Family | Calls | Distinct instances | Total duration ms |\n|---|---:|---|---:|---:|---:|\n${nPlusOneRows.join("\n")}\n\n`
      : `No N+1 request families.\n\n`) +
    `## Budget findings\n\n${violations}\n`;
}

function validateMatrix(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.profiles)) {
    throw new Error("PERF_RECORD_WORKSPACE_MATRIX must use schemaVersion 1 and contain profiles[].");
  }
  const requiredArchetypes = new Set(["journal_entry", "purchase_invoice", "master", "ledger"]);
  const seen = new Set();
  for (const profile of value.profiles) {
    if (!requiredArchetypes.has(profile.archetype)) throw new Error(`Unknown record archetype: ${profile.archetype}`);
    if (seen.has(profile.archetype)) throw new Error(`Duplicate record archetype: ${profile.archetype}`);
    seen.add(profile.archetype);
    if (
      !profile.entityCode
      || !profile.recordPath
      || !Array.isArray(profile.surfaces)
      || profile.surfaces.length === 0
      || !Array.isArray(profile.supportedResources)
      || profile.supportedResources.length === 0
    ) {
      throw new Error(`Incomplete record workspace profile for ${profile.archetype}.`);
    }
    if (profile.recordPath.includes("<") || profile.entityCode.includes("<")) {
      throw new Error(`Replace placeholders in the ${profile.archetype} profile before capture.`);
    }
    if (profile.surfaces[0]?.kind !== "initial") {
      throw new Error(`${profile.archetype} must declare its initial surface first.`);
    }
    for (const resource of profile.supportedResources) {
      if (!RECORD_WORKSPACE_RESOURCES.has(resource)) {
        throw new Error(`${profile.archetype} declares unknown resource '${resource}'.`);
      }
    }
  }
  for (const archetype of requiredArchetypes) {
    if (!seen.has(archetype)) throw new Error(`Missing required record archetype: ${archetype}`);
  }
  return value.profiles;
}

function isWorkspaceResponse(value) {
  const url = new URL(value);
  return url.pathname.startsWith("/api/") || (url.pathname.startsWith("/app/") && url.searchParams.has("_rsc"));
}

function redactUrl(value) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
}

function redactRecordPath(value) {
  const parts = value.split("/");
  if (parts.length > 3) parts[3] = ":record";
  return parts.join("/");
}

function parseJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSurface(value) {
  return value.trim().toLowerCase().replace(/^surface_/, "").replace(/[\s-]+/g, "_");
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; refusing to create a partial baseline.`);
  return value;
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function round(value) {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
}
