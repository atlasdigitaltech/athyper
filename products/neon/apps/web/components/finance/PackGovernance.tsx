"use client";

// components/finance/PackGovernance.tsx
//
// Governance panel for a pack instance: certification sign-off chain,
// distribution tracking, and activity timeline.

import { useState } from "react";
import {
  Badge,
  Card,
  Button,
} from "@neon/ui";
import {
  CheckCircle2,
  Clock,
  Eye,
  Download,
  Send,
  ShieldCheck,
  UserCheck,
  FileSearch,
  AlertTriangle,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  PackCertificationDTO,
  CertificationStatus,
  PackDistributionDTO,
  PackActivityDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PackGovernanceProps {
  certification: PackCertificationDTO | null;
  distributions: PackDistributionDTO[];
  activities: PackActivityDTO[];
  onAdvanceCertification?: (
    targetStatus: CertificationStatus,
    notes?: string,
  ) => void;
  certificationUpdating?: boolean;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const CERT_STATUS_CONFIG: Record<CertificationStatus, {
  color: string;
  icon: typeof CheckCircle2;
  label: string;
}> = {
  PENDING: { color: "bg-slate-100 text-slate-700", icon: Clock, label: "Pending" },
  IN_REVIEW: { color: "bg-blue-100 text-blue-700", icon: FileSearch, label: "In Review" },
  REVIEWED: { color: "bg-indigo-100 text-indigo-700", icon: UserCheck, label: "Reviewed" },
  APPROVED: { color: "bg-green-100 text-green-700", icon: CheckCircle2, label: "Approved" },
  CERTIFIED: { color: "bg-emerald-100 text-emerald-700", icon: ShieldCheck, label: "Certified" },
  REJECTED: { color: "bg-red-100 text-red-700", icon: XCircle, label: "Rejected" },
  INVALIDATED: { color: "bg-orange-100 text-orange-700", icon: XCircle, label: "Invalidated" },
};

const CERT_NEXT_STATUS: Partial<Record<CertificationStatus, CertificationStatus>> = {
  PENDING: "IN_REVIEW",
  IN_REVIEW: "REVIEWED",
  REVIEWED: "APPROVED",
  APPROVED: "CERTIFIED",
};

const CERT_ACTION_LABEL: Partial<Record<CertificationStatus, string>> = {
  PENDING: "Start Review",
  IN_REVIEW: "Mark Reviewed",
  REVIEWED: "Approve",
  APPROVED: "Certify",
};

const ACTIVITY_ICONS: Partial<Record<string, typeof CheckCircle2>> = {
  PACK_GENERATED: CheckCircle2,
  REVIEW_STARTED: FileSearch,
  REVIEW_COMPLETED: UserCheck,
  APPROVAL_GRANTED: CheckCircle2,
  APPROVAL_REJECTED: XCircle,
  CERTIFICATION_GRANTED: ShieldCheck,
  DISTRIBUTION_CREATED: Send,
  DISTRIBUTION_SENT: Send,
  DISTRIBUTION_VIEWED: Eye,
  DISTRIBUTION_DOWNLOADED: Download,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PackGovernance({
  certification,
  distributions,
  activities,
  onAdvanceCertification,
  certificationUpdating,
}: PackGovernanceProps) {
  const [activeTab, setActiveTab] = useState<"certification" | "distribution" | "activity">("certification");

  return (
    <Card className="overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b">
        {(["certification", "distribution", "activity"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "certification" && "Certification"}
            {tab === "distribution" && `Distribution (${distributions.length})`}
            {tab === "activity" && `Activity (${activities.length})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "certification" && (
          <CertificationPanel
            certification={certification}
            onAdvance={onAdvanceCertification}
            updating={certificationUpdating}
          />
        )}
        {activeTab === "distribution" && (
          <DistributionPanel distributions={distributions} />
        )}
        {activeTab === "activity" && (
          <ActivityTimeline activities={activities} />
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Certification Panel
// ---------------------------------------------------------------------------

function CertificationPanel({
  certification,
  onAdvance,
  updating,
}: {
  certification: PackCertificationDTO | null;
  onAdvance?: (status: CertificationStatus, notes?: string) => void;
  updating?: boolean;
}) {
  if (!certification) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No certification record. Generate or initialize certification first.
      </div>
    );
  }

  const config = CERT_STATUS_CONFIG[certification.certificationStatus];
  const StatusIcon = config.icon;
  const nextStatus = CERT_NEXT_STATUS[certification.certificationStatus];

  return (
    <div className="space-y-6">
      {/* Current status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusIcon className={cn("h-5 w-5", config.color.split(" ")[1])} />
          <div>
            <Badge className={cn("text-xs", config.color)}>
              {config.label}
            </Badge>
          </div>
        </div>
        {nextStatus && onAdvance && (
          <Button
            size="sm"
            disabled={updating}
            onClick={() => onAdvance(nextStatus)}
          >
            {updating ? "Updating..." : CERT_ACTION_LABEL[certification.certificationStatus]}
          </Button>
        )}
      </div>

      {/* Sign-off chain */}
      <div className="space-y-3">
        <SignOffStep
          label="Prepared by"
          name={certification.preparedByName}
          timestamp={certification.preparedAt}
          completed={!!certification.preparedAt}
        />
        <SignOffStep
          label="Reviewed by"
          name={certification.reviewedByName}
          timestamp={certification.reviewedAt}
          notes={certification.reviewNotes}
          completed={!!certification.reviewedAt}
        />
        <SignOffStep
          label="Approved by"
          name={certification.approvedByName}
          timestamp={certification.approvedAt}
          notes={certification.approvalNotes}
          completed={!!certification.approvedAt}
        />
        <SignOffStep
          label="Certified by"
          name={certification.certifiedByName}
          timestamp={certification.certifiedAt}
          notes={certification.certificationNotes}
          completed={!!certification.certifiedAt}
        />
      </div>

      {/* Disclosure notes */}
      {certification.disclosureNotes && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">Disclosure Notes</span>
          </div>
          <p className="text-sm text-amber-700 whitespace-pre-wrap">
            {certification.disclosureNotes}
          </p>
        </div>
      )}
    </div>
  );
}

function SignOffStep({
  label,
  name,
  timestamp,
  notes,
  completed,
}: {
  label: string;
  name: string | null;
  timestamp: string | null;
  notes?: string | null;
  completed: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-md border p-3",
      completed ? "border-green-200 bg-green-50/50" : "border-border",
    )}>
      {completed ? (
        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
      ) : (
        <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          {timestamp && (
            <span className="text-xs text-muted-foreground">
              {new Date(timestamp).toLocaleString()}
            </span>
          )}
        </div>
        {name && (
          <p className="text-sm text-muted-foreground">{name}</p>
        )}
        {notes && (
          <p className="text-xs text-muted-foreground mt-1 italic">{notes}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution Panel
// ---------------------------------------------------------------------------

function DistributionPanel({
  distributions,
}: {
  distributions: PackDistributionDTO[];
}) {
  if (distributions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No distributions yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {distributions.map((dist) => (
        <div
          key={dist.id}
          className="flex items-center justify-between rounded-md border p-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{dist.name}</span>
              <Badge variant="outline" className="text-[10px] py-0">
                {dist.format}
              </Badge>
              <Badge className={cn(
                "text-[10px] py-0",
                dist.status === "SENT" ? "bg-green-100 text-green-700" :
                dist.status === "RECALLED" ? "bg-red-100 text-red-700" :
                dist.status === "FAILED" ? "bg-red-100 text-red-700" :
                "bg-slate-100 text-slate-700",
              )}>
                {dist.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dist.recipientCount} recipients
              {dist.deliveredCount > 0 && ` \u00b7 ${dist.deliveredCount} delivered`}
              {dist.viewedCount > 0 && ` \u00b7 ${dist.viewedCount} viewed`}
              {dist.downloadedCount > 0 && ` \u00b7 ${dist.downloadedCount} downloaded`}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(dist.distributedAt).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Timeline
// ---------------------------------------------------------------------------

function ActivityTimeline({
  activities,
}: {
  activities: PackActivityDTO[];
}) {
  if (activities.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

      <div className="space-y-4">
        {activities.map((activity) => {
          const Icon = ACTIVITY_ICONS[activity.activityType] ?? Clock;
          return (
            <div key={activity.id} className="flex gap-4 relative">
              {/* Timeline dot */}
              <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-background">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {activity.message ?? activity.activityType.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(activity.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {activity.actorType === "system" ? "System" : `User ${activity.actorId ?? ""}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
