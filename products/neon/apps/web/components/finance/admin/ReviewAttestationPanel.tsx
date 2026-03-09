"use client";

// components/finance/admin/ReviewAttestationPanel.tsx
//
// Phase 14: Review attestation panel for recording acknowledgments,
// review completions, and board receipt confirmations.

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  FileCheck,
  Loader2,
  Plus,
  RefreshCw,
  UserCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type {
  AttestationDTO,
  AttestationInput,
} from "@/lib/finance/use-review-governance";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReviewAttestationPanelProps {
  attestations: AttestationDTO[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onRecord: (input: AttestationInput) => Promise<void>;
  recordLoading: boolean;
  // Context for creating attestations
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  // Default target for attestation (e.g. current snapshot)
  targetKind?: string;
  targetId?: string;
}

// ---------------------------------------------------------------------------
// Attestation type config
// ---------------------------------------------------------------------------

const ATTESTATION_TYPES: {
  value: string;
  label: string;
  description: string;
}[] = [
  { value: "acknowledgment", label: "Acknowledgment", description: "Acknowledge receipt of review materials" },
  { value: "review_complete", label: "Review Complete", description: "Confirm review has been completed" },
  { value: "attestation", label: "Attestation", description: "Formal attestation of accuracy and completeness" },
  { value: "confirmation", label: "Confirmation", description: "General confirmation" },
  { value: "board_receipt", label: "Board Receipt", description: "Board has received and noted the report" },
];

const ATTESTATION_COLORS: Record<string, string> = {
  acknowledgment: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  review_complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  attestation: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  confirmation: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  board_receipt: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  objection: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewAttestationPanel({
  attestations,
  loading,
  error,
  onRefresh,
  onRecord,
  recordLoading,
  entityCode,
  fiscalYear,
  periodNumber,
  targetKind,
  targetId,
}: ReviewAttestationPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState(ATTESTATION_TYPES[0].value);
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (!targetKind || !targetId) return;

    await onRecord({
      entityCode,
      targetKind,
      targetId,
      attestationType: selectedType,
      attestedByRole: role || undefined,
      notes: notes || undefined,
      fiscalYear,
      periodNumber,
    });

    setShowForm(false);
    setRole("");
    setNotes("");
    onRefresh();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Attestations
            {attestations.length > 0 && (
              <Badge variant="secondary" className="text-[9px] ml-1">
                {attestations.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {targetKind && targetId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(!showForm)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Create form */}
        {showForm && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Attestation Type
              </label>
              <select
                className="mt-1 w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                {ATTESTATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} — {t.description}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Role (optional)
              </label>
              <input
                className="mt-1 w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                placeholder="e.g. CFO, Controller, Audit Chair"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Notes (optional)
              </label>
              <textarea
                className="mt-1 w-full text-xs border rounded-md px-2 py-1.5 bg-background min-h-[48px]"
                placeholder="Additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={recordLoading}
              >
                {recordLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1" />
                )}
                Record
              </Button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && attestations.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Loading attestations...</span>
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* No target */}
        {!targetKind && !loading && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Select a snapshot to view and record attestations.
          </p>
        )}

        {/* Empty */}
        {targetKind && !loading && attestations.length === 0 && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No attestations recorded yet.
          </p>
        )}

        {/* List */}
        {attestations.map((att) => (
          <div
            key={att.id}
            className="flex items-start gap-2 border-l-2 border-emerald-400 pl-2.5 py-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  className={`text-[8px] ${ATTESTATION_COLORS[att.attestation_type] ?? ATTESTATION_COLORS.confirmation}`}
                >
                  {att.attestation_type.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs font-medium">
                  {att.attested_by_name ?? "Unknown"}
                </span>
                {att.attested_by_role && (
                  <Badge variant="outline" className="text-[8px]">
                    {att.attested_by_role}
                  </Badge>
                )}
              </div>
              {att.notes && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{att.notes}</p>
              )}
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="h-2.5 w-2.5" />
                {new Date(att.attested_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
