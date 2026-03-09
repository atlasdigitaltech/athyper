"use client";

// components/finance/admin/EvidenceBundlePanel.tsx
//
// Phase 15: Evidence bundle assembly, sealing, and distribution panel.
// Manages governed export bundles with artifact selection,
// integrity hashing, and external distribution.

import { useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileBox,
  Hash,
  Link2,
  Loader2,
  Lock,
  Package,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Trash2,
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
  EvidenceBundleDTO,
  EvidenceBundleDetailDTO,
  EvidenceBundleCreateInput,
  BundleItemInput,
  BundleDistributeInput,
} from "@/lib/finance/use-assurance-hub";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EvidenceBundlePanelProps {
  bundles: EvidenceBundleDTO[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  // Bundle detail
  selectedBundleDetail: EvidenceBundleDetailDTO | null;
  detailLoading: boolean;
  onSelectBundle: (id: string | null) => void;
  // Mutations
  onCreateBundle: (input: EvidenceBundleCreateInput) => Promise<string>;
  onAddItems: (bundleId: string, items: BundleItemInput[]) => Promise<void>;
  onRemoveItem: (bundleId: string, itemId: string) => Promise<void>;
  onSeal: (bundleId: string) => Promise<{ bundleHash: string; itemCount: number }>;
  onExpire: (bundleId: string) => Promise<void>;
  onDistribute: (bundleId: string, input: BundleDistributeInput) => Promise<{ distributionId: string; secureLinkToken: string }>;
  mutationLoading: boolean;
  // Context
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<string, typeof Package> = {
  DRAFT: Package,
  SEALED: Lock,
  DISTRIBUTED: Send,
  EXPIRED: Archive,
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  SEALED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  DISTRIBUTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  EXPIRED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const BUNDLE_TYPE_LABELS: Record<string, string> = {
  general: "General",
  pbc: "PBC Package",
  audit_response: "Audit Response",
  regulatory: "Regulatory",
  board_pack: "Board Pack",
  compliance: "Compliance",
};

const ARTIFACT_KINDS = [
  { value: "review_snapshot", label: "Review Snapshot" },
  { value: "review_section", label: "Review Section" },
  { value: "attestation", label: "Attestation" },
  { value: "decision", label: "Decision" },
  { value: "action_item", label: "Action Item" },
  { value: "commentary", label: "Commentary" },
  { value: "certification", label: "Certification" },
  { value: "readiness_snapshot", label: "Readiness Snapshot" },
  { value: "close_override", label: "Override" },
  { value: "publication_manifest", label: "Publication Manifest" },
  { value: "pack_instance", label: "Pack Instance" },
  { value: "statement_instance", label: "Statement" },
  { value: "custom", label: "Custom Evidence" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EvidenceBundlePanel({
  bundles,
  loading,
  error,
  onRefresh,
  selectedBundleDetail,
  detailLoading,
  onSelectBundle,
  onCreateBundle,
  onAddItems,
  onRemoveItem,
  onSeal,
  onExpire,
  onDistribute,
  mutationLoading,
  entityCode,
  fiscalYear,
  periodNumber,
}: EvidenceBundlePanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showDistribute, setShowDistribute] = useState(false);

  // Create form state
  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState("general");
  const [createOrg, setCreateOrg] = useState("");
  const [createDueAt, setCreateDueAt] = useState("");

  // Add item state
  const [itemKind, setItemKind] = useState("review_snapshot");
  const [itemLabel, setItemLabel] = useState("");

  // Distribute state
  const [distName, setDistName] = useState("");
  const [distClass, setDistClass] = useState("external_audit");
  const [distRecipientName, setDistRecipientName] = useState("");
  const [distRecipientEmail, setDistRecipientEmail] = useState("");
  const [distRecipientRole, setDistRecipientRole] = useState("");

  const handleCreate = async () => {
    if (!createTitle.trim()) return;
    const id = await onCreateBundle({
      entityCode,
      title: createTitle.trim(),
      bundleType: createType,
      fiscalYear,
      periodNumber,
      requestedByOrg: createOrg || undefined,
      dueAt: createDueAt || undefined,
    });
    setShowCreateForm(false);
    setCreateTitle("");
    setCreateOrg("");
    setCreateDueAt("");
    onSelectBundle(id);
  };

  const handleAddItem = async () => {
    if (!selectedBundleDetail || !itemLabel.trim()) return;
    await onAddItems(selectedBundleDetail.id, [
      { artifactKind: itemKind, artifactLabel: itemLabel.trim() },
    ]);
    setItemLabel("");
    setShowAddItem(false);
  };

  const handleDistribute = async () => {
    if (!selectedBundleDetail || !distName.trim() || !distRecipientName.trim()) return;
    await onDistribute(selectedBundleDetail.id, {
      name: distName.trim(),
      recipientClass: distClass,
      recipients: [{
        name: distRecipientName.trim(),
        email: distRecipientEmail || undefined,
        role: distRecipientRole || undefined,
      }],
    });
    setShowDistribute(false);
    setDistName("");
    setDistRecipientName("");
    setDistRecipientEmail("");
    setDistRecipientRole("");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileBox className="h-4 w-4" />
            Evidence Bundles
            {bundles.length > 0 && (
              <Badge variant="secondary" className="text-[9px] ml-1">
                {bundles.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Create form */}
        {showCreateForm && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <input
              className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
              placeholder="Bundle title *"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Type</label>
                <select
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value)}
                >
                  {Object.entries(BUNDLE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">For (org)</label>
                <input
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  placeholder="e.g. Deloitte"
                  value={createOrg}
                  onChange={(e) => setCreateOrg(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Due</label>
                <input
                  type="date"
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                  value={createDueAt}
                  onChange={(e) => setCreateDueAt(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={mutationLoading || !createTitle.trim()}>
                Create Bundle
              </Button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && bundles.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Bundle list */}
        {!loading && bundles.length === 0 && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No evidence bundles for this period.
          </p>
        )}

        {bundles.map((b) => {
          const isSelected = selectedBundleDetail?.id === b.id;
          const StatusIcon = STATUS_ICONS[b.status] ?? Package;

          return (
            <div key={b.id} className={`border rounded-md ${isSelected ? "ring-2 ring-blue-400" : ""}`}>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted/50"
                onClick={() => onSelectBundle(isSelected ? null : b.id)}
              >
                <StatusIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium truncate">{b.title}</span>
                    <Badge className={`text-[8px] ${STATUS_COLORS[b.status] ?? ""}`}>{b.status}</Badge>
                    <Badge variant="outline" className="text-[8px]">
                      {BUNDLE_TYPE_LABELS[b.bundle_type] ?? b.bundle_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-muted-foreground">
                    <span>{b.bundle_code}</span>
                    <span>{b.item_count} item{b.item_count !== 1 ? "s" : ""}</span>
                    {b.requested_by_org && <span>for {b.requested_by_org}</span>}
                  </div>
                </div>
                {isSelected ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {/* Detail view */}
              {isSelected && selectedBundleDetail && (
                <div className="px-3 pb-3 space-y-2 border-t">
                  {/* Bundle meta */}
                  <div className="flex items-center gap-3 pt-2 text-[10px] text-muted-foreground flex-wrap">
                    {selectedBundleDetail.bundle_hash && (
                      <span className="flex items-center gap-0.5">
                        <Hash className="h-2.5 w-2.5" />
                        {selectedBundleDetail.bundle_hash.slice(0, 16)}...
                      </span>
                    )}
                    {selectedBundleDetail.sealed_at && (
                      <span className="flex items-center gap-0.5">
                        <Lock className="h-2.5 w-2.5" />
                        Sealed {new Date(selectedBundleDetail.sealed_at).toLocaleString()}
                      </span>
                    )}
                    {selectedBundleDetail.due_at && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        Due {new Date(selectedBundleDetail.due_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* Items list */}
                  {selectedBundleDetail.items.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Items ({selectedBundleDetail.items.length})
                      </p>
                      {selectedBundleDetail.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-[11px] border-l-2 border-muted pl-2 py-0.5">
                          <Badge variant="outline" className="text-[8px] shrink-0">
                            {item.artifact_kind.replace(/_/g, " ")}
                          </Badge>
                          <span className="flex-1 truncate">{item.artifact_label}</span>
                          {item.artifact_hash && (
                            <Hash className="h-2.5 w-2.5 text-muted-foreground" />
                          )}
                          {selectedBundleDetail.status === "DRAFT" && (
                            <button
                              className="text-red-400 hover:text-red-600"
                              onClick={() => onRemoveItem(selectedBundleDetail.id, item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add item (DRAFT only) */}
                  {selectedBundleDetail.status === "DRAFT" && (
                    <>
                      {showAddItem ? (
                        <div className="border rounded-md p-2 space-y-1.5 bg-muted/20">
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              className="text-xs border rounded px-1.5 py-1 bg-background"
                              value={itemKind}
                              onChange={(e) => setItemKind(e.target.value)}
                            >
                              {ARTIFACT_KINDS.map((k) => (
                                <option key={k.value} value={k.value}>{k.label}</option>
                              ))}
                            </select>
                            <input
                              className="text-xs border rounded px-1.5 py-1 bg-background"
                              placeholder="Label *"
                              value={itemLabel}
                              onChange={(e) => setItemLabel(e.target.value)}
                            />
                          </div>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAddItem(false)}>
                              Cancel
                            </Button>
                            <Button size="sm" className="h-6 text-[10px]" onClick={handleAddItem} disabled={mutationLoading || !itemLabel.trim()}>
                              Add
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="w-full text-[10px]" onClick={() => setShowAddItem(true)}>
                          <Plus className="h-3 w-3 mr-1" /> Add Item
                        </Button>
                      )}
                    </>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-1.5 flex-wrap pt-1">
                    {selectedBundleDetail.status === "DRAFT" && selectedBundleDetail.items.length > 0 && (
                      <Button size="sm" className="h-7 text-[10px]"
                        onClick={() => onSeal(selectedBundleDetail.id)} disabled={mutationLoading}>
                        <Lock className="h-3 w-3 mr-1" /> Seal Bundle
                      </Button>
                    )}
                    {selectedBundleDetail.status === "SEALED" && (
                      <>
                        {showDistribute ? (
                          <div className="w-full border rounded-md p-2 space-y-1.5 bg-muted/20">
                            <input
                              className="w-full text-xs border rounded px-1.5 py-1 bg-background"
                              placeholder="Distribution name *"
                              value={distName}
                              onChange={(e) => setDistName(e.target.value)}
                            />
                            <select
                              className="w-full text-xs border rounded px-1.5 py-1 bg-background"
                              value={distClass}
                              onChange={(e) => setDistClass(e.target.value)}
                            >
                              <option value="external_audit">External Audit</option>
                              <option value="internal_audit">Internal Audit</option>
                              <option value="board">Board / Audit Committee</option>
                              <option value="regulator">Regulator</option>
                              <option value="management">Management</option>
                              <option value="other">Other</option>
                            </select>
                            <div className="grid grid-cols-3 gap-1.5">
                              <input
                                className="text-xs border rounded px-1.5 py-1 bg-background"
                                placeholder="Recipient name *"
                                value={distRecipientName}
                                onChange={(e) => setDistRecipientName(e.target.value)}
                              />
                              <input
                                className="text-xs border rounded px-1.5 py-1 bg-background"
                                placeholder="Email"
                                value={distRecipientEmail}
                                onChange={(e) => setDistRecipientEmail(e.target.value)}
                              />
                              <input
                                className="text-xs border rounded px-1.5 py-1 bg-background"
                                placeholder="Role"
                                value={distRecipientRole}
                                onChange={(e) => setDistRecipientRole(e.target.value)}
                              />
                            </div>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowDistribute(false)}>
                                Cancel
                              </Button>
                              <Button size="sm" className="h-6 text-[10px]" onClick={handleDistribute}
                                disabled={mutationLoading || !distName.trim() || !distRecipientName.trim()}>
                                <Send className="h-3 w-3 mr-1" /> Distribute
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button size="sm" className="h-7 text-[10px]"
                            onClick={() => setShowDistribute(true)} disabled={mutationLoading}>
                            <Send className="h-3 w-3 mr-1" /> Distribute
                          </Button>
                        )}
                      </>
                    )}
                    {["SEALED", "DISTRIBUTED"].includes(selectedBundleDetail.status) && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px]"
                        onClick={() => onExpire(selectedBundleDetail.id)} disabled={mutationLoading}>
                        <Archive className="h-3 w-3 mr-1" /> Expire
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Detail loading */}
              {isSelected && detailLoading && !selectedBundleDetail && (
                <div className="px-3 pb-3 flex items-center justify-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
