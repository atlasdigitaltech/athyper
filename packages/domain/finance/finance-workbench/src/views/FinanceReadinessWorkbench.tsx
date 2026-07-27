"use client";

import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Info,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { cn } from "@athyper/theme/utils";
import { useCompanyHub } from "../hooks/useCompanyHub";
import { useFinanceSetupConflicts } from "../hooks/useFinanceSetupConflicts";
import { useCompanyCertificationReadiness } from "../hooks/useCertificationReadiness";
import { usePostingRoleCoverage } from "../hooks/usePostingRoleCoverage";
import {
  certificationFindings,
  conflictFinding,
  journeyFinding,
  journeySettingsHref,
  postingRoleFinding,
  type ReviewFinding,
} from "../lib/finance-review";
import type { FinanceScope } from "../lib/scope";

export interface FinanceReadinessWorkbenchProps {
  scope: FinanceScope;
  runId?: string;
  phaseCode?: string;
}

const TODAY = new Date().toISOString().slice(0, 10);

export function FinanceReadinessWorkbench({ scope }: FinanceReadinessWorkbenchProps) {
  const companyCode = scope.scopeId;
  const hub = useCompanyHub({
    companyCode,
    fiscalYear: scope.fiscalYear,
    period: scope.period ?? undefined,
    bookId: scope.bookId,
    inboxLimit: 100,
  });
  const conflicts = useFinanceSetupConflicts({ scopeType: "company", scopeCode: companyCode });
  const certification = useCompanyCertificationReadiness(companyCode);
  const postingRoles = usePostingRoleCoverage(companyCode, certification.data?.asOfDate ?? TODAY);

  if (!companyCode) {
    return (
      <PageFrame>
        <EmptyReview
          title="Select a company to review"
          message="Open Finance Settings, choose a company, then use Review configuration."
          href="/finance/setup"
          action="Open Finance Settings"
        />
      </PageFrame>
    );
  }

  const isInitialLoading = [hub, conflicts, certification, postingRoles].some(
    (query) => query.isLoading && !query.data,
  );
  if (isInitialLoading) {
    return <PageFrame><ReviewSkeleton /></PageFrame>;
  }

  const journeyFindings = (hub.data?.journey ?? [])
    .map((step) => journeyFinding(companyCode, step))
    .filter((finding): finding is ReviewFinding => finding !== null);
  const conflictFindings = (conflicts.data ?? []).map((item) => conflictFinding(companyCode, item));
  const certificationReviewFindings = (certification.data?.domains ?? [])
    .flatMap((domain) => certificationFindings(companyCode, domain));
  const postingFindings = (postingRoles.data?.rows ?? []).flatMap((row) => (
    row.cells
      .map((cell) => postingRoleFinding(companyCode, row, cell))
      .filter((finding): finding is ReviewFinding => finding !== null)
  ));
  const periodFinding = buildPeriodFinding(companyCode, hub.data);
  if (periodFinding) postingFindings.unshift(periodFinding);

  const refreshAll = () => {
    void hub.refetch();
    void conflicts.refetch();
    void certification.refetch();
    void postingRoles.refetch();
  };
  const refreshing = [hub, conflicts, certification, postingRoles].some((query) => query.isFetching);

  return (
    <PageFrame>
      <main className="flex flex-col gap-5 pb-10">
        <header className="rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Finance Settings · Review
              </p>
              <h1 className="mt-1 text-xl font-semibold">Review configuration</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {hub.data?.companyName ?? companyCode} ({companyCode}) · FY{scope.fiscalYear}
                {scope.period == null ? "" : ` · period ${scope.period}`}
              </p>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Backend readiness, conflicts, certification evidence, and posting checks are collected here.
                Settings pages remain focused on configuration.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={refreshAll}>
                <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
                Refresh
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/finance/setup/company/${encodeURIComponent(companyCode)}`}>Finance Settings</Link>
              </Button>
            </div>
          </div>
        </header>

        <QueryErrors
          errors={[
            hub.error,
            conflicts.error,
            certification.error,
            postingRoles.error,
          ]}
        />

        <ReadinessJourneyReview
          companyCode={companyCode}
          steps={hub.data?.journey ?? []}
          findings={journeyFindings}
        />

        <FindingsSection
          id="configuration-conflicts"
          icon={AlertTriangle}
          title="Configuration conflicts"
          description="Deterministic conflicts detected for this company and inherited parent scopes."
          findings={conflictFindings}
          emptyMessage="No configuration conflicts were detected."
        />

        <CertificationReview
          companyCode={companyCode}
          data={certification.data}
          findings={certificationReviewFindings}
        />

        <PostingChecksReview
          companyCode={companyCode}
          hub={hub.data}
          coverage={postingRoles.data}
          findings={postingFindings}
        />
      </main>
    </PageFrame>
  );
}

function ReadinessJourneyReview({ companyCode, steps, findings }: {
  companyCode: string;
  steps: NonNullable<ReturnType<typeof useCompanyHub>["data"]>["journey"];
  findings: ReviewFinding[];
}) {
  const findingByStep = new Map(findings.map((finding) => [
    finding.id.replace("journey:", ""),
    finding,
  ]));
  return (
    <section className="rounded-xl border bg-card" aria-labelledby="review-journey-title">
      <SectionHeader
        icon={ClipboardCheck}
        title="Readiness journey"
        description="Backend-evaluated foundation and posting prerequisites. Open the relevant setting for any incomplete step."
      />
      <ol className="divide-y">
        {steps.map((step) => {
          const finding = findingByStep.get(step.key);
          return (
            <li key={step.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              {step.state === "complete"
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                : <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{step.label}</p>
                <p className="text-xs text-muted-foreground">
                  {step.state.replaceAll("_", " ")}
                  {step.coveragePct == null ? "" : ` · ${step.coveragePct}% coverage`}
                  {step.conflictCount ? ` · ${step.conflictCount} conflict${step.conflictCount === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              {finding ? (
                <FindingAction finding={finding} />
              ) : (
                <Button asChild variant="ghost" size="sm">
                  <Link href={journeySettingsHref(companyCode, step.key)}>
                    View settings <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CertificationReview({ companyCode, data, findings }: {
  companyCode: string;
  data: ReturnType<typeof useCompanyCertificationReadiness>["data"];
  findings: ReviewFinding[];
}) {
  return (
    <section id="certification-review" className="scroll-mt-24 rounded-xl border bg-card">
      <SectionHeader
        icon={ShieldCheck}
        title="Certification"
        description="Certification and posting-gate evidence comes from deterministic backend services."
      />
      {data && (
        <div className="border-b px-5 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{data.status.replaceAll("_", " ")}</span>
          {" · "}{data.summary.passed}/{data.summary.total} checks passed
          {" · "}posting gate {data.rollout.postingGateActive ? "active" : "not active"}
          {" · "}rollout mode {data.rollout.mode}
        </div>
      )}
      <FindingsList
        findings={findings}
        emptyMessage="All certification checks currently pass."
      />
      {data?.certification.id && (
        <div className="border-t px-5 py-3 text-xs text-muted-foreground">
          Certification evidence {data.certification.fresh ? "is current" : "requires renewal after a material change"}.
          {" "}Evidence ID: <span className="font-mono">{data.certification.id}</span>
        </div>
      )}
      {!data && (
        <p className="p-5 text-sm text-muted-foreground">
          Certification evidence is unavailable for {companyCode}.
        </p>
      )}
    </section>
  );
}

function PostingChecksReview({ companyCode, hub, coverage, findings }: {
  companyCode: string;
  hub: ReturnType<typeof useCompanyHub>["data"];
  coverage: ReturnType<typeof usePostingRoleCoverage>["data"];
  findings: ReviewFinding[];
}) {
  return (
    <section id="posting-checks" className="scroll-mt-24 rounded-xl border bg-card">
      <SectionHeader
        icon={ShieldCheck}
        title="Posting checks"
        description="Period postability and required role-to-account resolution are evaluated by backend services."
      />
      <div className="border-b px-5 py-3 text-sm text-muted-foreground">
        Period: <span className="font-medium text-foreground">
          {hub?.periodPostability.chip.replaceAll("_", " ") ?? "unavailable"}
        </span>
        {" · "}Posting-role coverage: <span className="font-medium text-foreground">
          {coverage ? `${coverage.summary.resolvedCells}/${coverage.summary.requiredCells} resolved` : "unavailable"}
        </span>
        {hub?.governanceReadiness && (
          <>
            {" · "}Governance evidence:
            {" "}<span className="font-medium text-foreground">
              {hub.governanceReadiness.completedMandatoryTaskCount}/{hub.governanceReadiness.mandatoryTaskCount} mandatory tasks
            </span>
          </>
        )}
      </div>
      <FindingsList
        findings={findings}
        emptyMessage="The evaluated period is postable and all required posting roles resolve."
      />
      <div className="border-t px-5 py-3 text-xs text-muted-foreground">
        These results are informational UI projections. Posting authorization continues to use server-side gates.
        {" "}<Link
          className="font-medium text-primary hover:underline"
          href={`/workbench/finance/posting-role-coverage?scopeId=${encodeURIComponent(companyCode)}`}
        >
          Open full posting-role coverage
        </Link>
      </div>
    </section>
  );
}

function FindingsSection({ id, icon, title, description, findings, emptyMessage }: {
  id: string;
  icon: typeof AlertTriangle;
  title: string;
  description: string;
  findings: ReviewFinding[];
  emptyMessage: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border bg-card">
      <SectionHeader icon={icon} title={title} description={description} />
      <FindingsList findings={findings} emptyMessage={emptyMessage} />
    </section>
  );
}

function FindingsList({ findings, emptyMessage }: {
  findings: ReviewFinding[];
  emptyMessage: string;
}) {
  if (findings.length === 0) {
    return (
      <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        {emptyMessage}
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {findings.map((finding) => <FindingRow key={finding.id} finding={finding} />)}
    </ul>
  );
}

function FindingRow({ finding }: { finding: ReviewFinding }) {
  const Icon = finding.severity === "blocker"
    ? AlertCircle
    : finding.severity === "warning"
      ? AlertTriangle
      : Info;
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
      <Icon className={cn(
        "mt-0.5 h-4 w-4 shrink-0",
        finding.severity === "blocker"
          ? "text-destructive"
          : finding.severity === "warning"
            ? "text-amber-600"
            : "text-blue-600",
      )} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{finding.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{finding.message}</p>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{finding.reasonCode}</p>
      </div>
      <FindingAction finding={finding} />
    </li>
  );
}

function FindingAction({ finding }: { finding: ReviewFinding }) {
  return (
    <Button asChild variant="outline" size="sm" className="shrink-0">
      <Link href={finding.actionHref}>
        {finding.actionLabel}
        <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Link>
    </Button>
  );
}

function SectionHeader({ icon: Icon, title, description }: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b p-5">
      <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" />
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function QueryErrors({ errors }: { errors: Array<unknown> }) {
  const messages = errors.filter(Boolean).map((error) => (
    error instanceof Error ? error.message : String(error)
  ));
  if (!messages.length) return null;
  return (
    <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <h2 className="text-sm font-semibold text-destructive">Some Review data could not be loaded</h2>
      {messages.map((message) => <p key={message} className="mt-1 text-xs text-destructive">{message}</p>)}
    </section>
  );
}

function buildPeriodFinding(
  companyCode: string,
  hub: ReturnType<typeof useCompanyHub>["data"],
): ReviewFinding | null {
  const postability = hub?.periodPostability;
  if (!postability || postability.chip === "postable") return null;
  return {
    id: "posting:period",
    source: "posting",
    severity: "blocker",
    title: `The evaluated period is ${postability.chip.replaceAll("_", " ")}`,
    message: postability.reasonText
      ?? `Review the fiscal calendar and period settings for reason ${postability.reasonCode}.`,
    reasonCode: postability.reasonCode,
    actionLabel: "Open fiscal calendar settings",
    actionHref: journeySettingsHref(companyCode, "fiscal_period"),
  };
}

function EmptyReview({ title, message, href, action }: {
  title: string;
  message: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-10 text-center">
      <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="mt-3 font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button asChild className="mt-4"><Link href={href}>{action}</Link></Button>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-40 rounded-xl" />
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-60 rounded-xl" />
      ))}
    </div>
  );
}
