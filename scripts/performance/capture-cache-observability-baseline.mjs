import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const baseUrl = new URL(required("PERF_NEON_BASE_URL"));
let storageState = resolve(root, process.env.PERF_NEON_STORAGE_STATE || "tests/e2e/.auth/storage-state.json");
const outputDir = resolve(root, process.env.PERF_OUTPUT_DIR || "perf/artifacts/cache-observability");
const repetitions = positiveInt(process.env.PERF_REPETITIONS || "3", "PERF_REPETITIONS");
const settleMs = positiveInt(process.env.PERF_SETTLE_MS || "1000", "PERF_SETTLE_MS");
const entityPath = process.env.PERF_ENTITY_PATH || "/app/journal_entry";
const entityCode = entityCodeFromPath(entityPath);
const differentQuery = process.env.PERF_DIFFERENT_QUERY || "q=baseline-observability";

if (!existsSync(storageState)) {
  const fallback = resolve(root, "tests/e2e/.auth/storage-state.json");
  if (fallback !== storageState && existsSync(fallback)) {
    storageState = fallback;
  } else {
    throw new Error(
      `Authenticated storage state not found: ${storageState}. Set PERF_NEON_STORAGE_STATE to a valid Playwright storage-state path.`,
    );
  }
}

const contextSwitch = requestConfig("CONTEXT_SWITCH");
const contextRestore = requestConfig("CONTEXT_RESTORE");
const mutation = requestConfig("MUTATION");
const browser = await chromium.launch({ headless: process.env.PERF_HEADLESS !== "false" });
const runs = [];

try {
  for (let run = 1; run <= repetitions; run += 1) {
    runs.push(await captureRun(run));
  }
} finally {
  await browser.close();
}

