import { createHash } from "node:crypto";
import type {
  PublicationAuthorityRepository,
  PublicationPlane,
} from "@athyper/server-contract-publication";

export type ReleaseEnvironment = "dev" | "qa" | "stg" | "prod";
export type ReleaseScope =
  | { readonly kind: "product" }
  | { readonly kind: "tenant"; readonly tenantId: string };
export interface PromotionCoordinate {
  readonly releaseId: string;
  readonly contentHash: string;
  readonly scope: ReleaseScope;
  readonly environment: ReleaseEnvironment;
  readonly targets: readonly {
    readonly plane: PublicationPlane;
    readonly instance: string;
  }[];
}
export interface PromotionApproval {
  readonly coordinate: PromotionCoordinate;
  readonly principalId: string;
  readonly kind: "human" | "workload";
  readonly authorityCurrent: boolean;
  readonly expiresAt: string;
  readonly receiptId: string;
}
export interface QualificationReceipt {
  readonly releaseId: string;
  readonly contentHash: string;
  readonly scope: ReleaseScope;
  readonly environment: ReleaseEnvironment;
  readonly planes: readonly PublicationPlane[];
  readonly passed: boolean;
  readonly receiptId: string;
}
/** All evidence below is loaded by trusted server adapters, never from POST bodies. */
export interface PromotionEvidence {
  readonly authorId: string;
  readonly authorKind: "human" | "workload";
  readonly publisherId: string;
  readonly publisherKind: "human" | "workload";
  readonly publisherAuthorized: boolean;
  readonly approvedCandidate: boolean;
  readonly validationPassed: boolean;
  readonly signatureTrusted: boolean;
  readonly approval?: PromotionApproval;
  readonly qualifications: readonly QualificationReceipt[];
  readonly artifacts: readonly {
    readonly id: string;
    readonly plane: PublicationPlane;
    readonly hash: string;
    readonly status: "signed";
  }[];
}
export interface PromotionHostPolicy {
  readonly environment: ReleaseEnvironment;
  readonly instance: string;
  readonly devfull: boolean;
  readonly automaticDevelopmentApproval: boolean;
  readonly destinations: readonly {
    readonly plane: PublicationPlane;
    readonly instance: string;
  }[];
}

