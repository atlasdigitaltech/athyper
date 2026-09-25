import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import { MasterDataError } from "../../errors.js";
import { readPartnerCommodityClassifications } from "../../business-partner-commodity-classification.js";
type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;
type ReadScope = Pick<
  import("@athyper/server-contract-master-data").BusinessPartner360Query,
  "operatingOrganizationId" | "companyCodeId" | "legalEntityId" | "roleLens"
>;
export const partnerClassificationPermissions = {
  read: "neon.business_partner_classification.read",
  declare: "neon.business_partner_classification.declare",
  verify: "neon.business_partner_classification.verify",
  archive: "neon.business_partner_classification.archive",
} as const;
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
function fail(status: number, code: string, message: string): never {
  throw new MasterDataError(status, code, message);
}
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max
    ? v.trim()
    : fail(
        400,
        "BP_CLASSIFICATION_INPUT_INVALID",
        "A bounded nonempty text value is required",
      );
const date = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v
    ? v
    : fail(
        400,
        "BP_CLASSIFICATION_INPUT_INVALID",
        "Use a valid ISO calendar date",
      );
function publicRow(r: Row) {
  return Object.fromEntries(
    [
      "id",
      "business_partner_id",
      "commodity_category_id",
      "commodity_code_id",
      "assignment_kind",
      "status",
      "effective_from",
      "effective_until",
      "source_system",
      "source_reference",
      "record_version",
      "verified_at",
    ].map((k) => [k, r[k]]),
  );
}

