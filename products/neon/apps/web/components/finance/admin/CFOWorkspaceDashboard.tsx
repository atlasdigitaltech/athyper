"use client";

// components/finance/admin/CFOWorkspaceDashboard.tsx
//
// CFO Workspace — unified view of pack readiness, certification pipeline,
// close completion, distribution tracking, and blocking analysis.
// Answers: "Is the pack ready? Can I certify? What's blocking publication?"

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  Package,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  usePackReadiness,
  usePackDelta,
  useExecutiveBrief,
  useReadinessTrend,
  type PackReadinessParams,
  type PackReadinessFullDTO,
  type PackDeltaDTO,
} from "@/lib/finance/use-pack-readiness";
import {
  useCommentary,
  useActionItems,
  useActionItemMutations,
  useDecisionLog,
  useRecordDecision,
  useCarryForward,
} from "@/lib/finance/use-cfo-actions";
import { ExecutiveBriefingCard } from "./ExecutiveBriefingCard";
import { ReadinessTrendChart } from "./ReadinessTrendChart";
import { MaterialChangesPanel } from "./MaterialChangesPanel";
import { ExecutiveNotesPanel } from "./ExecutiveNotesPanel";
import { AttentionTrackerPanel } from "./AttentionTrackerPanel";
import { DecisionLogPanel } from "./DecisionLogPanel";
import { CarryForwardRisksPanel } from "./CarryForwardRisksPanel";
import { ReviewPackAssembly } from "./ReviewPackAssembly";
import { ReviewPackExport } from "./ReviewPackExport";
import {
  useReviewPack,
  useReviewSnapshots,
  useReviewSnapshotMutations,
} from "@/lib/finance/use-review-pack";
import {
  useSnapshotDiff,
  useTraceability,
  useAttestations,
  useRecordAttestation,
} from "@/lib/finance/use-review-governance";
import { SnapshotDiffPanel } from "./SnapshotDiffPanel";
import { AssuranceTraceabilityPanel } from "./AssuranceTraceabilityPanel";
import { ReviewAttestationPanel } from "./ReviewAttestationPanel";
import {
  useEvidenceRequests,
  useEvidenceRequestMutations,
  useEvidenceBundles,
  useEvidenceBundleDetail,
  useEvidenceBundleMutations,
} from "@/lib/finance/use-assurance-hub";
import { EvidenceRequestPanel } from "./EvidenceRequestPanel";
import { EvidenceBundlePanel } from "./EvidenceBundlePanel";
import {
  useControlEffectiveness,
  useChronicIssues,
  useAssuranceScorecard,
  useAssuranceWorkload,
} from "@/lib/finance/use-assurance-analytics";
import { ControlEffectivenessPanel } from "./ControlEffectivenessPanel";
import { AssuranceScorecardPanel } from "./AssuranceScorecardPanel";
import {
  useControlTargets,
  useControlBenchmark,
  usePolicyRecommendations,
  useTargetMutations,
} from "@/lib/finance/use-control-benchmarking";
import { ControlObjectivesPanel } from "./ControlObjectivesPanel";
import {
  useControlPrograms,
  useProgramDetail,
  useProgramImpact,
  useProgramMutations,
} from "@/lib/finance/use-control-programs";
import { RemediationPortfolioPanel } from "./RemediationPortfolioPanel";
import {
  useProgramProposals,
  useEffectivenessLearning,
  useOptimizationSummary,
  useProposalActions,
} from "@/lib/finance/use-control-optimization";
import ControlOptimizationPanel from "./ControlOptimizationPanel";
import {
  useControlMemory,
  useGovernancePathways,
  useKnowledgeSummary,
} from "@/lib/finance/use-governance-knowledge";
import GovernanceKnowledgePanel from "./GovernanceKnowledgePanel";
import { GovernanceCopilot } from "./GovernanceCopilot";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CFOWorkspaceDashboardProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CFOWorkspaceDashboard({
  entityCode,
  fiscalYear,
  periodNumber,
}: CFOWorkspaceDashboardProps) {
  const params: PackReadinessParams = { entityCode, fiscalYear, periodNumber };

  const { data, loading, error, refresh } = usePackReadiness(params);
  const { delta, loading: deltaLoading } = usePackDelta(params);
  const { brief, loading: briefLoading } = useExecutiveBrief(params);
  const { trend, loading: trendLoading } = useReadinessTrend({ entityCode, fiscalYear });

  // Phase 12: CFO Action Workspace hooks
  const packId = data?.pack?.id ?? null;
  const commentary = useCommentary(
    packId ? "pack_instance" : null,
    packId,
  );
  const actionItems = useActionItems({ entityCode, fiscalYear, periodNumber });
  const actionMutations = useActionItemMutations(actionItems.refresh);
  const decisionLog = useDecisionLog({ entityCode, fiscalYear, periodNumber });
  const { record: recordDecision, loading: recordingDecision } = useRecordDecision(decisionLog.refresh);
  const carryForward = useCarryForward({ entityCode, targetFy: fiscalYear, targetPeriod: periodNumber });

  // Phase 13: Review Pack & Board Reporting hooks
  const reviewPack = useReviewPack(params);
  const reviewSnapshots = useReviewSnapshots(params);
  const reviewMutations = useReviewSnapshotMutations(reviewSnapshots.refresh);

  // Phase 14: Review Governance hooks
  const [diffBaseId, setDiffBaseId] = useState<string | null>(null);
  const [diffCompareId, setDiffCompareId] = useState<string | null>(null);
  const snapshotDiff = useSnapshotDiff(diffBaseId, diffCompareId);
  const traceability = useTraceability(entityCode, fiscalYear, periodNumber);
  const latestSnapshotId = reviewSnapshots.snapshots[0]?.id ?? null;
  const attestations = useAttestations(
    latestSnapshotId
      ? { targetKind: "review_snapshot", targetId: latestSnapshotId, entityCode, fiscalYear, periodNumber }
      : { entityCode, fiscalYear, periodNumber },
  );
  const { record: recordAttestation, loading: attestationRecording } = useRecordAttestation(attestations.refresh);

  // Phase 15: Assurance Hub hooks
  const evidenceRequests = useEvidenceRequests({ entityCode, fiscalYear, periodNumber });
  const evidenceRequestMutations = useEvidenceRequestMutations(evidenceRequests.refresh);
  const evidenceBundles = useEvidenceBundles(params);
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const bundleDetail = useEvidenceBundleDetail(selectedBundleId);
  const bundleMutations = useEvidenceBundleMutations(() => {
    evidenceBundles.refresh();
    if (selectedBundleId) bundleDetail.refresh();
  });

  // Phase 16: Assurance Analytics hooks
  const controlEffectiveness = useControlEffectiveness({ entityCode, fiscalYear });
  const chronicIssues = useChronicIssues(entityCode);
  const assuranceScorecard = useAssuranceScorecard({ entityCode, fiscalYear });
  const assuranceWorkload = useAssuranceWorkload({ entityCode, fiscalYear, periodNumber });

  // Phase 17: Control Benchmarking hooks
  const controlTargets = useControlTargets(entityCode);
  const controlBenchmark = useControlBenchmark({ entityCode, fiscalYear, periodNumber });
  const policyRecommendations = usePolicyRecommendations({ entityCode, fiscalYear });
  const targetMutations = useTargetMutations(() => {
    controlTargets.refresh();
    controlBenchmark.refresh();
    policyRecommendations.refresh();
  });

  // Phase 18: Control Program Management hooks
  const controlPrograms = useControlPrograms({ entityCode });
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const programDetail = useProgramDetail(selectedProgramId);
  const programImpact = useProgramImpact(selectedProgramId);
  const programMutations = useProgramMutations(() => {
    controlPrograms.refresh();
    if (selectedProgramId) {
      programDetail.refresh();
      programImpact.refresh();
    }
  });

  // Phase 19: Autonomous Control Optimization hooks
  const optimizationFilters = { entityCode };
  const programProposals = useProgramProposals(optimizationFilters);
  const effectivenessLearning = useEffectivenessLearning(optimizationFilters);
  const optimizationSummary = useOptimizationSummary(optimizationFilters);
  const proposalActions = useProposalActions(() => {
    programProposals.refresh();
    optimizationSummary.refresh();
    controlPrograms.refresh();
  });

  // Phase 20: Governance Knowledge Graph hooks
  const knowledgeFilters = { entityCode };
  const controlMemory = useControlMemory(knowledgeFilters);
  const governancePathways = useGovernancePathways(knowledgeFilters);
  const knowledgeSummary = useKnowledgeSummary(knowledgeFilters);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading CFO workspace...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={refresh}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              CFO Workspace — {entityCode} P{periodNumber} FY{fiscalYear}
            </h2>
            <p className="text-sm text-muted-foreground">
              Pack readiness and release pipeline
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Readiness Score + Pipeline Overview */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <ReadinessScoreCard readiness={data.readiness} />
          <PipelinePhaseCard
            icon={Clock}
            label="Close"
            status={data.readiness.phases.close.status}
            value={`${data.readiness.phases.close.pct}%`}
            active={data.readiness.phase === "close"}
          />
          <PipelinePhaseCard
            icon={Package}
            label="Pack"
            status={data.readiness.phases.packGeneration.status}
            value={data.pack ? `${data.readiness.phases.packGeneration.pct}%` : "—"}
            active={data.readiness.phase === "packGeneration"}
          />
          <PipelinePhaseCard
            icon={ShieldCheck}
            label="Certification"
            status={data.readiness.phases.certification.status}
            value={formatCertStep(data.readiness.phases.certification.step)}
            active={data.readiness.phase === "certification"}
          />
          <PipelinePhaseCard
            icon={Send}
            label="Distribution"
            status={data.readiness.phases.distribution.status}
            value={data.distribution ? `${data.distribution.sent_count} sent` : "—"}
            active={data.readiness.phase === "distribution"}
          />
        </div>

        {/* Executive Briefing — narrative summary + attention items */}
        <ExecutiveBriefingCard brief={brief} loading={briefLoading} />

        {/* Blockers + Next Action */}
        {data.readiness.blockers.length > 0 && (
          <BlockersCard blockers={data.readiness.blockers} nextAction={data.readiness.nextAction} />
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Certification Pipeline */}
          <CertificationPipelineCard certification={data.certification} pack={data.pack} />

          {/* Clean Close Assessment */}
          <CleanCloseCard cleanClose={data.cleanClose} overrides={data.overrides} />
        </div>

        {/* Distribution + Material Changes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DistributionCard distribution={data.distribution} />
          <MaterialChangesPanel delta={delta} loading={deltaLoading} />
        </div>

        {/* Cross-period readiness trend */}
        <ReadinessTrendChart trend={trend} loading={trendLoading} currentPeriod={periodNumber} />

        {/* Phase 12: CFO Action Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Executive Notes */}
          <ExecutiveNotesPanel
            items={commentary.items}
            loading={commentary.loading}
            saving={commentary.saving}
            onSave={commentary.save}
          />

          {/* Attention Tracker */}
          <AttentionTrackerPanel
            items={actionItems.items}
            loading={actionItems.loading}
            mutationLoading={actionMutations.loading}
            onCreate={actionMutations.create}
            onUpdateStatus={actionMutations.updateStatus}
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Decision Log */}
          <DecisionLogPanel
            decisions={decisionLog.decisions}
            loading={decisionLog.loading}
            onRecord={recordDecision}
            recordLoading={recordingDecision}
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
          />

          {/* Carry-Forward Risks */}
          <CarryForwardRisksPanel
            items={carryForward.items}
            loading={carryForward.loading}
            resolving={carryForward.resolving}
            onResolve={carryForward.resolve}
          />
        </div>

        {/* Pending Recommendations */}
        {data.pendingRecommendations > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800">
                {data.pendingRecommendations} pending close recommendation(s) require attention.
              </span>
            </CardContent>
          </Card>
        )}

        {/* Phase 13: Review Pack & Board Reporting */}
        <ReviewPackAssembly
          data={reviewPack.data}
          loading={reviewPack.loading}
          error={reviewPack.error}
          onRefresh={reviewPack.refresh}
          snapshots={reviewSnapshots.snapshots}
          snapshotsLoading={reviewSnapshots.loading}
          onCaptureSnapshot={reviewMutations.capture}
          onAdvanceStatus={reviewMutations.advanceStatus}
          mutationLoading={reviewMutations.loading}
          entityCode={entityCode}
          fiscalYear={fiscalYear}
          periodNumber={periodNumber}
        />
        <ReviewPackExport data={reviewPack.data} />

        {/* Phase 14: Review Governance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SnapshotDiffPanel
            snapshots={reviewSnapshots.snapshots}
            diff={snapshotDiff.diff}
            loading={snapshotDiff.loading}
            error={snapshotDiff.error}
            baseId={diffBaseId}
            compareId={diffCompareId}
            onSelectBase={setDiffBaseId}
            onSelectCompare={setDiffCompareId}
          />
          <AssuranceTraceabilityPanel
            provenance={traceability.provenance}
            loading={traceability.loading}
            error={traceability.error}
            onRefresh={traceability.refresh}
          />
        </div>
        <ReviewAttestationPanel
          attestations={attestations.attestations}
          loading={attestations.loading}
          error={attestations.error}
          onRefresh={attestations.refresh}
          onRecord={recordAttestation}
          recordLoading={attestationRecording}
          entityCode={entityCode}
          fiscalYear={fiscalYear}
          periodNumber={periodNumber}
          targetKind={latestSnapshotId ? "review_snapshot" : undefined}
          targetId={latestSnapshotId ?? undefined}
        />

        {/* Phase 15: Assurance Hub */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EvidenceRequestPanel
            requests={evidenceRequests.requests}
            loading={evidenceRequests.loading}
            error={evidenceRequests.error}
            onRefresh={evidenceRequests.refresh}
            onCreate={evidenceRequestMutations.create}
            onUpdateStatus={evidenceRequestMutations.updateStatus}
            mutationLoading={evidenceRequestMutations.loading}
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
          />
          <EvidenceBundlePanel
            bundles={evidenceBundles.bundles}
            loading={evidenceBundles.loading}
            error={evidenceBundles.error}
            onRefresh={evidenceBundles.refresh}
            selectedBundleDetail={bundleDetail.bundle}
            detailLoading={bundleDetail.loading}
            onSelectBundle={setSelectedBundleId}
            onCreateBundle={bundleMutations.createBundle}
            onAddItems={bundleMutations.addItems}
            onRemoveItem={bundleMutations.removeItem}
            onSeal={bundleMutations.sealBundle}
            onExpire={bundleMutations.expireBundle}
            onDistribute={bundleMutations.distribute}
            mutationLoading={bundleMutations.loading}
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
          />
        </div>

        {/* Phase 16: Assurance Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ControlEffectivenessPanel
            periods={controlEffectiveness.periods}
            chronicIssues={chronicIssues.issues}
            loading={controlEffectiveness.loading || chronicIssues.loading}
            error={controlEffectiveness.error || chronicIssues.error}
            onRefresh={() => { controlEffectiveness.refresh(); chronicIssues.refresh(); }}
          />
          <AssuranceScorecardPanel
            scorecards={assuranceScorecard.scorecards}
            workloadSummary={assuranceWorkload.summary}
            loading={assuranceScorecard.loading || assuranceWorkload.loading}
            error={assuranceScorecard.error || assuranceWorkload.error}
            onRefresh={() => { assuranceScorecard.refresh(); assuranceWorkload.refresh(); }}
          />
        </div>

        {/* Phase 17: Control Benchmarking & Policy Tuning */}
        <ControlObjectivesPanel
          benchmarks={controlBenchmark.benchmarks}
          recommendations={policyRecommendations.recommendations}
          targets={controlTargets.targets}
          loading={controlBenchmark.loading || policyRecommendations.loading || controlTargets.loading}
          error={controlBenchmark.error || policyRecommendations.error || controlTargets.error}
          onRefresh={() => { controlBenchmark.refresh(); policyRecommendations.refresh(); controlTargets.refresh(); }}
          onSeedDefaults={() => targetMutations.seedDefaults(entityCode)}
          seedLoading={targetMutations.loading}
        />

        {/* Phase 18: Control Program Management */}
        <RemediationPortfolioPanel
          programs={controlPrograms.programs}
          selectedDetail={programDetail.program}
          impact={programImpact.impact}
          loading={controlPrograms.loading}
          detailLoading={programDetail.loading}
          error={controlPrograms.error}
          onRefresh={controlPrograms.refresh}
          onSelectProgram={setSelectedProgramId}
          onCreate={programMutations.createProgram}
          onUpdateStatus={programMutations.updateStatus}
          onAddMilestone={programMutations.addMilestone}
          mutationLoading={programMutations.loading}
          entityCode={entityCode}
          fiscalYear={fiscalYear}
        />

        {/* Phase 19: Autonomous Control Optimization */}
        <ControlOptimizationPanel
          proposals={programProposals.proposals}
          insights={effectivenessLearning.insights}
          summary={optimizationSummary.summary}
          loading={programProposals.loading || effectivenessLearning.loading || optimizationSummary.loading}
          error={programProposals.error || effectivenessLearning.error || optimizationSummary.error}
          onRefresh={() => {
            programProposals.refresh();
            effectivenessLearning.refresh();
            optimizationSummary.refresh();
          }}
          onAcceptProposal={(fingerprint) => proposalActions.acceptProposal(entityCode, fingerprint)}
          onDismissProposal={(fingerprint) => proposalActions.dismissProposal(entityCode, fingerprint)}
          actionLoading={proposalActions.loading}
        />

        {/* Phase 20: Governance Knowledge Graph */}
        <GovernanceKnowledgePanel
          summary={knowledgeSummary.summary}
          memory={controlMemory.memory}
          pathways={governancePathways.data?.pathways ?? []}
          pathwayStats={governancePathways.data?.stats ?? null}
          loading={knowledgeSummary.loading || controlMemory.loading || governancePathways.loading}
          error={knowledgeSummary.error || controlMemory.error || governancePathways.error}
          onRefresh={() => {
            knowledgeSummary.refresh();
            controlMemory.refresh();
            governancePathways.refresh();
          }}
        />

        {/* Phase 21: Governance Copilot & Explainable Action Assistant */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Governance Copilot</CardTitle>
            <CardDescription className="text-xs">
              Explainable Q&A over the governance knowledge graph
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[600px] p-0">
            <GovernanceCopilot entityCode={entityCode} />
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Readiness Score Card
// ---------------------------------------------------------------------------

function ReadinessScoreCard({ readiness }: { readiness: PackReadinessFullDTO["readiness"] }) {
  const scoreColor =
    readiness.score >= 80 ? "text-emerald-600" :
    readiness.score >= 50 ? "text-amber-600" :
    "text-red-600";

  const bgColor =
    readiness.score >= 80 ? "bg-emerald-50 border-emerald-200" :
    readiness.score >= 50 ? "bg-amber-50 border-amber-200" :
    "bg-red-50 border-red-200";

  return (
    <Card className={bgColor}>
      <CardContent className="pt-4 pb-3 text-center">
        <div className={`text-3xl font-bold ${scoreColor}`}>{readiness.score}%</div>
        <div className="text-xs text-muted-foreground mt-1">Pack Readiness</div>
        <div className="text-xs mt-2 font-medium">{readiness.nextAction}</div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Phase Card
// ---------------------------------------------------------------------------

function PipelinePhaseCard({
  icon: Icon,
  label,
  status,
  value,
  active,
}: {
  icon: typeof Clock;
  label: string;
  status: string;
  value: string;
  active: boolean;
}) {
  return (
    <Card className={active ? "ring-2 ring-blue-400" : ""}>
      <CardContent className="pt-4 pb-3 text-center">
        <Icon className={`h-5 w-5 mx-auto mb-1 ${active ? "text-blue-600" : "text-muted-foreground"}`} />
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold mt-1">{value}</div>
        <Badge
          variant={
            status === "COMPLETED" || status === "PUBLISHED" || status === "RELEASED" || status === "CERTIFIED"
              ? "default"
              : status === "NOT_STARTED" || status === "NOT_GENERATED"
                ? "outline"
                : "secondary"
          }
          className="text-[10px] mt-1"
        >
          {formatStatus(status)}
        </Badge>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Blockers Card
// ---------------------------------------------------------------------------

function BlockersCard({ blockers, nextAction }: { blockers: string[]; nextAction: string }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-600" />
          Blockers ({blockers.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <ul className="space-y-1">
          {blockers.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-red-800">
              <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-2 pt-2 border-t border-red-200 flex items-center gap-1.5">
          <ArrowRight className="h-3 w-3 text-red-600" />
          <span className="text-xs font-medium text-red-800">{nextAction}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Certification Pipeline Card
// ---------------------------------------------------------------------------

function CertificationPipelineCard({
  certification,
  pack,
}: {
  certification: PackReadinessFullDTO["certification"];
  pack: PackReadinessFullDTO["pack"];
}) {
  const steps = [
    { key: "PENDING", label: "Prepared", actor: certification?.prepared_by_name, at: certification?.prepared_at },
    { key: "IN_REVIEW", label: "In Review", actor: null, at: null },
    { key: "REVIEWED", label: "Reviewed", actor: certification?.reviewed_by_name, at: certification?.reviewed_at },
    { key: "APPROVED", label: "Approved", actor: certification?.approved_by_name, at: certification?.approved_at },
    { key: "CERTIFIED", label: "Certified", actor: certification?.certified_by_name, at: certification?.certified_at },
  ];

  const statusOrder = ["PENDING", "IN_REVIEW", "REVIEWED", "APPROVED", "CERTIFIED"];
  const currentIdx = certification
    ? statusOrder.indexOf(certification.certification_status)
    : -1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Certification Pipeline
        </CardTitle>
        <CardDescription className="text-xs">
          {pack ? `${pack.pack_name} — ${pack.status}` : "No pack generated"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!certification ? (
          <p className="text-xs text-muted-foreground py-2">No certification started yet.</p>
        ) : (
          <div className="space-y-2">
            {steps.map((step, i) => {
              const completed = i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div key={step.key} className="flex items-center gap-3">
                  {completed ? (
                    <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${isCurrent ? "text-blue-600" : "text-emerald-500"}`} />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs ${completed ? "font-medium" : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                    {step.actor && (
                      <span className="text-[10px] text-muted-foreground ml-2">
                        by {step.actor}
                      </span>
                    )}
                  </div>
                  {step.at && (
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {new Date(step.at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Clean Close Card
// ---------------------------------------------------------------------------

function CleanCloseCard({
  cleanClose,
  overrides,
}: {
  cleanClose: PackReadinessFullDTO["cleanClose"];
  overrides: PackReadinessFullDTO["overrides"];
}) {
  if (!cleanClose || !cleanClose.evaluated) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Clean Close Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground py-2">
            Close cycle not yet evaluated. Assessment requires an active close run.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cleanClose.is_clean ? "border-emerald-200" : "border-amber-200"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {cleanClose.is_clean ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          )}
          Clean Close Assessment
          <Badge variant={cleanClose.is_clean ? "default" : "destructive"} className="text-[10px] ml-auto">
            {cleanClose.is_clean ? "CLEAN" : "NOT CLEAN"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <MetricRow label="Readiness" value={`${cleanClose.readiness_score}%`} threshold={`≥ ${cleanClose.policy.min_readiness}%`} pass={cleanClose.readiness_score >= cleanClose.policy.min_readiness} />
          <MetricRow label="Overrides" value={String(cleanClose.override_count)} threshold={`≤ ${cleanClose.policy.max_overrides}`} pass={cleanClose.override_count <= cleanClose.policy.max_overrides} />
          <MetricRow label="Override Impact" value={`${Number(cleanClose.override_impact).toLocaleString()}`} threshold={cleanClose.policy.max_impact != null ? `≤ ${Number(cleanClose.policy.max_impact).toLocaleString()}` : "No limit"} pass={cleanClose.policy.max_impact == null || Number(cleanClose.override_impact) <= Number(cleanClose.policy.max_impact)} />
          <MetricRow label="Waived Tasks" value={String(cleanClose.waived_task_count)} threshold="= 0" pass={cleanClose.waived_task_count === 0} />
        </div>

        {cleanClose.disqualification_reasons.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <p className="text-[10px] font-medium text-amber-800 mb-1">Disqualification reasons:</p>
            {cleanClose.disqualification_reasons.map((r, i) => (
              <p key={i} className="text-[10px] text-amber-700">• {r}</p>
            ))}
          </div>
        )}

        {cleanClose.requires_exception_signoff && (
          <div className="mt-1 rounded bg-amber-100 px-2 py-1 text-[10px] text-amber-800 font-medium">
            Exception sign-off required before release
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value, threshold, pass }: { label: string; value: string; threshold: string; pass: boolean }) {
  return (
    <div className="flex items-center justify-between p-1.5 rounded bg-gray-50">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{value}</span>
        <Tooltip>
          <TooltipTrigger>
            {pass ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
          </TooltipTrigger>
          <TooltipContent className="text-[10px]">Policy: {threshold}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution Card
// ---------------------------------------------------------------------------

function DistributionCard({ distribution }: { distribution: PackReadinessFullDTO["distribution"] }) {
  const noDistributions = !distribution || Number(distribution.total_distributions) === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Send className="h-4 w-4" />
          Distribution Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {noDistributions ? (
          <p className="text-xs text-muted-foreground py-2">No distributions created yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatBox icon={FileText} label="Total" value={Number(distribution!.total_distributions)} />
              <StatBox icon={Send} label="Sent" value={Number(distribution!.sent_count)} />
              <StatBox icon={Eye} label="Viewed" value={Number(distribution!.total_viewed)} />
              <StatBox icon={Download} label="Downloaded" value={Number(distribution!.total_downloaded)} />
            </div>
            {distribution!.last_distributed_at && (
              <p className="text-[10px] text-muted-foreground">
                Last distributed: {new Date(distribution!.last_distributed_at).toLocaleString()}
              </p>
            )}
            {Number(distribution!.total_recipients) > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Delivery rate: </span>
                <span className="font-medium">
                  {Math.round((Number(distribution!.total_delivered) / Number(distribution!.total_recipients)) * 100)}%
                </span>
                <span className="text-muted-foreground ml-1">
                  ({distribution!.total_delivered}/{distribution!.total_recipients} recipients)
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded bg-gray-50">
      <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delta Analysis Card
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCertStep(step: string): string {
  switch (step) {
    case "CERTIFIED": return "Done";
    case "APPROVED": return "Approved";
    case "REVIEWED": return "Reviewed";
    case "IN_REVIEW": return "In Review";
    case "PENDING": return "Pending";
    default: return "—";
  }
}