const environments = ["dev", "qa", "stg", "prod"];
const planes = ["studio", "neon", "mesh"];
const digest = /^[a-f0-9]{64}$/;
function requirePolicy(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
function normalized(c: PromotionCoordinate) {
  return {
    releaseId: c.releaseId,
    contentHash: c.contentHash,
    scope:
      c.scope.kind === "product"
        ? { kind: "product" }
        : { kind: "tenant", tenantId: c.scope.tenantId },
    environment: c.environment,
    targets: [...c.targets]
      .map((t) => ({ plane: t.plane, instance: t.instance }))
      .sort((a, b) =>
        `${a.plane}:${a.instance}`.localeCompare(`${b.plane}:${b.instance}`),
      ),
  };
}
export function promotionCoordinateHash(c: PromotionCoordinate): string {
  return createHash("sha256")
    .update(JSON.stringify(normalized(c)))
    .digest("hex");
}
function sameScope(a: ReleaseScope, b: ReleaseScope) {
  return (
    a.kind === b.kind &&
    (a.kind === "product" || (b.kind === "tenant" && a.tenantId === b.tenantId))
  );
}

/** Environment comes from host configuration, never a CLI override. */
export function evaluatePromotion(
  policy: PromotionHostPolicy,
  coordinate: PromotionCoordinate,
  evidence: PromotionEvidence,
  now = Date.now(),
) {
  requirePolicy(
    environments.includes(policy.environment) &&
      coordinate.environment === policy.environment,
    "PROMOTION_ENVIRONMENT_MISMATCH",
  );
  requirePolicy(
    coordinate.releaseId.trim() && digest.test(coordinate.contentHash),
    "PROMOTION_COORDINATE_INVALID",
  );
  requirePolicy(
    coordinate.scope.kind === "product" ||
      (coordinate.scope.kind === "tenant" && coordinate.scope.tenantId.trim()),
    "PROMOTION_SCOPE_INVALID",
  );
  requirePolicy(
    coordinate.targets.length > 0 &&
      new Set(coordinate.targets.map((t) => `${t.plane}:${t.instance}`))
        .size === coordinate.targets.length,
    "PROMOTION_TARGETS_INVALID",
  );
  for (const target of coordinate.targets) {
    requirePolicy(
      planes.includes(target.plane) &&
        target.instance.trim() &&
        policy.destinations.some(
          (d) => d.plane === target.plane && d.instance === target.instance,
        ),
      "PROMOTION_TARGET_NOT_ALLOWED",
    );
    const artifacts = evidence.artifacts.filter(
      (a) => a.plane === target.plane,
    );
    requirePolicy(
      artifacts.length === 1 &&
        artifacts[0]!.status === "signed" &&
        digest.test(artifacts[0]!.hash),
      "PROMOTION_SIGNED_ARTIFACT_REQUIRED",
    );
  }
  requirePolicy(
    evidence.publisherAuthorized &&
      evidence.publisherId.trim() &&
      evidence.authorId.trim(),
    "PROMOTION_AUTHORITY_REQUIRED",
  );
  requirePolicy(
    evidence.validationPassed && evidence.signatureTrusted,
    "PROMOTION_VALIDATED_TRUSTED_ARTIFACT_REQUIRED",
  );
  const automatic = policy.automaticDevelopmentApproval;
  if (automatic) {
    requirePolicy(
      policy.environment === "dev" &&
        policy.instance === "dev" &&
        policy.devfull,
      "PROMOTION_AUTO_APPROVAL_DEVFULL_ONLY",
    );
    requirePolicy(
      evidence.authorKind === "workload" &&
        evidence.publisherKind === "workload" &&
        evidence.publisherId !== evidence.authorId,
      "PROMOTION_DISTINCT_WORKLOAD_PUBLISHER_REQUIRED",
    );
  } else {
    requirePolicy(
      evidence.approvedCandidate,
      "PROMOTION_APPROVED_CANDIDATE_REQUIRED",
    );
    if (policy.environment !== "qa") {
      const approval = evidence.approval;
      requirePolicy(
        approval &&
          approval.authorityCurrent &&
          approval.kind === "human" &&
          approval.principalId.trim() &&
          approval.receiptId.trim(),
        "PROMOTION_HUMAN_APPROVAL_REQUIRED",
      );
      requirePolicy(
        approval.principalId !== evidence.authorId,
        "PROMOTION_INDEPENDENT_APPROVAL_REQUIRED",
      );
      requirePolicy(
        Number.isFinite(Date.parse(approval.expiresAt)) &&
          Date.parse(approval.expiresAt) > now,
        "PROMOTION_APPROVAL_EXPIRED",
      );
      requirePolicy(
        promotionCoordinateHash(approval.coordinate) ===
          promotionCoordinateHash(coordinate),
        "PROMOTION_APPROVAL_COORDINATE_CHANGED",
      );
    }
  }
  const predecessor =
    policy.environment === "stg"
      ? "qa"
      : policy.environment === "prod"
        ? "stg"
        : undefined;
  if (predecessor) {
    requirePolicy(
      evidence.qualifications.some(
        (q) =>
          q.environment === predecessor &&
          q.passed &&
          q.receiptId.trim() &&
          q.releaseId === coordinate.releaseId &&
          q.contentHash === coordinate.contentHash &&
          sameScope(q.scope, coordinate.scope) &&
          coordinate.targets.every((t) => q.planes.includes(t.plane)),
      ),
      "PROMOTION_PREDECESSOR_QUALIFICATION_REQUIRED",
    );
  }
  return {
    mode: automatic
      ? ("development_auto_approval" as const)
      : ("governed_promotion" as const),
    coordinateHash: promotionCoordinateHash(coordinate),
    authorId: evidence.authorId,
    publisherId: evidence.publisherId,
    approvalReceiptId: evidence.approval?.receiptId ?? null,
  };
}

export interface ReleasePromotionPorts {
  /** Load immutable artifacts plus authenticated approvals and current authority. */
  loadVerified(coordinate: PromotionCoordinate): Promise<PromotionEvidence>;
  authority: Pick<
    PublicationAuthorityRepository,
    "createDeployment" | "getDeployment"
  >;
  /** Must reuse the existing publication dispatcher; it verifies before activation. */
  dispatch(deploymentId: string): Promise<void>;
  /** Durable, append-only audit sink. Failure prevents any subsequent dispatch. */
  record(event: Readonly<Record<string, unknown>>): Promise<void>;
}

/** Promotion never invokes a compiler or creates a release/artifact. Retries reuse
 * deployment command IDs; completed destinations are checked, then skipped. */
export class ReleasePromotionService {
  private readonly policy: PromotionHostPolicy;
  constructor(
    policy: PromotionHostPolicy,
    private readonly ports: ReleasePromotionPorts,
  ) {
    this.policy = structuredClone(policy);
  }
  async promote(input: PromotionCoordinate) {
    const coordinate = structuredClone(input);
    const evidence = structuredClone(await this.ports.loadVerified(coordinate));
    const decision = evaluatePromotion(this.policy, coordinate, evidence);
    await this.ports.record({
      event: "publication.promotion.authorized",
      coordinate,
      ...decision,
    });
    const results = [];
    for (const target of normalized(coordinate).targets) {
      // Recheck revocation and expiry before each destination, including retries.
      const current = await this.ports.loadVerified(coordinate);
      evaluatePromotion(this.policy, coordinate, current);
      const artifact = evidence.artifacts.find(
        (a) => a.plane === target.plane,
      )!;
      const currentArtifact = current.artifacts.find(
        (a) => a.plane === target.plane,
      )!;
      requirePolicy(
        currentArtifact.id === artifact.id &&
          currentArtifact.hash === artifact.hash &&
          current.authorId === evidence.authorId &&
          current.publisherId === evidence.publisherId,
        "PROMOTION_SOURCE_CHANGED",
      );
      const key = createHash("sha256")
        .update(
          JSON.stringify({
            releaseId: coordinate.releaseId,
            contentHash: coordinate.contentHash,
            scope: normalized(coordinate).scope,
            environment: coordinate.environment,
            target,
            artifactId: artifact.id,
            artifactHash: artifact.hash,
          }),
        )
        .digest("hex");
      const commandId = `${key.slice(0, 8)}-${key.slice(8, 12)}-5${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
      try {
        const deployment = await this.ports.authority.createDeployment({
          commandId,
          artifactId: artifact.id,
          targetPlane: target.plane,
          targetEnvironment: coordinate.environment,
          targetInstance: target.instance,
          attempt: 1,
          actorId: evidence.publisherId,
        });
        requirePolicy(
          deployment.sourceReleaseId === coordinate.releaseId &&
            deployment.artifactHash === artifact.hash &&
            deployment.targetPlane === target.plane &&
            deployment.targetInstance === target.instance &&
            deployment.targetEnvironment === coordinate.environment,
          "PROMOTION_DEPLOYMENT_MISMATCH",
        );
        if (deployment.deploymentStatus !== "activated")
          await this.ports.dispatch(deployment.deploymentId);
        const actual = await this.ports.authority.getDeployment(
          deployment.deploymentId,
        );
        requirePolicy(
          actual &&
            actual.sourceReleaseId === coordinate.releaseId &&
            actual.artifactHash === artifact.hash &&
            actual.targetPlane === target.plane &&
            actual.targetEnvironment === coordinate.environment &&
            actual.targetInstance === target.instance,
          "PROMOTION_DEPLOYMENT_MISMATCH",
        );
        results.push({
          ...target,
          deploymentId: actual.deploymentId,
          status: actual.deploymentStatus,
        });
      } catch {
        // Transport errors can contain credentials; detailed errors belong in the
        // dispatcher's protected logs, not a public promotion receipt.
        results.push({ ...target, status: "failed" as const });
      }
    }
    const receipt = {
      coordinate,
      ...decision,
      status: results.every((r) => r.status === "activated")
        ? "activated"
        : "incomplete",
      targets: results,
    };
    await this.ports.record({
      event: "publication.promotion.result",
      ...receipt,
    });
    return receipt;
  }
}