type ClassificationAction = "declare" | "verify" | "archive";
type ClassificationBody = Readonly<Record<string, unknown>>;
function parseClassificationCommand(
  action: ClassificationAction,
  body: ClassificationBody,
) {
  const allowed =
    action === "declare"
      ? [
          "commodityCodeId",
          "commodityCategoryId", // Existing command receipts remain replayable; new category capture is retired below.
          "effectiveFrom",
          "effectiveUntil",
          "sourceSystem",
          "sourceReference",
          "notes",
          "idempotencyKey",
        ]
      : [
          "classificationId",
          "expectedVersion",
          action === "verify" ? "evidenceReference" : "reason",
          "idempotencyKey",
        ];
  if (Object.keys(body).some((k) => !allowed.includes(k)))
    fail(
      400,
      "BP_CLASSIFICATION_INPUT_INVALID",
      "Unknown or out-of-scope classification field",
    );
  const key = text(body.idempotencyKey, 200);
  if (key.length < 8)
    fail(
      400,
      "BP_CLASSIFICATION_INPUT_INVALID",
      "Idempotency key must contain at least eight characters",
    );

  if (action === "declare") return { key, ...parseDeclaration(body) };
  const target = parseClassificationTarget(body);
  if (action === "verify")
    return {
      key,
      action,
      ...target,
      evidence: text(body.evidenceReference, 512),
    };
  return { key, action, ...target, evidence: text(body.reason, 1000) };
}
function parseDeclaration(body: ClassificationBody) {
  const commodityCode = body.commodityCodeId;
  const start = date(body.effectiveFrom);
  const end =
    body.effectiveUntil === undefined ? undefined : date(body.effectiveUntil);
  if (
    (!uuid(commodityCode) && !uuid(body.commodityCategoryId)) ||
    (commodityCode !== undefined && body.commodityCategoryId !== undefined) ||
    (end && end <= start)
  )
    fail(
      400,
      "BP_CLASSIFICATION_INPUT_INVALID",
      "UNSPSC code ID and a valid effective interval required",
    );
  return {
    action: "declare" as const,
    commodityCode,
    start,
    end,
    sourceSystem: text(body.sourceSystem, 128),
    sourceReference: text(body.sourceReference, 256),
    notes: body.notes === undefined ? null : text(body.notes, 4000),
  };
}
function parseClassificationTarget(body: ClassificationBody) {
  if (
    !uuid(body.classificationId) ||
    !Number.isSafeInteger(body.expectedVersion) ||
    Number(body.expectedVersion) < 1
  )
    fail(
      400,
      "BP_CLASSIFICATION_INPUT_INVALID",
      "Classification and expected version required",
    );
  return {
    classificationId: body.classificationId,
    expectedVersion: body.expectedVersion,
  };
}
type ClassificationCommand = ReturnType<typeof parseClassificationCommand>;
async function declareClassification(
  tx: Tx,
  context: VerifiedRequestContext,
  bp: string,
  command: Extract<ClassificationCommand, { action: "declare" }>,
): Promise<Row> {
  const { commodityCode, start, end, sourceSystem, sourceReference, notes } =
    command;
  if (!uuid(commodityCode))
    fail(
      400,
      "BP_CLASSIFICATION_LEGACY_CAPTURE_RETIRED",
      "New declarations select a UNSPSC code, not a tenant category",
    );
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${bp}:classification-source:${sourceSystem}:${sourceReference}`},0))`.execute(
    tx,
  );
  if (
    (
      await sql`SELECT id FROM master.business_partner_commodity_classification WHERE tenant_id=${context.tenantId}::uuid AND business_partner_id=${bp}::uuid AND source_system=${sourceSystem} AND source_reference=${sourceReference}`.execute(
        tx,
      )
    ).rows.length
  )
    fail(
      409,
      "BP_CLASSIFICATION_SOURCE_CONFLICT",
      "This source declaration already exists; use its original command receipt or inspect the classification",
    );
  const valid = (
    await sql`SELECT id FROM shared.commodity_code WHERE id=${commodityCode}::uuid AND domain_code='unspsc' AND is_active`.execute(
      tx,
    )
  ).rows[0];
  if (!valid)
    fail(
      404,
      "BP_CLASSIFICATION_CODE_NOT_FOUND",
      "Active UNSPSC code not found",
    );
  return (
    await sql<Row>`INSERT INTO master.business_partner_commodity_classification(tenant_id,business_partner_id,commodity_code_id,effective_from,effective_until,source_system,source_reference,notes,status,created_by)
      VALUES(${context.tenantId}::uuid,${bp}::uuid,${commodityCode}::uuid,${start}::date,${end ?? null}::date,${sourceSystem},${sourceReference},${notes},'active',${context.principalId}::uuid) RETURNING *`.execute(
      tx,
    )
  ).rows[0]!;
}
async function lockClassification(
  tx: Tx,
  context: VerifiedRequestContext,
  bp: string,
  body: ReturnType<typeof parseClassificationTarget>,
): Promise<Row> {
  const current = (
    await sql<Row>`SELECT * FROM master.business_partner_commodity_classification WHERE tenant_id=${context.tenantId}::uuid AND business_partner_id=${bp}::uuid AND id=${body.classificationId}::uuid FOR UPDATE`.execute(
      tx,
    )
  ).rows[0];
  if (!current)
    fail(404, "BP_CLASSIFICATION_NOT_FOUND", "Classification not found");
  if (Number(current.record_version) !== Number(body.expectedVersion))
    fail(
      409,
      "BP_CLASSIFICATION_VERSION_CONFLICT",
      "Reload the classification before changing it",
    );
  if (current.status !== "active")
    fail(
      409,
      "BP_CLASSIFICATION_NOT_ACTIVE",
      "Only active classifications can be verified or archived",
    );

  return current;
}
async function verifyClassification(
  tx: Tx,
  context: VerifiedRequestContext,
  current: Row,
): Promise<Row> {
  if (
    current.created_by === context.principalId ||
    current.assignment_kind === "verified"
  )
    fail(
      409,
      "BP_CLASSIFICATION_INDEPENDENT_CHECKER_REQUIRED",
      "Independent checker and unverified classification required",
    );

  return (
    await sql<Row>`UPDATE master.business_partner_commodity_classification SET status=${"active"}::master.partner_extension_status_d,
      assignment_kind=${"verified"},verified_at=${new Date()}::timestamptz,verified_by=${context.principalId}::uuid,
      record_version=record_version+1,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid
      WHERE tenant_id=${context.tenantId}::uuid AND id=${current.id}::uuid RETURNING *`.execute(
      tx,
    )
  ).rows[0]!;
}
async function archiveClassification(
  tx: Tx,
  context: VerifiedRequestContext,
  current: Row,
): Promise<Row> {
  return (
    await sql<Row>`UPDATE master.business_partner_commodity_classification SET status=${"archived"}::master.partner_extension_status_d,
      assignment_kind=${current.assignment_kind},verified_at=${current.verified_at}::timestamptz,verified_by=${current.verified_by}::uuid,
      record_version=record_version+1,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid
      WHERE tenant_id=${context.tenantId}::uuid AND id=${current.id}::uuid RETURNING *`.execute(
      tx,
    )
  ).rows[0]!;
}

