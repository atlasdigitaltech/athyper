"use client";

import { useState } from "react";
import {
  Activity,
  Clock,
  Shield,
  Archive,
  FileCheck,
  Gauge,
  Fingerprint,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { GovernanceDashboard } from "@/components/mesh/governance/GovernanceDashboard";
import { RetentionPolicyExplorer } from "@/components/governance/RetentionPolicyExplorer";
import { LegalHoldConsole } from "@/components/governance/LegalHoldConsole";
import { ArchiveLifecycleMonitor } from "@/components/governance/ArchiveLifecycleMonitor";
import { PurgeCertificateRegister } from "@/components/governance/PurgeCertificateRegister";
import { QuotaUtilizationDashboard } from "@/components/governance/QuotaUtilizationDashboard";
import { PrivacyFieldInventory } from "@/components/governance/PrivacyFieldInventory";

const GOVERNANCE_TABS = [
  { id: "overview", label: "Pipeline Health", icon: Activity },
  { id: "retention", label: "Retention Explorer", icon: Clock },
  { id: "legal-holds", label: "Legal Holds", icon: Shield },
  { id: "archive", label: "Archive Lifecycle", icon: Archive },
  { id: "purge", label: "Purge Certificates", icon: FileCheck },
  { id: "quotas", label: "Quotas", icon: Gauge },
  { id: "privacy", label: "Privacy / DSAR", icon: Fingerprint },
] as const;

type TabId = (typeof GOVERNANCE_TABS)[number]["id"];

export default function GovernancePage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-1">
          {GOVERNANCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
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
        {activeTab === "overview" && <GovernanceDashboard />}
        {activeTab === "retention" && <RetentionPolicyExplorer />}
        {activeTab === "legal-holds" && <LegalHoldConsole />}
        {activeTab === "archive" && <ArchiveLifecycleMonitor />}
        {activeTab === "purge" && <PurgeCertificateRegister />}
        {activeTab === "quotas" && <QuotaUtilizationDashboard />}
        {activeTab === "privacy" && <PrivacyFieldInventory />}
      </div>
    </div>
  );
}
