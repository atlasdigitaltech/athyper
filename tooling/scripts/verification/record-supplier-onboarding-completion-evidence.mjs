import { readFileSync, writeFileSync } from "node:fs";
const report = (name) =>
  JSON.parse(
    readFileSync(`governance/policy/reports/${name}.dev.json`, "utf8"),
  );
const database = report("supplier-onboarding-completion-db");
const negativeLive = report("supplier-onboarding-completion-live");
const materialization = report("supplier-onboarding-materialization-live");
const activation = report("supplier-onboarding-activation-live");
const closure = report("supplier-onboarding-closure-live");
const companyGuard = report("supplier-onboarding-company-guard");
const payment = report("supplier-onboarding-payment-db");
const bankLink = report("supplier-onboarding-bank-link-db");
const bankSource = report("supplier-onboarding-bank-source-live");
const receipts = report("supplier-onboarding-receipts-db");
const access = report("supplier-onboarding-dev-access");
const storage = report("supplier-onboarding-completion-storage");
const deployment = report("supplier-process-selection-deployment");
for (const value of [
  database,
  negativeLive,
  materialization,
  closure,
  companyGuard,
  payment,
  bankLink,
  bankSource,
  receipts,
  storage,
]) {
  if (!value.passed) throw Error("P6 qualification evidence is incomplete");
}
if (
  !activation.companyPassed ||
  !activation.activationPassed ||
  !access.revokedAt ||
  closure.cases.length !== 3 ||
  closure.cases.some(
    (c) => !c.browser || !c.replayed || !c.activationReplayVerified,
  )
)
  throw Error("P6 live qualification or access cleanup incomplete");
const evidence = {
  package: "P6",
  at: new Date().toISOString(),
  status: "accepted_local_dev",
  scope:
    "Increment A materialization/activation; Basic, Standard and Enhanced under the published purchasing activation policy",
  implementation: [
    "shared current-attempt and supplier-domain completion evaluation",
    "scoped case-authorized readiness/completion APIs",
    "versioned activation-policy applicability and current company-bank acceptance evidence",
    "governed activation-case materialization and scoped company/bank/activation work links",
    "expected-version closure, stored replay receipt and one committed completion event",
    "qualification action coordinates preserve source authorization and distinct child-decision mapping",
    "canonical audit contract covers supplier activation",
  ],
  qualification: {
    unitTests: {
      passed: 127,
      suites: [
        "cycle service/repository (26)",
        "case service/view and eligibility (87)",
        "BP backend mapping (14)",
      ],
    },
    database: {
      checks: database.checks,
      boundary:
        "Positive P4 closure fixtures use a database-test authorization port; closure/outbox writes roll back.",
    },
    negativeLive: negativeLive.checks,
    profiles: closure.cases.map((c) => ({
      level: c.level,
      caseId: c.id,
      runId: c.runId,
      activationCaseId: c.activationCaseId,
      materialized:
        materialization.cases.find((m) => m.id === c.id)?.materialization
          ?.request?.caseStatus === "materialized",
      qualificationApproved:
        activation.cases.find((a) => a.id === c.id)?.qualificationDecision
          ?.qualification?.decision === "approved",
      companyCaseId: activation.cases.find((a) => a.id === c.id)?.company?.id,
      activationDocument: c.document,
      staleClosureCode: c.staleClosure,
      closureReplayVerified: c.replayed,
      activationReplayVerified: c.activationReplayVerified,
      browser: c.browser,
    })),
    companyGuard,
    payment,
    bankLink,
    bankSource,
    receipts,
    riskFixtureBoundary: report("supplier-onboarding-risk-fixture").boundary,
    access: {
      applied: access.applied,
      assignments: access.assignments,
      expiresAt: access.expiresAt,
      revokedAt: access.revokedAt,
    },
    builds: [
      "master-data rebuilt after qualification/bank readiness fixes",
      "host/governance/NEON builds from P6 implementation",
    ],
    storage,
    deployments: deployment.receipts.map((r) => ({
      service: r.service,
      image: r.image,
    })),
  },
  boundaries: [
    "Fresh supplier, qualification, company and activation decisions/materialization, real activation documents, downloads, closure/replay and browser reads use authenticated owning APIs.",
    "Risk assessments are declared upstream fixtures.",
    "Payment readiness uses transaction-local commercial and bank fixtures with real database readiness owners; all writes roll back.",
    "Bank linkage uses governed draft/validation/submission/rejection/link commands as athyperapp with fixture validation evidence; all writes roll back. The live API missing-Mesh-source denial is separately qualified.",
    "An external Mesh bank-disclosure and bank-verification API journey is not claimed by these P6 gate tests.",
  ],
  excluded: [
    "P7",
    "P8 full screen integration",
    "P9 final Increment A qualification",
    "Follow-up B",
    "Follow-up C",
  ],
};
if (
  evidence.qualification.profiles.some(
    (c) => !c.materialized || !c.qualificationApproved,
  )
)
  throw Error("Profile outcome evidence missing");
writeFileSync(
  "docs/architecture/business-partner/internal-supplier-onboarding-p6-evidence.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  "P6 local DEV acceptance evidence recorded with explicit fixture boundaries.",
);
