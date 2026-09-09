import {
  parseAtlasBusinessContext,
  parseAtlasInsightResult,
  type AtlasBusinessContextV1,
  type AtlasInsightFinding,
  type AtlasInsightResult,
  type AtlasRegisteredTool,
} from "@athyper/server-contract-ai";
import type { ListRecordsQuery } from "@athyper/server-contract-records";
import { atlasEvidenceHash } from "./message-lineage.js";
import { AtlasServiceError } from "./errors.js";

/** The Manage list service resolves standard views, query-field policy and directory scope. */
export type AtlasBusinessPartnerList = (query: ListRecordsQuery) => Promise<{
  readonly descriptorHash: string;
  readonly scopeFingerprint: string;
  readonly rows: readonly { readonly id: string }[];
  readonly pagination: {
    readonly hasNext: boolean;
    readonly total?: number;
    readonly countMode: string;
  };
}>;
const MAX_RECORDS = 20;
const MAX_MS = 3500;
const invalid = (): never => {
  throw new AtlasServiceError(
    "TOOL_DENIED",
    "Business Partner list insight is unavailable.",
  );
};

/** One model tool call, bounded owner reads, no client-supplied population/counts. */
export function createBusinessPartnerListInsightTool(
  list: AtlasBusinessPartnerList,
  brief: AtlasRegisteredTool,
): AtlasRegisteredTool {
  const validate = (args: Readonly<Record<string, unknown>>) => {
    if (Object.keys(args).some((key) => !["page", "target"].includes(key)))
      invalid();
    const page = parseAtlasBusinessContext(args.page);
    if (page.kind !== "manage" || page.entityCode !== "business_partner")
      invalid();
    if (
      args.target !== undefined &&
      !["selection", "visible_page", "filtered_set"].includes(
        String(args.target),
      )
    )
      invalid();
    return page as Extract<AtlasBusinessContextV1, { kind: "manage" }>;
  };
  return {
    manifest: {
      schema: "atlas-tool-manifest/1",
      version: "1",
      toolCode: "bp_read_list_insights",
      displayName: "Business Partner list insights and comparison",
      description:
        "Summarize or compare the current Manage population using saved owner assessments. The server supplies page filters and selection. Optional target overrides selection/visible_page/filtered_set. At most 20 partners are examined. Counts apply only to examined authorized partners; issue counts overlap. Partial or unavailable assessment never means ready. Narrow filters or selection for complete coverage.",
      allowedPlanes: ["neon"],
      access: "read",
      risk: "low",
      confirmation: "none",
      featureKey: "atlas_tools_read_enabled",
      requiredPermissions: ["neon.relationship.business_partner.read"],
      timeoutMs: 5000,
      maxResultBytes: 32768,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          target: { enum: ["selection", "visible_page", "filtered_set"] },
        },
      },
      resultSchema: {
        type: "object",
        required: ["insight"],
        properties: { insight: { type: "object" } },
        additionalProperties: false,
      },
    },
    validateArguments: (args) => {
      validate(args);
    },
    readHandler: {
      async execute({ context, arguments: args }) {
        const page = validate(args),
          target = (args.target ?? page.analysisTarget) as
            "selection" | "visible_page" | "filtered_set";
        const started = Date.now();
        const check = () => {
          if (context.signal.aborted)
            throw new AtlasServiceError(
              "TOOL_DENIED",
              "Business Partner list insight was cancelled.",
            );
        };
        check();
        const directory = page.directory;
        const scopeCoordinate =
          directory?.eligibleOperation &&
          directory.operatingOrganizationIds?.length === 1 &&
          directory.companyCodeIds?.length === 1
            ? {
                partnerRole: directory.partnerRole,
                eligibleOperation: directory.eligibleOperation,
                operatingOrganizationId: directory.operatingOrganizationIds[0],
                companyCodeId: directory.companyCodeIds[0],
              }
            : directory;
        // Visible page is re-read with its cursor before applying the visible-ID restriction.
        const query: ListRecordsQuery = {
          context: context.context,
          entityCode: "business_partner",
          fields: page.fields,
          filters: page.filters,
          sort: page.sort,
          search: page.search,
          group: page.group,
          standardViewKey: page.standardViewKey,
          scopeCoordinate,
          hydrateReferences: false,
          countMode: "exact",
          limit: MAX_RECORDS,
        };
        const ids =
          target === "selection"
            ? page.selectedIds
            : target === "visible_page"
              ? page.visibleIds
              : undefined;
        if (target === "visible_page") {
          const visible = await list({
            ...query,
            cursor: page.cursor,
            limit: page.pageSize,
            countMode: "none",
          }).catch(() => invalid());
          if (ids!.some((id) => !visible.rows.some((row) => row.id === id)))
            invalid();
        }
        const population = await list({
          ...query,
          ...(ids ? { recordIds: ids } : {}),
        }).catch(() => invalid());
        check();
        if (
          !population.descriptorHash ||
          !population.scopeFingerprint ||
          population.rows.length > MAX_RECORDS ||
          new Set(population.rows.map((row) => row.id)).size !==
            population.rows.length
        )
          invalid();
        const total =
          population.pagination.countMode === "exact"
            ? population.pagination.total
            : undefined;
        if (
          total !== undefined &&
          (!Number.isSafeInteger(total) ||
            total < population.rows.length ||
            (!population.pagination.hasNext &&
              total !== population.rows.length))
        )
          invalid();
        if (ids && population.rows.some((row) => !ids.includes(row.id)))
          invalid();
        const findings: AtlasInsightFinding[] = [],
          evidence: AtlasInsightResult["evidence"][number][] = [],
          sources: {
            coordinate: {
              entityCode: string;
              recordId: string;
              revision: string;
              descriptorHash: string;
            };
          }[] = [];
        const issuePartners = new Map<string, Set<string>>(),
          affected = new Set<string>();
        let examined = 0,
          evaluated = 0,
          stale = false;
        for (const row of population.rows) {
          check();
          if (Date.now() - started >= MAX_MS) break;
          // Reuse record admission, scoped admission, owner scope checks and disclosure.
          // Authorization/protocol failures abort the whole result instead of exposing denial counts.
          const result = await brief.readHandler!.execute({
            context,
            arguments: {
              recordId: row.id,
              ...(page.workContext?.operatingOrganizationId
                ? {
                    operatingOrganizationId:
                      page.workContext.operatingOrganizationId,
                  }
                : {}),
              ...(page.workContext?.companyCodeId
                ? { companyCodeId: page.workContext.companyCodeId }
                : {}),
              ...(directory?.partnerRole
                ? { role: directory.partnerRole }
                : {}),
            },
          });
          check();
          const data = result.data as {
            records: Readonly<Record<string, unknown>>[];
            insight: AtlasInsightResult;
          };
          const insight = parseAtlasInsightResult(data.insight);
          if (
            result.sources.some(
              (source) =>
                source.coordinate.descriptorHash !== population.descriptorHash,
            )
          )
            invalid();
          const complete =
            insight.coverage.state === "complete" &&
            insight.freshness === "current" &&
            insight.findings.length > 0 &&
            insight.findings.every((f) =>
              ["evaluated_pass", "evaluated_fail"].includes(f.state),
            );
          // Bounded evidence/findings: stop before exceeding the transport contract.
          if (evidence.length + insight.evidence.length > 100) break;
          examined++;
          if (complete) evaluated++;
          stale ||= insight.freshness === "stale";
          const failures = insight.findings.filter(
            (f) => f.state === "evaluated_fail",
          );
          const codes = new Set(failures.map((f) => f.code));
          for (const code of codes) {
            if (!issuePartners.has(code)) issuePartners.set(code, new Set());
            issuePartners.get(code)!.add(row.id);
            affected.add(row.id);
          }
          evidence.push(
            ...insight.evidence.map((e) => ({
              ...e,
              id: `${examined}:${e.id}`,
            })),
          );
          sources.push(...result.sources);
          const identity = data.records[0] ?? {};
          findings.push({
            id: `partner:${examined}`,
            code: "partner_comparison",
            state: complete
              ? failures.length
                ? "evaluated_fail"
                : "evaluated_pass"
              : "not_evaluated",
            severity: failures.length ? "warning" : "info",
            facts: {
              ...Object.fromEntries(
                ["code", "display_name", "status", "partner_category"]
                  .filter((key) => Object.hasOwn(identity, key))
                  .map((key) => [key, identity[key] as string | null]),
              ),
              evaluated: complete,
              assessmentStates:
                [...new Set(insight.findings.map((f) => f.state))].join(", ") ||
                "not_evaluated",
              disclosedIssueCount: codes.size,
            },
            ruleVersion: "bp-list/1",
            evidenceIds: insight.evidence.map((e) => `${examined}:${e.id}`),
            actionIds: [],
          });
        }
        if (issuePartners.size > 70) invalid();
        for (const [code, partners] of [...issuePartners].sort(([a], [b]) =>
          a.localeCompare(b),
        ))
          findings.push({
            id: `issue:${findings.length}`,
            code,
            state: "evaluated_fail",
            severity: "warning",
            facts: {
              distinctPartnerCount: partners.size,
              countsOverlap: true,
              population: "examined authorized partners",
            },
            ruleVersion: "bp-list/1",
            evidenceIds: [],
            actionIds: [],
          });
        const complete =
          !population.pagination.hasNext &&
          examined === population.rows.length &&
          evaluated === examined;
        findings.unshift({
          id: "population",
          code: "list_coverage",
          state: "not_evaluated",
          severity: "info",
          facts: {
            examinedCount: examined,
            distinctPartnersWithFindings: affected.size,
            countsOverlap: true,
            maxRecords: MAX_RECORDS,
            narrowingRequired: !complete,
            countScope: "examined authorized partners",
            consistency: "current reads; not a point-in-time snapshot",
          },
          ruleVersion: "bp-list/1",
          evidenceIds: [],
          actionIds: [],
        });
        return {
          data: {
            insight: parseAtlasInsightResult({
              schemaVersion: 1,
              scope: {
                entityCode: "business_partner",
                ...(directory?.partnerRole
                  ? { role: directory.partnerRole }
                  : {}),
                ...(page.workContext?.companyCodeId
                  ? { companyCodeId: page.workContext.companyCodeId }
                  : {}),
                ...(page.workContext?.operatingOrganizationId
                  ? {
                      operatingOrganizationId:
                        page.workContext.operatingOrganizationId,
                    }
                  : {}),
                fingerprint: atlasEvidenceHash({
                  scope: population.scopeFingerprint,
                  page,
                  target,
                }),
              },
              coverage: {
                target,
                state: complete ? "complete" : "partial",
                evaluatedCount: evaluated,
                ...(total !== undefined ? { authorizedTotalCount: total } : {}),
              },
              evaluatedAt: new Date().toISOString(),
              freshness: stale ? "stale" : "current",
              findings,
              evidence,
              actions: [],
            }),
          },
          sources,
        };
      },
    },
  };
}

/** Authoritative completion avoids loading a large comparison back into a local model. */
export function businessPartnerListInsightMessage(
  results: readonly import("@athyper/server-contract-ai").AtlasContentBlock[],
): string | undefined {
  const block = results.length === 1 ? results[0] : undefined;
  if (
    block?.type !== "tool_result" ||
    block.isError ||
    block.toolName !== "bp_read_list_insights"
  )
    return undefined;
  const insight = parseAtlasInsightResult(
    (block.result as { insight: unknown }).insight,
  );
  const population = insight.findings.find((f) => f.id === "population")!;
  const count = population.facts.examinedCount;
  const total = insight.coverage.authorizedTotalCount;
  return `Examined ${count} authorized partners${total === undefined ? "" : ` out of ${total}`} in the ${insight.coverage.target.replaceAll("_", " ")}. ${insight.coverage.evaluatedCount} had complete assessments. ${population.facts.distinctPartnersWithFindings} had disclosed findings. Issue counts overlap: a partner can appear in more than one issue count. ${insight.coverage.state === "complete" ? "The current authorized population was covered." : "Coverage is partial. Narrow the filters or select fewer partners; assessments also require an explicit supplier/customer role, operating organization and company."} Zero disclosed issues does not establish transaction eligibility.`;
}
