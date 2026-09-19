import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { PublicationCanonicalizer } from "@athyper/server-contract-publication";
import { KyselyPublicationAuthorityRepository } from "./kysely-authority-repository.js";
import { BusinessPartnerDefinitionError } from "./business-partner-definition-service.js";

type DB = Record<string, never>;
type Row = Record<string, unknown>;
export interface ActiveCaseContract {
  id: string;
  tenantId: string;
  entityId: string;
  publicationKey: string;
  contractHash: string;
  releaseNo: number;
  contract: Record<string, unknown>;
}
export interface InitialCaseContract {
  tenantId: string;
  entityId: string;
  publicationKey: string;
  contract: Record<string, unknown>;
}
const caseExtensionFields: Readonly<Record<string, Record<string, unknown>>> = {
  partnerCategory: { type: "string", enum: ["organization"] },
  legalClassification: { type: "string" },
  supplierType: { type: "string" },
  customerType: { type: "string" },
  expectedBusinessPartnerVersion: { type: "integer", minimum: 1 },
  priorStatus: { type: "string" },
  reasonCode: { type: "string" },
  dependencies: { type: "array" },
  bankProjectionId: { type: "string" },
  supplierCompanyProfileId: { type: "string" },
  expectedBankSnapshotId: { type: "string" },
  priorBankLinkId: { type: "string" },
  effectiveFrom: { type: "string" },
  effectiveUntil: { type: "string" },
  currencyCode: { type: "string" },
  paymentTermId: { type: "string" },
  defaultAccountingProfileId: { type: "string" },
  defaultDimensionSetId: { type: "string" },
  preferredRemittanceBankLinkId: { type: "string" },
  statementCycleCode: { type: "string" },
  tenantFields: { type: "object" },
  relationshipProposals: { type: "object" },
};
function fail(code: string): never {
  throw new BusinessPartnerDefinitionError(`CASE_CONTRACT_${code}`);
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function key(value: string) {
  if (
    !value ||
    value.trim() !== value ||
    value.length < 8 ||
    value.length > 180
  )
    fail("IDEMPOTENCY_KEY_INVALID");
  return value;
}
export function validateCaseContractUpdate(
  input: unknown,
  base: ActiveCaseContract,
  canonicalizer: PublicationCanonicalizer,
) {
  if (
    !object(input) ||
    !object(input["candidate"]) ||
    !object(input["previous"])
  )
    fail("REVIEW_PACKET_REQUIRED");
  if (
    input["tenantId"] !== base.tenantId ||
    input["publicationKey"] !== base.publicationKey ||
    input["previous"]["contractId"] !== base.id ||
    input["previous"]["recordedContractHash"] !== base.contractHash
  )
    fail("SOURCE_CONFLICT");
  const contract = input["candidate"]["contract"];
  if (
    !object(contract) ||
    contract["type"] !== "object" ||
    contract["additionalProperties"] !== false ||
    !Array.isArray(contract["required"]) ||
    !object(contract["properties"]) ||
    !object(base.contract["properties"]) ||
    !Array.isArray(base.contract["required"])
  )
    fail("SCHEMA_INVALID");
  const equal = (a: unknown, b: unknown) =>
    canonicalizer.sha256(canonicalizer.canonicalBytes(a)) ===
    canonicalizer.sha256(canonicalizer.canonicalBytes(b));
  const { properties: _a, required: oldRequired, ...oldRoot } = base.contract;
  const { properties: _b, required: newRequired, ...newRoot } = contract;
  if (
    !equal(oldRoot, newRoot) ||
    newRequired.some(
      (name) => typeof name !== "string" || !oldRequired.includes(name),
    ) ||
    oldRequired.some(
      (name) => name !== "requestedRole" && !newRequired.includes(name),
    )
  )
    fail("INCOMPATIBLE_SCHEMA");
  for (const [name, definition] of Object.entries(base.contract["properties"]))
    if (!equal(definition, contract["properties"][name] ?? null))
      fail("EXISTING_PROPERTY_CHANGED");
  for (const [name, definition] of Object.entries(contract["properties"])) {
    if (name in base.contract["properties"]) continue;
    const expected = caseExtensionFields[name];
    if (!expected || !object(definition)) fail("UNSUPPORTED_PROPERTY");
    if (!equal(definition, expected)) fail("UNSUPPORTED_CONSTRAINT");
  }
  if (canonicalizer.canonicalBytes(contract).length > 262144)
    fail("SCHEMA_TOO_LARGE");
  return contract;
}
export function initialCaseContractSchema(source: InitialCaseContract) {
  return {
    ...source.contract,
    properties: {
      ...(source.contract["properties"] as object),
      ...caseExtensionFields,
    },
  };
}
export function validateInitialCaseContract(
  input: unknown,
  source: InitialCaseContract,
  canonicalizer: PublicationCanonicalizer,
) {
  if (
    !object(input) ||
    input["schema"] !== "athyper.business-partner-case-contract-review/2" ||
    input["mode"] !== "initial" ||
    input["previous"] !== null ||
    input["tenantId"] !== source.tenantId ||
    input["entityId"] !== source.entityId ||
    input["publicationKey"] !== source.publicationKey ||
    !object(input["candidate"])
  )
    fail("INITIAL_COORDINATES_INVALID");
  const expected = initialCaseContractSchema(source);
  const contract = input["candidate"]["contract"];
  if (
    !object(contract) ||
    canonicalizer.sha256(canonicalizer.canonicalBytes(contract)) !==
      canonicalizer.sha256(canonicalizer.canonicalBytes(expected))
  )
    fail("INITIAL_SCHEMA_MISMATCH");
  return contract;
}
export class BusinessPartnerCaseContractService {
  constructor(
    private readonly options: {
      database: Kysely<DB>;
      canonicalizer: PublicationCanonicalizer;
      current(tenantId: string): Promise<ActiveCaseContract | null>;
      initial?(tenantId: string): Promise<InitialCaseContract | null>;
    },
  ) {}
  private hash(value: unknown) {
    return this.options.canonicalizer.sha256(
      this.options.canonicalizer.canonicalBytes(value),
    );
  }
  private async scoped<T>(
    tenantId: string,
    actorId: string | undefined,
    work: (db: Kysely<DB>) => Promise<T>,
  ) {
    return this.options.database.transaction().execute(async (db) => {
      await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${actorId ?? ""},true)`.execute(
        db,
      );
      return work(db);
    });
  }
  async simulate(input: {
    tenantId: string;
    bundle: unknown;
    targetPlanes: readonly string[];
    againstRevisionId?: string;
  }) {
    if (input.targetPlanes.length !== 1 || input.targetPlanes[0] !== "neon")
      fail("NEON_TARGET_REQUIRED");
    const base = await this.options.current(input.tenantId);
    if (!base) {
      const source = await this.options.initial?.(input.tenantId);
      if (!source) fail("SOURCE_NOT_FOUND");
      const contract = validateInitialCaseContract(
        input.bundle,
        source,
        this.options.canonicalizer,
      );
      return {
        compatible: true,
        publicationAuthorized: false,
        contractHash: this.hash(contract),
        previousContractId: null,
        contract,
        base: { ...source, id: null, contractHash: null, releaseNo: 0 },
      };
    }
    const contract = validateCaseContractUpdate(
      input.bundle,
      base,
      this.options.canonicalizer,
    );
    return {
      compatible: true,
      publicationAuthorized: false,
      contractHash: this.hash(contract),
      previousContractId: base.id,
      contract,
      base,
    };
  }
  async author(input: {
    tenantId: string;
    actorId: string;
    bundle: unknown;
    targetPlanes: readonly string[];
    idempotencyKey: string;
  }) {
    key(input.idempotencyKey);
    const review = await this.simulate(input);
    return this.scoped(input.tenantId, input.actorId, async (db) => {
      const base = review.base;
      const result =
        await sql<Row>`INSERT INTO snapshot.business_partner_case_contract_revision
       (id,tenant_id,entity_id,publication_key,previous_contract_id,previous_contract_hash,previous_release_no,contract_json,contract_hash,idempotency_key,created_by)
       VALUES(${randomUUID()}::uuid,${input.tenantId}::uuid,${base.entityId}::uuid,${base.publicationKey},${base.id}::uuid,${base.contractHash},${base.releaseNo},${JSON.stringify(review.contract)}::jsonb,${review.contractHash},${input.idempotencyKey},${input.actorId}::uuid)
       ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING *`.execute(
          db,
        );
      const row =
        result.rows[0] ??
        (
          await sql<Row>`SELECT * FROM snapshot.business_partner_case_contract_revision WHERE tenant_id=${input.tenantId}::uuid AND idempotency_key=${input.idempotencyKey}`.execute(
            db,
          )
        ).rows[0];
      if (
        !row ||
        row["contract_hash"] !== review.contractHash ||
        row["previous_contract_id"] !== base.id ||
        row["created_by"] !== input.actorId
      )
        fail("IDEMPOTENCY_CONFLICT");
      return map(row);
    });
  }
  get(tenantId: string, revisionId: string) {
    return this.scoped(tenantId, undefined, async (db) => {
      const row = (
        await sql<Row>`SELECT * FROM snapshot.business_partner_case_contract_revision WHERE tenant_id=${tenantId}::uuid AND id=${revisionId}::uuid`.execute(
          db,
        )
      ).rows[0];
      return row ? map(row) : null;
    });
  }
  publish(input: {
    tenantId: string;
    revisionId: string;
    actorId: string;
    idempotencyKey: string;
    minimumRuntimeVersion?: string;
  }) {
    key(input.idempotencyKey);
    if (
      input.minimumRuntimeVersion &&
      !/^\d+\.\d+\.\d+$/.test(input.minimumRuntimeVersion)
    )
      fail("RUNTIME_VERSION_INVALID");
    return this.scoped(input.tenantId, input.actorId, async (db) => {
      const revision = (
        await sql<Row>`SELECT * FROM snapshot.business_partner_case_contract_revision WHERE tenant_id=${input.tenantId}::uuid AND id=${input.revisionId}::uuid`.execute(
          db,
        )
      ).rows[0];
      if (!revision) fail("REVISION_NOT_FOUND");
      if (revision["created_by"] === input.actorId)
        fail("SELF_PUBLISH_FORBIDDEN");
      const publicationKey = String(revision["publication_key"]);
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${publicationKey},0))`.execute(
        db,
      );
      const authority = new KyselyPublicationAuthorityRepository(db);
      const replay = (
        await sql<Row>`SELECT * FROM publication.business_partner_case_contract_release_link WHERE tenant_id=${input.tenantId}::uuid AND (publish_idempotency_key=${input.idempotencyKey} OR revision_id=${input.revisionId}::uuid)`.execute(
          db,
        )
      ).rows;
      if (replay.some((row) => row["revision_id"] !== input.revisionId))
        fail("IDEMPOTENCY_CONFLICT");
      if (replay[0])
        return authority.getRelease(
          String(replay[0]["publication_release_id"]),
        );
      const base = await this.options.current(input.tenantId);
      const initial = revision["previous_contract_id"] === null;
      if (initial) {
        if (
          base ||
          revision["previous_contract_hash"] !== null ||
          Number(revision["previous_release_no"]) !== 0
        )
          fail("SOURCE_CONFLICT");
        const source = await this.options.initial?.(input.tenantId);
        if (
          !source ||
          source.entityId !== revision["entity_id"] ||
          source.publicationKey !== publicationKey
        )
          fail("SOURCE_CONFLICT");
        validateInitialCaseContract(
          {
            schema: "athyper.business-partner-case-contract-review/2",
            mode: "initial",
            previous: null,
            tenantId: input.tenantId,
            entityId: source.entityId,
            publicationKey,
            candidate: { contract: revision["contract_json"] },
          },
          source,
          this.options.canonicalizer,
        );
      } else if (
        !base ||
        base.id !== revision["previous_contract_id"] ||
        base.contractHash !== revision["previous_contract_hash"] ||
        base.releaseNo !== Number(revision["previous_release_no"])
      )
        fail("SOURCE_CONFLICT");
      const releaseId = randomUUID();
      let releaseNo = initial ? 1 : base!.releaseNo + 1;
      const pending = (
        await sql<Row>`SELECT r.id,r.release_no,
        EXISTS(SELECT 1 FROM publication.artifact a JOIN publication.deployment d ON d.artifact_id=a.id WHERE a.publication_release_id=r.id) AND
        NOT EXISTS(SELECT 1 FROM publication.artifact a JOIN publication.deployment d ON d.artifact_id=a.id WHERE a.publication_release_id=r.id AND (d.status<>'failed' OR d.activated_at IS NOT NULL)) AS failed_unapplied
        FROM publication.release r WHERE r.tenant_id=${input.tenantId}::uuid AND r.release_key=${publicationKey} AND r.release_no>=${releaseNo}`.execute(
          db,
        )
      ).rows;
      if (pending.length) {
        if (
          !initial ||
          publicationKey !==
            `metadata.entity.master_business_partner_company_setup_request.${input.tenantId.replaceAll("-", "")}`
        )
          fail("PENDING_RELEASE_CONFLICT");
        releaseNo = nextCompanyInitialReleaseNo(
          pending.map((row) => ({
            releaseNo: Number(row["release_no"]),
            failedUnapplied: row["failed_unapplied"] === true,
          })),
        );
      }
      const manifestHash = this.hash({
        revisionId: input.revisionId,
        contractHash: revision["contract_hash"],
        baseContractId: base?.id ?? null,
        releaseNo,
        targetPlanes: ["neon"],
      });
      await sql`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,minimum_runtime_version,created_by,metadata)
       VALUES(${releaseId}::uuid,${input.tenantId}::uuid,${publicationKey},${releaseNo},'publish','preparing','backward_compatible',${String(revision["contract_hash"])},${manifestHash},${input.minimumRuntimeVersion ?? "1.0.0"},${input.actorId}::uuid,'{"kind":"business_partner_case_contract","targetPlanes":["neon"]}'::jsonb)`.execute(
        db,
      );
      await sql`INSERT INTO publication.business_partner_case_contract_release_link(tenant_id,publication_release_id,revision_id,publish_idempotency_key,created_by) VALUES(${input.tenantId}::uuid,${releaseId}::uuid,${input.revisionId}::uuid,${input.idempotencyKey},${input.actorId}::uuid)`.execute(
        db,
      );
      return authority.transitionRelease({
        releaseId,
        status: "approved",
        actorId: input.actorId,
        evidence: {
          caseContractRevisionId: input.revisionId,
          authorId: revision["created_by"],
          previousContractId: base?.id ?? null,
          initial,
          noSelfPublish: true,
          supersedesFailedUnappliedReleaseIds: pending.map((row) =>
            String(row["id"]),
          ),
        },
      });
    });
  }
}
function map(row: Row) {
  return {
    id: String(row["id"]),
    tenantId: String(row["tenant_id"]),
    bundleHash: String(row["contract_hash"]),
    contractHash: String(row["contract_hash"]),
    bundle: row["contract_json"],
    contract: row["contract_json"],
    previousContractId:
      row["previous_contract_id"] === null
        ? null
        : String(row["previous_contract_id"]),
    previousContractHash:
      row["previous_contract_hash"] === null
        ? null
        : String(row["previous_contract_hash"]),
    publicationKey: String(row["publication_key"]),
    targetPlanes: ["neon"],
    createdBy: String(row["created_by"]),
    createdAt: new Date(String(row["created_at"])).toISOString(),
  };
}

/** A rejected, never-activated initial attempt stays immutable; its successor gets a new number. */
export function nextCompanyInitialReleaseNo(
  prior: readonly { releaseNo: number; failedUnapplied: boolean }[],
): number {
  if (
    prior.some(
      (row) =>
        !row.failedUnapplied ||
        !Number.isSafeInteger(row.releaseNo) ||
        row.releaseNo < 1,
    )
  )
    fail("PENDING_RELEASE_CONFLICT");
  return Math.max(0, ...prior.map((row) => row.releaseNo)) + 1;
}
