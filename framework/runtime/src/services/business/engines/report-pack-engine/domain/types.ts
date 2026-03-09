// framework/runtime/src/services/business/engines/report-pack-engine/domain/types.ts
//
// Domain model for the Report Pack Engine.
// Packs are ordered bundles of statement artifacts that can be
// generated, reviewed, approved, and published as a single unit.

// --- Pack Enumerations ---

export type PackType =
  | "EXECUTIVE"
  | "MANAGEMENT"
  | "OPERATIONAL"
  | "COMPLIANCE"
  | "CUSTOM";

export type PackItemType =
  | "STATEMENT"
  | "COMPARISON"
  | "NARRATIVE"
  | "SEPARATOR"
  | "KPI";

export type PeriodMode =
  | "PTD"
  | "QTD"
  | "YTD"
  | "PRIOR_PERIOD"
  | "PRIOR_YEAR"
  | "ROLLING_12M";

export type VarianceSource =
  | "PRIOR_YEAR"
  | "BUDGET"
  | "FORECAST"
  | "PRIOR_PERIOD";

export type PackInstanceStatus =
  | "GENERATING"
  | "DRAFT"
  | "REVIEWED"
  | "APPROVED"
  | "FINALIZED"
  | "PUBLISHED"
  | "SUPERSEDED";

export const PACK_INSTANCE_TRANSITIONS: Record<PackInstanceStatus, PackInstanceStatus[]> = {
  GENERATING: ["DRAFT"],
  DRAFT: ["REVIEWED"],
  REVIEWED: ["DRAFT", "APPROVED"],
  APPROVED: ["REVIEWED", "FINALIZED"],
  FINALIZED: ["PUBLISHED", "SUPERSEDED"],
  PUBLISHED: ["SUPERSEDED"],
  SUPERSEDED: [],
};

export type PackItemStatus =
  | "PENDING"
  | "GENERATING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export type BudgetType = "BUDGET" | "FORECAST" | "PLAN";

export type CommentaryTargetKind =
  | "pack_instance"
  | "pack_item"
  | "statement_line";

export type CommentaryType =
  | "NARRATIVE"
  | "HIGHLIGHT"
  | "RISK"
  | "ACTION"
  | "APPROVAL_NOTE";

// --- Pack Definition ---