export function createPartnerClassificationService(options: {
  authorizer: Authorizer;
  transactions: {
    run<T>(
      plane: "neon",
      actor: {
        tenantId: string;
        principalId: string;
        requestId?: string;
        correlationId?: string;
      },
      work: (tx: Tx) => Promise<T>,
    ): Promise<T>;
  };
  audit: {
    record(event: Readonly<Record<string, unknown>>, tx: Tx): Promise<void>;
  };
}) {
  async function authorize(
    context: VerifiedRequestContext,
    bp: string,
    action: keyof typeof partnerClassificationPermissions,
    scope: ReadScope = {},
  ) {
    if (
      context.planeKey !== "neon" ||
      !uuid(context.tenantId) ||
      !uuid(context.principalId) ||
      !uuid(bp)
    )
      fail(
        400,
        "BP_CLASSIFICATION_CONTEXT_INVALID",
        "Valid Neon tenant, actor and partner required",
      );
    const result = await options.authorizer.authorize({
      context,
      permissionCode: partnerClassificationPermissions[action],
      resource: {
        tenantId: context.tenantId,
        businessPartnerId: bp,
        governedWorkflow: true,
        ...scope,
      },
    });
    if (!result.allowed)
      fail(
        403,
        result.reason === "mfa_required"
          ? "BP_CLASSIFICATION_STEP_UP_REQUIRED"
          : "FORBIDDEN",
        "Classification authority required",
      );
  }
  async function parent(context: VerifiedRequestContext, bp: string, tx: Tx) {
    const r = (
      await sql<Row>`SELECT id,status FROM master.business_partner WHERE tenant_id=${context.tenantId}::uuid AND id=${bp}::uuid FOR SHARE`.execute(
        tx,
      )
    ).rows[0];
    if (!r)
      fail(404, "BP_CLASSIFICATION_PARTNER_NOT_FOUND", "Partner not found");
    if (r.status !== "active")
      fail(
        409,
        "BP_CLASSIFICATION_PARTNER_INACTIVE",
        "Active partner required",
      );
  }
  return {
    async read(
      input: ReadScope & {
        context: VerifiedRequestContext;
        businessPartnerId: string;
        limit?: number;
        cursor?: string;
        asOf?: string;
      },
    ) {
      if (
        input.limit !== undefined &&
        (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
      )
        fail(
          400,
          "BP_CLASSIFICATION_INPUT_INVALID",
          "Limit must be between 1 and 100",
        );
      const {
        operatingOrganizationId,
        companyCodeId,
        legalEntityId,
        roleLens,
      } = input;
      await authorize(input.context, input.businessPartnerId, "read", {
        operatingOrganizationId,
        companyCodeId,
        legalEntityId,
        roleLens,
      });
      const asOf = date(input.asOf ?? new Date().toISOString().slice(0, 10));
      let afterId: string | undefined,
        snapshotAt = new Date().toISOString();
      if (input.cursor) {
        try {
          const c = JSON.parse(
            Buffer.from(input.cursor, "base64url").toString(),
          );
          if (
            c.v !== 1 ||
            c.tenant !== input.context.tenantId ||
            c.principal !== input.context.principalId ||
            c.bp !== input.businessPartnerId ||
            c.asOf !== asOf ||
            !uuid(c.afterId) ||
            typeof c.snapshotAt !== "string" ||
            !Number.isFinite(Date.parse(c.snapshotAt)) ||
            Date.parse(c.snapshotAt) > Date.now()
          )
            throw Error();
          afterId = c.afterId;
          snapshotAt = c.snapshotAt;
        } catch {
          fail(
            409,
            "BP_CLASSIFICATION_CURSOR_INVALID",
            "Cursor belongs to another read context or is invalid",
          );
        }
      }
      return options.transactions.run("neon", input.context, async (tx) => {
        await parent(input.context, input.businessPartnerId, tx);
        const result = await readPartnerCommodityClassifications(
          {
            tenantId: input.context.tenantId,
            businessPartnerId: input.businessPartnerId,
            asOf,
            limit: input.limit,
            afterId,
            snapshotAt,
          },
          tx,
        );
        return {
          ...result,
          ...(result.hasMore
            ? {
                nextCursor: Buffer.from(
                  JSON.stringify({
                    v: 1,
                    tenant: input.context.tenantId,
                    principal: input.context.principalId,
                    bp: input.businessPartnerId,
                    asOf,
                    afterId: result.items.at(-1)!.id,
                    snapshotAt,
                  }),
                ).toString("base64url"),
              }
            : {}),
        };
      });
    },
    async execute(input: {
      context: VerifiedRequestContext;
      businessPartnerId: string;
      action: "declare" | "verify" | "archive";
      body: Readonly<Record<string, unknown>>;
    }) {
      const { context, businessPartnerId: bp, action, body } = input;
      await authorize(context, bp, action);
      const command = parseClassificationCommand(action, body);
      const { key } = command;
      const evidence =
        command.action === "declare" ? undefined : command.evidence;
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            bp,
            action,
            body: Object.fromEntries(
              Object.entries(body).sort(([a], [b]) => a.localeCompare(b)),
            ),
          }),
        )
        .digest("hex");
      return options.transactions.run("neon", context, async (tx) => {
        await parent(context, bp, tx);
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${context.principalId}:classification:${key}`},0))`.execute(
          tx,
        );
        const prior = (
          await sql<Row>`SELECT fingerprint,result FROM master.business_partner_classification_command WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${context.principalId}::uuid AND idempotency_key=${key}`.execute(
            tx,
          )
        ).rows[0];
        const changedResources = [
          {
            entityCode: "business_partner",
            recordId: bp,
            sectionKeys: ["commodities", "overview"],
          },
        ];
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            fail(
              409,
              "BP_CLASSIFICATION_IDEMPOTENCY_CONFLICT",
              "Key was used for a different command",
            );
          return {
            classification: prior.result,
            replayed: true,
            changedResources,
          };
        }
        // Replay is checked before rejecting retired category capture.
        let row: Row;
        if (command.action === "declare") {
          row = await declareClassification(tx, context, bp, command);
        } else {
          const current = await lockClassification(tx, context, bp, command);
          row =
            command.action === "verify"
              ? await verifyClassification(tx, context, current)
              : await archiveClassification(tx, context, current);
        }
        const result = publicRow(row);
        await options.audit.record(
          {
            eventCode: `business_partner.classification.${action === "declare" ? "declared" : action === "verify" ? "verified" : "archived"}`,
            action,
            outcome: "success",
            tenantId: context.tenantId,
            entityType: "business_partner_commodity_classification",
            entityId: row.id,
            actor: { kind: "user", principalId: context.principalId },
            requestId: context.requestId,
            metadata: {
              businessPartnerId: bp,
              classificationId: row.id,
              recordVersion: row.record_version,
              commercialApproval: false,
              ...(evidence
                ? {
                    evidenceHash: createHash("sha256")
                      .update(evidence)
                      .digest("hex"),
                  }
                : {}),
            },
          },
          tx,
        );
        await sql`INSERT INTO master.business_partner_classification_command(tenant_id,principal_id,idempotency_key,fingerprint,result) VALUES(${context.tenantId}::uuid,${context.principalId}::uuid,${key},${fingerprint},${JSON.stringify(result)}::jsonb)`.execute(
          tx,
        );
        return { classification: result, replayed: false, changedResources };
      });
    },
  };
}
