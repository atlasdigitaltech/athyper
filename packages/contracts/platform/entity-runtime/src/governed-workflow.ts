export const GOVERNED_WORKFLOW_CONTRACT_VERSION = 1 as const;

export type ExperiencePlane = "neon" | "mesh" | "studio";
export type ExperienceRoleLens = "base" | "supplier" | "customer";
export type CaseSectionState =
  "not_started" | "in_progress" | "complete" | "blocked" | "not_applicable";
export type GovernedCaseStatusV1 =
  | "draft"
  | "validating"
  | "validation_failed"
  | "submitted"
  | "pending_approval"
  | "in_review"
  | "returned"
  | "approved"
  | "rejected"
  | "applying"
  | "materializing"
  | "applied"
  | "materialized"
  | "failed"
  | "cancelled"
  | "superseded"
  | "conflicted";
export type EvidenceLifecycleStatus =
  | "staged"
  | "uploading"
  | "scanning"
  | "extracting"
  | "active"
  | "quarantined"
  | "replaced"
  | "expired";
export type EvidenceClassification =
  "public" | "internal" | "confidential" | "restricted";
export type NotificationDeliveryClass =
  | "mandatory_transactional"
  | "mandatory_security"
  | "policy_controlled"
  | "preference_aware";
export type GovernedWorkflowScalar = string | number | boolean | null;

export interface DefinitionCoordinateV1 {
  readonly id: string;
  readonly version: number;
  readonly contentHash: string;
}

/** Browser-visible context, never an authorization claim. */
export interface ExperienceContextCoordinateV1 {
  readonly schema: "athyper.experience-context-coordinate/1";
  readonly plane: ExperiencePlane;
  readonly tenantId: string;
  readonly principalId: string;
  readonly actingAccountId?: string;
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly recordId?: string;
  readonly relationshipId?: string;
  readonly caseId?: string;
  readonly section: string;
  readonly roleLens?: ExperienceRoleLens;
  readonly asOf?: string;
  readonly definition: DefinitionCoordinateV1;
  readonly permissionsHash: string;
  readonly authorizationEpoch: number;
}

export interface GovernedCaseViewV1 {
  readonly schema: "athyper.governed-case-view/1";
  readonly id: string;
  readonly kind: string;
  readonly status: GovernedCaseStatusV1;
  readonly rowVersion: number;
  readonly definition: DefinitionCoordinateV1;
  readonly subject: Readonly<{
    type: string;
    id?: string;
    displayName: string;
  }>;
  readonly ownership: Readonly<{
    requesterId: string;
    assigneeId?: string;
    queue?: string;
  }>;
  readonly progress: Readonly<{
    completed: number;
    required: number;
    blockers: number;
  }>;
  readonly sections: readonly Readonly<{
    id: string;
    label: string;
    state: CaseSectionState;
    errors: number;
  }>[];
  readonly allowedActions: readonly Readonly<{
    id: string;
    label: string;
    requiresElevation?: boolean;
  }>[];
  readonly evidenceSummary: Readonly<{
    active: number;
    scanning: number;
    quarantined: number;
    missing: number;
  }>;
  readonly timestamps: Readonly<{
    createdAt: string;
    updatedAt: string;
    dueAt?: string;
  }>;
}

export interface EvidenceItemViewV1 {
  readonly schema: "athyper.evidence-item-view/1";
  readonly id: string;
  readonly requirementId: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly sizeBytes?: number;
  readonly version: number;
  readonly status: EvidenceLifecycleStatus;
  readonly classification: EvidenceClassification;
  readonly extractedFields?: readonly Readonly<{
    path: string;
    value: GovernedWorkflowScalar;
    confidence: number;
    evidenceSpan?: string;
  }>[];
  readonly retentionUntil?: string;
  readonly legalHold: boolean;
  readonly canDownload: boolean;
  readonly canReplace: boolean;
}

export interface NotificationEventV1 {
  readonly schema: "athyper.notification-event/1";
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly plane: ExperiencePlane;
  readonly subject: Readonly<{
    type: string;
    id: string;
    displayLabel?: string;
  }>;
  readonly caseId?: string;
  readonly relationshipId?: string;
  readonly actorId?: string;
  readonly recipientHints: readonly string[];
  readonly templateData: Readonly<
    Record<string, string | number | boolean | null>
  >;
  readonly deliveryClass: NotificationDeliveryClass;
  readonly templateKey: string;
  readonly deepLinkKey?: string;
  readonly deduplicationKey: string;
}