export interface PackDefinition {
  id: string;
  tenantId: string;
  entityCode: string;
  packCode: string;
  name: string;
  description: string | null;
  packType: PackType;
  defaultBookCode: string;
  defaultPeriodMode: PeriodMode;
  defaultVarianceSource: VarianceSource | null;
  dimensionCodes: string[] | null;
  version: number;
  scope: "SYSTEM" | "TENANT" | "ENTITY";
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

// --- Pack Item (within a definition) ---

export interface PackItem {
  id: string;
  packDefinitionId: string;
  itemCode: string;
  label: string;
  description: string | null;
  itemType: PackItemType;
  statementDefinitionId: string | null;
  compareBaseBook: string | null;
  compareTargetBook: string | null;
  varianceSource: VarianceSource | null;
  periodMode: PeriodMode | null;
  bookCode: string | null;
  dimensionTypeCode: string | null;
  dimensionValueCode: string | null;
  sortOrder: number;
  pageBreakBefore: boolean;
  showVariance: boolean;
  showPrior: boolean;
  showBudget: boolean;
  narrativeContent: string | null;
  isActive: boolean;
  createdAt: Date;
}

// --- Budget Line ---

export interface BudgetLine {
  id: string;
  tenantId: string;
  entityCode: string;
  budgetCode: string;
  budgetType: BudgetType;
  budgetVersion: number;
  accountId: string;
  fiscalYear: number;
  periodNumber: number;
  bookCode: string;
  dimensionSetId: string | null;
  budgetAmount: string; // MC-4: DECIMAL(18,4) as string
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

// --- Pack Instance ---

export interface PackInstance {
  id: string;
  tenantId: string;
  entityCode: string;
  packDefinitionId: string;
  packVersion: number;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode: string;
  dimensionSetId: string | null;
  status: PackInstanceStatus;
  generatedAt: Date;
  generatedBy: string | null;
  generationDurationMs: number | null;
  totalItems: number;
  itemsCompleted: number;
  varianceSource: VarianceSource | null;
  periodMode: PeriodMode | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  finalizedAt: Date | null;
  publishedBy: string | null;
  publishedAt: Date | null;
  supersedesId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Pack Instance Item ---

export interface PackInstanceItem {
  id: string;
  packInstanceId: string;
  packItemId: string;
  statementInstanceId: string | null;
  comparisonId: string | null;
  itemStatus: PackItemStatus;
  errorMessage: string | null;
  resolvedBookCode: string | null;
  resolvedPeriodMode: PeriodMode | null;
  resolvedVarianceSource: VarianceSource | null;
  resolvedPeriodFrom: number | null;
  resolvedPeriodTo: number | null;
  resolvedFiscalYear: number | null;
  sortOrder: number;
  createdAt: Date;
}

// --- Report Commentary ---

export interface ReportCommentary {
  id: string;
  tenantId: string;
  targetKind: CommentaryTargetKind;
  targetId: string;
  packInstanceItemId: string | null;
  statementLineCode: string | null;
  commentaryType: CommentaryType;
  title: string | null;
  body: string;
  version: number;
  isCurrent: boolean;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Generation Input ---

export interface GeneratePackInput {
  tenantId: string;
  entityCode: string;
  packDefinitionId: string;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode?: string;
  varianceSource?: VarianceSource;
  periodMode?: PeriodMode;
  dimensionSetId?: string;
  budgetCode?: string;
  generatedBy?: string;
}

// --- Period Resolution ---

export interface ResolvedPeriod {
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
}

// --- Certification ---

export type CertificationStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "REVIEWED"
  | "APPROVED"
  | "CERTIFIED"
  | "REJECTED";

export const CERTIFICATION_TRANSITIONS: Record<CertificationStatus, CertificationStatus[]> = {
  PENDING: ["IN_REVIEW"],
  IN_REVIEW: ["REVIEWED", "REJECTED"],
  REVIEWED: ["APPROVED", "REJECTED", "IN_REVIEW"],
  APPROVED: ["CERTIFIED", "REJECTED"],
  CERTIFIED: [],
  REJECTED: ["PENDING"],
};

export interface PackCertification {
  id: string;
  tenantId: string;
  packInstanceId: string;
  preparedBy: string | null;
  preparedByName: string | null;
  preparedAt: Date | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  approvalNotes: string | null;
  approvalInstanceId: string | null;
  certifiedBy: string | null;
  certifiedByName: string | null;
  certifiedAt: Date | null;
  certificationNotes: string | null;
  certificationStatus: CertificationStatus;
  disclosureNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Distribution ---

export type DistributionFormat =
  | "LINK"
  | "PDF"
  | "EXCEL"
  | "ZIP"
  | "EMAIL_BODY";

export type DistributionStatus =
  | "DRAFT"
  | "SENDING"
  | "SENT"
  | "PARTIAL"
  | "FAILED"
  | "RECALLED";

export type RecipientDeliveryStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "BOUNCED"
  | "FAILED";

export interface PackDistribution {
  id: string;
  tenantId: string;
  packInstanceId: string;
  distributionCode: string;
  name: string;
  description: string | null;
  format: DistributionFormat;
  certificationId: string | null;
  distributedBy: string | null;
  distributedAt: Date;
  notifyMessageId: string | null;
  status: DistributionStatus;
  recalledBy: string | null;
  recalledAt: Date | null;
  recallReason: string | null;
  recipientCount: number;
  deliveredCount: number;
  viewedCount: number;
  downloadedCount: number;
  secureLinkToken: string | null;
  linkExpiresAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PackDistributionRecipient {
  id: string;
  distributionId: string;
  recipientId: string | null;
  recipientName: string;
  recipientEmail: string | null;
  recipientRole: string | null;
  deliveryStatus: RecipientDeliveryStatus;
  sentAt: Date | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  viewCount: number;
  firstDownloadedAt: Date | null;
  downloadCount: number;
  notifyDeliveryId: string | null;
  createdAt: Date;
}

// --- Pack Activity Log ---

export type PackActivityType =
  | "PACK_GENERATED"
  | "ITEM_GENERATED"
  | "ITEM_FAILED"
  | "ITEM_SKIPPED"
  | "REVIEW_STARTED"
  | "REVIEW_COMPLETED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  | "CERTIFICATION_GRANTED"
  | "CERTIFICATION_REVOKED"
  | "STATUS_CHANGED"
  | "SUPERSEDED"
  | "DISTRIBUTION_CREATED"
  | "DISTRIBUTION_SENT"
  | "DISTRIBUTION_DOWNLOADED"
  | "DISTRIBUTION_VIEWED"
  | "COMMENTARY_ADDED"
  | "COMMENTARY_UPDATED"
  | "EXPORTED";

export interface PackActivity {
  id: string;
  tenantId: string;
  entityCode: string;
  packInstanceId: string;
  activityType: PackActivityType;
  actorType: "user" | "system" | "approval_engine" | "scheduler";
  actorId: string | null;
  message: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

// --- Forecast Scenario ---

export type ScenarioType =
  | "BASE"
  | "OPTIMISTIC"
  | "PESSIMISTIC"
  | "STRETCH"
  | "CUSTOM";

export type ScenarioStatus = "DRAFT" | "ACTIVE" | "FROZEN" | "ARCHIVED";

export interface ForecastScenario {
  id: string;
  tenantId: string;
  entityCode: string;
  scenarioCode: string;
  name: string;
  description: string | null;
  scenarioType: ScenarioType;
  baseBudgetCode: string | null;
  version: number;
  assumptions: Record<string, unknown>;
  status: ScenarioStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface ForecastLine {
  id: string;
  tenantId: string;
  entityCode: string;
  scenarioId: string;
  forecastCode: string;
  forecastVersion: number;
  accountId: string;
  fiscalYear: number;
  periodNumber: number;
  bookCode: string;
  dimensionSetId: string | null;
  forecastAmount: string; // MC-4
  driverType: string | null;
  driverValue: string | null;
  driverFormula: string | null;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}
