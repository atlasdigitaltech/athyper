import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  certificationFindings,
  conflictFinding,
  journeyFinding,
  postingRoleFinding,
} from "../../../../../packages/domain/finance/finance-workbench/src/lib/finance-review.js";
import type {
  FinanceSetupConflict,
  JourneyStep,
} from "../../../../../packages/domain/finance/finance-workbench/src/lib/finance-setup.types.js";
import type {
  CertificationDomainReadiness,
} from "../../../../../packages/domain/finance/finance-workbench/src/hooks/useCertificationReadiness.js";
import type {
  PostingRoleCoverageCell,
  PostingRoleCoverageRow,
} from "../../../../../packages/domain/finance/finance-workbench/src/hooks/usePostingRoleCoverage.js";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Finance Settings Slice 5 Review configuration", () => {
  it("uses preserved readiness, conflict, certification, and posting APIs", () => {
    const review = read("packages/domain/finance/finance-workbench/src/views/FinanceReadinessWorkbench.tsx");
    const readinessHook = read("packages/domain/finance/finance-workbench/src/hooks/useCompanyHub.ts");
    const conflictHook = read("packages/domain/finance/finance-workbench/src/hooks/useFinanceSetupConflicts.ts");
    const certificationHook = read("packages/domain/finance/finance-workbench/src/hooks/useCertificationReadiness.ts");
    const postingHook = read("packages/domain/finance/finance-workbench/src/hooks/usePostingRoleCoverage.ts");

    expect(review).toContain("useCompanyHub");
    expect(review).toContain("useFinanceSetupConflicts");
    expect(review).toContain("useCompanyCertificationReadiness");
    expect(review).toContain("usePostingRoleCoverage");
    expect(review).not.toContain("CloseCycleWorkbench");
    expect(readinessHook).toContain("/api/finance/setup/readiness?");
    expect(conflictHook).toContain("/api/finance/setup/conflicts?");
    expect(certificationHook).toContain("/api/finance/setup/certification-readiness?");
    expect(postingHook).toContain("/api/finance/setup/configure/posting-role-coverage?");
  });

  it("turns incomplete journey steps into exact settings actions", () => {
    const step: JourneyStep = {
      key: "gl_controls",
      label: "GL controls",
      state: "blocked",
      coveragePct: 40,
      primaryHref: "/legacy",
      conflictCount: 2,
    };
    const finding = journeyFinding("MY01", step);
    expect(finding).toMatchObject({
      severity: "blocker",
      actionHref: "/finance/setup/company/MY01/foundation/accounts#gl-controls",
    });
  });

  it("gives conflicts a settings action even when the API action is null", () => {
    const conflict: FinanceSetupConflict = {
      id: "conflict-1",
      category: "house_bank",
      severity: "error",
      scope: { type: "company", code: "MY01" },
      visibleAtScopes: [{ type: "company", code: "MY01" }],
      title: "House Bank missing",
      message: "Configure a House Bank.",
      reasonCode: "HOUSE_BANK_MISSING",
      actionHref: null,
      detectedAt: "2026-07-24T00:00:00.000Z",
    };
    expect(conflictFinding("MY01", conflict).actionHref).toBe(
      "/finance/setup/company/MY01/banking#house-banks",
    );
  });

  it("links every failed certification check to its owning section", () => {
    const domain: CertificationDomainReadiness = {
      domain: "payments_settlement",
      label: "Payments & Settlement",
      state: "blocked",
      passed: 0,
      total: 2,
      blockerCount: 2,
      warningCount: 0,
      checks: [
        { code: "payment_interfaces", label: "Interface routing deterministic", passed: false, classification: "setup" },
        { code: "settlement_rules", label: "Settlement rules cover assigned Books", passed: false, classification: "setup" },
      ],
      primaryAction: { label: "Open", href: "/legacy" },
    };
    expect(certificationFindings("MY01", domain).map((finding) => finding.actionHref)).toEqual([
      "/finance/setup/company/MY01/payments#payment-routing",
      "/finance/setup/company/MY01/payments#settlement-accounting",
    ]);
  });

  it("links missing posting-role findings to the exact coverage cell", () => {
    const row: PostingRoleCoverageRow = {
      roleCode: "tax_payable",
      roleName: "Tax payable",
      description: null,
      domain: "tax",
      normalBalance: "credit",
      mandatoryForReadiness: true,
      cells: [],
    };
    const cell: PostingRoleCoverageCell = {
      bookId: "book-1",
      bookCode: "STAT",
      required: true,
      requiredBy: ["tax"],
      status: "missing",
      reasonCode: "POSTING_ROLE_MISSING",
      mappingId: null,
      glAccountId: null,
      glAccountCode: null,
      glAccountName: null,
      priority: null,
      versionNo: null,
      effectiveFrom: null,
      effectiveTo: null,
    };
    const finding = postingRoleFinding("MY01", row, cell);
    expect(finding?.actionHref).toBe(
      "/workbench/finance/posting-role-coverage?scopeId=MY01#posting-role-tax_payable-STAT",
    );
  });

  it("keeps posting authorization in the backend gate", () => {
    const gate = read("server/db/ddl/planes/neon/document/09_views.sql");
    const review = read("packages/domain/finance/finance-workbench/src/views/FinanceReadinessWorkbench.tsx");
    expect(gate).toContain("fourDomainReadiness");
    expect(gate).toContain("rollout_mode");
    expect(review).toContain("Posting authorization continues to use server-side gates.");
  });
});