const codePattern = /^[a-z][a-z0-9_.-]{0,126}$/;
const dataKeyPattern = /^[a-z][a-zA-Z0-9_.-]{0,126}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashPattern = /^[0-9a-f]{64}$/;

export function parseExperienceContextCoordinate(
  value: unknown,
): ExperienceContextCoordinateV1 {
  const root = object(value, "context coordinate");
  exactSchema(root.schema, "athyper.experience-context-coordinate/1");
  return deepFreeze({
    schema: "athyper.experience-context-coordinate/1",
    plane: oneOf(root.plane, ["neon", "mesh", "studio"] as const, "plane"),
    tenantId: identifier(root.tenantId, "tenantId"),
    principalId: identifier(root.principalId, "principalId"),
    ...optionalIdentifier(root, "actingAccountId"),
    ...optionalIdentifier(root, "operatingOrganizationId"),
    ...optionalIdentifier(root, "companyCodeId"),
    ...optionalIdentifier(root, "recordId"),
    ...optionalIdentifier(root, "relationshipId"),
    ...optionalIdentifier(root, "caseId"),
    section: code(root.section, "section"),
    ...(root.roleLens === undefined
      ? {}
      : {
          roleLens: oneOf(
            root.roleLens,
            ["base", "supplier", "customer"] as const,
            "roleLens",
          ),
        }),
    ...(root.asOf === undefined ? {} : { asOf: timestamp(root.asOf, "asOf") }),
    definition: definition(root.definition),
    permissionsHash: hash(root.permissionsHash, "permissionsHash"),
    authorizationEpoch: nonNegativeInteger(
      root.authorizationEpoch,
      "authorizationEpoch",
    ),
  } satisfies ExperienceContextCoordinateV1);
}

export function parseGovernedCaseView(value: unknown): GovernedCaseViewV1 {
  const root = object(value, "governed case");
  exactSchema(root.schema, "athyper.governed-case-view/1");
  const subject = object(root.subject, "subject");
  const ownership = object(root.ownership, "ownership");
  const progress = object(root.progress, "progress");
  const evidenceSummary = object(root.evidenceSummary, "evidenceSummary");
  const timestamps = object(root.timestamps, "timestamps");
  const result = {
    schema: "athyper.governed-case-view/1",
    id: identifier(root.id, "id"),
    kind: code(root.kind, "kind"),
    status: oneOf(
      root.status,
      [
        "draft",
        "validating",
        "validation_failed",
        "submitted",
        "pending_approval",
        "in_review",
        "returned",
        "approved",
        "rejected",
        "applying",
        "materializing",
        "applied",
        "materialized",
        "failed",
        "cancelled",
        "superseded",
        "conflicted",
      ] as const,
      "status",
    ),
    rowVersion: positiveInteger(root.rowVersion, "rowVersion"),
    definition: definition(root.definition),
    subject: {
      type: code(subject.type, "subject.type"),
      ...optionalIdentifier(subject, "id"),
      displayName: text(subject.displayName, "subject.displayName", 255),
    },
    ownership: {
      requesterId: identifier(ownership.requesterId, "ownership.requesterId"),
      ...optionalIdentifier(ownership, "assigneeId"),
      ...(ownership.queue === undefined
        ? {}
        : { queue: code(ownership.queue, "ownership.queue") }),
    },
    progress: {
      completed: nonNegativeInteger(progress.completed, "progress.completed"),
      required: nonNegativeInteger(progress.required, "progress.required"),
      blockers: nonNegativeInteger(progress.blockers, "progress.blockers"),
    },
    sections: array(root.sections, "sections", 100).map((candidate, index) => {
      const item = object(candidate, `sections[${index}]`);
      return {
        id: code(item.id, `sections[${index}].id`),
        label: text(item.label, `sections[${index}].label`, 120),
        state: oneOf(
          item.state,
          [
            "not_started",
            "in_progress",
            "complete",
            "blocked",
            "not_applicable",
          ] as const,
          `sections[${index}].state`,
        ),
        errors: nonNegativeInteger(item.errors, `sections[${index}].errors`),
      };
    }),
    allowedActions: array(root.allowedActions, "allowedActions", 50).map(
      (candidate, index) => {
        const item = object(candidate, `allowedActions[${index}]`);
        return {
          id: code(item.id, `allowedActions[${index}].id`),
          label: text(item.label, `allowedActions[${index}].label`, 120),
          ...(item.requiresElevation === undefined
            ? {}
            : {
                requiresElevation: bool(
                  item.requiresElevation,
                  `allowedActions[${index}].requiresElevation`,
                ),
              }),
        };
      },
    ),
    evidenceSummary: {
      active: nonNegativeInteger(
        evidenceSummary.active,
        "evidenceSummary.active",
      ),
      scanning: nonNegativeInteger(
        evidenceSummary.scanning,
        "evidenceSummary.scanning",
      ),
      quarantined: nonNegativeInteger(
        evidenceSummary.quarantined,
        "evidenceSummary.quarantined",
      ),
      missing: nonNegativeInteger(
        evidenceSummary.missing,
        "evidenceSummary.missing",
      ),
    },
    timestamps: {
      createdAt: timestamp(timestamps.createdAt, "timestamps.createdAt"),
      updatedAt: timestamp(timestamps.updatedAt, "timestamps.updatedAt"),
      ...(timestamps.dueAt === undefined
        ? {}
        : { dueAt: timestamp(timestamps.dueAt, "timestamps.dueAt") }),
    },
  } satisfies GovernedCaseViewV1;
  if (result.progress.completed > result.progress.required)
    fail("progress.completed cannot exceed progress.required");
  return deepFreeze(result);
}