mkdirSync(outputDir, { recursive: true });
const capturedAt = new Date().toISOString();
const outputPath = resolve(outputDir, `${entityCode.replaceAll("_", "-")}-phase8-${capturedAt.replaceAll(":", "-")}.json`);
const report = {
  schemaVersion: 2,
  kind: "athyper.runtime-list-cache-rollout",
  capturedAt,
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  baseUrl: baseUrl.origin,
  entityPath,
  entityCode,
  repetitions,
  runs,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Cache observability baseline written to ${outputPath}`);

async function captureRun(run) {
  const context = await browser.newContext({
    storageState,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const responseDiagnostics = [];
  const documentResponses = [];
  page.on("response", (response) => {
    const headers = response.headers();
    if (response.request().resourceType() === "document") {
      documentResponses.push({
        url: redactUrl(response.url()),
        status: response.status(),
        contentType: headers["content-type"] ?? null,
      });
    }
    if (!headers["server-timing"] && !headers["x-athyper-cache"] && !headers["x-athyper-record-cache"]) return;
    responseDiagnostics.push({
      url: redactUrl(response.url()),
      page: new URL(response.url()).searchParams.get("page"),
      status: response.status(),
      cache: headers["x-athyper-cache"] ?? null,
      recordCache: headers["x-athyper-record-cache"] ?? null,
      serverTiming: headers["server-timing"] ?? null,
    });
  });
  await page.addInitScript(() => {
    window.__athyperRuntimeListCacheDiagnostics = [];
    window.__athyperRuntimeListSkeletonSeen = false;
    window.addEventListener("athyper:runtime-list-cache", (event) => {
      window.__athyperRuntimeListCacheDiagnostics.push(event.detail);
    });
    const observeSkeleton = () => {
      const mark = (node) => {
        if (!(node instanceof Element)) return;
        if (node.matches("[data-runtime-list-skeleton]") || node.querySelector("[data-runtime-list-skeleton]")) {
          window.__athyperRuntimeListSkeletonSeen = true;
        }
      };
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) mark(node);
      }).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.documentElement) observeSkeleton();
    else window.addEventListener("DOMContentLoaded", observeSkeleton, { once: true });
  });

  let contextWasSwitched = false;
  try {
    await page.goto(new URL("/dashboard", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.sessionStorage.clear());

    const firstVisit = await visit("first_visit", entityPath);
    await clientNavigate("/dashboard");
    const immediateRevisit = await visit("immediate_revisit", entityPath);

    await clientNavigate("/dashboard");
    const separator = entityPath.includes("?") ? "&" : "?";
    const differentQueryVisit = await visit("different_query", `${entityPath}${separator}${differentQuery}`, { fullNavigation: true });

    await executeBrowserRequest(page, contextSwitch, { run, label: "context_switch" });
    contextWasSwitched = true;
    await clientNavigate("/dashboard");
    const contextSwitchVisit = await visit("context_switch", entityPath);

    await executeBrowserRequest(page, mutation, { run, label: "mutation" });
    await clientNavigate("/dashboard");
    const mutationRevisit = await visit("mutation_revisit", entityPath);

    return {
      run,
      scenarios: [
        firstVisit,
        immediateRevisit,
        differentQueryVisit,
        contextSwitchVisit,
        mutationRevisit,
      ],
    };
  } finally {
    try {
      if (contextWasSwitched) {
        await executeBrowserRequest(page, contextRestore, { run, label: "context_restore" });
      }
    } finally {
      await context.close();
    }
  }

  async function clientNavigate(path) {
    const target = new URL(path, baseUrl);
    const href = `${target.pathname}${target.search}`;
    const link = page.locator(`a[href="${cssString(href)}"]`).first();
    if (await link.count() === 0) {
      throw new Error(
        `No client-navigation link for ${href}. Configure the rollout entity on the dashboard before capture.`,
      );
    }
    await Promise.all([
      page.waitForURL((url) => url.pathname === target.pathname && url.search === target.search),
      link.click(),
    ]);
  }

  async function visit(name, path, options = {}) {
    const responseStart = responseDiagnostics.length;
    const documentResponseStart = documentResponses.length;
    await page.evaluate(() => {
      window.__athyperRuntimeListCacheDiagnostics = [];
      window.__athyperRuntimeListSkeletonSeen = false;
    });
    const startedAt = Date.now();
    let response = null;
    if (options.fullNavigation) {
      response = await page.goto(new URL(path, baseUrl).toString(), { waitUntil: "domcontentloaded" });
      if (!response?.ok()) {
        throw new Error(`${name} navigation failed with ${response?.status() ?? "no response"}`);
      }
    } else {
      await clientNavigate(path);
    }
    await page.locator("[data-runtime-list-region]").first().waitFor({ state: "visible" });
    const rowsVisibleMs = Date.now() - startedAt;
    await page.waitForTimeout(settleMs);
    const apiProbe = await page.evaluate(async ({ path: apiPath }) => {
      const response = await fetch(apiPath, { cache: "no-store" });
      await response.arrayBuffer();
      return {
        status: response.status,
        cache: response.headers.get("X-Athyper-Cache"),
        recordCache: response.headers.get("X-Athyper-Record-Cache"),
        serverTiming: response.headers.get("Server-Timing"),
      };
    }, { path: listApiPath(path) });
    const browser = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation").at(-1);
      const rscDiagnosticValue = document
        .querySelector("[data-athyper-runtime-list-diagnostics]")
        ?.getAttribute("data-athyper-runtime-list-diagnostics");
      return {
        navigation: navigation?.toJSON() ?? null,
        cache: window.__athyperRuntimeListCacheDiagnostics ?? [],
        skeletonSeen: window.__athyperRuntimeListSkeletonSeen === true,
        rscDiagnostics: rscDiagnosticValue ? JSON.parse(rscDiagnosticValue) : null,
      };
    });
    const diagnosticResponses = responseDiagnostics.slice(responseStart);
    const visitDocumentRequests = documentResponses.slice(documentResponseStart);
    return {
      name,
      routeMs: rowsVisibleMs,
      rowsVisibleMs,
      navigationKind: visitDocumentRequests.length > 0 ? "document" : "client",
      documentRequests: visitDocumentRequests,
      page2RequestedBeforeIntent: diagnosticResponses.some((item) => item.page === "2"),
      skeletonSeen: browser.skeletonSeen,
      routeStatus: response?.status() ?? 200,
      routeCache: response?.headers()["x-athyper-cache"] ?? null,
      routeServerTiming: response?.headers()["server-timing"] ?? null,
      apiProbe,
      browserCache: browser.cache,
      rscDiagnostics: browser.rscDiagnostics,
      navigation: browser.navigation
        ? {
            ...browser.navigation,
            name: typeof browser.navigation.name === "string"
              ? redactUrl(browser.navigation.name)
              : null,
          }
        : null,
      diagnosticResponses,
    };
  }
}

function listApiPath(pagePath) {
  const pageUrl = new URL(pagePath, baseUrl);
  const apiUrl = new URL(`/api/runtime/v1/entities/${entityCode}`, baseUrl);
  apiUrl.search = pageUrl.search;
  return `${apiUrl.pathname}${apiUrl.search}`;
}

async function executeBrowserRequest(page, config, replacements) {
  const body = config.body === undefined
    ? undefined
    : JSON.stringify(replaceTemplateValues(config.body, replacements));
  const result = await page.evaluate(async ({ url, method, headers, body }) => {
    const response = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
    });
    return { ok: response.ok, status: response.status, text: (await response.text()).slice(0, 500) };
  }, {
    url: new URL(config.url, baseUrl).toString(),
    method: config.method,
    headers: body ? { "Content-Type": "application/json", ...config.headers } : config.headers,
    body,
  });
  if (!result.ok) {
    throw new Error(`${replacements.label} request failed with ${result.status}: ${result.text}`);
  }
}

function requestConfig(prefix) {
  const url = required(`PERF_${prefix}_URL`);
  const bodyValue = process.env[`PERF_${prefix}_BODY`];
  const headersValue = process.env[`PERF_${prefix}_HEADERS`];
  return {
    url,
    method: process.env[`PERF_${prefix}_METHOD`] || "POST",
    body: bodyValue ? parseJson(bodyValue, `PERF_${prefix}_BODY`) : undefined,
    headers: headersValue ? parseJson(headersValue, `PERF_${prefix}_HEADERS`) : {},
  };
}

function replaceTemplateValues(value, replacements) {
  if (typeof value === "string") {
    return value
      .replaceAll("{{RUN}}", String(replacements.run))
      .replaceAll("{{LABEL}}", replacements.label);
  }
  if (Array.isArray(value)) return value.map((item) => replaceTemplateValues(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceTemplateValues(item, replacements)]),
    );
  }
  return value;
}

function parseJson(value, name) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function redactUrl(value) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function entityCodeFromPath(path) {
  const match = /^\/app\/([a-z][a-z0-9_-]*)(?:[/?#]|$)/.exec(new URL(path, baseUrl).pathname);
  if (!match) throw new Error(`PERF_ENTITY_PATH must target /app/:entity; received ${path}`);
  return match[1].replaceAll("-", "_");
}

function cssString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
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
