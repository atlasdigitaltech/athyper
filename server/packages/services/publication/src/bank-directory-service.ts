import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type {
  BankDirectoryPayload,
  BankDirectoryRelease,
  PublicationAuthorityRepository,
  PublicationPlane,
} from "@athyper/server-contract-publication";
import { KyselyPublicationAuthorityRepository } from "./kysely-authority-repository.js";
import { normalizeBankDirectoryImport } from "./bank-directory-import.js";
type Db = Kysely<Record<string, never>>;
type Row = Record<string, unknown>;
const empty: BankDirectoryPayload = {
  institutions: [],
  branches: [],
  identifiers: [],
  sourceRecords: [],
};
export class BankDirectoryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export interface DirectoryPlaneStatus {
  readonly available: boolean;
  readonly releaseId?: string;
  readonly version?: number;
  readonly hash?: string;
  readonly unresolvedReferences?: number;
  readonly releases?: readonly { id: string; hash: string }[];
}
export interface BankDirectoryReference {
  readonly releaseId: string;
  readonly institutionId: string;
  readonly branchId?: string;
}
export class BankDirectoryService {
  constructor(
    private readonly options: {
      inspectReferences?: (
        plane: PublicationPlane,
        references: readonly BankDirectoryReference[],
      ) => Promise<unknown>;
      database: Db;
      authority: PublicationAuthorityRepository;
      inspectPlane: (
        plane: PublicationPlane,
        tenantId: string,
      ) => Promise<DirectoryPlaneStatus>;
    },
  ) {}
  private async scoped<T>(
    tenantId: string,
    actorId: string,
    work: (db: Db, authority: PublicationAuthorityRepository) => Promise<T>,
  ) {
    return this.options.database.transaction().execute(async (db) => {
      await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${actorId},true),set_config('app.database_plane','studio',true)`.execute(
        db,
      );
      const owner = (
        await sql<Row>`SELECT tenant_id FROM publication.bank_directory_authority WHERE singleton AND tenant_id=${tenantId}::uuid`.execute(
          db,
        )
      ).rows[0];
      if (!owner)
        throw new BankDirectoryError("BANK_DIRECTORY_AUTHORITY_REQUIRED");
      return work(db, new KyselyPublicationAuthorityRepository(db));
    });
  }
  private async latest(db: Db) {
    return (
      await sql<Row>`SELECT l.directory_release FROM publication.bank_directory_release_link l JOIN publication.release r ON r.id=l.publication_release_id WHERE r.status IN('approved','published') ORDER BY r.release_no DESC LIMIT 1`.execute(
        db,
      )
    ).rows[0]?.["directory_release"] as BankDirectoryRelease | undefined;
  }
  async import(input: {
    tenantId: string;
    actorId: string;
    idempotencyKey: string;
    source: unknown;
  }) {
    return this.scoped(input.tenantId, input.actorId, async (db) => {
      if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200)
        throw new TypeError("Invalid idempotency key");
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId + ":" + input.idempotencyKey},0))`.execute(
        db,
      );
      const replay = (
        await sql<Row>`SELECT * FROM snapshot.bank_directory_revision WHERE tenant_id=${input.tenantId}::uuid AND idempotency_key=${input.idempotencyKey}`.execute(
          db,
        )
      ).rows[0];
      if (replay) {
        const same = (
          await sql<{
            same: boolean;
          }>`SELECT ${JSON.stringify(replay["input_json"])}::jsonb=${JSON.stringify(input.source)}::jsonb AS same`.execute(
            db,
          )
        ).rows[0]?.same;
        if (!same)
          throw new BankDirectoryError("BANK_DIRECTORY_IDEMPOTENCY_CONFLICT");
        return replay;
      }
      const prior = await this.latest(db),
        countries = (
          await sql<{ code: string }>`SELECT code FROM shared.country`.execute(
            db,
          )
        ).rows;
      const result = normalizeBankDirectoryImport(
        input.source,
        prior?.payload ?? empty,
        new Set(countries.map((c) => c.code)),
      );
      result.sources = [
        ...new Map(
          [...(prior?.sources ?? []), ...result.sources].map((source) => [
            source.source,
            source,
          ]),
        ).values(),
      ].sort((a, b) => a.source.localeCompare(b.source));
      const digest = (
        await sql<{
          hash: string;
        }>`SELECT encode(public.digest(${JSON.stringify(result.payload)}::jsonb::text,'sha256'),'hex') AS hash`.execute(
          db,
        )
      ).rows[0]!.hash;
      const candidate = {
        id: randomUUID(),
        version: (prior?.version ?? 0) + 1,
        publishedAt: new Date().toISOString(),
        sources: result.sources,
        payload: result.payload,
        contentHash: digest,
      };
      if (result.report.valid) {
        const failure = (
          await sql<{
            failure: string | null;
          }>`SELECT shared.validate_bank_directory(${JSON.stringify(candidate)}::jsonb) AS failure`.execute(
            db,
          )
        ).rows[0]?.failure;
        if (failure) {
          result.report = {
            ...result.report,
            valid: false,
            issues: [
              ...result.report.issues,
              {
                code: "DATABASE_VALIDATION_FAILED",
                record: "release",
                message: failure,
              },
            ],
          };
        }
      }
      const row = (
        await sql<Row>`INSERT INTO snapshot.bank_directory_revision(id,tenant_id,base_release_id,input_json,payload,sources,content_hash,validation_report,idempotency_key,created_by) VALUES(${randomUUID()}::uuid,${input.tenantId}::uuid,${prior?.id ?? null}::uuid,${JSON.stringify(input.source)}::jsonb,${JSON.stringify(result.payload)}::jsonb,${JSON.stringify(result.sources)}::jsonb,${digest},${JSON.stringify(result.report)}::jsonb,${input.idempotencyKey},${input.actorId}::uuid) RETURNING *`.execute(
          db,
        )
      ).rows[0]!;
      return row;
    });
  }
  async list(tenantId: string, actorId: string) {
    return this.scoped(tenantId, actorId, async (db) => ({
      directory: (await sql<Row>`SELECT r.id,r.version,r.payload FROM shared.bank_directory_activation a JOIN shared.bank_directory_release r ON r.id=a.release_id WHERE a.singleton`.execute(db)).rows[0] ?? null,
      revisions: (
        await sql<Row>`SELECT r.id,r.created_at,r.created_by,r.content_hash,r.validation_report,v.decision,v.reviewed_by,v.reason,l.publication_release_id FROM snapshot.bank_directory_revision r LEFT JOIN publication.bank_directory_review v ON v.revision_id=r.id LEFT JOIN publication.bank_directory_release_link l ON l.revision_id=r.id ORDER BY r.created_at DESC,r.id LIMIT 100`.execute(
          db,
        )
      ).rows,
    }));
  }
  async get(tenantId: string, revisionId: string) {
    return this.scoped(tenantId, "", async (db) => {
      const row = (
        await sql<Row>`SELECT r.*,v.decision,v.reason,l.publication_release_id FROM snapshot.bank_directory_revision r LEFT JOIN publication.bank_directory_review v ON v.revision_id=r.id LEFT JOIN publication.bank_directory_release_link l ON l.revision_id=r.id WHERE r.id=${revisionId}::uuid AND r.tenant_id=${tenantId}::uuid`.execute(
          db,
        )
      ).rows[0];
      return row ? { ...row, createdBy: String(row["created_by"]) } : null;
    });
  }
  async review(input: {
    tenantId: string;
    actorId: string;
    revisionId: string;
    decision: "approved" | "rejected";
    reason: string;
  }) {
    return this.scoped(input.tenantId, input.actorId, async (db, authority) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended('shared.bank_directory',0))`.execute(
        db,
      );
      const revision = (
        await sql<Row>`SELECT * FROM snapshot.bank_directory_revision WHERE tenant_id=${input.tenantId}::uuid AND id=${input.revisionId}::uuid`.execute(
          db,
        )
      ).rows[0];
      if (!revision)
        throw new BankDirectoryError("BANK_DIRECTORY_REVISION_NOT_FOUND");
      if (revision["created_by"] === input.actorId)
        throw new BankDirectoryError("BANK_DIRECTORY_SELF_APPROVAL_FORBIDDEN");
      const existing = (
        await sql<Row>`SELECT * FROM publication.bank_directory_review WHERE revision_id=${input.revisionId}::uuid`.execute(
          db,
        )
      ).rows[0];
      if (existing) {
        if (
          existing["decision"] !== input.decision ||
          existing["reviewed_by"] !== input.actorId ||
          existing["reason"] !== input.reason
        )
          throw new BankDirectoryError("BANK_DIRECTORY_REVIEW_CONFLICT");
        const link = (
          await sql<Row>`SELECT publication_release_id FROM publication.bank_directory_release_link WHERE revision_id=${input.revisionId}::uuid`.execute(
            db,
          )
        ).rows[0];
        return {
          release: link
            ? await authority.getRelease(String(link["publication_release_id"]))
            : null,
        };
      }
      const prior = await this.latest(db);
      if (
        input.decision === "approved" &&
        ((revision["validation_report"] as { valid: boolean }).valid !== true ||
          (revision["base_release_id"] ?? null) !== (prior?.id ?? null))
      )
        throw new BankDirectoryError("BANK_DIRECTORY_REVALIDATION_REQUIRED");
      await sql`INSERT INTO publication.bank_directory_review(revision_id,tenant_id,decision,reason,reviewed_by) VALUES(${input.revisionId}::uuid,${input.tenantId}::uuid,${input.decision},${input.reason},${input.actorId}::uuid)`.execute(
        db,
      );
      if (input.decision === "rejected") return { release: null };
      const envelope: BankDirectoryRelease = {
        id: randomUUID(),
        version: (prior?.version ?? 0) + 1,
        publishedAt: new Date().toISOString(),
        sources: revision["sources"] as BankDirectoryRelease["sources"],
        payload: revision["payload"] as BankDirectoryPayload,
        contentHash: String(revision["content_hash"]),
      };
      const validation = (
        await sql<{
          failure: string | null;
        }>`SELECT shared.validate_bank_directory(${JSON.stringify(envelope)}::jsonb) AS failure`.execute(
          db,
        )
      ).rows[0]?.failure;
      if (validation)
        throw new BankDirectoryError("BANK_DIRECTORY_VALIDATION_FAILED");
      await sql`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata) VALUES(${envelope.id}::uuid,${input.tenantId}::uuid,'shared.bank_directory',${envelope.version},'publish','preparing','backward_compatible',${envelope.contentHash},${envelope.contentHash},${input.actorId}::uuid,${JSON.stringify({ revisionId: input.revisionId, bankDirectory: true })}::jsonb)`.execute(
        db,
      );
      await sql`INSERT INTO publication.bank_directory_release_link(publication_release_id,revision_id,tenant_id,directory_release) VALUES(${envelope.id}::uuid,${input.revisionId}::uuid,${input.tenantId}::uuid,${JSON.stringify(envelope)}::jsonb)`.execute(
        db,
      );
      const release = await authority.transitionRelease({
        releaseId: envelope.id,
        status: "approved",
        actorId: input.actorId,
        evidence: {
          revisionId: input.revisionId,
          independentChecker: true,
          reason: input.reason,
        },
      });
      return { release };
    });
  }
  async resume(tenantId: string, actorId: string, revisionId: string) {
    return this.scoped(tenantId, actorId, async (db, authority) => {
      const row = (
        await sql<Row>`SELECT l.publication_release_id FROM publication.bank_directory_release_link l JOIN publication.bank_directory_review r ON r.revision_id=l.revision_id WHERE l.revision_id=${revisionId}::uuid AND r.decision='approved'`.execute(
          db,
        )
      ).rows[0];
      if (!row)
        throw new BankDirectoryError(
          "BANK_DIRECTORY_APPROVED_REVISION_REQUIRED",
        );
      return {
        release: await authority.getRelease(
          String(row["publication_release_id"]),
        ),
      };
    });
  }
  async reconcileReferences(
    tenantId: string,
    actorId: string,
    references: readonly BankDirectoryReference[],
  ) {
    await this.scoped(tenantId, actorId, async () => undefined);
    if (!this.options.inspectReferences)
      throw new BankDirectoryError(
        "BANK_DIRECTORY_REFERENCE_CHECK_UNAVAILABLE",
      );
    return {
      planes: await Promise.all(
        (["studio", "neon", "mesh"] as const).map(async (plane) => {
          try {
            return {
              plane,
              available: true,
              report: await this.options.inspectReferences!(plane, references),
            };
          } catch {
            return { plane, available: false, report: null };
          }
        }),
      ),
    };
  }
  async reconcile(tenantId: string, actorId: string) {
    const { expected, deliveries, history } = await this.scoped(
      tenantId,
      actorId,
      async (db) => ({
        expected: await this.latest(db),
        history: (
          await sql<{
            id: string;
            hash: string;
          }>`SELECT directory_release->>'id' id,directory_release->>'contentHash' hash FROM publication.bank_directory_release_link`.execute(
            db,
          )
        ).rows,
        deliveries: (
          await sql<Row>`SELECT d.id,d.target_plane,d.status,d.attempt_no,d.failure_code,d.activated_at,a.publication_release_id,ack.acknowledged_at,ack.active_release_hash FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.bank_directory_release_link l ON l.publication_release_id=a.publication_release_id LEFT JOIN publication.deployment_acknowledgement ack ON ack.deployment_id=d.id ORDER BY d.created_at DESC LIMIT 100`.execute(
            db,
          )
        ).rows,
      }),
    );
    const planes = await Promise.all(
      (["studio", "neon", "mesh"] as const).map(async (plane) => {
        let observed: DirectoryPlaneStatus;
        try {
          observed = await this.options.inspectPlane(plane, tenantId);
        } catch {
          observed = { available: false };
        }
        const installed = new Map(
          observed.releases?.map((r) => [r.id, r.hash]),
        );
        const missingReleases = observed.releases
          ? history.filter((r) => !installed.has(r.id)).map((r) => r.id)
          : [];
        const mismatchedReleases = observed.releases
          ? history
              .filter(
                (r) => installed.has(r.id) && installed.get(r.id) !== r.hash,
              )
              .map((r) => r.id)
          : [];
        return {
          plane,
          ...observed,
          missingReleases,
          mismatchedReleases,
          state: !observed.available
            ? "unreachable"
            : !expected
              ? "not_published"
              : !observed.releaseId
                ? "missing_release"
                : observed.releaseId !== expected.id ||
                    observed.version !== expected.version
                  ? "pending_release"
                  : observed.hash !== expected.contentHash ||
                      mismatchedReleases.length
                    ? "hash_mismatch"
                    : missingReleases.length
                      ? "missing_history"
                      : observed.unresolvedReferences
                        ? "unresolved_references"
                        : "current",
        };
      }),
    );
    return {
      deliveries,
      expected: expected
        ? {
            releaseId: expected.id,
            version: expected.version,
            hash: expected.contentHash,
          }
        : null,
      planes,
      checkedAt: new Date().toISOString(),
    };
  }
}
