"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  ListChecks,
  FileCheck2,
  Send,
  History,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ReleaseDashboard } from "@/components/finance/ReleaseDashboard";
import { ReleaseDetail } from "@/components/finance/ReleaseDetail";
import { ReleaseTimeline } from "@/components/finance/ReleaseTimeline";
import { PackGovernance } from "@/components/finance/PackGovernance";
import {
  useReleaseDashboard,
  useReleaseDetailWithPanels,
  useReleaseKPIs,
} from "@/lib/finance/use-releases";
import { useReleaseCommands } from "@/lib/finance/use-release-commands";
import {
  usePackCertification,
  usePackDistributions,
  usePackActivity,
} from "@/lib/finance/use-pack-governance";

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

const CONTROL_TOWER_TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "release-detail", label: "Release Detail", icon: ListChecks },
  { id: "certification", label: "Certification", icon: FileCheck2 },
  { id: "distribution", label: "Distribution", icon: Send },
  { id: "audit-timeline", label: "Audit Timeline", icon: History },
] as const;

type TabId = (typeof CONTROL_TOWER_TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReleaseControlTowerPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [selectedPackInstanceId, setSelectedPackInstanceId] = useState<string | null>(null);

  // Data hooks
  const dashboard = useReleaseDashboard();
  const kpis = useReleaseKPIs();
  const panels = useReleaseDetailWithPanels(selectedReleaseId);
  const commands = useReleaseCommands();
  const certification = usePackCertification(selectedPackInstanceId);
  const distributions = usePackDistributions(selectedPackInstanceId);
  const activity = usePackActivity(selectedPackInstanceId);

  const handleSelectRelease = (releaseId: string) => {
    setSelectedReleaseId(releaseId);
    // Extract packInstanceId from dashboard data if available
    const release = dashboard.releases.find((r) => r.releaseCode === releaseId);
    if (release && "packInstanceId" in release) {
      setSelectedPackInstanceId((release as Record<string, unknown>).packInstanceId as string ?? null);
    }
    setActiveTab("release-detail");
  };

  const hasRelease = !!selectedReleaseId;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 px-4 py-2 backdrop-blur">
        <h1 className="text-lg font-semibold">Release Control Tower</h1>
        <p className="text-xs text-muted-foreground">
          Governed release orchestration for financial data
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-1">
          {CONTROL_TOWER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const disabled = !hasRelease && tab.id !== "overview";

            return (
              <button
                key={tab.id}
                onClick={() => !disabled && setActiveTab(tab.id)}
                disabled={disabled}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : disabled
                      ? "cursor-not-allowed text-muted-foreground/50"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "overview" && (
          <ReleaseDashboard
            releases={dashboard.releases}
            kpis={kpis.kpis}
            loading={dashboard.loading}
            onSelectRelease={handleSelectRelease}
            onRefresh={dashboard.refresh}
          />
        )}

        {activeTab === "release-detail" && panels.detail.release && (
          <ReleaseDetail
            release={panels.detail.release}
            decisions={panels.decisions.decisions}
            overrides={panels.overrides.overrides}
            manifestItems={panels.manifest.manifestItems}
            notifications={panels.notifications.notifications}
            sla={panels.sla.sla}
            onBack={() => setActiveTab("overview")}
            onRefresh={panels.refreshAll}
            onMarkReady={() => commands.markReady(selectedReleaseId!)}
            onRelease={() => commands.release(selectedReleaseId!)}
            onCancel={(reason) => commands.cancel(selectedReleaseId!, reason)}
            onExceptionSignoff={(notes) => commands.exceptionSignoff(selectedReleaseId!, notes)}
            onVerifyIntegrity={() => commands.verifyIntegrity(selectedReleaseId!)}
            commanding={commands.executing}
          />
        )}

        {activeTab === "certification" && (
          <PackGovernance
            certification={certification.certification}
            distributions={distributions.distributions}
            activities={activity.activities}
            onAdvanceCertification={(targetStatus, notes) =>
              certification.advanceCertification({ targetStatus, notes })
            }
            certificationUpdating={certification.advancing}
          />
        )}

        {activeTab === "distribution" && (
          <PackGovernance
            certification={certification.certification}
            distributions={distributions.distributions}
            activities={activity.activities}
          />
        )}

        {activeTab === "audit-timeline" && (
          <ReleaseTimeline
            events={panels.timeline.timeline}
            loading={panels.timeline.loading}
            onRefresh={panels.timeline.refresh}
          />
        )}

        {/* Empty state when no release selected */}
        {!hasRelease && activeTab !== "overview" && (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <p>Select a release from the Overview tab to view details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