export function parseEvidenceItemView(value: unknown): EvidenceItemViewV1 {
  const root = object(value, "evidence item");
  exactSchema(root.schema, "athyper.evidence-item-view/1");
  const extractedFields =
    root.extractedFields === undefined
      ? undefined
      : array(root.extractedFields, "extractedFields", 250).map(
          (candidate, index) => {
            const item = object(candidate, `extractedFields[${index}]`);
            const confidence = finite(
              item.confidence,
              `extractedFields[${index}].confidence`,
            );
            if (confidence < 0 || confidence > 1)
              fail(`extractedFields[${index}].confidence`);
            return {
              path: fieldPath(item.path, `extractedFields[${index}].path`),
              value: scalar(item.value, `extractedFields[${index}].value`),
              confidence,
              ...(item.evidenceSpan === undefined
                ? {}
                : {
                    evidenceSpan: text(
                      item.evidenceSpan,
                      `extractedFields[${index}].evidenceSpan`,
                      500,
                    ),
                  }),
            };
          },
        );
  return deepFreeze({
    schema: "athyper.evidence-item-view/1",
    id: identifier(root.id, "id"),
    requirementId: identifier(root.requirementId, "requirementId"),
    fileName: text(root.fileName, "fileName", 255),
    mediaType: mediaType(root.mediaType),
    ...(root.sizeBytes === undefined
      ? {}
      : { sizeBytes: nonNegativeInteger(root.sizeBytes, "sizeBytes") }),
    version: positiveInteger(root.version, "version"),
    status: oneOf(
      root.status,
      [
        "staged",
        "uploading",
        "scanning",
        "extracting",
        "active",
        "quarantined",
        "replaced",
        "expired",
      ] as const,
      "status",
    ),
    classification: oneOf(
      root.classification,
      ["public", "internal", "confidential", "restricted"] as const,
      "classification",
    ),
    ...(extractedFields === undefined ? {} : { extractedFields }),
    ...(root.retentionUntil === undefined
      ? {}
      : { retentionUntil: timestamp(root.retentionUntil, "retentionUntil") }),
    legalHold: bool(root.legalHold, "legalHold"),
    canDownload: bool(root.canDownload, "canDownload"),
    canReplace: bool(root.canReplace, "canReplace"),
  } satisfies EvidenceItemViewV1);
}

