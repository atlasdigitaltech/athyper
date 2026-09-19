/** Operator-invoked UI test copy; does not submit, approve or publish. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { request } from "@playwright/test";
import { cloneGraphIds } from "../../../server/packages/planes/studio/meta-entity-authoring/src/graph-identity.ts";
import {
  validateGraph,
  runContractTests,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts";
async function main() {
  const sourceId = "be767e01-f36d-434f-91f3-67bff689a367";
  const baseURL = "https://studio.dev.athyper.test";
  const dir = "docs/architecture/business-partner/ui-test-draft-evidence";
  mkdirSync(dir, { recursive: true });
  const receiptPath = dir + "/receipt.json";
  const receipt: any = existsSync(receiptPath)
    ? JSON.parse(readFileSync(receiptPath, "utf8"))
    : {
        sourceId,
        sourceRevision: 63,
        sourceState: "approved",
        branchCode: "bp-ui-label-test",
        published: false,
        approved: false,
        steps: [],
      };
  const persist = () =>
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  const hash = (v: any) =>
    createHash("sha256")
      .update(JSON.stringify(canonical(v)))
      .digest("hex");
  const c = await request.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    storageState: "tests/e2e/.auth/dev/studio/catl.admin.json",
  });
  try {
    const session = await (await c.get("/api/auth/session")).json();
    if (
      session.state !== "authenticated" ||
      session.principalId !== "81cd1978-2df5-5c9a-938a-2f8c291aea13" ||
      session.tenantId !== "44444444-4444-4444-8444-444444444444"
    )
      throw Error("EXPECTED_AUTHOR_SESSION_REQUIRED");
    const cookies = (await c.storageState()).cookies;
    const csrf = cookies.find(
      (x) => x.name === "__Host-athyper-csrf" || x.name === "athyper-csrf",
    );
    if (!csrf) throw Error("CSRF_REQUIRED");
    const headers = {
      origin: baseURL,
      "x-csrf-token": decodeURIComponent(csrf.value),
    };
    async function read(path: string) {
      const r = await c.get("/api/relay/meta-entity-authoring/" + path);
      if (!r.ok()) throw Error(`READ_FAILED:${r.status()}`);
      return r.json();
    }
    const source = await read(`change-sets/${sourceId}/graph`);
    if (
      source.changeSet.status !== "approved" ||
      source.changeSet.revision !== 63
    )
      throw Error("SOURCE_CHANGED");
    receipt.sourceGraphHash = hash(source.graph);
    receipt.sourcePreview ??= source.preview;
    const releases = await read("inspection/releases");
    receipt.releaseListHashBefore ??= hash(releases);
    const localValidation = validateGraph(source.graph);
    if (localValidation.issues.length)
      throw Error(JSON.stringify(localValidation.issues));
    const tests = runContractTests(source.graph);
    console.log("source validation", localValidation, "source tests", tests);
    if (!tests.passed) throw Error("SOURCE_TESTS_FAILED");
    if (!process.argv.includes("--apply")) {
      console.log(
        "Read-only preparation complete. Use --apply to create the named test draft.",
      );
      return;
    }
    async function write(
      step: string,
      path: string,
      data: any,
      method = "POST",
    ) {
      const r = await c.fetch("/api/relay/meta-entity-authoring/" + path, {
        method,
        headers,
        data,
      });
      const body = await r.json();
      receipt.steps.push({
        step,
        status: r.status(),
        at: new Date().toISOString(),
      });
      persist();
      if (!r.ok()) throw Error(JSON.stringify({ status: r.status(), body }));
      return body;
    }
    if (!receipt.draftId) {
      const all = await read("change-sets");
      if (
        all.some(
          (s: any) =>
            s.branchCode === receipt.branchCode &&
            s.entityId === source.changeSet.entityId,
        )
      )
        throw Error("EXISTING_NAMED_DRAFT_REQUIRES_INSPECTION");
      const created = await write("create", "change-sets", {
        entityId: source.changeSet.entityId,
        entityCode: "business_partner",
        branchCode: receipt.branchCode,
        title:
          "Business Partner — UI label test (copy of approved revision 63)",
      });
      receipt.draftId = created.id;
      receipt.revision = created.revision;
      persist();
    }
    if (!receipt.staged) {
      const graph = cloneGraphIds(source.graph);
      writeFileSync(
        dir + "/identity-map.json",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(source.graph).flatMap(([k, rows]: [string, any]) =>
              Array.isArray(rows)
                ? rows
                    .filter((r: any) => r?.id)
                    .map((r: any, i: number) => [
                      r.id,
                      (graph as any)[k][i]?.id,
                    ])
                : [],
            ),
          ),
          null,
          2,
        ) + "\n",
      );
      const saved = await write(
        "save",
        `change-sets/${receipt.draftId}/graph`,
        { ...graph, expectedRevision: receipt.revision },
        "PUT",
      );
      receipt.revision = saved.revision;
      receipt.staged = true;
      receipt.preview = saved.preview;
      persist();
    }
    // Verify the full copy after storage normalization, including index-based test paths.
    const loadedCopy = await read(`change-sets/${receipt.draftId}/graph`);
    const ids = JSON.parse(readFileSync(dir + "/identity-map.json", "utf8"));
    const remap = (v: any): any =>
      typeof v === "string"
        ? (ids[v] ?? v)
        : Array.isArray(v)
          ? v.map(remap)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, x]) => [k, remap(x)]),
              )
            : v;
    const normalize = (g: any) =>
      Object.fromEntries(
        Object.entries(g).map(([k, v]: [string, any]) => [
          k,
          Array.isArray(v)
            ? v
                .map((row: any) => {
                  if (k === "tests" && typeof row.path === "string") {
                    const parts = row.path.split(".");
                    const index = Number(parts[1]);
                    if (
                      Number.isInteger(index) &&
                      Array.isArray(g[parts[0]]) &&
                      g[parts[0]][index]?.id
                    )
                      parts[1] = g[parts[0]][index].id;
                    return { ...row, path: parts.join(".") };
                  }
                  return row;
                })
                .sort((a: any, b: any) =>
                  String(a?.id ?? a?.key ?? "").localeCompare(
                    String(b?.id ?? b?.key ?? ""),
                  ),
                )
            : v,
        ]),
      );
    if (
      hash(normalize(remap(source.graph))) !== hash(normalize(loadedCopy.graph))
    )
      throw Error("REREAD_GRAPH_MISMATCH");
    receipt.rereadVerified = true;
    receipt.draftGraphHash = hash(loadedCopy.graph);
    persist();
    receipt.validation = await write(
      "validate",
      `change-sets/${receipt.draftId}/validate`,
      {},
    );
    receipt.tests = await write(
      "test",
      `change-sets/${receipt.draftId}/test`,
      {},
    );
    const after = await read(`change-sets/${sourceId}/graph`);
    receipt.sourceUnchanged =
      hash(after.graph) === receipt.sourceGraphHash &&
      after.changeSet.revision === 63 &&
      after.changeSet.status === "approved";
    receipt.releasesUnchanged =
      hash(await read("inspection/releases")) === receipt.releaseListHashBefore;
    const loaded = await read(`change-sets/${receipt.draftId}/graph`);
    receipt.finalState = loaded.changeSet;
    receipt.preview = loaded.preview;
    const surface = loaded.graph.surfaces.find(
      (s: any) => s.surfaceKey === "intake_partner",
    );
    receipt.testSurface = surface?.id;
    receipt.url =
      baseURL +
      "/mdg/business-partner/model?inspect=draft%3A" +
      receipt.draftId +
      (surface ? "&object=surfaces%3A" + surface.id : "");
    persist();
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    await c.dispose();
  }
}
await main();
