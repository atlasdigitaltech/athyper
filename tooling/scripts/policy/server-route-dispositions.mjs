import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function reconcileRouteDispositions(
  manifest,
  decisions = [],
  root = process.cwd(),
) {
  const routes = new Map(
    manifest.routes.map((route) => [route.identity, route]),
  );
  const reviewed = new Map();
  for (const decision of decisions) {
    const route = routes.get(decision.identity);
    if (
      !route ||
      route.status !== "legacy-only" ||
      reviewed.has(decision.identity)
    )
      throw Error(
        `Invalid or duplicate legacy disposition: ${decision.identity}`,
      );
    if (
      !["replaced", "retired"].includes(decision.disposition) ||
      !decision.owner?.trim() ||
      !decision.reason?.trim() ||
      !decision.evidence?.length
    )
      throw Error(`Incomplete route disposition: ${decision.identity}`);
    for (const evidence of decision.evidence) {
      if (
        typeof evidence !== "string" ||
        evidence.startsWith("/") ||
        evidence.split(/[\\/]/).includes("..") ||
        !existsSync(join(root, evidence)) ||
        !statSync(join(root, evidence)).isFile()
      )
        throw Error(`Missing route evidence: ${evidence}`);
    }
    if (
      decision.disposition === "replaced" &&
      (!decision.replacement ||
        !routes.get(decision.replacement)?.current.length)
    )
      throw Error(`Replacement is not a current route: ${decision.identity}`);
    reviewed.set(decision.identity, decision);
  }
  const legacyOnly = manifest.routes
    .filter((route) => route.status === "legacy-only")
    .map(
      (route) =>
        reviewed.get(route.identity) ?? {
          identity: route.identity,
          disposition: "unresolved",
          owner: "server-migration",
          reason:
            "Historical identity has no exact current match; replacement or retirement requires evidence.",
          evidence: [],
        },
    );
  return {
    schemaVersion: 1,
    unresolved: legacyOnly.filter((row) => row.disposition === "unresolved")
      .length,
    legacyOnly,
  };
}
export function readRouteDispositionDecisions(root) {
  const file = join(
    root,
    "governance/config/governance/server-route-disposition-decisions.json",
  );
  if (!existsSync(file)) return [];
  const document = JSON.parse(readFileSync(file, "utf8"));
  if (document.schemaVersion !== 1 || !Array.isArray(document.decisions))
    throw new Error("Invalid route disposition decision document");
  return document.decisions;
}