export function parseNotificationEvent(value: unknown): NotificationEventV1 {
  const root = object(value, "notification event");
  exactSchema(root.schema, "athyper.notification-event/1");
  const subject = object(root.subject, "subject");
  const rawTemplateData = object(root.templateData, "templateData");
  if (Object.keys(rawTemplateData).length > 50) fail("templateData");
  const templateData: Record<string, string | number | boolean | null> = {};
  for (const [key, candidate] of Object.entries(rawTemplateData)) {
    if (!dataKeyPattern.test(key)) fail(`templateData.${key}`);
    templateData[key] = scalar(candidate, `templateData.${key}`);
  }
  const recipientHints = array(root.recipientHints, "recipientHints", 20).map(
    (candidate, index) => code(candidate, `recipientHints[${index}]`),
  );
  if (
    !recipientHints.length ||
    new Set(recipientHints).size !== recipientHints.length
  )
    fail("recipientHints");
  return deepFreeze({
    schema: "athyper.notification-event/1",
    eventId: identifier(root.eventId, "eventId"),
    eventType: code(root.eventType, "eventType"),
    occurredAt: timestamp(root.occurredAt, "occurredAt"),
    tenantId: identifier(root.tenantId, "tenantId"),
    plane: oneOf(root.plane, ["neon", "mesh", "studio"] as const, "plane"),
    subject: {
      type: code(subject.type, "subject.type"),
      id: identifier(subject.id, "subject.id"),
      ...(subject.displayLabel === undefined
        ? {}
        : {
            displayLabel: text(
              subject.displayLabel,
              "subject.displayLabel",
              255,
            ),
          }),
    },
    ...optionalIdentifier(root, "caseId"),
    ...optionalIdentifier(root, "relationshipId"),
    ...optionalIdentifier(root, "actorId"),
    recipientHints,
    templateData,
    deliveryClass: oneOf(
      root.deliveryClass,
      [
        "mandatory_transactional",
        "mandatory_security",
        "policy_controlled",
        "preference_aware",
      ] as const,
      "deliveryClass",
    ),
    templateKey: code(root.templateKey, "templateKey"),
    ...(root.deepLinkKey === undefined
      ? {}
      : { deepLinkKey: code(root.deepLinkKey, "deepLinkKey") }),
    deduplicationKey: text(root.deduplicationKey, "deduplicationKey", 200),
  } satisfies NotificationEventV1);
}

function definition(value: unknown): DefinitionCoordinateV1 {
  const item = object(value, "definition");
  return {
    id: identifier(item.id, "definition.id"),
    version: positiveInteger(item.version, "definition.version"),
    contentHash: hash(item.contentHash, "definition.contentHash"),
  };
}

function optionalIdentifier(
  value: Record<string, unknown>,
  key: string,
): Record<string, string> {
  return value[key] === undefined ? {} : { [key]: identifier(value[key], key) };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(name);
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(name);
  return value;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(name);
  return value.trim();
}

function code(value: unknown, name: string): string {
  const result = text(value, name, 127);
  if (!codePattern.test(result)) fail(name);
  return result;
}

function fieldPath(value: unknown, name: string): string {
  const result = text(value, name, 250);
  if (!/^(?:\/[a-zA-Z0-9_.~-]+)+$/.test(result)) fail(name);
  return result;
}

function identifier(value: unknown, name: string): string {
  const result = text(value, name, 180);
  if (!uuidPattern.test(result) && !codePattern.test(result)) fail(name);
  return result;
}

function mediaType(value: unknown): string {
  const result = text(value, "mediaType", 127).toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(result))
    fail("mediaType");
  return result;
}

function timestamp(value: unknown, name: string): string {
  const result = text(value, name, 40);
  // Validate the wire coordinate without importing runtime date utilities.
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(result);
  if (!match) fail(name);
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]!) fail(name);
  return result;
}

function hash(value: unknown, name: string): string {
  if (typeof value !== "string" || !hashPattern.test(value)) fail(name);
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(name);
  return Number(value);
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(name);
  return Number(value);
}

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(name);
  return value;
}

function scalar(value: unknown, name: string): GovernedWorkflowScalar {
  if (
    value !== null &&
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  )
    fail(name);
  if (typeof value === "number" && !Number.isFinite(value)) fail(name);
  if (typeof value === "string" && value.length > 500) fail(name);
  return value;
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(name);
  return value;
}

function oneOf<const Values extends readonly unknown[]>(
  value: unknown,
  choices: Values,
  name: string,
): Values[number] {
  if (!choices.includes(value)) fail(name);
  return value as Values[number];
}

function exactSchema(value: unknown, expected: string): void {
  if (value !== expected) fail(`schema must be ${expected}`);
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(name: string): never {
  throw new TypeError(`${name} is invalid`);
}
